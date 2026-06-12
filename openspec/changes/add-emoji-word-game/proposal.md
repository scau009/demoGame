## Why

The platform currently hosts a single game (扑克猜心 / Poker Mind Battle). We want to host more than one party game and add a second one: **Emoji 猜词** (Emoji word-guessing) — a real-time buzz-in scoring race. This requires a small multi-game shell (a game-selection landing page + global single-active-game enforcement) layered on top of the existing poker game, plus a self-contained Emoji game module.

## What Changes

- Add a **game-selection landing page** at `/`. The current poker guest page moves from `/` to `/poker`; the new Emoji guest page is served at `/emoji`. **BREAKING**: `/` no longer renders the poker game directly.
- Add an **admin selection page** at `/admin` that routes to `/admin/poker` and `/admin/emoji`. The existing poker admin UI is reachable at `/admin/poker`.
- Enforce **global single-active-game** mutual exclusion: at most one game (poker round OR emoji game) may be `active` at a time. The selection pages surface which game is in progress and prevent starting another.
- Add the **Emoji 猜词** game as an independent module:
  - Admin prepares a **question bank** by pasting text (one question per line: `emoji|答案|提示`) when starting a game. The bank belongs to that game instance (not a global reusable bank).
  - Admin starts the game; questions are served in order. Guests see the emoji + hint (never the answer) and type a guess.
  - **Buzz-in scoring**: the first guest to submit a normalized-exact-match answer scores +1 and **locks** the question; until locked, wrong guesses can be retried freely. After lock, others cannot answer the current question; admin clicks "下一题" to advance.
  - Answer matching is **normalized exact**: `trim` + lowercase, then exact compare.
  - A player reaching **3 points** is promoted: blocked from answering further questions but can still watch questions and progress.
  - **Game ends** when 4 players have reached 3 points OR the question bank is exhausted. A final ranking is shown.
  - Players may **join mid-game**, starting at 0 points.
- Add WebSocket events for the Emoji game: `emoji:game_started`, `emoji:question`, `emoji:solved`, `emoji:game_over`. Poker events are unchanged.
- The existing poker game logic, DB tables (`rounds`, `guesses`, `blocked_players`), and API routes are left intact (minimal-change approach); only its serving path changes.

## Capabilities

### New Capabilities
- `game-selection`: Multi-game shell — landing/selection pages for guest (`/`) and admin (`/admin`), routing to per-game pages, and global single-active-game mutual exclusion across poker and emoji.
- `emoji-word-game`: The Emoji 猜词 buzz-in scoring game — per-game question bank import, ordered question serving, atomic first-correct buzz-in scoring with question locking, retry-until-solved, 3-point promotion (watch-only), and end conditions (4 promoted players OR bank exhausted) with final ranking.

### Modified Capabilities
<!-- None. No existing specs in openspec/specs/. The poker game has no formal spec and its requirements are unchanged. -->

## Impact

- **New backend module**: `server/games/emoji/` (routes + answer matching) and new DB tables `emoji_games`, `emoji_questions`, `emoji_players`.
- **Shared infrastructure reused unchanged**: `server/auth.js`, `server/ws.js`, `server/config.js`, `server/db.js` (connection), frontend `public/js/api.js`, `public/js/ws.js`, `public/css/style.css`.
- **Routing changes** in `server/index.js`: serve new selection pages and per-game pages; the poker guest page is remounted from `/` to `/poker`.
- **New frontend pages**: guest selection (`/`), admin selection (`/admin`), emoji guest (`/emoji`), emoji admin (`/admin/emoji`), plus `public/js/emoji-guest.js` / `public/js/emoji-admin.js`. Existing `index.html`/`admin.html` are repurposed/renamed for poker at `/poker` and `/admin/poker`.
- **Mutual-exclusion check**: a shared helper that inspects both poker (`findOpenRound`) and emoji (`active` game) state before allowing either game to start.
- **No changes** to poker scoring, poker DB schema, or admin auth mechanism.
