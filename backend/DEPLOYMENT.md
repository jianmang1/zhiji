# 部署

## 配置

使用 Python 3.11+ 容器，安装 `pip install .`。通过部署平台 Secret 注入 `DATABASE_URL`、`JWT_SECRET_KEY`、`FERNET_ENCRYPTION_KEY`、`WX_APP_ID`、`WX_APP_SECRET`；严禁把真实值写进镜像或仓库。生产 PostgreSQL 应启用 TLS、备份与最小权限账号。生成 Fernet key 可使用 `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`；轮换前须制定历史密文重加密流程。

## 发布顺序

1. 构建并发布不可变镜像。
2. 在单独发布任务中执行 `alembic upgrade head`。
3. 启动 `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2`。
4. 由云负载均衡提供 HTTPS；仅开放健康检查和 API 所需入口。
5. 验证 `/docs` 或受控健康检查、微信登录、数据库连接与日志告警。

回滚应用前确认 schema 向后兼容。需要回退首版 schema 时，在备份确认后执行 `alembic downgrade base`；该操作会删除五张业务表及其数据。
