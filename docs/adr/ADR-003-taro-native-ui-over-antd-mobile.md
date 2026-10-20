# ADR-003 UI 组件库：v1 采用 Taro 原生组件，暂不引入 AntD Mobile

- 状态：Proposed
- 提案方：DeepSeek（前端 Agent）
- 日期：2026-10-20
- 关联：`docs/frontend-execution-plan.md` §1（技术栈写明 AntD Mobile）

## 背景

`frontend-execution-plan.md` §1 与 `deepseek-prompt.md` §1 规定 UI 使用 **Ant Design Mobile（Taro 适配）**。
Phase 2 实际落地时发现它与「双端编译必须通过」的门禁存在冲突风险：

1. `antd-mobile@5` 面向 Web DOM，内部依赖 `window` / `document` / `getComputedStyle` 等浏览器 API；微信小程序是自定义渲染层，没有 DOM。
2. 官方推荐的 Taro 适配方式依赖 `@tarojs/plugin-html` 把 html 标签映射为小程序组件，但插件只做**标签映射**，无法让 antd-mobile 内部直接操作 DOM 的逻辑在小程序运行时成立（弹层、Portal、手势、虚拟滚动尤甚）。
3. 一旦小程序端运行时报错，属于"双端分裂"，按 `deepseek-prompt.md` §7 应先提 ADR 评估，而不是在共享代码里写两套 UI。

## 决策

Phase 2 骨架的共享页面（login / entry / dashboard / plans）**使用 Taro 内置组件**（`@tarojs/components` 的 `View` / `Text` / `Button` / `Input`）实现，**不引入** `antd-mobile` 依赖。

理由：
- Taro 组件在小程序与 H5 两端语义一致，无 DOM 依赖，双端编译与运行风险最低。
- Phase 2 的验收重点是"契约对齐 + 状态管理 + 双端编译"，UI 组件库不构成验收项。
- 现有样式集中在各页 `index.scss`，后续替换成本可控。

## 对协作方的影响

- Codex（后端）：无影响。
- Tech Lead / PO：
  - 若坚持 UI 规范统一（组件库、主题），建议在 Phase 3 前裁定以下之一：
    1. **接受本 ADR**（Taro 原生组件长期使用，自建一套轻量设计常量）；
    2. 引入 Taro 生态的跨端组件库（如 `@tarojs/components` 之上的自研封装 / NutUI-Taro 等**明确支持小程序**的库）；
    3. 仅 H5 使用 antd-mobile、小程序走原生组件 —— 但这会形成双端两套 UI 代码，需先评估维护成本。
- 若裁定采用方案 2/3，前端将在下个 checkpoint 内补装依赖并替换页面实现。

## 回滚方式

本 ADR 未改动任何契约、未引入破坏性结构。回滚 = 在 `frontend/package.json` 加回 `antd-mobile` 并按裁定替换页面组件；`src/` 其余逻辑（services/schemas/stores）与 UI 解耦，无需改动。
## 附：视觉风格落地（2026-10-20 追加）

产品定义 §7 的"新粗野主义"已按约束实现，与组件库选择无关：
- 三王主色 + 统一撞黑写入 `frontend/src/styles/kings.ts` 与 `frontend/src/app.scss` 的 CSS 变量
  （`--king-health: #39FF14` / `--king-work: #FF6B00` / `--king-dating: #FF2D95` / `--ink: #000000`）。
- 页面统一使用 3px 粗黑边、零圆角、`6px 6px 0 #000` 硬阴影；段位徽章配色见 `TIER_COLORS`。
- 这些 tokens 与组件库解耦：若 Tech Lead 裁定改用某个跨端组件库，只需替换组件层，tokens 继续复用。