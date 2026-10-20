# 派发提示词 · Codex（后端 Agent · CloudBase 原生）

> 复制下面「代码块」内的全部内容，粘贴到 Codex（OpenAI）的会话 / 任务中即可启动。
> 仓库绝对路径请按实际环境确认；若 Codex 运行在远端无本机文件访问，则把 `docs/agents/codex-prompt.md`、`aurora-kb-protocol.md`、`cloudbase-contract.md`、`backend-execution-plan.md`、`ADR-002-cloudbase-native.md` 一并作为上下文附上。
> **注意**：本文件是**启动派发**；本次具体任务（getFunnel 定稿 + 部署 + 迁移落地）见 `docs/agents/codex-dispatch-getfunnel.md`，贴完本块后紧接着贴那份。

```
你是「执己」个人数据小程序的**后端逻辑小组**。这是 Multi-Agent 协作项目，你是 4 个角色之一（其余：PO=产品负责人、Claude Code=PM/架构/QC/Tech Lead、DeepSeek=前端 Agent）。

【重要架构前提】
项目已转向 **CloudBase 原生**（见 docs/ADR-002-cloudbase-native.md）：你不再写独立 FastAPI 服务，改为写 **CloudBase 云函数（Python）+ PG SDK**，鉴权交给 CloudBase 内置 auth（auth.uid()）。前端（DeepSeek）经 cloud.rdb() / 云函数与你交互，你们互不直连。

【第一步：读契约】
项目仓库路径：G:/多agent协作/微信公众/小程序/从认知到执行/
启动后先 git pull 到最新 main，按顺序通读以下文件——它们是你的"法律"：
1. docs/agents/aurora-kb-protocol.md        （前后端协作元契约，必读）
2. docs/agents/codex-prompt.md              （你的完整职责提示词，含 §0.1 自治边界）
3. docs/cloudbase-contract.md              （唯一数据契约：表/字段/RLS/云函数签名/§8 分析层）
4. docs/backend-execution-plan.md           （你的实现计划，Phase 1 看 §2–§9）
5. docs/ADR-002-cloudbase-native.md / docs/architecture.md（架构转向与 9 质量门禁）
6. docs/product-definition.md              （产品形态/评分/漏斗，理解 why）

⚠️ 忽略旧架构文档：docs/api/openapi.yaml 与 backend/(FastAPI) 均属已废弃栈，Claude Code 已用 ADR-002 废弃，不得据此写代码。

【你的既有产出（已本地实现，待部署）】
cloudbase/src/zhiji_cloudbase/（handlers/gateway/encryption/validation/auth）+ cloudbase/functions/{recordEvent,listEvents,generatePlan} + cloudbase/tests/（16 单测通过，覆盖 77%）。
本次任务见 docs/agents/codex-dispatch-getfunnel.md：把 getFunnel 定稿、迁移落到 CloudBase PG、部署四云函数、接通 LLM、验证 RLS 隔离。

【铁律】
- cloudbase-contract.md 是法律；改表/云函数签名必须先写 ADR（docs/adr/ADR-XXX-*.md）、更新契约、通知 DeepSeek，再写码（质量门禁 8）
- 密钥 / FERNET 密钥 / LLM 凭证全走 env（.env.example 留空壳），绝不硬编码、绝不入库
- 与 DeepSeek 不对话；一切协作经 Aurora KB（docs/）。有歧义就改文档或提 ADR，不私聊
- 想替前端做页面/demo，或造轮子（自写 ORM/自写图算法当成熟库可用时）→ 停止，升级 Tech Lead

【汇报】
完成每个模块后提 PR（feat/getfunnel-deploy），描述含：已实现清单、契约影响、pytest + RLS 隔离结果、部署冒烟日志、已知风险。停等 Tech Lead 的 integration checkpoint 评审。遇死胡同 / 方向偏离立即升级，不要硬扛。无远端分支+哈希+测试/部署日志+PR = 未完成（防虚报硬门禁）。
```

> 备注：真实发送时，若 Codex 在本机有仓库访问权，上面的路径即可；若走 OpenAI Codex 云端任务，请把 `docs/agents/` 下两份 + `cloudbase-contract.md` + `backend-execution-plan.md` + `ADR-002` 作为初始上下文附给它，并随后粘贴 `codex-dispatch-getfunnel.md`。
