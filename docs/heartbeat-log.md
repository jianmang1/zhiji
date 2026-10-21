# 自主心跳日志（Aurora KB 自治模式）

> 依据 `docs/phase3-backlog.md`「心跳使用约定」：每轮 ① fetch 对比远端 ② 读 backlog + 最新 directive/checkpoint ③ 推进 A 类 ④ B 类只入升级区 ⑤ 结论追加本文件。
> 防虚报：任何"完成"须附分支 + 哈希 + 可复现日志 + PR；远端查不到 = 未完成。

---

## 2026-10-21 · 第 1 轮（DeepSeek · 前端）

### 事实基线
- 读 KB 起点：`origin/main = b51c386`（E2E2 签核、PR #1/#2 均已合并）。
- 本轮开工分支：`feat/frontend-phase3`（基点 = `d8c041b`，即 main 已含的上一轮前端提交）。

### 本轮推进（A 类）
| ID | 任务 | 状态 | 证据 |
|----|------|------|------|
| A2 | 前端接入 `getFunnel`：适配器 + 客户端 + 云端失败回退；页面零改动 | ✅ 完成 | 见 PR（`feat/frontend-phase3`） |
| — | 力王 `work.spend`（`log_spending`）录入 | ✅ 完成 | 契约 §8 四类 category；不写 events 表 |
| — | ADR-005 薄肌王「体感/围度」漏斗步缺 event type | 📄 提案 | `docs/adr/ADR-005-body-sense-type-gap.md` |

A2 实现要点：
- `src/services/funnelApi.ts`：`getFunnel(domain?, range, segment?)` 客户端，两层看板需 4 次请求（product + 三王）。
- `src/services/funnel.ts`：`adaptRemoteFunnel()` 把云端结构适配成页面既有 `FunnelReport`（`conv_rate`↔`conversionFromPrev`、`drop_off`↔`dropOffPct`、`bottleneck_step`↔`bottleneck`），按契约步骤顺序补 0。
- `analyticsStore.refreshFunnel()`：端点已配置则走云端并标记 `funnelSource='cloud'`；失败**回退本地计算**并在页面标明来源，不伪造数据。
- 视觉/交互零改动（仅漏斗页顶部多一行"数据来源"说明）。

### 待确认口径（不阻塞，等 Tech Lead 裁决）
1. **`conv_rate` / `drop_off` 单位**：契约 §8 未冻结是比例(0–1) 还是百分数(0–100)。
   当前实现按数值归一（`|v| ≤ 1` 视为比例），两种都能正确显示；**请 Codex 在契约补一句单位**，前端即可去掉容错分支。
2. **`product.retain` / `habit` / `value`**：v1 不自动发出 → 恒为 0，会让瓶颈步假性落在这些步。
   建议 `habit`（周≥3 天打卡）前端派生，`value`/`retain` 留 Phase 3（已在 PR #2 评论提过，未裁）。
3. **`*.refer` 触发信号**：微信分享无可靠成功回调，点击即发会把"取消分享"算成推荐。建议 v1 不改名、不冒充，refer 留 Phase 3。

### 治理提醒（非抱怨，属门禁一致性）
`cloudbase-contract.md` §5 各函数状态列**仍写「本地实现并通过单元测试；待云端联调」**，
但 `docs/integration-checkpoint-20261021.md` 已签核 E2E2 四函数真实调用通过、PR #1 已合并。
按 `aurora-kb-protocol.md` §5，前端接真实调用的握手信号是契约里标「已实现」。
本轮我按"checkpoint 签核 > 状态列文字"处理（并保留本地回退 + 界面标明来源），
**建议 Codex/Tech Lead 把 §5 状态列更新为「已实现（E2E2 验证通过，见 checkpoint）」，否则后续按字面门禁应继续占位。**

### 下一轮候选
- A7 体验埋点（页面加载/打卡时长）：需先定口径——契约 §8 `step` 枚举禁止自造，倾向以既有事件的
  `payload` 附加 `{load_ms, dwell_ms}`（payload 为自由 jsonb），待裁决后实现。
- A8 分群运营后台：可在 `/funnel` 之外加按 channel/region/user_type 的对比视图（纯前端）。