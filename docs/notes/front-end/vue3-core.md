---
title: Vue3 核心原理
createTime: 2026/08/23 20:10:00
permalink: /front/vue3-core/
---

# Vue3 核心原理

> 涵盖加载流程、`app.use` 插件机制、模块化规范。

## 一、Vue3 加载流程

SPA 入口可概括为：`index.html` 提供物理宿主 → `main.ts` 创建应用实例 → 挂载 `App.vue`。

### 第一阶段：初始挂载

1. **物理容器就绪**：浏览器加载 `index.html`，出现空 `<div id="app"></div>`。
2. **JS 接管**：加载 `src/main.ts`。
3. **创建应用**：`createApp(App)` 将根组件编译为虚拟 DOM（VNode）。
4. **挂载**：`app.mount('#app')` 将 `App.vue` 渲染为真实 DOM，替换 `#app`。

> 此时 `App.vue` 里的 `<router-view />` 已渲染，但为空，等待路由分配内容。

### 第二阶段：路由匹配与首次渲染

1. **路由监听**：`main.ts` 中 `app.use(router)` 后，Vue Router 读取当前 URL（如 `/home`）。
2. **查找配置**：根据 `router/index.ts` 路由表找到对应组件（如 `Home.vue`）。
3. **占位符填充**：将 `Home.vue` 渲染为 VNode，塞进 `<router-view />` 位置。

> 用户看到完整页面：`App.vue` 导航栏 + `Home.vue` 内容。

### 第三阶段：路由切换

点击 `<router-link to="/about">` 或 `router.push('/about')` 时：

1. **拦截跳转**：Vue Router 阻止浏览器刷新（SPA 精髓）。
2. **更新 URL**：通过 History API 修改地址栏为 `/about`。
3. **匹配新组件**：查找 `About.vue`。
4. **响应式更新**：内部 `currentRoute` 改变，`<router-view />` 依赖它，响应式触发更新。
5. **组件替换**：
   - 卸载旧组件（触发 `onUnmounted`，清理定时器/监听）。
   - 挂载新组件（触发 `onMounted`）。
   - 虚拟 DOM 对比后更新真实 DOM。

### 总结：谁变谁不变

- **不变**：`index.html` 容器、`main.ts` 实例、`App.vue` 本身（导航/侧边栏不闪烁）。
- **变**：仅 `<router-view />` 占位符内的内容。

> **比喻**：`App.vue` 是画框，`<router-view />` 是中间空白。切换页面只是撕下旧画贴上新画，不换画框。`keep-alive` 则是盖布不撕画。

## 二、`app.use` 做了什么

`app.use()` 是 Vue 的**插件安装接口**，将第三方库接入当前应用并赋予扩展能力。

### 1. 内部执行逻辑

```typescript
app.use(plugin, ...options)
```

- **传入函数**：直接调用 `plugin(app, options)`。
- **传入对象**：若有 `install` 方法，则调用 `plugin.install(app, options)`（Vue Router、Pinia 均属此类）。

```typescript
// 函数形式
const myPlugin = (app, options) => { /* 拿到 app */ }
app.use(myPlugin) // ≈ myPlugin(app)

// 对象形式
const myPlugin = {
  install(app, options) { /* 拿到 app */ }
}
app.use(myPlugin) // ≈ myPlugin.install(app)
```

防重复：内部维护已安装列表，重复 `app.use(router)` 会跳过。

### 2. 第三方库拿到 `app` 后做什么

- **注册全局组件**：`app.component('ElButton', Comp)`，之后任意 `.vue` 可直接用。
- **注入全局状态/方法**：`app.config.globalProperties.$router = router`。
- **依赖注入**：`app.provide()` 存数据，子组件 `inject()` 取用（Pinia 如此实现）。
- **注册全局指令**：`app.directive('focus', { mounted(el){ el.focus() } })`。

### 3. Vue2 `Vue.use` vs Vue3 `app.use`

- Vue2：`Vue.use(router)` 挂在全局单例 `Vue` 上，多实例会互相污染。
- Vue3：`createApp(App)` 每个实例独立，`app.use` 仅影响当前实例，更安全。

> **比喻**：`createApp` 是买裸机，`app.use(插件)` 是装 App，安装时申请权限（注册组件等），批准后全应用可用。

## 三、包引入方式

现代前端以 **ES Modules (ESM)** 为标准，历史上有 CommonJS、全局变量等。

### 1. ESM — Vue3 唯一指定

#### 命名导出

```typescript
// utils.ts
export const name = '清言'
export function sayHi() { console.log('Hi') }
export { age }

// 引入：需花括号，名字对应
import { name, sayHi } from './utils'
```

#### 默认导出

每个文件仅一个，引入时可任意命名：

```typescript
// App.vue
export default { name: 'App' }

// 引入：无需花括号
import App from './App.vue'
import MyComp from './App.vue' // 也合法
```

#### 引入整个模块

```typescript
import * as utils from './utils'
console.log(utils.name)
```

#### 动态引入（路由懒加载）

返回 Promise：

```typescript
const loadComp = async () => {
  const mod = await import('./components/HeavyComp.vue')
  return mod.default
}

// 路由中
() => import('@/views/Home.vue')
```

### 2. CommonJS — Node.js 旧标准

业务代码不写，但老库源码常见：

```javascript
// 导出
module.exports.name = '清言'
module.exports = { name: '清言', age: 18 }

// 引入
const utils = require('./utils')
```

> Vite/Webpack 会自动将 CJS 转为 ESM，故 Vue3 中仍可 `import xxx from '老库'`。

### 3. 全局变量 / UMD / Script 标签

通过 CDN 引入，挂在 `window`：

```html
<script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js"></script>
<script>
  const { createApp, ref } = Vue
</script>
```

### Vue3 常见引入对照

| 场景 | 写法 | 类型 |
|------|------|------|
| Vue API | `import { ref, reactive } from 'vue'` | 命名导出 |
| 根组件 | `import App from './App.vue'` | 默认导出 |
| 第三方插件 | `import router from './router'` | 默认导出 |
| 样式 | `import './assets/main.css'` | 副作用引入 |
| 懒加载 | `() => import('@/views/Home.vue')` | 动态引入 |
