# 云同步技术规划与实现流程

## Summary

第一版实现本地优先的云同步，不接入 VIP 权限。浏览器 IndexedDB 是离线写入入口，后端是多设备同步中心。页面保存数据时先写本地，再写入待同步队列；同步引擎后台推送本地变更并拉取其他设备变更。

## Data Model

本地 IndexedDB 保留日记、分类、设置，并新增同步状态：

```ts
serverVersion: number;
syncStatus: 'synced' | 'pending' | 'conflict';
deletedAt?: string;
lastSyncedAt?: string;
```

本地新增 `outbox` 和 `syncMeta`：

```ts
{
  mutationId: string;
  entityType: 'entry' | 'category' | 'setting';
  entityId: string;
  op: 'create' | 'update' | 'delete';
  payload: unknown;
  baseVersion: number;
  createdAt: string;
  retryCount: number;
}
```

服务端在现有表增加 `server_version` 和 `client_updated_at`，新增 `devices` 和 `sync_log`。`sync_log.id` 是增量同步 cursor。

## API

```http
GET  /api/v1/sync/status
POST /api/v1/sync
```

请求：

```json
{
  "deviceId": "device_xxx",
  "sinceCursor": "123",
  "mutations": []
}
```

响应：

```json
{
  "cursor": "124",
  "serverTime": "2026-06-16T10:01:00.000Z",
  "applied": [],
  "conflicts": [],
  "changes": {
    "entries": [],
    "categories": [],
    "settings": [],
    "tombstones": []
  }
}
```

## Conflict Policy

如果本地 mutation 的 `baseVersion` 落后于云端 `serverVersion`，服务端返回 conflict，不覆盖云端。客户端应用云端版本，并把本地未同步版本另存为“冲突副本”。

## Implementation Flow

1. 扩展 IndexedDB schema，增加本地 outbox 和 sync metadata。
2. 前端 service 先读写 IndexedDB，变更入队后后台触发同步。
3. 后端增加同步字段、设备表、同步日志表。
4. 新增 `/api/v1/sync`，实现幂等 mutation、版本检查、增量拉取。
5. 前端新增 `syncService`，处理 push/pull、失败重试、cursor 更新、冲突副本。
6. 设置页显示同步状态和“立即同步”按钮。

## Verification

```bash
npm run server:build
npm run server:smoke
npm run build
```

手工验证：两个浏览器登录同一账号，分别测试新建、编辑、删除、离线后恢复、同篇冲突编辑。
