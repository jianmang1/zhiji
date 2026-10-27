# 待 PO 处理（自主心跳每轮更新）

> 由「执己 Phase3 自主心跳」每轮覆盖更新。列出需要你（PO）介入的事项：拍板决策、唤醒 Codex/DeepSeek 会话。其余执行类问题由三方在 Aurora KB 自治闭环，不在此列。
> 格式：🔴 拍板 / 🟡 唤醒 Codex（CloudBase 凭证） / 🟢 唤醒 DeepSeek（前端）。
> 本轮回合：2026-10-27T15:03+08:00（第 30 轮 · 审核被拒整改派发 · 纠正 Tech Lead 越界）。
> 本轮回合：2026-10-27（第 30 轮 · PO 样本已写入回读 · Codex 服务端核验待 CloudBase 重新登录）。

## 📌 本轮核验结论（Tech Lead 自治核验）
- **origin/main = aa1911d**（本轮 `--no-ff` 合并提交）；本次前端实现位于分支 **`feat/frontend-ux-funnel-20261022`**（commit `f233355` + KB `28bea26`），**PR #11 已由 PO 开并经 Tech Lead 复核合并入 main**。
- **两份 DeepSeek 派发指令（🟢）已落地实现**：因两者文件高度重叠（entry/payload/funnel/analyticsStore/app.config），合并为单次 PR 以免冲突。
  - 门禁全绿：`tsc --noEmit` 0 错误；`vitest` **129/129**；`taro build:weapp` 编译通过。
  - **未触碰 `cloudbase.ts` / `authStore.ts`**（PO 登录重构中，以 PO 版本为准）。
- **改动实质**：
  - 漏斗重构（ADR-007）：产品级 AARRR 改名「王败寇」（五层阶梯 + 阈值 achieved 徽章 + 占位社区人数）；薄肌王漏斗改为基于**真实打卡 events** 的四层（喝大水和睡大觉→运动→压抑指标→体感），新增健康类型 `suppression`（score 0–10，越低越好）；**砍掉分群运营页与 tabBar 入口**；力王/黄毛王暂不动。
  - UX 优化：打卡草稿按 `domain:type` 自动保存（离开/切换兜底存，提交成功清草稿，绝不自动提交 recordEvent）；感觉/体感类输入改拖条（`feel_score` 1–10、`suppression.score` 0–10 标注越低越好）。
- **契约**：零数据库迁移，`suppression` + `feel_score` 仅前端注册表 + 契约 §3 扩展，**Codex 零改动**。

## 🔴 拍板 / 授权事项（需你决策）
- **本轮无新增拍板项。** ADR-007 与两份派发均闭环。
- **可延后**：王败寇"社区人数"为占位数字（不实聚合，ADR-006 冻结维持）；若未来要真聚合需另升隐私裁定。

## 🟡 需唤醒 Codex 会话（CloudBase 凭证类）
- **health/dating 加密读写 E2E（directive 已派发 2026-10-21，2026-10-23 激活）**：PO 已报告样本写入并在 App 内明文回读成功（客户端侧证据）。Codex 本轮尝试服务端核验，但 CloudBase 控制台会话已过期且本机数据库 URL 指向不可用的 localhost；尚未核验 PG 密文、同钥解密或 RLS，checkpoint 未补造结论。**待 PO 在保留的 CloudBase 标签重新登录后，Codex 继续路线 A 服务端核验**。token 仅前端↔Codex，不经 Tech Lead（见 directive §0/§5/§6）。
- A1/A3/A4/A5/A6 已随 PR#9 合 main，**无需再唤醒**。

## 🟢 唤醒 DeepSeek 会话（前端待办）
- **✅ 已合并 main @ aa1911d**：① 体验优化（自动保存草稿 + 感觉/体感拖条）② 漏斗重构（王败寇改名 + 薄肌王四层 + 砍分群运营）。两指令在分支 `feat/frontend-ux-funnel-20261022` 一并实现并已合 main。
- **后续前端活项（PO/DeepSeek 待定）**：力王/黄毛王漏斗照搬薄肌王思路重构（ADR-007 §5 暂留）；suppression/feel_score 录入后的评分与 AI 意见联动（当前仅落库，未进评分引擎）。
- **🆕 审核整改候选（待 DeepSeek 复核/开 PR）**：分支 `feat/frontend-audit-fix-20261026`（`7e0f45a`，已推 origin）+ 指令 `docs/tech-lead-directive-audit-fix-20261026.md`。内容：游客可浏览（首页改 entry + `restoreSession` 不强制跳登录）+ 登录失败 `showToast` 反馈 + 「先逛逛」入口。Tech Lead 已纠正越界（此前直接改的前端源码已移出 `main`，转为候选挂分支）。请 DeepSeek 按指令 §2 复核清单逐项确认、跑全门禁（tsc 0 / vitest ≥129/129 / build:weapp）、修订后开 PR 到 `main` 并拥有该 PR；Tech Lead 收 PR 后 `--no-ff` 合并复核。

## 🔧 PO 平台动作（审核整改·代码无法替代 · Tech Lead 不代办）
- **服务器域名白名单（根因 2 真正修复）**：微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名，**确保含两条精确域名（不支持 `*` 通配符，填 `*` 报"非法字符"）**：`https://zhiji-d3gd1k9j43e7c20ac-1510872056.ap-shanghai.app.tcloudbase.com`（HTTP 函数专属主机）+ `https://tcb-api.tencentcloudapi.com`（登录网关）。此前建议的 `*.app.tcloudbase.com` / `*.api.tcloudbasegateway.com` 写法有误，**删除所有带 `*` 的条目**，其余已有域名保持不动。开发者工具 `urlCheck=false` 会掩盖未配置，审核版强制校验，必须登记。
- **第三方授权解锁提审入口**：当前「腾讯云微搭低代码」授权接管了「开发管理」，网页后台提审入口被禁用。PO 二选一：收回其开发权限后回测+提审，或删除授权后回测+提审（或走微搭控制台提审）。
- **整改后重新提审**：代码 PR 合 main + 域名白名单 + 授权处理后，重传版本、提交审核。

## 本轮结论
ADR-007 + 两份前端派发指令已落地并合并入 `main`（`aa1911d`，PR #11）。PO 报告 health/dating 样本已写入且 App 内明文回读成功。**当前唯一阻塞**：Codex 的 CloudBase 控制台登录态已失效；恢复登录后继续服务端密文落库/同钥解密/RLS 核验，再回写 checkpoint 供 Tech Lead 复核。
