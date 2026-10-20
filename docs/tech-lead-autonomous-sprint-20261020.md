# Tech Lead · 三方自治编排章程（Aurora KB Only · PO 不在线自驱）

> 生效：2026-10-20。PO 已授权"三 Agent（Tech Lead / DeepSeek / Codex）仅经 Aurora KB 自驱推进，无需 PO 在线协调"。本文定义自治边界、handoff 协议、Sprint 目标与升级路径，是三方在 PO 离线时的运行宪法。

## 1. 四方角色与边界（职责提示词为法律）
| 角色 | 身份 | 拥有(Own) | 禁止(Trespass) | 调度 |
|---|---|---|---|---|
| PO | 产品负责人（甲方+风控） | 产品范围 / 契约冻结项 / 最终验收 | 写代码、改契约未走 ADR | 仅离线批战略，不介入日常 |
| **Tech Lead**（Claude Code） | PM+架构+QC | 架构/契约/评审/冲突裁决/可接管 | 替 Agent 写业务代码（除非接管） | 常驻，审 PR、定 Sprint、解歧义 |
| **DeepSeek** | 前端 Agent | `frontend/` 全部 | 后端/契约/API/mock | 读 KB 自驱，提 PR |
| **Codex** | 后端 Agent | `cloudbase/` 云函数 + 迁移 + 部署 | 前端/UI/页面 | 读 KB 自驱，提 PR |

- 边界唯一仲裁 = 各自 `docs/agents/*-prompt.md` 的 §2/§3（You ARE / You are NOT）与 `cloudbase-contract.md`。
- **DeepSeek 与 Codex 互不直连**：一切经 `docs/`（Aurora KB）。这是防返工的第一原则（历史教训：Gemini 曾按 stale 契约虚报）。

## 2. 自治运行规则（PO 不在线的前提）
1. **契约已冻结**：v1.4 的 domain/type/payload、评分阈值、等级命名、generatePlan schema、analytics step 枚举均冻结。两 Agent 直接按契约做，**不空等 PO 确认**。
2. **日常分歧 Tech Lead 裁决**：Agent 遇契约内歧义（如某个 step 映射、字段命名），先在 PR 描述写清，Tech Lead 在 checkpoint 裁决；**不升级 PO**。
3. **仅三类事升级 PO**（经 Tech Lead 转述，批量而非逐条）：
   - 产品范围/新增域（如复活 consumption、加 capability）
   - 契约冻结项变更（需走 ADR，PO 拍板）
   - 上线合规/资质（微信类目、隐私政策）
4. **每天至少一次 `git pull`**：重读 `main` 上 `cloudbase-contract.md` 与对方 PR，避免 stale 上下文（Gemini 翻车根因）。

## 3. Sprint 目标（本轮自驱）
**交付一个可端到端演示的 v1 闭环**：三王打卡 → 评分(LOL段位) → AI意见(generatePlan) → 基础两层漏斗看板 + 行为埋点，云端 RLS 隔离。

| Agent | 本 Sprint 任务 | 产出（PR） |
|---|---|---|
| DeepSeek | startup 提示词 Phase2 模块1–4 + 补丁(评分/埋点//funnel) | feat/frontend-*（多个） |
| Codex | 派发 getFunnel：迁移落地 + getFunnel 定稿 + LLM 接通 + 部署 + RLS 验证 | feat/getfunnel-deploy |
| Tech Lead | 审两方 PR、冲冲突、必要时接管、写集成 checkpoint 报告 | docs/integration-checkpoint-* |

## 4. Handoff 协议（无 PO 也能流转）
```
Agent 自驱实现 → git push feat/<x> → 开 PR 到 main
   → PR 描述含：契约影响 / 双端或单测结果 / §10 四项证据
   → Tech Lead 在 checkpoint（不超 48h）审：契约一致性 + 门禁 + 与对方 PR 是否冲突
   → 通过则 merge；冲突则 Tech Lead 写 ADR/协调双方重读契约
   → 双方 pull main，继续下一模块
```
- 集成节点：当 DeepSeek 的 /funnel 与 Codex 的 getFunnel 都就绪，Tech Lead 做集成 checkpoint（前端本地漏斗 vs 云端 getFunnel 对齐）。
- **防虚报贯穿**：任何"完成"无远端分支+哈希+构建/测试日志+PR = REJECT（见各自 §10）。

## 5. 升级触发（Agent 自行停止并升级）
- 契约缺口且 ADR 无法解决 → 写 ADR + 升级 Tech Lead（Tech Lead 判是否需 PO）。
- 死胡同 2 次 / 方向偏离 / 范围蔓延 → 升级 Tech Lead。
- 连续两次 REJECT → Tech Lead 可接管该 Agent 模块保进度（历史已授权）。

## 6. 本章程与既有文档关系
- 不替代 `four-party-alignment-20261020.md`（四方对齐章程 v2），而是其"PO 离线自治"实施细则。
- 不替代 `cloudbase-contract.md`（仍为数据法律）、`product-definition.md`（产品法律）。
- 角色边界以 `deepseek-prompt.md` / `codex-prompt.md` 的 §0.1 自治边界条款为准。

> Tech Lead 注：本文即"PO 不在线"时的指挥棒。三方按此自驱，我负责把结果在 checkpoint 汇总成报告，PO 回来只需看报告与最终 PR，不需中途协调。
