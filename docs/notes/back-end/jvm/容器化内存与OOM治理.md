---
title: 容器化内存与 OOM 治理
createTime: 2026/08/23 21:10:00
permalink: /back/jvm-oom/
---

# 容器化内存与 OOM 治理

> 来源：同一会话中“大概率是 OOM 怎么避免 / dmesg 分析 / 10G 容器给 9G 堆如何调整 / 事故复盘”相关问答整理。

## 一、先留证据：让下次崩溃可追溯

在 Docker 启动命令 / Dockerfile `ENTRYPOINT` / K8s deployment 中为 JVM 增加参数：

```bash
java -jar app.jar \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/logs/heapdump.hprof \
  -XX:+PrintGCDetails -XX:+PrintGCTimeStamps -Xloggc:/logs/gc.log
```

- 确保 `/logs` 通过 Volume 映射到宿主机，否则容器重启文件丢失。
- 崩溃后得到 `.hprof`，用 Eclipse MAT / JProfiler 打开，查看 Leak Suspects。

## 二、Docker 环境最常见坑：JVM 内存与容器限制错位

> JVM 以为有 32G，但 Docker 只给了 2G。

### 必须显式设置堆

不设时 JVM 按宿主机内存基准分配，超过 `docker run -m 2g` 限制即被 OOM Killer 杀掉。

**推荐（容器 4GB 场景）：**

```bash
java -jar app.jar \
  -Xms2g -Xmx2g \
  -XX:MaxMetaspaceSize=512m \
  -XX:ReservedCodeCacheSize=256m
```

**公式：**

```
容器内存限制 = -Xmx + MaxMetaspaceSize + ReservedCodeCacheSize + 系统/线程栈开销(~500M~1G)
```

若 `-Xmx` 接近容器限制，必被 Kill 且来不及生成 heapdump。

## 三、本次事故的配置诊断

| 资源 | 配置 | 说明 |
|------|------|------|
| Docker 限制 | 10240 MB (10 GB) | 硬性天花板 |
| JVM 堆 | 9216 MB (9 GB) `-Xms9216m -Xmx9216m` | 接近上限 |
| 剩余非堆 | 1024 MB (1 GB) | 远不足 |

Java 进程总内存 = 堆 + 元空间 + 直接内存 + 线程栈 + Code Cache + GC 开销。本项目使用 Spring Cloud、Netty：

- 元空间：约 300-500MB
- 直接内存（Netty 堆外）：约 200-500MB
- 线程栈（~200 线程 ×1MB）：约 200MB
- Code Cache / GC：约 100-200MB

合计非堆需求约 1-1.5GB，预留仅 1GB，业务高峰或 GC 申请即超 10GB 触发 Kill。

## 四、合理调整方案

遵循 **75% 原则**：堆不超过容器总量的 75%。

### 方案一：保守稳定（推荐）

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 10240m
```

```bash
-Xms7168m \
-Xmx7168m \
-XX:MaxMetaspaceSize=512m \
-XX:ReservedCodeCacheSize=256m \
-XX:MaxDirectMemorySize=512m \
-XX:+HeapDumpOnOutOfMemoryError \
-XX:HeapDumpPath=/logs/heapdump.hprof
```

堆 7GB，元空间 512MB，直接内存 512MB，代码缓存 256MB，剩余缓冲约 1.9GB，非常安全。

### 方案二：激进利用（需堆接近 8GB 时）

```bash
-Xms8192m \
-Xmx8192m \
-XX:MaxMetaspaceSize=512m \
-XX:ReservedCodeCacheSize=256m \
-XX:MaxDirectMemorySize=512m \
-XX:+HeapDumpOnOutOfMemoryError \
-XX:HeapDumpPath=/logs/heapdump.hprof
```

剩余约 2GB，风险是元空间或直接内存仍可能突破。

### 关键参数说明

- `-XX:MaxMetaspaceSize=512m`：默认无限，显式关笼子防止撑爆容器。
- `-XX:MaxDirectMemorySize=512m`：限制 Netty 堆外内存。
- `-XX:+HeapDumpOnOutOfMemoryError`：下次崩溃保留现场。

## 五、代码层面优化（定时任务重灾区）

### 避免一次性全量加载

```java
// ❌ 瞬间 OOM
List<Data> allData = myMapper.selectAll();
for (Data d : allData) process(d);

