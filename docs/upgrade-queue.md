# 升级队列（Upgrade Queue）· 需 PO 拍板事项

> 用途：Aurora KB 内**唯一**面向 PO 的升级通道。仅记录 B 类（产品范围 / 契约冻结变更 / 上线合规）事项。
> 原则：Tech Lead 与两 Agent **不实时转述 PO**、不在对话里 @PO；PO 返回时批阅本文件。
> 凡非 B 类（执行 / 基建 / 部署问题）一律自治闭环，不进此队列。

---

## 当前待 PO 拍板项（自 `docs/phase3-backlog.md` B 类同步）

| ID | 事项 | 出处 | 说明 | 状态 |
|----|------|------|------|------|
| B1 | 精确用户画像 + 首批冷启动人群 | `product-definition.md` §2/§12 | AI 整理趋势+漏斗图、不下诊断；冷启动人群不准属预期 | ✅ 已裁决（PO 定，写入 §2） |
| B2 | North Star 阈值目标 | `product-definition.md` §10 | 相对值 | ✅ 已裁决（Tech Lead 定 provisional，冷启动后校准） |
| B3 | 合规清单细化 | `product-definition.md` §11 | 上线前必须 | ✅ 已裁决（PO 自填报，Agent 不介入） |
| B4 | 是否复活 `consumption`/`interest`/`capability` 扩展域 | `cloudbase-contract.md` §2 注 | v1 不含 | ✅ 已裁决（PO 确认 defer Phase 4，维持 v1 三域） |
| B5 | 薄肌王 `body_sense` type 缺口（ADR-005） | `docs/adr/ADR-005-body-sense-type-gap.md` | 契约 §3 health 域缺可产出"体感/围度"漏斗步的 event type | ✅ 已裁决（PO 采纳 A：§3 health 加 `body_sense` type，零迁移；Codex 零改、前端注册表 +1 type） |

---

## 已决议记录（2026-10-21，PO 回）
- B1：PO 定精确画像（用 AI 管理饮食/训练/工作；AI 只整理趋势+漏斗图、不下诊断；冷启动人群不准属预期）→ 写入 `product-definition.md` §2。
- B2：PO 授权 Tech Lead 定 North Star 阈值 → provisional 相对值表写入 `product-definition.md` §10，冷启动后校准，不触发 ADR。
- B3：PO 明示自填报（"我填报就行"）→ 转 PO 自办，Agent 不介入。

## 待 PO 确认（建议项，非阻塞）
- B4：✅ **2026-10-21 PO 回「同意」** —— 维持 v1 三域（health/work/dating），扩展域 `consumption`/`interest`/`capability` 全部 defer 到 Phase 4，现在不复活。已闭环，无遗留动作。
- B5：✅ **2026-10-21 PO 回「采纳 A」** —— ADR-005 已 Accepted；契约 bump v1.5，§3 health 补 `body_sense` type（`{waist_cm?, feel?:enum('great','ok','tired'), note?}`），零数据库迁移，Codex 零改、前端注册表 +1 type。已闭环，派发见 `docs/tech-lead-directive-b5-20261021.md`。

## 追加规则
- 新增 B 类事项：在上方表格追加一行，标注出处与状态。
- 事项解决后：保留行并标记状态，勿删除历史。
- 任何 Agent 发现疑似需升级项但拿不准时：先写本队列并标注「待 Tech Lead 裁定是否升级」，由 Tech Lead 最终定夺，不越级直达 PO。
