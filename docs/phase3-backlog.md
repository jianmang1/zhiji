# Phase 3 待办清单（执己）

> 起草：Tech Lead，2026-10-21，v1 闭环（`origin/main = b51c386`）后。
> 用途：供「自主心跳」周期消费。心跳每轮读取本文件，推进 **A 类（自治）**，对 **B 类（升级）** 仅在 KB 升级区记录、不实时转述 PO。
> 门禁：所有推进须遵守 `four-party-alignment-20261020.md` 防虚报硬门禁（分支+哈希+日志+PR，远端 `git ls-tree` 查不到 = 未完成）。

---

## A. 自治可执行（Aurora KB 模式，不升 PO）

| ID | 任务 | 归属 | 依赖 | 验收 | 需 CloudBase |
|----|------|------|------|------|--------------|
| A1 | `getFunnel` 完整聚合增强：渠道质量分、趋势图、A/B（`experiment_id`/`variant`） | Codex | 现有 `getFunnel` 已部署 | 云函数返回含 `channel_quality`/趋势序列；单测覆盖 | 是（部署+验证） |
| A2 | 前端接入 `getFunnel` 云函数：`src/services/funnel.ts` 加适配器（`conv_rate↔conversionFromPrev` 等），页面零改动 | DeepSeek | A1 完成 | `taro build`+`vitest` 通过；远端 `frontend/` 可查 | 否 |
| A3 | CLS 日志服务配置（环境未配 Topic，当前 `ResourceNotFound.TopicNotExist`） | Codex/环境负责人 | 环境权限 | 函数日志可查 | 是（环境配置） |
| A4 | `generatePlan` AI 能力监控+降级：AI 未开通时后端返回明确降级码，前端占位已做 | Codex | — | 未开通 AI 时返回 2xx+降级字段，非 5xx | 是（验证） |
| A5 | 跨用户 cohort 汇总：ADR-004 已裁定 Phase 3；先定权限设计（谁可见 cohort）再实现 | Tech Lead 裁定→Codex | 权限设计 | ADR 增补 + 云函数按权限过滤 | 是 |
| A6 | 公网部署 / 自定义域名（Phase 3 联调收口） | Codex | A1–A5 部分 | 公网 URL 可访问 4 函数 | 是 |
| A7 | 体验指标采集：页面加载/流程时长埋点（契约 §8 预留 `product.*`） | DeepSeek | — | 看板展示体验步 | 否 |
| A8 | 分群运营后台（简单看板：按 channel/region/user_type 拆分） | DeepSeek | A1/A2 | 页面可筛选分群 | 否 |

## B. 需 PO 拍板（升级类，仅记 KB 升级区，不实时转述）

| ID | 事项 | 出处 | 说明 | 决议（2026-10-21） |
|----|------|------|------|------|
| B1 | 精确用户画像 + 首批冷启动人群 | `product-definition.md` §2/§12 | AI 整理趋势+漏斗图、不下诊断；冷启动人群不准属预期 | ✅ PO 已定，已写入 §2 |
| B2 | North Star 阈值目标 | `product-definition.md` §10 | 相对值 | ✅ Tech Lead 定 provisional（§10 表），冷启动后校准 |
| B3 | 合规清单细化 | `product-definition.md` §11 | 上线前必须 | ✅ PO 自填报（"我填报就行"），Agent 不介入 |
| B4 | 是否复活 `consumption`/`interest`/`capability` 扩展域 | `cloudbase-contract.md` §2 注 | v1 不含 | ✅ PO 确认 **defer 到 Phase 4**（维持 v1 三域 health/work/dating，现在不复活）；2026-10-21 |

## C. v1 遗留（不阻塞，跟进项）

- C1 = A3（CLS 未配）
- C2 = A4（`generatePlan` AI 额度）
- `getFunnel` 跨用户 cohort 权限设计 = A5

---

## 心跳使用约定
- 每轮：① `git fetch` + 查 `origin/main` 与各 `feat/*` 远端哈希；② 读本文件 + 最新 `tech-lead-directive-*`/`integration-checkpoint-*`；③ 推进 A 类可达标项；④ B 类仅追加到 `docs/upgrade-queue.md`；⑤ 结论追加 `docs/heartbeat-log.md`。
- 需 CloudBase 凭证的步骤（A1/A3/A4/A5/A6）：只在 KB 写精确指令 + 标「等 Codex 会话」，不伪造结果。
- 合并前必须确认 PR 全部门禁通过；冲突/不确定 → 暂停并记升级区，不强行合并、不 force push。
