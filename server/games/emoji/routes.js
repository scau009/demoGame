import { Router } from 'express';
import { authMiddleware } from '../../auth.js';
import { broadcast } from '../../ws.js';
import { activeGame } from '../../active-game.js';
import { isMatch, parseBank } from './matching.js';
import {
  findActiveEmojiGame,
  findEmojiGameById,
  createEmojiGame,
  findEmojiQuestionsByGame,
  findEmojiQuestionBySeq,
  countEmojiQuestions,
  advanceEmojiQuestion,
  findEmojiPlayer,
  ensureEmojiPlayer,
  findEmojiPlayersByGame,
  solveEmojiQuestion,
  finishEmojiGame,
} from '../../db.js';

const router = Router();

// Guest-safe view of a question (never includes the answer).
function publicQuestion(q) {
  if (!q) return null;
  return { seq: q.seq, emoji: q.emoji, hint: q.hint, status: q.status };
}

// Final ranking: promoted players (score>=3) first, ordered by reached_at
// (earlier first), then remaining players by score desc, then nickname.
function buildRanking(gameId) {
  const players = findEmojiPlayersByGame(gameId);
  return players
    .map((p) => ({ nickname: p.nickname, clientId: p.client_id, score: p.score, reachedAt: p.reached_at }))
    .sort((a, b) => {
      const aP = a.score >= 3, bP = b.score >= 3;
      if (aP !== bP) return aP ? -1 : 1;
      if (aP && bP) return a.reachedAt - b.reachedAt;
      if (a.score !== b.score) return b.score - a.score;
      return a.nickname.localeCompare(b.nickname);
    });
}

function gameProgress(game) {
  const total = countEmojiQuestions(game.id);
  return { current: game.current_seq + 1, total };
}

// POST /api/emoji/admin/game — start a new game from a pasted bank
router.post('/admin/game', authMiddleware, (req, res) => {
  const active = activeGame();
  if (active) {
    const msg = active.type === 'poker' ? '扑克猜心进行中，请先结束' : '已有进行中的 Emoji 游戏';
    return res.status(409).json({ error: 'game_active', message: msg });
  }

  const parsed = parseBank(req.body?.bank);
  if (parsed.error) {
    return res.status(400).json({ error: 'invalid_bank', message: parsed.error, line: parsed.line });
  }

  const game = createEmojiGame(parsed.questions);
  const first = findEmojiQuestionBySeq(game.id, 0);
  broadcast({ event: 'emoji:game_started', gameId: game.id });
  broadcast({ event: 'emoji:question', gameId: game.id, question: publicQuestion(first), progress: gameProgress(game) });
  return res.json({ ok: true, gameId: game.id });
});

// POST /api/emoji/admin/next — advance to the next question, or end the game
router.post('/admin/next', authMiddleware, (_req, res) => {
  const game = findActiveEmojiGame();
  if (!game) return res.status(404).json({ error: 'no_active_game', message: '没有进行中的游戏' });

  const next = advanceEmojiQuestion(game.id, game.current_seq + 1);
  if (!next) {
    finishEmojiGame(game.id);
    const ranking = buildRanking(game.id);
    broadcast({ event: 'emoji:game_over', gameId: game.id, ranking, reason: 'exhausted' });
    return res.json({ ok: true, finished: true, ranking });
  }

  const updated = findEmojiGameById(game.id);
  broadcast({ event: 'emoji:question', gameId: game.id, question: publicQuestion(next), progress: gameProgress(updated) });
  return res.json({ ok: true, finished: false, question: publicQuestion(next) });
});

// GET /api/emoji/current?clientId= — guest view of the active game
router.get('/current', (req, res) => {
  const game = findActiveEmojiGame();
  if (!game) return res.json(null);
  const current = findEmojiQuestionBySeq(game.id, game.current_seq);
  const out = {
    gameId: game.id,
    status: game.status,
    question: publicQuestion(current),
    progress: gameProgress(game),
  };
  if (req.query.clientId) {
    const player = findEmojiPlayer(game.id, req.query.clientId);
    out.myScore = player ? player.score : 0;
    out.promoted = player ? player.score >= 3 : false;
  }
  return res.json(out);
});

// GET /api/emoji/admin/current — admin view of the active game (includes answer)
router.get('/admin/current', authMiddleware, (_req, res) => {
  const game = findActiveEmojiGame();
  if (!game) return res.json(null);
  const current = findEmojiQuestionBySeq(game.id, game.current_seq);
  return res.json({
    gameId: game.id,
    status: game.status,
    question: current
      ? { seq: current.seq, emoji: current.emoji, hint: current.hint, answer: current.answer, status: current.status }
      : null,
    progress: gameProgress(game),
  });
});

// POST /api/emoji/guess — submit an answer to the active question
router.post('/guess', (req, res) => {
  const { nickname, clientId, answer } = req.body || {};
  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
    return res.status(400).json({ error: 'invalid_input', message: '请输入昵称' });
  }
  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'invalid_input', message: '缺少 clientId' });
  }
  if (typeof answer !== 'string') {
    return res.status(400).json({ error: 'invalid_input', message: '请输入答案' });
  }

  const game = findActiveEmojiGame();
  if (!game) return res.status(404).json({ error: 'no_active_game', message: '没有进行中的游戏' });

  const player = ensureEmojiPlayer(game.id, clientId, nickname.trim());
  if (player.score >= 3) {
    return res.status(403).json({ error: 'promoted', message: '你已晋级（3分），只能围观' });
  }

  const q = findEmojiQuestionBySeq(game.id, game.current_seq);
  if (!q || q.status !== 'active') {
    return res.status(409).json({ error: 'no_active_question', message: '当前没有可作答的题目' });
  }

  if (!isMatch(answer, q.answer_norm)) {
    return res.json({ correct: false });
  }

  const result = solveEmojiQuestion(game.id, q.id, clientId);
  broadcast({
    event: 'emoji:solved',
    gameId: game.id,
    seq: q.seq,
    nickname: nickname.trim(),
    clientId,
    answer: q.answer,
    score: result.newScore,
  });
  if (result.finished) {
    const ranking = buildRanking(game.id);
    broadcast({ event: 'emoji:game_over', gameId: game.id, ranking, reason: 'four_promoted' });
  }
  return res.json({ correct: true, score: result.newScore, promoted: result.newScore >= 3 });
});

export default router;
