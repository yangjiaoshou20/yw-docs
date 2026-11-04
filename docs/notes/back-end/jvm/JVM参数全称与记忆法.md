---
title: JVM 参数全称与记忆法
createTime: 2026/11/04 17:40:00
permalink: /back/jvm-args/
---

# JVM 参数全称与记忆法

> 来源：同一会话中「经常记不住 `-Xms`、`-Xmx` 这类参数，想看全称便于理解着记」的问答整理。

## 一、先换个思路

JVM 参数看着像密码，其实结构只有两层：**前缀说明"这是哪个级别的参数"，冒号后面是"几个英文单词拼起来的一句话"**。

拿最长的那个拆开读：

```text
-XX:MaxTenuringThreshold=15
 │   │     │
 │   │     └── Threshold  阈值
 │   └──────── Tenuring   晋升（tenure：获得终身职位，对象"转正"进老年代）
 └──────────── Max        最大
```

一句话：**对象熬过 15 次 GC 就"转正"进老年代**。拆到这个程度就不需要背了。

下面按「前缀 → 全称表 → 命名规律 → 实战命令 → 版本坑」的顺序捋。

## 二、三类前缀

| 前缀 | 官方类别 | 说明 | 例子 |
|---|---|---|---|
| `-` | 标准参数 | JVM 规范保证所有实现都支持 | `-version`、`-cp`、`-jar` |
| `-X` | 非标准参数（non-standard） | 不保证跨实现一致，社区常解读为 eXtended | `-Xms`、`-Xmx`、`-Xss` |
| `-XX` | 高级参数（advanced） | 不稳定、实现相关，调优几乎全在这一类 | `-XX:+UseG1GC` |

`-XX` 内部还有两种写法，看破之后不会混：

| 形式 | 含义 | 例子 |
|---|---|---|
| `-XX:+Flag` / `-XX:-Flag` | 布尔开关，`+` 启用、`-` 禁止 | `-XX:+UseG1GC` |
| `-XX:Key=Value` | 键值配置 | `-XX:MaxGCPauseMillis=200` |

### `-XX` 还分四个等级，这是"参数加了没生效"的头号原因

HotSpot 给每个 `-XX` 参数打了稳定性标签：

| 类型 | 含义 | 是否需要解锁 |
|---|---|---|
| `product` | 产品级，稳定 | 不需要 |
| `experimental` | 实验性 | 需先加 `-XX:+UnlockExperimentalVMOptions` |
| `diagnostic` | 诊断用 | 需先加 `-XX:+UnlockDiagnosticVMOptions` |
| `develop` | 开发调试 | 需 `-XX:+UnlockDevelopmentVMOptions`，日常不用 |

抄来一个 `-XX` 参数却报 `Unrecognized VM option`，多数不是写错，而是没解锁。等级可以在 `PrintFlagsFinal` 的输出里直接看到，每行末尾花括号就是：

```text
uintx MaxHeapSize = 4294967296 {product}
```

## 三、高频参数全称对照

### 1. 堆与线程栈（`-X` 系列，面试最爱问）

| 参数 | 全称 / 官方等价项 | 说明 |
|---|---|---|
| `-Xms` | Memory Start → `-XX:InitialHeapSize` | 堆初始大小，JVM 启动时即申请 |
| `-Xmx` | Memory maX → `-XX:MaxHeapSize` | 堆最大大小，超过就 OOM |
| `-Xmn` | Memory New（nursery）→ `-XX:NewSize` + `-XX:MaxNewSize` | 新生代大小，设了就固定不浮动 |
| `-Xss` | Stack Size → `-XX:ThreadStackSize` | 单个线程栈大小，注意是**每个线程** |

`-Xss` 是最容易被低估的一个：它乘线程数才是总占用。默认 1MB 时，500 个线程光栈就吃掉 500MB——这部分还在堆外，堆监控看不到。

### 2. 新生代内部比例

| 参数 | 全称 | 说明 |
|---|---|---|
| `-XX:NewRatio` | New Generation Ratio | 老年代 : 新生代，默认 `2` 即 2:1（老年代占 2/3） |
| `-XX:SurvivorRatio` | Survivor Ratio | Eden : 单个 Survivor，默认 `8` 即 8:1:1 |
| `-XX:MaxTenuringThreshold` | Max Tenuring Threshold | 晋升老年代的年龄阈值，默认 15（也是上限） |

`SurvivorRatio` 这个"8:1:1"要记住是 **Eden : S0 : S1**，两个 Survivor 各占一份，不是"Eden 占 8、Survivor 共占 1"。

### 3. 方法区 / 元空间（JDK 8 分水岭）

