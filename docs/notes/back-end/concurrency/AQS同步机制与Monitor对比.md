---
title: AQS 同步机制与 Monitor 对比
createTime: 2026/11/13 10:00:00
permalink: /back/concurrency/aqs-vs-monitor/
---

# AQS 同步机制与 Monitor 对比

## 一、一句话结论

**Monitor 是 JVM 和语言层提供的同步机制，AQS 是 JDK 并发包里构建同步器的 Java 框架。**

- `synchronized` 依赖 Monitor：字节码进入同步区后，由 HotSpot 的 `ObjectMonitor` 管理互斥、阻塞和等待队列。
- `ReentrantLock`、`Semaphore`、`CountDownLatch` 等依赖 AQS：AQS 负责排队、阻塞、唤醒和重试，子类只定义“什么条件下算获取或释放资源”。

两者不是同一层级的替代品。它们最终都要解决互斥、可见性和线程调度问题，但在同步状态、排队方式、可扩展性和使用方式上完全不同。

## 二、核心差异

| 对比维度 | Monitor | AQS |
|---|---|---|
| 定位 | JVM 内置的监视器锁机制 | 构建锁和同步器的框架，本身不是锁 |
| 典型入口 | `synchronized`、`wait/notify` | `ReentrantLock`、`Semaphore`、`CountDownLatch` |
| 实现位置 | HotSpot 中的 `ObjectMonitor`，C++ 实现 | `java.util.concurrent.locks.AbstractQueuedSynchronizer`，Java 实现 |
| 同步状态 | 对象头 Mark Word + `ObjectMonitor` 内部状态 | 一个 `volatile int state` |
| 排队结构 | `_EntryList`、`_WaitSet` 等 Monitor 队列 | CLH 变种 FIFO 双向同步队列，节点类型为 `Node` |
| 获取与释放 | 编译器插入 `monitorenter/monitorexit`，异常自动释放 | 子类实现 `tryAcquire/tryRelease` 等钩子，通常由调用方显式解锁 |
| 等待机制 | `Object.wait/notify` | `Condition.await/signal` |
| 模式 | 主要表达独占互斥 | 同时支持独占模式和共享模式 |
| 公平性 | 非公平竞争 | 子类可选择公平或非公平 |
| 超时与可中断 | 原生不提供锁获取超时和可中断获取 | 框架提供超时、可中断获取的通用流程 |
| 条件队列 | 一个 Monitor 对应一组等待结构 | 一个锁可创建多个相互独立的 `Condition` |
| 扩展方式 | 由 JVM 实现，语言层基本不可定制 | 通过继承 AQS、重写模板钩子扩展 |

最重要的分工可以记成：

```text
Monitor：对象级内置同步
  synchronized → ObjectMonitor → 操作系统阻塞原语

AQS：同步器构建框架
  业务同步器 → 定义 state 语义和 try* 钩子
             → AQS 负责排队、park/unpark、重试
             → 需要真正阻塞时进入操作系统
```

## 三、Monitor 如何实现 synchronized

### 3.1 字节码层

同步代码块由编译器插入 `monitorenter` 和 `monitorexit`：

```text
monitorenter
...临界区...
monitorexit   // 正常出口
...异常路径...
monitorexit   // 异常出口
```

正常路径和异常路径都安排释放指令，所以 `synchronized` 即使抛出异常也会自动释放锁。

同步方法没有额外的加解锁字节码，而是在方法访问标志中加入 `ACC_SYNCHRONIZED`。实例方法锁的是 `this`，静态方法锁的是当前类的 `Class` 对象。

这里要避免一个常见说法：**`monitorenter` 不是 Java 层的 native 方法**，它是 JVM 指令。解释器或 JIT 在进入 Slow Path 后，会调用 HotSpot 中的运行时逻辑，例如 `ObjectMonitor::enter`。

### 3.2 对象头与锁状态

以 64 位 HotSpot 为例，对象头中的 Mark Word 记录哈希值、分代年龄和锁标志等信息。不同锁状态下，同一块 Mark Word 会被解释成不同内容：

| 状态 | Mark Word 的主要含义 | 竞争处理 |
|---|---|---|
| 无锁 | 哈希值、分代年龄等 | 尚未建立锁拥有者 |
| 轻量级锁 | 指向线程栈中 Lock Record 的指针 | 通过 CAS 和自旋尝试解决短期竞争 |
| 重量级锁 | 指向 `ObjectMonitor` 的指针 | 由 Monitor 管理阻塞与唤醒 |

旧版本 JDK 还有偏向锁，用于只有一个线程反复获取锁的场景。但 **JEP 374 在 JDK 15 中废弃偏向锁，JDK 18 中移除**。讨论 JDK 17/21 时，实际主线应表述为：

```text
无锁 → 轻量级锁 → 重量级锁
```

“无锁 → 偏向锁 → 轻量级锁 → 重量级锁”是历史版本中的路径，仍可作为背景知识补充。

### 3.3 ObjectMonitor

当锁膨胀为重量级锁后，Mark Word 指向 HotSpot 的 `ObjectMonitor`。其核心组成可以概括为：

| 成员 | 作用 |
|---|---|
| `_owner` | 当前持有 Monitor 的线程 |
| `_recursions` | 重入次数 |
| `_EntryList` | 获取锁失败、进入阻塞状态的线程 |
| `_WaitSet` | 调用 `wait()` 后释放锁并等待通知的线程 |
| `_cxq` | 竞争线程先进入的等待结构，之后按策略转移 |

`ObjectMonitor` 是 HotSpot 用 C++ 定义的对象，通常分配在本地内存，而不是由 Java GC 管理的堆内存。Mark Word 保存的是指向它的指针。

### 3.4 wait/notify 的语义

`wait()`、`notify()` 操作的是 Monitor 的等待结构，所以必须在持有对应 Monitor 的 `synchronized` 块中调用，否则会抛出 `IllegalMonitorStateException`。

- `wait()`：释放 Monitor，进入 `_WaitSet`。
- `notify()`：把一个等待者从 `_WaitSet` 转移到重新竞争锁的队列。
- 被通知的线程不会立刻执行，它必须先重新获得 Monitor。
- `notify()` 也不会立刻释放当前线程持有的锁，通常要等当前 `synchronized` 代码块退出。

## 四、AQS 的核心模型

### 4.1 AQS 不是锁

AQS 是同步器框架，它提供“失败后排队、挂起、唤醒、再次尝试”的通用骨架，但不知道 `state` 具体代表什么。

同一个 `state`，在子类中可以有完全不同的语义：

| 同步器 | `state` 的含义 |
|---|---|
| `ReentrantLock` | 0 表示空闲，大于 0 表示重入次数 |
| `Semaphore` | 当前剩余许可数 |
| `CountDownLatch` | 尚未完成的计数 |
| `ReentrantReadWriteLock` | 高 16 位表示读锁计数，低 16 位表示写锁计数 |

所以 AQS 的核心并不是“一个万能锁”，而是：

> **把通用的等待队列和线程调度流程固定下来，把同步状态的业务含义留给子类。**

### 4.2 三大支柱

```text
AQS
├─ volatile int state     同步状态
├─ FIFO 同步队列           抢不到资源的线程在这里排队
└─ 模板方法模式            子类只实现 tryAcquire/tryRelease 等钩子
```

模板方法的基本分工如下：

| AQS 已实现的通用流程 | 子类需要定义 |
|---|---|
| `acquire/release` | `tryAcquire/tryRelease` |
| `acquireShared/releaseShared` | `tryAcquireShared/tryReleaseShared` |
| `acquireInterruptibly`、超时获取 | 仍复用子类的 `tryAcquire` 判断 |
| 入队、park、unpark、重试 | `state` 的语义和获取条件 |

### 4.3 同步队列与 Node

AQS 的同步队列不是原始 CLH 自旋锁的照搬，而是 **CLH 变种**：

- 原始 CLH 中，节点主要在前驱状态上自旋。
- AQS 改为双向 FIFO 队列，并用 `park/unpark` 代替持续自旋。
- 线程只重点观察前驱节点的 `waitStatus`。
- `head` 是一个虚拟节点，通常表示当前已经获得资源的线程位置。
- 新节点通过 CAS 更新 `tail` 入队。

`Node` 的主要字段：

| 字段 | 含义 |
|---|---|
| `thread` | 当前排队线程 |
| `prev` / `next` | 同步队列的前后指针（前驱、后继） |
| `waitStatus` | 节点等待状态 |
| `nextWaiter` | Condition 队列后继；共享模式下也可作为模式标记 |

`waitStatus` 的常见取值：

| 状态 | 值 | 含义 |
|---|---:|---|
| `SIGNAL` | `-1` | 后继节点正在或即将 park，当前节点释放资源时必须唤醒后继 |
| `CANCELLED` | `1` | 节点因超时或中断取消，需要从有效等待链中跳过 |
| `CONDITION` | `-2` | 节点正在 Condition 队列中等待 |
| `PROPAGATE` | `-3` | 共享模式下需要继续传播释放信号 |
| 默认值 | `0` | 初始状态 |

`SIGNAL` 是避免“唤醒丢失”的关键：线程准备睡眠前，先把前驱标记为 `SIGNAL`；前驱释放时看到该状态，就知道必须唤醒后继。

## 五、独占模式：以 ReentrantLock 为例

> 下面讨论的是 AQS 的通用获取骨架。`tryAcquire` 不是 AQS 直接实现的方法，而是由具体同步器提供的钩子。以 `ReentrantLock.NonfairSync` 为例，`lock()` 会先尝试一次快速 CAS，失败后才进入 `acquire(1)`。

### 5.1 完整调用链

```text
acquire(arg)
  ├─ tryAcquire(arg) 成功
  │    └─ 直接获得资源，返回
  └─ tryAcquire(arg) 失败
       ├─ addWaiter(Node.EXCLUSIVE)
       │    ├─ 队列非空：快速 CAS 追加到 tail
       │    └─ 队列为空或快速 CAS 失败：进入 enq
       │         ├─ tail == null：先创建虚拟 head
       │         └─ 循环 CAS，直到节点成功追加到 tail
       └─ acquireQueued(node, arg)
            └─ 循环：
                 ├─ 前驱是 head，再次 tryAcquire
                 │    └─ 成功：setHead(node)，退出循环
                 └─ 失败：shouldParkAfterFailedAcquire
                      ├─ 前驱为 SIGNAL：安全 park
                      ├─ 前驱为 CANCELLED：跳过取消节点，重试
                      └─ 前驱为 0 / PROPAGATE：CAS 改成 SIGNAL，重试

被唤醒后
  → 回到 acquireQueued 循环
  → 重新检查前驱和 tryAcquire
  → 只有再次获取成功，才真正结束等待
```

最重要的结论是：

> **入队只表示“获取失败后开始等待”，`unpark` 只表示“获得了一次重新竞争的机会”；只有 `tryAcquire` 返回 `true`，才代表真正拿到了资源。**

### 5.2 `acquire`：获取入口

```java
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}
```

这段短代码依靠短路逻辑把四个步骤串起来：

1. `tryAcquire(arg)` 由子类实现。成功时 `!tryAcquire` 为 `false`，后面的入队和等待全部不会执行。
2. 只有获取失败，才求值 `addWaiter(Node.EXCLUSIVE)`，把当前线程封装成独占节点并放入同步队列。
3. `acquireQueued(node, arg)` 负责排队等待、反复重试，并返回“等待期间是否发生过中断”。
4. 如果确实中断过，`selfInterrupt()` 在成功拿到锁后恢复中断标志：

```java
static void selfInterrupt() {
    Thread.currentThread().interrupt();
}
```

`acquire` 是**不可中断的获取方式**：等待期间即使线程被中断，也不会抛异常或退出等待，而是记住中断，拿到锁后补回中断状态。需要“被中断时放弃等待”时，使用的是 `acquireInterruptibly` 及其子类入口，例如 `ReentrantLock#lockInterruptibly`。

### 5.3 `addWaiter` 与 `enq`：节点如何入队

```java
private Node addWaiter(Node mode) {
    Node node = new Node(Thread.currentThread(), mode);
    // Try the fast path of enq; backup to full enq on failure
    Node pred = tail;
    if (pred != null) {
        node.prev = pred;
        if (compareAndSetTail(pred, node)) {
            pred.next = node;
            return node;
        }
    }
    enq(node);
    return node;
}

private Node enq(final Node node) {
    for (;;) {
        Node t = tail;
        if (t == null) { // Must initialize
            if (compareAndSetHead(new Node()))
                tail = head;
        } else {
            node.prev = t;
            if (compareAndSetTail(t, node)) {
                t.next = node;
                return t;
            }
        }
    }
}
```

入队过程可以拆成以下几步：

1. `new Node(Thread.currentThread(), mode)` 保存当前线程和独占模式。此后节点即使离开 CPU，线程身份也不会丢。
2. `addWaiter` 先走快路径。如果 `tail != null`，直接把新节点挂到当前尾部：
   - 先写 `node.prev = pred`。
   - 再用 CAS 把 `tail` 从 `pred` 改成 `node`。
   - 只有 CAS 成功，才写 `pred.next = node` 并返回。
3. 队列尚未初始化，或者快路径 CAS 失败，就进入 `enq`。
4. `enq` 中的 `for (;;)` 一直重试：
   - `tail == null` 时，创建一个 `thread == null` 的虚拟节点作为 `head`，同时让 `tail = head`。
   - `tail != null` 时，先写 `node.prev`，再 CAS 更新 `tail`，成功后才写旧尾节点的 `next`。
5. 多个线程可以同时入队，但只有一个线程能把 `tail` 从 `t` 改成自己的节点。CAS 失败的线程重新读取最新 `tail`，更新 `node.prev` 后继续尝试。

