import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

// Override config for test - MUST be set before importing routes
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'test123';
process.env.SESSION_SECRET = 'test-secret';
process.env.DB_PATH = 'data/test.db';

// Use dynamic imports to ensure env vars are set before server modules evaluate
const roundRoutes = (await import('../server/routes/round.js')).default;
const adminRoutes = (await import('../server/routes/admin.js')).default;

let server, baseUrl;
let token, roundId;

before(async () => {
  // Clean test db
  try { unlinkSync('data/test.db'); } catch (e) {}

  const app = express();
  app.use(express.json());
  app.use('/api/round', roundRoutes);
  app.use('/api/admin', adminRoutes);

  server = createServer(app);
  await new Promise(r => server.listen(0, () => r()));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
});

after(() => { server.close(); });

describe('admin login', () => {
  it('rejects wrong password', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert.equal(res.status, 401);
  });

  it('returns token on success', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test123' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.ok(data.expiresAt);
    token = data.token;
  });
});

describe('round lifecycle', () => {
  it('starts with no open round', async () => {
    const res = await fetch(`${baseUrl}/api/round/current`);
    const data = await res.json();
    assert.equal(data, null);
  });

  it('starts a round', async () => {
    const res = await fetch(`${baseUrl}/api/admin/round`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ suit: 'heart', rank: 7 }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'open');
    assert.equal(data.answer_suit, 'heart');
    roundId = data.id;
  });

  it('rejects duplicate open round', async () => {
    const res = await fetch(`${baseUrl}/api/admin/round`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ suit: 'spade', rank: 3 }),
    });
    assert.equal(res.status, 409);
  });

  it('guest can see open round', async () => {
    const res = await fetch(`${baseUrl}/api/round/current`);
    const data = await res.json();
    assert.equal(data.id, roundId);
    assert.equal(data.status, 'open');
    // answer should not leak
    assert.equal(data.answer_suit, undefined);
  });

  it('guest submits guess', async () => {
    const res = await fetch(`${baseUrl}/api/round/${roundId}/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Alice', clientId: 'c1', suit: 'heart', rank: 5 }),
    });
    assert.equal(res.status, 200);
  });

  it('rejects duplicate submission', async () => {
    const res = await fetch(`${baseUrl}/api/round/${roundId}/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Alice', clientId: 'c1', suit: 'club', rank: 10 }),
    });
    assert.equal(res.status, 409);
  });

  it('rejects submission on non-existent round', async () => {
    const res = await fetch(`${baseUrl}/api/round/9999/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Bob', clientId: 'c2', suit: 'spade', rank: 1 }),
    });
    assert.equal(res.status, 404);
  });

  it('reveals round', async () => {
    const res = await fetch(`${baseUrl}/api/admin/round/${roundId}/reveal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.ranking);
    assert.equal(data.ranking.length, 1);
  });

  it('rejects submission after reveal', async () => {
    const res = await fetch(`${baseUrl}/api/round/${roundId}/guess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Bob', clientId: 'c3', suit: 'spade', rank: 1 }),
    });
    assert.equal(res.status, 410);
  });
});
