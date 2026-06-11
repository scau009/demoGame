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
