# 集成检查点（Integration Checkpoints）

> Tech Lead（Claude Code）按 9 质量门禁主持的周期性评审记录。两 Agent 自行阅读，不私聊。
> 检查点结论即 Aurora KB 的"仲裁留痕"。

---

## Checkpoint #1 · 2026-10-19

### 背景
- Codex 报告 Phase 1 后端骨架已实现（路径 `backend/`），并附本地验证：ruff + mypy 通过；pytest 10 passed / 3 skipped，覆盖率 70.17%；Alembic upgrade/downgrade SQL 可生成。
- 环境缺两件基础设施：① 无 Git 元数据；② 无 PostgreSQL → 集成测试跳过、迁移未实跑、端点未标 `x-status: implemented`。
- Gemini 确认已读 `gemini-prompt.md`，理解边界与 Aurora KB 协作，要求"减少中间人损耗"（需求不二次转述）。

### QC 核验（Tech Lead 实地读码）
- **门禁 1 契约一致性**：openapi.yaml 12 个端点 ↔ `app/routers.py` 全部对齐；`TokenResponse/EventCreate/GoalCreate/PlanCreate/AnalyticsSummary` 字段逐一比对一致 ✅
- **门禁 2 迁移可回溯**：`alembic/versions/0001_initial_schema.py` 建 users/events/tags/goals/plans 五表 + 枚举 + 索引，`upgrade()`/`downgrade()` 完整可逆 ✅
- **门禁 5 类型安全**：mypy 通过、Pydantic v2 校验 ✅
- **门禁 6 安全/隐私**：密钥/微信凭证走 env（`.env.example` 空壳）；health/consumption 事件 `payload` 经 Fernet 应用层加密落库（密文 `_encrypted`），API 出口解密 ✅
- **门禁 3 覆盖率**：70.17% ≥ 70% ✅（但 3 项跳过的是需 PG 的关键路径集成测试）

### 未决项（阻塞 Phase 1 验收）
1. **PostgreSQL 缺失**：真实 `login→录入→落库` 集成测试未跑；migration 未在真实库执行 upgrade/downgrade；端点未标 `x-status: implemented`。→ 等 PO 选定 PG 方案后由 Codex 补跑。
2. **refresh token 无刷新端点**：当前仅签发不提供刷新 API（与契约一致，v1 可接受，记录为已知限制）。

### 决议
- **初始化 Git 仓库**（本提交）：Aurora KB 自此具备版本历史，Codex 可 `git pull` / 提 PR，契约变更可追溯。
- **PostgreSQL 方案**：待 PO 拍板（本地 Docker / 托管云 / 暂以 CI 契约测试替代）。
- **Gemini Phase 2 批准启动**：基于 `openapi.yaml` v1.0 生成 TS 客户端 + 四页面（登录/录入/看板/方案）；**真实 e2e 联调待 Codex 在 PG 验证后标 `x-status: implemented` 再碰**。
- **角色澄清（回应 Gemini「减中间人」）**：Aurora KB 已是前后端直接通道，我**不中转需求**；我的职责是 QC 门禁评审与契约冲突仲裁，不是传话。两 Agent 继续只对文档说话。

### 下一步
- Codex：PG 到位后补跑集成测试 + 实跑 migration + 给已实现端点打 `x-status: implemented` + 提 PR。
- Gemini：启动 Phase 2 前端骨架，client 由 openapi 生成；未标 implemented 的端点先留 UI 占位。
- Tech Lead：收 Codex PR 后做 Checkpoint #2 评审；并推动在 CI 加 openapi 契约漂移测试（schemathesis / openapi diff）固化门禁 1。
