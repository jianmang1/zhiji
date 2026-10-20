# 派发补丁 · DeepSeek（前端 Agent）— Phase 2 续：评分 + 两层漏斗 + 行为埋点

> **用法**：把下面「代码块」全选复制，贴到 DeepSeek 会话，**接在 `deepseek-startup-prompt.txt` 之后**（那一份已给定角色、架构前提、Phase 2 模块 1–4、铁律、§10 防虚报硬门禁）。本补丁只**追加**评分引擎、两层漏斗、行为埋点三块范围，不重复 startup 里已有的内容。
> 若 DeepSeek 走云端无本机访问，把本文件 + `product-definition.md` + `cloudbase-contract.md`(§8) 一并作为上下文附上。

```
【追加必读】（在 startup 的 5 个文件之外，再读这两份，它们是本补丁的"法律"）
6. docs/product-definition.md           §5.1 评分阈值 / §5.2 等级命名(LOL梗风) / §7 新粗野视觉 / §15 两层漏斗模型
7. docs/cloudbase-contract.md           §8 增长漏斗与精细化分析层（analytics_events / profiles / step 命名空间枚举）

【模块 5 · 评分引擎（客户端算，不调 LLM）】
- 依据 product-definition.md §5.1 阈值 + §5.2 等级，用 Zustand 内纯函数算每王 score(0–100) 与 tier。
- 三王 score 输入（严格来自 events.payload，禁止自造字段）：
  · 薄肌王(health)：water.ml / sleep.duration_h / workout.duration_min（周聚合 vs §5.1 阈值）
  · 力王(work)：work_log.wage / work_log.hours / work_log.commute_min + analytics_events(log_spending 的 category 正比/反比加权，§8 力王消费语义)
  · 黄毛王(dating)：approach.count + approach.got_response + date.count + stage.stage（周聚合）
- tier 映射（§5.2 冻结值，不得改）：0–39 倔强青铜 / 40–69 秩序白银 / 70–89 荣耀黄金 / 90–100 最强王者。
- 输出：scoreEngine(domain, events[]) -> {score, tier, breakdown[]}。前端仅展示，规则由前端持有；Codex 的 generatePlan 会用同口径 score 作 LLM 输入（见契约 §5.1）。

【模块 6 · 行为埋点（analyticsStore.track）】
- 封装 track(name, step, {domain?, channel?, region?, user_type?, variant?, payload?})，经 cloud.rdb() 写 analytics_events（非敏感，受 RLS，无需云函数）。
- step 必须取自契约 §8 命名空间枚举（v1 取值，禁止自造 phase3 TODO 项）：
  · app_open        -> product.acquire + product.activate
  · view_king       -> product.activate / product.habit（按停留）
  · complete_checkin(health) -> health.onboard(首) / health.water / health.sleep / health.workout / health.active_day / health.body_sense
  · complete_checkin(work)   -> work.onboard(首) / work.wage / work.spend(log_spending) / work.retain
  · complete_checkin(dating) -> dating.onboard(首) / dating.approach / dating.response(got_response=true) / dating.date / dating.stage_up / dating.stage5 / dating.refer
  · share           -> product.refer + <king>.refer
  · reactivate      -> product.reactive
  · set_goal        -> （goals 表，非漏斗步，仅记 name=set_goal）
- channel/region/user_type 来自 profiles（登录后写一次）；variant 留空(v1 不 A/B)。
- 埋点为零额外录入摩擦：在现有打卡/分享动作里顺带发，不新增用户操作步骤。

【模块 7 · /funnel 两层漏斗看板】
- 页面路由 /funnel（或嵌 dashboard 子视图）。v1 **前端拉 analytics_events + events 本地算基础漏斗**（getFunnel 是 Codex 的 Phase 3 云函数，v1 不接）。
- 两层展示（product-def §15.1）：
  · 产品级 AARRR：product.acquire→activate→retain→habit→value→refer（含 reactive 复活）
  · 各王行为漏斗：dating/work/health 的 step 序列（见契约 §8 枚举顺序）
- 计算：每步 count、步间转化率、单步 drop-off%、瓶颈步 = argmax(drop-off)；按 channel/region/user_type 可切换分群（从 profiles 取）。
- 视觉：瓶颈步高亮（粗野风红框/警示色）；各王独立主色（§7 约束：各一高饱和主色 + 统一撞黑，设计 tokens 变量化）。
- 这是 v1 的"可视化精细化分析雏形"；完整计算/渠道质量分/A/B/趋势图是 Phase 3（Codex getFunnel 负责），前端留好数据结构。

【视觉 · 新粗野主义(Neo-Brutalism) 强约束】
- 粗黑边(2–3px)、硬阴影(无模糊 offset)、高饱和撞色、大号粗体、反精致。各王独立高饱和主色 + 统一黑 #000。
- PO 未冻结具体色值 → 你按 §7 约束自选并写入设计 tokens（如 CSS 变量 --king-health / --king-work / --king-dating）；禁灰白性冷淡风。
- LOL 段位徽章用粗野风 badge（青铜/白银/黄金/王者对应色）。

【PR 拆分建议（每个独立 feat 分支 + §10 证据）】
1. feat/frontend-scoring      （模块5 评分引擎 + 段位徽章）
2. feat/frontend-funnel       （模块6 埋点 + 模块7 /funnel 看板）
3. 其余 Phase2 模块 1–4 按 startup 提示词的 PR 拆分继续。
- 每个 PR 描述含：Zod↔契约字段映射、taro build 双端结果、vitest 覆盖率、埋点 step 取值清单（对照契约 §8）。

【重申铁律（与 startup 一致）】
- 不实现 API、不 mock 后端、不碰 cloudbase/ 代码；按契约 §3 payload 与 §8 step 枚举写。
- getFunnel 由 Codex 负责，v1 前端本地算；若需服务端聚合，等 Codex 标"已实现"再接。
- 完成依 §10 硬门禁：分支 + 提交哈希 + taro build/vitest 日志 + PR 链接，缺一项 = 未完成。
```

> 备注：本补丁与 `deepseek-startup-prompt.txt` 共同构成 DeepSeek 的完整 Phase 2 派发。技术栈、CloudBase 原生架构、§10 防虚报门禁以 startup 那份为准，本补丁只扩产品深度范围。
