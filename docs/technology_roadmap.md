# Readio 技术演进规划

> 版本日期：2025-12-23

---

## 1. 整体方向

```
阶段 1：纯静态部署 (当前 → 近期)
├── React + TypeScript + Vite
├── TanStack Router + File-Based Routing（Vite Plugin）
├── Radix UI (Modal/Toast/Tooltip)
├── Tailwind + shadcn/ui (标准 UI)
├── TanStack Query (网络缓存)
├── i18n（轻量：`t(key)` + `translations`；暂不引入 i18next）
└── Zustand + IndexedDB (状态/持久化)

阶段 2：Spring Boot 后端 (未来)
├── 用户认证 (登录/注册)
├── 数据同步 (收藏/订阅/进度)
├── 自建 CORS 代理
└── 评论系统
```

---

## 2. 技术选型决策

### 2.1 UI 框架分层

| 区域 | 方案 | 理由 |
|------|------|------|
| 弹窗/Toast/Tooltip | Radix UI | 内置焦点管理、无障碍、避免自研 input lock |
| 设置/表单/Gallery 列表 | Tailwind + shadcn/ui | 快速迭代、统一风格 |
| **字幕 TranscriptView** | Tailwind + 少量“交互专用 CSS” | 产品要求：**字幕每个单词都可见（多行可见，禁止省略号截断）**；因此虚拟列表必须支持动态高度（推荐 `react-virtuoso`），并且 `::highlight`、滚动/选区细节仍需要少量 CSS 选择器/伪元素能力 |
| **播放器控件** | Tailwind + 少量“交互专用 CSS” | Range/拖拽/浏览器兼容（如 `appearance`、滑块样式）很难用纯 Tailwind 完整表达，允许少量 CSS 做细节补齐 |
| **选词弹窗** | Tailwind + 少量“交互专用 CSS” | 浮层定位、遮罩层级、文本选区/高亮等交互细节仍可能需要少量 CSS（但 token/颜色/间距必须来自 Design System） |

#### 2.1.1 “交互专用 CSS” 的边界（为了整体迁移不再阵痛）

目标：**所有常规 UI（布局/间距/字体/颜色/阴影/圆角）统一走 Tailwind + shadcn/ui**；只有少量“Tailwind 不擅长或无法表达”的交互细节允许写 CSS。

允许写 CSS 的典型场景：
- `::highlight` / 选择高亮相关（例如字幕查词高亮）
- 虚拟列表容器/窗口渲染等“约束型样式”（用于长列表性能；字幕要求多行可见，不使用截断）
- Range/滑块（播放器进度条/音量条）的浏览器兼容属性（如 `appearance` 等）
- 复杂伪元素（渐变遮罩、mask、细粒度 pointer-events 规则）

硬约束（保持 Design System 一致性）：
- CSS 只能引用 Design System 的 token（Tailwind theme 或 CSS variables），不得引入“新颜色/新字号/新间距”
- CSS 必须局部化：优先 `@layer components` 或组件同目录的 CSS Module（按 `docs/design_system.md` 约定）
- 禁止把迁移过程中临时样式堆进全局 CSS；任何新增 CSS 都要说明“为什么 Tailwind 不够”

### 2.2 状态与数据层

| 职责 | 方案 | 替代的现有代码 |
|------|------|---------------|
| 全局状态 | Zustand | ✅ 保持现状 |
| 网络请求/缓存 | TanStack Query | `requestManager.ts` + 手写缓存 |
| 本地持久化 | IndexedDB | 使用Dexie 替代自有封装 |
| 配置/小缓存 | localStorage | ✅ 保持现状 |

#### 2.2.1 Dexie 测试策略（可清库阶段 vs 上线后阶段）

当前阶段（首次开发、可清库重建、不需要兼容旧数据）：
- **不需要迁移保护测试**。这类测试会在 Dexie 重置/重写过程中成为维护负担。
- `src/libs/__tests__/dbMigration.test.ts` 应改写为：
  - Dexie DB 可正常初始化（schema/stores 可用）
  - 基本 CRUD（create/read/update/delete）可用
- 不再维护 “v7→v8 迁移保持数据” 这类断言。

未来阶段（上线后、有真实用户、不能清库）：
- 需要新增/启用 **Dexie migration protection test**，典型形式：
  - 用旧 `version(n).stores(...)` 建库并写入数据
  - 升级到 `version(n+1).stores(...)` + `upgrade(tx => ...)`
  - 断言旧数据仍在、新字段/新表正确、升级过程不抛错

### 2.3 Routing 与 i18n

| 能力 | 方案 | 说明 |
|------|------|------|
| 路由 | TanStack Router + File-Based Routing（Vite Plugin） | 现在就引入，避免后期把“视图切换/弹窗状态”整体重构为路由状态；后端接入与否不影响路由价值 |
| i18n | 轻量方案（`t(key)` + `translations`） | 现在就定规范：禁止组件内硬编码用户可见文案；暂不引入 i18next，后期需要复数/格式化/协作流程再升级 |

路由边界原则（用户体验底线）：
- **播放器必须常驻**：将播放器（含 `<audio>` 与核心播放状态承载组件）提升到 `__root.tsx`（或等价的全局 layout）永久挂载，确保从 `/` 切到 `/gallery`、`/local-files` 等路由时 **不影响播放**。

### 2.4 长列表

| 场景 | 方案 |
|------|------|
| 字幕（产品要求：多行可见） | **react-virtuoso（动态高度，必选）** |
| 固定行高长列表（可选） | react-window (FixedSizeList) |

