import { Router } from 'express';
import { login, authMiddleware } from '../auth.js';
import { findOpenRound, insertRound, findRoundById, revealRound, findGuessesByRound, countGuesses, findAllRounds, blockPlayer, findBlockedPlayers, unblockPlayer } from '../db.js';
import { rankGuesses } from '../scoring.js';
import { VALID_SUITS, VALID_RANKS } from '../config.js';
import { broadcast } from '../ws.js';
import { activeGame } from '../active-game.js';

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
  const active = activeGame();
  if (active) {
    const msg = active.type === 'emoji' ? 'Emoji 猜词进行中，请先结束' : '已有进行中的局，请先公布上一局';
    return res.status(409).json({ error: 'game_active', message: msg });
  }

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

  // Block top 5 winners
  for (const g of ranking.slice(0, 5)) {
    blockPlayer(g.clientId, g.nickname, id);
  }

  broadcast({
    event: 'round:revealed',
    roundId: id,
    answer: { suit: round.answer_suit, rank: round.answer_rank },
    ranking,
    revealedAt,
  });

  return res.json({ ok: true, ranking });
});

// GET /api/admin/rounds (历史记录列表)
router.get('/rounds', authMiddleware, (_req, res) => {
  const rounds = findAllRounds();
  const list = rounds.map(r => ({
    id: r.id,
    answer_suit: r.answer_suit,
    answer_rank: r.answer_rank,
    status: r.status,
    created_at: r.created_at,
    revealed_at: r.revealed_at,
    guessCount: countGuesses(r.id),
  }));
  return res.json(list);
});

// GET /api/admin/round/:id (管理员查看，含谜底和实时统计)
router.get('/round/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const round = findRoundById(id);
  if (!round) return res.status(404).json({ error: 'round_not_found', message: '该局不存在' });
  const count = countGuesses(id);
  const guesses = findGuessesByRound(id).map(g => ({
    nickname: g.nickname,
    suit: g.guess_suit,
    rank: g.guess_rank,
    submittedAt: g.submitted_at,
  }));
  let ranking = null;
  if (round.status === 'revealed') {
    ranking = rankGuesses(
      { suit: round.answer_suit, rank: round.answer_rank },
      guesses.map(g => ({
        nickname: g.nickname,
        clientId: '',
        suit: g.suit,
        rank: g.rank,
        submittedAt: g.submittedAt,
      }))
    );
  }
  return res.json({ ...round, guessCount: count, guesses, ranking });
});

// GET /api/admin/current-round (管理员查看当前局，含谜底)
router.get('/current-round', authMiddleware, (_req, res) => {
  const round = findOpenRound();
  if (!round) return res.json(null);
  const count = countGuesses(round.id);
  const guesses = findGuessesByRound(round.id).map(g => ({
    nickname: g.nickname,
    suit: g.guess_suit,
    rank: g.guess_rank,
    submittedAt: g.submitted_at,
  }));
  return res.json({ ...round, guessCount: count, guesses });
});

// GET /api/admin/blocked-players (被封禁玩家列表)
router.get('/blocked-players', authMiddleware, (_req, res) => {
  const list = findBlockedPlayers();
  return res.json(list);
});

// POST /api/admin/blocked-players/:clientId/reset (解除封禁)
router.post('/blocked-players/:clientId/reset', authMiddleware, (req, res) => {
  unblockPlayer(req.params.clientId);
  return res.json({ ok: true });
});

export default router;
