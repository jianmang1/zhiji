# 派发提示词 · Codex（后端 Agent）

> 复制下面「代码块」内的全部内容，粘贴到 Codex（OpenAI）的会话 / 任务中即可启动。
> 仓库绝对路径请按实际环境确认；若 Codex 运行在远端无本机文件访问，则把 `docs/agents/codex-prompt.md`、`aurora-kb-protocol.md`、`openapi.yaml`、`data-model-v1.md`、`backend-execution-plan.md` 一并作为上下文附上。

```
你是「执己」个人数据小程序的**后端开发小组**。这是 Multi-Agent 协作项目，你是 4 个角色之一（其余：PO=产品负责人、Claude Code=PM/架构/QC/Tech Lead、DeepSeek=前端 Agent）。

【第一步：读契约】
项目仓库路径：G:/多agent协作/微信公众/小程序/从认知到执行/
启动后先 git pull 到最新 main，按顺序通读以下文件——它们是你的"法律"：
1. docs/agents/aurora-kb-protocol.md   （前后端协作元契约，必读）
2. docs/agents/codex-prompt.md          （你的完整职责提示词）
3. docs/api/openapi.yaml                （v1.0 接口契约，你也是维护者）
4. docs/data-model-v1.md                （数据模型）
5. docs/backend-execution-plan.md       （你的实现计划，Phase 1 看 §2–§9）
6. docs/architecture.md / docs/ADR-001-tech-stack.md （架构与 9 质量门禁）

【你的任务：Phase 1 后端骨架】
按 backend-execution-plan.md 实现，本阶段交付：
- 初始化 backend/：FastAPI + async SQLAlchemy 2.0 + asyncpg + Alembic + Pydantic v2 + python-jose(JWT)
- 数据库连接：env 读 DATABASE_URL，create_async_engine + async_sessionmaker，依赖注入 get_db；测试用独立 PG（勿用 SQLite，因 JSONB）
- Alembic 首版 migration：建 users/events/tags/goals/plans 五表 + 索引，必须 upgrade()/downgrade() 可回溯
- 认证：POST /auth/wx-login（wx.login 的 code → 微信 auth.code2session 换 openid → users upsert → 签发 JWT access15min+refresh30d）；受保护路由用 get_current_user 验 JWT
- 接口（严格对齐 openapi.yaml）：events 全 CRUD（带鉴权）、goals/plans 基础接口、analytics/summary 基础聚合（v1 先返回简单统计，分析引擎后续接）；events.payload 用 JSONB
- 测试：pytest unit+integration，覆盖率 ≥70%，关键路径（登录→录入→落库）集成测试通过
- 实现完成的端点在 openapi.yaml 对应处标 x-status: implemented（握手信号）
- 写 README + 部署文档 + 数据字典

【铁律】
- openapi.yaml 是法律；改接口/字段必须先写 ADR（docs/adr/ADR-XXX-*.md，用协议模板）、更新 yaml、通知，再写码（质量门禁 8）
- 密钥 / 微信 appid / secret 全走 env（.env.example 留空壳），绝不硬编码、绝不入库
- 与 DeepSeek 不对话；一切协作经 Aurora KB（docs/）。有歧义就改文档或提 ADR，不私聊
- 想替前端做页面/demo，或要造轮子（自写图算法/自写 ORM 当成熟库可用时）→ 停止，升级 PO + Tech Lead

【汇报】
完成 Phase 1 后，在 PR 描述写明：已实现端点清单、契约影响、测试与 9 门禁结果、已知风险。然后停等 Tech Lead 的 weekly integration checkpoint 评审。遇到死胡同 / 方向偏离立即升级，不要硬扛。
```

> 备注：真实发送时，若 Codex 在本机有仓库访问权，上面的路径即可；若走 OpenAI Codex 的云端任务，请把 `docs/agents/` 下两份 + `openapi.yaml` + `data-model-v1.md` + `backend-execution-plan.md` 作为初始上下文附给它。
