# Minimalist Diary (极简个人日记)

这是一个基于 **TypeScript (Vanilla)** + **Fastify** + **SQLite (node:sqlite)** 开发的全栈个人日记单页 Web 应用 (SPA)。项目采用离线优先 (Offline-First) 架构，支持客户端本地端到端加解密、多设备双向冲突同步、可视化数据统计以及富文本编辑等功能，致力于提供极致流畅、私密且高效的日记记录体验。

---

## ✨ 主要功能特性

- 🚀 **极简且高性能的前端**
  - 不依赖 React/Vue 等重型前端框架，完全使用纯原生 TypeScript (Vanilla TS) 与 CSS 开发。
  - 自主实现了轻量级的单页应用路由器 (Router) 和状态管理器 (Store)，页面加载极速，无冗余体积。
- 📱 **离线优先 (Offline-First) 与本地存储**
  - 引入 Dexie.js (IndexedDB 封装库) 对数据进行本地持久化，即使在断网状态下也能正常阅读、修改、删除和新建日记。
- 🔒 **端到端加密安全隐私**
  - 提供安全保障，在客户端使用 `crypto-js` 对敏感的日记文本、标题及详情进行端到端加密存储，保证即便云端数据库泄露，日记内容也无法被解密。
- 🔄 **多端数据增量冲突同步**
  - 拥有自定义的冲突同步机制，基于版本号、时间戳和变更突变日志 (Mutation Log) 追踪，确保在网络恢复后，多台设备间的日记数据可以实现无损的双向增量同步。
- 📝 **富文本编辑与多元化属性**
  - 集成 Quill.js 富文本编辑器，支持多样化排版与图片插入。
  - 支持记录日记的心情 (Mood)、天气 (Weather)、位置 (Location)、所属分类 (Categories) 及多项辅助信息。
- 📊 **多维度数据可视化**
  - 内置 Chart.js 统计面板，以精美直观的图表展示字数走势、心情分布、日记频次等个人记录轨迹。
- 📅 **日历视图**
  - 提供直观的日历看板，方便通过日期迅速检索、查看和回顾历史日记。
- 🗑️ **分类管理与回收站**
  - 支持自定义日记分类。
  - 拥有安全回收站功能，已删除日记可随时在垃圾箱中恢复或进行物理清除。
- 📥 **灵活的数据备份**
  - 支持一键导出/导入完整的日记 JSON 数据，方便用户进行离线备份与数据迁移。

---

## 🛠️ 技术栈

### 前端 (Frontend)
- **构建工具**: Vite
- **开发语言**: TypeScript (Vanilla DOM 操作)
- **样式**: Vanilla CSS (极简响应式设计，内置浅色、深色及多种个性化主题)
- **数据库**: Dexie.js (基于 IndexedDB)
- **富文本**: Quill.js
- **图表**: Chart.js
- **加解密**: crypto-js
- **其他**: marked (Markdown 渲染), sanitize-html (内容防注入)

### 后端 (Backend)
- **运行环境**: Node.js (>= 22.x)
- **Web 框架**: Fastify (极速的 Web 服务框架)
- **数据库**: 原生内置 SQLite (`node:sqlite` 的 `DatabaseSync` 模块，无需额外安装 SQLite 二进制依赖)
- **开发与编译**: tsx (本地热更新执行), TypeScript, tsc
- **校验**: Zod (严格的 API 入参校验)

---

## 📁 项目目录结构

