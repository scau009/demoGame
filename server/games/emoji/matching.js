// Answer matching for the Emoji word-guessing game.
// Normalized exact match: trim + lowercase, then compare.

function normalize(s) {
  return String(s ?? '').trim().toLowerCase();
}

function isMatch(answer, answerNorm) {
  return normalize(answer) === answerNorm;
}

// Parse a pasted question bank. One question per line: `emoji|答案|提示`.
// Blank/whitespace-only lines are skipped. Returns { questions } on success
// or { error, line } when a non-blank line is malformed or the bank is empty.
function parseBank(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const questions = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue;
    const parts = raw.split('|');
    if (parts.length !== 3) {
      return { error: '每行必须为 emoji|答案|提示 三段', line: i + 1 };
    }
    const emoji = parts[0].trim();
    const answer = parts[1].trim();
    const hint = parts[2].trim();
    if (!emoji || !answer || !hint) {
      return { error: 'emoji、答案、提示均不能为空', line: i + 1 };
    }
    questions.push({ emoji, answer, answerNorm: normalize(answer), hint });
  }
  if (questions.length === 0) {
    return { error: '题库为空，至少需要一道题', line: 0 };
  }
  return { questions };
}

export { normalize, isMatch, parseBank };
