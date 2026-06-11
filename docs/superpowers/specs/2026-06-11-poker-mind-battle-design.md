# 扑克牌心理大战 H5 — 设计文档

## Context

需要一个轻量级的 H5 多人小游戏：管理员开一轮、设定一张扑克牌作为谜底，多个访客在手机上猜花色和面值，按既定规则排序后管理员公布排名，所有访客同步看到结果。用于实际线上部署（自有服务器+域名），最高 30 并发，核心目标是把流程跑通且能稳定支撑实际多人对局。后续可能调整排序规则，因此打分逻辑需要独立成单一函数便于替换。

## 设计决策摘要

| 项 | 决策 |
|---|---|
| 部署形态 | 公网部署在用户自有服务器 + 域名 + nginx + HTTPS |
| 并发量 | 最高 30 |
| 技术栈 | Node.js + Express + ws (WebSocket) + better-sqlite3 |
| 房间模型 | 单一全局房间，无登录访客（仅昵称） |
| 管理员 | 用户名 + 密码登录，凭据从环境变量读取，登录后返回 HMAC 签名 token |
| 实时通信 | WebSocket 双向连接，服务端单向广播状态变化 |
| 排序规则 | 面值差升序 → 花色匹配优先 → 提交时间升序（写死，封装成独立函数） |
| 重复提交 | 拒绝（一人一局一次，HTTP 409） |
| 中途加入 | 允许加入并提交（直到管理员公布） |
| 存储 | SQLite（`data/game.db`），持久化局次、提交、结果 |

## 系统架构

```
┌──────────────────────┐     HTTPS / WSS     ┌────────────────────────────┐
│  H5 客户端 (手机)     │ ◄───────────────►   │  nginx (反代 + TLS)         │
│  - 访客页 /          │                      └─────────────┬──────────────┘
│  - 管理员页 /admin   │                                    │
└──────────────────────┘                                    ▼
                                              ┌────────────────────────────┐
                                              │  Node.js (Express + ws)    │
                                              │  - REST API                │
                                              │  - WS 广播                  │
                                              │  - HMAC token 鉴权          │
                                              └─────────────┬──────────────┘
                                                            │
                                                            ▼
                                                ┌──────────────────────┐
                                                │  better-sqlite3      │
                                                │  data/game.db        │
                                                └──────────────────────┘
```

单进程部署，pm2 或 systemd 拉起。WebSocket 与 HTTP 共用一个 Node 端口（如 3000），nginx 同时反代两类流量。

## 关键模块

```
server/
├── index.js          # 启动入口，挂载 Express + ws
├── db.js             # better-sqlite3 初始化、迁移、prepared statements
├── auth.js           # 管理员登录、HMAC token 签发与校验中间件
├── routes/
│   ├── round.js      # 访客接口：当前局、提交猜测
│   └── admin.js      # 管理员接口：登录、开局、公布
├── ws.js             # WebSocket 连接管理 & 广播总线
├── scoring.js        # 排序规则（独立纯函数）
└── config.js         # 读取环境变量

public/               # 静态资源（H5 SPA）
├── index.html        # 访客页
├── admin.html        # 管理员页
├── css/
└── js/
    ├── api.js        # fetch 封装
    ├── ws.js         # WS 客户端 + 自动重连
    ├── guest.js      # 访客页逻辑
    └── admin.js      # 管理员页逻辑

data/
└── game.db           # SQLite 文件

test/
├── scoring.test.js
├── routes.test.js
└── integration.test.js
```

## 数据模型

```sql
CREATE TABLE rounds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_suit  TEXT    NOT NULL CHECK(answer_suit IN ('spade','heart','club','diamond')),
  answer_rank  INTEGER NOT NULL CHECK(answer_rank BETWEEN 1 AND 13),
  status       TEXT    NOT NULL CHECK(status IN ('open','revealed')),
  created_at   INTEGER NOT NULL,
  revealed_at  INTEGER
);

CREATE INDEX idx_rounds_status ON rounds(status);

CREATE TABLE guesses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id      INTEGER NOT NULL REFERENCES rounds(id),
  nickname      TEXT    NOT NULL,
  client_id     TEXT    NOT NULL,
  guess_suit    TEXT    NOT NULL CHECK(guess_suit IN ('spade','heart','club','diamond')),
  guess_rank    INTEGER NOT NULL CHECK(guess_rank BETWEEN 1 AND 13),
  submitted_at  INTEGER NOT NULL,
  UNIQUE(round_id, client_id)
);

CREATE INDEX idx_guesses_round ON guesses(round_id);
```

不变量：任意时刻 `status='open'` 的 `rounds` 至多一行（应用层校验：开新局前若存在 open 局则报错或自动关闭，本期实现选「自动把上一局也置为 revealed-without-reveal」是过度设计，**直接报错 409**，让管理员显式处理）。

`client_id` 由客户端 JS 在首次访问时生成 UUIDv4 写入 localStorage，作为「同一浏览器同一设备」的稳定标识。

## API 设计

所有响应统一 JSON。错误格式：`{ "error": "code", "message": "human readable" }`。

### 访客接口（无鉴权）

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/round/current` | 获取当前局快照（`null` 表示无进行中局；revealed 局返回结果直到下一局开局） |
| POST | `/api/round/:id/guess` | 提交猜测 |

`POST /api/round/:id/guess` 请求体：
```json
{ "nickname": "张三", "clientId": "uuid", "suit": "heart", "rank": 7 }
```
返回：`200 { ok: true }` / `404 round_not_found` / `410 round_revealed` / `409 already_submitted` / `400 invalid_input`

### 管理员接口

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/admin/login` | 否 | 用户名+密码换 token |
| POST | `/api/admin/round` | Bearer | 开新局，body `{ suit, rank }` |
| POST | `/api/admin/round/:id/reveal` | Bearer | 公布当前局排名 |

