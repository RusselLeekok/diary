# 后端设计草案

## 目标

当前项目是 Vite + TypeScript 单页应用，数据全部保存在浏览器 IndexedDB 中。后端化的第一阶段目标不是重写界面，而是把现有本地数据层抽象成稳定的服务端 API：

- 前端 hash 路由继续负责页面切换和交互状态。
- 后端接管日记、分类、设置、回收站、统计、导入导出的持久化逻辑。
- IndexedDB 在迁移期只作为离线/兼容缓存，不再作为权威数据源。
- 先支持单用户/本机部署模型，接口设计保留 `userId` 隔离能力，避免后续加账号体系时重做数据结构。

## 当前前端路由

前端路由由 `src/main.ts` 注册，`src/router/router.ts` 通过 `window.location.hash` 解析。当前有效页面如下。

| 前端路由 | 页面 | 当前职责 | 后端化影响 |
| --- | --- | --- | --- |
| `#/list` | `listPage` | 日记列表、搜索、高级筛选、分类视图、日历视图 | 改为调用日记列表 API；左侧分类统计可由列表结果本地计算，也可用统计 API |
| `#/editor` | `editorPage` | 新建日记，15 秒自动保存，选择日期、情绪、分类，插入 base64 图片 | 改为创建草稿/保存日记 API；图片后续应迁出正文 base64 |
| `#/editor?id=:id` | `editorPage` | 编辑已有日记 | 先 `GET /entries/:id`，保存时 `PUT /entries/:id` |
| `#/editor?date=YYYY-MM-DD` | `editorPage` | 从日期上下文创建日记 | 只影响前端默认值，保存时进入创建 API |
| `#/view?id=:id` | `viewPage` | 阅读详情、编辑入口、移入垃圾箱、图片灯箱 | 详情调用 `GET /entries/:id`，删除调用软删除 API |
| `#/trash` | `trashPage` | 回收站列表、恢复、彻底删除、清空回收站 | 对应回收站 API |
| `#/stats` | `statsPage` | 总篇数、总字数、连续天数、近 30 天字数、情绪分布 | 改为调用统计 API，避免前端拉全量数据 |
| `#/settings` | `settingsPage` | 主题、字号、应用密码、导入导出、清空数据 | 设置、备份、导入、清空数据分别拆成 API |
| `#/calendar` | `calendarPage` | 当前只跳回 `list` | 不需要后端 API，保留兼容跳转 |

注意：当前顶部导航没有独立搜索页，列表页内部承担搜索与过滤。

## 当前本地数据层

`src/db/database.ts` 目前是事实上的业务服务层，基于 Dexie 管理两个表：

- `entries`: `id, dateFor, mood, createdAt, updatedAt`
- `config`: `key`

当前核心函数：

- 日记：`getAllEntries`、`getEntryById`、`saveEntry`、`deleteEntry`
- 筛选：`searchEntries`、`filterEntries`、`getEntriesByDate`、`getDatesWithEntries`
- 回收站：`trashEntry`、`getTrashedEntries`、`restoreEntry`、`clearTrash`
- 分类/配置：`getConfig`、`setConfigItem`
- 统计：`getStats`
- 导入导出：`exportData`、`importData`

`src/store/appStore.ts` 维护前端全局状态，当前会把配置分类和日记 tags 合并成 `allTags`。分类新增、重命名、删除会同步改配置和日记的 `tags`。

## 领域模型

### User

第一阶段可以固定为单用户，但数据库仍保留用户边界。

字段：

- `id`
- `displayName`
- `passwordHash`
- `createdAt`
- `updatedAt`

业务规则：

- 现有 `AppConfig.hasPassword/passwordHash` 不能继续作为真正的服务端认证模型。
- 后端引入后，密码验证必须在服务端完成，前端只保留会话状态。
- 第一阶段可提供一个默认本地用户，后续再扩展注册/多用户。

### DiaryEntry

字段建议：

- `id`
- `userId`
- `title`
- `contentHtml`
- `plainText`
- `mood`
- `categoryId` nullable
- `wordCount`
- `isLocked`
- `isDeleted`
- `dateFor`，格式 `YYYY-MM-DD`
- `timeFor`，格式 `HH:mm`，nullable
- `createdAt`
- `updatedAt`
- `deletedAt` nullable

兼容说明：

- 当前前端类型用 `tags: string[]`，但实际 UI 是单选分类，读取 `tags[0]`。
- 后端应以 `categoryId` 建模；接口响应短期可返回 `tags: [category.name]` 兼容前端。
- `plainText` 和 `wordCount` 应由后端根据净化后的正文计算，不能完全信任前端传值。

### Category

字段建议：

- `id`
- `userId`
- `name`
- `sortOrder`
- `createdAt`
- `updatedAt`

业务规则：

- 同一用户下 `name` 唯一。
- 删除分类不删除日记，相关日记变为未分类。
- 重命名分类不需要批量改日记正文或历史内容，因为日记引用 `categoryId`。

