# Implementation Tasks

## 1. Database schema (emoji tables)

- [x] 1.1 Add `emoji_games` table to `server/db.js` schema (`id`, `status`, `current_seq`, `created_at`, `finished_at`)
- [x] 1.2 Add `emoji_questions` table (`id`, `game_id` FK, `seq`, `emoji`, `answer`, `answer_norm`, `hint`, `status`, `solved_by`, `solved_at`) + index on `(game_id, seq)`
- [x] 1.3 Add `emoji_players` table (`game_id`, `client_id`, `nickname`, `score`, `reached_at`) with composite PK `(game_id, client_id)`
- [x] 1.4 Add prepared statements + exported data functions for emoji games, questions, and players

## 2. Answer matching + bank parsing

- [x] 2.1 Create `server/games/emoji/matching.js` with `normalize(s)` (trim + lowercase) and `isMatch(answer, answerNorm)`
- [x] 2.2 Add bank parser: split pasted text by line, skip blank/whitespace-only lines, require exactly 3 pipe fields, return parsed questions or a line-numbered error
- [x] 2.3 Unit tests for `normalize`/`isMatch` (whitespace + case, CJK unaffected) and for the parser (valid, blank lines, malformed line, empty bank)

## 3. Mutual exclusion (shared)

- [x] 3.1 Add `findActiveEmojiGame()` to `server/db.js`
- [x] 3.2 Add shared `isAnyGameActive()` helper combining `findOpenRound()` and `findActiveEmojiGame()`
- [x] 3.3 Add `GET /api/active-game` read endpoint returning the in-progress game type (or none)
- [x] 3.4 Extend poker `POST /api/admin/round` guard to reject when an emoji game is active

## 4. Emoji game API

- [x] 4.1 Create `server/games/emoji/routes.js` and mount `/api/emoji/*` in `server/index.js`
- [x] 4.2 `POST /api/emoji/admin/game` (auth): validate + parse bank, enforce `isAnyGameActive()`, create game + questions, activate first question, broadcast `emoji:game_started` + `emoji:question`
- [x] 4.3 `POST /api/emoji/admin/next` (auth): mark next pending question active + broadcast `emoji:question`, or end game when none remain
- [x] 4.4 `GET /api/emoji/current?clientId=`: return active game state for guests (emoji + hint + progress + player score), NEVER the answer
- [x] 4.5 `POST /api/emoji/guess`: auto-create player at 0 on mid-game join; reject if score>=3 (403) or question solved (409); on wrong answer return `{correct:false}`; on first correct, atomic TX awards +1, locks question, records solver, sets `reached_at` at 3 pts
- [x] 4.6 Implement end-condition check inside the scoring TX: finish game + broadcast `emoji:game_over` when 4 players reach 3 points
- [x] 4.7 Implement game-over on bank exhaustion in the advance route + broadcast `emoji:game_over`
- [x] 4.8 Build final ranking: promoted players first ordered by `reached_at`, then remaining by score

## 5. Routing + selection pages

- [x] 5.1 Rename `public/index.html` → `public/poker.html`; serve poker guest at `/poker`
- [x] 5.2 Serve existing poker admin (`public/admin.html`) at `/admin/poker`
- [x] 5.3 Add `public/select.html` (guest selection) served at `/`, listing 扑克猜心 + Emoji 猜词, showing in-progress game via `/api/active-game`
- [x] 5.4 Add `public/admin-select.html` served at `/admin`, routing to `/admin/poker` and `/admin/emoji`
- [x] 5.5 Update `server/index.js` static + route mounts for all new paths

## 6. Emoji frontend

- [x] 6.1 Add `public/emoji.html` (guest) reusing `api.js`, `ws.js`, `style.css`
- [x] 6.2 Add `public/js/emoji-guest.js`: nickname/clientId flow, render current question (emoji + hint), answer input with retry, disabled input + watch-only banner when promoted (score>=3), result on `emoji:solved`, final ranking on `emoji:game_over`
- [x] 6.3 Add `public/emoji-admin.html` + `public/js/emoji-admin.js`: paste bank + start game, current question view, 下一题 button, live solver feed, game-over ranking
- [x] 6.4 Wire emoji WS events (`emoji:game_started`/`question`/`solved`/`game_over`) in both emoji frontends; ignore poker events

## 7. Verification

- [x] 7.1 Run `npm test` (matching + parser unit tests pass)
- [x] 7.2 Manual E2E in browser: import bank → start → multiple guests buzz-in → lock → next → reach 3 pts (promotion watch-only) → end at 4 promoted; and separately end via bank exhaustion
- [x] 7.3 Verify mutual exclusion both directions (cannot start emoji while poker round open; cannot open poker while emoji active) and that it clears when a game ends
- [x] 7.4 Verify mid-game join starts at 0 points and can answer the current question
