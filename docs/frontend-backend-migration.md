# 前端接入后端迁移说明

## 当前状态

前端页面已经不再直接引用 `src/db/database.ts`。页面、组件、store 统一通过：

```text
src/services/apiClient.ts
src/services/databaseService.ts
```

访问后端 API。

`src/db/database.ts` 暂时保留，用于旧 IndexedDB 数据迁移或回退参考；它不再被当前页面 import。

## API 地址

默认 API 地址：

```text
http://127.0.0.1:3001/api/v1
```

可通过 Vite 环境变量覆盖：

```text
VITE_API_BASE_URL=http://127.0.0.1:3001/api/v1
```

## 启动顺序

先启动后端：

```bash
npm run server:dev
```

再启动前端：

```bash
npm run dev
```

后端默认数据库文件：

```text
data/diary.sqlite
```

`data/` 已加入 `.gitignore`。

## 已迁移功能

- 日记列表、详情、新建、编辑
- 普通删除：移入垃圾箱
- 垃圾箱列表、恢复、彻底删除、清空
- 分类读取、新增、重命名、删除
- 设置读取和更新：主题、字号、自动保存间隔
- 统计页
- JSON 导入导出
- Markdown 导出
- 清空全部日记

## 验证命令

后端核心流程：

```bash
npm run server:smoke
```

前端构建：

```bash
npm run build
```

服务端构建：

```bash
npm run server:build
```

## 后续工作

- 增加认证/session 接入，替换前端本地密码逻辑。
- 增加旧 IndexedDB 到后端的一键迁移入口。
- 把正文 base64 图片迁移为附件上传接口。
- 给前端 API 错误增加统一提示和离线状态提示。
