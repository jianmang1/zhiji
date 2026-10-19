# 数据字典

| 表 | 字段 | 语义 |
|---|---|---|
| users | id, openid, created_at | 微信用户映射；openid 唯一 |
| events | id, user_id, domain, type, ts, payload, source, created_at | 五域统一事件；payload 为 PostgreSQL JSONB |
| tags | id, event_id, tag | 事件自由标签；事件删除级联删除 |
| goals | id, user_id, title, domain, status, created_at | 用户目标，状态 active/done/dropped |
| plans | id, user_id, title, generated_by, based_on, content, created_at | 分析方案与可回溯依据；JSON 字段存 JSONB |

五个 domain 值为 `health`、`work`、`consumption`、`capability`、`interest`。事件按 `(user_id, ts)`、domain 建索引；标签按 tag 建索引。完整业务 payload 草案见 `../docs/data-model-v1.md`。
