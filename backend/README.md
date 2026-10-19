# 执己后端

FastAPI + async SQLAlchemy + PostgreSQL/JSONB 实现，API 前缀 `/v1`，契约以 `../docs/api/openapi.yaml` 为准。

## 本地启动

1. 使用 Python 3.11+ 和 PostgreSQL（需支持 JSONB）。创建空数据库 `zhiji`。
2. 在 `backend/` 建立虚拟环境并安装：`python -m pip install -e ".[dev]"`
3. 复制 `.env.example` 为 `.env`，填写 `DATABASE_URL`、随机 `JWT_SECRET_KEY`、有效 Fernet `FERNET_ENCRYPTION_KEY`、微信小程序 `WX_APP_ID` 和 `WX_APP_SECRET`。
4. `alembic upgrade head`
5. `uvicorn app.main:app --reload`

API 文档地址为 `/docs`。不要把 `.env`、生产凭证或个人数据提交到版本库。

## 测试

测试通过独立 PostgreSQL 数据库运行，不支持 SQLite 替代：设置 `TEST_DATABASE_URL`，执行 `pytest --cov=app --cov-report=term-missing`。集成用例执行前会清空并创建测试 schema，**只能指向专用测试数据库**。微信 code2session 用 HTTP mock，避免依赖线上账号。

```powershell
$env:TEST_DATABASE_URL='postgresql+asyncpg://zhiji_test:...@localhost/zhiji_test'
pytest --cov=app --cov-report=term-missing
mypy app
```

## 已知限制

- 微信登录需要有效小程序配置；正式部署须配置强随机 JWT 密钥。
- API 响应与错误结构需继续通过 OpenAPI contract test 验收。
- 访问令牌已实现；refresh token 签发但契约未定义刷新端点，当前不提供刷新 API。
- 健康与消费事件 payload 在 PostgreSQL 中以 Fernet 密文保存、API 出口解密；妥善托管和轮换 `FERNET_ENCRYPTION_KEY`。
- Phase 1 当前执行环境没有 PostgreSQL；真实数据库集成、migration upgrade/downgrade 与端到端落库尚待在专用 PostgreSQL 上完成。