为什么一次 CAS 不够：从读取 `tail` 到执行 CAS 之间，其他线程可能已经改变了尾部；CAS 失败只能说明“当前视角过期”，必须重新读取并重试。

这里还有一个值得注意的并发窗口：

```text
node.prev = t;                       // 新节点已经能找到前驱
compareAndSetTail(t, node);          // tail 已经指向新节点
t.next = node;                       // 但旧节点还没连到新节点
```

在第三句执行前，从 `head` 沿 `next` 向后可能看不到新节点，但新节点的 `prev` 已经可靠。这也是后续某些找后继节点的代码会从 `tail` 沿 `prev` 反向查找的原因。

第一个真正排队的节点并不会直接成为 `head`。队列初始化时先放一个 `thread == null`、`waitStatus == 0` 的虚拟节点，示意“这里代表当前持有资源的执行位置”：

```text
初始空队列：
head == tail == null

第一次入队后：
head -> dummy Node <- node(T2)
tail -----------^
```

`enq` 最终返回的是旧尾节点 `t`，但 `addWaiter` 忽略了这个返回值，统一返回当前线程对应的 `node`，供 `acquireQueued` 使用。

### 5.4 `acquireQueued`：排队、重试与挂起

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

逐段看，循环中每轮只做三件事：

1. 通过 `node.predecessor()` 取得前驱节点 `p`，本质上就是读取 `node.prev`。
2. 只有 `p == head` 时才再次调用 `tryAcquire(arg)`：
   - 队列中其他线程即使 `tryAcquire` 可能成功，也不会一起争抢。
   - 只有排在队首的有效等待者才检查“资源现在是否空出来了”。
3. 如果前驱不是 `head`，或者 `tryAcquire` 仍然失败，就进入 `shouldParkAfterFailedAcquire`，判断现在能否安全阻塞。

当 `p == head && tryAcquire(arg)` 成功时，执行：

```java
private void setHead(Node node) {
    head = node;
    node.thread = null;
    node.prev = null;
}
```

随后再执行：

```java
p.next = null; // help GC
```

此时节点状态的迁移是：

```text
获取前：
head -> oldHead(p) -> node(T2) -> next(T3)

获取后：
oldHead(p) <-x- node(T2) -> next(T3)
                 ^
                head

并且：
node.thread = null
node.prev   = null
oldHead.next = null
```

`node` 从“等待资源的节点”变成新的虚拟 `head`。当前线程已经通过 `tryAcquire` 把资源状态和持有者记录在同步器里，因此这个 `head` 不再需要保存自己的线程引用。清空 `thread`、`prev`，再断开旧头节点的 `next`，都能让不可达对象尽快被 GC。

`failed` 初始为 `true`，只有成功获取后才会改成 `false`。正常等待和 interruption 都不会触发 `finally` 中的 `cancelAcquire`；如果循环中因异常提前退出，`failed` 仍为 `true`，该节点才会被取消并摘出等待链。

“被 unpark 后继续循环”是这段源码的核心：

- 被唤醒不等于前驱已经消失，必须重新确认 `p == head`。
- 被唤醒也不等于已经拿到资源，其他线程可能刚刚插队成功。
- 只有 `tryAcquire` 成功，才执行 `setHead` 并正常返回。

### 5.5 `shouldParkAfterFailedAcquire`：判断能否安全睡眠

```java
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    int ws = pred.waitStatus;
    if (ws == Node.SIGNAL)
        /*
         * This node has already set status asking a release
         * to signal it, so it can safely park.
         */
        return true;
    if (ws > 0) {
        /*
         * Predecessor was cancelled. Skip over predecessors and
         * indicate retry.
         */
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        /*
         * waitStatus must be 0 or PROPAGATE.  Indicate that we
         * need a signal, but don't park yet.  Caller will need to
         * retry to make sure it cannot acquire before parking.
         */
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```

三种分支对应三种处理：

| 前驱状态 | 处理 | 是否立即 park |
|---|---|---|
| `SIGNAL(-1)` | 前驱已经承诺释放时通知后继 | 是，返回 `true` |
| `CANCELLED(1)` | 沿 `prev` 跳过取消节点，重新拼接有效前驱和后继 | 否，返回 `false` 后重试 |
| `0 / PROPAGATE(-3)` | CAS 把前驱改成 `SIGNAL` | 否，返回 `false` 后重试 |

它第一次通常不会直接返回 `true`，而是先给前驱设置 `SIGNAL`，然后让调用方再执行一轮循环。这个“两阶段”设计专门用来避免唤醒丢失：

```text
等待线程 A                         释放线程 H
----------                         ----------
发现暂时抢不到资源
把 H.waitStatus 改为 SIGNAL
                                   如果此时释放资源：
                                   看到 H 是 SIGNAL，就会 unpark A
再次 tryAcquire
  ├─ 成功：不 park，直接结束等待
  └─ 失败：现在才安全地 park
```

如果先 park 再标记 `SIGNAL`，释放线程可能恰好在两者之间完成释放和唤醒，而 A 还没睡下或没有看到状态，之后就可能错过唤醒。先标记、重新检查、再阻塞，把这扇竞态窗口关掉了。

`LockSupport` 的许可机制还提供了第二层保护：`unpark` 可以先于 `park` 执行，许可会被保留，下一次 `park` 立即消费许可并返回。

当 `ws > 0` 时，前驱已经取消。这里沿 `prev` 跳过所有 `CANCELLED` 节点：

```java
do {
    node.prev = pred = pred.prev;
} while (pred.waitStatus > 0);
pred.next = node;
```

`prev` 方向是可靠的，因此取消节点可以被摘出有效等待链；完成后返回 `false`，让调用方回到循环重新检查 `p == head` 和资源状态。

### 5.6 `parkAndCheckInterrupt`：阻塞与中断

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);
    return Thread.interrupted();
}
```

只有 `shouldParkAfterFailedAcquire` 返回 `true`，短路逻辑才会执行 `parkAndCheckInterrupt`。

`LockSupport.park(this)` 返回可能来自：

- 正常 `unpark` 唤醒。
- 其他线程调用了 `interrupt`。
- 虚假唤醒。

所以 `park` 返回后不能直接认为“前驱释放了”，必须回到 `acquireQueued` 循环重新尝试获取。

`Thread.interrupted()` 会读取并清除当前线程的中断标志：

```text
发生中断
  → park 返回
  → Thread.interrupted() 返回 true，同时清除标志
  → acquireQueued 记录 interrupted = true
  → 继续等待并尝试获取资源
  → 获取成功后返回 true
  → acquire 调用 selfInterrupt()
  → 中断标志被重新置位
```

这条链路解释了为什么 `acquire` 等待期间已经发生中断，方法返回后调用方仍然能看到中断状态。它也避免了另一个隐患：如果 `park` 因“线程在进入 park 之前就已中断”而立即返回，不清除标志就会造成无限空转。

### 5.7 一次完整的独占锁等待时序

假设 T1 已持有锁，T2、T3 依次等待：

| 时刻 | 当前动作 | 队列与状态 |
|---|---|---|
| 1 | T1 持有锁 | `state = 1`，队列为空 |
| 2 | T2 `tryAcquire` 失败，调用 `addWaiter` | 先创建 dummy head，再入队 `H -> N2` |
| 3 | T2 首次进入 `acquireQueued` | `N2.prev == H`，再次尝试获取；仍失败 |
| 4 | `shouldParkAfterFailedAcquire(H, N2)` | `H.waitStatus` 由 `0` 改为 `SIGNAL` |
| 5 | T2 再试一次，仍失败 | `shouldPark...` 返回 `true`，T2 在 `N2` 上 park |
| 6 | T3 `tryAcquire` 失败并入队 | 队列变为 `H -> N2 -> N3` |
| 7 | T3 检查前驱 N2 | `N2.waitStatus` 改为 `SIGNAL`，T3 随后 park |
| 8 | T1 调用 `release` | `state` 归零，`unparkSuccessor(H)` 唤醒 N2 的线程 T2 |
| 9 | T2 从 `park` 返回 | 回到循环，确认 `N2.prev == H` |
| 10 | T2 再次 `tryAcquire` | 成功，执行 `setHead(N2)` |
| 11 | T2 结束等待 | `N2.thread = null`、`N2.prev = null`、旧 `H.next = null` |
| 12 | T2 后续释放锁 | 再唤醒 N3，依次向后推进 |

注意独占模式采用“当前持有者释放后唤醒一个有效后继”的链式推进，并不会在 T2 刚获取锁时一次性唤醒全部等待者。这样做既符合独占语义，也避免无谓唤醒。

### 5.8 为什么唤醒后仍然要 `tryAcquire`

`unpark` 只是把线程从阻塞状态变成可运行状态，并不会替它获得锁。它恢复执行后，资源可能被以下对象抢走：

- 非公平锁中新到达的线程。
- 其他刚刚被唤醒的竞争线程。
- 已持有锁的线程再次重入并延长持有时间。

因此 `acquireQueued` 使用 `for (;;)`，不能让一次 `park` 对应一次成功获取。正确的不变式始终是：

```text
p == head
  且
tryAcquire(arg) == true
```

这两项同时成立，节点才通过 `setHead` 正式离开等待状态。

### 5.9 ReentrantLock 如何实现重入

重入不是 AQS 本体自动提供的，而是 `ReentrantLock.Sync#tryAcquire` 根据 `state` 和当前持有者实现的：

```java
if (state == 0) {
    if (CAS(state, 0, acquires)) {
        owner = currentThread;
        return true;
    }
} else if (owner == currentThread) {
    state += acquires;
    return true;
}
return false;
```

第一次成功获取通常把 `state` 从 0 改成 1，并记录 `exclusiveOwnerThread`。同一线程再次获取时，发现 `owner == currentThread`，直接把 `state` 增加，不需要进入 AQS 队列。

释放时递减 `state`，只有减到 0 才清空持有者，并让 `release` 的模板逻辑唤醒后继节点。

因此更准确的说法是：

> AQS 提供了可原子维护的 `state` 和统一排队流程；重入语义由具体同步器的 `tryAcquire/tryRelease` 定义。

### 5.10 公平锁与非公平锁

非公平锁允许新来的线程直接 CAS 抢锁，即使队列中已经有人等待。这样可以减少挂起和唤醒次数，提高吞吐量，但可能造成排队线程长期抢不到。

公平锁在真正抢锁前增加：

```java
hasQueuedPredecessors()
```

如果队列中已有有效前驱，就不允许当前线程插队。

公平锁也不是“严格按到达顺序执行”：

1. 队列线程被唤醒后，锁仍可能被新线程抢走。
2. 公平性由子类 `tryAcquire` 实现，不是 AQS 自动赋予所有同步器。

### 5.11 独占锁的释放流程

以 `ReentrantLock` 为例，调用链从 `unlock()` 进入 AQS：

```text
ReentrantLock.unlock()
  → sync.release(1)
  → AQS.release(1)
  → tryRelease(arg)
      ├─ 失败：仍有线程持有资源，release 返回 false
      └─ 成功：资源已经完全释放
           → 读取 head
           → head == null：没有等待者，直接返回 true
           → head.waitStatus == 0：没有待通知的后继，直接返回 true
           → head.waitStatus != 0：unparkSuccessor(head)
                → 必要时把 head.waitStatus 从负值 CAS 改成 0
                → 优先选择 head.next
                → next 为空或已取消时，从 tail 沿 prev 反向寻找有效后继
                → LockSupport.unpark(后继线程)
```

这里必须把“释放资源”和“唤醒线程”分开理解：

- `tryRelease` 成功，表示锁状态和独占持有者已经更新，其他线程理论上可以开始竞争。
- `unparkSuccessor` 只是给一个等待线程“重新竞争的机会”。
- 被唤醒线程仍要回到 `acquireQueued` 循环，执行 `tryAcquire` 成功后才真正获得锁。

### 5.12 `release`：释放入口

```java
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

逐段说明：

1. `tryRelease(arg)` 是子类实现的钩子。AQS 不知道 `state` 应该减小多少，也不知道资源是否真的已经全部归还。
2. 返回 `false` 表示这次调用没有完成最终释放。以 `ReentrantLock` 为例，如果锁重入了两次，第一次 `unlock()` 只把 `state` 从 2 减到 1，此时不应唤醒后继，因为当前线程仍持有锁。
3. 返回 `true` 表示资源已经完整释放，此时才考虑唤醒。
4. `Node h = head` 读取当前虚拟头节点。队列从未初始化时 `h == null`，不存在等待者。
5. `h.waitStatus != 0` 是一个低成本筛选：
   - `head.waitStatus == 0`：没有可靠的后继通知请求，无需唤醒。
   - `head.waitStatus < 0`：通常是 `SIGNAL`，说明后继正在或即将等待通知。
   - 在严格的独占获取流程中，后继通常已把前驱改成 `SIGNAL`；`PROPAGATE` 主要用于共享传播路径。
6. 只有确实存在可能的等待者，才调用 `unparkSuccessor(h)`。最后返回 `true`，表示本次 `release(arg)` 已成功完成释放。

所以 `release` 中的条件不是“锁状态是否归零”，而是由子类 `tryRelease` 统一回答“资源是否已经完整释放”。这也体现了 AQS 的模板方法分工：

> **AQS 管理队列和唤醒时机，具体同步器管理 `state` 如何变化。**

### 5.13 ReentrantLock 的 `tryRelease`

`ReentrantLock.Sync#tryRelease` 的核心逻辑可以简化为：

