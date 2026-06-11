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
  return `<h1>管理后台</h1>
<div class="card login-form">
  <h2>管理员登录</h2>
  <input type="text" id="login-user" placeholder="用户名" autofocus>
  <input type="password" id="login-pass" placeholder="密码" style="margin-top:12px">
  <p class="error-msg" id="login-err"></p>
  <button class="btn btn-primary" id="do-login">登录</button>
</div>`;
}

function renderNewRound() {
  const suitHtml = SUITS.map(s => {
    const sel = selectedSuit === s.id ? ' selected' : '';
    return `<button class="suit-btn${sel}" data-suit="${s.id}">${s.label}<br>${s.name}</button>`;
  }).join('');
  const rankHtml = RANKS.map(r => {
    const sel = selectedRank === r.v ? ' selected' : '';
    return `<button class="rank-btn${sel}" data-rank="${r.v}">${r.label}</button>`;
  }).join('');
  const canStart = selectedSuit && selectedRank;

  return `<h1>管理后台</h1>
<div class="card">
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:12px">设置本局谜底</p>
  <div class="section-title">花色</div>
  <div class="suit-grid" id="suit-picker">${suitHtml}</div>
  <div class="section-title">面值</div>
  <div class="rank-grid" id="rank-picker">${rankHtml}</div>
  <button class="btn btn-primary" id="start-round" ${canStart ? '' : 'disabled'} style="margin-top:20px">开始本局</button>
</div>`;
}

function renderOpenRound() {
  const s = SUITS.find(x => x.id === currentRound.answer_suit);
  const r = RANKS.find(x => x.v === currentRound.answer_rank);
  return `<h1>管理后台</h1>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem">当前谜底</p>
      <div class="answer-card">${s.label} ${r.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:4px">${s.name} ${r.label}</p>
    </div>
  </div>
</div>
<div class="card" style="text-align:center">
  <p style="font-size:0.9rem;color:var(--muted)">已提交猜测</p>
  <p id="count-display" style="font-size:2.5rem;font-weight:900;color:var(--accent)">${guessCount}</p>
</div>
<button class="btn btn-primary fixed-bottom" id="reveal-round">公布排名</button>`;
}

function renderResult() {
  if (!currentRound.revealData) return '<h1>管理后台</h1><div class="status-banner"><p>加载中…</p></div>';
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
      <td>${gSuit.label} ${gRank.label}</td>
      <td>${g.rankDiff}</td>
      <td>${g.suitMatch === 0 ? '✓' : '-'}</td>
    </tr>`;
  }).join('');

  return `<h1>管理后台</h1>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem">谜底</p>
      <div class="answer-card">${aSuit.label} ${aRank.label}</div>
    </div>
  </div>
</div>
<h2>排行榜 (${ranking.length}人)</h2>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>猜测</th><th>面值差</th><th>花色</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div style="margin:20px 0">
  <button class="btn btn-primary" id="new-round">开新局</button>
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

// periodic poll for guess count (WS doesn't give per-admin count details)
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
      err.textContent = ex.message || '登录失败';
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
      alert(ex.message || '开局失败');
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
      alert(ex.message || '公布失败');
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

// init
if (token) loadCurrent(); else render();
