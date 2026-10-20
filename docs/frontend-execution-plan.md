# 前端执行计划（Gemini · CloudBase 原生）

> 角色：前端开发小组。唯一数据契约：`docs/cloudbase-contract.md`（CloudBase 原生）。协作中枢：Aurora KB（`docs/`）。**禁止与后端 Agent（Codex）直接对话**，契约疑问/变更走 ADR 并更新 KB。
> 架构已转向 CloudBase 原生（见 `docs/ADR-002-cloudbase-native.md`）：**不再用 openapi 生成的 fetch client**；登录走 `cloud.auth`、数据经 `cloud.rdb()`（受 RLS 约束）。旧 `docs/api/openapi.yaml` 与 `backend/`(FastAPI) 已废弃，不得据此编码。

## 1. 技术栈
- Taro 4（React + TypeScript, strict），编译目标：微信小程序 + H5
- 云后端：**CloudBase JS SDK v3**（`cloud.auth` 微信登录 / `cloud.rdb()` 数据访问）
- UI：Ant Design Mobile（Taro 适配）；状态：Zustand
- 路由：React Router（Taro 版）；校验：Zod
- 可视化：v1 降级为列表 + 静态图表（ReactFlow 图谱待 spike，降级）
- 测试：Vitest（单测）+ Playwright（e2e 关键路径）

## 2. 项目初始化
- `taro init zhiji-frontend`（React+TS 模板），目录落仓库根下 `frontend/`
- 配置 `config/index.ts`：编译微信小程序 + H5 双端
- 安装：`cloudbase`、`antd-mobile`、`zustand`、`zod`、路由与测试依赖
- `cloud.init({ env: 'zhiji-d3gd1k9j43e7c20ac' })` 在入口配置（envId 以 ADR-002 / KB 为准）

## 3. 数据客户端（契约驱动，非 openapi 生成）
- 据 `cloudbase-contract.md` **手动定义 TS 类型**（events / tags / goals / plans）或据 SDK 类型推导；**禁止手写 fetch 拼 URL**
- 封装薄 `rdb.ts`：基于 `cloud.rdb()` 的 `add / query / update / remove`，统一带当前登录态（RLS 自动按 user_id 隔离）
- 高频录入/查询直接走 `cloud.rdb()`；复杂聚合与 AI 分析走 Codex 的云函数（`recordEvent`/`listEvents`/`generatePlan`/`listPlans`，仅在其标"已实现"后接入）

## 4. 状态管理（Zustand）
- `authStore`：`cloud.auth` 登录态、user_id、login()/logout()，登录态安全存储到 `Taro.storage`（不进 Git、不明文泄露）
- `eventStore`：events 列表、createEvent(domain,type,ts,payload,source)
- `analyticsStore`：看板所需的聚合视图（来自 events/goals 查询）
- 持久化登录态到本地存储；未登录跳转 `/login`（路由守卫）

## 5. 路由与页面
- `/login`：调用 `cloud.auth` 微信登录集成 → 存登录态
- `/entry`：事件录入，按域切换表单（health/work/consumption/capability/interest），提交经 `cloud.rdb()` 或 `recordEvent`
- `/dashboard`：经 `cloud.rdb()` 查 events + goals，渲染概览与近期记录
- `/plans`：**v1 先做占位 UI**；真实数据等 Codex 的 `generatePlan`/`listPlans` 云函数交付后接入（门禁：未标"已实现"不接真实调用）

## 6. 表单校验（Zod）
- `eventSchema` 镜像 `cloudbase-contract.md` 的 events 字段：`domain` enum（五域）、`ts` datetime、`payload` object（按 domain+type 子 schema）、`source` 默认 manual
- 录入页按 `domain+type` 动态渲染 `payload` 子字段并 Zod 校验（参考契约 §3 各域 type 与 payload 草案）
- 提交前客户端校验（服务端校验/RLS 仍由 CloudBase 负责，前端不越界）

## 7. 测试与质量门禁
- Vitest：store / schema / 工具函数单测
- Playwright：关键路径 e2e（登录→录入→看板可见）
- 类型安全：tsconfig `strict: true`（门禁 3/5，零 any）
- 契约一致性：前端调用须匹配 `cloudbase-contract.md`，偏差判失败（门禁 1）
- 安全门：登录态安全存储、不泄露（门禁 6）
- 文档：组件/页面说明入 README（门禁 9）

## 8. 里程碑（Phase 2，验收）
- [ ] Taro 项目可编译微信小程序 + H5
- [ ] 登录页真实走通 `cloud.auth` 微信登录拿登录态
- [ ] 录入页按域填表、Zod 校验、经 `cloud.rdb()` 成功落库（RLS 隔离验证）
- [ ] 看板页渲染概览与近期事件
- [ ] /plans 占位 UI 完成（等云函数交付再接真实数据）
- [ ] Vitest + Playwright 关键路径通过；TS strict 无错

## 9. 非目标（v1 不做）
- DB schema / RLS / migration（属 Codex）
- 云函数实现 / 服务端业务逻辑 / AI 分析（属 Codex）
- 服务端鉴权逻辑（仅做登录 UI + 登录态存储）
- 复杂图可视化（ReactFlow 降级）
- 社交/多人协作

## 10. 协作约束
- 数据访问以 `cloudbase-contract.md` 为准；实现须匹配契约字段/类型
- 若契约有歧义/需改：在 `docs/` 提 ADR，更新 `cloudbase-contract.md`，并通知（门禁 8）
- 方向偏离/卡死：升级给 PO + Tech Lead（我），不自行造轮子
- 与 Codex 不对话：一切经 Aurora KB（docs/）