```java
protected final boolean tryRelease(int releases) {
    int c = getState() - releases;
    if (Thread.currentThread() != getExclusiveOwnerThread())
        throw new IllegalMonitorStateException();

    boolean free = false;
    if (c == 0) {
        free = true;
        setExclusiveOwnerThread(null);
    }
    setState(c);
    return free;
}
```

它完成三件事：

1. 校验释放者必须是锁的持有者；不是则抛 `IllegalMonitorStateException`。
2. 递减重入计数。
3. 只有 `c == 0` 才清空 `exclusiveOwnerThread`，并返回 `true`。

因此下面两次 `unlock()` 的语义不同：

```text
第 1 次：state 2 → 1，返回 false，不唤醒后继
第 2 次：state 1 → 0，返回 true，进入 unparkSuccessor
```

`state` 的修改发生在释放资源的线程中。把 `state` 写回 0 后，再通过 `unpark` 唤醒后继；后继仍要成功执行 `tryAcquire`，并通过读取或 CAS `state` 建立获取与释放之间的同步关系。`unpark` 提供唤醒许可，不代替同步状态检查。

### 5.14 `unparkSuccessor`：寻找并唤醒后继

```java
private void unparkSuccessor(Node node) {
    /*
     * If status is negative (i.e., possibly needing signal) try
     * to clear in anticipation of signalling. It is OK if this
     * fails or if status is changed by waiting thread.
     */
    int ws = node.waitStatus;
    if (ws < 0)
        compareAndSetWaitStatus(node, ws, 0);

    /*
     * Thread to unpark is held in successor, which is normally
     * just the next node. But if cancelled or apparently null,
     * traverse backwards from tail to find the actual
     * non-cancelled successor.
     */
    Node s = node.next;
    if (s == null || s.waitStatus > 0) {
        s = null;
        for (Node t = tail; t != null && t != node; t = t.prev)
            if (t.waitStatus <= 0)
                s = t;
    }
    if (s != null)
        LockSupport.unpark(s.thread);
}
```

这个方法分为两步：先清理当前节点的通知状态，再选择真正要唤醒的后继线程。

### 5.15 为什么先把 `waitStatus` 改成 0

`unparkSuccessor(node)` 通常会传入 `head`。此时 `head.waitStatus == SIGNAL`，表示后继节点已经请求“你释放时通知我”。在发出通知之前，把它改回 0：

```java
int ws = node.waitStatus;
if (ws < 0)
    compareAndSetWaitStatus(node, ws, 0);
```

原因是把“已经安排了一次通知”的协作状态消费掉，它包含两层含义：

1. **消费本次通知预约。** `head` 上的 `SIGNAL` 表示后继需要被唤醒；通知发出后清回 0，避免旧状态被后续代码误认为仍有一笔未履行的通知。
2. **让后继重新建立等待状态。** 后继恢复后如果仍未取得锁，会再次进入 `acquireQueued`，重新确认前驱并在需要时设置新的 `SIGNAL`。

CAS 失败并不影响正确性。等待线程可能同时修改这个状态；源码注释明确说明这里“清除状态”是 anticipation，真正的保证仍来自后续循环：

```text
后继恢复
  → 重新确认 p == head
  → 再次 tryAcquire
  → 失败则重新建立 SIGNAL
  → 再 park
```

`waitStatus` 不是一把锁，而是一组协作提示。它让释放方知道“是否需要唤醒”，同时也允许等待方在被唤醒后重新校正状态。

### 5.16 为什么通常唤醒 `head.next`

```java
Node s = node.next;
```

`head` 的 `next` 是队列中最靠前的有效候选。正常情况下，它也是最早等待的节点，因此优先唤醒它最符合 FIFO 语义。

不过这不是不加检查的直接唤醒：

- 后继可能已经被取消，`waitStatus == CANCELLED`。
- 后继的 `next` 可能尚未接入，或者已不再有效。
- 并发队列操作可能使 `next` 指针暂时为空。

所以代码先检查：

```java
if (s == null || s.waitStatus > 0)
```

`waitStatus > 0` 当前就是 `CANCELLED`。取消节点不能正常获取资源，也不能承担唤醒链，因此需要继续寻找后续的有效节点。

### 5.17 为什么需要从 `tail` 反向遍历

兜底路径从尾部沿 `prev` 往回查找：

```java
s = null;
for (Node t = tail; t != null && t != node; t = t.prev)
    if (t.waitStatus <= 0)
        s = t;
```

反向遍历结束后，`s` 是等待链中最靠近 `head`、状态不为 `CANCELLED` 的节点。

原因是 `prev` 和 `next` 的发布顺序不对称。在 `addWaiter/enq` 中：

```text
node.prev = t;
compareAndSetTail(t, node);
t.next = node;
```

`prev` 先写，`tail` 通过 CAS 发布，`next` 最后才补上。存在下面的瞬时状态：

```text
oldTail(t) --next--> 尚未连到 node
node --prev--> oldTail(t) 已经有效
tail == node
```

如果从 `head` 沿 `next` 查找，可能因为最后一条指针尚未发布而漏掉刚入队的新节点；从 `tail` 沿 `prev` 查找，则可以稳定覆盖整条新入队路径。

源码寻找的是**离头部最近的未取消节点**，而不是简单地把指向尾部的那一个作为目标。整个遍历让 `s` 不断向前更新，最后得到最靠前的有效后继。

### 5.18 `LockSupport.unpark` 做了什么

```java
if (s != null)
    LockSupport.unpark(s.thread);
```

`unpark(thread)` 会为该线程设置或保留一个许可：

- 如果目标线程已经 park，许可会唤醒它。
- 如果目标线程还未 park，许可会被保留，后续第一次 `park` 会立即消费许可并返回。
- 被唤醒不代表立刻获得 CPU，也不代表立刻拿到锁；它还需要等待调度并重新竞争资源。

这解释了为什么释放方的通知与等待方的 park 不必精确同步也不会丢失：`unpark` 的许可机制提供了预存能力，AQS 的 `SIGNAL` 状态与等待循环又保证了通知关系能够被重新建立。

### 5.19 一次完整的释放与唤醒时序

假设当前队列为：

```text
head(H) -> N2(T2) -> N3(T3) -> N4(T4, 已取消)
```

T1 持有锁并完成最终释放，T4 已因超时或中断取消：

| 时刻 | 执行动作 | 状态变化 |
|---|---|---|
| 1 | T1 调用 `unlock()` | 进入 `release(1)` |
| 2 | `tryRelease(1)` | `state 1 → 0`，清空独占持有者，返回 `true` |
| 3 | 读取 `head == H` | `H.waitStatus == SIGNAL`，需要唤醒 |
| 4 | `unparkSuccessor(H)` | `H.waitStatus` 从 `SIGNAL` CAS 成 0 |
| 5 | 先检查 `H.next == N2` | N2 有效，选择 T2 |
| 6 | 执行 `unpark(T2)` | T2 被标记为可运行，或预存一个许可 |
| 7 | T2 从 park 返回 | 回到 `acquireQueued` 循环 |
| 8 | 检查 `N2.prev == H` | 成立，调用 `tryAcquire(1)` |
| 9 | T2 获取成功 | `state 0 → 1`，记录 T2 为独占持有者 |
| 10 | 执行 `setHead(N2)` | N2 变成新的虚拟 head，`thread/prev` 清零 |
| 11 | 断开旧头引用 | `H.next = null`，旧头帮助 GC |
| 12 | T2 后续释放 | 从新 head 继续寻找有效后继并唤醒 |

T2 刚拿到锁时不会马上唤醒 T3，独占锁只在**持有者完成最终释放**后唤醒一个有效后继。这样既保持互斥，也避免一次释放唤醒所有等待者造成无谓竞争。

如果 T4 在等待期间被取消，它不会成为唤醒目标。`unparkSuccessor` 会沿着有效后继寻找，必要时从 `tail` 沿 `prev` 跳过取消节点。

### 5.20 唤醒丢失与重复唤醒

AQS 的释放与等待构成一组配合：

```text
等待线程：
  设置前驱 SIGNAL
  → 再检查一次资源
  → 仍失败才 park

释放线程：
  修改 state
  → 检查 head 状态
  → unpark 有效后继
```

关键顺序保证两类并发窗口不会造成永久等待：

1. **等待线程在设置 `SIGNAL` 前被唤醒**：此时它还没 park，下一次循环会重新尝试获取，成功后直接离开等待。
2. **等待线程在设置 `SIGNAL` 后、park 前被唤醒**：`unpark` 许可会保留，随后 `park` 立即返回，不会丢失通知。
3. **释放时后继已经取消**：从 `tail` 反向找到有效节点，避免把通知发给取消节点。
4. **释放时 `head.waitStatus == 0`**：没有可靠等待通知的后继，跳过无意义的系统级唤醒。

`unpark` 可能表现为“提前唤醒”，但 `acquireQueued` 并不把唤醒等同于成功。它会重新检查前驱和资源状态，因此多一次许可不会破坏锁语义。

## 六、共享模式

### 6.1 独占与共享的区别

独占模式同一时刻只允许一个线程持有资源，典型实现是 `ReentrantLock`。

共享模式允许多个线程同时获取资源，典型实现是：

- `Semaphore`：每个获取者消费一个或多个许可。
- `CountDownLatch`：计数归零后，所有等待线程可以一起通过。
- `ReentrantReadWriteLock` 的读锁：多个读者可以同时持有。

共享模式使用另一组模板方法：

```java
tryAcquireShared(arg)
tryReleaseShared(arg)
```

`tryAcquireShared` 的返回值具有三种语义：

| 返回值 | 含义 |
|---|---|
| 负数 | 获取失败，需要排队 |
| `0` | 获取成功，但后继通常不能继续传播 |
| 正数 | 获取成功，且还有剩余资源，可以继续唤醒后继共享节点 |

### 6.2 为什么需要传播

共享模式获取成功后不仅要让自己继续执行，还可能需要让多个等待者一起通过。这由 `setHeadAndPropagate` 等逻辑完成。

`PROPAGATE` 状态用于处理共享释放时的一种并发窗口：多个线程同时释放资源，唤醒信号可能因为状态读取顺序而短暂中断。它不是一个普通业务状态，而是 AQS 为避免共享唤醒丢失设置的传播标记。

### 6.3 ReentrantReadWriteLock 如何用一个 state 表示两把锁

一个 32 位 `int state` 被拆成两段：

```text
高 16 位：读锁数量，共享
低 16 位：写锁重入次数，独占
```

因此可以同时维护：

- 当前有多少个读锁持有者。
- 写锁是否被持有，以及写锁重入了多少次。
- 在写锁持有期间，判断是否发生重入。

## 七、Condition 与监视器等待模型

### 7.1 Condition 的两类队列

每个 `ConditionObject` 都有一条独立的条件等待队列。线程调用 `await()` 时：

```text
持有锁
  → 构造 CONDITION 节点并进入 Condition 队列
  → 完全释放当前锁
  → park 等待

其他线程 signal
  → 把节点从 Condition 队列转移到同步队列尾部
  → 被通知线程重新竞争锁
  → 再次获得锁后，从 await 返回
```

因此：

- `await()` 前必须持有锁。
- `signal()` 后不会立即执行等待线程。
- 被唤醒只代表重新进入同步队列，不代表已经拿到锁。
- 条件经常需要放在循环中重新检查，因为等待期间条件可能再次变化。

### 7.2 与 Object.wait/notify 的关系

| 维度 | `Object.wait/notify` | `Condition.await/signal` |
|---|---|---|
| 条件队列数量 | 一个 Monitor 对应一组等待结构 | 一个锁可以创建多个 `Condition` |
| 使用前提 | 持有 Monitor | 持有对应 Lock |
| 唤醒后 | 返回 Monitor 竞争 | 返回 AQS 同步队列竞争 |
| 超时能力 | 支持等待超时 | 支持等待超时 |
| 条件检查 | 通常放在 `while` 循环 | 同样必须放在 `while` 循环 |

两者在等待/重新检查条件这一层，都体现了监视器式等待的基本思想。可以把这种语义概括为：**线程等待某个条件，被通知后重新拿锁，再次检查条件是否真正成立。**

不过不要把它扩大成“AQS 的整体理论就是 MESA 管程”。更准确的表述是：

> AQS 的整体设计核心是模板方法、状态和等待队列；它的 Condition 等待语义与 Monitor/MESA 的“醒来后重新检查条件”相近。

## 八、用户态、内核态与性能边界

### 8.1 CPU、线程与内核的正确心智模型

- CPU 只是指令执行器，不知道“线程”这个抽象。
- 线程的调度状态由内核中的任务结构和运行队列维护。
- 用户态可以通过自旋忙等，但不能把线程真正挂起。
- 真正让出 CPU、进入等待状态、重新放入就绪队列，必须由内核调度器参与。
- 内核不是被 CPU “远程调用”的外部服务，而是同一 CPU 在更高特权级下执行另一段代码。

用户线程通常通过 `syscall` 请求内核服务。`syscall` 本身是一条用户态可执行的陷入指令，硬件负责切换特权级并跳到内核入口；后续的调度、队列修改等由内核代码完成。

内核获得控制权不只靠系统调用，也可能来自：

- 硬件中断，例如时钟中断触发抢占调度。
- CPU 异常，例如缺页异常。

### 8.2 自旋和阻塞不是一回事

| 等待方式 | 线程状态 | 是否占 CPU | 是否进入内核 |
|---|---|---|---|
| CAS 循环自旋 | 仍然 Running/Runnable | 是 | 通常否 |
| 真正阻塞 | Waiting/Sleeping | 否 | 是 |

轻量级锁、AQS 自旋和 futex fast path 都在尽量用 CAS 解决无竞争或短暂竞争，避免线程真正睡眠。