| 参数 | 全称 | 说明 |
|---|---|---|
| `-XX:PermSize` / `-XX:MaxPermSize` | Permanent Generation Size | 永久代，**仅 JDK 7 及以前**，JDK 8 已移除 |
| `-XX:MetaspaceSize` | Metaspace Size | 首次触发元空间 GC 的水位线，默认约 21MB，会自适应上调 |
| `-XX:MaxMetaspaceSize` | Max Metaspace Size | 元空间上限，默认不限制（受本地内存约束） |

**`MetaspaceSize` 不是"初始大小"，这是最常见的误解。** 元空间本身按需向操作系统申请，起始接近 0；`MetaspaceSize` 是"用到这么多就先清理一次"的警戒线，而且 JVM 会根据每次回收释放了多少动态调整这条线。所以它是一个**阈值**，不是容量。

### 4. 堆外内存与代码缓存

| 参数 | 全称 | 说明 |
|---|---|---|
| `-XX:MaxDirectMemorySize` | Max Direct Memory Size | 直接内存上限（NIO / Netty），**默认等于 `-Xmx`** |
| `-XX:ReservedCodeCacheSize` | Reserved Code Cache Size | JIT 编译产物缓存上限，分层编译默认约 240MB |

代码缓存满了会打一行 `CodeCache is full. Compiler has been disabled`，然后 JVM 停止编译新方法、退回解释执行——**表现为 CPU 不高但吞吐莫名下降**，很难查。这是 `ReservedCodeCacheSize` 值得关注的原因。

### 5. GC 选择与调优

| 参数 | 全称 | 说明 |
|---|---|---|
| `-XX:+UseG1GC` | Use G1 GC | 启用 G1；JDK 9 起已是默认，显式写只是表明意图 |
| `-XX:MaxGCPauseMillis` | Max GC Pause Millis | 期望最大停顿，G1 默认 200（ms），是**软目标**不保证 |
| `-XX:ParallelGCThreads` | Parallel GC Threads | 并行阶段线程数，默认与核数挂钩 |
| `-XX:ConcGCThreads` | Concurrent GC Threads | 并发阶段线程数，默认约为并行数的 1/4 |
| `-Xloggc:<file>` | Log GC | 输出 GC 日志到文件 |
| `-XX:+PrintGCDetails` | Print GC Details | 打印详细 GC 日志 ⚠️ JDK 9 起废弃，见第七节 |

### 6. 故障排查

| 参数 | 全称 | 说明 |
|---|---|---|
| `-XX:+HeapDumpOnOutOfMemoryError` | Heap Dump On Out Of Memory Error | OOM 时自动导堆快照 |
| `-XX:HeapDumpPath` | Heap Dump Path | 快照保存路径，建议指到挂载卷 |
| `-XX:ExitOnOutOfMemoryError` | Exit On OOM | OOM 后直接退出，交给容器编排重启 |
| `-XX:OnOutOfMemoryError` | 触发命令 | OOM 时执行外部脚本，可用于告警 |

后两个原文没提，但在容器环境里比 `HeapDumpOnOutOfMemoryError` 更常用：**OOM 之后进程往往已经处于"假活"状态（还能响应但业务全错），及时退出让 K8s 重建比硬撑更安全**。

## 四、三条命名规律

**规律一：`m` 开头是堆，`s` 开头是栈**

`-Xms` / `-Xmx` / `-Xmn` 的第一个字母都是 **M**emory，管的是堆内存不同维度；`-Xss` 的 **S** 是 **S**tack，管线程栈。堆和栈这两个字最容易混，用首字母就分开了。

**规律二：`Max` / `Size` / `Ratio` / `Threshold` 是通用后缀**

看到 `MaxXxx` 就是上限，`XxxSize` 就是容量，`XxxRatio` 就是比例，`XxxThreshold` 就是阈值。这条能覆盖绝大部分参数，`G1MaxNewSizePercent`、`MaxMetaspaceSize`、`SurvivorRatio` 全都能套。

**规律三：`-X` 是简写，`-XX:` 是全称，同一件事有两种写法**

| 简写 | 全称写法 |
|---|---|
| `-Xms` | `-XX:InitialHeapSize` |
| `-Xmx` | `-XX:MaxHeapSize` |
| `-Xss` | `-XX:ThreadStackSize` |
| `-Xmn` | `-XX:NewSize` + `-XX:MaxNewSize` |

记不住简写就记全称，反正两者等价，而且全称本身自解释。

> **给"`-Xms` 是 Memory Startup"这个说法打个补丁**
>
> 这组拆字母的解释流传很广，但要说清楚：官方文档里从没出现过 "Memory Startup" 这个术语，它只是社区为了方便记编的助记。`-Xms` 唯一官方定义是"堆的初始大小"，等价项是 `-XX:InitialHeapSize`。
>
> 更站得住的读法是 `m` = **M**emory、`s` = **s**tart（/min）、`x` = ma**x**。助记本身没错，能帮你记住就是好工具，但别在面试里把它当成官方定义去讲——被追问"哪个文档写的"会答不上来。分清"便于记的说法"和"事实"，是这类知识里最省事的严谨。

