# 执己 · 前端（Phase 2 · v1.4 三王 + 增长漏斗）

Taro 4 + React + TypeScript 前端，编译 **微信小程序 + H5** 双端；数据与登录走 **CloudBase 原生**（`cloud.auth` / `cloud.rdb()` / 云函数），不自建 API 层、不直连数据库。

> 唯一数据契约：`docs/cloudbase-contract.md` **v1.4**；产品口径：`docs/product-definition.md`（§5 评分 / §7 视觉 / §15 漏斗）。
> 架构决议：`docs/ADR-002-cloudbase-native.md`；UI 库偏离见 `docs/adr/ADR-003-taro-native-ui-over-antd-mobile.md`。

## 1. 模块清单（Phase 2 七模块）

| # | 模块 | 主要产物 |
|---|------|----------|
| 1 | 项目初始化与依赖 | `package.json`、`config/index.ts`、`tsconfig.json`、`project.config.json`、`babel.config.js` |
| 2 | Zustand 状态 + auth + rdb 客户端 | `src/services/{cloudbase,rdb}.ts`、`src/stores/*` |
| 3 | Zod 校验 + 三王动态打卡 | `src/schemas/{payload,event}.ts`、`src/pages/entry/*` |
| 4 | 看板 + 方案页 | `src/pages/dashboard/*`、`src/pages/plans/*`（占位） |
| 5 | **评分引擎**（客户端规则，不调 LLM） | `src/scoring/{thresholds,engine}.ts`、`src/components/TierBadge.tsx` |
| 6 | **行为埋点** | `src/services/tracking.ts`、`src/stores/analyticsStore.ts`（`track` / `trackPlans`） |
| 7 | **两层漏斗看板** | `src/services/funnel.ts`、`src/pages/funnel/*` |

> **Phase 3 A 类（自治推进，见 `docs/phase3-backlog.md`）**
> - **A2** 接入 `getFunnel`：`src/services/funnelApi.ts`（4 次请求：product + 三王）+ `adaptRemoteFunnel` 适配；云端不可用时回退本地计算，漏斗页标注数据来源。
> - **A7** 体验指标：`src/services/{perf,experience}.ts`。时长写入既有事件的 `payload`（`load_ms` / `entry_ms`），**不新增漏斗步**（契约 §8 `step` 枚举 v1 已冻结），看板以「体验」卡展示 P50/P95/中位数。
> - **A8** 分群看板：`src/services/segments.ts` + `src/pages/segments`，按 `channel`/`region`/`user_type` 拆分（契约 §8），缺失值归「(未标注)」。

## 2. 命令

```bash
pnpm install --no-frozen-lockfile   # 首次安装（见 §8 限制 2）
pnpm typecheck                      # tsc --noEmit（strict，零 any）
pnpm test                           # Vitest：10 文件 / 70 用例
pnpm coverage                       # 覆盖率（v8）
pnpm build:weapp                    # → dist/weapp
pnpm build:h5                       # → dist/h5
```

微信开发者工具导入本目录；`miniprogramRoot` 已指向 `dist/weapp/`。双端产物分目录落盘，互不覆盖。

## 3. 环境变量（构建期注入，前缀 `TARO_APP_`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `TARO_APP_CLOUDBASE_ENV` | `zhiji-d3gd1k9j43e7c20ac` | CloudBase 环境 ID（ADR-002） |
| `TARO_APP_CLOUDBASE_FN_BASE_URL` | 空 | 云函数 HTTP 端点基址；**空 = 云函数未就绪** |
| `TARO_APP_CLOUDBASE_DISABLED` | `false` | `true` 时跳过 `cloudbase.init`（仅 e2e / 离线构建） |

## 4. 数据访问路由（契约 §5 注）

| 王 | 通道 | 原因 |
|----|------|------|
| 薄肌王 `health` | `recordEvent` / `listEvents` 云函数 | payload 敏感，服务端加解密 |
| 黄毛王 `dating` | 同上 | 同上 |
| 力王 `work` | `cloud.rdb()` 直连 | 契约允许的高频读写，RLS 隔离 |
| 埋点 `analytics_events` / `profiles` | `cloud.rdb()` 直连 | 契约 §8 明示非敏感，无需云函数 |

- 端点未配置时，health/dating 写入抛 `CloudFunctionUnavailableError`，UI 明确提示并禁用提交；**绝不**降级为明文直写或伪造数据。
- 非敏感域直写显式带 `user_id`（NOT NULL），由 RLS `WITH CHECK (user_id = auth.uid())` 校验归属。

## 5. 契约映射表（Zod/类型 ↔ cloudbase-contract v1.4）