### 8.3 Monitor 和 AQS 什么时候进入内核

两者的加锁逻辑都可以先在用户态执行：

- 修改 Mark Word、CAS 修改 AQS `state`。
- 维护用户态数据结构中的等待队列。
- 短暂自旋或在被唤醒后重新尝试。

需要真正挂起或唤醒线程时，才会进入操作系统同步原语。典型链路可以粗略表示为：

```text
synchronized
  → ObjectMonitor
  → HotSpot 平台同步实现
  → pthread mutex/cond 或 futex 等系统调用
  → 内核挂起/唤醒线程

AQS
  → LockSupport.park/unpark
  → Unsafe
  → HotSpot Parker
  → pthread cond / futex
  → 内核挂起/唤醒线程
```

在 Linux 上，futex 的设计目标就是：

- 无竞争时，在用户态用原子操作完成。
- 只有需要睡眠或唤醒时，才通过 `FUTEX_WAIT`、`FUTEX_WAKE` 等服务进入内核。

所以不能简单说：

- 错误：Monitor 每次加锁都进入内核。
- 错误：AQS 完全不会进入内核。

更准确的是：

> Monitor 和 AQS 都有用户态快速路径；只有线程真正阻塞和唤醒时，才需要内核调度器参与。两者的差异主要在于同步语义、历史实现和把调用留在 fast path 的能力。

### 8.4 `LockSupport.park/unpark` 的特殊性

`LockSupport` 使用许可思想：

- 每个线程最多保留一个 `unpark` 许可。
- 如果 `unpark` 先于 `park` 执行，许可会被记录。
- 随后调用 `park` 时可以直接消费许可并返回，不会丢失唤醒。

HotSpot 的 Parker 通常包含：

```text
counter + mutex + condition
```

其中：

- `counter` 保存许可。
- mutex 保护 Parker 内部状态的一致性。
- condition 用于真正阻塞和唤醒线程。

需要注意，Parker 内部的 mutex 保护的是 `counter` 等 Parker 状态，不是 AQS 正在竞争的业务锁。AQS 的业务互斥由 `state` 和子类语义决定。

### 8.5 性能结论

不要用“AQS 一定比 synchronized 快”做结论：

- 无竞争场景下，两者都有用户态快速路径。
- `synchronized` 从 JDK 6 起经过锁升级、自适应自旋等优化，现代 JDK 下与 `ReentrantLock` 的整体性能差距通常不再是选型核心。
- AQS 的价值更多在于可组合、可扩展、超时、可中断、公平性和多条件队列。
- 真正阻塞都要进入内核，重点应放在减少无谓阻塞、缩短临界区和降低锁竞争上。

## 九、常见误区

### 9.1 AQS 就是一把锁

不是。AQS 是同步器框架，`ReentrantLock` 只是它的一个使用者。没有人会直接 `new AQS` 来加锁，实际做法通常是定义内部 `Sync` 类继承 AQS，并实现模板钩子。

### 9.2 AQS 自带可重入

不是。AQS 只维护 `state` 和排队流程。重入需要子类记录当前持有者，并在同一线程再次获取时增加状态计数。

### 9.3 volatile 可以保证线程安全

`volatile` 保证可见性和一定的有序性，不保证复合操作原子性。

AQS 使用 `volatile state + CAS`：

- CAS 负责“比较并修改”的原子性。
- `volatile` 让状态更新对其他线程可见。
- 普通读与普通写在释放/获取路径上也需要正确的可见性语义。

### 9.4 被唤醒后就已经拿到锁

不是。唤醒只是重新获得执行机会。线程必须回到 `acquireQueued` 循环，再次调用 `tryAcquire`，成功后才能把自己设为 `head` 并返回。

### 9.5 CLH 队列就是原始 CLH

不是。AQS 使用的是 CLH 变种：双向链表、FIFO 同步队列、park/unpark 阻塞，而不是每个线程持续自旋检查前驱。

### 9.6 `tryAcquireShared` 只返回成功或失败

不是。负数表示失败，0 表示成功但通常不继续传播，正数表示成功且还有资源可供后继共享节点继续获取。

### 9.7 `signal` 会立刻让等待线程继续执行

不会。等待节点只是从 Condition 队列转移到同步队列。线程必须重新竞争锁，获得锁后才能从 `await` 返回。

### 9.8 Monitor 的等待队列和 AQS 同步队列是一回事

不是。它们都在解决排队问题，但底层数据结构和控制流程不同：

- Monitor 的队列由 HotSpot 的 `ObjectMonitor` 管理。
- AQS 的同步队列和 Condition 队列由 Java 层的 `Node` 结构维护。

## 十、如何选型

### 优先使用 synchronized

- 普通临界区互斥。
- 不需要公平锁。
- 不需要锁获取超时。
- 不需要可中断获取。
- 只需要一个等待条件。
- 希望代码简洁，并依赖异常自动释放。

```java
synchronized (lock) {
    // 临界区
}
```

### 使用基于 AQS 的同步器

- 需要公平锁或非公平锁可选。
- 需要 `tryLock(timeout)`。
- 需要 `lockInterruptibly()`。
- 需要多个独立 Condition。
- 需要读写锁分离。
- 需要实现自定义同步语义，例如自定义门闩、许可池或状态机。

```java
lock.lock();
try {
    // 临界区
} finally {
    lock.unlock();
}
```

使用 `Condition` 时，条件判断必须放在循环中：

```java
lock.lock();
try {
    while (!condition) {
        condition.await();
    }
    // condition 已成立
} finally {
    lock.unlock();
}
```

## 十一、AQS 高频面试题

> 以下 25 题来自原对话的完整清单，均已整理标准回答。

### 一、基础认知层

#### Q1. 什么是 AQS？它的设计思想是什么？

**标准回答：**

AQS 是 JUC 包下用于构建锁和同步器的框架，本身不是锁。它把“CAS 修改状态 → 获取失败入队 → park 挂起 → 被唤醒后重试 → 释放时唤醒后继”这套通用流程固定在 `acquire/release` 等模板方法中，子类只需通过 `tryAcquire/tryRelease` 或 `tryAcquireShared/tryReleaseShared` 定义 `state` 满足什么条件才算获取成功。

它的三大支柱是：

- `volatile int state`：同步状态，语义由子类定义。
- CLH 变种同步队列：管理获取失败的线程。
- 模板方法模式：复用排队、阻塞、唤醒和重试流程。

AQS 本身不规定“重入”语义，`ReentrantLock` 的重入是子类根据 `state` 和当前持有线程实现的。AQS 的 Condition 等待/唤醒部分则与监视器式等待相近：线程被通知后仍需重新获得锁并再次检查条件。

#### Q2. AQS 的核心数据结构有哪些？

**标准回答：**

AQS 的核心数据结构可以分为四层：

1. `volatile int state`：同步状态，不同子类赋予不同含义。
2. 同步等待队列：由 `volatile Node head` 和 `volatile Node tail` 维护的 FIFO 双向队列，`head` 是虚拟节点。
3. `Node`：主要字段包括 `thread`、`prev`、`next`、`waitStatus` 和 `nextWaiter`。
4. Condition 队列：每个 `ConditionObject` 对应一条单向条件队列，节点通过 `nextWaiter` 串联。

`waitStatus` 的常见值包括 `SIGNAL(-1)`、`CANCELLED(1)`、`CONDITION(-2)`、`PROPAGATE(-3)` 和默认值 `0`。

#### Q3. 为什么 AQS 的 state 要用 volatile 修饰？volatile 能保证线程安全吗？

**标准回答：**

`volatile` 只保证可见性和一定的有序性，禁止相关指令重排，但不保证复合操作原子性，所以单独使用 `volatile` 不能保证线程安全。

AQS 使用 `volatile state + CAS` 的组合：

- CAS 负责“比较并修改”的原子性。
- `volatile` 负责让状态变化及时对其他线程可见。
- 释放路径中的普通状态写也依赖 `volatile` 的可见性，使后续获取线程能够看到资源已经释放。

因此准确的结论是：**volatile 不保证原子性，CAS 补足原子性；两者共同构成 AQS 的状态访问基础。**

#### Q4. AQS 支持哪两种模式？分别对应哪些具体类？

**标准回答：**

AQS 支持独占模式和共享模式。

- 独占模式：同一时刻只有一个线程能获得资源，对应 `acquire/release`，子类实现 `tryAcquire/tryRelease`，典型类是 `ReentrantLock`。
- 共享模式：多个线程可以同时获得资源，对应 `acquireShared/releaseShared`，子类实现 `tryAcquireShared/tryReleaseShared`，典型类是 `Semaphore`、`CountDownLatch`。

`tryAcquireShared` 的返回值有三种语义：

- 负数：获取失败，需要排队。
- `0`：获取成功，但通常不继续向后传播。
- 正数：获取成功，且还有剩余资源，可以继续唤醒后继共享节点。

共享模式的关键行为是获取成功后通过 `setHeadAndPropagate` 等逻辑继续传播。`ReentrantReadWriteLock` 则是混合模式：读锁共享，写锁独占。

### 二、实现原理层

#### Q5. 详细描述 AQS 独占模式获取锁的完整流程（acquire）

**标准回答：**

`acquire(arg)` 的完整调用链是：

```text
tryAcquire(arg) 成功
  → 直接获得资源，返回

tryAcquire(arg) 失败
  → addWaiter(Node.EXCLUSIVE) 创建独占节点并入队
  → acquireQueued(node, arg) 循环等待
      → 前驱是 head 时再次 tryAcquire
      → 获取成功则 setHead(node) 并返回
      → 仍未获取则将前驱标记为 SIGNAL 并 park
      → 被唤醒后继续循环，重新检查
```

具体步骤：

1. 调用子类实现的 `tryAcquire(arg)`，典型实现会检查 `state` 并通过 CAS 或其他方式修改同步状态。成功就直接返回。
2. 失败后，`addWaiter(Node.EXCLUSIVE)` 把当前线程封装成独占节点。先尝试一次快速 CAS 入队；队列未初始化或 CAS 失败时进入 `enq`。
3. `acquireQueued(node, arg)` 进入循环：
   - 通过 `node.predecessor()` 读取前驱。
   - 只有前驱是 `head` 时才再次尝试 `tryAcquire`。
   - 成功则执行 `setHead(node)`，把当前节点转成新的虚拟头节点。
   - 失败则调用 `shouldParkAfterFailedAcquire`，必要时把前驱状态改为 `SIGNAL`。
   - 允许阻塞时调用 `parkAndCheckInterrupt` 挂起线程。
4. 被 `unpark` 或中断唤醒后，不能直接认为获取成功，必须回到循环重新检查前驱和资源状态。
5. 如果等待期间发生过中断，`acquireQueued` 返回中断标记；获取成功后再由 `selfInterrupt()` 恢复中断标志。
6. 如果循环因异常退出，`finally` 中的 `cancelAcquire(node)` 会把节点标记为 `CANCELLED` 并进行局部清理。

核心抓手是三个“不等于”：

- 入队不等于已经阻塞。
- 被唤醒不等于已经拿到锁。
- 只有 `tryAcquire` 成功，才真正完成获取。

#### Q6. Node 的 waitStatus 有哪几种状态？各自什么含义？

**标准回答：**

`Node.waitStatus` 用整数表示节点在等待队列中的协作状态，常见值有五种：

| 值 | 状态 | 含义 |
|---:|---|---|
| `-1` | `SIGNAL` | 当前节点的后继需要被通知；当前节点释放资源时必须唤醒后继 |
| `1` | `CANCELLED` | 节点已因中断、超时或异常取消，不再参与正常等待 |
| `-2` | `CONDITION` | 节点正在 Condition 条件队列中等待 |
| `-3` | `PROPAGATE` | 共享模式下的一次释放需要继续向后传播 |
| `0` | 默认值 | 初始状态，没有额外的通知或取消含义 |

需要分清的三个细节：

1. **入队节点的 `waitStatus` 初始是 0。**
2. **准备 park 时修改的是前驱节点的状态。** 线程在 `shouldParkAfterFailedAcquire(pred, node)` 中把 `pred.waitStatus` 从 `0` 或其他允许值 CAS 成 `SIGNAL`，表示“前驱释放时请唤醒我”。
3. **`SIGNAL` 是唤醒协议，不是线程自己的休眠标记。** 它建立“后继准备睡眠、前驱负责通知”的约定，避免释放发生时因为后继尚未 park 而漏掉唤醒。

`CONDITION` 节点被 `signal` 后，会从 Condition 条件队列转移到 AQS 同步队列尾部重新竞争，而不是直接在原条件队列中执行。

`PROPAGATE` 用于共享模式处理传播中的并发窗口：共享资源释放后，可能需要连续唤醒多个等待者；该状态用于避免唤醒信号在传播链上丢失。

#### Q7. addWaiter 入队时为什么要用 CAS 循环（enq 里 for(;;)）？一次 CAS 不行吗？

**标准回答：**

因为 `tail` 是多个线程共享的并发写位置，一次 CAS 可能因为别的线程先完成入队而失败。

`addWaiter` 先走快速路径：

```java
Node pred = tail;
if (pred != null) {
    node.prev = pred;
    if (compareAndSetTail(pred, node)) {
        pred.next = node;
        return node;
    }
}
enq(node);
```

这里的 `compareAndSetTail(pred, node)` 语义是：

> 如果 `tail` 仍然等于我读到的 `pred`，就把它改成 `node`。

如果读取 `tail` 和执行 CAS 之间，有其他线程先改变了尾部，CAS 就会失败。此时当前线程看到的尾部已经过期，必须重新读取最新 `tail`，重新设置 `node.prev`，再次尝试。