### AppSettings

字段建议：

- `userId`
- `theme`
- `fontSize`
- `autoSaveInterval`
- `updatedAt`

业务规则：

- UI 偏好可以放服务端，也可以在前端 `localStorage` 缓存。
- `hasPassword/passwordHash` 不应继续放在通用配置中；认证信息归属 `User`。

### Attachment

当前图片以 base64 形式直接存进富文本 HTML。第一阶段可以兼容读取，但后端设计应预留附件模型。

字段建议：

- `id`
- `userId`
- `entryId`
- `mimeType`
- `size`
- `storageKey`
- `createdAt`

迁移策略：

- 第一阶段允许 `contentHtml` 中保留 data URL，限制请求体大小。
- 第二阶段新增图片上传 API，把正文中的 data URL 替换成 `/api/attachments/:id`。

## API 路由设计

统一前缀：`/api/v1`

### 健康检查

```http
GET /api/v1/health
```

返回：

```json
{ "ok": true }
```

### 认证与会话

第一阶段最小集合：

```http
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/session
PUT  /api/v1/auth/password
DELETE /api/v1/auth/password
```

规则：

- `login` 校验密码，建立 httpOnly session cookie。
- `session` 返回是否已登录、当前用户基础信息。
- 如果未设置密码，本地部署模式可自动建立默认会话。
- 后续如果要多端同步，必须把所有业务 API 都放在认证中间件之后。

### 日记

```http
GET    /api/v1/entries
POST   /api/v1/entries
GET    /api/v1/entries/:id
PUT    /api/v1/entries/:id
DELETE /api/v1/entries/:id
```

`GET /entries` 查询参数：

- `keyword`
- `mood`
- `categoryId`
- `uncategorized=true`
- `date`
- `dateFrom`
- `dateTo`
- `includeDeleted=false`
- `limit`
- `cursor`
- `sort=dateFor_desc|updatedAt_desc`

默认规则：

- 默认不返回 `isDeleted=true` 的日记。
- 列表按 `dateFor desc, timeFor desc, updatedAt desc` 排序，比当前只按 `dateFor` 更稳定。
- `keyword` 搜索标题、纯文本、分类名。
- `DELETE /entries/:id` 是软删除：设置 `isDeleted=true, deletedAt=now, updatedAt=now`。

创建/更新请求：

```json
{
  "title": "围城内外",
  "contentHtml": "<p>...</p>",
  "mood": "calm",
  "categoryId": "cat_...",
  "dateFor": "2026-06-13",
  "timeFor": "15:19",
  "isLocked": false
}
```

后端必须执行：

- 净化 `contentHtml`，允许 Quill 常用标签，禁止脚本、事件属性和危险 URL。
- 从净化后的 HTML 生成 `plainText`。
- 计算 `wordCount`。
- 校验 `mood` 属于前端 `MoodType` 枚举。
- 校验 `dateFor/timeFor` 格式。
- 更新 `updatedAt`，创建时设置 `createdAt`。

### 回收站

```http
GET    /api/v1/trash/entries
POST   /api/v1/trash/entries/:id/restore
DELETE /api/v1/trash/entries/:id
DELETE /api/v1/trash/entries
```

规则：

- `GET` 只返回 `isDeleted=true` 的日记。
- `restore` 设置 `isDeleted=false, deletedAt=null, updatedAt=now`。
- `DELETE /trash/entries/:id` 是物理删除。
- `DELETE /trash/entries` 清空当前用户回收站。

### 分类

```http
GET    /api/v1/categories
POST   /api/v1/categories
PUT    /api/v1/categories/:id
DELETE /api/v1/categories/:id
```

规则：

- `POST` 创建分类，名称 trim 后不能为空。
- `PUT` 重命名分类，同用户下不能重名。
- `DELETE` 删除分类后，所有引用该分类的日记设为未分类。
- 响应可带 `entryCount`，用于前端分类面板。

### 设置

```http
GET   /api/v1/settings
PATCH /api/v1/settings
```

字段：

- `theme`
- `fontSize`
- `autoSaveInterval`

规则：

- 密码不放在 settings API 中。
- 前端可继续用 `localStorage` 缓存主题，启动后再用服务端设置覆盖。

### 统计

```http
GET /api/v1/stats/overview
```

返回结构：

```json
{
  "total": 12,
  "totalWords": 34567,
  "moodCount": { "calm": 4, "happy": 2 },
  "dailyWords": [{ "date": "2026-06-12", "count": 800 }],
  "streak": 3,
  "maxStreak": 8
}
```

规则：

- 统计不包含回收站日记。
- 日期计算必须用本地日期语义，不能用 UTC `toISOString().split("T")[0]` 代替。
- `dailyWords` 默认近 30 天，后续可加 `days` 查询参数。

### 导入导出

```http
GET  /api/v1/export/json
GET  /api/v1/export/markdown
POST /api/v1/import/json
```

规则：

