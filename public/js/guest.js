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

let currentRound = null;
let myGuess = null;
let selectedSuit = null;
let selectedRank = null;
let nickname = getNickname();
let clientId = getClientId();
let nicknameSet = !!nickname;

function render() {
  const app = document.getElementById('app');
  if (!nicknameSet) {
    app.innerHTML = renderNickname();
    return;
  }
  if (!currentRound) {
    app.innerHTML = renderWaiting();
  } else if (currentRound.status === 'open' && !myGuess) {
    app.innerHTML = renderGuessForm();
  } else if (currentRound.status === 'open' && myGuess) {
    app.innerHTML = renderSubmitted();
  } else if (currentRound.status === 'revealed') {
    app.innerHTML = renderResult();
  }
}

function renderNickname() {
  return `<h1>扑克牌心理大战</h1>
<div class="card" style="margin-top:60px">
  <h2>输入你的昵称</h2>
  <input type="text" id="nickname-input" placeholder="起个名字…" maxlength="12" autofocus>
  <p class="error-msg" id="name-err"></p>
  <button class="btn btn-primary" id="confirm-name" style="margin-top:12px">进入游戏</button>
</div>`;
}

function renderWaiting() {
  return `<h1>扑克牌心理大战</h1>
<div class="status-banner">
  <p style="font-size:3rem;margin-bottom:12px">🃏</p>
  <p>等待管理员开局…</p>
  <p style="font-size:0.85rem;color:var(--muted);margin-top:8px">昵称：${escapeHtml(nickname)}</p>
</div>`;
}

function renderGuessForm() {
  const suitHtml = SUITS.map(s => {
    const sel = selectedSuit === s.id ? ' selected' : '';
    return `<button class="suit-btn${sel}" data-suit="${s.id}">${s.label}<br>${s.name}</button>`;
  }).join('');
  const rankHtml = RANKS.map(r => {
    const sel = selectedRank === r.v ? ' selected' : '';
    return `<button class="rank-btn${sel}" data-rank="${r.v}">${r.label}</button>`;
  }).join('');
  const canSubmit = selectedSuit && selectedRank;

  return `<h1>猜牌</h1>
<div class="section-title">选择花色</div>
<div class="suit-grid" id="suit-picker">${suitHtml}</div>
<div class="section-title">选择面值</div>
<div class="rank-grid" id="rank-picker">${rankHtml}</div>
<div class="fixed-bottom">
  <button class="btn btn-primary" id="submit-guess" ${canSubmit ? '' : 'disabled'}>提交猜测</button>
</div>`;
}

function renderSubmitted() {
  const s = SUITS.find(x => x.id === myGuess.suit);
  const r = RANKS.find(x => x.v === myGuess.rank);
  return `<h1>猜牌</h1>
<div class="status-banner">
  <p style="font-size:2rem;margin-bottom:8px">✓</p>
  <p>已提交，等待管理员公布结果</p>
</div>
<div class="card my-guess">
  <p style="color:var(--muted);font-size:0.85rem">我的猜测</p>
  <p style="font-size:1.5rem;font-weight:700">${s.label} ${r.label}</p>
  <p style="font-size:0.85rem;color:var(--muted)">${s.name} ${r.label}</p>
</div>`;
}

function renderResult() {
  if (!currentRound.result) return renderWaiting();
  const { answer, ranking, revealedAt } = currentRound.result;
  const aSuit = SUITS.find(x => x.id === answer.suit);
  const aRank = RANKS.find(x => x.v === answer.rank);

  const rows = ranking.map((g, i) => {
    const gSuit = SUITS.find(x => x.id === g.suit);
    const gRank = RANKS.find(x => x.v === g.rank);
    const isMe = g.clientId === clientId;
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    return `<tr class="${isMe ? 'highlight' : ''}">
      <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
      <td>${escapeHtml(g.nickname)}${isMe ? ' (你)' : ''}</td>
      <td>${gSuit.label} ${gRank.label}</td>
      <td>${g.rankDiff}</td>
      <td>${g.suitMatch === 0 ? '✓' : '-'}</td>
    </tr>`;
  }).join('');

  return `<h1>结果公布</h1>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem">谜底</p>
      <div class="answer-card" style="color:${suitColor(answer.suit)}">${aSuit.label} ${aRank.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:4px">${aSuit.name} ${aRank.label}</p>
    </div>
  </div>
</div>
<h2>排行榜</h2>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>猜测</th><th>面值差</th><th>花色</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function suitColor(s) {
  const m = { spade: 'var(--spade)', heart: 'var(--heart)', club: 'var(--club)', diamond: 'var(--diamond)' };
  return m[s] || 'var(--text)';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadCurrent() {
  try {
    currentRound = await apiGet(`/api/round/current?clientId=${clientId}`);
    if (currentRound && currentRound.myGuess) {
      myGuess = currentRound.myGuess;
    }
    render();
  } catch (e) {
    render();
  }
}

// event delegation
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  // nickname confirm
  if (t.id === 'confirm-name') {
    const input = document.getElementById('nickname-input');
    const err = document.getElementById('name-err');
    const name = input.value.trim();
    if (!name) { err.textContent = '请输入昵称'; return; }
    setNickname(name);
    nickname = name;
    nicknameSet = true;
    await loadCurrent();
    return;
  }

  // suit selection
  if (t.dataset.suit) {
    selectedSuit = t.dataset.suit;
    render();
    return;
  }

  // rank selection
  if (t.dataset.rank) {
    selectedRank = parseInt(t.dataset.rank);
    render();
    return;
  }

  // submit
  if (t.id === 'submit-guess') {
    if (!selectedSuit || !selectedRank || !currentRound) return;
    try {
      await apiPost(`/api/round/${currentRound.id}/guess`, {
        nickname,
        clientId,
        suit: selectedSuit,
        rank: selectedRank,
      });
      myGuess = { suit: selectedSuit, rank: selectedRank };
      render();
    } catch (err) {
      if (err.status === 409) {
        alert('你已经提交过猜测了');
        myGuess = { suit: selectedSuit, rank: selectedRank };
        render();
      } else if (err.status === 410) {
        alert('该局已公布，不能再提交');
        await loadCurrent();
      } else {
        alert(err.message || '提交失败');
      }
    }
  }
});

// WS
connectWs(async (event) => {
  if (event.event === 'round:opened') {
    await loadCurrent();
  } else if (event.event === 'guess:submitted') {
    // live count update during open state
  } else if (event.event === 'round:revealed') {
    currentRound = { id: event.roundId, status: 'revealed', result: event };
    render();
  }
});

// init
loadCurrent();
