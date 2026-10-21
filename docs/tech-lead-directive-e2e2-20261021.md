# Tech Lead 指令 — 端到端调用失败（HTTP 函数启动即崩 / 空 443 / 超时）

**状态**：前端 PR #2 已合入 `main`；后端 PR #1 已完成 ADR-004（`user_id`→`text`、双用户 RLS 冒烟通过、单测 23 通过）。
**唯一未过验收项**：函数端到端调用（HTTP API 返回空 443、CLI 超时、无运行日志）。
**本指令判定**：纯部署/启动层问题，属自治范围，**不升 PO**。Codex 在已登录的 CloudBase 会话内按本指令执行。

---

## 0. 修复已落地（2026-10-21 10:40）

Tech Lead 已将 `scf_bootstrap` 的 `/opt` 修复**直接提交并推送到 PR #1**（commit `ab1f15d`，4 文件 +12/-4，`origin/feat/getfunnel-deploy = ab1f15d`）。4 个 `scf_bootstrap` 现为：
```bash
export PYTHONPATH="./third_party:/opt:/opt/python/lib/python3.11/site-packages:$PYTHONPATH"
```
**Codex 无需再改 bootstrap**，按以下顺序执行即可：
1. （可选）§3.1 先取一次真实错误，确认是 `ModuleNotFoundError: pydantic`；
2. §3.2 用 `find /opt` 核对 Layer 实际路径——若 pydantic 不在上述两路径之一，再微调 `PYTHONPATH`（通常不需要）；
3. §3.3 **重建部署包**（`python build_functions.py --skip-deps`，bootstrap 已含 /opt）；
4. §3.4 确认 env；§3.5 重部署 4 函数；§3.6 端到端验收；§3.7 回写 checkpoint。

---

## 1. 根因（已基于仓库代码核实）

- 4 个 `scf_bootstrap` 当前只设：
  ```bash
  export PYTHONPATH="./third_party:$PYTHONPATH"
  ```
- 但本次部署依赖改走 **CloudBase Layer**，包挂载在 **`/opt`**（`third_party` 目录已不再随包上传）。
- 函数入口 `http_function.py:5` 与 `handlers.py:6` 在**模块导入阶段**就 `from pydantic import ...` / `import httpx` / `import cryptography`。这些第三方包只在 `/opt`，而 `PYTHONPATH` 不含 `/opt` → **`ImportError` 在 `import` 阶段直接让进程退出** → 从未 `serve_forever()` 监听 9000。
- 网关无法连上 9000 → 返回空 443 + CLI 超时 + 无函数运行日志。

**已排除项**：
- `TCB_ENV_ID` 缺失会在**请求时**才 `raise`（`config.gateway_base_url()` 被调用时），届时服务已监听、会回 500 且有日志——与"无日志/空响应"不符，故非主因（但仍须确认已注入，见 §3.4）。
- 端口绑定正确：`http_function.py:58` 是 `ThreadingHTTPServer(("0.0.0.0", 9000), ...)`，无问题。
- 解释器路径 `exec /var/lang/python311/bin/python3.11 main.py` 此前 recordEvent/listEvents 已实跑通（22P02 实证），路径正确。

---

## 2. 修复（精确替换 4 个 scf_bootstrap）

源码位置（构建脚本 `build_functions.py:60` 会原样复制到 `dist/<fn>/scf_bootstrap`，故改这 4 个即可）：
`cloudbase/functions/{recordEvent,listEvents,generatePlan,getFunnel}/scf_bootstrap`

**统一替换为**：
```bash
#!/bin/bash
# Deps may come from a vendored ./third_party (build without --skip-deps) OR a
# CloudBase Layer mounted at /opt. Include both so imports never fail at startup.
export PYTHONPATH="./third_party:/opt:/opt/python/lib/python3.11/site-packages:$PYTHONPATH"
exec /var/lang/python311/bin/python3.11 main.py
```

> 若你的 Layer 把包放在其它子路径，见 §3.2 用 `find` 定位后把精确路径补进 `PYTHONPATH`。`/opt` 与 `/opt/python/lib/python3.11/site-packages` 覆盖 CloudBase/SCF 的常见两种布局。

---

## 3. Codex 执行顺序（在 PR #1 分支 `feat/getfunnel-deploy` 内）

