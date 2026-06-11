# 扑克牌心理大战 H5 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个 Node.js + Express + WebSocket + SQLite 的 H5 扑克牌心理大战，支持管理员开局/公布排名、多访客实时猜牌的全流程。

**Architecture:** 单进程 Node.js 应用，Express 提供 REST API + 静态文件，ws 库提供 WebSocket 广播，better-sqlite3 做同步持久化。前端纯原生 HTML/CSS/JS，两个独立页面（访客页 + 管理员页）。

**Tech Stack:** Node.js 20+, Express 4, ws 8, better-sqlite3 11, node:test + supertest

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- 初始化：`git init`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "poker-mind-battle",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test test/*.test.js",
    "e2e": "bash scripts/e2e.sh"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "express": "^4.21.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: 创建 .gitignore**

```
node_modules/
data/
.env
.superpowers/
```

- [ ] **Step 3: 创建目录结构并初始化 git**

```bash
mkdir -p server/routes public/css public/js test scripts data
git init
git add package.json .gitignore
git commit -m "chore: scaffold project"
```

- [ ] **Step 4: 安装依赖**

```bash
npm install
```

---

### Task 2: 配置模块 `server/config.js`

**Files:**
- Create: `server/config.js`

- [ ] **Step 1: 编写 config.js**

```js
import { randomBytes } from 'node:crypto';

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
export const DB_PATH = process.env.DB_PATH || 'data/game.db';
export const TOKEN_TTL_HOURS = parseInt(process.env.TOKEN_TTL_HOURS || '24', 10);

const SUITS = ['spade', 'heart', 'club', 'diamond'];
export const VALID_SUITS = new Set(SUITS);
export const VALID_RANKS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
```

- [ ] **Step 2: Commit**

```bash
git add server/config.js
git commit -m "feat: add config module"
```

---

### Task 3: 数据库模块 `server/db.js`

**Files:**
- Create: `server/db.js`

- [ ] **Step 1: 编写 db.js**

```js
import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS rounds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    answer_suit  TEXT    NOT NULL CHECK(answer_suit IN ('spade','heart','club','diamond')),
    answer_rank  INTEGER NOT NULL CHECK(answer_rank BETWEEN 1 AND 13),
    status       TEXT    NOT NULL CHECK(status IN ('open','revealed')),
    created_at   INTEGER NOT NULL,
    revealed_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
  CREATE TABLE IF NOT EXISTS guesses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id      INTEGER NOT NULL REFERENCES rounds(id),
    nickname      TEXT    NOT NULL,
    client_id     TEXT    NOT NULL,
    guess_suit    TEXT    NOT NULL CHECK(guess_suit IN ('spade','heart','club','diamond')),
    guess_rank    INTEGER NOT NULL CHECK(guess_rank BETWEEN 1 AND 13),
    submitted_at  INTEGER NOT NULL,
    UNIQUE(round_id, client_id)
  );
  CREATE INDEX IF NOT EXISTS idx_guesses_round ON guesses(round_id);
`);

const stmts = {
  findOpenRound: db.prepare('SELECT * FROM rounds WHERE status = ? LIMIT 1'),
  findRoundById: db.prepare('SELECT * FROM rounds WHERE id = ?'),
  insertRound: db.prepare('INSERT INTO rounds (answer_suit, answer_rank, status, created_at) VALUES (?, ?, ?, ?)'),
  revealRound: db.prepare('UPDATE rounds SET status = ?, revealed_at = ? WHERE id = ?'),
  findGuess: db.prepare('SELECT * FROM guesses WHERE round_id = ? AND client_id = ?'),
  insertGuess: db.prepare('INSERT INTO guesses (round_id, nickname, client_id, guess_suit, guess_rank, submitted_at) VALUES (?, ?, ?, ?, ?, ?)'),
  findGuessesByRound: db.prepare('SELECT * FROM guesses WHERE round_id = ? ORDER BY submitted_at ASC'),
  countGuesses: db.prepare('SELECT COUNT(*) AS cnt FROM guesses WHERE round_id = ?'),
};

function findOpenRound() {
  return stmts.findOpenRound.get('open') ?? null;
}

function findRoundById(id) {
  return stmts.findRoundById.get(id) ?? null;
}

function insertRound(suit, rank) {
  const now = Math.floor(Date.now() / 1000);
  const info = stmts.insertRound.run(suit, rank, 'open', now);
  return { id: Number(info.lastInsertRowid), answer_suit: suit, answer_rank: rank, status: 'open', created_at: now, revealed_at: null };
}

function revealRound(id) {
  const now = Math.floor(Date.now() / 1000);
  stmts.revealRound.run('revealed', now, id);
  return now;
}

function findGuess(roundId, clientId) {
  return stmts.findGuess.get(roundId, clientId) ?? null;
}

function insertGuess(roundId, nickname, clientId, guessSuit, guessRank) {
  const now = Math.floor(Date.now() / 1000);
  const info = stmts.insertGuess.run(roundId, nickname, clientId, guessSuit, guessRank, now);
  return { id: Number(info.lastInsertRowid), round_id: roundId, nickname, client_id: clientId, guess_suit: guessSuit, guess_rank: guessRank, submitted_at: now };
}

function findGuessesByRound(roundId) {
  return stmts.findGuessesByRound.all(roundId);
}

function countGuesses(roundId) {
  return stmts.countGuesses.get(roundId).cnt;
}

export { db, findOpenRound, findRoundById, insertRound, revealRound, findGuess, insertGuess, findGuessesByRound, countGuesses };
```

- [ ] **Step 2: Commit**

```bash
git add server/db.js
git commit -m "feat: add database module"
```

---

### Task 4: 排序规则 `server/scoring.js`

**Files:**
- Create: `server/scoring.js`

- [ ] **Step 1: 编写 scoring.js**

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
      a.submitted_at - b.submitted_at
    );
}

export { score, rankGuesses };
```

- [ ] **Step 2: Commit**

```bash
git add server/scoring.js
git commit -m "feat: add scoring module"
```

---

### Task 5: 认证模块 `server/auth.js`

**Files:**
- Create: `server/auth.js`

- [ ] **Step 1: 编写 auth.js**

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET, TOKEN_TTL_HOURS } from './config.js';

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function login(username, password) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return null;
  const userOk = timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME));
  const passOk = timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));
  if (!userOk || !passOk) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'admin', iat: now, exp: now + TOKEN_TTL_HOURS * 3600 };
  return { token: sign(payload), expiresAt: payload.exp };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: '需要登录' });
  }
  const payload = verify(header.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token 无效或已过期' });
  }
  next();
}

export { login, verify, authMiddleware };
```

- [ ] **Step 2: Commit**

```bash
git add server/auth.js
git commit -m "feat: add auth module"
```

---

### Task 6: WebSocket 广播模块 `server/ws.js`

**Files:**
- Create: `server/ws.js`

- [ ] **Step 1: 编写 ws.js**

```js
import { WebSocketServer } from 'ws';

let wss = null;

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('error', () => {});
  });

  return wss;
}

function broadcast(event) {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

export { init, broadcast };
```

- [ ] **Step 2: Commit**

```bash
git add server/ws.js
git commit -m "feat: add WebSocket module"
```

---

### Task 7: 访客路由 `server/routes/round.js`

**Files:**
- Create: `server/routes/round.js`

- [ ] **Step 1: 编写访客路由**

```js
import { Router } from 'express';
import { findOpenRound, findRoundById, findGuess, insertGuess, countGuesses } from '../db.js';
import { VALID_SUITS, VALID_RANKS } from '../config.js';
import { broadcast } from '../ws.js';

const router = Router();

// GET /api/round/current?clientId=
router.get('/current', (req, res) => {
  const round = findOpenRound();
  if (!round) return res.json(null);
  const { answer_suit, answer_rank, ...safe } = round;
  if (req.query.clientId) {
    const my = findGuess(round.id, req.query.clientId);
    if (my) {
      safe.myGuess = { suit: my.guess_suit, rank: my.guess_rank, submittedAt: my.submitted_at };
    }
  }
  safe.guessCount = countGuesses(round.id);
  return res.json(safe);
});

// POST /api/round/:id/guess
router.post('/:id/guess', (req, res) => {
  const id = Number(req.params.id);
  const { nickname, clientId, suit, rank } = req.body;

  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
    return res.status(400).json({ error: 'invalid_input', message: '请输入昵称' });
  }
  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'invalid_input', message: '缺少 clientId' });
  }
  if (!VALID_SUITS.has(suit) || !VALID_RANKS.has(rank)) {
    return res.status(400).json({ error: 'invalid_input', message: '花色或面值无效' });
  }

  const round = findRoundById(id);
  if (!round) return res.status(404).json({ error: 'round_not_found', message: '该局不存在' });
  if (round.status === 'revealed') return res.status(410).json({ error: 'round_revealed', message: '该局已公布，不能再提交' });
  if (round.status !== 'open') return res.status(404).json({ error: 'round_not_found', message: '当前没有进行中的局' });

  const existing = findGuess(id, clientId);
  if (existing) return res.status(409).json({ error: 'already_submitted', message: '你已提交过猜测' });

  insertGuess(id, nickname.trim(), clientId, suit, rank);
  broadcast({ event: 'guess:submitted', roundId: id, count: countGuesses(id) });
  return res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/round.js
git commit -m "feat: add guest round routes"
```

---

### Task 8: 管理员路由 `server/routes/admin.js`

**Files:**
- Create: `server/routes/admin.js`

- [ ] **Step 1: 编写管理员路由**

```js
import { Router } from 'express';
import { login, authMiddleware } from '../auth.js';
import { findOpenRound, insertRound, findRoundById, revealRound, findGuessesByRound, countGuesses } from '../db.js';
import { rankGuesses } from '../scoring.js';
import { VALID_SUITS, VALID_RANKS } from '../config.js';
import { broadcast } from '../ws.js';

const router = Router();

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const result = login(username || '', password || '');
  if (!result) return res.status(401).json({ error: 'unauthorized', message: '用户名或密码错误' });
  return res.json(result);
});

// POST /api/admin/round
router.post('/round', authMiddleware, (req, res) => {
  const open = findOpenRound();
  if (open) return res.status(409).json({ error: 'round_exists', message: '已有进行中的局，请先公布上一局' });

  const { suit, rank } = req.body;
  if (!VALID_SUITS.has(suit) || !VALID_RANKS.has(rank)) {
    return res.status(400).json({ error: 'invalid_input', message: '花色或面值无效' });
  }

  const round = insertRound(suit, rank);
  broadcast({ event: 'round:opened', roundId: round.id, createdAt: round.created_at });
  return res.json(round);
});

// POST /api/admin/round/:id/reveal
router.post('/round/:id/reveal', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const round = findRoundById(id);
  if (!round) return res.status(404).json({ error: 'round_not_found', message: '该局不存在' });
  if (round.status === 'revealed') return res.status(409).json({ error: 'already_revealed', message: '该局已公布' });

  const revealedAt = revealRound(id);
  const guesses = findGuessesByRound(id);
  const ranking = rankGuesses(
    { suit: round.answer_suit, rank: round.answer_rank },
    guesses.map(g => ({
      nickname: g.nickname,
      clientId: g.client_id,
      suit: g.guess_suit,
      rank: g.guess_rank,
      submittedAt: g.submitted_at,
    }))
  );

  broadcast({
    event: 'round:revealed',
    roundId: id,
    answer: { suit: round.answer_suit, rank: round.answer_rank },
    ranking,
    revealedAt,
  });

  return res.json({ ok: true, ranking });
});

// GET /api/admin/round/:id (管理员查看，含谜底和实时统计)
router.get('/round/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const round = findRoundById(id);
  if (!round) return res.status(404).json({ error: 'round_not_found', message: '该局不存在' });
  const count = countGuesses(id);
  return res.json({ ...round, guessCount: count });
});

// GET /api/admin/current-round (管理员查看当前局，含谜底)
router.get('/current-round', authMiddleware, (_req, res) => {
  const round = findOpenRound();
  if (!round) return res.json(null);
  const count = countGuesses(round.id);
  return res.json({ ...round, guessCount: count });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat: add admin routes"
```

---

### Task 9: 服务入口 `server/index.js`

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: 编写服务入口**

```js
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PORT } from './config.js';
import { init as initWs } from './ws.js';
import roundRoutes from './routes/round.js';
import adminRoutes from './routes/admin.js';

const app = express();
const server = createServer(app);

app.use(express.json());
app.use('/api/round', roundRoutes);
app.use('/api/admin', adminRoutes);

const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, '..', 'public')));

// SPA fallback
app.get('/admin', (_req, res) => res.sendFile(join(__dirname, '..', 'public', 'admin.html')));

initWs(server);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: 验证启动**

```bash
node server/index.js &
sleep 1
curl -s http://localhost:3000/api/round/current
# Expected: null (no rounds yet)
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add server entry point"
```

---

### Task 10: 前端公共模块 + CSS

**Files:**
- Create: `public/js/api.js`
- Create: `public/js/ws.js`
- Create: `public/css/style.css`

- [ ] **Step 1: 编写 api.js**

```js
async function apiGet(path) {
  const res = await fetch(path);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function getClientId() {
  let id = localStorage.getItem('client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('client_id', id);
  }
  return id;
}

function getNickname() {
  return localStorage.getItem('nickname') || '';
}

function setNickname(name) {
  localStorage.setItem('nickname', name);
}

function getToken() {
  return localStorage.getItem('admin_token') || '';
}

function setToken(t) {
  localStorage.setItem('admin_token', t);
}

function clearToken() {
  localStorage.removeItem('admin_token');
}
```

- [ ] **Step 2: 编写 ws.js**

```js
function connectWs(onMessage) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onMessage(event);
  };

  ws.onclose = () => {
    setTimeout(() => connectWs(onMessage), 3000);
  };

  return ws;
}
```

- [ ] **Step 3: 编写 style.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --spade: #1a1a2e;
  --heart: #e74c3c;
  --club: #27ae60;
  --diamond: #2980b9;
  --bg: #0f1923;
  --card-bg: #1b2838;
  --text: #e0e0e0;
  --accent: #f0c040;
  --muted: #8a9bb5;
  --border: #2a3a4a;
  --success: #27ae60;
  --radius: 10px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100dvh;
  padding-bottom: 80px;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.container { max-width: 480px; margin: 0 auto; padding: 16px; }

h1 { font-size: 1.4rem; text-align: center; padding: 20px 0 16px; color: var(--accent); }
h2 { font-size: 1.15rem; margin: 16px 0 10px; }
.section-title { color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 8px; }

input[type="text"], input[type="password"] {
  width: 100%; padding: 12px 14px; font-size: 1rem;
  background: var(--card-bg); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text); outline: none;
}
input:focus { border-color: var(--accent); }

.btn {
  display: block; width: 100%; padding: 14px; font-size: 1.05rem; font-weight: 600;
  border: none; border-radius: var(--radius); background: var(--card-bg);
  color: var(--text); cursor: pointer; transition: background 0.15s;
  text-align: center; min-height: 48px;
}
.btn:active { opacity: 0.8; }
.btn-primary { background: var(--accent); color: #1a1a2e; }
.btn-small { padding: 10px 16px; font-size: 0.9rem; display: inline-block; width: auto; }

.suit-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
.suit-btn {
  padding: 16px 8px; font-size: 1.1rem; font-weight: 700;
  border: 2px solid var(--border); border-radius: var(--radius);
  background: var(--card-bg); color: var(--text); cursor: pointer;
  text-align: center; min-height: 56px; transition: border-color 0.15s;
}
.suit-btn.selected { border-color: var(--accent); background: #2a2a1a; }
.suit-btn[data-suit="spade"] { color: #b0b0d0; }
.suit-btn[data-suit="heart"] { color: var(--heart); }
.suit-btn[data-suit="club"] { color: var(--club); }
.suit-btn[data-suit="diamond"] { color: var(--diamond); }

.rank-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 12px 0; }
@media (min-width: 400px) { .rank-grid { grid-template-columns: repeat(7, 1fr); } }

.rank-btn {
  padding: 12px 4px; font-size: 1rem; font-weight: 600;
  border: 2px solid var(--border); border-radius: var(--radius);
  background: var(--card-bg); color: var(--text); cursor: pointer;
  text-align: center; min-height: 48px; transition: border-color 0.15s;
}
.rank-btn.selected { border-color: var(--accent); background: #2a2a1a; }

.fixed-bottom {
  position: fixed; bottom: 0; left: 0; right: 0;
  padding: 12px 16px; background: var(--bg);
  border-top: 1px solid var(--border); max-width: 480px;
  margin: 0 auto;
}

.card {
  background: var(--card-bg); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px; margin: 12px 0;
}

.status-banner {
  text-align: center; padding: 24px 16px; color: var(--muted);
  font-size: 1rem;
}

.ranking-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
.ranking-table th, .ranking-table td {
  padding: 10px 8px; text-align: center; font-size: 0.9rem;
  border-bottom: 1px solid var(--border);
}
.ranking-table th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.ranking-table .highlight { background: rgba(240, 192, 64, 0.12); }
.ranking-table .rank-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  font-weight: 700; font-size: 0.9rem;
}
.rank-1 { background: #ffd700; color: #1a1a2e; }
.rank-2 { background: #c0c0c0; color: #1a1a2e; }
.rank-3 { background: #cd7f32; color: #1a1a2e; }

.answer-display {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 20px 0;
}
.answer-card {
  font-size: 2.5rem; font-weight: 900; padding: 16px 24px;
  background: var(--card-bg); border: 2px solid var(--accent);
  border-radius: var(--radius); text-align: center;
}

.count-badge {
  display: inline-block; background: var(--accent); color: #1a1a2e;
  padding: 2px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 700;
  margin-left: 6px;
}

.my-guess { margin: 12px 0; padding: 12px; background: rgba(240, 192, 64, 0.08); border-radius: var(--radius); border: 1px solid rgba(240, 192, 64, 0.2); }

.login-form { padding: 40px 0; }
.login-form .btn { margin-top: 16px; }
.error-msg { color: var(--heart); font-size: 0.85rem; margin-top: 8px; min-height: 20px; }
```

- [ ] **Step 4: Commit**

```bash
git add public/js/api.js public/js/ws.js public/css/style.css
git commit -m "feat: add frontend shared modules and CSS"
```

---

### Task 11: 访客页 `public/index.html` + `public/js/guest.js`

**Files:**
- Create: `public/index.html`
- Create: `public/js/guest.js`

- [ ] **Step 1: 编写 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>扑克牌心理大战</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container" id="app"></div>
  <script src="/js/api.js"></script>
  <script src="/js/ws.js"></script>
  <script src="/js/guest.js"></script>
</body>
</html>
```

- [ ] **Step 2: 编写 guest.js**

```js
const SUITS = [
  { id: 'spade', label: '♠', name: '黑桃' },
  { id: 'heart', label: '♥', name: '红心' },
  { id: 'club', label: '♣', name: '梅花' },
  { id: 'diamond', label: '♦', name: '方块' },
];
const RANKS = [
  { v: 1, label: 'A' }, { v: 2, label: '2' }, { v: 3, label: '3' },
  { v: 4, label: '4' }, { v: 5, label: '5' }, { v: 6, label: '6' },
  { v: 7, label: '7' }, { v: 8, label: '8' }, { v: 9, label: '9' },
  { v: 10, label: '10' }, { v: 11, label: 'J' }, { v: 12, label: 'Q' }, { v: 13, label: 'K' },
];

let currentRound = null;
let myGuess = null;
let selectedSuit = null;
let selectedRank = null;
let nickname = getNickname();
let clientId = getClientId();
let nicknameSet = !!nickname;

function render() {
  const app = document.getElementById('app');
  if (!nicknameSet) {
    app.innerHTML = renderNickname();
    return;
  }
  if (!currentRound) {
    app.innerHTML = renderWaiting();
  } else if (currentRound.status === 'open' && !myGuess) {
    app.innerHTML = renderGuessForm();
  } else if (currentRound.status === 'open' && myGuess) {
    app.innerHTML = renderSubmitted();
  } else if (currentRound.status === 'revealed') {
    app.innerHTML = renderResult();
  }
}

function renderNickname() {
  return `<h1>扑克牌心理大战</h1>
<div class="card" style="margin-top:60px">
  <h2>输入你的昵称</h2>
  <input type="text" id="nickname-input" placeholder="起个名字…" maxlength="12" autofocus>
  <p class="error-msg" id="name-err"></p>
  <button class="btn btn-primary" id="confirm-name" style="margin-top:12px">进入游戏</button>
</div>`;
}

function renderWaiting() {
  return `<h1>扑克牌心理大战</h1>
<div class="status-banner">
  <p style="font-size:3rem;margin-bottom:12px">🃏</p>
  <p>等待管理员开局…</p>
  <p style="font-size:0.85rem;color:var(--muted);margin-top:8px">昵称：${escapeHtml(nickname)}</p>
</div>`;
}

function renderGuessForm() {
  const suitHtml = SUITS.map(s => {
    const sel = selectedSuit === s.id ? ' selected' : '';
    return `<button class="suit-btn${sel}" data-suit="${s.id}">${s.label}<br>${s.name}</button>`;
  }).join('');
  const rankHtml = RANKS.map(r => {
    const sel = selectedRank === r.v ? ' selected' : '';
    return `<button class="rank-btn${sel}" data-rank="${r.v}">${r.label}</button>`;
  }).join('');
  const canSubmit = selectedSuit && selectedRank;

  return `<h1>猜牌</h1>
<div class="section-title">选择花色</div>
<div class="suit-grid" id="suit-picker">${suitHtml}</div>
<div class="section-title">选择面值</div>
<div class="rank-grid" id="rank-picker">${rankHtml}</div>
<div class="fixed-bottom">
  <button class="btn btn-primary" id="submit-guess" ${canSubmit ? '' : 'disabled'}>提交猜测</button>
</div>`;
}

function renderSubmitted() {
  const s = SUITS.find(x => x.id === myGuess.suit);
  const r = RANKS.find(x => x.v === myGuess.rank);
  return `<h1>猜牌</h1>
<div class="status-banner">
  <p style="font-size:2rem;margin-bottom:8px">✓</p>
  <p>已提交，等待管理员公布结果</p>
</div>
<div class="card my-guess">
  <p style="color:var(--muted);font-size:0.85rem">我的猜测</p>
  <p style="font-size:1.5rem;font-weight:700">${s.label} ${r.label}</p>
  <p style="font-size:0.85rem;color:var(--muted)">${s.name} ${r.label}</p>
</div>`;
}

function renderResult() {
  if (!currentRound.result) return renderWaiting();
  const { answer, ranking, revealedAt } = currentRound.result;
  const aSuit = SUITS.find(x => x.id === answer.suit);
  const aRank = RANKS.find(x => x.v === answer.rank);

  const rows = ranking.map((g, i) => {
    const gSuit = SUITS.find(x => x.id === g.suit);
    const gRank = RANKS.find(x => x.v === g.rank);
    const isMe = g.clientId === clientId;
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    return `<tr class="${isMe ? 'highlight' : ''}">
      <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
      <td>${escapeHtml(g.nickname)}${isMe ? ' (你)' : ''}</td>
      <td>${gSuit.label} ${gRank.label}</td>
      <td>${g.rankDiff}</td>
      <td>${g.suitMatch === 0 ? '✓' : '-'}</td>
    </tr>`;
  }).join('');

  return `<h1>结果公布</h1>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem">谜底</p>
      <div class="answer-card" style="color:${suitColor(answer.suit)}">${aSuit.label} ${aRank.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:4px">${aSuit.name} ${aRank.label}</p>
    </div>
  </div>
</div>
<h2>排行榜</h2>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>猜测</th><th>面值差</th><th>花色</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function suitColor(s) {
  const m = { spade: 'var(--spade)', heart: 'var(--heart)', club: 'var(--club)', diamond: 'var(--diamond)' };
  return m[s] || 'var(--text)';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadCurrent() {
  try {
    currentRound = await apiGet(`/api/round/current?clientId=${clientId}`);
    if (currentRound && currentRound.myGuess) {
      myGuess = currentRound.myGuess;
    }
    render();
  } catch (e) {
    render();
  }
}

// event delegation
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  // nickname confirm
  if (t.id === 'confirm-name') {
    const input = document.getElementById('nickname-input');
    const err = document.getElementById('name-err');
    const name = input.value.trim();
    if (!name) { err.textContent = '请输入昵称'; return; }
    setNickname(name);
    nickname = name;
    nicknameSet = true;
    await loadCurrent();
    return;
  }

  // suit selection
  if (t.dataset.suit) {
    selectedSuit = t.dataset.suit;
    render();
    return;
  }

  // rank selection
  if (t.dataset.rank) {
    selectedRank = parseInt(t.dataset.rank);
    render();
    return;
  }

  // submit
  if (t.id === 'submit-guess') {
    if (!selectedSuit || !selectedRank || !currentRound) return;
    try {
      await apiPost(`/api/round/${currentRound.id}/guess`, {
        nickname,
        clientId,
        suit: selectedSuit,
        rank: selectedRank,
      });
      myGuess = { suit: selectedSuit, rank: selectedRank };
      render();
    } catch (err) {
      if (err.status === 409) {
        alert('你已经提交过猜测了');
        myGuess = { suit: selectedSuit, rank: selectedRank };
        render();
      } else if (err.status === 410) {
        alert('该局已公布，不能再提交');
        await loadCurrent();
      } else {
        alert(err.message || '提交失败');
      }
    }
  }
});

// WS
connectWs(async (event) => {
  if (event.event === 'round:opened') {
    await loadCurrent();
  } else if (event.event === 'guess:submitted') {
    // live count update during open state
  } else if (event.event === 'round:revealed') {
    currentRound = { id: event.roundId, status: 'revealed', result: event };
    render();
  }
});

// init
loadCurrent();
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/js/guest.js
git commit -m "feat: add guest page"
```

---

### Task 12: 管理员页 `public/admin.html` + `public/js/admin.js`

**Files:**
- Create: `public/admin.html`
- Create: `public/js/admin.js`

- [ ] **Step 1: 编写 admin.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>管理后台 — 扑克牌心理大战</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container" id="app"></div>
  <script src="/js/api.js"></script>
  <script src="/js/ws.js"></script>
  <script src="/js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: 编写 admin.js**

```js
const SUITS = [
  { id: 'spade', label: '♠', name: '黑桃' },
  { id: 'heart', label: '♥', name: '红心' },
  { id: 'club', label: '♣', name: '梅花' },
  { id: 'diamond', label: '♦', name: '方块' },
];
const RANKS = [
  { v: 1, label: 'A' }, { v: 2, label: '2' }, { v: 3, label: '3' },
  { v: 4, label: '4' }, { v: 5, label: '5' }, { v: 6, label: '6' },
  { v: 7, label: '7' }, { v: 8, label: '8' }, { v: 9, label: '9' },
  { v: 10, label: '10' }, { v: 11, label: 'J' }, { v: 12, label: 'Q' }, { v: 13, label: 'K' },
];

let token = getToken();
let currentRound = null;
let selectedSuit = null;
let selectedRank = null;
let guessCount = 0;

async function authFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...opts.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401) { clearToken(); token = ''; render(); }
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function render() {
  const app = document.getElementById('app');
  if (!token) {
    app.innerHTML = renderLogin();
    return;
  }
  if (!currentRound) {
    app.innerHTML = renderNewRound();
  } else if (currentRound.status === 'open') {
    app.innerHTML = renderOpenRound();
  } else if (currentRound.status === 'revealed') {
    app.innerHTML = renderResult();
  }
}

function renderLogin() {
  return `<h1>管理后台</h1>
<div class="card login-form">
  <h2>管理员登录</h2>
  <input type="text" id="login-user" placeholder="用户名" autofocus>
  <input type="password" id="login-pass" placeholder="密码" style="margin-top:12px">
  <p class="error-msg" id="login-err"></p>
  <button class="btn btn-primary" id="do-login">登录</button>
</div>`;
}

function renderNewRound() {
  const suitHtml = SUITS.map(s => {
    const sel = selectedSuit === s.id ? ' selected' : '';
    return `<button class="suit-btn${sel}" data-suit="${s.id}">${s.label}<br>${s.name}</button>`;
  }).join('');
  const rankHtml = RANKS.map(r => {
    const sel = selectedRank === r.v ? ' selected' : '';
    return `<button class="rank-btn${sel}" data-rank="${r.v}">${r.label}</button>`;
  }).join('');
  const canStart = selectedSuit && selectedRank;

  return `<h1>管理后台</h1>
<div class="card">
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:12px">设置本局谜底</p>
  <div class="section-title">花色</div>
  <div class="suit-grid" id="suit-picker">${suitHtml}</div>
  <div class="section-title">面值</div>
  <div class="rank-grid" id="rank-picker">${rankHtml}</div>
  <button class="btn btn-primary" id="start-round" ${canStart ? '' : 'disabled'} style="margin-top:20px">开始本局</button>
</div>`;
}

function renderOpenRound() {
  const s = SUITS.find(x => x.id === currentRound.answer_suit);
  const r = RANKS.find(x => x.v === currentRound.answer_rank);
  return `<h1>管理后台</h1>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem">当前谜底</p>
      <div class="answer-card">${s.label} ${r.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:4px">${s.name} ${r.label}</p>
    </div>
  </div>
</div>
<div class="card" style="text-align:center">
  <p style="font-size:0.9rem;color:var(--muted)">已提交猜测</p>
  <p id="count-display" style="font-size:2.5rem;font-weight:900;color:var(--accent)">${guessCount}</p>
</div>
<button class="btn btn-primary fixed-bottom" id="reveal-round">公布排名</button>`;
}

function renderResult() {
  if (!currentRound.revealData) return '<h1>管理后台</h1><div class="status-banner"><p>加载中…</p></div>';
  const { answer, ranking } = currentRound.revealData;
  const aSuit = SUITS.find(x => x.id === answer.suit);
  const aRank = RANKS.find(x => x.v === answer.rank);

  const rows = ranking.map((g, i) => {
    const gSuit = SUITS.find(x => x.id === g.suit);
    const gRank = RANKS.find(x => x.v === g.rank);
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    return `<tr>
      <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
      <td>${escapeHtml(g.nickname)}</td>
      <td>${gSuit.label} ${gRank.label}</td>
      <td>${g.rankDiff}</td>
      <td>${g.suitMatch === 0 ? '✓' : '-'}</td>
    </tr>`;
  }).join('');

  return `<h1>管理后台</h1>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem">谜底</p>
      <div class="answer-card">${aSuit.label} ${aRank.label}</div>
    </div>
  </div>
</div>
<h2>排行榜 (${ranking.length}人)</h2>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>猜测</th><th>面值差</th><th>花色</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div style="margin:20px 0">
  <button class="btn btn-primary" id="new-round">开新局</button>
</div>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadCurrent() {
  try {
    currentRound = await authFetch('/api/admin/current-round');
    if (currentRound) {
      guessCount = currentRound.guessCount || 0;
    }
    render();
  } catch (e) {
    render();
  }
}

// periodic poll for guess count (WS doesn't give per-admin count details)
let pollTimer = null;
function startPoll() {
  stopPoll();
  pollTimer = setInterval(async () => {
    if (!token || !currentRound || currentRound.status !== 'open') return;
    try {
      const r = await authFetch('/api/admin/current-round');
      if (r) {
        guessCount = r.guessCount || 0;
        document.getElementById('count-display') && renderOpenRound();
      }
    } catch (e) {}
  }, 2000);
}
function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.id === 'do-login') {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const err = document.getElementById('login-err');
    try {
      const data = await apiPost('/api/admin/login', { username: user, password: pass });
      token = data.token;
      setToken(token);
      await loadCurrent();
    } catch (ex) {
      err.textContent = ex.message || '登录失败';
    }
    return;
  }

  if (t.dataset.suit) { selectedSuit = t.dataset.suit; render(); return; }
  if (t.dataset.rank) { selectedRank = parseInt(t.dataset.rank); render(); return; }

  if (t.id === 'start-round') {
    if (!selectedSuit || !selectedRank) return;
    try {
      const round = await authFetch('/api/admin/round', {
        method: 'POST',
        body: { suit: selectedSuit, rank: selectedRank },
      });
      currentRound = round;
      guessCount = 0;
      selectedSuit = null;
      selectedRank = null;
      startPoll();
      render();
    } catch (ex) {
      alert(ex.message || '开局失败');
    }
    return;
  }

  if (t.id === 'reveal-round') {
    if (!currentRound) return;
    try {
      const data = await authFetch(`/api/admin/round/${currentRound.id}/reveal`, { method: 'POST' });
      stopPoll();
      currentRound = { ...currentRound, status: 'revealed', revealData: { answer: { suit: currentRound.answer_suit, rank: currentRound.answer_rank }, ranking: data.ranking } };
      render();
    } catch (ex) {
      alert(ex.message || '公布失败');
    }
    return;
  }

  if (t.id === 'new-round') {
    currentRound = null;
    guessCount = 0;
    render();
  }
});

connectWs(async (event) => {
  if (event.event === 'guess:submitted') {
    guessCount = event.count;
    if (currentRound && currentRound.status === 'open') {
      const el = document.getElementById('count-display');
      if (el) renderOpenRound();
    }
  } else if (event.event === 'round:revealed' && currentRound && currentRound.id === event.roundId) {
    stopPoll();
    currentRound = { ...currentRound, status: 'revealed', revealData: event };
    render();
  }
});

// init
if (token) loadCurrent(); else render();
```

- [ ] **Step 3: Commit**

```bash
git add public/admin.html public/js/admin.js
git commit -m "feat: add admin page"
```

---

### Task 13: 测分插件——排序逻辑单测 `test/scoring.test.js`

**Files:**
- Create: `test/scoring.test.js`

- [ ] **Step 1: 编写单测**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { score, rankGuesses } from '../server/scoring.js';

describe('score', () => {
  it('ranks exact match best', () => {
    const s = score({ suit: 'heart', rank: 7 }, { suit: 'heart', rank: 7 });
    assert.equal(s.rankDiff, 0);
    assert.equal(s.suitMatch, 0);
  });

  it('ranks suit match with rank diff', () => {
    const s = score({ suit: 'heart', rank: 7 }, { suit: 'heart', rank: 3 });
    assert.equal(s.rankDiff, 4);
    assert.equal(s.suitMatch, 0);
  });

  it('ranks suit mismatch with rank diff', () => {
    const s = score({ suit: 'spade', rank: 7 }, { suit: 'heart', rank: 7 });
    assert.equal(s.rankDiff, 0);
    assert.equal(s.suitMatch, 1);
  });

  it('ranks complete mismatch', () => {
    const s = score({ suit: 'spade', rank: 1 }, { suit: 'heart', rank: 13 });
    assert.equal(s.rankDiff, 12);
    assert.equal(s.suitMatch, 1);
  });
});

describe('rankGuesses', () => {
  const answer = { suit: 'heart', rank: 7 };

  it('exact match ranks first', () => {
    const guesses = [
      { nickname: 'A', suit: 'spade', rank: 1, submittedAt: 100 },
      { nickname: 'B', suit: 'heart', rank: 7, submittedAt: 200 },
      { nickname: 'C', suit: 'club', rank: 13, submittedAt: 300 },
    ];
    const r = rankGuesses(answer, guesses);
    assert.equal(r[0].nickname, 'B');
  });

  it('smaller rank diff ranks higher', () => {
    const guesses = [
      { nickname: 'A', suit: 'spade', rank: 5, submittedAt: 100 },
      { nickname: 'B', suit: 'club', rank: 10, submittedAt: 200 },
    ];
    const r = rankGuesses(answer, guesses);
    assert.equal(r[0].nickname, 'A');
    assert.equal(r[1].nickname, 'B');
  });

  it('same rank diff, suit match wins', () => {
    const guesses = [
      { nickname: 'A', suit: 'spade', rank: 5, submittedAt: 100 },
      { nickname: 'B', suit: 'heart', rank: 5, submittedAt: 200 },
    ];
    const r = rankGuesses(answer, guesses);
    assert.equal(r[0].nickname, 'B');
    assert.equal(r[1].nickname, 'A');
  });

  it('same score, earlier submission wins', () => {
    const guesses = [
      { nickname: 'A', suit: 'spade', rank: 5, submittedAt: 200 },
      { nickname: 'B', suit: 'spade', rank: 5, submittedAt: 100 },
    ];
    const r = rankGuesses(answer, guesses);
    assert.equal(r[0].nickname, 'B');
    assert.equal(r[1].nickname, 'A');
  });
});
```

- [ ] **Step 2: 跑单测**

```bash
node --test test/scoring.test.js
# Expected: all 7 tests pass
```

- [ ] **Step 3: Commit**

```bash
git add test/scoring.test.js
git commit -m "test: add scoring unit tests"
```

---

### Task 14: 接口集成测试 `test/routes.test.js`

**Files:**
- Create: `test/routes.test.js`

- [ ] **Step 1: 编写 routes.test.js**

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createServer } from 'node:http';
import roundRoutes from '../server/routes/round.js';
import adminRoutes from '../server/routes/admin.js';

// Override config for test
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'test123';
process.env.SESSION_SECRET = 'test-secret';
process.env.DB_PATH = 'data/test.db';

let server, baseUrl;
let token, roundId;

before(async () => {
  // Clean test db
  const { unlinkSync } = await import('node:fs');
  try { unlinkSync('data/test.db'); } catch (e) {}

  const app = express();
  app.use(express.json());
  app.use('/api/round', roundRoutes);
  app.use('/api/admin', adminRoutes);

  server = createServer(app);
  await new Promise(r => server.listen(0, () => r()));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
});

after(() => { server.close(); });

describe('admin login', () => {
  it('rejects wrong password', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert.equal(res.status, 401);
  });

  it('returns token on success', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test123' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.ok(data.expiresAt);
    token = data.token;
  });
});

describe('round lifecycle', () => {
  it('starts with no open round', async () => {
    const res = await fetch(`${baseUrl}/api/round/current`);
    const data = await res.json();
    assert.equal(data, null);
  });

  it('starts a round', async () => {
    const res = await fetch(`${baseUrl}/api/admin/round`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ suit: 'heart', rank: 7 }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'open');
    assert.equal(data.answer_suit, 'heart');
    roundId = data.id;
  });

  it('rejects duplicate open round', async () => {
    const res = await fetch(`${baseUrl}/api/admin/round`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ suit: 'spade', rank: 3 }),
    });
    assert.equal(res.status, 409);
  });

  it('guest can see open round', async () => {
    const res = await fetch(`${baseUrl}/api/round/current`);
    const data = await res.json();
    assert.equal(data.id, roundId);
    assert.equal(data.status, 'open');
    // answer should not leak
    assert.equal(data.answer_suit, undefined);
  });

  it('guest submits guess', async () => {
    const res = await fetch(`${baseUrl}/api/round/${roundId}/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Alice', clientId: 'c1', suit: 'heart', rank: 5 }),
    });
    assert.equal(res.status, 200);
  });

  it('rejects duplicate submission', async () => {
    const res = await fetch(`${baseUrl}/api/round/${roundId}/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Alice', clientId: 'c1', suit: 'club', rank: 10 }),
    });
    assert.equal(res.status, 409);
  });

  it('rejects submission on non-existent round', async () => {
    const res = await fetch(`${baseUrl}/api/round/9999/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Bob', clientId: 'c2', suit: 'spade', rank: 1 }),
    });
    assert.equal(res.status, 404);
  });

  it('reveals round', async () => {
    const res = await fetch(`${baseUrl}/api/admin/round/${roundId}/reveal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.ranking);
    assert.equal(data.ranking.length, 1);
  });

  it('rejects submission after reveal', async () => {
    const res = await fetch(`${baseUrl}/api/round/${roundId}/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Bob', clientId: 'c3', suit: 'spade', rank: 1 }),
    });
    assert.equal(res.status, 410);
  });
});
```

- [ ] **Step 2: 跑集成测试**

```bash
node --test test/routes.test.js
# Expected: all tests pass
```

- [ ] **Step 3: Commit**

```bash
git add test/routes.test.js
git commit -m "test: add integration route tests"
```

---

### Task 15: E2E 脚本 `scripts/e2e.sh`

**Files:**
- Create: `scripts/e2e.sh`

- [ ] **Step 1: 编写 e2e.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://localhost:3000}"

echo "=== 1. Login ==="
TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"test123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:20}..."

echo "=== 2. Start round ==="
ROUND=$(curl -sS -X POST "$BASE/api/admin/round" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"suit":"heart","rank":7}')
ROUND_ID=$(echo "$ROUND" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "Round ID: $ROUND_ID"

echo "=== 3. Guest submissions ==="
curl -sS -X POST "$BASE/api/round/$ROUND_ID/guess" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Alice","clientId":"e2e-1","suit":"heart","rank":5}'

curl -sS -X POST "$BASE/api/round/$ROUND_ID/guess" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Bob","clientId":"e2e-2","suit":"spade","rank":13}'

curl -sS -X POST "$BASE/api/round/$ROUND_ID/guess" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Charlie","clientId":"e2e-3","suit":"heart","rank":7}'

echo "=== 4. Reveal ==="
RESULT=$(curl -sS -X POST "$BASE/api/admin/round/$ROUND_ID/reveal" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

echo "=== 5. Verify ranking ==="
# Charlie (exact match) should be first
FIRST=$(echo "$RESULT" | grep -o '"nickname":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$FIRST" = "Charlie" ]; then
  echo "PASS: Charlie ranked first (exact match)"
else
  echo "FAIL: Expected Charlie first, got $FIRST"
  exit 1
fi

echo "=== E2E PASS ==="
```

- [ ] **Step 2: 设为可执行并跑脚本**

```bash
chmod +x scripts/e2e.sh
# Start server in background, then:
bash scripts/e2e.sh
# Expected: E2E PASS
```

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e.sh
git commit -m "test: add e2e shell script"
```

---

## 验证

完成所有 Task 后：

1. `node --test test/*.test.js` — 所有单测与集成测试通过
2. `node server/index.js` 启动服务
3. 浏览器打开 `http://localhost:3000` — 输入昵称 → 看到"等待管理员开局"
4. 浏览器打开 `http://localhost:3000/admin` — 登录 → 选牌 → 开局
5. 访客页刷新 → 选牌 → 提交
6. 管理员点"公布排名" → 管理员和访客同时看到排行榜
7. 排行榜排序正确（面值差升序 → 花色匹配优先 → 提交时间升序）
8. 管理员点"开新局"→ 访客端收到 `round:opened`，进入新一轮
