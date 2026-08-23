---
title: 优雅停机与 GC 开销
createTime: 2026/08/23 21:20:00
permalink: /back/graceful-shutdown-gc/
---

# 优雅停机与 GC 开销

> 来源：同一会话中 Tomcat ThreadLocal 泄漏、Quartz 优雅停机、GC 开销细分相关问答整理。

## 一、Tomcat ThreadLocal 泄漏警告

```
05-Feb-2026 13:51:55.898 严重 [Thread-13]
org.apache.catalina.loader.WebappClassLoaderBase.checkThreadLocalMapForLeaks
... created a ThreadLocal with key [java.lang.ThreadLocal@29d6cc88]
and value [io.netty.util.internal.InternalThreadLocalMap@798b8499]
but failed to remove it when the web application was stopped.
Threads are going to be renewed over time to try and avoid a probable memory leak.
```

### 含义

- **肇事者**：Netty（`InternalThreadLocalMap`）。
- **行为**：在 Tomcat HTTP 线程中使用 `ThreadLocal`/`FastThreadLocal` 缓存数据，应用停止时未清理。
- **后果**：线程池线程被复用，持有已停止应用的引用，类无法 GC，导致 Metaspace 泄漏；多次重启可能 `OutOfMemoryError: Metaspace`。
- **Tomcat 补救**：`Threads are going to be renewed` 表示已重建线程强行断引用，属亡羊补牢。

### 为何用到 Netty

常见来源：Dubbo/gRPC/Spring Cloud Gateway、RocketMQ 客户端、Nacos/Seata、WebSocket、或 Feign 配置的 HttpClient。

### 解决

1. **升级依赖**：`io.netty:netty-all` 或 Spring Boot/Cloud 到稳定版。
2. **自建 Netty 资源显式关闭**：

```java
@Component
public class NettyServer implements DisposableBean {
    private EventLoopGroup bossGroup, workerGroup;

    @PostConstruct
    public void start() {
        bossGroup = new NioEventLoopGroup(1);
        workerGroup = new NioEventLoopGroup();
    }

    @Override
    public void destroy() throws Exception {
        if (bossGroup != null) bossGroup.shutdownGracefully();
        if (workerGroup != null) workerGroup.shutdownGracefully();
    }
}
```

3. **第三方库导致**：开启优雅停机，给组件清理时间：

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

> 严重性：开发环境重启频繁会积压 Metaspace；生产偶尔重启可忽略，频繁热部署则致命。可用 `mvn dependency:tree` 定位 Netty 来源。

## 二、Quartz 优雅停机中的竞态

日志显示停止流程完整执行：Quartz paused/shutdown、SpringContextHolder destroyed、DruidDataSource closed。穿插的 `LettuceConnectionFactory is STOPPING` 属后台 Redis 消费者 `ProcessTaskSerialPostTaskPending` 在 Spring 已关闭连接池后仍 `leftPop` 导致，并非重启原因。修复思路同上：在 Service 的 `@PreDestroy` 中先停消费者线程再关连接池。

## 三、GC 开销在何处

常被忽略：GC 回收内存的同时自身也消耗内存与 CPU。

### 1. JVM 自身结构

- **GC 线程栈**：每线程 ~1MB（受 `-Xss` 控制），不算堆但占进程内存。
- **标记位图/标记栈/Card Table**：并发标记与跨代引用记录所需，分配在 native 内存。
- **G1 Remembered Set (RSet)**：每 Region 记录跨 Region 引用，引用越多 RSet 越大。

### 2. 行为导致

- **对象复制/晋升临时双份**：Young GC 时存活对象复制到 Survivor/老年代，瞬时峰值更高。
- **过早晋升**：Survivor 过小或 GC 频繁，短命对象提前进老年代，触发更重的 Mixed/Full GC。
- **大对象 Humongous**：G1 中 >1/2 Region 的对象直接进老年代，死后留下大空洞，碎片化导致分配失败。
- **堆碎片**：无法分配连续空间时触发 Full GC 整理。

### 3. 特性开销

- **G1 字符串去重**：需额外哈希表记录已去重 String。
- **Region 管理/CSet**：每次收集前统计存活率、效率等。

### 4. 代码与配置模式

- **堆过小**：Eden/老年代小→GC 频繁，CPU 与结构开销均增高。
- **短命对象爆发**：每请求大量临时 DTO/集合堆满 Eden。
- **大对象频繁**：大 byte[]/JSON/报表成 Humongous。
- **缓存堆积**：长生命周期对象驻留老年代，回收慢、频率高。

### 5. 与本次事故的关联

本例 Docker 10G、堆 9G 仅剩 1GB 给非堆：元空间、直接内存、线程栈、GC 结构（RSet、位图、去重表）均挤在 1GB 中，稍有波动即顶爆 cgroup。

### 6. 降低开销建议

- **留白**：容器内存 = Xmx + MaxMetaspaceSize + MaxDirectMemorySize + 1~2G。
- **减少大对象/短命对象**：分页/流式、控制缓存、复用对象。
- **调优 GC**：G1 调整 Region 大小、关注 `G1EagerReclaimHumongousObjects`、按需评估 ZGC/Shenandoah。
- **监控**：Young/Full/Mixed GC 频率与停顿、老年代/元空间/直接内存趋势、Allocation Failure 频率。

