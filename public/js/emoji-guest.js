let game = null;          // { gameId, status, question, progress, myScore, promoted }
let nickname = getNickname();
let clientId = getClientId();
let nicknameSet = !!nickname;
let lastResult = null;    // { nickname, answer } from emoji:solved
let gameOver = null;      // { ranking }
let feedback = '';        // inline wrong-answer feedback

function render() {
  const app = document.getElementById('app');
  if (!nicknameSet) { app.innerHTML = renderNickname(); return; }
  if (gameOver) { app.innerHTML = renderGameOver(); return; }
  if (!game || game.status !== 'active') { app.innerHTML = renderWaiting(); return; }
  app.innerHTML = renderQuestion();
}

function renderNickname() {
  return `<div class="ornament" style="padding-top:40px">🎊 团建庆典 🎊</div>
<h1>Emoji 猜词</h1>
<p class="deco-banner">✦ 看图抢答 · 积分晋级 ✦</p>
<div class="card" style="margin-top:40px">
  <h2 style="text-align:center">输入你的大名</h2>
  <input type="text" id="nickname-input" placeholder="取个响亮的称呼…" maxlength="12" autofocus>
  <p class="error-msg" id="name-err"></p>
  <button class="btn btn-primary" id="confirm-name" style="margin-top:16px">🎯 加入战局</button>
</div>`;
}

function renderWaiting() {
  return `<div class="ornament">🎊 团建庆典 🎊</div>
<h1>Emoji 猜词</h1>
<div class="status-banner">
  <span class="icon-xl">🧩</span>
  <p style="font-size:1.05rem;color:var(--text-warm)">虚位以待</p>
  <p style="font-size:0.9rem;color:var(--muted)">等待庄家开始游戏…</p>
  <p class="info-row">玩家：<strong>${escapeHtml(nickname)}</strong></p>
</div>`;
}

function renderQuestion() {
  const q = game.question;
  const promoted = game.promoted;
  const scoreBar = `<div class="card" style="text-align:center">
    <p style="font-size:0.85rem;color:var(--muted)">我的积分</p>
    <p style="font-size:2.4rem;font-weight:900;color:var(--gold-light);line-height:1.1">${game.myScore || 0}<span style="font-size:1rem;color:var(--muted)"> / 3</span></p>
    <p style="font-size:0.75rem;color:var(--muted)">第 ${game.progress.current} / ${game.progress.total} 题</p>
  </div>`;

  if (promoted) {
    return `<div class="ornament">🎖 已晋级 🎖</div>
<h1>Emoji 猜词</h1>
<p class="deco-banner" style="color:var(--gold-light)">✦ 你已满 3 分晋级，围观剩余赛程 ✦</p>
${scoreBar}
<div class="card">
  <div class="answer-display"><div>
    <p style="color:var(--muted);font-size:0.75rem;letter-spacing:2px">本 题</p>
    <div class="answer-card" style="font-size:3.5rem">${q.emoji}</div>
    <p style="color:var(--muted);font-size:0.9rem;margin-top:8px">💡 ${escapeHtml(q.hint)}</p>
  </div></div>
</div>`;
  }

  return `<div class="ornament">🧩 抢答时刻 🧩</div>
<h1>Emoji 猜词</h1>
<p class="deco-banner">✦ 看 emoji · 抢先作答 ✦</p>
${scoreBar}
<div class="card">
  <div class="answer-display"><div>
    <p style="color:var(--muted);font-size:0.75rem;letter-spacing:2px">猜 一 猜</p>
    <div class="answer-card" style="font-size:3.5rem">${q.emoji}</div>
    <p style="color:var(--muted);font-size:0.9rem;margin-top:8px">💡 ${escapeHtml(q.hint)}</p>
  </div></div>
</div>
<div class="card">
  <input type="text" id="answer-input" placeholder="输入你的答案…" autofocus autocomplete="off">
  ${feedback ? `<p class="error-msg" style="text-align:center">${escapeHtml(feedback)}</p>` : ''}
  <button class="btn btn-primary" id="submit-answer" style="margin-top:12px">✨ 抢答</button>
</div>`;
}

function renderGameOver() {
  const ranking = gameOver.ranking || [];
  const rows = ranking.map((p, i) => {
    const isMe = p.clientId === clientId;
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    const promoted = p.score >= 3 ? '🎖' : '';
    return `<tr class="${isMe ? 'highlight' : ''}">
      <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
      <td>${escapeHtml(p.nickname)}${isMe ? '<br><span style="font-size:0.7rem;color:var(--gold-light)">(是你)</span>' : ''}</td>
      <td style="font-weight:700">${p.score} ${promoted}</td>
    </tr>`;
  }).join('');
  return `<div class="ornament">🏆 游戏结束 🏆</div>
<h1>最终战报</h1>
<p class="deco-banner">✦ 积分排行 ✦</p>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>积分</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadCurrent() {
  try {
    game = await apiGet(`/api/emoji/current?clientId=${clientId}`);
    render();
  } catch (e) { render(); }
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

  if (t.id === 'submit-answer') {
    const input = document.getElementById('answer-input');
    const answer = input.value.trim();
    if (!answer || !game) return;
    feedback = '';
    try {
      const r = await apiPost('/api/emoji/guess', { nickname, clientId, answer });
      if (r.correct) {
        game.myScore = r.score;
        game.promoted = r.promoted;
        feedback = '';
        render();
      } else {
        feedback = '❌ 答错了，再试试！';
        render();
        const ni = document.getElementById('answer-input');
        if (ni) { ni.value = answer; ni.focus(); }
      }
    } catch (err) {
      if (err.status === 403) { await loadCurrent(); }
      else if (err.status === 409) { feedback = '本题已被抢答，等待下一题'; render(); }
      else { feedback = err.message || '出师不利，再试一次'; render(); }
    }
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('submit-answer')) {
    e.preventDefault();
    document.getElementById('submit-answer').click();
  }
});

connectWs(async (event) => {
  if (event.event === 'emoji:game_started') {
    gameOver = null;
    await loadCurrent();
  } else if (event.event === 'emoji:question') {
    gameOver = null;
    feedback = '';
    await loadCurrent();
  } else if (event.event === 'emoji:solved') {
    lastResult = { nickname: event.nickname, answer: event.answer };
    if (game && game.question && event.clientId !== clientId) {
      feedback = `🎉 ${lastResult.nickname} 答对了：${lastResult.answer}`;
      render();
    }
  } else if (event.event === 'emoji:game_over') {
    gameOver = { ranking: event.ranking };
    render();
  }
});

if (nicknameSet) loadCurrent(); else render();
