import { randomBytes } from 'node:crypto';

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
export const DB_PATH = process.env.DB_PATH || 'data/game.db';
export const TOKEN_TTL_HOURS = parseInt(process.env.TOKEN_TTL_HOURS || '24', 10);

const SUITS = ['spade', 'heart', 'club', 'diamond'];
export const VALID_SUITS = new Set(SUITS);
export const VALID_RANKS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
