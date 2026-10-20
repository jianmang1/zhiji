# 四方对齐章程（v2 · 重对齐 · 2026-10-20）

> 本文件是 **四方对齐（Kickoff Re-alignment）** 的产出物，取代 `kickoff-meeting-notes.md`（v1 记录的是 Gemini+openapi/FastAPI 旧栈，已过期，保留作历史）。
> 对齐目的：架构 pivot（CloudBase 原生）+ 前端 Agent 切换（Gemini→DeepSeek）后，让 4 个角色的提示词/计划指向同一份最新事实，避免重蹈 Gemini 按 stale 上下文虚报的覆辙。
> 参考：知乎《Multi-Agent 协作开发实战》（Ariadne 项目）验证本框架 Phase 2 质量 83.8%/A-、API 对齐 100%、效率 +20%、零集成 bug；其"四方对齐 + Aurora KB 伪交流 + Tech Lead 救火"为本项目同源方法论。

---

## 1. 参与方（四方）

| 角色 | 担当 | 当前实现 | 职责边界文件 |
|---|---|---|---|
| 产品负责人（PO） | 人类 | 甲方+乙方老板+技术审核+风险控制 | — |
| PM / 架构 / QC / Tech Lead | Claude Code（本会话） | 计划、选型、契约、门禁评审、救火 | — |
| 后端 Agent | Codex | CloudBase Python 云函数 | `docs/agents/codex-prompt.md` |
| 前端 Agent | **DeepSeek**（原 Gemini） | Taro 4 + CloudBase JS SDK v3 | `docs/agents/deepseek-prompt.md` / `dispatch-deepseek.md` / `deepseek-startup-prompt.txt` |

---

## 2. 已达成共识（四方必须一致遵守）

1. **技术栈已 pivot 到 CloudBase 原生**（见 `docs/ADR-002-cloudbase-native.md`）：弃用 `openapi.yaml` + `backend/`(FastAPI) 旧路径。
2. **唯一数据契约 = `docs/cloudbase-contract.md`**（4 表 events/tags/goals/plans + RLS + 云函数签名），是前后端的"法律"，取代 OpenAPI。
3. **鉴权/数据通道**：登录走 `cloud.auth`（微信登录，不签发 JWT）；数据走 `cloud.rdb()`（受 RLS 按 `user_id=auth.uid()` 隔离）；敏感域（health/consumption）加密落库。
4. **后端现状**：Codex 三云函数 `recordEvent` / `listEvents` / `generatePlan` 已写、QC 通过（16 单测、覆盖 77%、ruff/mypy 零错）、已推送 GitHub `jianmang1/zhiji`。
5. **前端现状**：Phase 2 前端骨架**尚未启动**（仓库无 `frontend/`），待 DeepSeek 按 `deepseek-startup-prompt.txt` 启动。
6. **协作通道 = Aurora KB（`docs/`）**：Codex 与 DeepSeek **不直连**，仅经文档说话；契约变更走 ADR + 通知对方重读。
7. **9 个质量门禁**（详见 ADR-002）：契约一致 / 迁移可回溯 / TS strict / 关键路径 e2e(登录→录入→看板) / 零 any / 安全 / 性能(首屏<2s) / 契约变更走 ADR / 文档齐备。
8. **防虚报硬门禁（post-Gemini 教训，强制）**：DeepSeek 汇报"完成"须附 ①真实分支名 ②提交哈希 ③可复现 `taro build`+`vitest` 日志 ④PR 链接；GitHub 远端 `git ls-tree` 查不到 `frontend/` 一律判"未完成"；连续两次 REJECT 后 Tech Lead 接管。
9. **产品形态权威 = `docs/product-definition.md`（v0.2）**：执己定位为 **C 端上架**的「XX王人格化 + 新粗野主义(Neo-Brutalism)」微信小程序。**v1 仅三王**：健康→薄肌王、工作→力王、`dating`→黄毛王(异性交往，原消费维度已取消)；能力/兴趣 v1 不做。每王含热点打卡 + 规则引擎评分 + LLM 意见(`generatePlan`)；手动打卡式录入。数据契约 `cloudbase-contract.md` 已同步 domain=`('health','work','dating')` 并新增迁移 `20261020171000_adjust_domains.sql`。未定项见 product-definition.md §12 TODO。

---

## 3. 本次对齐新增/强化的工程规则（来自 Ariadne 案例复盘）

- **R1 需求写 What+Why，不写 How**：PO 给 DeepSeek 派发时描述目标与理由，禁止规定实现细节（避免机械产出漏洞代码）。
- **R2 迭代 3 次上限**：同一问题改 3 次未解即停，升级 PO + Tech Lead，由 Tech Lead 给新思路；不轻易清空 Context（防丢失隐性知识）。
- **R3 量化门禁**：单测覆盖后端拟提至 ≥80%（当前 77% 已近达标）、前端 ≥70%；不用"代码质量好"等主观词。
- **R4 诚实技术审核**：PO 把控防止 Agent 造轮子（如自写状态库/路由库/Node 中间层）。

---

## 4. 开放项 / 下一步（对齐后行动）

- [ ] PO 将 `deepseek-startup-prompt.txt` 全文 + 5 份上下文文档（`deepseek-prompt.md`/`aurora-kb-protocol.md`/`cloudbase-contract.md`/`frontend-execution-plan.md`/`ADR-002-cloudbase-native.md`）交给 DeepSeek，启动 Phase 2。
- [ ] Codex 按 `cloudbase/README.md` 用 `tcb fn deploy --httpFn` 部署三云函数，做云端 RLS 隔离 + LLM 联调（门禁 7 后半段）。
- [ ] DeepSeek 按 §10 硬门禁每模块提 PR；Tech Lead 做 weekly integration checkpoint 评审。
- [ ] `/plans` 真实数据待 `generatePlan` 云函数联调后接入（前端先占位）。
- [ ] ReactFlow 血缘图小程序端兼容性 spike（文章仅验证 Web 端 1000+ 节点）。
- [ ] GitHub 仓 `jianmang1/zhiji` 建议设为 Private（若尚未）。
- [ ] 后端单测门禁由 ≥70% 上调至 ≥80%（R3，待 PO 确认）。
- [ ] 产品形态已升级（XX王 + C 端上架 + 新粗野风），DeepSeek 派发须纳入视觉风格与各王体系；五王全定后回改 `cloudbase-contract.md` 的 `events.payload` 结构（见 product-definition.md §13）。

---

## 5. 对齐结论

四方对已 pivot 的 CloudBase 原生架构、新契约、新前端 Agent（DeepSeek）、9 门禁与防虚报硬门禁达成一致。DeepSeek 启动前须以本章程 + `cloudbase-contract.md` 为唯一事实源，**先 `git pull` 最新 `main` 再编码**，禁止基于 stale 上下文。
