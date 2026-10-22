# Tech Lead 派发 · 漏斗重构（DeepSeek 前端）· 2026-10-22

> 依据：**ADR-007**（PO 裁定，2026-10-22）。契约同步：`cloudbase-contract.md` §3（新增 `suppression` + `body_sense.feel_score`）、`product-definition.md` §15。
> 范围：前端漏斗可视化重构 + 移除分群运营页。**契约 §2–§5 已冻结结构不动**；`events.type` 为自由 text、`payload` 为 jsonb，新增类型/字段**零数据库迁移**，Codex 无需改云函数（除非你判断薄肌王漏斗需服务端聚合，见下）。
> 门禁：改完 `npm run typecheck` + `npm test` 全绿 → 提 PR。

## 任务 1 · 产品级漏斗改名「王败寇」+ 五层重命名/阈值

- 现有产品级漏斗页（`frontend/src/pages/funnel/index.tsx` + `services/funnel.ts` + `funnelApi.ts` + `analyticsStore.ts`）当前展示 AARRR 步骤。
- **改名**展示层文案：产品级漏斗标题 → **「王败寇」**；五层显示名改为 **陌生人 / 好奇猫 / 留存 / 落魄谷 / 少年归**。
- **阈值（基于该用户自己的数据，前端用 `getFunnel(domain=product)` 返回的 `product.*` 步骤计数 + 该用户 `analytics_events` 的 `ts` 天数 / 漏斗到底次数）**：
  - L3 留存：记录数据天数 > 3
  - L4 落魄谷：记录数据天数 > 10
  - L5 少年归：漏斗到达底部次数 > 10
  - L1/L2 按 acquire/activate 是否发生判定。
- **「社区人数」用占位数字**（如「12.8 万人在记录」，**不实做跨用户聚合**）。UI 文案注明为氛围展示，避免误导。ADR-006 冻结维持。
- 保留 funnel 的**转化/drop-off 可视化**（PO 认可埋点模拟的转化展示）。

## 任务 2 · 薄肌王漏斗重构（四层，最终层 = 自己体感 1–10）

- 薄肌王漏斗（`domain=health`）改为基于**真实打卡 `events`** 的四层：
  - L1 喝大水和睡大觉 → `water` + `sleep` 类型存在
  - L2 运动 → `workout` 类型存在
  - L3 压抑指标 → **`suppression`**（新增类型，见契约 §3；`score` 0–10 越低越好）
  - L4 体感（最终目的）→ `body_sense.feel_score`（1–10）
- 数据来源：可用 `listEvents(domain='health')` 取该用户 health 事件，按 type 聚合各层达成情况；或复用 `getFunnel(domain='health')` 让其返回 type 分布（若 `getFunnel` 当前只聚 `analytics_events.step`，需 Codex 补 `domain=health` 时按 `events.type` 分布——**若需要，在 PR 描述标注并 @Codex**；若前端直接 `listEvents` 客户端聚更简单，优先前端聚）。
- 漏斗展示"用户离最终目的（体感达标）还差几步、每一层坚持情况"，长期累积。
- 录入：`suppression.score` 用拖条（见 UX 派发指令任务 2）；`body_sense.feel_score` 用拖条 1–10。

## 任务 3 · 砍掉分群运营页

- 移除 `frontend/src/pages/segments/index.tsx` + `index.config.ts` + `services/segments.ts` 的 UI 入口：
  - `frontend/src/app.config.ts` 的 tabBar 列表里删除 `{ pagePath: 'pages/segments/index', text: '分群' }`。
  - 清理 `services/segments.ts`、`schemas/analytics.ts` 中分群相关逻辑（函数可保留但不再暴露 UI，或一并删除；确保 `npm test` 不引用已删导出）。
- 理由：依赖跨用户数据（ADR-006 冻结），PO 确认无用户价值。

## 任务 4 · 力王 / 黄毛王漏斗暂保留

- 力王（`work`）、黄毛王（`dating`）漏斗**本次不动**，维持现有行为漏斗展示。后续可照搬薄肌王思路重构（PO 待定）。

## 验收（提交前自检）
- `npm run typecheck` 0 错误；`npm test` 全绿。
- 手动（如可跑）：王败寇页显示五层新名 + 占位社区人数；薄肌王漏斗四层（含 suppression 录入 + feel_score 拖条）可走通；分群 tab 已消失。
- 不触碰 `cloudbase.ts` / `authStore.ts`（PO 登录重构中，以 PO 版本为准）。

## 提交
- 分支：`feat/frontend-funnel-redesign-20261022` → PR 到 `main`。
- PR 描述注明：王败寇改名 + 薄肌王四层 + 砍分群运营；关联 ADR-007。
- 若判断薄肌王漏斗需 `getFunnel` 服务端按 `events.type` 分布返回，单独在 PR 标注并待 Codex 评估。
