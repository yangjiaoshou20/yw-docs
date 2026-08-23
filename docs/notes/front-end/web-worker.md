---
title: Web Worker 与大文件处理
createTime: 2026/08/23 20:30:00
permalink: /front/web-worker/
---

# Web Worker 与大文件处理

## 一、Web Worker 是什么

**是浏览器原生能力**，W3C 标准，无需第三方依赖，如同 `document.getElementById`、`console.log` 是浏览器自带 API。

### 原生 vs 第三方区分

以上下文某段 MD5 Worker 代码为例：

| 能力 | 来源 |
|------|------|
| `self.onmessage` / `self.postMessage` | 原生 |
| `new Worker('路径')` | 原生 |
| `File.slice()` | 原生 |
| `import SparkMD5 from 'spark-md5'` | 第三方（`npm install spark-md5`） |

> 通道是原生的，干活工具是外包的。浏览器提供通信通道，MD5 计算需第三方库。

### 最简原生例子（零依赖）

**Worker 文件 `src/myWorker.ts`：**

```typescript
// 无需引入任何东西
self.onmessage = (e) => {
  console.log('分身收到主线程消息:', e.data)
  let sum = 0
  for (let i = 0; i < 10000000000; i++) sum += i
  self.postMessage(`算完了，结果是: ${sum}`)
}
```

**主线程（Vue3 组件）：**

```vue
<script setup lang="ts">
const worker = new Worker(new URL('./myWorker.ts', import.meta.url))

worker.postMessage('开始算吧')
worker.onmessage = (e) => {
  console.log('主线程收到结果:', e.data)
}
</script>
```

### Vite 语法糖

原生 `new Worker(...)` 在 Vite 打包时可能路径错误，Vite 提供 `?worker` 后缀：

```typescript
import MyWorker from './myWorker.ts?worker'
const worker = new MyWorker()
```

> 这是构建工具特性，非浏览器原生，但底层仍是 Worker API。

## 二、增量计算文件 MD5（大文件分片）

典型的**大文件秒传 / 断点续传**场景：计算 MD5 非常耗 CPU，若在主线程会卡死页面；且 2GB 文件不可一次性读入内存，需切片。

### 完整 Worker 代码解读

```typescript
// Web Worker：增量计算文件 MD5（主线程不卡顿）
// 通过 spark-md5 的 incremental 模式逐块喂入
import SparkMD5 from 'spark-md5'

self.onmessage = async (e: MessageEvent) => {
  const { file, chunkSize } = e.data as { file: File; chunkSize: number }

  const spark = new SparkMD5.ArrayBuffer()
  const total = file.size
  let loaded = 0
  let offset = 0

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total)
    const chunk = file.slice(offset, end)
    const buffer = await chunk.arrayBuffer() // 异步读二进制
    spark.append(buffer)
    loaded += end - offset
    offset = end
    self.postMessage({ type: 'progress', loaded, total })
  }

  const md5 = spark.end()
  self.postMessage({ type: 'done', md5 })
}
```

#### 1. 监听指令

```typescript
self.onmessage = async (e: MessageEvent) => {
  const { file, chunkSize } = e.data as { file: File; chunkSize: number }
}
```

`self.onmessage` 站岗监听主线程消息；`as` 为 TS 类型断言。

#### 2. 准备榨汁机

```typescript
const spark = new SparkMD5.ArrayBuffer()
const total = file.size
let loaded = 0
let offset = 0
```

`SparkMD5.ArrayBuffer()` 是榨汁机，后续切片喂入，最后吐出 MD5。

#### 3. 循环切片并喂入

```typescript
while (offset < total) {
  const end = Math.min(offset + chunkSize, total)
  const chunk = file.slice(offset, end)
  const buffer = await chunk.arrayBuffer() // 等待读完
  spark.append(buffer)
  loaded += end - offset
  offset = end
  self.postMessage({ type: 'progress', loaded, total })
}
```

