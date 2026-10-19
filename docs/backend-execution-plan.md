# 后端执行计划（Codex）

> 角色：后端开发小组。唯一接口契约：`docs/api/openapi.yaml`（v1.0）。唯一数据契约：`docs/data-model-v1.md`。协作中枢：Aurora KB（`docs/`）。**禁止与前端 Agent 直接对话**，契约疑问/变更走 ADR 并更新 KB。

## 1. 技术栈
- Python 3.11+ / FastAPI / SQLAlchemy 2.0（async）
- 驱动：asyncpg；Migration：Alembic
- 校验：Pydantic v2；鉴权：python-jose（JWT）+ 微信 MP `auth.code2session`
- 测试：pytest + httpx（ASGI TestClient）；覆盖率 pytest-cov
- 配置：pydantic-settings（环境变量，禁止硬编码密钥）

## 2. 仓库结构
```
backend/
  app/
    main.py            # FastAPI 入口
    core/config.py     # 环境变量
    core/security.py   # JWT / 微信登录
    db/session.py      # async engine + session
    models/            # SQLAlchemy 模型（users/events/tags/goals/plans）
    schemas/           # Pydantic（请求/响应，对应 openapi）
    routers/           # auth, events, goals, plans, analytics
    services/          # 业务逻辑（分析占位）
  alembic/             # migration
  tests/
  pyproject.toml
```

## 3. 数据库连接
- `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/zhiji`（env，不入库）
- `db/session.py`：`create_async_engine` + `async_sessionmaker`；依赖注入 `get_db`
- 本地用托管 PG 或 Docker PG；测试用独立 PG（avoid SQLite，因 JSONB）

## 4. Alembic
- `alembic init`；`env.py` 接入 async engine
- 每版 migration 含 `upgrade()` / `downgrade()`（门禁 2）
- 首版：建 users/events/tags/goals/plans 五表 + 索引

## 5. 认证（微信 MP OAuth）
- 前端 `wx.login()` → `code` → `POST /auth/wx-login {code}`
- 后端用 `appid`+`secret`+`code` 调微信 `auth.code2session` 换 `openid`
- `users` 表 upsert(openid)；签发 JWT：`access_token`(15min) + `refresh_token`(30d)
- 受保护路由依赖 `get_current_user`（验 JWT → user_id）
- 密钥/微信凭证全部来自 env（门禁 6）

## 6. 接口实现顺序（对齐 openapi.yaml）
1. `POST /auth/wx-login`
2. `GET/POST /events` + `GET/PUT/DELETE /events/{id}`
3. `GET/POST /goals`
4. `GET/POST /plans`
5. `GET /analytics/summary` + `GET /analytics/domain/{domain}`（v1 返回基础聚合，分析引擎后续接）

## 7. 数据模型映射
- SQLAlchemy 模型字段严格对应 `data-model-v1.md` 表结构
- `events.payload` 用 JSONB；输入按 `domain+type` 轻校验（不预建子表）
- `events.ts` 建索引；`events(user_id, ts)` 复合索引

## 8. 测试与质量门禁
- pytest：unit（services/schemas）+ integration（TestClient 走全链路）
- 覆盖率 ≥70%（门禁 3）；关键路径集成测试：登录→录入→落库（门禁 4）
- 类型安全：开 `mypy`/type hints（门禁 5）
- 安全门：无硬编码密钥、输入校验、JWT 鉴权（门禁 6）
- 性能：API P95 <300ms（门禁 7）

## 9. 里程碑（Phase 1，验收）
- [ ] 项目可启动、连 PG、Alembic 可 up/down
- [ ] `/auth/wx-login` 真实走通微信登录换 JWT
- [ ] events 全 CRUD 通过契约、带鉴权
- [ ] goals/plans/analytics 接口可用
- [ ] 单测覆盖率 ≥70%，集成测试通过
- [ ] README + 部署文档 + 数据字典齐备（门禁 9）

## 10. 非目标（v1 不做）
- UI / 前端状态 / 客户端路由 / 浏览器兼容（属 Gemini）
- 复杂图算法 / Neo4j（触发条件见 ADR-001 §4）
- 多租户权限细分（单用户起步）

## 11. 协作约束
- 只读 Aurora KB（`docs/` + `openapi.yaml`）；实现须匹配契约
- 若契约有歧义/需改：在 `docs/` 提 ADR，更新 `openapi.yaml`，并通知（门禁 8）
- 陷入死胡同或方向偏离：升级给 PO + Tech Lead（我），不自行造轮子
