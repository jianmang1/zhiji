# 待 PO 处理（自主心跳每轮更新）

> 由「执己 Phase3 自主心跳」每轮覆盖更新。列出需要你（PO）介入的事项：拍板决策、唤醒 Codex/DeepSeek 会话。其余执行类问题由三方在 Aurora KB 自治闭环，不在此列。
> 格式：🔴 拍板 / 🟡 唤醒 Codex（CloudBase 凭证） / 🟢 唤醒 DeepSeek（前端）。
> 本轮回合：2026-10-22T18:05+08:00（第 27 轮 · 漏斗重构派发）。

## 📌 本轮核验结论（Tech Lead 自治核验）
- **origin/main = 5f8df48**（工作树有前端源码未提交改动，见下）。
- **产品重构已拍板（ADR-007 Accepted）**：保留漏斗、产品级 AARRR 改名「王败寇」（五层：陌生人/好奇猫/留存>3天/落魄谷>10天/少年归到底>10次，社区人数占位）、薄肌王漏斗四层（喝大水+睡大觉→运动→压抑指标→体感1–10，最终层=自己体感）、砍分群运营、力王/黄毛王暂不动。
- **派发 DeepSeek 两项**（见 🟢）：体验优化（自动保存草稿 + 感觉类拖条）、漏斗重构（王败寇改名 + 薄肌王四层 + 砍分群运营）。
- **你（PO）的前端登录重构**：工作树未提交改动将 `signInWithWechat` 改为 `signInWithOpenId({useWxCloud:false})`、appid 改为 `wx1e5b9e6f10ca3683`、构建产物改 `dist/weapp-staging`、加 `lazyCodeLoading`——这正是绕开此前 `wx.cloud` `invalid appid` 的修法，属合法重要改动，本轮一并入库（不覆盖）。

## 🔴 拍板 / 授权事项（需你决策）
- **本轮无新增拍板项。** ADR-007 已你裁定闭环。历史 B 类（B1–B5）+ ADR-006 隐私裁定均闭环。
- **可延后**：王败寇"社区人数"为占位数字（不实聚合，ADR-006 冻结维持）；若未来要真聚合需另升隐私裁定。

## 🟡 需唤醒 Codex 会话（CloudBase 凭证类）
- **health/dating 加密读写 E2E（directive 已派发 2026-10-21）**：`FERNET_ENCRYPTION_KEY` 已恢复。**前置**：需有人在前端用真实账号成功登录并写入 health(`body_sense`)+dating 后回读明文。当前**登录修复由你（PO）直接在前端迭代**（`signInWithOpenId`），待你登录跑通并完成 health/dating 打卡，再唤醒 Codex 做服务端密文/解密/RLS 隔离核验（token 仅前端↔Codex，不经 Tech Lead）。
- A1/A3/A4/A5/A6 已随 PR#9 合 main，**无需再唤醒**。

## 🟢 唤醒 DeepSeek 会话（前端待办 · 两项已派发）
- **① 体验优化**（`docs/tech-lead-directive-ux-20261022.md`）：离开页面自动保存打卡草稿（防丢"记下这一笔"）+ 感觉/体感类输入改拖条（含新增 `suppression.score` 0–10、`body_sense.feel_score` 1–10）。**纯前端 UX，不碰契约。**
- **② 漏斗重构**（`docs/tech-lead-directive-funnel-redesign-20261022.md`）：依据 ADR-007 —— 王败寇改名 + 五层重命名/阈值 + 占位社区人数；薄肌王四层漏斗（终层=体感1–10）+ `suppression` 录入；**砍掉分群运营页与 tabBar 入口**；力王/黄毛王暂不动。
- **注意**：两项均**不要改 `cloudbase.ts`/`authStore.ts`**（PO 登录重构中，以其版本为准）。分支建议 `feat/frontend-ux-20261022` 与 `feat/frontend-funnel-redesign-20261022`，各自提 PR。

## 本轮结论
ADR-007 已裁定（漏斗保留 + 王败寇 + 薄肌王体感终层 + 砍分群运营），两份 DeepSeek 派发指令已就位（🟢）。你（PO）正在前端直接修登录（`signInWithOpenId`，绕开 wx.cloud invalid appid），本轮把该合法改动连同 KB 文档一并入库。**唯一仍待你驱动的活项**：登录跑通后做 health/dating 打卡 → 唤醒 Codex 做加密读写 E2E 服务端核验。
