import { Router } from 'express';
import { findOpenRound, findRoundById, findGuess, insertGuess, countGuesses, isBlocked } from '../db.js';
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

  if (isBlocked(clientId)) {
    return res.status(403).json({ error: 'blocked', message: '恭喜你已获奖，本轮暂不能参与' });
  }

  const round = findRoundById(id);
  if (!round) return res.status(404).json({ error: 'round_not_found', message: '该局不存在' });
  if (round.status === 'revealed') return res.status(410).json({ error: 'round_revealed', message: '该局已公布，不能再提交' });
  if (round.status !== 'open') return res.status(404).json({ error: 'round_not_found', message: '当前没有进行中的局' });

  const existing = findGuess(id, clientId);
  if (existing) return res.status(409).json({ error: 'already_submitted', message: '你已提交过猜测' });

  insertGuess(id, nickname.trim(), clientId, suit, rank);
  broadcast({ event: 'guess:submitted', roundId: id, count: countGuesses(id), guess: { nickname: nickname.trim(), suit, rank } });
  return res.json({ ok: true });
});

export default router;