```text
.
├── data/                    # 本地 SQLite 数据库存储目录
├── docs/                    # 项目相关文档说明
├── public/                  # 静态资源文件
├── server/                  # 后端 Fastify 服务端代码
│   ├── src/
│   │   ├── routes/          # API 路由模块 (认证、同步、日记、分类、统计等)
│   │   ├── shared/          # 前后端共享逻辑与校验定义
│   │   ├── app.ts           # Fastify 应用构建与中间件拦截器配置
│   │   ├── config.ts        # 后端环境变量与服务配置
│   │   ├── db.ts            # SQLite 数据库表迁移、建表与初始化
│   │   ├── main.ts          # 服务端启动入口
│   │   ├── repositories.ts  # 数据库持久层 (Repository 模式)
│   │   └── smoke.ts         # 数据库冒烟测试脚本
│   └── tsconfig.json        # 服务端 TypeScript 配置
├── src/                     # 前端源码目录
│   ├── assets/              # 图标及字体资源
│   ├── components/          # 独立可复用 UI 组件 (日历选择器、弹框、侧边栏等)
│   ├── db/                  # 前端 Dexie IndexedDB 数据库层封装
│   ├── pages/               # 各单页视图渲染器 (编辑器页、列表页、统计页等)
│   ├── router/              # 轻量级单页前端路由实现
│   ├── services/            # 前端 API 请求与数据同步服务
│   ├── store/               # 全局状态管理 (主题、字号、配置、用户 Auth)
│   ├── utils/               # 工具函数 (日期转换、HTML转义、加密辅助等)
│   ├── main.ts              # 前端应用入口、布局渲染与路由绑定
│   ├── style.css            # 全局 UI 样式表 (包含多套 CSS 变量主题)
│   └── types.ts             # 核心数据模型类型定义
├── index.html               # 单页应用入口 HTML
├── tsconfig.json            # 前端 TypeScript 配置
└── vite.config.ts           # Vite 构建与开发调试配置
```

---

## 🚀 快速开始

### 1. 前提条件
运行本项目需要安装 **Node.js (建议 v22 或更高版本)**，因为后端直接使用了 Node.js v22 内置的 `node:sqlite` 模块。

### 2. 安装依赖
在项目根目录下执行以下命令安装前后端所需的公共依赖：
```bash
npm install
```

### 3. 开发环境运行
为了运行完整的全栈应用，你需要同时启动前端 Vite 开发服务器和后端 Fastify API 服务器。

- **启动前端应用** (默认运行在 [http://localhost:5173](http://localhost:5173))：
  ```bash
  npm run dev
  ```

- **启动后端服务** (默认运行在 [http://localhost:5174](http://localhost:5174))：
  ```bash
  npm run server:dev
  ```

### 4. 生产环境构建与启动
如果你需要部署到生产环境，可以对代码进行打包：

- **打包前端静态文件** (打包后文件输出在 `dist/` 目录)：
  ```bash
  npm run build
  ```

- **构建并运行后端服务**：
  ```bash
  # 编译后端 TS 代码为 JS 
  npm run server:build
  
  # 启动生产环境后端服务
  npm run server:start
  ```

---

## ⚙️ 环境配置 (环境变量)

后端服务支持通过以下环境变量进行自定义配置。你可以在启动后端服务前在系统中进行设置：

| 环境变量 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `DIARY_API_HOST` | `127.0.0.1` | 服务绑定主机 IP 地址 |
| `DIARY_API_PORT` | `5174` | 服务运行的端口号 |
| `DIARY_DB_PATH` | `../data/diary.sqlite` | SQLite 数据库文件的存放路径 |
| `DIARY_API_BODY_LIMIT_BYTES` | `26214400` (25MB) | API 请求体的最大字节限制 (用于支持大图上传) |

---

## 🔄 双向数据同步设计

项目采用的离线同步机制设计如下：
1. **Mutation 记录**：客户端每一次对本地日记的写操作（新建、更新、删除、分类修改）都会生成一条本地 Mutation 记录，赋予一个唯一的递增序号。
2. **状态判定**：每一份数据在本地和云端都拥有 `server_version`（服务端版本号）和 `client_updated_at`（客户端修改时间）标记。
3. **版本比对**：当发起同步请求时，客户端会将本地比云端更新的突变日志上传，服务端比对两端的版本号及最后修改时间，根据以下策略进行自动合并：
   - 如果云端版本较新，且本地没有冲突修改，拉取云端数据覆盖本地。
   - 如果两端均有修改，通过时间戳及设备优先级自动合并突变日志，最大化避免记录丢失。
   - 同步完成后，重置客户端的 Mutation 队列并拉取最新的全局版本号。