| 契约字段 | 契约约束 | 前端实现 |
|----------|----------|----------|
| `events.domain` | `CHECK IN ('health','work','dating')` | `DOMAINS` / `domainSchema = z.enum(DOMAINS)` |
| `events.type` | NOT NULL | `eventTypeSchema`，长度 1–128（对齐后端） |
| `events.ts` | `timestamptz` | `z.string().datetime({ offset: true })`，强制带时区 |
| `events.payload` | `jsonb` | 按 domain+type 的 FIELD 注册表生成严格对象 schema（`.strict()`） |
| `events.source` | NOT NULL | `sourceSchema.default('manual')` |
| `events.user_id` / `created_at` | NOT NULL / 默认 now() | 客户端不填：user_id 走 RLS，created_at 走 DB 默认 |
| `analytics_events.name` | 8 个行为名 | `ANALYTICS_NAMES` 枚举 |
| `analytics_events.step` | 命名空间枚举（v1） | `FUNNEL_STEPS`（25 个 v1 步，无 Phase 3 步） |
| `analytics_events.channel` | 4 渠道 | `CHANNELS` |
| `profiles.user_type` | `new` / `returning` | `USER_TYPES` |

payload 字段（契约 §3，逐项对齐，测试 `tests/payload-schema.test.ts` 断言"不多不少"）：

- health：`water{ml}` / `sleep{duration_h,quality}` / `workout{type,duration_min,calorie}`
- work：`work_log{hours,wage,salary,commute_min}`
- dating：`approach{count,channel,got_response}` / `date{count,duration_min,mood,spend_yuan?}` / `chat{duration_min,platform,initiator}` / `stage{stage,label,note?}`

> 契约未冻结的枚举（`sleep.quality`）取最小语义集 `poor|fair|good|great`，集中在 `src/schemas/payload.ts`，PO 确认后可一处收紧。

## 6. 评分引擎（模块 5）

公式（产品定义 §5）：`单项 = min(实际/满分阈值, 1) × 权重 × 100`，加总为周评分（滚动 7 天）。
通勤为**反向**指标：`max(0, 2 - 实际/阈值)`。工资阈值 = 预期月薪 / 4（`DEFAULT_EXPECTED_MONTHLY_WAGE` 可覆盖）。

| 王 | 指标（周） | 阈值 | 权重 |
|----|-----------|------|------|
| 薄肌王 | 饮水 / 睡眠 / 训练 | 2000ml / 49h / 210min | 30 / 30 / 40% |
| 力王 | 工作 / 收入 / 通勤 | 40h / 月薪÷4 / ≤350min | 35 / 35 / 30% |
| 黄毛王 | 搭讪 / 约会 / 聊天 / 阶段 | 8 / 4 / 300min / 5 | 25 / 25 / 20 / 30% |

段位（§5.2 冻结）：0–39 倔强青铜 / 40–69 秩序白银 / 70–89 荣耀黄金 / 90–100 最强王者。
输出 `{score, tier, breakdown[], windowStart, windowEnd, eventCount}`；`breakdown` 供看板展示"拖后腿项"。

## 7. 埋点 step 清单（模块 6，对照契约 §8）

| 动作 | `name` | 发出的 `step` |
|------|--------|---------------|
| 打开小程序 | `app_open` | `product.acquire`, `product.activate` |
| 进入某王 | `view_king` | `product.activate`（首次 `{king}.onboard`） |
| 薄肌王打卡 | `complete_checkin` | `health.water` / `health.sleep` / `health.workout`（首次 +`health.onboard`；三件套齐 +`health.active_day`） |
| 力王打卡 | `complete_checkin` | `work.wage`（首次 +`work.onboard`） |
| 黄毛王搭讪 | `complete_checkin` | `dating.approach`；`got_response=true` 时 +`dating.response` |
| 黄毛王约会 | `complete_checkin` | `dating.date` |
| 脱单进度 | `stage_up` | `dating.stage_up`；阶段=5 时 +`dating.stage5` |
| 聊天 | `complete_checkin` | 无（chat 不在 v1 漏斗链路，`step` 留空） |
| 分享 | `share` | `product.refer` + `{king}.refer` |
| 召回 | `reactivate` | `product.reactive` |

埋点在既有打卡/进入动作里顺带触发，**不新增用户操作**；写失败只记 `trackError`，不阻断主流程。
`channel/region/user_type` 来自 `profiles`（登录后 `ensureProfile()` 写一次）；`variant` v1 留空。

未自动发出的步：`health.body_sense`、`work.spend`（需额外入口）、以及全部 `*.retain`/`product.habit|value` —— 属 Phase 3 或需更多信号，**不用假数据填充**。

## 8. 两层漏斗（模块 7）

产品级 AARRR：获取 → 激活 → 留存 → 习惯 → 价值 → 推荐（召回 `product.reactive` 单独一张卡）。
各王：黄毛王 启动→首触→破冰→约见→进阶→脱单→推荐；薄肌王 启动→饮水→睡眠→运动→综合打卡→体感/围度→推荐；力王 启动→收入→支出→留存→推荐。