### 3.1 先取真实错误（避免猜）
部署前先触发一次调用并拉日志，确认是 `ImportError` 而非其它：
```bash
tcb fn invoke recordEvent --params '{"domain":"work","event_type":"log_spending","payload":{}}'   # 或用 CLI 触发一次 HTTP 调用
tcb fn log get recordEvent --tail 50
# 也可在 scf_bootstrap 顶部临时加：python3.11 -c "import pydantic, cryptography, httpx" 2>&1
```
预期看到 `ModuleNotFoundError: No module named 'pydantic'` 类错误——确认即命中本根因。

### 3.2 定位 Layer 实际路径（若 §2 的路径不够）
```bash
# 在 scf_bootstrap 里临时加一行诊断后部署，或 fn invoke 一段探测：
python3.11 - <<'PY'
import sys, subprocess
print("PYTHONPATH=", __import__("os").environ.get("PYTHONPATH"))
print("sys.path=", sys.path)
subprocess.run(["find","/opt","-maxdepth","6","-name","pydantic"])
PY
```
把 `pydantic` 所在的 `site-packages` 父目录补进 `PYTHONPATH`（§2 已含两种常见路径，通常无需再改）。

### 3.3 替换 scf_bootstrap 并重建部署包
```bash
# 编辑 4 个 scf_bootstrap 为 §2 内容（或确认已含 /opt）
# 依赖走 Layer 时，构建可跳过 vendoring：
python build_functions.py --skip-deps
# 确认 dist/<fn>/scf_bootstrap 已含 /opt 且带可执行位：
ls -l dist/recordEvent/scf_bootstrap      # 应为 -rwxr-xr-x
```
> 若走 `tcb fn deploy` 上传，`scf_bootstrap` 必须保留可执行位（`chmod 755`，构建脚本已做）。部署后可用 `tcb fn getdetail` 核对入口/启动配置。

### 3.4 确认运行时环境变量已注入（4 函数均需）
- `TCB_ENV_ID`（必需，缺失仅影响请求期，但须配）
- `FERNET_ENCRYPTION_KEY`（health/dating 域必需；work 域不触发）
- `TCB_AI_PROVIDER`（默认 `cloudbase`）、`TCB_AI_MODEL`（默认 `hy3`，generatePlan 需要 AI 能力已开通）
通过 CloudBase 控制台或 `tcb fn config` 确认 4 函数 env 均已设置。

### 3.5 重部署 4 函数
```bash
tcb fn deploy recordEvent
tcb fn deploy listEvents
tcb fn deploy getFunnel
tcb fn deploy generatePlan
# 或一次性：tcb fn deploy --all
```
部署后 `tcb fn list` 应 4 个均 `Active`，且首次调用应产生**运行日志**（不再是空）。

### 3.6 端到端验收（4 函数逐一，记录状态码+响应体+耗时）
1. **recordEvent**（work 域，不依赖 fernet）：用测试用户 A token 写入一条 `log_spending`，期望 `2xx` + 返回事件 id。
2. **listEvents**：同用户 A token 读取，期望返回刚写入的事件（证明写入→读取→RLS 通路打通）。
3. **getFunnel**：同用户 A token，期望返回按 step 聚合的漏斗行（无 22P02）。
4. **generatePlan**：同用户 A token，期望返回 JSON `{summary,actions,next_milestone}`；若 AI 能力未开通/密钥缺失应明确 `5xx`+日志（属可单独记录的项，不影响前 3 项验收）。

### 3.7 回写 KB
- 验收通过后，在 `docs/integration-checkpoint-20261021.md` 记录 4 函数端到端通过证据（调用示例 + 状态码）。
- 若 generatePlan 因 AI 未开通失败，**不阻塞** v1 合并，单独记一条"AI 能力待开通"待办，仍不升 PO。
- 全部通过后由 Tech Lead 合 PR #1 并出 v1 checkpoint 报告。

---

## 4. 验收翻转条件
- [ ] `tcb fn log` 能看到函数启动/请求日志（不再是"无日志"）。
- [ ] 4 函数直接调用均返回非超时响应（recordEvent/listEvents/getFunnel 期望 `2xx`）。
- [ ] recordEvent→listEvents 读写闭环在 RLS 下正确（A 只见 A）。
- [ ] scf_bootstrap 已含 `/opt` 且 4 文件均 `755`。

---

*本指令由 Tech Lead 在 KB 内直接裁定，属部署/启动层自治事项，不触发 PO 升级。Codex 执行后回写结果即可。*
