const SUITS = [
  { id: 'spade', label: '♠', name: '黑桃' },
  { id: 'heart', label: '♥', name: '红心' },
  { id: 'club', label: '♣', name: '梅花' },
  { id: 'diamond', label: '♦', name: '方块' },
];
const RANKS = [
  { v: 1, label: 'A' }, { v: 2, label: '2' }, { v: 3, label: '3' },
  { v: 4, label: '4' }, { v: 5, label: '5' }, { v: 6, label: '6' },
  { v: 7, label: '7' }, { v: 8, label: '8' }, { v: 9, label: '9' },
  { v: 10, label: '10' }, { v: 11, label: 'J' }, { v: 12, label: 'Q' }, { v: 13, label: 'K' },
];

let token = getToken();
let currentRound = null;
let selectedSuit = null;
let selectedRank = null;
let guessCount = 0;

async function authFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...opts.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401) { clearToken(); token = ''; render(); }
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function render() {
  const app = document.getElementById('app');
  if (!token) {
    app.innerHTML = renderLogin();
    return;
  }
  if (!currentRound) {
    app.innerHTML = renderNewRound();
  } else if (currentRound.status === 'open') {
    app.innerHTML = renderOpenRound();
  } else if (currentRound.status === 'revealed') {
    app.innerHTML = renderResult();
  }
}

function renderLogin() {
  return `<div class="ornament" style="padding-top:30px">🎪 庄家驾到 🎪</div>
<h1>扑克猜心</h1>
<p class="deco-banner">✦ 团建庆典 · 庄家入口 ✦</p>
<div class="card login-form">
  <h2>验明正身</h2>
  <input type="text" id="login-user" placeholder="庄家名号" autofocus>
  <input type="password" id="login-pass" placeholder="通关密语" style="margin-top:12px">
  <p class="error-msg" id="login-err"></p>
  <button class="btn btn-primary" id="do-login">🔑 进入庄家席</button>
</div>`;
}

function renderNewRound() {
  const suitHtml = SUITS.map(s => {
    const sel = selectedSuit === s.id ? ' selected' : '';
    return `<button class="suit-btn${sel}" data-suit="${s.id}">${s.label}<span>${s.name}</span></button>`;
  }).join('');
  const rankHtml = RANKS.map(r => {
    const sel = selectedRank === r.v ? ' selected' : '';
    return `<button class="rank-btn${sel}" data-rank="${r.v}">${r.label}</button>`;
  }).join('');
  const canStart = selectedSuit && selectedRank;

  return `<div class="ornament">🎪 庄家席 🎪</div>
<h1>新开局</h1>
<p class="deco-banner">✦ 布下天机 ✦</p>
<div class="card">
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;text-align:center">悄悄选一张牌作为本轮谜底</p>
  <div class="section-title">选花色</div>
  <div class="suit-grid" id="suit-picker">${suitHtml}</div>
  <div class="section-title">选面值</div>
  <div class="rank-grid" id="rank-picker">${rankHtml}</div>
  <button class="btn btn-primary" id="start-round" ${canStart ? '' : 'disabled'} style="margin-top:24px">${canStart ? '🎯 开局！' : '👆 请选好花色和面值'}</button>
</div>`;
}

function renderOpenRound() {
  const s = SUITS.find(x => x.id === currentRound.answer_suit);
  const r = RANKS.find(x => x.v === currentRound.answer_rank);
  return `<div class="ornament">🎪 庄家席 🎪</div>
<h1>局已开局</h1>
<p class="deco-banner">✦ 静候各路英雄入局 ✦</p>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.75rem;letter-spacing:2px">天 机 在 此</p>
      <div class="answer-card">${s.label} ${r.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:6px">${s.name} ${r.label}</p>
    </div>
  </div>
</div>
<div class="card" style="text-align:center">
  <p style="font-size:0.9rem;color:var(--muted);letter-spacing:1px">已有豪杰入局</p>
  <p id="count-display" style="font-size:3rem;font-weight:900;color:var(--gold-light);line-height:1.2">${guessCount}</p>
  <p style="font-size:0.75rem;color:var(--muted)">人</p>
</div>
<button class="btn btn-primary fixed-bottom" id="reveal-round">🏆 揭榜公布</button>`;
}