每步展示 count、步间转化率、单步 drop-off%，**瓶颈步 = drop-off 最大者**（红框高亮）。
支持按 `channel` / `user_type` 分群（数据来自 `analytics_events`，`segments` 由实际数据枚举）。
v1 全部前端本地算；`getFunnel` 云函数属 Phase 3。

## 9. 视觉（模块 5–7 统一，产品定义 §7 新粗野主义）

- 粗黑边 3px、零圆角、硬阴影 `6px 6px 0 #000`、大号粗体、高饱和撞色。
- 三王主色（tokens：`src/styles/kings.ts` + `app.scss` CSS 变量）：
  薄肌王 `#39FF14` / 力王 `#FF6B00` / 黄毛王 `#FF2D95`，统一撞黑 `#000000`，纸感底色 `#FFF9E8`。
- 段位徽章配色：青铜/白银/黄金/王者 各一色（`TIER_COLORS`），粗野风 badge。

## 10. 安全（门禁 6）

- 登录只调 `cloud.auth().signInWithWechat()`，不签发/不存储/不读取 token。
- token 由 SDK 持久化（`persistence: 'local'`），应用侧不接触。
- 本地仅缓存 `zhiji:userId` 快照（非凭证），登出/无会话即清除。
- 敏感域 payload 不落本地、不进 Git。

## 11. 测试与质量

- `pnpm test` → **10 文件 / 70 用例**全绿。
- 覆盖率（v8）：Statements **81.87%** / Branches **71.29%** / Functions **82.69%** / Lines **83.77%**。
- `tsc --noEmit` strict 下 0 error，无 `any`。
- 关键用例：契约枚举"不多不少"、Zod 拒绝越界/多余字段/无时区 ts、评分各王权重与反向指标、段位边界、埋点 step 映射、漏斗转化/瓶颈、敏感域路由、埋点失败不阻断。

## 12. 已知限制 / 风险

1. **云函数未部署**：health/dating 的 `recordEvent`/`listEvents` 未配端点（Codex 侧「待云端联调」），因此两位王的打卡与评分在看板会显示 0 并标注不可用 —— 这是当前唯一阻碍端到端演示的外部依赖。
2. **exFAT + 依赖提升**：`G:` 不支持符号链接，故 `nodeLinker: hoisted`；`ajv` 家族 pin 到 v8（否则 root `ajv@6` 与 hoisted 的 `ajv-formats@3` 冲突，Taro 直接起不来）。首次安装用 `--no-frozen-lockfile`。
3. **SDK 类型与运行时不一致**：`@cloudbase/js-sdk@3.10.3` 把 `auth`/`rdb` 声明为属性，运行时是函数。已在 `src/services/cloudbase.ts` 一次 `unknown` 断言收敛，业务代码无感。
4. **H5 的 SDK 构建**：SDK 声明了 `"miniprogram": "miniprogram_dist"`，H5 产物里检测到小程序构建的标记（`wx.getSystemInfo`），webpack `mainFields` 覆盖未生效。功能上未验证受阻，但 H5 包体因此偏大、且 `signInWithWechat` 在浏览器端行为需 Phase 3 实机确认。
5. **包体**：weapp `vendors.js ≈ 947KB`（CloudBase SDK 为主），在 2MB 主包限制内；首屏 <2s 待真机/弱网验证。
6. **e2e 未执行**：Playwright 浏览器二进制下载被网络阻断；`e2e/critical-path.spec.ts` 已就绪（只覆盖"未登录守卫 + 登录页渲染"，不 mock 后端）。完整 登录→打卡→看板 需 CloudBase 开发环境与微信授权。
7. **UI 库**：未用 AntD Mobile，见 ADR-003。

## 13. 目录

```
src/
  app.tsx / app.config.ts       入口、页面注册、启动埋点
  types/contract.ts             v1.4 契约镜像（三王 + §8 分析层）
  services/
    cloudbase.ts                SDK 接入（唯一收敛点）
    rdb.ts                      events/goals/analytics_events/profiles 仓储
    events.ts                   敏感域路由 + 云函数调用 + 看板聚合
    funnel.ts                   两层漏斗计算 + 分群过滤
    tracking.ts                 动作 → step 映射（纯函数）
  scoring/                      阈值与评分引擎（纯函数）
  schemas/                      payload 注册表 / events / analytics Zod
  stores/                       auth / event / analytics
  components/TierBadge.tsx      段位徽章
  styles/kings.ts               三王与段位色 tokens
  pages/{login,entry,dashboard,funnel,segments,plans}/
  utils/                        storage / datetime / error / guard
tests/  e2e/
```