登录返回：`{ "token": "<hmac>", "expiresAt": <unix> }`，token 形如 `<base64url payload>.<hmac>`，payload 含 `{ sub: "admin", exp }`，HMAC 用 `SESSION_SECRET`。校验中间件读取 `Authorization: Bearer <token>`。

### WebSocket 协议

客户端连接 `wss://host/ws`，服务端推送 JSON 文本帧：

| event | payload |
|---|---|
| `round:opened` | `{ roundId, createdAt }` |
| `guess:submitted` | `{ roundId, count }` （仅总数，不泄露内容） |
| `round:revealed` | `{ roundId, answer: {suit, rank}, ranking: [{nickname, suit, rank, rankDiff, suitMatch, submittedAt}], revealedAt }` |

客户端首次连接后立即调用 `GET /api/round/current` 拉快照，再消费增量事件。断线 3 秒后自动重连，重连后重新拉快照。

## 排序规则（`server/scoring.js`）

```js
function score(answer, guess) {
  return {
    rankDiff: Math.abs(answer.rank - guess.rank),
    suitMatch: answer.suit === guess.suit ? 0 : 1,
  };
}

function rankGuesses(answer, guesses) {
  return [...guesses]
    .map(g => ({ ...g, ...score(answer, g) }))
    .sort((a, b) =>
      a.rankDiff - b.rankDiff ||
      a.suitMatch - b.suitMatch ||
      a.submittedAt - b.submittedAt
    );
}
```

纯函数、易单测。后续换规则只改本文件。

## 前端

纯原生 HTML/CSS/JS，不引框架。两个静态页：

**访客页 `/index.html`**
- 首屏：昵称输入（持久化到 localStorage）
- 主屏依当前局状态切换：
  - 无进行中局：显示「等待管理员开局…」
  - `open` 且未提交：显示 4 花色按钮 + 13 面值按钮 + 提交
  - `open` 且已提交：显示「已提交，等待公布」+ 自己提交的牌
  - `revealed`：显示谜底 + 排名表，自己一行高亮

**管理员页 `/admin.html`**
- 未登录：用户名密码表单
- 已登录无 open 局：4×13 选择器 + 「开始本局」按钮
- 已登录且 open：显示谜底（自己看得见）+ 实时提交计数 + 「公布排名」按钮
- revealed：排名表 + 「开新局」按钮

UI 走移动优先：单列布局、按钮 ≥ 44px 触控目标、底部主操作按钮 fixed。

## 配置（环境变量）

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | 默认 3000 |
| `ADMIN_USERNAME` | 是 | 管理员用户名 |
| `ADMIN_PASSWORD` | 是 | 管理员密码（明文，启动时与登录请求比对） |
| `SESSION_SECRET` | 否 | HMAC 密钥；缺省时启动随机生成（重启会让所有 token 失效） |
| `DB_PATH` | 否 | SQLite 文件路径，默认 `data/game.db` |
| `TOKEN_TTL_HOURS` | 否 | 管理员 token 有效期，默认 24 |

## 错误处理 & 边界

- 输入校验：所有花色/面值在路由层用白名单校验，越界返回 400。
- 重复提交：依赖 `UNIQUE(round_id, client_id)`，捕获 SQLite 约束错误返回 409。
- 提交到已 revealed 的局：返回 410。
- 没有 open 局却提交：返回 404。
- 已存在 open 局再开新局：返回 409，提示先公布上一局。
- WS 断线：客户端指数退避到 3 秒上限自动重连。
- 30 并发对 better-sqlite3 同步 IO 完全无压力，不需要连接池或异步队列。
- 管理员密码错：401。统一错误响应不区分「用户名错」与「密码错」避免暴露存在性。
- 密码比对使用 `crypto.timingSafeEqual` 防止时序攻击（虽然攻击面小，但成本几乎为零）。

## 部署

1. 服务器装 Node.js 20+。
2. `git clone && npm ci`。
3. `mkdir -p data`。
4. systemd 单元：
   ```
   Environment=ADMIN_USERNAME=...
   Environment=ADMIN_PASSWORD=...
   Environment=SESSION_SECRET=...
   ExecStart=/usr/bin/node /opt/poker/server/index.js
   ```
5. nginx：
   ```nginx
   location / { proxy_pass http://127.0.0.1:3000; }
   location /ws {
     proxy_pass http://127.0.0.1:3000;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
   }
   ```

## 测试与验证

- **单元测试**：`scoring.js` 全场景覆盖（同分、面值差平手、花色匹配 tiebreaker、提交时间 tiebreaker）。
- **接口测试**：用 `node:test` + `supertest` 覆盖：开局成功/重复开局、提交成功/重复提交/越界提交、公布前后状态、未登录访问管理员接口被拒。
- **集成手测脚本**（`scripts/e2e.sh`）：用 curl 串起完整流程：登录 → 开局 → 3 个不同 clientId 提交 → 公布 → GET 当前局确认 ranking 顺序。
- **端到端浏览器手测**：在 2 台手机 + 1 台电脑上验证：
  1. 访客 A、B 在手机端正常提交；
  2. 公布瞬间两台手机都收到 `round:revealed`；
  3. 中途打开第三台手机能看到当前局并正常提交；
  4. 杀掉服务再起，未公布的局状态保留可继续。

## 实现外内容

- 历史战绩查询页（YAGNI，库里有数据，需要再加）
- 多房间 / 房间码（需求确认单一全局房间）
- 头像上传 / 用户系统
- 排序规则配置化（先写死，已用独立函数留扩展空间）
- i18n