进入 `enq` 还有两类情况：

1. **队列尚未初始化。** 如果 `tail == null`，多个线程会竞争用 CAS 创建虚拟 `head`；失败者回到循环重新读取队列状态。
2. **快速路径 CAS 失败。** 说明尾部已经变化，需要用循环反复读取最新尾部并重试。

`enq` 中的 `for (;;)` 不是冗余步骤，而是 CAS 算法的标准重试结构：

```text
读取最新状态
  → 尝试 CAS
  → 成功：完成入队
  → 失败：状态已经变化，重新读取再试
```

一次 CAS 只有在“没有竞争、状态未被改变”时才成功。并发正确性不能依赖这种乐观假设，因此必须有失败重试路径。

这属于典型的 fast path / slow path 设计：无竞争时一次快速 CAS 完成；发生初始化竞争或尾部竞争时，进入循环慢路径保证正确。

#### Q8. acquireQueued 中 park 之后被 unpark 唤醒，为什么不能直接返回成功，还要继续自旋？

**标准回答：**

因为 **`unpark` 只代表等待线程重新获得运行机会，不代表它已经拿到资源**。

`acquireQueued` 的核心循环是：

```java
for (;;) {
    final Node p = node.predecessor();
    if (p == head && tryAcquire(arg)) {
        setHead(node);
        p.next = null;
        failed = false;
        return interrupted;
    }
    if (shouldParkAfterFailedAcquire(p, node) &&
        parkAndCheckInterrupt())
        interrupted = true;
}
```

被唤醒后必须继续自旋，原因包括：

1. **可能被非公平锁插队。** 新到达的线程可能直接 CAS 成功，等待线程恢复后再次抢锁仍会失败。
2. **可能只是中断唤醒。** `park` 会因中断返回，并不表示资源已经释放。
3. **唤醒不等于成功获取。** 必须重新满足 `p == head`，再次调用 `tryAcquire` 并成功，才算真正得到资源。
4. **前驱可能已经变化。** 取消节点可能被跳过，需要重新读取当前有效前驱。
5. **虚假唤醒需要重新检查条件。** 条件和资源状态都不能依赖“睡眠结束时自动成立”。

这里只有两个条件同时成立才返回：

```text
当前节点的前驱 == head
且
tryAcquire(arg) == true
```

成功后执行的 `setHead(node)` 也说明了语义变化：当前节点从“排队等待者”变成新的虚拟头节点。

`acquireQueued` 的死循环体现了“等待后重新检查条件”的监视器式语义。`park` 负责节省 CPU，循环负责保证并发正确性。

#### Q9. release 的流程是什么？为什么唤醒的是“后继节点”而不是自己队列里的？

**标准回答：**

独占模式释放的入口是：

```java
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

流程如下：

1. `tryRelease(arg)` 由子类实现，负责修改同步状态并判断资源是否已经完整释放。
2. 如果返回 `false`，说明资源尚未完全归还。以 `ReentrantLock` 为例，重入次数还未减到 0，因此不能唤醒后继。
3. 如果返回 `true`，读取当前虚拟头节点 `head`。
4. 当 `head != null && head.waitStatus != 0` 时，说明可能存在需要通知的后继，调用 `unparkSuccessor(head)`。
5. `unparkSuccessor` 先消费 `head` 的通知状态，然后通常唤醒 `head.next`；如果它为空或已取消，则从 `tail` 沿 `prev` 寻找最近的有效后继。

唤醒的不是 `head` 自己，原因是：

- `head` 是虚拟节点，代表当前已经取得资源的执行位置，不属于等待者。
- 需要被唤醒的是队列中的后继线程。
- 独占模式下只唤醒一个有效后继，由它重新竞争资源，而不是把全部等待者同时叫醒。

`unparkSuccessor` 返回后也不代表后继已经拿到锁。被唤醒线程仍需进入 `acquireQueued` 循环，再次通过 `tryAcquire` 成功，才能通过 `setHead` 成为新的虚拟头节点。

#### Q10. 为什么寻找后继节点时是从 tail 往前遍历（s = null 的情况），而不是从 head 往后？

**标准回答：**

因为入队时 `prev` 链先于 `next` 链建立。

`enq` 的尾部插入顺序是：

```text
node.prev = t;
compareAndSetTail(t, node);
t.next = node;
```

存在下面的瞬时状态：

```text
oldTail(t) --next--> 还未连到新节点
newNode --prev--> oldTail(t) 已经有效
tail == newNode
```

如果从 `head` 沿 `next` 向后搜索，可能因为最后一个 `next` 尚未写入而看不到刚入队的新节点；从 `tail` 沿 `prev` 向前搜索，`prev` 链已经完整，可以覆盖这段并发窗口。

`unparkSuccessor` 的兜底逻辑是：

```java
s = null;
for (Node t = tail; t != null && t != node; t = t.prev)
    if (t.waitStatus <= 0)
        s = t;
```

它的目标是找到：

> `head` 之后、离 `head` 最近的未取消等待节点。

遍历从尾部开始，每遇到有效节点就更新 `s`，最终留下的就是最靠前的有效后继。

所以反向遍历不是队列设计上的偏好，而是为了在 `next` 可能暂时断裂时仍能找到正确唤醒目标。

#### Q11. shouldParkAfterFailedAcquire 为什么要跳过 CANCELLED 状态的节点？prev 指针可能被修改吗？

**标准回答：**

`CANCELLED` 表示该节点已经放弃等待，没有资格继续作为有效前驱或唤醒链中的正常节点。常见原因包括超时、中断或异常退出。

在 `shouldParkAfterFailedAcquire` 中，如果发现前驱已取消：

```java
do {
    node.prev = pred = pred.prev;
} while (pred.waitStatus > 0);
pred.next = node;
```

这段代码会：

1. 沿 `prev` 向前跳过所有 `CANCELLED` 节点。
2. 找到最近的有效前驱。
3. 把当前节点的 `prev` 指向该有效前驱。
4. 把有效前驱的 `next` 重新接回当前节点。

因此 `prev` 指针确实会被修改。修改后的 `prev` 指向最近的有效前驱，被跳过的取消节点逐渐失去引用，等待 GC。

为什么必须跳过：

- 取消节点不会在资源释放时被正常唤醒。
- 前置节点可能由后继在其失败后完成清理。
- 如果继续把取消节点当成前驱，会破坏等待链上的唤醒关系。
- 跳过并重新连接后，链表恢复成由有效节点组成的等待链。

AQS 对取消节点采取惰性清理，主要发生在三个时机：

1. **`cancelAcquire`：** 节点主动取消时标记 `CANCELLED`，并调整尾部或中间指针。
2. **`shouldParkAfterFailedAcquire`：** 后继准备 park 前发现前驱取消，沿 `prev` 跳过并重接。
3. **`unparkSuccessor`：** 释放方唤醒后继时，如果直接后继为空或已取消，从 `tail` 反向寻找有效节点。

`CANCELLED` 的值是 `1`，不是 `SIGNAL` 的 `-1`。`SIGNAL(-1)` 表示“会通知后继”，`CANCELLED(1)` 表示“已经放弃等待”，两者语义完全相反。

这里还要区分两个范围：

- `shouldParkAfterFailedAcquire` 通常向前跳过**取消的前驱节点**。
- `unparkSuccessor` 从 `tail` 反向遍历，可以在 `next` 不完整时找到**最近的未取消后继节点**。

两者都在维护有效等待链，但承担的具体清理任务不同。

### 三、公平与唤醒机制层

#### Q12. 公平锁和非公平锁的区别体现在 AQS 的哪一行代码上？

**标准回答：**

差异不只在 `hasQueuedPredecessors()` 这一行，而要分两个竞争入口来看。

第一处是 `lock()` 入口：

```java
// NonfairSync.lock()
final void lock() {
    if (compareAndSetState(0, 1))
        setExclusiveOwnerThread(Thread.currentThread());
    else
        acquire(1);
}

// FairSync.lock()
final void lock() {
    acquire(1);
}
```

- 非公平锁在进入 AQS 前先直接 CAS，把 `state` 从 0 改成 1；成功就立即获得锁。这是第一次允许插队。
- 公平锁没有这一步，直接进入 `acquire(1)`，先遵守 AQS 的获取流程。

第二处是 `tryAcquire` 中锁空闲时的判断：

```java
// 公平锁
if (state == 0) {
    if (!hasQueuedPredecessors() &&
        compareAndSetState(0, acquires)) {
        setExclusiveOwnerThread(current);
        return true;
    }
}
```

- 公平锁在 `state == 0` 后会先调用 `hasQueuedPredecessors()`。如果同步队列中存在排在自己前面的有效线程，就不允许 CAS 抢锁。
- 非公平锁的 `nonfairTryAcquire` 没有这个队列前驱判断，锁空闲时可以直接 CAS。这是第二次插队机会。
- 当前线程本来就是锁持有者时，公平锁和非公平锁都执行重入计数增加，这部分逻辑相同。

所以完整回答是：**非公平锁可能在 `lock()` 入口直接 CAS，也可能在 `tryAcquire` 中直接 CAS；公平锁则通过 `hasQueuedPredecessors()` 判断同步队列中是否有前辈等待者，有则不能插队。**

公平性也应当说是“尽量遵循 FIFO”，而不是绝对严格公平：队列线程被唤醒后仍可能与已经正在尝试获取的线程发生竞争。

#### Q13. 为什么默认都设计成非公平锁？非公平锁的好处是什么？有什么代价？

**标准回答：**

默认采用非公平锁，核心目标是提高吞吐量，而不是追求严格的到达顺序。

非公平锁的优势：

1. **允许新线程直接 CAS 抢空闲锁。** 如果锁正好空闲，新线程可以在用户态一次 CAS 成功，不必经历入队、park、唤醒、重新竞争。
2. **减少挂起和唤醒。** 临界区通常较短，当前持有者可能很快释放；让新线程直接获取，往往比先把 CPU 让出去、再唤醒队首线程更划算。
3. **减少上下文切换和调度延迟。** 线程真正 park 后会离开 CPU 运行队列，唤醒又需要调度器重新选择，成本明显高于短时间内的用户态竞争。
4. **整体吞吐更高。** 允许局部插队虽然打破 FIFO，但能够提高系统整体推进速度。

代价是：

- 排队的线程可能被不断到来的新线程插队。
- 在高并发、临界区较长、线程持续到达的极端情况下，队列线程可能长时间得不到资源，出现线程饥饿。
- 公平锁让等待顺序更可预测，但在高竞争时通常需要更多挂起、唤醒和上下文切换，吞吐量更低。

在常见业务中，临界区通常较短，新线程取得锁后也会很快释放，因此严重饥饿并不常见。JUC 默认优先选择吞吐量，需要公平顺序时再显式使用公平锁，例如 `new ReentrantLock(true)`。

这里不要把差距理解成固定 benchmark：具体性能取决于竞争程度、临界区长度、CPU 数量和调度行为。稳定结论是：**非公平锁用顺序公平性换取更少的等待开销和更高吞吐。**

#### Q14. Condition 的 await/signal 和 Object 的 wait/notify 有什么区别？Condition 队列和同步队列是什么关系？

**标准回答：**

先建立正确的队列模型：

| 线程状态 | 所在位置 |
|---|---|
| 正在持有锁并执行 | 不在同步队列；`head` 只是当前持锁位置的虚拟占位 |
| 获取锁失败、等待竞争锁 | AQS 同步队列 |
| 调用 `await()` 后等待条件成立 | Condition 条件队列 |
| 被 `signal()` 后重新等待锁 | 从 Condition 队列转移到同步队列尾部 |

`await()` 并不是“把线程已有的同步队列节点搬到 Condition 队列”。调用 `await()` 时，当前线程已经持有锁，本身不在同步队列里；它会新建一个 `CONDITION` 节点放入对应 Condition 的条件队列。

可以把核心过程简化为：

```java
Node node = addConditionWaiter();       // 新建节点，加入 Condition 队列
int savedState = fullyRelease(node);    // 完全释放锁，并记录原 state
while (!isOnSyncQueue(node))
    LockSupport.park(this);             // 等待 signal
acquireQueued(node, savedState);        // 回到同步队列，重新抢锁
```

关键点如下：

1. **一个 Lock 可以创建多个 Condition。** 每个 Condition 都有独立的条件队列，可以分类精确唤醒，例如有界队列把 `notFull` 和 `notEmpty` 分开。
2. **`await()` 会一次性完全释放锁。** `fullyRelease` 会把 `state` 释放到 0，而不是简单减 1。`savedState` 记录原来的重入深度，重新抢到锁后通过 `acquireQueued(node, savedState)` 恢复。
3. **`signal()` 会做队列转移。** 它选择一个有效 Condition 等待节点，把其状态从 `CONDITION` 改成 0，再通过 `enq` 加入同步队列尾部。
4. **`signal()` 可能伴随 `unpark`。** 如果同步队列前驱已经取消，或者无法把前驱状态 CAS 成 `SIGNAL`，会直接 `unpark(node.thread)`；否则由前驱在释放锁时负责唤醒。
5. **被唤醒不等于获得锁。** 节点只是从 Condition 队列进入同步队列，还要和多线程一起竞争；抢到锁后 `await()` 才能返回。
6. **`await()` 必须放在 `while` 循环中。** 可能出现虚假唤醒，也可能从收到 signal 到重新抢到锁之间，条件被其他线程再次改变：

```java
lock.lock();
try {
    while (!condition) {
        condition.await();
    }
    // 条件真正成立
} finally {
    lock.unlock();
}
```

与 `Object.wait/notify` 的主要区别：

| 维度 | `Object.wait/notify` | `Condition.await/signal` |
|---|---|---|
| 条件队列数量 | 一个 Monitor 对应一组等待结构 | 一个 Lock 可创建多个独立 Condition 队列 |
| 唤醒选择 | `notify` 从等待者中选择一个，选择不透明 | `signal` 通常选择该 Condition 队列中的首个有效等待者 |
| 锁释放 | `wait` 完全释放 Monitor | `await` 通过 `fullyRelease` 完全释放 Lock，并保存重入深度 |
| 唤醒后 | 重新竞争 Monitor | 从 Condition 队列转移到同步队列后重新竞争 Lock |
| 重新检查条件 | 必须使用 `while` | 同样必须使用 `while` |
| 扩展能力 | 原生只支持等待超时 | 支持超时、不可中断等待及多个条件队列 |

因此两者在“释放锁等待条件、被通知后重新获取锁并复查条件”的监视器语义上相近；Condition 的核心增强是**多个独立条件队列和可控唤醒**。

#### Q15. await 之前必须持有锁吗？为什么？signal 之后线程会立刻继续执行吗？

**标准回答：**

必须先持有锁。`await()` 和 `signal()` 都会检查当前线程是否独占持有该锁，不满足时抛 `IllegalMonitorStateException`。

必须持锁不只是语法约束，而是为了避免丢失唤醒：

```text
持锁检查条件“不满足”
  → 新建节点加入 Condition 队列
  → fullyRelease 释放锁
  → park 挂起
