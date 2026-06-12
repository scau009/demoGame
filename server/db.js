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
  CREATE TABLE IF NOT EXISTS blocked_players (
    client_id  TEXT PRIMARY KEY,
    nickname   TEXT NOT NULL,
    blocked_at INTEGER NOT NULL,
    round_id   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS emoji_games (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    status       TEXT    NOT NULL CHECK(status IN ('active','finished')),
    current_seq  INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    finished_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_emoji_games_status ON emoji_games(status);
  CREATE TABLE IF NOT EXISTS emoji_questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     INTEGER NOT NULL REFERENCES emoji_games(id),
    seq         INTEGER NOT NULL,
    emoji       TEXT    NOT NULL,
    answer      TEXT    NOT NULL,
    answer_norm TEXT    NOT NULL,
    hint        TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK(status IN ('pending','active','solved')),
    solved_by   TEXT,
    solved_at   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_emoji_questions_game ON emoji_questions(game_id, seq);
  CREATE TABLE IF NOT EXISTS emoji_players (
    game_id    INTEGER NOT NULL REFERENCES emoji_games(id),
    client_id  TEXT    NOT NULL,
    nickname   TEXT    NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    reached_at INTEGER,
    PRIMARY KEY (game_id, client_id)
  );
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
  findAllRounds: db.prepare('SELECT * FROM rounds ORDER BY id DESC'),
  findBlockedPlayers: db.prepare('SELECT * FROM blocked_players ORDER BY blocked_at DESC'),
  blockPlayer: db.prepare('INSERT OR IGNORE INTO blocked_players (client_id, nickname, blocked_at, round_id) VALUES (?, ?, ?, ?)'),
  unblockPlayer: db.prepare('DELETE FROM blocked_players WHERE client_id = ?'),
  isBlocked: db.prepare('SELECT 1 FROM blocked_players WHERE client_id = ?'),
  findActiveEmojiGame: db.prepare("SELECT * FROM emoji_games WHERE status = 'active' LIMIT 1"),
  findEmojiGameById: db.prepare('SELECT * FROM emoji_games WHERE id = ?'),
  insertEmojiGame: db.prepare('INSERT INTO emoji_games (status, current_seq, created_at) VALUES (?, ?, ?)'),
  setEmojiGameSeq: db.prepare('UPDATE emoji_games SET current_seq = ? WHERE id = ?'),
  finishEmojiGame: db.prepare("UPDATE emoji_games SET status = 'finished', finished_at = ? WHERE id = ?"),
  insertEmojiQuestion: db.prepare('INSERT INTO emoji_questions (game_id, seq, emoji, answer, answer_norm, hint, status) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  findEmojiQuestionsByGame: db.prepare('SELECT * FROM emoji_questions WHERE game_id = ? ORDER BY seq ASC'),
  findEmojiQuestionBySeq: db.prepare('SELECT * FROM emoji_questions WHERE game_id = ? AND seq = ?'),
  activateEmojiQuestion: db.prepare("UPDATE emoji_questions SET status = 'active' WHERE id = ?"),
  solveEmojiQuestion: db.prepare("UPDATE emoji_questions SET status = 'solved', solved_by = ?, solved_at = ? WHERE id = ?"),
  countEmojiQuestions: db.prepare('SELECT COUNT(*) AS cnt FROM emoji_questions WHERE game_id = ?'),
  findEmojiPlayer: db.prepare('SELECT * FROM emoji_players WHERE game_id = ? AND client_id = ?'),
  insertEmojiPlayer: db.prepare('INSERT INTO emoji_players (game_id, client_id, nickname, score, reached_at) VALUES (?, ?, ?, 0, NULL)'),
  updateEmojiPlayerScore: db.prepare('UPDATE emoji_players SET score = ?, reached_at = ? WHERE game_id = ? AND client_id = ?'),
  findEmojiPlayersByGame: db.prepare('SELECT * FROM emoji_players WHERE game_id = ?'),
  countPromotedEmojiPlayers: db.prepare('SELECT COUNT(*) AS cnt FROM emoji_players WHERE game_id = ? AND score >= 3'),
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

function findAllRounds() {
  return stmts.findAllRounds.all();
}

function findBlockedPlayers() {
  return stmts.findBlockedPlayers.all();
}

function blockPlayer(clientId, nickname, roundId) {
  const now = Math.floor(Date.now() / 1000);
  stmts.blockPlayer.run(clientId, nickname, now, roundId);
}

function unblockPlayer(clientId) {
  stmts.unblockPlayer.run(clientId);
}

function isBlocked(clientId) {
  return stmts.isBlocked.get(clientId) !== undefined;
}

function findActiveEmojiGame() {
  return stmts.findActiveEmojiGame.get() ?? null;
}

function findEmojiGameById(id) {
  return stmts.findEmojiGameById.get(id) ?? null;
}

function createEmojiGame(questions) {
  const now = Math.floor(Date.now() / 1000);
  const tx = db.transaction((qs) => {
    const info = stmts.insertEmojiGame.run('active', 0, now);
    const gameId = Number(info.lastInsertRowid);
    qs.forEach((q, i) => {
      const status = i === 0 ? 'active' : 'pending';
      stmts.insertEmojiQuestion.run(gameId, i, q.emoji, q.answer, q.answerNorm, q.hint, status);
    });
    return gameId;
  });
  const gameId = tx(questions);
  return findEmojiGameById(gameId);
}

function findEmojiQuestionsByGame(gameId) {
  return stmts.findEmojiQuestionsByGame.all(gameId);
}

function findEmojiQuestionBySeq(gameId, seq) {
  return stmts.findEmojiQuestionBySeq.get(gameId, seq) ?? null;
}

function countEmojiQuestions(gameId) {
  return stmts.countEmojiQuestions.get(gameId).cnt;
}

function advanceEmojiQuestion(gameId, nextSeq) {
  const q = findEmojiQuestionBySeq(gameId, nextSeq);
  if (!q) return null;
  const tx = db.transaction(() => {
    stmts.activateEmojiQuestion.run(q.id);
    stmts.setEmojiGameSeq.run(nextSeq, gameId);
  });
  tx();
  return findEmojiQuestionBySeq(gameId, nextSeq);
}

function findEmojiPlayer(gameId, clientId) {
  return stmts.findEmojiPlayer.get(gameId, clientId) ?? null;
}

function ensureEmojiPlayer(gameId, clientId, nickname) {
  const existing = findEmojiPlayer(gameId, clientId);
  if (existing) return existing;
  stmts.insertEmojiPlayer.run(gameId, clientId, nickname);
  return findEmojiPlayer(gameId, clientId);
}

function findEmojiPlayersByGame(gameId) {
  return stmts.findEmojiPlayersByGame.all(gameId);
}

// Atomic buzz-in: lock the question to this solver, award +1, set reached_at at 3,
// and finish the game if 4 players are now promoted. Returns the resulting state.
function solveEmojiQuestion(gameId, questionId, clientId) {
  const now = Math.floor(Date.now() / 1000);
  const tx = db.transaction(() => {
    stmts.solveEmojiQuestion.run(clientId, now, questionId);
    const player = stmts.findEmojiPlayer.get(gameId, clientId);
    const newScore = player.score + 1;
    const reachedAt = newScore === 3 ? now : player.reached_at;
    stmts.updateEmojiPlayerScore.run(newScore, reachedAt, gameId, clientId);
    const promoted = stmts.countPromotedEmojiPlayers.get(gameId).cnt;
    let finished = false;
    if (promoted >= 4) {
      stmts.finishEmojiGame.run(now, gameId);
      finished = true;
    }
    return { newScore, reachedAt, promoted, finished };
  });
  return tx();
}

function finishEmojiGame(gameId) {
  const now = Math.floor(Date.now() / 1000);
  stmts.finishEmojiGame.run(now, gameId);
  return now;
}

export { db, findOpenRound, findRoundById, insertRound, revealRound, findGuess, insertGuess, findGuessesByRound, countGuesses, findAllRounds, findBlockedPlayers, blockPlayer, unblockPlayer, isBlocked, findActiveEmojiGame, findEmojiGameById, createEmojiGame, findEmojiQuestionsByGame, findEmojiQuestionBySeq, countEmojiQuestions, advanceEmojiQuestion, findEmojiPlayer, ensureEmojiPlayer, findEmojiPlayersByGame, solveEmojiQuestion, finishEmojiGame };
