---
title: Promise 与异步编程
createTime: 2026/08/23 20:20:00
permalink: /front/promise-async/
---

# Promise 与异步编程

## 一、Promise 核心概念

### 1. 比喻：麦当劳取餐器

点汉堡后，收银员给你的取餐器就是 **Promise**——代表“承诺”：现在没给汉堡，但未来一定给交代。等待期间你可以坐下玩手机（执行同步代码）。

### 2. 三种状态

- **Pending（等待中）**：初始状态，后厨制作中。
- **Fulfilled（已成功）**：绿灯亮，拿到结果。
- **Rejected（已失败）**：失败，拿到错误原因。

> 状态一旦改变即锁定，不可回退。

### 3. 代码形态

#### 消费者（接收 Promise）

90% 场景在消费 Promise（如请求接口）：

```javascript
const 取餐器 = getOrder()

取餐器
  .then((汉堡) => {
    console.log("好吃！", 汉堡) // Fulfilled 时执行
  })
  .catch((错误) => {
    console.log("没吃上，因为：", 错误) // Rejected 时执行
  })
  .finally(() => {
    console.log("不管吃没吃上，这事儿结了")
  })
```

#### 生产者（创建 Promise）

```javascript
const myPromise = new Promise((resolve, reject) => {
  setTimeout(() => {
    const 成功 = true
    if (成功) resolve("一个香喷喷的汉堡")
    else reject("汉堡机坏了")
  }, 2000)
})

myPromise.then(汉堡 => console.log(汉堡))
```

### 4. 解决回调地狱

```javascript
// ❌ 回调地狱
拿号(function(号) {
  点餐(号, function(餐) {
    付款(餐, function(票) {
      拿汉堡(票, function(汉堡) { console.log("终于吃上了", 汉堡) })
    })
  })
})

// ✅ Promise 链式
拿号()
  .then(号 => 点餐(号))
  .then(餐 => 付款(餐))
  .then(票 => 拿汉堡(票))
  .then(汉堡 => console.log("终于吃上了", 汉堡))
  .catch(错误 => console.log("出错了", 错误))
```

### 5. 终极写法：async / await

ES2017 语法糖，底层仍是 Promise：

```javascript
async function 吃麦当劳() {
  try {
    const 号 = await 拿号()      // 暂停等待完成
    const 餐 = await 点餐(号)
    const 票 = await 付款(餐)
    const 汉堡 = await 拿汉堡(票)
    console.log("终于吃上了", 汉堡)
  } catch (错误) {
    console.log("出错了:", 错误) // 相当于 .catch()
  }
}
```

- `async`：加在函数前，表示返回 Promise。
- `await`：仅在 `async` 内使用，等待 Promise 出结果再继续。

### 6. Vue3 + TS 中的使用

```vue
<script setup lang="ts">
import axios from 'axios'
import { ref, onMounted } from 'vue'

interface UserInfo { id: number; name: string }

const userInfo = ref<UserInfo | null>(null)

onMounted(async () => {
  try {
    const response = await axios.get<UserInfo>('/api/user/1')
    userInfo.value = response.data
  } catch (error) {
    console.error('获取失败', error)
  }
})
</script>
```

## 二、Axios 与 Promise 的关系

> 直觉准确：写法一致，因为 **Axios 基于 Promise 封装**。Promise 是发动机，Axios 是跑车。

### 为什么写法一致？

`axios.get/post` 内部创建 `new Promise` 并通过 `resolve/reject` 传出结果，因此可直接 `.then/.catch/await`：

```javascript
// 伪代码：Axios 内部
axios.get = function(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response)
      else reject(new Error('请求失败'))
    }
    xhr.send()
  })
}

// 使用
axios.get('/api/user')
  .then(res => console.log(res.data))
  .catch(err => console.log(err))
```

### 为什么要用 Axios 而非原生 fetch？

- **自动 JSON 解析**：`response.data` 即对象，无需 `res.json()`。
- **拦截器**：统一处理错误/加 Header，无需每个 `.catch` 重复。
- **超时/配置**：如 `timeout: 5000`、自动携带 `Authorization`。

