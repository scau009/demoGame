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
  findAllRounds: db.prepare('SELECT * FROM rounds ORDER BY id DESC'),
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

export { db, findOpenRound, findRoundById, insertRound, revealRound, findGuess, insertGuess, findGuessesByRound, countGuesses, findAllRounds };
