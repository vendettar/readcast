# Readcast（React + TypeScript 重写版）开发介绍 / 交接文档

面向接手开发团队：介绍当前代码的功能边界、关键模块、算法与缓存策略、持久化与测试方式，以及常见排障入口。

> 分支：`feature/react-rewrite`（React 19 + TS + Vite SPA）  
> 原版（DOM/原生 JS）参考：`main` 分支与 `original/` 目录

---

## 0. 强制规则（维护约束）

这些规则用于降低维护成本，适用于 **所有后续迭代**：

1) **不需要兼容旧数据（按首次上线开发）**
   - 不做 IndexedDB / localStorage 的版本迁移与兼容层。
   - 当存储结构或缓存逻辑发生变化时，允许直接清库/重建。

2) **每次改动都必须同步更新本文档**
   - 任意功能改动/重构/修 bug 完成后，都要以"实际代码"为准更新 `docs/handoff_doc.md`。
   - 文档只记录"结果/现状"，不记录过程日志。

---

## 1. 项目做什么（产品/功能概述）

Readcast 是一个浏览器内播客播放器，支持：
- **本地文件**：拖放 MP3 + SRT 字幕文件进行播放和阅读
- **Gallery（发现）**：搜索、订阅播客，收藏节目
- **字幕跟随**：播放时字幕自动滚动高亮
- **选词查词**：选中字幕文本可查询词典/网页搜索

两大入口：
- `/` - 主播放器页面
- `/gallery` - 发现/订阅播客
- `/local-files` - 本地文件库

---

## 2. 本地开发 / 构建 / 测试

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev

# 生产构建
npm run build

# 运行单元测试
npm run test:run

# 运行 E2E 测试
npm run test:e2e
```

---

## 3. 路由（TanStack Router + File-Based Routing）

使用 TanStack Router 实现路由，通过 Vite 插件自动生成路由树。

### 路由结构

| 路径 | 文件 | 说明 |
|------|------|------|
| `/` | `src/routes/index.tsx` | 主播放器页面（字幕、控制栏） |
| `/gallery` | `src/routes/gallery.tsx` | 发现播客（模态框形式） |
| `/local-files` | `src/routes/local-files.tsx` | 本地文件库（模态框形式） |

### 关键设计

- **播放器常驻**：`<audio>` 元素和播放状态在 `__root.tsx` 中挂载，路由切换不中断播放
- **模态框即路由**：Gallery 和 Local Files 作为独立路由，浏览器前进/后退导航生效
- **路由生成**：`src/routeTree.gen.ts` 由 Vite 插件自动生成，不要手动编辑

---

## 4. i18n 国际化

使用轻量级 `t(key)` 方案，**不使用 i18next**。

### 实现

- **翻译文件**：`src/libs/translations.ts`（6 种语言：zh/en/ja/ko/de/es）
- **Hook**：`src/hooks/useI18n.tsx` 提供 `t(key)` 函数
- **Provider**：在 `main.tsx` 中包裹 `<I18nProvider>`

### 使用

```tsx
const { t } = useI18n();
return <button>{t('btnPlay')}</button>;
```

### 规范

- 所有用户可见文案必须使用 `t(key)`
- 技术信息（错误详情等）只输出到 console，不暴露给用户

---

## 5. 持久化与缓存（Dexie IndexedDB）

使用 Dexie.js 封装 IndexedDB，数据库名：`readcast-v2`。

### 数据库 Schema

| Store | Primary Key | Indexes | 用途 |
|-------|-------------|---------|------|
| sessions | id | lastOpenedAt | 播放会话（进度、音频/字幕 ID） |
| audios | id | createdAt | 本地音频文件 Blob |
| subtitles | id | createdAt | 本地字幕文件内容 |
| subscriptions | feedUrl | addedAt | 订阅的播客 |
| favorites | key | addedAt | 收藏的节目 |
| settings | key | — | 用户设置（如 country） |

### API

```typescript
import { DB } from './libs/dexieDb';

// Session
await DB.createSession(id, { progress: 0 });
await DB.updateSession(id, { progress: 120 });
const session = await DB.getSession(id);
const lastSession = await DB.getLastSession();

// Audio/Subtitle
const audioId = await DB.addAudio(blob, filename);
const audio = await DB.getAudio(audioId);

// Settings
await DB.setSetting('country', 'us');
const country = await DB.getSetting('country');

// Subscriptions/Favorites
await DB.addSubscription(sub);
await DB.getAllSubscriptions();
```

### 重置策略

允许直接清库重建（首次发布策略），无需迁移兼容。

---

## 6. 目录结构

```
src/
├── routes/              # TanStack Router 路由文件
│   ├── __root.tsx       # 根布局（Header、播放器、Toast）
│   ├── index.tsx        # 主页/播放器
│   ├── gallery.tsx      # Gallery 路由
│   └── local-files.tsx  # Local Files 路由
├── components/          # React 组件
├── hooks/               # 自定义 Hooks
├── libs/                # 工具库
│   ├── dexieDb.ts       # Dexie 数据库封装
│   ├── translations.ts  # i18n 翻译
│   └── ...
├── store/               # Zustand stores
├── router.tsx           # Router 实例
└── routeTree.gen.ts     # 自动生成的路由树
```

---

## 7. 测试

### 单元测试（Vitest）

```bash
npm run test:run
```

- 测试文件：`src/__tests__/*.test.ts`
- 使用 `fake-indexeddb` 模拟 IndexedDB
- 共 115 个测试用例

### E2E 测试（Playwright）

```bash
npm run test:e2e
```

---

## 8. 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript + Vite |
| 路由 | TanStack Router (file-based) |
| 状态 | Zustand |
| 持久化 | Dexie (IndexedDB) |
| 样式 | Tailwind CSS + shadcn/ui |
| 测试 | Vitest + Playwright |
| i18n | 轻量 t(key) 方案 |

---

## 9. 常见排障

### 路由不生效

检查 `src/routeTree.gen.ts` 是否已生成。运行 `npm run dev` 会自动生成。

### 数据库错误

清除浏览器 IndexedDB 数据：DevTools → Application → Storage → 删除 `readcast-v2`。

### Tailwind 样式不生效

确保 `postcss.config.js` 使用 `@tailwindcss/postcss`（Tailwind v4 要求）。