// ✅ 流式 / 分页
try (Cursor<Data> cursor = mapper.selectCursor()) {
    for (Data data : cursor) process(data);
}

int pageNo = 1, pageSize = 500;
while (true) {
    List<Data> page = mapper.selectPage(pageNo, pageSize);
    if (page.isEmpty()) break;
    processBatch(page);
    pageNo++;
}
```

### 批量插入分批

```java
// ❌ 50 万对象一次装入 5GB+
List<Org> allOrgs = ...;
saveBatch(allOrgs);

// ✅ 每 500 条一批
int pageSize = 500;
for (int i = 0; i < total; i += pageSize) {
    List<Org> sub = getSubList(i, pageSize);
    saveBatch(sub);
}
```

### 及时清理大对象

大对象作用域限制在方法内，避免提升为成员变量；处理完置 `null` 或清空集合助 GC。

## 六、内存泄漏与组件治理

日志中曾出现：

```
org.apache.catalina.loader.WebappClassLoaderBase.checkThreadLocalMapForLeaks
... Netty InternalThreadLocalMap ... but failed to remove it
```

单次影响小，但频繁重启会导致 Metaspace 持续增长。

- 升级 `spring-boot-starter-parent`、`netty-all` 到稳定版。
- 自建 `EventLoopGroup` 需在 `@PreDestroy` / `DisposableBean.destroy` 中 `shutdownGracefully()`。
- 开启 Spring Boot 优雅停机：

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

## 七、GC 开销：为何堆外还需预留

GC 本身消耗内存：

**JVM 自身结构**：GC 线程栈（每线程 ~1MB）、标记位图/标记栈、Card Table、G1 的 Remembered Set（跨 Region 引用越多越大）。

**行为导致**：对象复制/晋升临时双份、过早晋升使老年代膨胀、大对象 Humongous（G1 中 >1/2 Region）碎片化、堆碎片导致分配失败触发 Full GC。

**特性开销**：G1 字符串去重表、Region 统计与 CSet。

**代码模式**：堆过小→GC 频繁；短命对象爆发；大 Buffer/大 JSON 频繁分配；缓存堆积老年代。

> 本次事故中，元空间、直接内存、线程栈、GC 结构均需挤在 1GB 剩余中，极易顶爆 10GB 上限。

降低开销：按公式留白、减少大对象与短命对象、合理选择 GC（如 G1 调整 Region、考虑 ZGC）、监控 Young/Full/Mixed GC 频率与老年代增长。

## 八、监控与预警

- Prometheus + Grafana 或 Spring Boot Actuator `/actuator/health`。
- 告警：容器内存使用率 >85% 持续 5 分钟；Full GC 频率突增（如每分钟一次）。

## 九、事故复盘模板

> 可直接存档到 Wiki。

**1. 事故概述**：2026-02-05 13:51:55，BIM 服务实例崩溃重启，陷入“启动-运行几分钟-崩溃-重启”死循环。

**2. 排查过程**：

- 初步：应用日志显示优雅停机 + `LettuceConnectionFactory is STOPPING` + Netty 泄漏警告，误判为代码逻辑或泄漏导致。
- 定音：`dmesg | grep -i kill` 发现 `Memory cgroup out of memory: Killed process ... anon-rss:10460192kB`，确认容器级 OOM Kill，死前约 10GB，三次被杀涉及两容器 ID，GC 线程触发。

**3. 根因**：

- 直接：Docker 10GB 限制 vs JVM 9GB 堆，非堆需求 1-1.5GB 超出预留。
- 间接：缺乏内存监控预警。

**4. 修复**：下调至 `-Xms7168m -Xmx7168m -XX:MaxMetaspaceSize=512m -XX:MaxDirectMemorySize=512m -XX:+HeapDump...`。

**5. 预防**：

- 配置规范：容器限制 = Xmx + MaxMetaspaceSize + MaxDirectMemorySize + 至少 1.5GB，固化启动模板。
- 代码：定时任务分页/流式，严禁 `selectAll`。
- 监控：容器与 JVM 内存监控，85% 告警。

