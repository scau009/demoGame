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
  return `<div class="ornament" style="padding-top:40px">🎊 团建庆典 🎊</div>
<h1>扑克猜心</h1>
<p class="deco-banner">✦ 心有灵犀 · 一战封神 ✦</p>
<div class="card" style="margin-top:40px">
  <h2 style="text-align:center">输入你的大名</h2>
  <input type="text" id="nickname-input" placeholder="取个响亮的称呼…" maxlength="12" autofocus>
  <p class="error-msg" id="name-err"></p>
  <button class="btn btn-primary" id="confirm-name" style="margin-top:16px">🎯 加入战局</button>
</div>`;
}

function renderWaiting() {
  return `<div class="ornament">🎊 团建庆典 🎊</div>
<h1>扑克猜心</h1>
<div class="status-banner">
  <span class="icon-xl">🀄️</span>
  <p style="font-size:1.05rem;color:var(--text-warm)">虚位以待</p>
  <p style="font-size:0.9rem;color:var(--muted)">等待庄家开局…</p>
  <p class="info-row">玩家：<strong>${escapeHtml(nickname)}</strong></p>
</div>`;
}

function renderGuessForm() {
  const suitHtml = SUITS.map(s => {
    const sel = selectedSuit === s.id ? ' selected' : '';
    return `<button class="suit-btn${sel}" data-suit="${s.id}">${s.label}<span>${s.name}</span></button>`;
  }).join('');
  const rankHtml = RANKS.map(r => {
    const sel = selectedRank === r.v ? ' selected' : '';
    return `<button class="rank-btn${sel}" data-rank="${r.v}">${r.label}</button>`;
  }).join('');
  const canSubmit = selectedSuit && selectedRank;

  return `<div class="ornament">🎯 猜牌时刻 🎯</div>
<h1>猜心一局</h1>
<p class="deco-banner">✦ 选花色 · 定点数 ✦</p>
<div class="section-title">花色定乾坤</div>
<div class="suit-grid" id="suit-picker">${suitHtml}</div>
<div class="section-title">点数决胜负</div>
<div class="rank-grid" id="rank-picker">${rankHtml}</div>
<div class="fixed-bottom">
  <button class="btn btn-primary" id="submit-guess" ${canSubmit ? '' : 'disabled'}>${canSubmit ? '✨ 提交我的猜测' : '👆 请选择花色和面值'}</button>
</div>`;
}

function renderSubmitted() {
  const s = SUITS.find(x => x.id === myGuess.suit);
  const r = RANKS.find(x => x.v === myGuess.rank);
  return `<div class="ornament">🎯 猜牌时刻 🎯</div>
<h1>猜心一局</h1>
<div class="status-banner">
  <span class="icon-xl">🔮</span>
  <p style="font-size:1.05rem;color:var(--text-warm)">已入局</p>
  <p style="font-size:0.9rem;color:var(--muted)">静候庄家揭晓天机…</p>
</div>
<div class="card my-guess">
  <p>我的底牌</p>
  <p>${s.label} ${r.label}</p>
  <p style="font-size:0.8rem;color:var(--muted)">${s.name} ${r.label}</p>
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
      <td>${escapeHtml(g.nickname)}${isMe ? '<br><span style="font-size:0.7rem;color:var(--gold-light)">(是你)</span>' : ''}</td>
      <td style="font-size:1.1rem;font-weight:700">${gSuit.label} ${gRank.label}</td>
      <td style="color:var(--muted)">${g.rankDiff}</td>
      <td>${g.suitMatch === 0 ? '<span style="color:#6BCB77">✓</span>' : '-'}</td>
    </tr>`;
  }).join('');

  const myRankIdx = ranking.findIndex(g => g.clientId === clientId);
  const myRankText = myRankIdx >= 0 ? `你排第 <strong style="color:var(--gold-light);font-size:1.2rem">${myRankIdx + 1}</strong> 名` : '';

  return `<div class="ornament">🏆 揭榜大典 🏆</div>
<h1>胜负已分</h1>
<p class="deco-banner">✦ 庄家亮牌 · 全场共赏 ✦</p>
<div class="card">
  <div class="answer-display">
    <div>
      <p style="color:var(--muted);font-size:0.8rem;letter-spacing:2px">谜 底</p>
      <div class="answer-card" style="color:${suitColor(answer.suit)}">${aSuit.label} ${aRank.label}</div>
      <p style="color:var(--muted);font-size:0.8rem;margin-top:6px">${aSuit.name} ${aRank.label}</p>
    </div>
  </div>
</div>
${myRankText ? `<p class="info-row" style="margin-bottom:12px">${myRankText}</p>` : ''}
<h2>🏅 英雄榜 <span style="font-size:0.8rem;color:var(--muted)">${ranking.length}人参与</span></h2>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>猜测</th><th>分差</th><th>花色</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function suitColor(s) {
  const m = { spade: '#C8D6E5', heart: '#FF6B7A', club: '#6BCB77', diamond: '#74B9FF' };
  return m[s] || '#FFF8E7';
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

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.id === 'confirm-name') {
    const input = document.getElementById('nickname-input');
    const err = document.getElementById('name-err');
    const name = input.value.trim();
    if (!name) { err.textContent = '请报上名来！'; return; }
    setNickname(name);
    nickname = name;
    nicknameSet = true;
    await loadCurrent();
    return;
  }

  if (t.dataset.suit) {
    selectedSuit = t.dataset.suit;
    render();
    return;
  }

  if (t.dataset.rank) {
    selectedRank = parseInt(t.dataset.rank);
    render();
    return;
  }

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
        alert('你已落子，不可悔棋！');
        myGuess = { suit: selectedSuit, rank: selectedRank };
        render();
      } else if (err.status === 410) {
        alert('已揭榜，请等待下一局');
        await loadCurrent();
      } else {
        alert(err.message || '出师不利，再试一次');
      }
    }
  }
});

connectWs(async (event) => {
  if (event.event === 'round:opened') {
    await loadCurrent();
  } else if (event.event === 'guess:submitted') {
  } else if (event.event === 'round:revealed') {
    currentRound = { id: event.roundId, status: 'revealed', result: event };
    render();
  }
});

loadCurrent();
