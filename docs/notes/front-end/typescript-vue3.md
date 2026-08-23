---
title: TypeScript 基础与 Vue3 实践
createTime: 2026/08/23 20:00:00
permalink: /front/typescript-vue3/
---

# TypeScript 基础与 Vue3 实践

> 有 JS 基础过渡到 TS，聚焦 Vue3 场景。

## 一、TS 核心基础速览

TS 不是全新语言，而是给 JS 加上**静态类型检查**，在运行前发现错误。

### 1. 基础类型注解

变量名后加 `:` 和类型即可。

```typescript
let username: string = "清言"
let age: number = 18
let isLearning: boolean = true
let nothing: null = null

// 联合类型：可为 string 或 number
let id: string | number = 101
id = "A102" // 合法
```

### 2. 数组与对象

```typescript
// 数组
let scores: number[] = [90, 80, 100]

// 对象：用 interface / type 定义形状
interface User {
  name: string
  age: number
  phone?: string // 可选属性
}

let user: User = {
  name: "张三",
  age: 20 // 不写 phone 也不报错
}
```

### 3. 函数类型

```typescript
function add(a: number, b: number): number {
  return a + b
}

// 箭头函数
const greet = (name: string): string => `Hello, ${name}`
```

### 4. 泛型

泛型是类型参数，在 Vue3 中非常常见。

```typescript
// T 为占位符，调用时决定类型
function echo<T>(arg: T): T {
  return arg
}

const result1 = echo<string>("hello")
const result2 = echo<number>(123)
```

## 二、Vue3 + TS 实战

Vue3 用 TS 重写，对 TS 支持完美。90% 工作在处理 `Props`、`Emits`、`Refs`。

### 1. 组件基本结构

在 `<script>` 标签加 `lang="ts"` 即可：

```vue
<script setup lang="ts">
// TS 代码
</script>

<template>
  <div>Hello</div>
</template>
```

### 2. 定义 Props

使用 `defineProps` 配合 TS 类型（不再用 Options API 对象语法）：

```vue
<script setup lang="ts">
interface Props {
  title: string
  count?: number
}

const props = defineProps<Props>()
</script>
```

### 3. 定义 Emits

```vue
<script setup lang="ts">
const emit = defineEmits<{
  (e: 'update', value: number): void
  (e: 'close'): void
}>()

emit('update', 123)
</script>
```

### 4. 计算属性

自动推导返回值类型，通常无需手动泛型：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2) // 推导为 number
</script>
```

### 5. 获取 DOM / 组件实例

使用 `ref` 获取模板元素时，初始值为 `null`，需明确类型：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'

const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<template>
  <input ref="inputRef" />
</template>
```

## 三、类型推导与 `ref` 细节

### 为什么不能写 `const count: number = ref<number>(0)`？

`ref(0)` 返回的不是数字 `0`，而是**响应式对象** `RefImpl`（`Ref<number>`），结构类似 `{ value: 0 }`。

```typescript
// ❌ 报错：对象不能赋给数字
const count: number = ref<number>(0)

// ✅ 合法（但啰嗦）
import { ref, type Ref } from 'vue'
const count: Ref<number> = ref(0)

// ✅ 推荐：依赖推导
const count = ref<number>(0) // TS 自动推导为 Ref<number>
```

核心：`count` 是对象，真正的数字在 `count.value` 里。

### `<number>` 何时可省略？

多数情况可省略，TS 会根据初始值推导：

```typescript
const count = ref(0)        // 推导为 Ref<number>
const title = ref('Hello')  // 推导为 Ref<string>
```

必须写时：初始值无法确定最终类型：

```typescript
const count = ref<number | null>(null)
const list = ref<string[]>([])
```

### `let` vs `const` 的推导区别

两者都可省略类型，但推导结果不同：

```typescript
let myAge = 18      // 推导为 number（宽泛，任意数字可赋值）
myAge = 20          // ✅ 合法

const myName = "张三" // 推导为 "张三"（字面量类型，只能是该值）
// myName = "李四"   // ❌ 报错
```

> Vue3 `<script setup>` 中，尽量用 `const` 声明 `ref`/`reactive`（防止引用丢失，`.value` 内部变化仍响应式）；仅在纯逻辑变量中用 `let`。

## 四、给初学者的建议

- **不要害怕 `any`**：搞不定类型时先用 `any` 让项目跑起来，再优化。学习阶段可用，企业级需避免滥用。
- **善用编辑器**：VS Code + Volar（现 Vue - Official）插件，悬停查看推导类型。
- **解构 `props` 注意响应性**：直接解构会丢失响应性，用 `toRefs` 时类型变为 `Ref<T>`。
