## Context

The codebase is a single-game real-time app (扑克猜心 / Poker Mind Battle): Node.js + Express + `ws` + `better-sqlite3`, with a vanilla-JS SPA served from `public/`. Shared infrastructure (`auth.js`, `ws.js`, `config.js`, `db.js`) is game-agnostic enough to reuse, but the poker game's routes, scoring, DB tables, and frontend are poker-specific.

We are adding a second game (Emoji 猜词) and a thin multi-game shell. Constraints, all confirmed during exploration:

- Only one game may run at a time (global mutual exclusion).
- Minimal change to the existing poker game — it stays in place; only its serving path moves.
- Emoji is a buzz-in scoring race with a per-game question bank, very different in model from poker's per-round ranking.
- Target scenario: one-off team-building events, single admin, modest concurrency.

## Goals / Non-Goals

**Goals:**

- Add a guest landing page (`/`) and admin selection page (`/admin`) that route to per-game pages.
- Enforce global single-active-game across poker and emoji.
- Implement Emoji 猜词 end-to-end: paste-import question bank, ordered serving, atomic first-correct buzz-in scoring with locking, retry-until-solved, 3-point watch-only promotion, end at 4 promoted players or bank exhaustion, mid-game join at 0 points.
- Reuse shared infra (auth, ws broadcast, config, db connection, frontend api/ws/css helpers) without modification.

**Non-Goals:**

- No refactor of the poker game into a symmetric `games/poker/` module (minimal-change decision). Poker code, tables, and routes are untouched except for serving path.
- No global reusable question bank or bank CRUD UI — the bank is pasted per game instance.
- No per-game concurrency (two games at once) — explicitly excluded by mutual exclusion.
- No fuzzy/multi-answer matching — normalized exact only.
- No authentication for guests (unchanged from poker; clientId in localStorage).

## Decisions

### D1: Independent emoji tables, not reuse of rounds/guesses

Add `emoji_games`, `emoji_questions`, `emoji_players`. The poker `rounds`/`guesses`/`blocked_players` model (per-round ranking, cross-round bans) is structurally incompatible with an accumulating-score buzz-in race. Forcing reuse would distort both. Alternative considered: a generic `games` table with a JSON blob — rejected because the buzz-in lock and per-player score need real columns and indexes for atomic queries.

```
emoji_games(id PK, status 'active'|'finished', current_seq INT, created_at, finished_at)
emoji_questions(id PK, game_id FK, seq INT, emoji, answer, answer_norm, hint,
                status 'pending'|'active'|'solved', solved_by, solved_at)
emoji_players(game_id, client_id, nickname, score INT, reached_at)  PK(game_id, client_id)
```

`answer_norm` stores the normalized answer (trim+lowercase) so matching is a single indexed equality compare, not a per-request recompute.

### D2: Atomic buzz-in via better-sqlite3 synchronous transaction

`better-sqlite3` executes synchronously on a single thread, so request handlers are serialized — there is no true concurrency to race. The first correct submission to reach the handler runs to completion before the next begins. The win is decided inside a transaction:

```
guess(clientId, answer):
  game = active game            else 409
  player = players[clientId]    (auto-create at 0 if mid-game join)
  if player.score >= 3          → 403 promoted
  q = active question           else 409
  if q.status == 'solved'       → 409 already solved
  if normalize(answer) != q.answer_norm → { correct:false }   (retry, no lock)
  TX: q.status='solved', q.solved_by=clientId, q.solved_at=now,
      player.score += 1, (if score==3) player.reached_at=now
      if promotedCount()==4 → finish game
  broadcast emoji:solved  (+ emoji:game_over if finished)
```

The `q.status == 'solved'` guard inside the serialized handler is what rejects the second correct answer. Alternative considered: optimistic `UPDATE ... WHERE status='active'` and check `changes` — equivalent here, but the explicit guard reads clearer and we already hold the synchronous guarantee.

### D3: Mutual exclusion as a shared pre-start check

A small shared helper checks both games before either starts:

