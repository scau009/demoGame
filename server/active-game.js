// Global single-active-game enforcement across all game types.
// An active game is an open poker round OR an active emoji game.

import { findOpenRound, findActiveEmojiGame } from './db.js';

// Returns the active game descriptor, or null if none.
function activeGame() {
  const round = findOpenRound();
  if (round) return { type: 'poker', id: round.id };
  const emoji = findActiveEmojiGame();
  if (emoji) return { type: 'emoji', id: emoji.id };
  return null;
}

function isAnyGameActive() {
  return activeGame() !== null;
}

export { activeGame, isAnyGameActive };
