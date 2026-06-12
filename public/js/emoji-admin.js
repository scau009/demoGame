let token = getToken();
let game = null;          // { gameId, status, question, progress }
let gameOver = null;      // { ranking }
let solvedFeed = [];      // recent solves
let importErr = '';

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
  if (!token) { app.innerHTML = renderLogin(); return; }
  if (gameOver) { app.innerHTML = renderGameOver(); return; }
  if (!game || game.status !== 'active') { app.innerHTML = renderSetup(); return; }
  app.innerHTML = renderActive();
}

function renderLogin() {
  return `<div class="ornament" style="padding-top:30px">🎪 庄家驾到 🎪</div>
<h1>Emoji 猜词</h1>
<p class="deco-banner">✦ 庄家入口 ✦</p>
<div class="card login-form">
  <h2>验明正身</h2>
  <input type="text" id="login-user" placeholder="庄家名号" autofocus>
  <input type="password" id="login-pass" placeholder="通关密语" style="margin-top:12px">
  <p class="error-msg" id="login-err"></p>
  <button class="btn btn-primary" id="do-login">🔑 进入庄家席</button>
</div>`;
}

function renderSetup() {
  return `<div class="ornament">🎪 庄家席 🎪</div>
<h1>准备题库</h1>
<p class="deco-banner">✦ 每行一题：emoji|答案|提示 ✦</p>
<div class="card">
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:10px">粘贴题库，每行一题，用竖线分隔：</p>
  <textarea id="bank-input" rows="10" placeholder="🍎|苹果|一种水果&#10;🐱|猫|一种宠物&#10;🚗|汽车|交通工具" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:0.9rem;padding:10px;border-radius:8px"></textarea>
  ${importErr ? `<p class="error-msg">${escapeHtml(importErr)}</p>` : ''}
  <button class="btn btn-primary" id="start-game" style="margin-top:14px">🎯 开始游戏</button>
</div>
<a href="/admin"><button class="btn btn-secondary" style="margin-top:12px">🔙 返回大厅</button></a>`;
}

function renderActive() {
  const q = game.question;
  const feed = solvedFeed.slice(-8).reverse().map(s =>
    `<tr><td>${escapeHtml(s.nickname)}</td><td style="font-weight:700">${escapeHtml(s.answer)}</td><td>${s.score}分</td></tr>`
  ).join('');
  return `<div class="ornament">🧩 进行中 🧩</div>
<h1>第 ${game.progress.current} / ${game.progress.total} 题</h1>
<p class="deco-banner">✦ ${q && q.status === 'solved' ? '已被攻克，可进入下一题' : '等待抢答'} ✦</p>
<div class="card">
  <div class="answer-display"><div>
    <p style="color:var(--muted);font-size:0.75rem;letter-spacing:2px">当 前 题</p>
    <div class="answer-card" style="font-size:3.5rem">${q ? q.emoji : ''}</div>
    <p style="color:var(--gold-light);font-size:1rem;margin-top:8px">答案：${q ? escapeHtml(q.answer || '（隐藏）') : ''}</p>
    <p style="color:var(--muted);font-size:0.9rem;margin-top:4px">💡 ${q ? escapeHtml(q.hint) : ''}</p>
  </div></div>
</div>
${solvedFeed.length ? `<h2>🏅 抢答记录</h2>
<table class="ranking-table">
  <thead><tr><th>玩家</th><th>答案</th><th>积分</th></tr></thead>
  <tbody>${feed}</tbody>
</table>` : ''}
<button class="btn btn-primary fixed-bottom" id="next-question">⏭ 下一题</button>`;
}

function renderGameOver() {
  const ranking = gameOver.ranking || [];
  const rows = ranking.map((p, i) => {
    const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
    const promoted = p.score >= 3 ? '🎖' : '';
    return `<tr>
      <td><span class="rank-badge ${rankCls}">${i + 1}</span></td>
      <td>${escapeHtml(p.nickname)}</td>
      <td style="font-weight:700">${p.score} ${promoted}</td>
    </tr>`;
  }).join('');
  return `<div class="ornament">🏆 游戏结束 🏆</div>
<h1>最终战报</h1>
<p class="deco-banner">✦ 积分排行 ✦</p>
<table class="ranking-table">
  <thead><tr><th>排名</th><th>玩家</th><th>积分</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<button class="btn btn-primary" id="new-game" style="margin-top:20px">🔄 再来一局</button>
<a href="/admin"><button class="btn btn-secondary" style="margin-top:12px">🔙 返回大厅</button></a>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadCurrent() {
  try {
    game = await authFetch('/api/emoji/admin/current');
    render();
  } catch (e) { render(); }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.id === 'do-login') {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const err = document.getElementById('login-err');
    try {
      const data = await apiPost('/api/admin/login', { username: user, password: pass });
      token = data.token; setToken(token);
      await loadCurrent();
    } catch (ex) { err.textContent = ex.message || '名号或密语有误'; }
    return;
  }

  if (t.id === 'start-game') {
    const bank = document.getElementById('bank-input').value;
    importErr = '';
    try {
      const r = await authFetch('/api/emoji/admin/game', { method: 'POST', body: { bank } });
      gameOver = null; solvedFeed = [];
      await loadCurrent();
    } catch (ex) {
      importErr = ex.line ? `第 ${ex.line} 行：${ex.message}` : (ex.message || '开始失败');
      render();
    }
    return;
  }

  if (t.id === 'next-question') {
    try {
      const r = await authFetch('/api/emoji/admin/next', { method: 'POST' });
      if (r.finished) { gameOver = { ranking: r.ranking }; render(); }
      else { await loadCurrent(); }
    } catch (ex) { alert(ex.message || '操作失败'); }
    return;
  }

  if (t.id === 'new-game') {
    gameOver = null; game = null; solvedFeed = [];
    render();
    return;
  }
});

connectWs((event) => {
  if (event.event === 'emoji:solved') {
    solvedFeed.push({ nickname: event.nickname, answer: event.answer, score: event.score });
    if (game && game.question && game.question.seq === event.seq) {
      game.question.status = 'solved';
    }
    if (game && game.status === 'active') render();
  } else if (event.event === 'emoji:game_over') {
    gameOver = { ranking: event.ranking };
    render();
  }
});

if (token) loadCurrent(); else render();