```
isAnyGameActive() = findOpenRound() != null  ||  findActiveEmojiGame() != null
```

Poker's existing `POST /api/admin/round` and the new emoji start route both call it. Poker already rejects a second open round via `findOpenRound`; we extend the guard to also see emoji, and emoji's start guard sees poker. Selection pages call a read-only `/api/active-game` to display what's in progress. Alternative considered: a global `active_game` lock row — rejected as redundant state that can desync from the actual game tables; deriving from the two source-of-truth tables can't desync.

### D4: Routing — minimal poker move + new pages

`server/index.js` serves:

```
/              → public/select.html        (new guest selection)
/poker         → public/poker.html         (current index.html, renamed)
/emoji         → public/emoji.html          (new)
/admin         → public/admin-select.html  (new admin selection)
/admin/poker   → public/admin.html          (existing poker admin)
/admin/emoji   → public/emoji-admin.html    (new)
```

Static assets (`/js`, `/css`) stay shared. Poker JS/HTML is renamed/remounted, not rewritten. New `public/js/emoji-guest.js` and `emoji-admin.js` reuse `api.js`, `ws.js`, `style.css`.

### D5: WebSocket — one shared broadcast channel, namespaced events

Keep the single `ws.js` `broadcast()` and the one `/ws` connection. Emoji events are prefixed `emoji:` (`emoji:game_started`, `emoji:question`, `emoji:solved`, `emoji:game_over`); poker events unchanged. Each frontend ignores events it doesn't recognize. Since only one game is active at a time, cross-talk is harmless. Alternative considered: per-game ws paths/rooms — unnecessary complexity for a single-active-game, single-room app.

### D6: Promotion modeled by score, not blocked_players

A player with `score >= 3` is promoted (watch-only). This is intra-game state derived from `emoji_players.score`, distinct from poker's cross-round `blocked_players` ban. `reached_at` timestamps promotion to order the final ranking (earlier promotion ranks higher).

## Risks / Trade-offs

- **[Two `<script>`-style globals (`SUITS`/`RANKS`) already exist in poker JS]** → Emoji JS uses its own module-scoped constants; no shared mutable globals between games, and only one game page loads at a time.
- **[Renaming `index.html` → `poker.html` breaks bookmarks to `/`]** → Acceptable and intended (BREAKING noted in proposal). `/` now routes by selection; deep-linkers can use `/poker`.
- **[Mid-game join + page refresh identity]** → Identity is the localStorage `clientId`, same mechanism poker uses; refresh preserves it. Switching device/browser starts a new 0-point player — acceptable for the event scenario.
- **[Malformed bank import]** → Validation rejects the whole import atomically (no partial game) and reports the offending line, so the admin fixes and re-pastes.
- **[Answer normalization too strict for CJK]** → trim+lowercase is intended; CJK is unaffected by lowercase and the answer set is admin-authored, so the admin controls exact expected strings. Documented behavior, not a defect.
- **[Game-over race: 4th promotion vs admin advancing]** → Both paths run inside the serialized handler; whichever executes first finishes the game and the other sees `status='finished'` and no-ops.

## Migration Plan

1. Add emoji tables to `server/db.js` schema (idempotent `CREATE TABLE IF NOT EXISTS`); no migration of existing data needed — poker tables untouched.
2. Add `server/games/emoji/` (routes + matching) and mount `/api/emoji/*`.
3. Add shared `/api/active-game` read endpoint and the `isAnyGameActive()` helper; wire it into poker's round-open guard and emoji's start guard.
4. Add new HTML/JS pages; rename `index.html`→`poker.html`, `admin.html` stays for `/admin/poker`; update `server/index.js` routes.
5. Rollback: revert `index.js` routing and remove emoji routes/pages. Emoji tables can remain (inert) or be dropped; poker is unaffected either way.

## Open Questions

- None blocking. Final-ranking display details for the emoji game (e.g. how non-promoted players are shown) are covered by the spec's ranking scenario and can be refined during implementation.
