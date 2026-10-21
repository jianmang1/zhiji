# ADR-005 薄肌王「体感/围度」漏斗步缺少可产出的 event type

- 状态：Proposed
- 提案方：DeepSeek（前端 Agent）
- 日期：2026-10-21
- 关联：cloudbase-contract.md §3 / §8（撞号说明：ADR-004 已被 Tech Lead 的 user_id→text 采用，故本提案编号为 005）
- 原关联：cloudbase-contract.md §3 / §8、`product-definition.md` §15.1 / §15.3

## 背景

契约 v1.4 把 `health.body_sense`（体感/围度）列为薄肌王 v1 行为漏斗的一步
（§15.1：启动→饮水→睡眠→运动→综合打卡→**体感/围度**→推荐），§15.3 也明确
"用轻量『体感/围度记录』替代体脂秤，避免秤门槛腰斩漏斗"。

但契约 §3 的 health 域只定义了三个 event type：

```
health: water{ml} / sleep{duration_h,quality} / workout{type,duration_min,calorie}
```

即：**漏斗里存在这一步，事件模型里却没有任何 type 能产出它**。
前端 `src/schemas/payload.ts` 的注册表严格镜像 §3，因此当前没有任何入口能发出
`health.body_sense`，该步在漏斗中恒为 0。

## 决策（请 Codex / Tech Lead 裁决其一）

**方案 A（建议）：在契约 §3 health 增加 `body_sense` type**

- payload：`{ waist_cm?: number, feel?: enum('great','ok','tired'), note?: text }`
- 好处：与其它打卡一致走 `events`（经 `recordEvent` 加密），可回溯、未来可参与评分；
  且在"我的记录"里可见。
- 成本：**无需数据库迁移** —— `events.type` 是 `text NOT NULL` 无 CHECK 约束，
  新增 type 不触碰表结构；仅需改契约 §3 文档 + 前端注册表 + Codex 无需改代码
  （`EventInput.payload` 为自由 `dict`，`domain` 枚举不变）。
- 代价：改动"已冻结 payload 结构"（product-definition §14 #2），故必须走本 ADR。

**方案 B：不新增 type，仅用 analytics_events 记录**

- `name=complete_checkin`，`step=health.body_sense`，`payload={waist_cm, feel}`。
- 好处：零契约改动，完全合规（§8 的 `payload` 是自由 jsonb，`name` 枚举已含 `complete_checkin`）。
- 代价：该数据只存在于分析层，**不进事件流**、不进"近期记录"、未来也无法参与评分；
  用户会疑惑"我记的围度去哪了"。

**前端倾向**：A。理由：体感/围度是有长期价值的身体数据（Phase 3 还要做"体脂趋势/达标"），
落在 analytics 层等于提前把它降级成一次性漏斗信号。

## 对协作方的影响

- **Codex**：
  - 选 A → 仅需确认 `recordEvent` 对 `type=body_sense` 无额外校验即可（当前 `EventInput`
    不限制 type 取值，预计零改动）；若认同，请更新契约 §3 并在 §8 备注该步来源。
  - 选 B → Codex 无改动。
- **Tech Lead**：需裁决 A/B；若选 A，需按门禁 8 更新契约并通知双方重读。
- **前端**：裁决前**不实现该入口**（避免自造 type 或把数据写进错误层）。
  裁决为 A/B 后，前端分别只需 1 个 type 注册（A）或 1 个埋点入口（B），当天可交付。

## 同一 ADR 顺带记录的三个"口径未定"（不阻塞，等 checkpoint 一并裁）

1. `product.retain` / `product.habit` / `product.value`：v1 是否前端从 events 派生？
   现状未自动发出 → 恒为 0，会让"瓶颈步"假性落在这些步上。建议 `habit`（周≥3 天打卡，§15.1 有口径）
   前端派生，`value`（达段位/生成 plan）与 `retain`（D7）留 Phase 3 由 `getFunnel` 算。
2. `*.refer` 的触发信号：微信分享**没有可靠的分享成功回调**。若在"点击分享"即发 refer，
   会把"取消分享"也算成推荐，污染 K 因子。建议 v1 只记 `share_opened`（不冒充 refer），
   refer 计数留 Phase 3 用可确认信号（如被邀请方首次 app_open 带 referrer）。
3. 力王 `work.spend` 已按 §8 实现（`log_spending` + 四类 category），无歧义，仅备案。

## 回滚方式

本 ADR 只提案、不改契约、不改代码。若裁决为 B，前端按 B 实现（仅 analytics 埋点），
无需回滚任何既有结构；若裁决为 A 而日后要撤销，契约 §3 删去该 type、前端注册表同步删除即可，
历史 `events` 行保留（`payload` 为 jsonb，不影响读取）。