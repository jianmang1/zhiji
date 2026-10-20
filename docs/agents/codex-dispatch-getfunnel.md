# 派发提示词 · Codex（后端 Agent）— getFunnel 定稿 + 云函数部署 + 迁移落地

> **用法**：把下面「代码块」全选复制，贴到 Codex 会话即可启动（接在 `codex-prompt.md` 职责提示词之后）。本任务基于已完成的 Phase 1 云函数（recordEvent/listEvents/generatePlan，本地 16 单测通过、覆盖 77%）。本次只做**收口 + 部署 + 新增 getFunnel**，不重写已有逻辑。
> 若 Codex 走云端无本机访问，把本文件 + `codex-prompt.md` + `cloudbase-contract.md`(§8) + `backend-execution-plan.md` + `ADR-002-cloudbase-native.md` 一并作为上下文附上。

```
你是「执己」个人数据小程序的**后端逻辑小组**（CloudBase 原生）。Phase 1 三云函数已本地实现并通过单测，尚未部署。本次任务：把契约 §8 的 getFunnel 定稿、把所有迁移落到 CloudBase PG、把云函数部署上线、接通 LLM，并验证 RLS 隔离。

【第一步：对齐事实（git pull 最新 main）】
- 仓库路径：G:/多agent协作/微信公众/小程序/从认知到执行/
- 已存在：cloudbase/src/zhiji_cloudbase/（handlers/gateway/encryption/validation/auth）、cloudbase/functions/{recordEvent,listEvents,generatePlan}/、cloudbase/tests/、cloudbase/migrations/（含 20261020104600_init_schema / 20261020171000_adjust_domains / 20261020174000_analytics_layer）
- 必读：cloudbase-contract.md §8（getFunnel 规格 + analytics_events/profiles 表 + step 命名空间枚举）、backend-execution-plan.md、ADR-002。

【任务 A · 迁移落地 CloudBase PG】
- 用 managePgDatabase(action=applyMigration) 依次应用（已本地跑过的也需在云端 PG 重跑，确保远端库 = 契约）：
  1. 20261020104600_init_schema（events/tags/goals/plans + RLS）
  2. 20261020171000_adjust_domains（events/goals 的 domain CHECK 改为 health/work/dating）
  3. 20261020174000_analytics_layer（analytics_events + profiles + RLS）
- 每步带 up/回滚 SQL；应用后 SELECT 校验：events.domain CHECK 仅接受 health/work/dating；analytics_events.step 枚举沿用契约（DB 层用 text，枚举约束在前端/云函数侧）。
- 失败即停，升级 Tech Lead（不要改契约绕过）。

【任务 B · 定稿 getFunnel 云函数（契约 §8）】
- 新增 cloudbase/functions/getFunnel/（与现有三函数同构：handlers 分发 + 注入 auth.uid()）。
- 签名：getFunnel(domain?: 'health'|'work'|'dating'|'product', range: {from,to}, segment?: {channel?,region?,user_type?}) -> {steps:[{step,count,conv_rate,drop_off}], bottleneck_step, segment?}
- 逻辑（v1 实现，Phase 3 可增强）：
  · product 级：聚合 analytics_events 中 product.* 各 step 计数，按 acquire→activate→retain→habit→value→refer(reactive 单独展示) 算转化率与 drop_off，bottleneck=最大 drop_off。
  · 各王级：按 domain 过滤 analytics_events 的 <domain>.* step 序列（顺序见契约 §8），同样算。
  · segment 非空时按 analytics_events.channel/region/user_type 或 profiles 分群再聚。
  · 用 service_role 越权聚合（RLS 允许）；结果只返回当前调用者所属分群，不跨用户泄露。
- 单测：用 pytest 造 fixtures（analytics_events 多步 + 多用户）验证计数/转化率/bottleneck 正确；覆盖率维持 ≥70%。

【任务 C · LLM 接通 generatePlan（契约 §5.1）】
- generatePlan 现有骨架调 LLM；按 §5.1 统一 schema 强制输出：{domain,score,tier,summary,actions[],next_milestone}。
- score/tier 由规则引擎（与前端 scoreEngine 同口径，读 events 周聚合）算好传入；LLM 只生成 summary/actions/next_milestone（2–4 条，按 effort 升序）。
- 用 CloudBase LLM API（keyless）；based_on 记查询范围(jsonb) 入 plans 表，generated_by 记模型名，可回溯。

【任务 D · 部署三(+一)云函数】
- 用 CloudBase CLI 部署：tcb fn deploy --httpFn <recordEvent|listEvents|generatePlan|getFunnel>
- 环境变量（.env.example 留空壳，绝不硬编码）：FERNET_ENCRYPTION_KEY（health/dating payload 加解密）、CloudBase LLM 凭证。
- 部署后冒烟：用测试用户 token 调 recordEvent→listEvents 闭环；health/dating payload 落库加密、读取解密；generatePlan 返回 §5.1 结构；getFunnel 返回两层漏斗。

【任务 E · RLS 隔离验证】
- 造两个用户 A/B，A 写事件后 B 用自己 token 查 listEvents/getFunnel，断言看不到 A 数据（跨用户隔离）。
- 此测试作为集成门禁（质量门禁 4）；不通过不上线。

【交付与验收硬门禁（后端版，对齐前端 §10）】
- 唯一事实源 = GitHub 远端 jianmang1/zhiji；完成须与远端一致。
- 提交到 feat/getfunnel-deploy 分支并 push 开 PR；汇报"完成"须附：① 分支名 ② 提交哈希 ③ pytest 日志（含 getFunnel 单测 + RLS 隔离）④ PR 链接 ⑤ 部署冒烟日志（tcb fn deploy + 一次 recordEvent→listEvents 真实调用）。
- 无远端证据 + 部署日志 = 未完成。Tech Lead 在 PR 评审 + 可选远端冒烟后裁决 merge。

【铁律】
- 不碰前端 frontend/、不写页面、不加 UI；不替 DeepSeek 决定 step 取值（契约 §8 已定）。
- 契约变更走 ADR（§8 已冻结，本次不破）；迁移带回滚 SQL。
- 与 DeepSeek 不对话，仅经 Aurora KB（docs/）；歧义提 ADR 等对方读。
```

> 备注：本派发与 `codex-prompt.md` 共同构成 Codex 的 Phase 1 收口 + Phase 3 分析层起手。改动范围严格限定在 cloudbase/（新增 getFunnel + 部署脚本 + 迁移应用），不触及前端。