- JSON 导出只导出当前用户数据，默认不包含回收站；后续可加 `includeDeleted=true`。
- Markdown 导出使用服务端 HTML 到文本/Markdown 转换。
- JSON 导入复用后端日记校验和 HTML 净化逻辑。
- 导入策略第一阶段采用 upsert：有 `id` 则更新/覆盖，无 `id` 则新建。

### 附件

第二阶段接口：

```http
POST   /api/v1/attachments
GET    /api/v1/attachments/:id
DELETE /api/v1/attachments/:id
```

第一阶段可先不实现，但需要在后端限制 `contentHtml` 体积，避免 base64 图片导致请求过大。

## 前端服务层改造边界

不要让页面直接感知 IndexedDB 或 fetch 细节。建议新增：

```text
src/services/
  apiClient.ts
  entriesService.ts
  categoriesService.ts
  settingsService.ts
  statsService.ts
  importExportService.ts
```

迁移策略：

1. 先保留 `src/db/database.ts`，新增 service 接口与当前函数同名或近似同名。
2. 页面只调用 service，不再直接 import `db/database.ts`。
3. service 初期可以走 IndexedDB；后端 API 完成后切换到 HTTP。
4. 最后移除或降级 IndexedDB 为离线缓存。

## 数据迁移策略

从当前 IndexedDB 到后端：

1. 用户首次连接后端时，前端读取 IndexedDB 全量数据。
2. 调用 `POST /api/v1/import/json` 上传 `{ entries, config }`。
3. 后端规范化数据：
   - `content` -> `contentHtml`
   - `tags[0]` -> `category.name` -> `categoryId`
   - 缺失 `isDeleted` 视为 `false`
   - 非法 mood 归为 `none`
4. 导入成功后，前端标记迁移完成。
5. 后续以服务端数据为准。

## 推荐后端技术路线

为了贴合现有 TypeScript 项目，建议：

- Runtime: Node.js + TypeScript
- Web framework: Fastify
- Database: SQLite 起步，后续可迁 PostgreSQL
- ORM/query: Prisma 或 Drizzle
- Auth: httpOnly cookie session
- Validation: Zod
- HTML sanitize: `sanitize-html` 或同等白名单净化库
- Test: Vitest + Supertest/undici

目录建议：

```text
server/
  src/
    app.ts
    main.ts
    config.ts
    plugins/
      db.ts
      auth.ts
    modules/
      auth/
      entries/
      categories/
      settings/
      stats/
      import-export/
    shared/
      validation.ts
      sanitize.ts
      date.ts
  prisma/ 或 db/
  package.json
```

## 实施计划

### 阶段 1：后端骨架

- 初始化 `server` TypeScript 工程。
- 建立 Fastify 应用、健康检查、错误响应格式。
- 建立数据库连接和迁移工具。
- 写基础测试，确保 `GET /api/v1/health` 可用。

验收：

- `npm run build` 或后端等价构建通过。
- 后端测试能启动应用并访问 health。

### 阶段 2：数据模型和日记 API

- 建表：users、entries、categories、settings。
- 实现 entries CRUD、软删除、详情读取。
- 实现 HTML 净化、纯文本提取、字数计算。
- 补日记 API 单元/集成测试。

验收：

- 创建、编辑、列表、详情、软删除 API 流程通过测试。
- 非法 mood/date/time 被拒绝或规范化策略明确。

### 阶段 3：分类、回收站、统计

- 实现 categories API。
- 实现 trash API。
- 实现 stats overview。
- 确保统计和分类计数排除回收站数据。

验收：

- 删除分类后日记变为未分类。
- 回收站恢复、彻底删除、清空流程通过测试。
- 统计结果与构造数据一致。

### 阶段 4：设置、导入导出、认证

- 实现 settings API。
- 实现 JSON/Markdown 导出和 JSON 导入。
- 实现本地单用户密码登录/session。

验收：

- settings 持久化可用。
- 导入当前前端备份文件后，列表/详情/统计数据一致。
- 未登录访问业务 API 被拦截；未设置密码的本地模式有明确策略。

### 阶段 5：前端接入

- 新增 `src/services`，先替换页面对 `db/database.ts` 的直接调用。
- 增加 API client、错误处理、加载状态。
- 将日记、分类、回收站、统计、设置页面逐步切到后端 API。
- 保留 IndexedDB 导入迁移入口。

验收：

- 前端所有现有页面在后端模式下功能等价。
- 从旧 IndexedDB 数据导入后能正常查看、编辑、删除、恢复、统计。

## 未决问题

- 是否需要多用户注册，还是长期只做本地单用户？
- 服务端数据库最终选 SQLite 还是 PostgreSQL？
- 图片是否第一阶段就迁移为附件，还是先保留正文 base64？
- `isLocked` 当前没有完整解锁流程，后端是否要做单篇日记加密/锁定？
- 导入时同 ID 日记是覆盖、跳过，还是生成副本？
- “清空所有数据”是否应同时清空设置、分类和回收站，还是只清空日记？

