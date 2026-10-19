# 前端执行计划（Gemini）

> 角色：前端开发小组。唯一接口契约：`docs/api/openapi.yaml`（v1.0）。协作中枢：Aurora KB（`docs/`）。**禁止与后端 Agent 直接对话**，契约疑问/变更走 ADR 并更新 KB。API 客户端以 `openapi.yaml` 为准生成。

## 1. 技术栈
- Taro 4（React + TypeScript），编译目标：微信小程序 + H5
- UI：Ant Design Mobile（Taro 适配）；状态：Zustand
- 路由：React Router（Taro 版）；校验：Zod
- 可视化：暂用列表/静态图（ReactFlow 在小程序兼容性待 spike，降级）
- 测试：Vitest（单测）+ Playwright（e2e 关键路径）

## 2. 项目初始化
- `taro init zhiji-frontend`（React+TS 模板）
- 配置 `config/index.ts`：编译微信小程序 + H5 双端
- 安装：`antd-mobile`、`zustand`、`zod`、路由与测试依赖

## 3. API 客户端（契约驱动）
- 由 `docs/api/openapi.yaml` 生成 TS 类型与客户端：
  - 推荐 `openapi-typescript`（生成 `types.ts`）+ 手写薄封装 `request()`（注入 JWT）
  - 或 `orval` 直接生成 hooks
- 请求统一带 `Authorization: Bearer <token>`；401 触发重新登录

## 4. 状态管理（Zustand）
- `authStore`：token、user_id、login()
- `eventStore`：events 列表、createEvent(domain,type,ts,payload)
- `goalStore` / `planStore`：列表与写入
- 持久化 token 到本地存储（小程序 `Taro.storage`）

## 5. 路由与页面
- `/login`：调用 `wx.login()` → `POST /auth/wx-login {code}` → 存 token
- `/entry`：事件录入，按域切换表单（health/work/consumption/capability/interest）
- `/dashboard`：调 `/analytics/summary` + `/events` 渲染概览与近期记录
- `/plans`：调 `/plans` 展示行动方案
- 未登录跳转 `/login`（路由守卫）

## 6. 表单校验（Zod）
- `eventSchema` 镜像 `EventCreate`：`domain` enum、`ts` datetime、`payload` object、`source` 默认 manual
- 录入页按 `domain+type` 动态渲染 `payload` 字段并 Zod 校验
- 提交前客户端校验（服务端校验仍由 Codex 负责，前端不越界）

## 7. 测试与质量门禁
- Vitest：store / schema / 工具函数单测
- Playwright：关键路径 e2e（登录→录入→看板可见）
- 类型安全：tsconfig `strict: true`（门禁 5）
- API 契约一致性：前端调用须匹配 `openapi.yaml`，偏差判失败（门禁 1）
- 文档：组件/页面说明入 README（门禁 9）

## 8. 里程碑（Phase 2，验收）
- [ ] Taro 项目可编译微信小程序 + H5
- [ ] 登录页真实走通微信登录拿 token
- [ ] 录入页按域填表、Zod 校验、成功落库
- [ ] 看板页渲染概览与近期事件
- [ ] 方案页展示 `/plans`
- [ ] Vitest + Playwright 关键路径通过；TS strict 无错

## 9. 非目标（v1 不做）
- DB 查询/schema、API 端点实现、服务端校验（属 Codex）
- 认证逻辑服务端（仅做登录 UI + token 存储）
- 复杂图可视化（ReactFlow 降级）
- 社交/多人协作

## 10. 协作约束
- API 客户端以 `openapi.yaml` 生成；实现须匹配契约
- 若契约有歧义/需改：在 `docs/` 提 ADR，更新 `openapi.yaml`，并通知（门禁 8）
- 方向偏离/卡死：升级给 PO + Tech Lead（我），不自行造轮子