```

节点入 Condition 队列必须发生在释放锁之前。这样另一个线程获得锁并调用 `signal()` 时，一定能够看到已经登记的等待节点。

`signal()` 没有 `unpark` 那样的许可预存机制：

```java
public final void signal() {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    Node first = firstWaiter;
    if (first != null)
        doSignal(first);
}
```

如果条件队列为空，`signal()` 直接返回，不会保存一个“以后再消费”的信号。

另外，`signal()` 不会释放调用方当前持有的锁，也不会把锁直接交给被通知线程。它的作用只是登记“该线程可以进入下一轮锁竞争”。

所以“持锁先 `signal()`，再 `await()`”不能当作许可预存：

```java
lock.lock();
try {
    condition.signal(); // 条件队列为空，等于空操作
    condition.await();  // 之后仍可能一直等待下一次 signal
} finally {
    lock.unlock();
}
```

正确的无丢失顺序是：

```text
消费者持有锁
  → 检查条件不满足
  → 新建节点加入 Condition 队列
  → 完全释放锁

生产者随后获得锁
  → 修改共享状态
  → signal
  → 将消费者节点转移到同步队列
  → 消费者被通知，重新竞争锁
  → 抢到锁后从 await 返回
  → 在 while 中重新检查条件
```

即使 `signal` 发生在消费者真正 `park` 之前，节点也已经位于 Condition 队列，因此不会“扑空”；节点被转移到同步队列后，`await` 的 `while (!isOnSyncQueue(node))` 也会观察到状态变化。

`signal()` 后线程不会立刻继续执行：

1. `signal` 只是把节点转移到同步队列尾部。
2. 接受到通知的线程仍需和其他等待锁的线程竞争。
3. 只有重新获得锁后，`await` 才能返回。
4. 返回后还要在 `while` 中重新检查条件，因为从 signal 到真正获得锁之间，条件可能再次变化。

与 `Object.notify` 相比，Condition 的一个优势是唤醒目标更可控：`signal` 选择对应条件队列中的有效等待者，而不是从所有 Monitor 等待者中选择一个。这样生产者可以只通知等待“非空”的消费者，避免把所有线程同时唤醒。

### 四、共享模式层

#### Q16. 共享模式 acquireShared 和独占模式的核心区别是什么？

**标准回答：**

共享模式和独占模式复用同一套 AQS 机制，都依赖 `state`、CAS、同步队列、`park/unpark` 和获取失败后的重试。核心区别可以从三个层面回答：

1. **方法签名和返回值不同。** 独占模式使用 `acquire/release`，子类实现 `tryAcquire/tryRelease`；共享模式使用 `acquireShared/releaseShared`，子类实现 `tryAcquireShared/tryReleaseShared`。`tryAcquireShared` 返回 `int`：负数是获取失败，`0` 是获取成功但当前不再传播，正数是获取成功且还有剩余资源，可以继续传播。

2. **获取成功后的行为不同。** 独占模式成功后执行 `setHead(node)`，唤醒链通常到此结束；共享模式执行 `setHeadAndPropagate(node, remain)`。只要还有剩余资源，或者旧 `head`、新 `head` 的状态需要继续传播，就调用 `doReleaseShared()` 唤醒后面的共享节点。

3. **传播边界不同。** 共享模式只会沿着共享节点继续传播，遇到独占节点就停止。这也是 `ReentrantReadWriteLock` 能将多个读锁等待者连续放行，同时保证写锁仍独占获取的基础。

```java
int r = tryAcquireShared(arg);
if (r >= 0) {
    setHeadAndPropagate(node, r);
    // 获取成功
} else {
    // 获取失败，进入同步队列等待
}
```

因此，独占模式关注“谁获得了唯一资源”，共享模式关注“当前资源还能放行多少共享等待者”。共享模式最本质的特征是：**获取成功后根据剩余资源和节点状态向后传播唤醒，而不是只唤醒一个节点就结束。**

#### Q17. PROPAGATE(-3) 状态是解决什么问题的？

**标准回答：**

先把适用版本说清楚：

> `PROPAGATE` 是经典 AQS 实现中用于修复共享模式“传播唤醒丢失”的状态，典型源码见 JDK 8。JDK 21 的 AQS 已重构为 `WAITING` 状态和 `signalNext` 等实现。面试回答当前版本时，应先说明讨论的是经典 `Node.waitStatus` 实现，再讲 `PROPAGATE` 解决的并发时序问题。

它解决的核心问题是：

> 多个线程并发释放共享资源时，每个释放线程都可能误以为另一个线程已经负责传播唤醒，结果一个有效共享等待者重新睡下，而后面的共享线程没有被继续唤醒。

这里要区分两类事件：

- `tryReleaseShared` 增加共享资源，只表示“资源状态变了”。
- `unparkSuccessor` 或 `doReleaseShared` 负责通知后继，只表示“给它一次重新竞争的机会”。

`unpark` 不是把资源直接交付给被唤醒线程，被唤醒线程仍要执行 `tryAcquireShared`，失败就可能在同步队列中重新 park。

### 经典竞态时序

假设使用共享同步器，队列为 `head(H) -> T1 -> T2`，T1 已 park，`H.waitStatus == SIGNAL(-1)`。

```text
R1：首次释放
  ① R1 调用 releaseShared
  ② tryReleaseShared 增加可用资源
  ③ doReleaseShared 把 H.ws 从 SIGNAL 改成 0
  ④ unpark(T1)

N：新线程插队
  ⑤ N 直接 tryAcquireShared 成功，把 R1 释放的资源抢走

T1：被唤醒后竞争
  ⑥ T1 从 park 返回，调用 tryAcquireShared
  ⑦ 资源又被 N 取走，返回负数，获取失败
  ⑧ T1 尚未 setHead，仍在 H 后面

R2：再次释放
  ⑨ R2 调用 releaseShared
  ⑩ tryReleaseShared 再次增加可用资源
  ⑪ R2 进入 doReleaseShared，此时读取 H.ws == 0
  ⑫ 如果没有 PROPAGATE 分支，R2 不会再发出唤醒，直接结束

T1：重新准备睡眠
  ⑬ T1 执行 shouldParkAfterFailedAcquire，把 H.ws 从 0 改成 SIGNAL
  ⑭ T1 再尝试一次仍失败，随后 park

最终：
  state 中 R2 释放的资源仍可用
  T1 已重新睡眠
  T2 仍未被通知
  如果之后没有新的 release，等待链就可能长期停滞
```

这里有两个必要的时间约束：

1. R2 读取 `H.waitStatus` 时，必须晚于 R1 把它清零，早于 T1 把它重新设置成 `SIGNAL`。
2. T1 的获取尝试必须没有拿到 R2 释放的那份资源，否则它成功后会直接结束等待。

注意 T1 并没有“重新入队”。它本来就在同步队列中，只是从未成功执行 `setHead`。准确说法是“T1 重新进入 `shouldParkAfterFailedAcquire → park` 的等待路径”。

### 为什么 `waitStatus == 0` 无法表达“已经传播”

`SIGNAL` 表示“后继需要通知”；`0` 只是没有这类通知预约。但 `0` 同时可能代表两种完全不同的情况：

- 实际上已经有人通知过后继，当前不需要重复通知。
- 一个新的共享释放已经发生，但通知责任还没有被任何线程接住。

如果释放方只看到 `0` 就退出，它无法区分这两种情况。`PROPAGATE` 的作用就是在这个中间态留下一个明确的“还需要重新检查并继续传播”标记。

### 经典 `doReleaseShared` 的修复代码

```java
private void doReleaseShared() {
    for (;;) {
        Node h = head;
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            if (ws == Node.SIGNAL) {
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;
                unparkSuccessor(h);
            } else if (ws == 0 &&
                       !compareAndSetWaitStatus(h, 0, Node.PROPAGATE)) {
                continue;
            }
        }
        if (h == head)
            break;
    }
}
```

这段代码有两种关键分支：

1. `SIGNAL`：先把状态 CAS 成 `0`，再唤醒后继。
2. `0`：不能直接视为“无需处理”，而是 CAS 成 `PROPAGATE(-3)`，留下传播请求。

`compareAndSetWaitStatus` 失败后要重试，因为 `head` 或状态可能正被其他线程修改。

### `PROPAGATE` 如何救回 T1

在上面的时序中，R2 看到 `H.ws == 0` 后会尝试：

```text
CAS(H.ws: 0 → PROPAGATE(-3))
```

接下来有两种主要交错：

```text
如果 R2 先成功：
  H.ws = -3
  → T1 尝试把 H.ws 从 0 改成 SIGNAL 时 CAS 失败
  → shouldParkAfterFailedAcquire 返回 false
  → T1 被强制再自旋一轮
  → 重新调用 tryAcquireShared，有可能看到新资源并成功获取

如果 T1 先成功：
  H.ws = SIGNAL(-1)
  → R2 读到 -1
  → R2 走 SIGNAL 分支，清除状态并唤醒 T1
```

所以 `PROPAGATE` 的价值不是“多叫醒一次”这么简单，而是把 **“状态为 0、传播责任不明”** 转换成一个后续线程可以观察和接手的明确信号。

这里不需要把 `PROPAGATE` 说成“发给每个线程的许可”。它不是资源，也不是线程个人状态，而是 `head` 上关于“共享释放传播尚未安全结束”的协作标记。

### 第二个检查点：`setHeadAndPropagate`

如果 T1 稍后成功获取并成为新的 `head`，`setHeadAndPropagate` 还会检查传播请求：

```java
private void setHeadAndPropagate(Node node, int propagate) {
    Node h = head;
    setHead(node);
    if (propagate > 0 || h == null || h.waitStatus < 0 ||
        (h = head) == null || h.waitStatus < 0) {
        Node s = node.next;
        if (s == null || s.isShared())
            doReleaseShared();
    }
}
```

三个触发来源：

- `propagate > 0`：本次获取返回还有剩余资源，可以直接继续传播。
- 旧 `head` 的 `waitStatus < 0`：并发释放方已经在旧 `head` 上留下 `PROPAGATE` 或 `SIGNAL` 状态。
- 新 `head` 的 `waitStatus < 0`：完成 `setHead` 后，另一个释放方又在新 `head` 上留下传播请求。

源码注释强调使用符号判断 `waitStatus < 0`，而不是只判断是否恰好等于 `PROPAGATE`，因为 `PROPAGATE` 可能被后续操作转换成 `SIGNAL`。只要仍是负值，就表示还有传播义务需要检查。

通过条件后还会检查后继：

```java
if (s == null || s.isShared())
    doReleaseShared();
```

如果后继明确是共享节点，就继续传播；后继为 `null` 时采取保守策略，允许额外检查。后续如果明确遇到独占节点，就不再越过它传播共享唤醒。

### 与“唤醒丢失”的关系

`PROPAGATE` 修复的问题与 `Condition` 的 `signal` 丢失唤醒相似，但发生位置不同：

| 场景 | 等待者 | 通知者 | 漏掉的通知 |
|---|---|---|---|
| `Condition` | Condition 队列节点 | `signal` | 队列为空时先发信号，没有许可预存 |
| `PROPAGATE` | AQS 共享同步队列节点 | `doReleaseShared` | 多个释放方都认为另一方会继续传播 |

两者都属于“通知发生时责任归属不明”的问题，但 `PROPAGATE` 是共享队列内部的传播状态，不是 `Condition` 队列的许可。

### 面试时的回答顺序

1. 先说明这是经典 AQS 的 `waitStatus` 机制，当前 JDK 已重构。
2. 讲释放共享资源与唤醒线程不是同一件事。
3. 用 `R1 清零 → N 抢走资源 → T1 醒来失败 → R2 看到 0 → T1 重睡` 的时序说明传播责任丢失。
4. 指出 `ws == 0` 的歧义，解释 `PROPAGATE(-3)` 如何留下接力标记。
5. 补充 `setHeadAndPropagate` 对旧、新 `head` 的负状态检查，以及后继共享检查。
6. 最后说明其目的：保证多个并发 release/acquire 下，共享等待链不会因为“双方互相谦让”而永久停滞。

一句话概括：

> **`PROPAGATE` 是经典 AQS 中共享释放的传播接力标记：当 `head.waitStatus == 0` 使释放方无法确认是否还有传播责任时，用 `-3` 登记这笔责任，让后续获取或释放线程继续检查并唤醒共享后继。**

#### Q18. 用 AQS 实现一个简单的一次性门闩（类似 CountDownLatch），你只需要重写哪些方法？

**标准回答：**

只需要重写两个共享模式钩子：

1. `tryAcquireShared(int acquires)`
2. `tryReleaseShared(int releases)`

排队、`park/unpark`、中断处理和共享传播都由 AQS 的模板方法负责，不需要自己实现。

对于一次性门闩，`state` 表示**尚未完成的计数**：

- `state == 0`：门已经打开，`tryAcquireShared` 返回非负数，获取成功。
- `state > 0`：门还没有打开，`tryAcquireShared` 返回负数，获取失败并进入同步队列。
- `tryReleaseShared`：通过 CAS 将 `state` 减 1，只有减到 `0` 时返回 `true`，触发 `doReleaseShared()` 放行等待线程。

```java
class OneShotLatch extends AbstractQueuedSynchronizer {
    OneShotLatch(int count) {
        if (count < 0)
            throw new IllegalArgumentException("count < 0");
        setState(count);
    }

