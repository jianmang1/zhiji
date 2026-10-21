# 执己 CloudBase 云函数

Python 3.11 HTTP 云函数实现 `cloudbase-contract.md` 中的 `recordEvent`、`listEvents`、`generatePlan` 与 `getFunnel`。`backend/` 下 FastAPI 仅作旧实现参考。

## 实现说明

- CloudBase 官方支持 JS `app.rdb()` 客户端；Python 云函数用 CloudBase PostgreSQL HTTP API 访问 PG。函数把登录用户的 Bearer access token 透传给 PG REST API，让 `authenticated` 角色和 RLS 校验每次读写，不使用 service role。
- Functions 是 HTTP 云函数，监听 9000 端口。请求体直接是契约入参，调用时使用 `POST /v1/functions/{functionName}?webfn=true` 并携带当前用户 access token。
- `recordEvent` 会在写库前用 `FERNET_ENCRYPTION_KEY` 加密 `health` / `dating` 域 payload。密文保存为 JSONB envelope `{"_encrypted_v1":"..."}`；`listEvents` 与 `generatePlan` 在服务端解密。其他域 payload 保持原 JSON 对象。
- `generatePlan` 要求 `based_on.domain` 与查询范围，通过用户 token 查询最多 200 条 RLS 可见事件；按最近 7 天的契约字段镜像 `frontend/src/scoring/engine.ts` 计算 score/tier，再让 CloudBase 内置模型生成 summary/actions/next_milestone。服务端校验并排序 2–4 条行动建议，最终按 §5.1 统一 schema 写入 `plans`。生成失败时不会写入方案。
- `getFunnel` 接受必填 `range.from/to`、可选 domain（默认 `product`）与 channel/region/user_type segment。它用当前用户 token 查询 `analytics_events` 和当前用户的 `profiles`，所以结果只汇总调用者自己的 RLS 可见埋点；profile 字段作为埋点维度为空时的分群回退。各步 count 是事件数，`conv_rate`/`drop_off` 是 0–1 比率；product.reactive 单独展示，不参与 AARRR 连续转化率或瓶颈计算。
- 未在请求或日志中输出 token、密钥或事件内容。事件查询只接受契约支持的过滤字段。

## 环境变量

| 名称 | 用途 |
|---|---|
| `TCB_ENV` | CloudBase 函数运行时提供的环境 ID；本地可设 `TCB_ENV_ID` |
| `FERNET_ENCRYPTION_KEY` | 健康/消费 payload 的 Fernet 密钥，放入函数 Secret/环境变量 |
| `TCB_AI_PROVIDER` | 可选，默认 `cloudbase` |
| `TCB_AI_MODEL` | 可选，默认 `hy3`；须在 CloudBase 环境启用对应模型 |

生成 Fernet 密钥：`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`。请使用部署平台密钥配置，不要提交密钥。轮换密钥前要为历史密文安排重加密。
本地变量名模板见 `.env.example`；文件中的值留空，部署时在 CloudBase 函数环境中配置密钥。

## 构建与部署

在仓库根目录运行 `python cloudbase/build_functions.py`。脚本创建 Linux x86_64 / Python 3.11 依赖包到 `cloudbase/dist/`；该目录是构建产物并已加入 `.gitignore`。然后在 CloudBase CLI 已登录的终端中，分别进入各函数目录部署：

```powershell
cd cloudbase/dist/recordEvent; tcb fn deploy --httpFn
cd ../listEvents; tcb fn deploy --httpFn
cd ../generatePlan; tcb fn deploy --httpFn
cd ../getFunnel; tcb fn deploy --httpFn
```

部署时不要设置公开匿名访问。小程序应通过 CloudBase 登录态调用，并确保用户 access token 转发到函数请求的 `Authorization` header。启用 CloudBase AI 模型并为函数配置 `TCB_AI_MODEL`；无需另行在代码中嵌入第三方模型密钥。

## 测试与静态检查

使用仓库的 Python 开发环境运行：

```powershell
python -m pytest cloudbase/tests --cov=zhiji_cloudbase --cov-report=term-missing --cov-fail-under=70
python -m ruff check cloudbase/src cloudbase/tests cloudbase/functions
python -m mypy cloudbase/src
```

单元测试 mock CloudBase REST/LLM 网关，不消耗线上模型额度。真实 CloudBase 环境中的用户 token 透传、RLS 隔离和模型调用仍需部署后集成验收。