---

## 3. Next.js / SSR 结论

### 3.0 什么是 SSR？

**SSR（Server-Side Rendering）= 服务器帮你把 React 组件渲染成 HTML，再发给浏览器。**

| 模式 | 流程 | 首屏速度 | SEO |
|------|------|----------|-----|
| SPA（当前 Vite） | 服务器返回空 HTML → 浏览器下载 JS → JS 执行后渲染 | 较慢 | ❌ 爬虫看不到内容 |
| SSR（Next.js） | 服务器执行 React → 返回完整 HTML → 浏览器直接显示 | 快 | ✅ 爬虫看到完整内容 |

**SSR 解决的问题**：
- SEO：让搜索引擎能索引页面内容
- 社交分享：微信/Twitter 分享链接时显示预览卡片（标题/图片）
- 首屏速度：用户不用等 JS 下载执行就能看到内容

**SSR 不适用的场景**：
- 纯交互应用（播放器、编辑器、游戏）——必须等 JS 执行才能交互
- 用户私有数据（登录后的收藏/设置）——没有 SEO 需求
- 实时动态内容——服务器渲染反而增加延迟

### 3.1 功能需求与 SSR 价值

| 功能 | SSR 有价值吗 | 理由 |
|------|-------------|------|
| 用户登录/注册 | ❌ 无 | 纯表单交互，无 SEO 需求 |
| 收藏/订阅列表 | ❌ 无 | 用户私有数据，搜索引擎不索引 |
| 播放器/字幕 | ❌ 无 | 纯客户端交互 |
| 用户评论 | ⚠️ 看情况 | 如需 SEO，才需要 SSR |
| 播客公开页面 | ⚠️ 看情况 | 如需社交分享预览，才需要 SSR |

### 3.2 架构方案对比

#### 方案 A：Vite SPA + Spring Boot API（推荐）

```
┌─────────────┐     ┌─────────────────┐
│  Vite SPA   │────▶│  Spring Boot    │
│  (静态部署) │     │  (REST API)     │
└─────────────┘     └─────────────────┘
```

- ✅ 架构简单，一个后端
- ✅ 前端可部署到 CDN
- ❌ 公开页面无 SSR（无社交分享预览）

#### 方案 B：Next.js + Spring Boot API

```
┌─────────────┐     ┌─────────────────┐
│  Next.js    │────▶│  Spring Boot    │
│  (Node 服务)│     │  (REST API)     │
└─────────────┘     └─────────────────┘
```

- ✅ 公开页面可 SSR
- ❌ 两个服务器运维
- ❌ 大部分页面仍是 `'use client'`

### 3.3 决策

| 条件 | 推荐方案 |
|------|----------|
| 不需要 SEO/社交分享 | ✅ **Vite SPA + Spring Boot** |
| 需要公开页面 SEO | ⚠️ Next.js + Spring Boot（仅少数页面 SSR） |
| 想简化运维 | 🔄 Next.js fullstack（放弃 Spring Boot） |

**当前选择**：Vite SPA + Spring Boot，不引入 Next.js SSR。

---

## 4. 迁移路径

### 阶段 1：低成本高收益

- [ ] TanStack Router + File-Based Routing 落地（定义路由结构与页面边界）
- [ ] 播放器提升到 `__root.tsx` 常驻：路由切换（如 `/gallery`、`/local-files`）不得中断播放
- [ ] i18n 轻量方案落地：统一 `t(key)` 入口与 `translations` 结构；禁止组件内硬编码用户可见文案
- [ ] 改写 `dbMigration.test.ts`：Dexie 初始化 + 基本 CRUD（不做迁移保持断言）
- [ ] Radix Toast 替换自研 `toast.ts`
- [ ] Radix Tooltip 替换 `useHoverMenu` / `Tooltip.tsx`
- [ ] TanStack Query 替换 `galleryApi.ts` 缓存逻辑

### 阶段 2：核心改造

- [ ] Radix Dialog 替换 `GalleryModal` / `LocalFilesModal`
- [ ] react-virtuoso 替换 `useVirtualList`（字幕多行可见；不使用单行省略）
- [ ] Tailwind + shadcn/ui 覆盖 Gallery/Settings UI
- [ ] 清理遗留样式：将 `src/styles/original.css` 拆解/替换为 Tailwind + 少量“交互专用 CSS”（按 2.1.1 约束）

### 阶段 3：后端接入

- [ ] Spring Boot API 搭建
- [ ] 用户认证系统
- [ ] 数据同步（收藏/订阅/进度）
- [ ] 自建 CORS 代理
- [ ] （上线后）启用 Dexie migration protection tests（当真实用户数据不可清库时）

---

## 5. 保留的核心实现

以下模块因交互特殊性，不替换为通用库：

| 模块 | 文件 | 保留理由 |
|------|------|----------|
| 字幕虚拟列表 | `TranscriptView.tsx` | 长列表/跟随滚动/高亮重建等是核心交互逻辑；样式层面优先迁移到 Tailwind，仅保留少量交互专用 CSS |
| 选词/查词 | `useSelection.ts` + `selection/*` | DOM 位置计算、缓存高亮等是核心逻辑；UI 外观用 Tailwind/shadcn，交互细节按 2.1.1 处理 |
| 播放器控件 | `FloatingPanel.tsx` | 播放器状态机/拖拽/快捷键等逻辑保留；UI 外观迁移到 Tailwind，滑块/兼容性用少量 CSS 补齐 |
| 网络 fallback | `fetchUtils.ts` | 直连→代理 fallback 逻辑 |
