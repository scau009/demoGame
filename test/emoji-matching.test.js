import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalize, isMatch, parseBank } from '../server/games/emoji/matching.js';

describe('normalize', () => {
  it('trims and lowercases', () => {
    assert.equal(normalize('  Apple '), 'apple');
  });
  it('handles null/undefined', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });
  it('leaves CJK unchanged except trim', () => {
    assert.equal(normalize('  苹果 '), '苹果');
  });
});

describe('isMatch', () => {
  it('matches after trim + lowercase', () => {
    assert.equal(isMatch('  Apple ', 'apple'), true);
  });
  it('matches CJK exactly', () => {
    assert.equal(isMatch(' 苹果 ', '苹果'), true);
  });
  it('rejects non-match', () => {
    assert.equal(isMatch('banana', 'apple'), false);
  });
});

describe('parseBank', () => {
  it('parses valid lines preserving order', () => {
    const r = parseBank('🍎|Apple|fruit\n🐱|Cat|animal');
    assert.equal(r.error, undefined);
    assert.equal(r.questions.length, 2);
    assert.equal(r.questions[0].emoji, '🍎');
    assert.equal(r.questions[0].answer, 'Apple');
    assert.equal(r.questions[0].answerNorm, 'apple');
    assert.equal(r.questions[0].hint, 'fruit');
    assert.equal(r.questions[1].answer, 'Cat');
  });

  it('skips blank and whitespace-only lines', () => {
    const r = parseBank('🍎|Apple|fruit\n\n   \n🐱|Cat|animal\n');
    assert.equal(r.questions.length, 2);
  });

  it('rejects a malformed line with its line number', () => {
    const r = parseBank('🍎|Apple|fruit\n🐱|Cat');
    assert.equal(r.questions, undefined);
    assert.equal(r.line, 2);
  });

  it('rejects a line with empty field', () => {
    const r = parseBank('🍎||fruit');
    assert.equal(r.questions, undefined);
    assert.equal(r.line, 1);
  });

  it('rejects an empty bank', () => {
    const r = parseBank('\n   \n');
    assert.equal(r.questions, undefined);
    assert.equal(r.line, 0);
  });

  it('trims fields', () => {
    const r = parseBank('  🍎 | Apple | a fruit  ');
    assert.equal(r.questions[0].emoji, '🍎');
    assert.equal(r.questions[0].answer, 'Apple');
    assert.equal(r.questions[0].hint, 'a fruit');
  });
});