    @Override
    protected int tryAcquireShared(int acquires) {
        return getState() == 0 ? 1 : -1;
    }

    @Override
    protected boolean tryReleaseShared(int releases) {
        for (;;) {
            int c = getState();
            if (c == 0)
                return false;

            int next = c - 1;
            if (compareAndSetState(c, next))
                return next == 0;
        }
    }

    public void await() throws InterruptedException {
        acquireSharedInterruptibly(1);
    }

    public void countDown() {
        releaseShared(1);
    }
}
```

关键点：

1. `tryReleaseShared` 必须使用 CAS 循环，因为多个线程可能并发调用 `countDown()`。
2. 只有计数从正数减到 `0` 时才返回 `true`，AQS 据此触发共享唤醒传播。
3. `state` 已经为 `0` 时再次 `countDown()` 直接返回 `false`，保证幂等且不会减成负数。
4. `await()` 和 `countDown()` 只是转发到 AQS 模板方法，真正的同步语义只由两个 `try...` 方法定义。
5. 这种语义与 `Semaphore` 恰好不同：`Semaphore` 的 `state` 是剩余许可数，通常 `state > 0` 才获取成功；`CountDownLatch` 的 `state` 是剩余计数，只有 `state == 0` 才获取成功。

这就是 `CountDownLatch` 的核心实现方式：**用共享模式等待 `state` 归零，归零后一次性放行所有等待线程。**

### 五、源码细节与陷阱层

#### Q19. 为什么 AQS 队列的头节点（head/dummy 节点）是“虚拟”的？setHead 时为什么要置空 thread 和 prev？

**标准回答：**

`head` 同时承担两个角色：

1. **队列锚点。** 每个等待节点都通过 `prev` 指向其前驱，最终追溯到 `head`；后继判断和获取资格都以 `head` 为基准。
2. **当前资源已获取位置的占位符。** `head` 代表“队列从这里之前不需要再等”，但不代表一个正在排队等待的线程。

队列第一次初始化时，`enq` 调用 `compareAndSetHead(new Node())` 创建虚拟节点。这个节点的 `thread` 本来就是 `null`，并不是某个真实线程的节点。

执行 `acquireQueued` 时，节点只有获取成功后才执行 `setHead(node)`：

```java
private void setHead(Node node) {
    head = node;
    node.thread = null;
    node.prev = null;
}
```

调用方还会断开旧头节点的 `next`：

```java
p.next = null; // help GC
```

这里有三层原因。

#### 19.1 持锁线程不需要继续留在等待队列

等待节点保存 `thread`，主要目的是让释放线程能够找到并 `unpark` 它。节点获取成功后已经成为 `head`，不再需要被后来的释放方唤醒，因此清空 `thread` 是合理的语义变化。

这也是理解 Condition 的关键前提：

- 持锁并运行的线程不在同步队列中等待。
- 获取失败的线程才进入同步队列。
- `head` 只是表示“当前获取位置”的虚拟占位节点。

#### 19.2 避免长期持有线程对象

如果 `head.thread` 一直保留引用，虚拟头节点就会持续强引用那个线程及其对象图。线程结束或线程池复用线程时，这种残留引用既影响回收，也可能让诊断工具把旧线程误认为仍在等待链中。

`node.thread = null` 表示：**当前 `head` 不再指向任何等待线程。**

#### 19.3 双向断开旧节点

获取成功后会形成如下变化：

```text
获取前：
oldHead(p) <-> node(current) <-> next

获取后：
oldHead(p)  X  node(current) <-> next
                 ^
                head
```

- `node.prev = null`：新 `head` 不再指回旧头。
- `oldHead.next = null`：旧头不再指向新头。
- `oldHead.thread` 原本通常已经为空，旧节点失去可达路径后成为 GC 候选。

`setHead` 不需要 CAS，因为只有成功执行 `tryAcquire` 的那个线程会调用它；此时它已经取得了资源，头节点更新由该线程独占完成。并发修改 `tail` 需要 CAS，但推进 `head` 的这一步不需要。

一句话：**`head` 是已经取得资源的位置，不是某个还在等待的节点；清空 `thread` 表示它退出等待身份，清空 `prev` 并断开旧 `next` 则同时简化队列语义和 GC。**

#### Q20. parkAndCheckInterrupt 里为什么先 park 后检查中断？线程被中断唤醒后为什么返回 Thread.interrupted() 并在 acquire 里清除？

**标准回答：**

先看核心代码：

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);
    return Thread.interrupted();
}
```

### 为什么先 park

`park` 是线程进入等待动作，中断是导致它提前返回的事件之一。必须先尝试阻塞，返回后才能检查这次返回是不是由中断引起。

`park` 返回并不只有一种原因：

- 正常的 `unpark`。
- 线程被中断。
- 虚假唤醒或其他平台级唤醒。

因此 `parkAndCheckInterrupt` 不能假定“醒来就是拿到资源”，它只负责返回“等待期间是否发生过中断”。

### 为什么调用 Thread.interrupted()

`Thread.interrupted()` 与 `isInterrupted()` 的区别是：

- `Thread.interrupted()`：读取当前中断标志，随后**清除**它。
- `isInterrupted()`：只读取，不清除。

这里使用 `Thread.interrupted()` 有两层作用：

1. 把本次 park 因中断返回的事件转换为一个局部布尔值。
2. 清除已经观察和记录过的中断标志，避免在等待循环中反复因同一个中断唤醒、造成空转。

`acquireQueued` 外层接着记录：

```java
if (shouldParkAfterFailedAcquire(p, node) &&
    parkAndCheckInterrupt())
    interrupted = true;
```

中断不会让不可中断的 `acquire` 退出等待，线程会继续回到循环中尝试获取资源。

### 为什么 acquire 最后还要 selfInterrupt

如果只清除标志而不恢复，调用方会失去“等待期间曾被中断”的事实。因此 `acquire` 在成功获取后执行：

```java
if (!tryAcquire(arg) &&
    acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
    selfInterrupt();
```

`selfInterrupt()` 重新设置中断标志：

```java
static void selfInterrupt() {
    Thread.currentThread().interrupt();
}
```

这就是“延迟响应中断”：

```text
park 因中断返回
  → Thread.interrupted() 检测并清除标志
  → interrupted = true
  → 继续排队、继续 tryAcquire
  → 成功获取后 selfInterrupt()
  → 调用方仍能观察到中断状态
```

不能简单说“acquire 忽略中断”。更准确的说法是：**`acquire` 不把中断作为放弃获取的条件，但会保留并补偿中断事实。**

需要立即响应中断时，应使用 `lockInterruptibly()` 或 `tryLock(timeout)` 背后的可中断获取流程。

#### Q21. lockInterruptibly 和 lock 在 AQS 流程上有什么不同？

**标准回答：**

两者复用同一套同步队列、状态检查和 park 机制，核心差异在获取失败并进入等待之后，如何处理中断。

### lock()

`ReentrantLock.lock()` 最终沿不可中断流程获取：

```text
lock()
  → acquire(1)
  → tryAcquire 失败
  → acquireQueued
  → parkAndCheckInterrupt
```

等待期间检测到中断时：

- 记录 `interrupted = true`；
- 清除 park 返回时观察到的一次中断标志；
- 继续排队和竞争；
- 获取成功后再执行 `selfInterrupt()`，恢复中断状态。

所以 `lock()` 是**不可中断获取**：线程被中断不会抛 `InterruptedException`，也不会主动取消获取。

### lockInterruptibly()

`lockInterruptibly()` 最终调用 `acquireInterruptibly(1)`，等待路径对应 `doAcquireInterruptibly`：

```java
if (shouldParkAfterFailedAcquire(p, node) &&
    parkAndCheckInterrupt())
    throw new InterruptedException();
```

这里关键区别是：

| 维度 | `lock()` | `lockInterruptibly()` |
|---|---|---|
| 等待期间中断 | 记录中断，继续等待 | 立即结束等待并抛异常 |
| 异常签名 | 不抛受检异常 | 抛 `InterruptedException` |
| 等待节点清理 | 获取成功或异常退出时处理 | 中断抛出时由 `finally` 执行 `cancelAcquire` |
| 设计用途 | 必须完成的互斥操作 | 可取消、可退出的长等待操作 |

`doAcquireInterruptibly` 的异常路径进入 `finally` 后，会调用 `cancelAcquire(node)`：

- 标记当前节点 `CANCELLED`；
- 必要时调整队列连接；
- 让后续线程能够跳过这个失效节点。

因此中断获取会在等待链中留下一个取消节点，再由后续队列操作惰性清理。这与 Q11 的取消节点处理衔接。

### 另一个容易忽略的语义差异

- `lockInterruptibly()` 要求调用方显式处理 `InterruptedException`，但允许在长期等待时响应取消。
- `lock()` 的中断会被延迟到获取成功后体现，调用方检查中断标志再决定后续动作，因此适合“必须拿到锁才能完成状态变更”的临界区。

选型核心不是谁性能更好，而是：**中断应当作为一次可取消的退出信号，还是只作为需要保留的附带事件。**

#### Q22. tryLock() 超时版本在自旋里怎么计算剩余时间？高并发下有什么坑？

**标准回答：**

以 `doAcquireNanos` 为例，超时获取的核心结构是：

```java
final long deadline = System.nanoTime() + nanosTimeout;

for (;;) {
    final Node p = node.predecessor();

    if (p == head && tryAcquire(arg)) {
        setHead(node);
        p.next = null;
        failed = false;
        return true;
    }

    nanosTimeout = deadline - System.nanoTime();

    if (nanosTimeout <= 0L)
        return false;

    if (shouldParkAfterFailedAcquire(p, node) &&
        nanosTimeout > spinForTimeoutThreshold)
        LockSupport.parkNanos(this, nanosTimeout);
}
```

### 剩余时间如何计算

1. 进入等待前计算一次绝对截止时间：

   ```java
   deadline = System.nanoTime() + nanosTimeout;
   ```

2. 每次被唤醒或自旋一轮后，重新计算：

   ```java
   nanosTimeout = deadline - System.nanoTime();
   ```

3. 剩余时间小于等于 0 时直接失败：

   ```java
   if (nanosTimeout <= 0L)
       return false;
   ```

4. 剩余时间还足够时，用剩余时间等待：

   ```java
   LockSupport.parkNanos(this, nanosTimeout);
   ```

因此不是一个固定的“再睡一轮”，而是每一轮都根据绝对 deadline 重新计算还能等多久。

### 为什么使用 nanoTime

`System.currentTimeMillis()` 会受到系统墙钟调整影响；`System.nanoTime()` 提供适合计算经过时间的单调时间源，更适合实现相对超时。

即使如此，不同平台和 CPU 核心上仍可能存在精度和可见性差异，因此通常把它作为高精度等待机制，而不是绝对精确的业务定时器。

### 短超时为什么可能不 park

源码中还有：

```java
nanosTimeout > spinForTimeoutThreshold
```

如果剩余时间已经非常短，就不值得执行一次 `parkNanos`。park/unpark 本身有调度和系统调用成本，可能比剩余等待时间还长，因此直接自旋到超时判断点更划算。

### 超时是一次性退出

这是本题最容易被答错的地方：

> 一次 `tryAcquireNanos` 调用超时后，会直接返回 `false`，并在 `finally` 的失败路径中调用 `cancelAcquire`，不会在 AQS 内部继续等待“下一个超时点”。

```text
超过 deadline
  → return false
  → finally: failed == true
  → cancelAcquire(node)
  → tryLock 调用结束
```

调用方收到 `false` 后，是否需要再次尝试，由应用代码自行决定。

### 高并发下真正要关注的问题

#### 1. 集中超时唤醒

如果大量线程使用相同或相近的超时时间，它们的截止时间可能集中在同一时段，随后同时醒来、同时自旋、同时尝试 CAS `state`。

单次调用只会产生一次集中竞争：

```text
大量 parkNanos 在同一时段到期
  → 多个线程同时醒来
  → 一个可能获取成功
  → 其余发现超过 deadline
  → return false 并取消节点
```

AQS 内部不会让失败线程自动进入下一轮超时等待。

如果调用方写成立即重试：

```java
while (!lock.tryLock(10, TimeUnit.MILLISECONDS)) {
    // 立即再次尝试
}
```

那么宏观上会出现周期性的唤醒和竞争压力，但这主要来自调用方的重试策略。合理的做法是按业务实际情况退避、加入抖动、减少无意义轮询，或改成长等待加取消机制。

#### 2. 取消节点集中产生

