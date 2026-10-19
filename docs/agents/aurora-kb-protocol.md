# Aurora KB · 前后端协作协议（元契约）

> 本文件是"契约的契约"。它定义了执己项目里**后端 Agent（Codex）** 与 **前端 Agent（Gemini）** 如何通过文档协作，而不直接对话。
> 它是启动会三项决议之一（协作方式），是两份职责提示词（`codex-prompt.md` / `gemini-prompt.md`）的上级协议。

---

## 1. Aurora KB 是什么

**Aurora KB = 本 Git 仓库的 `docs/` 目录 + `docs/api/openapi.yaml`。**

- 它是前后端的**唯一共享知识库与唯一契约源**。
- 它不是聊天群、不是飞书/Slack、不是私信。两 Agent **互不直连、互不私聊**。
- 所有"我想和对方说的事"，都通过**写文档 / 改文档 / 在文档里留 ADR** 完成。
- 谁改了什么、为什么改，全部留在 Git 历史里 —— 可追溯、可回滚。

---

## 2. KB 内容地图（谁拥有 / 谁消费）

| 文件 | Owner | Consumer | 说明 |
|------|-------|----------|------|
| `docs/api/openapi.yaml` | **Codex** | Gemini | 唯一接口契约。v1.0 起由 Codex 产出维护；Gemini 只读并据其生成 TS 客户端 |
| `docs/data-model-v1.md` | Codex | Gemini | 数据模型 / 字段语义。Codex 维护 |
| `docs/backend-execution-plan.md` | Codex | Tech Lead | 后端实现计划。Codex 维护 |
| `docs/frontend-execution-plan.md` | Gemini | Tech Lead | 前端实现计划。Gemini 维护 |
| `docs/architecture.md` | Tech Lead | 双方 | 系统架构 / 部署 / 验收。双方遵守 |
| `docs/ADR-001-tech-stack.md` | Tech Lead | 双方 | 技术栈定案 + 9 质量门禁。双方遵守 |
| `docs/adr/ADR-XXX-*.md` | 提案方 | 双方 | 契约或架构变更记录（见 §4） |
| `docs/kickoff-meeting-notes.md` | Tech Lead | 双方 | 启动会决议追溯 |

---

## 3. 启动必读（Boot Read）

两 Agent 启动后的**第一动作**：`git pull` 到最新 `main`，按各自清单通读 KB，再写任何代码。

- **Codex 启动必读**：`openapi.yaml` → `data-model-v1.md` → `backend-execution-plan.md` → `architecture.md` → `ADR-001-tech-stack.md` → 本文件
- **Gemini 启动必读**：`openapi.yaml` → `frontend-execution-plan.md` → `architecture.md` → `data-model-v1.md` → `ADR-001-tech-stack.md` → 本文件

> 提示：若 `openapi.yaml` 与任意计划文档冲突，**以 `openapi.yaml` 为准**（它是契约，不是说明文）。

---

## 4. 写入与变更协议

### 4.1 谁可以写哪份文件
- Codex 拥有 `openapi.yaml`、`data-model-v1.md`、`backend-execution-plan.md`。
- Gemini 拥有 `frontend-execution-plan.md`。
- `architecture.md`、`ADR-001-tech-stack.md` 由 **Tech Lead（Claude Code）** 拥有，Agent 只可提议、不可擅自改。

### 4.2 契约变更门禁（对齐质量门禁 8）
修改 `openapi.yaml` 或影响接口的字段，**必须**走以下流程，否则视为越界：
1. 在 `docs/adr/` 新建 `ADR-<序号>-<主题>.md`，写明：现状 / 动机 / 新方案 / 对对方的影响 / 回滚方式。
2. 更新 `openapi.yaml`（同步 `info.version` 与变更端点）。
3. 若影响数据模型，同步更新 `data-model-v1.md`。
4. 在双方可见的项目频道（或 PR 描述）**通知对方 Agent**，等待其 client / 实现对齐。
5. 冻结期：变更提交后，对方有 **1 个 checkpoint 周期** 对齐；冻结期内不得再改同一端点。

### 4.3 ADR 模板
```
# ADR-<序号>-<主题>
- 状态：Proposed | Accepted | Rejected | Superseded
- 提案方：Codex / Gemini / Tech Lead
- 日期：YYYY-MM-DD
## 背景
## 决策
## 对协作方的影响
## 回滚方式
```

---

## 5. 握手机制（Handshake）

前后端不必对话，但要知道对方"到哪了"：

- **后端就绪信号**：`openapi.yaml` 中某端点标注 `x-status: implemented`（Codex 实现并自测通过后打标）。
- **前端就绪信号**：Gemini 的 `api-client` 模块覆盖该端点、且类型来自 `openapi-typescript` / `orval` 生成。
- **联调起点**：当某端点双方都标就绪，进入 Phase 3 联调清单（见 `architecture.md` §6）。

---

## 6. 冲突仲裁

- 两 Agent 对契约理解不一致、或都认为自己"不能做而对方该做"时：**冻结相关契约，升级给 Tech Lead（Claude Code）**。
- Tech Lead 给出裁定；**PO 拥有最终否决权**。
- 仲裁前双方不得自行改契约或私下约定绕过。

---

## 7. 版本与发布

- `openapi.yaml` 的 `info.version` 用语义化版本（v1.0 → v1.1 → v2.0）。
- 每次变更合并到 `main` 即视为新契约生效；前端须重新生成 client。
- 禁止在分支上长期偏离 `main` 的契约 —— 每天至少一次 `git pull` + 重读变更。

---

## 8. 一句话总纲

**契约是唯一的交流语言。Aurora KB 是契约的家。你改的每一条接口，都要在 KB 里留痕；你从不对另一个 Agent 说话，只对话文档。**
