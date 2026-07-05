// GNSS 考试刷题 - 驾考式（无游戏化）
(function() {
  'use strict';

  const { FLASHCARDS, FILL_BLANK, CHOICES, PPT_CHAPTERS, HANDWRITTEN_NOTES } = window.STUDY_DATA;
  const STORAGE_KEY = 'gnss_practice_v2';

  // ===== 数据归一化为统一题库 =====
  const QUESTIONS = [];
  FLASHCARDS.forEach(f => QUESTIONS.push({
    id: f.id, type: 'flash', chapter: f.chapter, q: f.q, a: f.a
  }));
  FILL_BLANK.forEach(f => QUESTIONS.push({
    id: f.id, type: 'fill', chapter: f.chapter, q: f.text, a: f.answer
  }));
  CHOICES.forEach(f => QUESTIONS.push({
    id: f.id, type: 'choice', chapter: f.chapter, q: f.q, a: f.opts[f.ans], opts: f.opts, ans: f.ans, explain: f.explain
  }));

  // ===== 状态 =====
  const state = loadState();
  const view = {
    appMode: 'practice',    // practice / memorize
    mode: 'all',            // all / choice / fill / flash
    chapter: 'all',
    onlyWrong: false,
    onlyStarred: false,
    idx: 0,
    list: [],
    answered: false,
    selected: null,
    fillInput: '',
    flashFlipped: false,
  };
  const memView = {
    chapter: 'all',
    type: 'all',
    speed: 8,            // 秒，0=手动
    idx: 0,
    list: [],
    shuffled: false,
    interval: null,
    remaining: 0,
  };
  const hwView = {
    chapter: 'all',
    idx: 0,
    list: [],
    shuffled: false,
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      answered: {},
      correct: {},
      starred: {},
      hwStarred: {},   // 手写重点标记
    };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ===== 刷题模式：题目列表构建 =====
  function buildList() {
    let list = QUESTIONS.slice();
    if (view.mode !== 'all') list = list.filter(q => q.type === view.mode);
    if (view.chapter !== 'all') list = list.filter(q => q.chapter === view.chapter);
    if (view.onlyWrong) list = list.filter(q => state.correct[q.id] === false);
    if (view.onlyStarred) list = list.filter(q => state.starred[q.id]);
    if (view.idx >= list.length) view.idx = 0;
    return list;
  }

  // ===== 顶部模式切换 =====
  function switchAppMode(mode) {
    view.appMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.appmode === mode));
    document.getElementById('practice-controls').style.display = mode === 'practice' ? '' : 'none';
    document.getElementById('practice-toolbar').style.display = mode === 'practice' ? '' : 'none';
    document.getElementById('memorize-toolbar').style.display = mode === 'memorize' ? '' : 'none';
    document.getElementById('handwritten-toolbar').style.display = mode === 'handwritten' ? '' : 'none';
    document.getElementById('stats-bar').style.display = mode === 'practice' ? '' : 'none';
    if (mode === 'practice') {
      stopMemoTimer();
      renderList();
    } else if (mode === 'memorize') {
      renderMemorize();
    } else if (mode === 'handwritten') {
      stopMemoTimer();
      renderHandwritten();
    }
  }
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAppMode(tab.dataset.appmode));
  });

  // ===== 刷题模式：题型切换 =====
  document.querySelectorAll('.inner-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.inner-tab').forEach(t => t.classList.toggle('active', t === tab));
      view.mode = tab.dataset.mode;
      view.idx = 0;
      view.answered = false;
      view.selected = null;
      view.fillInput = '';
      view.flashFlipped = false;
      renderList();
    });
  });

  // ===== 刷题模式：章节下拉 =====
  function initChapterFilter() {
    const sel = document.getElementById('chapter-filter');
    const chapters = ['all', ...new Set(QUESTIONS.map(q => q.chapter))];
    sel.innerHTML = chapters.map(c => `<option value="${c}">${c === 'all' ? '全部章节' : c}</option>`).join('');
    sel.value = view.chapter;
    sel.addEventListener('change', () => {
      view.chapter = sel.value;
      view.idx = 0;
      view.answered = false;
      view.selected = null;
      view.fillInput = '';
      view.flashFlipped = false;
      renderList();
    });
  }

  // ===== 刷题模式：工具按钮 =====
  document.getElementById('btn-shuffle').addEventListener('click', () => {
    const list = buildList();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    view.list = list;
    view.idx = 0;
    view.answered = false;
    view.selected = null;
    view.fillInput = '';
    view.flashFlipped = false;
    render();
  });

  document.getElementById('btn-mark').addEventListener('click', () => {
    const q = view.list[view.idx];
    if (!q) return;
    if (state.starred[q.id]) delete state.starred[q.id];
    else state.starred[q.id] = true;
    saveState();
    render();
  });

  document.getElementById('btn-show-answer').addEventListener('click', () => {
    if (view.list.length === 0) return;
    view.answered = true;
    if (view.list[view.idx].type === 'choice') view.selected = view.list[view.idx].ans;
    if (view.list[view.idx].type === 'flash') view.flashFlipped = true;
    if (view.list[view.idx].type === 'fill') view.fillInput = view.list[view.idx].a;
    render();
  });

  const wrongBtn = document.getElementById('btn-only-wrong');
  wrongBtn.addEventListener('click', () => {
    if (!view.onlyWrong && !view.onlyStarred) {
      view.onlyWrong = true; view.onlyStarred = false;
      wrongBtn.textContent = '标记';
      wrongBtn.classList.add('active');
    } else if (view.onlyWrong) {
      view.onlyWrong = false; view.onlyStarred = true;
      wrongBtn.textContent = '标记';
      wrongBtn.classList.add('active');
    } else {
      view.onlyWrong = false; view.onlyStarred = false;
      wrongBtn.textContent = '错题';
      wrongBtn.classList.remove('active');
    }
    view.idx = 0;
    view.answered = false;
    view.selected = null;
    view.fillInput = '';
    view.flashFlipped = false;
    renderList();
  });

  // ===== 顶部统计 =====
  function updateStats() {
    const correct = Object.values(state.correct).filter(Boolean).length;
    const wrong = Object.values(state.correct).filter(v => v === false).length;
    const done = correct + wrong;
    const star = Object.values(state.starred).filter(Boolean).length;
    document.getElementById('stat-done').textContent = done;
    document.getElementById('stat-right').textContent = correct;
    document.getElementById('stat-wrong').textContent = wrong;
    document.getElementById('stat-star').textContent = star;
  }

  // ===== 刷题模式：渲染 =====
  function renderList() {
    view.list = buildList();
    render();
  }

  function render() {
    updateStats();
    const list = view.list;
    document.getElementById('progress-current').textContent = list.length ? view.idx + 1 : 0;
    document.getElementById('progress-total').textContent = list.length;

    const main = document.getElementById('main-content');
    const bar = document.getElementById('bottom-bar');

    if (list.length === 0) {
      main.innerHTML = `<div class="q-card"><div style="text-align:center;padding:40px 0;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:12px">📭</div>
        没有符合条件的题目<br>
        <span style="font-size:13px">试试切换章节或题型</span>
      </div></div>`;
      bar.innerHTML = `<button class="btn" onclick="document.getElementById('chapter-filter').value='all';document.getElementById('chapter-filter').dispatchEvent(new Event('change'));">重置筛选</button>`;
      return;
    }

    const q = list[view.idx];
    const typeLabel = { choice: '选择题', fill: '填空题', flash: '闪卡' }[q.type];

    let qBody = '';
    if (q.type === 'choice') qBody = renderChoice(q);
    else if (q.type === 'fill') qBody = renderFill(q);
    else qBody = renderFlash(q);

    main.innerHTML = `
      <div class="q-card">
        <div class="q-meta">
          <span class="q-chapter">${escapeHtml(q.chapter)}</span>
          <span class="q-type">${typeLabel}</span>
          <span class="q-num">#${view.idx + 1}</span>
          ${state.starred[q.id] ? '<span class="q-star">⭐</span>' : ''}
        </div>
        <div class="q-question">${escapeHtml(q.q)}</div>
        ${qBody}
      </div>
    `;

    bindQuestionEvents(q);
    renderBottomBar(q);
    document.getElementById('btn-mark').textContent = state.starred[q.id] ? '★' : '☆';
    document.getElementById('btn-mark').style.color = state.starred[q.id] ? 'var(--yellow)' : '';
  }

  function renderChoice(q) {
    let html = '<div class="options">';
    q.opts.forEach((o, i) => {
      let cls = 'option';
      if (view.answered) {
        if (i === q.ans) cls += ' correct';
        else if (i === view.selected && view.selected !== q.ans) cls += ' wrong';
      } else if (i === view.selected) {
        cls += ' selected';
      }
      html += `<button class="${cls}" data-idx="${i}" ${view.answered ? 'disabled' : ''}>
        <span class="option-letter">${String.fromCharCode(65 + i)}</span>
        <span>${escapeHtml(o)}</span>
      </button>`;
    });
    html += '</div>';
    if (view.answered) html += renderChoiceFeedback(q);
    return html;
  }

  function renderChoiceFeedback(q) {
    const isRight = view.selected === q.ans;
    if (isRight) {
      return `<div class="q-feedback right">
        <strong>✓ 正确</strong> · ${String.fromCharCode(65 + q.ans)}. ${escapeHtml(q.opts[q.ans])}
        ${q.explain ? `<span class="explain">💡 ${escapeHtml(q.explain)}</span>` : ''}
      </div>`;
    } else {
      return `<div class="q-feedback wrong">
        <strong>✗ 错误</strong><br>
        <span class="user-answer">你的答案：${String.fromCharCode(65 + view.selected)}. ${escapeHtml(q.opts[view.selected] || '')}</span><br>
        <span class="right-answer">正确答案：${String.fromCharCode(65 + q.ans)}. ${escapeHtml(q.opts[q.ans])}</span>
        ${q.explain ? `<span class="explain">💡 ${escapeHtml(q.explain)}</span>` : ''}
      </div>`;
    }
  }

  function renderFill(q) {
    const userVal = view.fillInput;
    let cls = 'fill-input';
    if (view.answered) cls += checkFill(userVal, q.a) ? ' correct' : ' wrong';
    return `
      <div class="fill-input-wrap">
        <input type="text" class="${cls}" id="fill-input" placeholder="输入答案..." value="${escapeHtml(userVal)}" ${view.answered ? 'disabled' : ''} autocomplete="off">
      </div>
      <div class="fill-hint">按 Enter 提交 · 多个答案用 | 分隔</div>
      ${view.answered ? renderFillFeedback(q, userVal) : ''}
    `;
  }

  function renderFillFeedback(q, userVal) {
    const right = checkFill(userVal, q.a);
    if (right) {
      return `<div class="q-feedback right">
        <strong>✓ 正确</strong> · 答案：<span class="right-answer">${escapeHtml(q.a)}</span>
      </div>`;
    } else {
      return `<div class="q-feedback wrong">
        <strong>✗ 错误</strong><br>
        <span class="user-answer">你的答案：${escapeHtml(userVal || '（空）')}</span><br>
        <span class="right-answer">参考答案：${escapeHtml(q.a)}</span>
      </div>`;
    }
  }

  function renderFlash(q) {
    return `
      <div class="flash-card ${view.flashFlipped ? 'flipped' : ''}" id="flash-card">
        <div class="flash-inner">
          <div class="flash-face">
            <div class="flash-text">${escapeHtml(q.q)}</div>
            <div class="flash-hint">点击卡片查看答案</div>
          </div>
          <div class="flash-face flash-back">
            <div class="flash-text">${escapeHtml(q.a)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function bindQuestionEvents(q) {
    if (q.type === 'choice') {
      document.querySelectorAll('.option').forEach(btn => {
        btn.addEventListener('click', () => {
          if (view.answered) return;
          view.selected = parseInt(btn.dataset.idx);
          render();
        });
      });
    } else if (q.type === 'fill') {
      const input = document.getElementById('fill-input');
      if (!input) return;
      input.focus();
      const v = view.fillInput || '';
      try { input.setSelectionRange(v.length, v.length); } catch (e) {}
      const updateSubmitState = () => {
        const submit = document.getElementById('btn-submit');
        if (submit) {
          const hasVal = view.fillInput.trim().length > 0;
          submit.disabled = !hasVal;
          submit.style.opacity = hasVal ? '1' : '0.4';
        }
      };
      input.addEventListener('input', e => { view.fillInput = e.target.value; updateSubmitState(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !view.answered) { e.preventDefault(); submitAnswer(); }
      });
      updateSubmitState();
    } else if (q.type === 'flash') {
      const card = document.getElementById('flash-card');
      if (!card) return;
      card.addEventListener('click', () => {
        if (view.flashFlipped) return;
        view.flashFlipped = true;
        card.classList.add('flipped');
      });
    }
  }

  function renderBottomBar(q) {
    const bar = document.getElementById('bottom-bar');
    if (q.type === 'flash') {
      if (!view.answered) {
        bar.innerHTML = `
          <button class="btn btn-bad" id="btn-dont-know">❌ 不记得</button>
          <button class="btn btn-good" id="btn-know">✓ 记得</button>
        `;
        document.getElementById('btn-dont-know').addEventListener('click', () => submitAnswer(false));
        document.getElementById('btn-know').addEventListener('click', () => submitAnswer(true));
      } else {
        bar.innerHTML = `
          <button class="btn" id="btn-prev">← 上一题</button>
          <button class="btn btn-primary" id="btn-next">下一题 →</button>
        `;
        document.getElementById('btn-prev').addEventListener('click', prev);
        document.getElementById('btn-next').addEventListener('click', next);
      }
    } else {
      if (!view.answered) {
        bar.innerHTML = `
          <button class="btn" id="btn-prev" ${view.idx === 0 ? 'disabled style="opacity:0.4"' : ''}>← 上一题</button>
          <button class="btn btn-primary" id="btn-submit" disabled style="opacity:0.4">提交答案</button>
          <button class="btn" id="btn-next" disabled style="opacity:0.4">下一题 →</button>
        `;
        document.getElementById('btn-prev').addEventListener('click', prev);
        document.getElementById('btn-submit').addEventListener('click', submitAnswer);
        const submit = document.getElementById('btn-submit');
        if (q.type === 'choice' && view.selected !== null) { submit.disabled = false; submit.style.opacity = '1'; }
        if (q.type === 'fill' && view.fillInput.trim()) { submit.disabled = false; submit.style.opacity = '1'; }
      } else {
        bar.innerHTML = `
          <button class="btn" id="btn-prev">← 上一题</button>
          <button class="btn btn-primary" id="btn-next">下一题 →</button>
        `;
        document.getElementById('btn-prev').addEventListener('click', prev);
        document.getElementById('btn-next').addEventListener('click', next);
      }
    }
  }

  function submitAnswer(forceResult) {
    const q = view.list[view.idx];
    if (!q || view.answered) return;
    let correct = false;
    if (q.type === 'choice') {
      if (view.selected === null) return;
      correct = view.selected === q.ans;
    } else if (q.type === 'fill') {
      correct = checkFill(view.fillInput, q.a);
    } else if (q.type === 'flash') {
      if (typeof forceResult === 'boolean') correct = forceResult;
      else return;
    }
    view.answered = true;
    state.answered[q.id] = true;
    state.correct[q.id] = correct;
    saveState();
    render();
  }

  function next() {
    if (view.idx < view.list.length - 1) {
      view.idx++;
      view.answered = false;
      view.selected = null;
      view.fillInput = '';
      view.flashFlipped = false;
      render();
    } else {
      if (confirm('已是最后一题，回到第一题？')) {
        view.idx = 0;
        view.answered = false;
        view.selected = null;
        view.fillInput = '';
        view.flashFlipped = false;
        render();
      }
    }
  }

  function prev() {
    if (view.idx > 0) {
      view.idx--;
      view.answered = state.answered[view.list[view.idx].id] || false;
      const q = view.list[view.idx];
      if (q.type === 'choice') view.selected = view.answered ? q.ans : null;
      if (q.type === 'fill') view.fillInput = '';
      if (q.type === 'flash') view.flashFlipped = view.answered || false;
      render();
    }
  }

  function checkFill(user, answer) {
    if (!user) return false;
    const candidates = answer.split('|').map(s => s.trim().toLowerCase().replace(/\s+/g, ''));
    const norm = user.toLowerCase().replace(/\s+/g, '');
    return candidates.some(c => c === norm || (c.length >= 2 && norm.includes(c)));
  }

  // ===== 背题模式 =====
  function buildMemoList() {
    let list = QUESTIONS.slice();
    if (memView.chapter !== 'all') list = list.filter(q => q.chapter === memView.chapter);
    if (memView.type !== 'all') list = list.filter(q => q.type === memView.type);
    if (memView.shuffled) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    return list;
  }

  function initMemoControls() {
    const sel = document.getElementById('mem-chapter');
    const chapters = ['all', ...new Set(QUESTIONS.map(q => q.chapter))];
    sel.innerHTML = chapters.map(c => `<option value="${c}">${c === 'all' ? '全部章节' : c}</option>`).join('');
    sel.addEventListener('change', () => {
      memView.chapter = sel.value;
      memView.idx = 0;
      renderMemorize();
    });

    const typeSel = document.getElementById('mem-type');
    typeSel.addEventListener('change', () => {
      memView.type = typeSel.value;
      memView.idx = 0;
      renderMemorize();
    });

    const speedSel = document.getElementById('mem-speed');
    speedSel.addEventListener('change', () => {
      memView.speed = parseInt(speedSel.value);
      if (memView.speed > 0) startMemoTimer();
      else stopMemoTimer();
    });

    document.getElementById('mem-shuffle').addEventListener('click', () => {
      memView.shuffled = !memView.shuffled;
      const btn = document.getElementById('mem-shuffle');
      btn.textContent = memView.shuffled ? '✓乱序' : '🔀';
      btn.style.color = memView.shuffled ? 'var(--blue)' : '';
      memView.idx = 0;
      renderMemorize();
    });
  }

  function renderMemorize() {
    memView.list = buildMemoList();
    document.getElementById('mem-current').textContent = memView.list.length ? memView.idx + 1 : 0;
    document.getElementById('mem-total').textContent = memView.list.length;

    const main = document.getElementById('main-content');
    const bar = document.getElementById('bottom-bar');

    if (memView.list.length === 0) {
      main.innerHTML = `<div class="q-card"><div style="text-align:center;padding:40px 0;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:12px">📭</div>
        没有符合条件的题目<br>
        <span style="font-size:13px">试试切换章节或题型</span>
      </div></div>`;
      bar.innerHTML = '';
      stopMemoTimer();
      return;
    }

    const q = memView.list[memView.idx];
    const typeLabel = { choice: '选择题', fill: '填空题', flash: '闪卡' }[q.type];

    let extras = '';
    if (q.type === 'choice') {
      extras = `<div class="memo-extra"><strong>选项：</strong>${q.opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${escapeHtml(o)}`).join('　')}</div>`;
      if (q.explain) extras += `<div class="memo-extra">💡 <strong>解析：</strong>${escapeHtml(q.explain)}</div>`;
    } else if (q.type === 'fill') {
      extras = `<div class="memo-extra"><strong>填法：</strong>直接给答案，强化记忆</div>`;
    } else if (q.type === 'flash') {
      extras = `<div class="memo-extra">💡 <strong>背诵要点：</strong>看清关键词、关键数字、概念辨析</div>`;
    }

    const timerHtml = memView.speed > 0 ? `
      <div class="memo-counter">下一题倒计时 <span id="memo-remaining">${memView.speed}</span> 秒</div>
      <div class="memo-timer"><div class="memo-timer-fill" id="memo-timer-fill" style="width:100%"></div></div>
    ` : `<div class="memo-counter" style="color:var(--muted)">手动翻页模式</div>`;

    main.innerHTML = `
      <div class="q-card">
        <div class="q-meta">
          <span class="q-chapter">${escapeHtml(q.chapter)}</span>
          <span class="q-type">${typeLabel}</span>
          <span class="q-num">#${memView.idx + 1} / ${memView.list.length}</span>
        </div>
        <div class="memo-question">${escapeHtml(q.q)}</div>
        ${timerHtml}
        <div class="memo-answer">${escapeHtml(q.a)}</div>
        <div class="memo-extras">${extras}</div>
      </div>
    `;

    bar.innerHTML = `
      <button class="btn" id="memo-prev" ${memView.idx === 0 ? 'disabled style="opacity:0.4"' : ''}>← 上一题</button>
      <button class="btn btn-primary" id="memo-next">下一题 →</button>
    `;
    document.getElementById('memo-prev').addEventListener('click', memoPrev);
    document.getElementById('memo-next').addEventListener('click', memoNext);

    if (memView.speed > 0) startMemoTimer();
    else stopMemoTimer();
  }

  function startMemoTimer() {
    stopMemoTimer();
    if (memView.speed <= 0) return;
    memView.remaining = memView.speed;
    const start = Date.now();
    const total = memView.speed * 1000;
    memView.interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, memView.speed - elapsed / 1000);
      const fillEl = document.getElementById('memo-timer-fill');
      const remainEl = document.getElementById('memo-remaining');
      if (fillEl) {
        const pct = Math.max(0, (1 - elapsed / total) * 100);
        fillEl.style.width = pct + '%';
        fillEl.classList.toggle('warning', left <= memView.speed * 0.5 && left > memView.speed * 0.25);
        fillEl.classList.toggle('danger', left <= memView.speed * 0.25);
      }
      if (remainEl) remainEl.textContent = Math.ceil(left);
      if (left <= 0) {
        memoNext();
      }
    }, 100);
  }

  function stopMemoTimer() {
    if (memView.interval) {
      clearInterval(memView.interval);
      memView.interval = null;
    }
  }

  function memoNext() {
    if (memView.idx < memView.list.length - 1) memView.idx++;
    else memView.idx = 0;
    renderMemorize();
  }

  function memoPrev() {
    if (memView.idx > 0) memView.idx--;
    else memView.idx = 0;
    renderMemorize();
  }

  // ===== 手写重点模式 =====
  function buildHandwrittenList() {
    let list = HANDWRITTEN_NOTES.slice();
    if (hwView.chapter !== 'all') list = list.filter(h => h.chapter === hwView.chapter);
    if (hwView.shuffled) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    return list;
  }

  function initHandwrittenControls() {
    const sel = document.getElementById('hw-chapter');
    const chapters = ['all', ...new Set(HANDWRITTEN_NOTES.map(h => h.chapter))];
    sel.innerHTML = chapters.map(c => `<option value="${c}">${c === 'all' ? '全部章节' : c}</option>`).join('');
    sel.addEventListener('change', () => {
      hwView.chapter = sel.value;
      hwView.idx = 0;
      renderHandwritten();
    });
    document.getElementById('hw-shuffle').addEventListener('click', () => {
      hwView.shuffled = !hwView.shuffled;
      const btn = document.getElementById('hw-shuffle');
      btn.textContent = hwView.shuffled ? '✓乱序' : '🔀';
      btn.style.color = hwView.shuffled ? 'var(--blue)' : '';
      hwView.idx = 0;
      renderHandwritten();
    });
    document.getElementById('hw-mark').addEventListener('click', () => {
      const item = hwView.list[hwView.idx];
      if (!item) return;
      if (state.hwStarred[item.id]) delete state.hwStarred[item.id];
      else state.hwStarred[item.id] = true;
      saveState();
      renderHandwritten();
    });
  }

  function renderHandwritten() {
    hwView.list = buildHandwrittenList();
    document.getElementById('hw-current').textContent = hwView.list.length ? hwView.idx + 1 : 0;
    document.getElementById('hw-total').textContent = hwView.list.length;

    const main = document.getElementById('main-content');
    const bar = document.getElementById('bottom-bar');

    if (hwView.list.length === 0) {
      main.innerHTML = `<div class="hw-empty"><div class="hw-empty-icon">📝</div>该章节暂无手写重点</div>`;
      bar.innerHTML = '';
      return;
    }

    const item = hwView.list[hwView.idx];
    const starred = state.hwStarred[item.id];

    main.innerHTML = `
      <div class="hw-card">
        <div class="hw-header">
          <span class="hw-chapter-tag">${escapeHtml(item.chapter)}</span>
          <span class="hw-section">${escapeHtml(item.section)}</span>
          <span class="hw-num">#${hwView.idx + 1} / ${hwView.list.length}</span>
          ${starred ? '<span class="hw-star">⭐</span>' : ''}
        </div>
        <div class="hw-concept">${escapeHtml(item.concept)}</div>
        <div class="hw-sections">
          <div class="hw-section-row def">
            <div class="hw-section-label">定义</div>
            <div class="hw-section-content">${escapeHtml(item.definition)}</div>
          </div>
          <div class="hw-section-row prin">
            <div class="hw-section-label">原理</div>
            <div class="hw-section-content">${escapeHtml(item.principle)}</div>
          </div>
          <div class="hw-section-row exam">
            <div class="hw-section-label">考法</div>
            <div class="hw-section-content">${escapeHtml(item.exam)}</div>
          </div>
          <div class="hw-section-row ans">
            <div class="hw-section-label">答案</div>
            <div class="hw-section-content">${escapeHtml(item.answer || '本题暂无标准答案')}</div>
          </div>
          <div class="hw-section-row method">
            <div class="hw-section-label">答法</div>
            <div class="hw-section-content">${escapeHtml(item.method || '——')}</div>
          </div>
          <div class="hw-section-row trap">
            <div class="hw-section-label">陷阱</div>
            <div class="hw-section-content">${escapeHtml(item.trap || '——')}</div>
          </div>
        </div>
      </div>
    `;

    bar.innerHTML = `
      <button class="btn" id="hw-prev" ${hwView.idx === 0 ? 'disabled style="opacity:0.4"' : ''}>← 上一条</button>
      <button class="btn btn-primary" id="hw-next">下一条 →</button>
    `;
    document.getElementById('hw-prev').addEventListener('click', hwPrev);
    document.getElementById('hw-next').addEventListener('click', hwNext);

    document.getElementById('hw-mark').textContent = starred ? '★' : '☆';
    document.getElementById('hw-mark').style.color = starred ? 'var(--yellow)' : '';
  }

  function hwNext() {
    if (hwView.idx < hwView.list.length - 1) hwView.idx++;
    else hwView.idx = 0;
    renderHandwritten();
  }

  function hwPrev() {
    if (hwView.idx > 0) hwView.idx--;
    else hwView.idx = 0;
    renderHandwritten();
  }

  // ===== 侧边栏 =====
  const sidebar = document.getElementById('sidebar');
  document.getElementById('side-toggle').addEventListener('click', () => {
    sidebar.classList.add('open');
    renderSidebar();
  });
  document.getElementById('side-close').addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  function renderSidebar() {
    const chapters = ['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '名词解释', '18条重点'];
    const bars = document.getElementById('chapter-bars');
    bars.innerHTML = chapters.map(ch => {
      const all = QUESTIONS.filter(q => q.chapter === ch);
      const answered = all.filter(q => state.answered[q.id]);
      const correct = answered.filter(q => state.correct[q.id] === true).length;
      const rate = answered.length > 0 ? Math.round(correct / answered.length * 100) : 0;
      const fillCls = rate >= 80 ? '' : rate >= 50 ? 'mid' : 'low';
      return `<div class="chapter-bar">
        <span class="chapter-bar-name">${escapeHtml(ch)}</span>
        <span class="chapter-bar-track"><span class="chapter-bar-fill ${fillCls}" style="width:${rate}%"></span></span>
        <span class="chapter-bar-num">${correct}/${answered.length}</span>
      </div>`;
    }).join('');

    const wrongList = document.getElementById('wrong-list');
    const wrongIds = Object.keys(state.correct).filter(k => state.correct[k] === false);
    document.getElementById('wrong-count').textContent = wrongIds.length;
    if (wrongIds.length === 0) {
      wrongList.innerHTML = '<div class="empty-hint">还没有错题 💪</div>';
    } else {
      wrongList.innerHTML = wrongIds.map(id => {
        const q = QUESTIONS.find(x => x.id === id);
        if (!q) return '';
        return `<div class="wrong-item" data-qid="${q.id}">
          <div>${escapeHtml(q.q.slice(0, 60))}${q.q.length > 60 ? '...' : ''}</div>
          <div class="wrong-item-meta">${escapeHtml(q.chapter)} · 答：${escapeHtml(String(q.a).slice(0, 30))}${String(q.a).length > 30 ? '...' : ''}</div>
        </div>`;
      }).join('');
      wrongList.querySelectorAll('.wrong-item').forEach(el => {
        el.addEventListener('click', () => jumpTo(el.dataset.qid));
      });
    }

    const starList = document.getElementById('star-list');
    const starIds = Object.keys(state.starred).filter(k => state.starred[k]);
    document.getElementById('star-count').textContent = starIds.length;
    if (starIds.length === 0) {
      starList.innerHTML = '<div class="empty-hint">标记题目以便重点复习 ⭐</div>';
    } else {
      starList.innerHTML = starIds.map(id => {
        const q = QUESTIONS.find(x => x.id === id);
        if (!q) return '';
        return `<div class="star-item" data-qid="${q.id}">
          <div>${escapeHtml(q.q.slice(0, 60))}${q.q.length > 60 ? '...' : ''}</div>
          <div class="star-item-meta">${escapeHtml(q.chapter)}</div>
        </div>`;
      }).join('');
      starList.querySelectorAll('.star-item').forEach(el => {
        el.addEventListener('click', () => jumpTo(el.dataset.qid));
      });
    }

    const types = ['choice', 'fill', 'flash'];
    const typeStats = document.getElementById('type-stats');
    typeStats.innerHTML = types.map(t => {
      const all = QUESTIONS.filter(q => q.type === t);
      const answered = all.filter(q => state.answered[q.id]);
      const correct = answered.filter(q => state.correct[q.id] === true).length;
      const rate = answered.length > 0 ? Math.round(correct / answered.length * 100) : 0;
      const label = { choice: '选择题', fill: '填空题', flash: '闪卡' }[t];
      const rateCls = rate >= 80 ? 'good' : rate < 50 ? 'bad' : '';
      return `<div class="type-stat">
        <span class="type-stat-label">${label}</span>
        <span class="type-stat-rate ${rateCls}">${correct}/${answered.length} · ${rate}%</span>
      </div>`;
    }).join('');
  }

  function jumpTo(qid) {
    const q = QUESTIONS.find(x => x.id === qid);
    if (!q) return;
    if (view.appMode !== 'practice') switchAppMode('practice');
    if (q.type !== view.mode && view.mode !== 'all') {
      view.mode = 'all';
      document.querySelectorAll('.inner-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === 'all'));
    }
    view.chapter = 'all';
    document.getElementById('chapter-filter').value = 'all';
    view.onlyWrong = false;
    view.onlyStarred = false;
    const wrongBtn = document.getElementById('btn-only-wrong');
    wrongBtn.textContent = '错题';
    wrongBtn.classList.remove('active');
    renderList();
    const idx = view.list.findIndex(x => x.id === qid);
    if (idx >= 0) {
      view.idx = idx;
      view.answered = state.answered[qid] || false;
      if (q.type === 'choice') view.selected = view.answered ? q.ans : null;
      view.flashFlipped = view.answered && q.type === 'flash';
      render();
    }
    sidebar.classList.remove('open');
  }

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('确定要清空所有答题记录和标记吗？此操作不可恢复。')) {
      state.answered = {};
      state.correct = {};
      state.starred = {};
      saveState();
      renderList();
      renderSidebar();
    }
  });

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (view.appMode === 'memorize') {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); memoNext(); }
      else if (e.key === 'ArrowLeft') memoPrev();
      return;
    }
    if (view.appMode === 'handwritten') {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); hwNext(); }
      else if (e.key === 'ArrowLeft') hwPrev();
      return;
    }
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === ' ') {
      e.preventDefault();
      const q = view.list[view.idx];
      if (q && q.type === 'flash' && !view.answered) {
        view.flashFlipped = true;
        render();
      }
    } else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
      if (view.answered) return;
      const q = view.list[view.idx];
      if (q && q.type === 'choice') {
        const idx = parseInt(e.key) - 1;
        if (idx < q.opts.length) { view.selected = idx; render(); }
      }
    }
  });

  function init() {
    initChapterFilter();
    initMemoControls();
    initHandwrittenControls();
    renderList();
  }
  init();
})();