```javascript
// 拦截器
axios.interceptors.response.use(
  res => res,
  err => {
    alert('网络开小差了')
    return Promise.reject(err)
  }
)

// 携带 Token 与超时
axios.post('/api/login', { user: 'admin' }, {
  timeout: 5000,
  headers: { 'Authorization': 'Bearer token123' }
})
```

### 标准写法（Vue3 + TS）

```typescript
import axios from 'axios'

const response = await axios.get<UserInfo>('/api/user/1')
userInfo.value = response.data // TS 提示 id/name
```

## 三、Promise 返回值：何时 `.then` 何时直接接收？

核心是两种写法：**传统回调（`.then`）** vs **现代同步写法（`await`）**。

### 快递包裹比喻

Promise 是快递包裹，里面是数据：

- **直接接收不拆**：`const result = fetchUser()` 拿到的是包裹壳 `Promise { <pending> }`。
- **`.then` 拆包裹**：告诉引擎“到了帮我拆开执行回调”。
- **`await` 自动拆**：`await` 是剥壳机，直接取出物品赋值。

```typescript
function fetchUser(): Promise<string> {
  return new Promise(resolve => setTimeout(() => resolve("用户张三"), 1000))
}

// ❌ 未拆：拿到包裹
const result = fetchUser()
console.log(result) // Promise { <pending> }
// result.toUpperCase() // ❌ Promise 无此方法

// ✅ .then 拆
fetchUser().then(user => console.log(user.toUpperCase()))

// ✅ await 拆（需在 async 内）
async function getUserInfo() {
  const result = await fetchUser() // 直接是 "用户张三"
  console.log(result.toUpperCase()) // ✅ 正常
}
```

### 常见坑：忘记 `await`

```typescript
const userInfo = fetchUser() // 实际是 Promise
userInfo.name // ❌ 报错
```

> **TS 会救你**：声明返回 `Promise<string>` 时，未 `await` 则 TS 提示类型不匹配并画红线。

**总结**：看到 `await` 就是拆包裹拿值；无 `await` 也无 `.then`，拿到的永远是壳子。

## 四、Promise.all 详解

### 1. 核心规则

`Promise.all([p1, p2, p3])` 将多个 Promise 打包为一个大 Promise：

- **全成功才成功**：全部 `resolve` 才 `resolve`，返回按传入顺序的结果数组。
- **一败俱败**：任意一个 `reject`，整体立刻失败，不再等其他。

### 2. 比喻：外卖套餐

```javascript
const makeBurger = new Promise(resolve => setTimeout(() => resolve('🍔'), 2000))
const makeCola   = new Promise(resolve => setTimeout(() => resolve('🥤'), 1000))
const makeFries  = new Promise(resolve => setTimeout(() => resolve('🍟'), 1500))

const readyToEat = Promise.all([makeBurger, makeCola, makeFries])
readyToEat.then(foods => {
  console.log('套餐齐了', foods) // ['🍔','🥤','🍟']，顺序与传入一致
})
// 耗时取最慢者：2 秒（并发执行）
```

### 3. 实战最常用：配合 async/await + 解构

```typescript
async function eatCombo() {
  try {
    const [burger, cola, fries] = await Promise.all([
      fetchBurger(), fetchCola(), fetchFries()
    ])
    console.log(burger, cola, fries)
  } catch (error) {
    console.log('快餐没法吃了，因为:', error)
  }
}
```

### 4. 在并发上传中的作用

```typescript
// 启动 3 个工人，每个返回 Promise
const workers = Array.from({ length: CONCURRENCY }, () => worker())
await Promise.all(workers) // 卡住主流程，等 3 个 while 循环全部结束才继续合并
```

### 5. 小兄弟：Promise.allSettled

需“不管成功失败都要等全部结果”时使用：

```typescript
const results = await Promise.allSettled([p1, p2, p3])
// [
//   { status: 'fulfilled', value: '结果1' },
//   { status: 'rejected',  reason: '报错2' },
//   { status: 'fulfilled', value: '结果3' },
// ]
```

| API | 行为 |
|-----|------|
| `Promise.all` | 全成功才成功，一败俱败 |
| `Promise.allSettled` | 等全部 settled，逐个报告状态 |