## 五、用一条生产命令串起来

零散参数记不住，是因为它们在你的脑中是碎片。把它们串成一段启动脚本，就变成了一条流程线：

```bash
java \
  -Xms3g -Xmx3g -Xmn1g -Xss1m \
  -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m \
  -XX:SurvivorRatio=8 -XX:MaxTenuringThreshold=15 \
  -XX:+UseG1GC -XX:MaxGCPauseMillis=200 \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/logs/heap.hprof \
  -jar app.jar
```

顺一遍就是完整的内存管理故事：

```text
堆多大（ms / mx）
  → 新生代分多少（mn）
    → 每个线程栈多大（ss）
      → 类元数据放哪（Metaspace）
        → 新生代内部怎么分（SurvivorRatio）
          → 对象多久晋升（TenuringThreshold）
            → 用什么收集器（UseG1GC）
              → 想停顿多快（MaxGCPauseMillis）
                → 出 OOM 怎么办（HeapDump / Exit）
```

### 为什么 `-Xms` 和 `-Xmx` 要设成一样

上面命令里两个都是 `3g`，这不是凑数：

- 堆容量动态伸缩会触发额外的 GC 和堆扩容/收缩动作，带来停顿抖动；固定住就没有这部分波动。
- 代价是启动即占满 3G 虚拟内存（注意是**预留**，不是立刻全部写实）。容器里要算清楚：堆 + 元空间 + 直接内存 + 线程栈 + JVM 自身开销，留 20%~25% 余量，否则容易被 OOMKilled——这点在[容器化内存与 OOM 治理](/back/jvm-oom/)里有详细展开。

## 六、与其记住，不如会查

记不住参数不丢人，参数本来就有几百个。真正该练熟的是"随时能查到当前 JVM 到底用了什么值"。

**查所有参数的最终生效值（最有用的一条）**

```bash
java -XX:+PrintFlagsFinal -version \
  | grep -Ei "heapsize|metaspacesize|stacksize"
```

输出形如 `uintx MaxHeapSize = 4294967296 {product}`，等号右边就是 JVM 计算后的真实值——它能直接回答"我明明设了，到底生效没有"。

注意必须带 `-version`（或任一不启动业务的方式），否则会正常启动你的应用。

**查 JVM 自己选了哪些参数**

```bash
java -XX:+PrintCommandLineFlags -version
```

只打印 JVM 在默认情况下**主动设定**的参数，比如默认选了哪个 GC。排查"为什么这台机器用的是 Parallel 而不是 G1"时很直接。

**查运行中进程**

```bash
jinfo -flags <pid>
jcmd <pid> VM.flags
```

`jcmd` 比 `jinfo` 更全，也是 JDK 9 之后官方推荐的方式。

**查参数帮助**

```bash
java -XX:+PrintFlagsFinal -version | grep -i gc     # 所有和 GC 相关的
java -X                                          # 列出 -X 系列
```

## 七、版本差异：这几条直接照抄会踩坑

原回答里的参数表本身没问题，但有四处是**只在 JDK 8 及以前成立**的，现在照抄会出问题。

### 1. `-XX:+PrintGCDetails` 和 `-Xloggc` 已经过时

JDK 9 引入统一日志框架 `-Xlog`，旧的 GC 日志参数被标记为 obsolete：

| 旧写法（JDK 8） | 新写法（JDK 9+） |
|---|---|
| `-XX:+PrintGCDetails` | `-Xlog:gc*` |
| `-Xloggc:/logs/gc.log` | `-Xlog:gc:file=/logs/gc.log` |
| `-XX:+PrintGCDateStamps` | 已在 `-Xlog:gc*` 的装饰器里 |

新版本上继续写 `-XX:+PrintGCDetails` 会看到 `Ignoring option PrintGCDetails; support was removed` 之类的提示，然后**你的 GC 日志就没了**——排障时才发现，代价很大。

### 2. JDK 9 起 G1 已是默认收集器

`-XX:+UseG1GC` 在新版本是冗余的（写了无害，但别以为写了才生效）。反过来，如果某台机器行为和其他机器不一致，先确认是不是有人显式指定了别的收集器。

### 3. G1 下新生代的三个参数基本失效

`-Xmn`、`-XX:NewRatio`、`-XX:SurvivorRatio` 在 G1 里的作用非常有限，G1 用自己的一套来控制：

