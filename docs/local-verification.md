# Phase 1 本地真实验收说明书（解锁 Codex 的 PG 阻塞）

> 背景：Codex 已完成 Phase 1 后端骨架，但自报两个阻塞——「无 Git」与「无 PostgreSQL」。
> - **Git**：已在 WorkBuddy 内初始化仓库（main 分支，基线提交 `9504e83`），阻塞已解除。
> - **PostgreSQL**：WorkBuddy 沙箱会拦截外部下载的 `.exe`，**无法在 WorkBuddy 的 Bash/PowerShell 内启动真实 PG**。
>   因此需要在本机「系统终端」（CMD/PowerShell，非 WorkBuddy 内）手动起 PG 并跑集成测试。

---

## 为什么必须做这一步
Codex 的 3 个集成测试（登录→录入→落库）、Alembic 迁移实跑（upgrade/downgrade）、以及给 openapi 已实端点打 `x-status: implemented`，都依赖一个**真实可达的 PostgreSQL**。
这些在单元测试里被 `pytest.skip`（无 `TEST_DATABASE_URL` 时整批跳过），所以目前仓库是「10 passed / 3 skipped」——主体扎实，但集成层未验证。

---

## 步骤 1：在本机系统终端启动 PostgreSQL

1. 打开**系统 CMD 或 PowerShell**（不要用 WorkBuddy 里的 Bash/PowerShell 工具——那在沙箱中，会拦截 exe）。
2. 运行：
   ```
   G:\多agent协作\微信公众\小程序\从认知到执行\.tools\setup-postgres.bat
   ```
3. 看到 `POSTGRES_READY` 与版本号即成功。默认端口 5432，trust 免密，库 `zhiji` / `zhiji_test` 已建好。
   - 停止：`G:\多agent协作\微信公众\小程序\从认知到执行\.tools\pgsql\bin\pg_ctl.exe -D G:\多agent协作\微信公众\小程序\从认知到执行\.tools\pgdata stop`

---

## 步骤 2：在 backend 用受管 venv 跑迁移与集成测试

在系统终端（可仍在 WorkBuddy 外，或任意能访问 venv 的终端）执行：

```bat
REM 1) 激活受管 venv（依赖已装好：fastapi/sqlalchemy/asyncpg/alembic/pytest…）
C:\Users\Administrator\.workbuddy\binaries\python\envs\zhiji-backend\Scripts\activate.bat

REM 2) 进入 backend
cd /d G:\多agent协作\微信公众\小程序\从认知到执行\backend

REM 3) 设连接串（trust 免密，用 postgres 超级用户）
set DATABASE_URL=postgresql+asyncpg://postgres@localhost:5432/zhiji
set TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:5432/zhiji_test
set JWT_SECRET_KEY=dev-secret-change-me-please-rotate-0123456789
set FERNET_ENCRYPTION_KEY=<backend\.env 中已有的 44 字符值>
set WX_APP_ID=
set WX_APP_SECRET=

REM 4) Alembic 迁移实跑（升级 + 回滚验证）
alembic upgrade head
alembic downgrade -1 && alembic upgrade head

REM 5) 跑全部测试（此时 3 个集成测试应跑通，不再 skip）
pytest -q
```

期望结果：`13 passed`（原 10 + 新增 3 集成），覆盖率 ≥70%。

---

## 步骤 3：让 Codex 给已实端点打 implemented 并提 PR

集成测试全绿后，给 Codex 派发一句（或参考 `docs/agents/dispatch-codex.md` 风格）：
> Phase 1 真实 PG 验收已通过（alembic upgrade/downgrade 实跑 OK，pytest 13 passed）。
> 请在 `docs/api/openapi.yaml` 中为已实现的端点补充 `x-status: implemented`，并提 PR 到 main。

---

## 步骤 4：Tech Lead 收口（Claude Code）

收到 PR 后我执行 Checkpoint #2：
- 复核 openapi 端点 `x-status` 与代码一致（门禁 1）
- 合并 PR、打 tag `phase1-verified`
- 更新 `docs/integration-checkpoints.md`
- 通知 DeepSeek：后端契约已冻结可联调

---

## 备选方案（如本机起 PG 仍有困难）

- **B. 暂跳过真实 PG**：先加 openapi 契约漂移自动检查（schemathesis/prance diff）固化门禁 1，集成测试推迟到部署阶段（Codex 亦曾建议）。DeepSeek 可立即并行联调 mock。
- **C. SQLite 冒烟**（不推荐）：需 Codex 改驱动/JSONB 以适配 async SQLite，偏离真实部署形态，违反契约优先原则。