function renderResult() {
  if (!currentRound.revealData) return `<div class="ornament">🎪 庄家席 🎪</div><h1>扑克猜心</h1><div class="status-banner"><p style="color:var(--muted)">揭榜中...</p></div>`;
  const { answer, ranking } = currentRound.revealData;
  const aSuit = SUITS.find(x => x.id === answer.suit);
  const aRank = RANKS.find(x => x.v === answer.rank);

  const rows = ranking.map((g, i) => {
    const gSuit = SUITS.find(x => x.id === g.suit);
    const gRank = RANKS.find(x => x.v === g.rank);
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    return `<tr>
      <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
      <td>${escapeHtml(g.nickname)}</td>
      <td style="font-size:1.1rem;font-weight:700">${gSuit.label} ${gRank.label}</td>
      <td style="color:var(--muted)">${g.rankDiff}</td>
      <td>${g.suitMatch === 0 ? '<span style="color:#6BCB77">✓</span>' : '-'}</td>
    </tr>`;
  }).join('');

  return `<div class="ornament">🏆 揭榜大典 🏆</div>
<h1>胜负已分</h1>
<p class="deco-banner">✦ 天机揭晓 ✦</p>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.75rem;letter-spacing:2px">谜 底</p>
      <div class="answer-card">${aSuit.label} ${aRank.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:6px">${aSuit.name} ${aRank.label}</p>
    </div>
  </div>
</div>
<h2>🏅 英雄榜 <span style="font-size:0.8rem;color:var(--muted)">${ranking.length}人参与</span></h2>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>猜测</th><th>分差</th><th>花色</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div style="margin:24px 0">
  <button class="btn btn-primary" id="new-round">🔄 再开一局</button>
</div>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadCurrent() {
  try {
    currentRound = await authFetch('/api/admin/current-round');
    if (currentRound) {
      guessCount = currentRound.guessCount || 0;
    }
    render();
  } catch (e) {
    render();
  }
}

let pollTimer = null;
function startPoll() {
  stopPoll();
  pollTimer = setInterval(async () => {
    if (!token || !currentRound || currentRound.status !== 'open') return;
    try {
      const r = await authFetch('/api/admin/current-round');
      if (r) {
        guessCount = r.guessCount || 0;
        document.getElementById('count-display') && renderOpenRound();
      }
    } catch (e) {}
  }, 2000);
}
function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.id === 'do-login') {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const err = document.getElementById('login-err');
    try {
      const data = await apiPost('/api/admin/login', { username: user, password: pass });
      token = data.token;
      setToken(token);
      await loadCurrent();
    } catch (ex) {
      err.textContent = ex.message || '名号或密语有误';
    }
    return;
  }

  if (t.dataset.suit) { selectedSuit = t.dataset.suit; render(); return; }
  if (t.dataset.rank) { selectedRank = parseInt(t.dataset.rank); render(); return; }

  if (t.id === 'start-round') {
    if (!selectedSuit || !selectedRank) return;
    try {
      const round = await authFetch('/api/admin/round', {
        method: 'POST',
        body: { suit: selectedSuit, rank: selectedRank },
      });
      currentRound = round;
      guessCount = 0;
      selectedSuit = null;
      selectedRank = null;
      startPoll();
      render();
    } catch (ex) {
      alert(ex.message || '开局失利，请重试');
    }
    return;
  }

  if (t.id === 'reveal-round') {
    if (!currentRound) return;
    try {
      const data = await authFetch(`/api/admin/round/${currentRound.id}/reveal`, { method: 'POST' });
      stopPoll();
      currentRound = { ...currentRound, status: 'revealed', revealData: { answer: { suit: currentRound.answer_suit, rank: currentRound.answer_rank }, ranking: data.ranking } };
      render();
    } catch (ex) {
      alert(ex.message || '揭榜失利，请重试');
    }
    return;
  }

  if (t.id === 'new-round') {
    currentRound = null;
    guessCount = 0;
    render();
  }
});

connectWs(async (event) => {
  if (event.event === 'guess:submitted') {
    guessCount = event.count;
    if (currentRound && currentRound.status === 'open') {
      const el = document.getElementById('count-display');
      if (el) renderOpenRound();
    }
  } else if (event.event === 'round:revealed' && currentRound && currentRound.id === event.roundId) {
    stopPoll();
    currentRound = { ...currentRound, status: 'revealed', revealData: event };
    render();
  }
});

if (token) loadCurrent(); else render();
