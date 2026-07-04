// GNSS 考试刷题 - 驾考式（无游戏化）
(function() {
  'use strict';

  const { FLASHCARDS, FILL_BLANK, CHOICES, PPT_CHAPTERS } = window.STUDY_DATA;
  const STORAGE_KEY = 'gnss_practice_v1';

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
    mode: 'all',           // all / choice / fill / flash
    chapter: 'all',
    onlyWrong: false,      // 只看错题
    onlyStarred: false,    // 只看标记
    idx: 0,
    list: [],
    answered: false,
    selected: null,        // choice 选中的 idx
    fillInput: '',
    flashFlipped: false,
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      answered: {},      // {qid: true/false}
      correct: {},       // {qid: true/false}
      starred: {},       // {qid: true}
    };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ===== 题目列表构建 =====
  function buildList() {
    let list = QUESTIONS.slice();
    if (view.mode !== 'all') list = list.filter(q => q.type === view.mode);
    if (view.chapter !== 'all') list = list.filter(q => q.chapter === view.chapter);
    if (view.onlyWrong) {
      list = list.filter(q => state.correct[q.id] === false);
    }
    if (view.onlyStarred) {
      list = list.filter(q => state.starred[q.id]);
    }
    if (view.idx >= list.length) view.idx = 0;
    return list;
  }

  // ===== 章节下拉 =====
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

  // ===== 顶部模式切换 =====
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t === tab));
      view.mode = tab.dataset.mode;
      view.idx = 0;
      view.answered = false;
      view.selected = null;
      view.fillInput = '';
      view.flashFlipped = false;
      renderList();
    });
  });

  // ===== 工具按钮 =====
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
    // 第一次：只看错题；第二次：只看标记；第三次：全部
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

  // ===== 渲染题目 =====
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
    if (q.type === 'choice') {
      qBody = renderChoice(q);
    } else if (q.type === 'fill') {
      qBody = renderFill(q);
    } else {
      qBody = renderFlash(q);
    }

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
    // 同步标记按钮状态
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
    if (view.answered) {
      html += renderChoiceFeedback(q);
    }
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
    if (view.answered) {
      cls += checkFill(userVal, q.a) ? ' correct' : ' wrong';
    }
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
          <div class="flash-face flashcard-front">
            <div class="flash-text">${escapeHtml(q.q)}</div>
            <div class="flash-hint">点击卡片查看答案</div>
          </div>
          <div class="flash-face flashcard-back">
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
      input.addEventListener('input', e => { view.fillInput = e.target.value; });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !view.answered) {
          submitAnswer();
        }
      });
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
          <button class="btn btn-primary" id="btn-submit" disabled>提交答案</button>
          <button class="btn" id="btn-next" disabled style="opacity:0.4">下一题 →</button>
        `;
        document.getElementById('btn-prev').addEventListener('click', prev);
        document.getElementById('btn-submit').addEventListener('click', submitAnswer);
        const submit = document.getElementById('btn-submit');
        if (q.type === 'choice' && view.selected !== null) submit.disabled = false;
        if (q.type === 'fill' && view.fillInput.trim()) submit.disabled = false;
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
      // 列表末：提示并重置 idx
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
      // 恢复选择状态
      const q = view.list[view.idx];
      if (q.type === 'choice') view.selected = state.answered[q.id] ? q.ans : null;
      if (q.type === 'fill') view.fillInput = '';
      if (q.type === 'flash') view.flashFlipped = state.answered[q.id] || false;
      render();
    }
  }

  function checkFill(user, answer) {
    if (!user) return false;
    const candidates = answer.split('|').map(s => s.trim().toLowerCase().replace(/\s+/g, ''));
    const norm = user.toLowerCase().replace(/\s+/g, '');
    return candidates.some(c => c === norm || (c.length >= 2 && norm.includes(c)));
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
    // 章节正确率
    const chapters = ['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '名词解释', '18条重点'];
    const bars = document.getElementById('chapter-bars');
    bars.innerHTML = chapters.map(ch => {
      const all = QUESTIONS.filter(q => q.chapter === ch);
      const total = all.length;
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

    // 错题本
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

    // 标记列表
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

    // 类型统计
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
    // 切换到该题目所在列表的第一个匹配
    const q = QUESTIONS.find(x => x.id === qid);
    if (!q) return;
    // 重置筛选但保留 mode
    if (q.type !== view.mode && view.mode !== 'all') {
      view.mode = 'all';
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === 'all'));
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

  // 重置
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

  // ===== 工具 =====
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ===== 键盘快捷键 =====
  document.addEventListener('keydown', (e) => {
    // 输入框中不触发
    if (e.target.tagName === 'INPUT') return;
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
        if (idx < q.opts.length) {
          view.selected = idx;
          render();
        }
      }
    }
  });

  // ===== 启动 =====
  function init() {
    initChapterFilter();
    renderList();
  }
  init();
})();