- `Math.min` 处理最后一块不足 `chunkSize` 的情况。
- `chunk.arrayBuffer()` 返回 Promise，需 `await`，否则榨汁机无数据。
- 每次进度通过 `postMessage` 汇报给主线程更新进度条。

#### 4. 完成

```typescript
const md5 = spark.end()
self.postMessage({ type: 'done', md5 })
```

`end()` 按停止键吐出最终哈希，主线程拿到后可询问后端是否秒传。

### 主线程配合（完整流程）

```typescript
// 主线程
const worker = new Worker(new URL('./md5Worker.ts', import.meta.url))
worker.postMessage({ file: myFile, chunkSize: 2 * 1024 * 1024 })

worker.onmessage = (e) => {
  if (e.data.type === 'progress') {
    console.log(`进度 ${e.data.loaded}/${e.data.total}`)
  } else if (e.data.type === 'done') {
    console.log('MD5:', e.data.md5)
    // 发请求询问后端是否已存在
  }
}
```

## 三、并发分片上传（`runUpload` 详解）

这是前述 MD5 之后的下一步：**大文件并发分片上传**，支持暂停/恢复/取消。

> 注意：此处 `const worker = async () => {...}` 仅是起名叫 worker 的**普通异步函数**，与浏览器原生 Web Worker 无关，可理解为“干活的工人”。

```typescript
const runUpload = async () => {
  const file = selectedFile.value
  if (!file || !md5.value) return

  // 待传分片队列
  const pending: number[] = []
  for (let i = 0; i < totalParts.value; i++) {
    if (!uploadedParts.value.includes(i)) pending.push(i)
  }

  // 单个 worker：循环取分片上传
  const worker = async () => {
    while (!cancelled.value) {
      // 暂停：挂起等待继续
      while (paused.value && !cancelled.value) {
        await sleep(200)
      }
      if (cancelled.value) return

      const idx = pending.shift() // 原子操作，不会重复
      if (idx === undefined) return // 队列空，结束

      const chunk = chunks.value[idx]
      const blob = file.slice(chunk.start, chunk.end)
      await uploadPart(md5.value, idx, blob)

      if (!uploadedParts.value.includes(idx)) uploadedParts.value.push(idx)
      uploadedBytes.value += blob.size
    }
  }

  try {
    const workers = Array.from({ length: CONCURRENCY }, () => worker())
    await Promise.all(workers)

    if (cancelled.value) { uploading.value = false; return }

    const res = await completeUpload(md5.value, file.name, file.size)
    uploaded.value = { name: file.name, size: file.size, md5: md5.value, url: res.url }
    uploading.value = false
    paused.value = false
    ElMessage.success('上传成功')
  } catch (e: any) {
    uploading.value = false
    paused.value = false
    ElMessage.error('上传中断: ' + (e?.message || '未知错误'))
  }
}
```

### 分步解读

1. **准备待传队列**：遍历所有分片号，将未在 `uploadedParts` 中的加入 `pending`（支持断点续传）。
2. **工人逻辑**：
   - 外层 `while (!cancelled)` 持续干活。
   - 内层 `while (paused)` 每 200ms 醒来检查是否恢复/取消。
   - `pending.shift()` 取任务——JS 单线程保证同步原子性，多工人不会拿到同一编号。
   - `file.slice` 切块 → `await uploadPart` 上传 → 更新进度。
3. **并发派发**：`Array.from({length: CONCURRENCY}, () => worker())` 启动 N 个工人，`await Promise.all(workers)` 卡住主流程，等全部完成。
4. **合并**：`await completeUpload(...)` 通知后端拼接分片。
5. **错误兜底**：任一 `uploadPart` 失败则 `Promise.all` reject，进 `catch`。

### 精妙之处

- **池化设计**：固定 N 个工人消费任务池，控制并发、节约内存。
- **单线程原子性**：`shift()` 无需加锁。
- **Promise 极致运用**：`async/await` 控制暂停与上传，`Promise.all` 统一调度。
