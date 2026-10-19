# 执己 · 项目启动会纪要（四方对齐）

- 时间：2026-10-19
- 参与者：产品负责人（PO）／ Claude Code（我，PM+架构+QC+Tech Lead）／ Codex（后端 Agent）／ Gemini（前端 Agent）
- 目标：技术细节打通（数据库连接、认证、部署）；明确 OpenAPI 协作方式；通过职责提示词锁死 Agent 边界

## 一、技术细节决议
1. **数据库连接**：async SQLAlchemy + asyncpg；连接串走环境变量（不入库）；Alembic 管理 migration，每版含 up/down；使用托管 PostgreSQL（启用 JSONB）。测试用独立 PG 实例（避免 SQLite 不支持 JSONB）。
2. **认证方案**：微信 MP `wx.login()` → `code` → `POST /auth/wx-login` → 后端 `auth.code2session`（appid+secret+code）换 `openid` → `users` 表 upsert → 签发 JWT（access 15min + refresh 30d）。前端仅做登录 UI 与 token 存储；密钥/凭证全走 env。
3. **部署架构**：后端容器化、公网 HTTPS（如腾讯云容器/Cloud Run）+ 托管 PostgreSQL；前端编译微信小程序 + H5，经微信 MP 后台上传；dev/prod 环境隔离。个人敏感字段应用层加密 + TLS（ADR-001 §5）。

## 二、前后端协作方式（OpenAPI 契约）
- `docs/api/openapi.yaml`（v1.0）是**唯一接口契约**。
- **Codex 产出并维护**契约与后端实现；**Gemini 消费契约**生成 TS 客户端（`openapi-typescript`/`orval`）。
- 契约歧义/变更：先写 ADR、更新 `openapi.yaml`、通知对方（质量门禁 8）。**两 Agent 互不直连**。

## 三、Agent 边界（最关键产出）
- 职责提示词定稿：`docs/agents/codex-prompt.md`、`docs/agents/gemini-prompt.md`
- 每条均含「You ARE responsible for」+「You are NOT responsible for」+ Aurora KB 协议 + 质量门禁 + 升级机制
- **Aurora KB = 仓库 `docs/` + `docs/api/openapi.yaml`**，作为前后端唯一共享知识库与契约源
- 越界/卡死 → 升级 PO + Tech Lead，不自行造轮子、不私下改契约

## 四、会议输出物
- `docs/architecture.md` —— 产品形态/框架职责/系统架构/DB 设计/API 概览/Phase/验收
- `docs/api/openapi.yaml` —— API 合约 v1.0
- `docs/backend-execution-plan.md` —— 后端详细实现计划（Codex）
- `docs/frontend-execution-plan.md` —— 前端详细实现计划（Gemini）
- `docs/agents/codex-prompt.md` —— 后端职责提示词（含契约铁律 + 升级触发清单 + DoD）
- `docs/agents/gemini-prompt.md` —— 前端职责提示词（含契约铁律 + 升级触发清单 + DoD）
- `docs/agents/aurora-kb-protocol.md` —— **Aurora KB 协作协议（元契约）**：KB 内容地图 / 启动必读 / 变更门禁 / 握手机制 / 冲突仲裁，是两份提示词的上级协议

## 五、下一步
- Codex → Phase 1（后端骨架）；Gemini → Phase 2（前端骨架）
- 我（Tech Lead）主持 **weekly integration checkpoint**，按 9 质量门禁评审，处理契约冲突与升级
- Phase 3 联调 + 公网部署；Phase 4 接入多 AI 分析层产出 plans
