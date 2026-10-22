# Tech Lead 派发 · 体验优化（DeepSeek 前端）· 2026-10-22

> 依据：PO E2E 体验反馈（2026-10-22）。PO 已确认「现在就做」。
> 范围：纯前端 UX 改进，**不碰产品范围、不碰契约**。仅改 `frontend/` 源码。
> 门禁：改完跑 `npm run typecheck` + `npm test` 全绿，再提 PR。

## 任务 1 · 离开页面自动保存打卡草稿（防丢"记下这一笔"）

**问题**：PO 反馈"有时会忘记点记下这一笔，点进其他地方时希望等于保存"。

**要求**：
1. 打卡录入页 `frontend/src/pages/entry/index.tsx`（选王 → 选 type → 填表）的表单状态，进入一个**前端草稿 store**（新建 `frontend/src/stores/draftStore.ts` 或并入现有 store）。
2. **自动保存时机**：表单任何字段变动即写入草稿（debounce 即可）；页面 `onHide` / 组件卸载时也兜底存一次。
3. **恢复时机**：回到该页（同一 domain+type）时自动恢复草稿，顶部提示"已恢复上次未提交的草稿"。
4. **显式提交**：保留"记下这一笔"按钮 = 调 `recordEvent`（health/dating 走云函数加密，work 走 `cloud.rdb()`）。提交成功后**清空该草稿**。
5. **切换王/type 不丢**：切换 domain 或 type 时，先存当前草稿再切，目标页恢复对应草稿。
6. UI 反馈：未提交草稿存在时，提交按钮旁/打卡 tab 给一个"草稿"小标记。

**不要**：不要把自动保存做成"自动提交 recordEvent"——仍需用户主动点"记下这一笔"才入云（避免误写密文）。自动保存仅存本地草稿。

## 任务 2 · 感觉 / 体感类输入改拖条（slider）

**问题**：PO 反馈"有些数据比如感觉类的弄成拖条比较好"。

**要求**：
1. 在 `frontend/src/schemas/payload.ts` 的注册表中，给以下字段标记为 **slider 控件**：
   - 薄肌王 `body_sense.feel_score`（1–10，自己体感，ADR-007 新增）→ 拖条 1–10。
   - 薄肌王新增 `suppression.score`（0–10，越低越好，ADR-007 新增）→ 拖条 0–10，并标注"越低越好"方向。
   - 黄毛王 `date.mood`（`great`/`ok`/`awkward`）→ 可保留为 3 档选项**或**也改有序拖条，由你按粗野风统一决定（建议保留 3 档语义更清晰）。
2. 打卡表单根据注册表的 `control: 'slider'` 渲染 `Slider` 组件（Taro `AtSlider` / 原生 `slider`），替代原 `Input` / `Picker`。
3. `feel_score` 与 `suppression.score` 为 ADR-007 新增字段/类型，录入组件随本任务一并接入（类型注册见 `cloudbase-contract.md` §3 health）。

## 验收（提交前自检）
- `npm run typecheck` 0 错误；`npm test` 全绿（注意 `frontend/tests/auth-store.test.ts` 已随登录重构改为 `signInWithOpenId`，不要回退）。
- 手动路径（如可跑 dev:weapp）：打卡填一半 → 切到看板再回来 → 草稿恢复；体感/压抑用拖条录入并成功 `recordEvent`。
- 不引入新依赖；风格遵循 Neo-Brutalism（§7）。

## 提交
- 分支：`feat/frontend-ux-20261022` → 开 PR 到 `main`。
- PR 描述注明：自动保存草稿 + 感觉类拖条；关联 ADR-007。
- **不要**改 `cloudbase.ts` / `authStore.ts`（PO 正在重构登录为 `signInWithOpenId`，以 PO 的版本为准，勿冲突）。