超时失败的每个节点都需要取消。AQS 对 `CANCELLED` 节点采取惰性清理：

- `cancelAcquire` 标记节点失效并调整必要链接；
- `shouldParkAfterFailedAcquire` 遇到取消前驱时跳过；
- `unparkSuccessor` 必要时从 `tail` 反向寻找有效后继。

大量同时超时会集中生成失效节点，增加遍历和链维护成本。如果这些节点未被及时经过清理，还可能让队列长度虚高，给诊断和性能分析造成干扰。

#### 3. 时间源和调度误差

需要表述得准确：

- 读取 `System.nanoTime()` 有开销，频繁自旋时会产生额外成本。
- `parkNanos` 只保证“至少等待这么久”的下限，操作系统调度可能延迟返回。
- 因此真正返回时，线程可能已经超过 deadline，需要再次检查后才能决定是否继续等待。

不要夸大成“高并发下 nanoTime 一定导致提前超时”；更准确的说法是：在极端并发和平台差异下，时间计算、线程调度和自旋开销都会影响超时边界和吞吐表现。

### 回答主线

可以用四句话总结：

1. `doAcquireNanos` 第一次计算绝对 deadline。
2. 每次醒来后重新用 `deadline - nanoTime` 计算剩余时间。
3. 剩余时间归零就返回 `false`，失败路径执行 `cancelAcquire`，不会自动开始下一轮超时等待。
4. 高并发的主要风险是集中超时唤醒、集中取消节点和调用方立即重试造成的竞争压力，而不是 AQS 内部自组织的周期性惊群。

### 六、扩展对比层

#### Q23. AQS 和 synchronized（Monitor）的本质区别是什么？

**标准回答：**

本质区别可以分三层：实现机制、能力边界和设计定位。

#### 23.1 实现机制

| 维度 | `synchronized` | AQS 系同步器 |
|---|---|---|
| 归属层次 | JVM 内置同步机制 | JDK/JUC 中的 Java 同步器框架 |
| 核心状态 | 对象头 Mark Word + `ObjectMonitor` | `volatile int state` + CLH 变种队列 |
| 阻塞机制 | 竞争激烈时进入 Monitor 和操作系统同步原语 | `LockSupport.park/unpark`，必要时进入系统级等待 |
| 获取主体 | 关键字和对象 | 子类通过模板钩子定义资源语义 |
| 锁状态模型 | 轻量级锁、重量级锁等 JVM 管理状态 | 没有统一“锁升级”模型，状态语义交给子类 |

`synchronized` 的进入和退出由 JVM 和对象 Monitor 管理；AQS 不知道 `state` 的具体业务含义，它只负责提供排队、阻塞、唤醒和重试的通用框架。

需要补充一个版本细节：旧版 JDK 的锁升级常被描述为“无锁 → 偏向锁 → 轻量级锁 → 重量级锁”，但偏向锁已在 JDK 15 废弃、JDK 18 移除。当前 JDK 不应再把偏向锁说成默认路径。

#### 23.2 能力差异

| 能力 | `synchronized` | `ReentrantLock` 等 AQS 同步器 |
|---|---|---|
| 可中断获取 | 不提供 | `lockInterruptibly()` |
| 超时获取 | 不提供 | `tryLock(timeout)` |
| 公平性选择 | 非公平竞争 | 可选择公平或非公平 |
| 多个条件队列 | 一个 Monitor 等待结构 | 多个独立 `Condition` |
| 共享模式 | 不支持 | 支持 `Semaphore`、`CountDownLatch` 等 |
| 自定义同步语义 | 语言层不可扩展 | 继承 AQS、实现模板钩子 |
| 释放方式 | 异常自动释放 | 通常需要 `finally` 中显式 `unlock()` |

AQS 的灵活性不只体现在“功能更多”，更体现在它能表达与互斥锁完全不同的同步语义。例如 `CountDownLatch` 的“获取”只是等待 `state == 0`，并不像锁那样占用一个独占资源。

#### 23.3 设计定位

`ReentrantLock` 是基于 AQS 的具体产品，AQS 是构建同步器的框架。

- `synchronized` 适合普通互斥、临界区较短、无需高级取消和条件分离的场景。它语法简单，异常路径也能自动释放锁。
- AQS 系同步器适合需要公平性、超时、可中断、多条件、共享放行或自定义同步语义的场景。

不要把 Q23 简化成“AQS 比 synchronized 快”。现代 JDK 下，无竞争和轻竞争路径都可能主要由用户态 CAS 完成；真正需要阻塞时，两者都要依赖操作系统调度。选型重点应是语义和可维护性，而不是一句固定的性能排名。

一句话概括：

> **`synchronized` 是 JVM 提供的内置锁“产品”，AQS 是构建锁和其他同步器的 Java“框架”；前者用简单换便利，后者用扩展能力换显式控制。**

#### Q24. ReentrantReadWriteLock 是怎么用一个 state 同时表示读锁和写锁的？

**标准回答：**

`ReentrantReadWriteLock` 把一个 32 位 `int state` 拆成两个 16 位计数区：

```text
高 16 位：读锁持有计数，允许多个读者共享
低 16 位：写锁重入计数，写锁独占
```

它的核心位运算常量可以概括为：

```java
static final int SHARED_SHIFT   = 16;
static final int SHARED_UNIT    = 1 << SHARED_SHIFT;          // 0x00010000
static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;     // 0x0000FFFF
static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;     // 0x0000FFFF

static int sharedCount(int c) {
    return c >>> SHARED_SHIFT;
}

static int exclusiveCount(int c) {
    return c & EXCLUSIVE_MASK;
}
```

#### 24.1 两种锁如何修改 state

```text
写锁获取一次：
  state += 1
  只改变低 16 位的写重入计数

读锁获取一次：
  state += SHARED_UNIT
  等价于 state += 0x00010000
  只改变高 16 位的读锁计数

读锁释放一次：
  state -= SHARED_UNIT

写锁释放一次：
  state -= 1
```

各种子状态可以直接从同一个合成值取出：

| 条件 | 含义 |
|---|---|
| `exclusiveCount(c) > 0` | 当前有写锁持有者，低 16 位非零 |
| `sharedCount(c) > 0` | 当前有读锁持有者，高 16 位非零 |
| `c == 0` | 读写锁都完全空闲 |
| 高、低 16 位同时非零吗？ | 正常情况下不能同时增加；写锁持有者可通过锁降级先持有读锁 |

#### 24.2 获取时的互斥判断

写锁获取的核心判断可以简化为：

1. 如果 `state == 0`，尝试 CAS 获得写锁。
2. 如果写计数非零且当前线程就是写锁持有者，可以重入。
3. 如果已有读锁持有者，写锁必须等待。

读锁获取需要判断当前是否被其他线程独占写锁；写锁持有者自己可以再次获取读锁，从而实现“锁降级”：先保持写锁获取读锁，再释放写锁。

这里要区分两个层面：

- **`state` 的高低位编码决定“谁能获取”。**
- **AQS `Node` 的共享或独占模式决定“获取失败后如何排队和传播唤醒”。**

读锁等待节点按共享模式排队，获取成功后可以继续唤醒后续共享节点；写锁等待节点按独占模式排队，通常只唤醒一个后继。读写锁的 `state` 拆分不需要 `Node` 参与，二者不要混为一谈。

#### 24.3 为什么合成一个 state

如果把读计数和写计数拆成两个独立变量，就会出现判断与修改之间的竞态：

```text
看到写计数为 0
  → 另一个线程准备增加写计数
  → 当前线程增加读计数
```

“确认没有写者”和“增加读者”必须由一个原子操作完成。合并到一个 `int` 后，一次 CAS 可以同时维护两半计数，并让互斥规则以同一个状态快照为依据。

代价是每个计数最多使用 16 位，因此读锁持有数和写锁重入数都受到上限约束，源码需要在极端情况下检查溢出。

一句话概括：

> **高低 16 位让一个原子 `state` 同时承载读、写两种语义；一次 CAS 完成状态裁决，`Node` 的模式标记再负责获取失败后的队列行为。**

#### Q25. 为什么 JUC 里很多类不直接用 ReentrantLock，而是自己写一个基于 AQS 的内部类（如 Sync 继承 AQS）？

**标准回答：**

只回答“方便扩展”不够。真正原因是：**这些工具需要与 `ReentrantLock` 不同的获取语义，而 `ReentrantLock` 的语义和公开 API 无法组合出那些工具。**

#### 25.1 工具的本质差异在“什么算成功获取”

| 工具 | 获取成功的条件 | 获取时对 `state` 的操作 |
|---|---|---|
| `ReentrantLock` | 空闲或当前线程重入 | 增加重入计数 |
| `Semaphore` | 还有剩余许可 | 减少许可 |
| `CountDownLatch` | 计数已经归零 | 通常不修改计数 |

`CountDownLatch` 最能说明问题：

```java
protected int tryAcquireShared(int acquires) {
    return getState() == 0 ? 1 : -1;
}
```

等待门闩关闭时，线程只是在判断 `state`；门闩归零后，多个线程可以一起通过。这是一种共享放行语义，不是独占可重入锁能直接表达的模型。

#### 25.2 为什么不组合 ReentrantLock

`ReentrantLock` 对外暴露的是 `lock/unlock/tryLock`，它不向调用方开放：

- 如何直接修改 `state`；
- 如何定义共享获取条件；
- 如何在获取成功后传播共享唤醒；
- 如何把失败节点按自定义语义放入同一个 AQS 队列。

可以通过“Lock + 计数器 + Condition”模拟部分效果，但会退化：

- 所有等待线程依赖同一个条件，通常只能使用 `signalAll`；
- 被唤醒线程会再次竞争同一把锁，产生不必要的 O(N) 次竞争；
- 无法复用 AQS 的共享节点传播和精细队列管理；
- 共享语义最终被重新拼成一个效率更低的独占式方案。

所以问题不是“调用 ReentrantLock 不方便”，而是有些同步语义无法通过它的公开 API 表达。

#### 25.3 模板方法固定了什么，开放了什么

AQS 使用模板方法模式，把同步器分成两层。

AQS 固定并复用的通用机制：

- 双向 FIFO 同步队列的入队、出队和维护；
- `park/unpark` 阻塞和唤醒；
- 中断、超时和取消节点的处理；
- 独占与共享模式的获取控制流；
- 资源释放后的后继唤醒与共享传播。

子类开放的策略钩子：

| 钩子 | 子类回答的问题 |
|---|---|
| `tryAcquire` | 现在能否独占获取？ |
| `tryRelease` | 现在能否释放独占资源？ |
| `tryAcquireShared` | 现在能否共享获取，成功后的传播值是多少？ |
| `tryReleaseShared` | 共享资源是否已经释放到可唤醒后继？ |

`ReentrantLock`、`Semaphore`、`CountDownLatch` 的差异被压缩到 `state` 语义和少数条件判断上。复杂的并发机制由框架统一维护，子类只填空。

#### 25.4 为什么使用内部 Sync 类

JUC 常见结构是：

```text
工具公开 API
  → 内部 private static class Sync extends AQS
  → 覆写 tryAcquire(Shared)/tryRelease(Shared)
```

使用内部类有四个好处：

1. **封装不变量。** 外部用户不能直接调用 `setState` 或操作队列，只能使用 `acquire/release/await/countDown` 等稳定 API。
2. **隔离实现细节。** 队列、`Node`、中断、取消和传播由 AQS 管理，工具类只暴露自己的业务操作。
3. **允许内部实现演进。** AQS 可以重构队列和等待机制，上层同步工具不必变化。
4. **可定义内部变体。** `ReentrantLock` 用 `NonfairSync/FairSync` 表达公平性差异，而不需要向调用方暴露两套完全不同的实现。

#### 25.5 不是所有同步场景都要绕开 ReentrantLock

JUC 同时存在“复用现成锁”和“自定义 AQS 子类”两种路线：

- `ArrayBlockingQueue` 的状态和互斥关系可以用一把 `ReentrantLock` 加两个 `Condition` 清晰表达，可以直接复用。
- `CountDownLatch`、`Semaphore` 需要共享获取或自定义 resource 语义，更适合继承 AQS。
- `LinkedBlockingQueue` 的入队端和出队端拥有较强的操作独立性，可能采用不同的锁策略以提高两端并行度。

因此判断标准不是“AQS 一定更高级”，而是：

> 现成锁的语义是否足够表达需求？当获取语义真正超出“独占可重入互斥”时，才需要定义 AQS 子类。

### 一句话总结

`ReentrantLock` 是一个已经固定语义的“产品”；AQS 是可创建同步器的“框架”。框架负责困难且通用的并发机制，子类只回答自己的资源获取条件。CountDownLatch 用很少的代码获得完整队列、阻塞、超时和传播能力，正是模板方法的价值。

## 十二、快速记忆

```text
Monitor
  对象 → Mark Word → ObjectMonitor
  隐式加锁、自动释放
  一个等待结构，功能固定

AQS
  state → 同步队列 → 模板钩子
  显式获取，通常显式释放
  多个 Condition，可扩展可组合

共同点
  真阻塞、真唤醒都需要内核调度器参与
  优化方向都是尽量用 CAS、自旋和 fast path 留在用户态
```

最后用三句话收束：

1. **Monitor 解决的是 JVM 内置对象同步，AQS 解决的是如何用 Java 构建可扩展同步器。**
2. **Monitor 的关键是 Mark Word、ObjectMonitor 和 `synchronized` 的隐式流程；AQS 的关键是 `state`、CLH 变种队列和模板方法。**
3. **AQS 不是零内核切换，Monitor 也不是每次加锁都进内核；性能判断应看竞争程度、阻塞频率和临界区，而不是只看 API 名称。**