| 维度 | Parallel / CMS | G1 |
|---|---|---|
| 新生代 | `-Xmn`<br>`-XX:NewRatio` | `-XX:G1NewSizePercent`<br>`-XX:G1MaxNewSizePercent` |
| 停顿 | 无此参数 | `-XX:MaxGCPauseMillis` |

两个百分比默认是 5 和 60，`MaxGCPauseMillis` 默认 200。G1 的设计哲学是"你给停顿目标，我自己算新生代多大"，所以**在 G1 上精心配 `-Xmn` 往往是白费力气**，甚至还可能干扰它的自适应。

### 4. `MaxTenuringThreshold` 在 G1 下含义变软

Parallel 下它是硬阈值（熬够次数才晋升），G1 下虽然默认也是 15，但 G1 会结合 Survivor 占用做动态判定，达到阈值不一定立刻晋升。把它当"上限"而不是"开关"来理解更准。

## 八、两个容易被忽略的实践坑

**同一个参数写多遍，最后一个生效**

```bash
java -Xmx1g -Xmx4g -jar app.jar   # 实际是 4g
```

真正麻烦的是参数来源不止一处：命令行、`JAVA_TOOL_OPTIONS`、`_JAVA_OPTIONS`、`JDK_JAVA_OPTIONS` 环境变量、容器启动脚本……启动日志里出现 `Picked up JAVA_TOOL_OPTIONS: ...` 就说明有环境变量在插手，它可能覆盖你写的值。排查内存对不上时，这是第一个要看的地方。

**`-Xss` 调大不是没有代价**

栈越大，能递归的层数越多，但每个线程的固定开销也越大，能创建的线程数相应减少。遇到 `StackOverflowError` 先想是不是递归写错了，而不是无脑加 `-Xss`；反过来遇到 `unable to create new native thread`，`-Xss` 太大反而常常是原因之一。

## 九、十秒速查

考前或临时用到时扫一眼这一张：

| 想知道 | 参数 | 一句话 |
|---|---|---|
| 堆起始 / 上限 | `-Xms` / `-Xmx` | Memory Start / maX |
| 新生代多大 | `-Xmn` | Memory New，设了就固定 |
| 线程栈多大 | `-Xss` | Stack Size，**每个线程** |
| 老新比例 | `-XX:NewRatio=2` | 老年代 : 新生代 = 2:1 |
| Eden 怎么分 | `-XX:SurvivorRatio=8` | Eden : S0 : S1 = 8:1:1 |
| 几岁进老年代 | `-XX:MaxTenuringThreshold=15` | Tenuring = 晋升 |
| 元空间上限 | `-XX:MaxMetaspaceSize` | 默认不限 |
| 元空间何时 GC | `-XX:MetaspaceSize` | 是**阈值**不是容量 |
| 直接内存上限 | `-XX:MaxDirectMemorySize` | 默认等于 `-Xmx` |
| 用什么 GC | `-XX:+UseG1GC` | JDK 9+ 已默认 |
| 停顿目标 | `-XX:MaxGCPauseMillis=200` | 软目标 |
| OOM 留证据 | `-XX:+HeapDumpOnOutOfMemoryError` | 配 `-XX:HeapDumpPath` |
| OOM 直接退出 | `-XX:ExitOnOutOfMemoryError` | 容器里更省事 |

## 十、快速自检

1. `-Xms` 的 `m` 和 `s` 分别代表什么？它的官方等价 `-XX` 参数是哪个？
2. `-Xmn` 和 `-XX:NewSize` 是什么关系？为什么设了 `-Xmn` 新生代就不再浮动？
3. `-XX:SurvivorRatio=8` 下，Eden、S0、S1 各占多少？
4. `-XX:MetaspaceSize` 是元空间的初始大小吗？它到底是什么？
5. `-XX` 参数分哪几个稳定性等级？为什么有的参数加了解析不了？
6. `-XX:MaxDirectMemorySize` 不显式设置时默认是多少？
7. 在 JDK 17 上想输出详细 GC 日志，`-XX:+PrintGCDetails` 还管用吗？该换成什么？
8. 为什么生产环境常把 `-Xms` 和 `-Xmx` 设成相同值？在容器里这样做要注意什么？
9. 怎么确认某个参数"到底生效了没有"？给出至少两种方法。

> 记住一句：**JVM 参数不是要背的清单，而是一套英文命名规则 + 两个查询命令。** 前缀分级别，单词拼语义，`PrintFlagsFinal` 验真值——记住这三件事，剩下的随时能查出来。

<style>
/* 参数表首列放的是 -Xms 这类参数，列宽偏窄时会被折成 "-" + "Xms" 两行，强制不换行 */
.vp-doc-container table td:first-child code {
  white-space: nowrap;
}
</style>
