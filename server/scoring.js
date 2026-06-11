function score(answer, guess) {
  return {
    rankDiff: Math.abs(answer.rank - guess.rank),
    suitMatch: answer.suit === guess.suit ? 0 : 1,
  };
}

function rankGuesses(answer, guesses) {
  return [...guesses]
    .map(g => ({ ...g, ...score(answer, g) }))
    .sort((a, b) =>
      a.rankDiff - b.rankDiff ||
      a.suitMatch - b.suitMatch ||
      a.submitted_at - b.submitted_at
    );
}

export { score, rankGuesses };
