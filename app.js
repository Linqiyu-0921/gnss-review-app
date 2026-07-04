// GNSS 考试复习大冒险 - 多邻国风格
(function() {
  'use strict';

  const { FLASHCARDS, FILL_BLANK, CHOICES, PPT_CHAPTERS } = window.STUDY_DATA;
  const STORAGE_KEY = 'gnss_duolingo_v2';

  // ===== 单元和关卡构建 =====
  const UNIT_COLORS = ['', 'unit-blue', 'unit-purple', 'unit-orange', 'unit-teal', 'unit-pink', 'unit-yellow', 'unit-red', 'unit-blue', 'unit-purple'];
  const UNIT_EMOJI = ['🛰️', '🌐', '🪐', '📡', '🎯', '⚠️', '📐', '🧮', '📖', '⭐'];

  const UNITS = buildUnits();

  function buildUnits() {
    // 按章节分组
    const byChapter = { '第一章': [], '第二章': [], '第三章': [], '第四章': [], '第五章': [], '第六章': [], '第七章': [], '第八章': [], '名词解释': [], '18条重点': [] };
    FLASHCARDS.forEach(f => { if (byChapter[f.chapter]) byChapter[f.chapter].push(f); });
    FILL_BLANK.forEach(f => { if (byChapter[f.chapter]) byChapter[f.chapter].push({ ...f, type: 'fill' }); });
    CHOICES.forEach(f => { if (byChapter[f.chapter]) byChapter[f.chapter].push({ ...f, type: 'choice' }); });

    const chapterOrder = ['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '名词解释', '18条重点'];
    const titles = {
      '第一章': '绪论 · GPS基础',
      '第二章': '坐标系与时间',
      '第三章': '卫星运动与星历',
      '第四章': '卫星信号',
      '第五章': '定位原理',
      '第六章': '误差来源与减弱',
      '第七章': '控制测量',
      '第八章': '数据处理',
      '名词解释': '重点名词',
      '18条重点': '18条重点'
    };

    return chapterOrder.map((ch, i) => {
      const items = byChapter[ch] || [];
      // 把每个条目归一为 question
      const allQuestions = items.map(it => normalizeQuestion(it)).filter(Boolean);
      // 打乱
      shuffle(allQuestions);
      // 每关 5 题
      const lessons = [];
      for (let k = 0; k < allQuestions.length; k += 5) {
        lessons.push({
          id: `u${i+1}l${lessons.length+1}`,
          title: `第 ${lessons.length+1} 关`,
          emoji: ['🎯','📚','⭐','🔥','💎','🏆','🎓','🚀','⚡','🌟'][lessons.length % 10],
          questions: allQuestions.slice(k, k + 5)
        });
      }
      if (lessons.length === 0) {
        lessons.push({ id: `u${i+1}l1`, title: '第 1 关', emoji: '🎯', questions: [] });
      }
      return {
        id: `u${i+1}`,
        title: ch,
        subtitle: titles[ch] || '',
        color: UNIT_COLORS[i % UNIT_COLORS.length],
        emoji: UNIT_EMOJI[i % UNIT_EMOJI.length],
        lessons
      };
    });
  }

  function normalizeQuestion(it) {
    if (it.q && it.a) {
      return { id: it.id, type: 'flash', chapter: it.chapter, q: it.q, a: it.a };
    }
    if (it.text && it.answer) {
      return { id: it.id, type: 'fill', chapter: it.chapter, q: it.text, a: it.answer };
    }
    if (it.q && it.opts) {
      return { id: it.id, type: 'choice', chapter: it.chapter, q: it.q, a: it.opts[it.ans], opts: it.opts, ans: it.ans, explain: it.explain || '' };
    }
    return null;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ===== 成就定义 =====
  const ACHIEVEMENTS = [
    { id: 'first_lesson', emoji: '🎯', name: '初出茅庐', desc: '完成第一节课', req: s => s.lessonsCompleted.length >= 1 },
    { id: 'ten_lessons', emoji: '🔥', name: '学习达人', desc: '完成10节课', req: s => s.lessonsCompleted.length >= 10 },
    { id: 'combo_5', emoji: '⚡', name: '连击大师', desc: '单节课连击5次', req: s => s.maxCombo >= 5 },
    { id: 'combo_10', emoji: '💫', name: '全对王者', desc: '单节课连击10次', req: s => s.maxCombo >= 10 },
    { id: 'perfect', emoji: '💯', name: '完美通关', desc: '一节课全对', req: s => s.perfectRuns >= 1 },
    { id: 'streak_3', emoji: '📅', name: '坚持三天', desc: '连续学习3天', req: s => s.streak >= 3 },
    { id: 'xp_100', emoji: '⭐', name: '初露锋芒', desc: '获得100经验', req: s => s.totalXp >= 100 },
    { id: 'xp_500', emoji: '🌟', name: '学富五车', desc: '获得500经验', req: s => s.totalXp >= 500 },
  ];

  // ===== 状态 =====
  const defaultState = {
    hearts: 5,
    maxHearts: 5,
    gems: 100,
    totalXp: 0,
    streak: 0,
    lastStudyDate: null,
    lessonsCompleted: [],
    unitsCompleted: [],
    wrongQuestions: [],
    achievements: [],
    maxCombo: 0,
    perfectRuns: 0,
  };

  let state = loadState();

  const lessonState = {
    active: false,
    lessonId: null,
    unitId: null,
    questions: [],
    qIdx: 0,
    correct: 0,
    wrong: 0,
    combo: 0,
    sessionXp: 0,
    selectedChoice: null,
    fillAnswer: '',
    flashFlipped: false,
    answered: false,
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign({}, defaultState, parsed);
      }
    } catch (e) {}
    return Object.assign({}, defaultState);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // ===== 顶部状态栏 =====
  function renderTopbar() {
    document.getElementById('hearts-display').textContent = state.hearts;
    document.getElementById('streak-display').textContent = state.streak;
    document.getElementById('xp-display').textContent = state.totalXp;
    document.getElementById('gems-display').textContent = state.gems;
  }

  // ===== 页面切换 =====
  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
    if (name === 'learn') renderPath();
    if (name === 'profile') renderProfile();
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // ===== 学习路径 =====
  function renderPath() {
    const container = document.getElementById('path-container');
    container.innerHTML = '';

    UNITS.forEach((unit, ui) => {
      // 单元标题
      const header = document.createElement('div');
      header.className = 'unit-header';
      header.innerHTML = `<div class="unit-banner ${unit.color}"><div class="unit-title">${unit.title}</div><div class="unit-subtitle">${unit.subtitle}</div></div>`;
      container.appendChild(header);

      // 关卡节点
      unit.lessons.forEach((lesson, li) => {
        // 连线
        if (li > 0 || (li === 0 && ui > 0)) {
          const line = document.createElement('div');
          line.className = 'path-line';
          if (isLessonCompleted(lesson.id)) line.classList.add('completed');
          container.appendChild(line);
        }

        const node = document.createElement('div');
        const isFirstOfUnit = li === 0;
        node.className = 'lesson-node' + (isFirstOfUnit ? ' start' : '');

        // 状态：completed / current / locked
        const completed = isLessonCompleted(lesson.id);
        const prevCompleted = isFirstOfUnit ? true : isLessonCompleted(unit.lessons[li-1].id);
        const prevUnitCompleted = ui === 0 ? true : isUnitCompleted(UNITS[ui-1].id);

        let state_class = '';
        if (completed) state_class = 'completed';
        else if (prevCompleted && prevUnitCompleted) state_class = 'current';
        else state_class = 'locked';

        node.innerHTML = `<div class="node-circle ${state_class}">${completed ? '⭐' : (state_class === 'current' ? unit.emoji : '🔒')}</div><div class="node-label">${lesson.title} · ${lesson.questions.length}题</div>`;

        if (state_class !== 'locked') {
          node.addEventListener('click', () => startLesson(unit.id, lesson.id));
        } else {
          node.style.opacity = '0.5';
          node.style.cursor = 'not-allowed';
        }
        container.appendChild(node);

        // 最后一关之后加皇冠
        if (li === unit.lessons.length - 1) {
          const line = document.createElement('div');
          line.className = 'path-line' + (isUnitCompleted(unit.id) ? ' completed' : '');
          container.appendChild(line);

          const crown = document.createElement('div');
          crown.className = 'lesson-node start';
          const allUnitDone = isUnitCompleted(unit.id);
          crown.innerHTML = `<div class="crown-node ${allUnitDone ? 'completed' : ''}">${allUnitDone ? '👑' : '🏆'}</div><div class="node-label">完成单元</div>`;
          container.appendChild(crown);
        }
      });
    });
  }

  function isLessonCompleted(lessonId) {
    return state.lessonsCompleted.includes(lessonId);
  }
  function isUnitCompleted(unitId) {
    const unit = UNITS.find(u => u.id === unitId);
    if (!unit) return false;
    return unit.lessons.every(l => isLessonCompleted(l.id));
  }

  // ===== 课程开始 =====
  function startLesson(unitId, lessonId) {
    const unit = UNITS.find(u => u.id === unitId);
    const lesson = unit.lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    // 检查前一关
    const li = unit.lessons.findIndex(l => l.id === lessonId);
    if (li > 0 && !isLessonCompleted(unit.lessons[li-1].id)) {
      alert('请先完成上一关卡');
      return;
    }
    if (li === 0) {
      const ui = UNITS.findIndex(u => u.id === unitId);
      if (ui > 0 && !isUnitCompleted(UNITS[ui-1].id)) {
        alert('请先完成上一单元');
        return;
      }
    }

    Object.assign(lessonState, {
      active: true,
      unitId,
      lessonId,
      questions: lesson.questions.slice(),
      qIdx: 0,
      correct: 0,
      wrong: 0,
      combo: 0,
      sessionXp: 0,
      selectedChoice: null,
      fillAnswer: '',
      flashFlipped: false,
      answered: false,
    });
    // 题目内打乱
    shuffle(lessonState.questions);
    showPage('lesson');
    document.getElementById('lesson-hearts').textContent = state.hearts;
    renderQuestion();
  }

  document.getElementById('btn-close-lesson').addEventListener('click', () => {
    if (confirm('确定退出本次练习？进度不保存。')) {
      lessonState.active = false;
      showPage('learn');
    }
  });

  // ===== 题目渲染 =====
  function renderQuestion() {
    const q = lessonState.questions[lessonState.qIdx];
    if (!q) { finishLesson(); return; }

    // 进度
    const progress = (lessonState.qIdx / lessonState.questions.length) * 100;
    document.getElementById('lesson-progress-fill').style.width = progress + '%';

    const qa = document.getElementById('question-area');
    const fa = document.getElementById('feedback-area');
    const checkBar = document.getElementById('check-bar');
    const continueBar = document.getElementById('continue-bar');
    fa.style.display = 'none';
    checkBar.style.display = 'block';
    continueBar.style.display = 'none';
    fa.className = 'feedback-area';

    lessonState.answered = false;
    lessonState.selectedChoice = null;
    lessonState.fillAnswer = '';
    lessonState.flashFlipped = false;

    const typeLabels = { flash: '翻 译', choice: '选择题', fill: '填空题' };

    if (q.type === 'flash') {
      qa.innerHTML = `
        <div class="question-chapter">${q.chapter}</div>
        <div class="question-type-label">翻 译</div>
        <div class="flashcard-big" id="flashcard-big">
          <div class="flashcard-inner">
            <div class="flashcard-face flashcard-front">
              <div style="font-size:48px;margin-bottom:12px">❓</div>
              <div class="question-text">${escapeHtml(q.q)}</div>
              <div class="flashcard-hint">点击查看答案</div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div style="font-size:48px;margin-bottom:12px">✅</div>
              <div class="flashcard-answer-text">${escapeHtml(q.a)}</div>
            </div>
          </div>
        </div>
        <div class="flash-judge-btns" id="flash-judge-btns">
          <button class="judge-btn again" data-judge="again">😕 忘了</button>
          <button class="judge-btn hard" data-judge="hard">🤔 困难</button>
          <button class="judge-btn good" data-judge="good">😊 良好</button>
          <button class="judge-btn easy" data-judge="easy">😎 简单</button>
        </div>
      `;
      const fc = document.getElementById('flashcard-big');
      fc.addEventListener('click', () => {
        if (lessonState.flashFlipped) return;
        lessonState.flashFlipped = true;
        fc.classList.add('flipped');
      });
      document.querySelectorAll('#flash-judge-btns .judge-btn').forEach(b => {
        b.addEventListener('click', () => handleFlashJudge(b.dataset.judge));
      });
      // 闪卡不显示底部检查按钮
      checkBar.style.display = 'none';
    } else if (q.type === 'choice') {
      qa.innerHTML = `
        <div class="question-chapter">${q.chapter}</div>
        <div class="question-type-label">选择题</div>
        <div class="question-text">${escapeHtml(q.q)}</div>
        <div class="options-grid" id="options-grid">
          ${q.opts.map((o, i) => `<button class="option-btn" data-idx="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(o)}</span></button>`).join('')}
        </div>
      `;
      document.querySelectorAll('#options-grid .option-btn').forEach(btn => {
        btn.addEventListener('click', () => handleChoiceSelect(parseInt(btn.dataset.idx)));
      });
    } else if (q.type === 'fill') {
      qa.innerHTML = `
        <div class="question-chapter">${q.chapter}</div>
        <div class="question-type-label">填空题</div>
        <div class="fill-blank-text">${escapeHtml(q.q)}</div>
        <div class="fill-input-area">
          <input type="text" class="fill-input" id="fill-input" placeholder="输入答案..." autocomplete="off" />
        </div>
      `;
      const input = document.getElementById('fill-input');
      input.addEventListener('input', e => { lessonState.fillAnswer = e.target.value; updateCheckBtn(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !document.getElementById('btn-check').disabled) {
          handleCheck();
        }
      });
      setTimeout(() => input.focus(), 100);
    }
  }

  function updateCheckBtn() {
    const btn = document.getElementById('btn-check');
    if (!btn) return;
    const q = lessonState.questions[lessonState.qIdx];
    if (!q) return;
    if (q.type === 'choice') {
      btn.disabled = lessonState.selectedChoice === null;
    } else if (q.type === 'fill') {
      btn.disabled = !lessonState.fillAnswer.trim();
    } else {
      btn.disabled = true;
    }
    btn.classList.toggle('active', !btn.disabled);
  }

  // ===== 闪卡判定 =====
  function handleFlashJudge(judge) {
    const correct = judge === 'good' || judge === 'easy';
    const partial = judge === 'hard';
    lessonState.answered = true;
    let xp = 0;
    if (correct) {
      xp = judge === 'easy' ? 12 : 8;
      lessonState.correct++;
      lessonState.combo++;
      state.hearts = Math.min(state.maxHearts, state.hearts + (judge === 'easy' ? 0 : 0));
    } else if (partial) {
      xp = 3;
      lessonState.combo = 0;
      state.hearts = Math.max(0, state.hearts - 0);
    } else {
      xp = 0;
      lessonState.wrong++;
      lessonState.combo = 0;
      state.hearts = Math.max(0, state.hearts - 1);
    }
    state.maxCombo = Math.max(state.maxCombo, lessonState.combo);
    state.totalXp += xp;
    lessonState.sessionXp += xp;
    if (state.gems < 9999 && correct) state.gems = Math.min(9999, state.gems + 1);
    saveState();
    renderTopbar();

    // 反馈
    const fa = document.getElementById('feedback-area');
    fa.style.display = 'block';
    fa.className = 'feedback-area ' + (correct ? 'correct' : (partial ? 'correct' : 'wrong'));
    document.getElementById('feedback-emoji').textContent = correct ? '🎉' : (partial ? '🤔' : '😢');
    document.getElementById('feedback-title').textContent = correct ? '完美！' : (partial ? '继续努力' : '记一记，下次会更好');
    document.getElementById('feedback-detail').innerHTML = `<strong>参考答案：</strong>${escapeHtml(lessonState.questions[lessonState.qIdx].a)}`;

    // 显示连击
    if (lessonState.combo >= 3) {
      document.getElementById('feedback-detail').innerHTML += `\n\n🔥 连击 x${lessonState.combo}!`;
    }

    // 错题
    if (!correct && !state.wrongQuestions.find(w => w.id === lessonState.questions[lessonState.qIdx].id)) {
      state.wrongQuestions.push({ id: lessonState.questions[lessonState.qIdx].id, type: 'flash', q: lessonState.questions[lessonState.qIdx].q, a: lessonState.questions[lessonState.qIdx].a, chapter: lessonState.questions[lessonState.qIdx].chapter });
      saveState();
    }

    // 飘动奖励
    spawnFloatingReward(xp);

    // 继续按钮
    document.getElementById('check-bar').style.display = 'none';
    const continueBar = document.getElementById('continue-bar');
    continueBar.style.display = 'block';
    continueBar.className = 'continue-bar' + (correct ? '' : ' wrong');

    if (state.hearts === 0) {
      setTimeout(() => showGameover(), 1000);
    }
  }

  // ===== 选择题选择 =====
  function handleChoiceSelect(idx) {
    if (lessonState.answered) return;
    lessonState.selectedChoice = idx;
    document.querySelectorAll('#options-grid .option-btn').forEach((b, i) => {
      b.classList.toggle('selected', i === idx);
    });
    updateCheckBtn();
  }

  // ===== 检查答案 =====
  document.getElementById('btn-check').addEventListener('click', handleCheck);
  function handleCheck() {
    if (lessonState.answered) return;
    const q = lessonState.questions[lessonState.qIdx];
    if (!q) return;

    let correct = false;
    if (q.type === 'choice') {
      correct = lessonState.selectedChoice === q.ans;
      // 显示反馈
      document.querySelectorAll('#options-grid .option-btn').forEach((b, i) => {
        b.disabled = true;
        if (i === q.ans) b.classList.add('correct');
        else if (i === lessonState.selectedChoice && !correct) b.classList.add('wrong');
      });
    } else if (q.type === 'fill') {
      correct = checkFill(lessonState.fillAnswer, q.a);
      const input = document.getElementById('fill-input');
      input.disabled = true;
      input.classList.add(correct ? 'correct' : 'wrong');
    }
    lessonState.answered = true;

    let xp = 0;
    if (correct) {
      xp = 10;
      lessonState.correct++;
      lessonState.combo++;
    } else {
      xp = 0;
      lessonState.wrong++;
      lessonState.combo = 0;
      state.hearts = Math.max(0, state.hearts - 1);
    }
    state.maxCombo = Math.max(state.maxCombo, lessonState.combo);
    state.totalXp += xp;
    lessonState.sessionXp += xp;
    if (correct) state.gems = Math.min(9999, state.gems + 2);
    saveState();
    renderTopbar();

    // 反馈
    const fa = document.getElementById('feedback-area');
    fa.style.display = 'block';
    fa.className = 'feedback-area ' + (correct ? 'correct' : 'wrong');
    document.getElementById('feedback-emoji').textContent = correct ? '🎉' : '😢';
    document.getElementById('feedback-title').textContent = correct ? '答对了！' : '再接再厉';
    let detail = '';
    if (q.type === 'choice') {
      detail = `<strong>正确答案：</strong>${String.fromCharCode(65 + q.ans)}. ${escapeHtml(q.opts[q.ans])}`;
      if (q.explain) detail += `\n\n💡 ${escapeHtml(q.explain)}`;
    } else if (q.type === 'fill') {
      detail = `<strong>参考答案：</strong>${escapeHtml(q.a)}`;
      if (!correct) detail += `\n\n你的答案：${escapeHtml(lessonState.fillAnswer || '（空）')}`;
    }
    if (lessonState.combo >= 3) {
      detail += `\n\n🔥 连击 x${lessonState.combo}!`;
    }
    document.getElementById('feedback-detail').innerHTML = detail;

    // 错题
    if (!correct && !state.wrongQuestions.find(w => w.id === q.id)) {
      state.wrongQuestions.push({ id: q.id, type: q.type, q: q.q, a: q.a, chapter: q.chapter, opts: q.opts, ans: q.ans, explain: q.explain });
      saveState();
    }

    spawnFloatingReward(xp);

    document.getElementById('check-bar').style.display = 'none';
    const continueBar = document.getElementById('continue-bar');
    continueBar.style.display = 'block';
    continueBar.className = 'continue-bar' + (correct ? '' : ' wrong');

    if (state.hearts === 0) {
      setTimeout(() => showGameover(), 1000);
    }
  }

  function checkFill(user, answer) {
    if (!user) return false;
    const candidates = answer.split('|').map(s => s.trim().toLowerCase().replace(/\s+/g, ''));
    const norm = user.toLowerCase().replace(/\s+/g, '');
    return candidates.some(c => c === norm || (c.length >= 2 && norm.includes(c)));
  }

  // ===== 继续 =====
  document.getElementById('btn-continue').addEventListener('click', () => {
    lessonState.qIdx++;
    if (lessonState.qIdx >= lessonState.questions.length) {
      finishLesson();
    } else {
      renderQuestion();
    }
  });

  // ===== 完成课程 =====
  function finishLesson() {
    const accuracy = lessonState.questions.length > 0 ? Math.round(lessonState.correct / lessonState.questions.length * 100) : 0;
    const perfect = lessonState.correct === lessonState.questions.length && lessonState.questions.length > 0;

    // 标记完成
    if (!state.lessonsCompleted.includes(lessonState.lessonId)) {
      state.lessonsCompleted.push(lessonState.lessonId);
    }
    if (perfect) state.perfectRuns++;
    state.perfectRuns = state.perfectRuns || 0;

    // 连续天数
    const today = new Date().toDateString();
    if (state.lastStudyDate !== today) {
      const last = state.lastStudyDate ? new Date(state.lastStudyDate) : null;
      if (last) {
        const diff = (new Date(today) - last) / (1000 * 60 * 60 * 24);
        if (diff <= 1.5) state.streak++;
        else state.streak = 1;
      } else {
        state.streak = 1;
      }
      state.lastStudyDate = today;
    }

    saveState();
    renderTopbar();

    // 奖励
    document.getElementById('reward-xp').textContent = '+' + lessonState.sessionXp;
    document.getElementById('reward-accuracy').textContent = accuracy + '%';
    const combo = document.getElementById('combo-display');
    if (lessonState.combo >= 3) {
      combo.style.display = 'inline-flex';
      document.getElementById('combo-text').textContent = '连击 x' + lessonState.combo + '!';
    } else {
      combo.style.display = 'none';
    }
    showPage('complete');
  }

  document.getElementById('btn-continue-home').addEventListener('click', () => {
    showPage('learn');
  });

  // ===== 游戏结束 =====
  function showGameover() {
    document.getElementById('go-xp').textContent = lessonState.sessionXp + ' XP';
    showPage('gameover');
  }
  document.getElementById('btn-retry').addEventListener('click', () => {
    state.hearts = state.maxHearts;
    saveState();
    renderTopbar();
    startLesson(lessonState.unitId, lessonState.lessonId);
  });

  // ===== 个人资料页 =====
  function renderProfile() {
    document.getElementById('total-xp').textContent = state.totalXp;
    document.getElementById('total-streak').textContent = state.streak;
    document.getElementById('lessons-done').textContent = state.lessonsCompleted.length;

    // 成就
    const ag = document.getElementById('achievements-grid');
    ag.innerHTML = ACHIEVEMENTS.map(a => {
      const unlocked = a.req(state);
      return `<div class="achievement-item ${unlocked ? '' : 'locked'}"><div class="achievement-emoji">${a.emoji}</div><div class="achievement-name">${a.name}</div></div>`;
    }).join('');

    // 章节进度
    const cpl = document.getElementById('chapter-progress-list');
    cpl.innerHTML = UNITS.map(u => {
      const total = u.lessons.length;
      const done = u.lessons.filter(l => isLessonCompleted(l.id)).length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      return `<div class="chapter-progress-item">
        <div class="chapter-progress-top">
          <span class="chapter-progress-name">${u.emoji} ${u.title} · ${u.subtitle}</span>
          <span class="chapter-progress-num">${done}/${total}</span>
        </div>
        <div class="chapter-progress-bar"><div class="chapter-progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');

    // PPT 网格
    const pg = document.getElementById('ppt-grid');
    pg.innerHTML = PPT_CHAPTERS.map(p => `
      <a class="ppt-card" href="${encodeURIComponent(p.file)}" target="_blank">
        <div class="ppt-emoji">📑</div>
        <div class="ppt-name">${p.title}</div>
        <div class="ppt-key">${p.must}</div>
      </a>
    `).join('');

    // 错题
    const wb = document.getElementById('wrong-book');
    if (state.wrongQuestions.length === 0) {
      wb.innerHTML = '<div class="wrong-empty">还没有错题，继续保持 💪</div>';
    } else {
      wb.innerHTML = state.wrongQuestions.slice(-30).map(w => {
        let ans = '';
        if (w.type === 'choice') ans = `${String.fromCharCode(65 + (w.ans || 0))}. ${w.opts ? w.opts[w.ans || 0] : ''}`;
        else ans = w.a || '';
        return `<div class="wrong-item">
          <div class="wrong-q">${escapeHtml(w.q)}</div>
          <div class="wrong-a">答：${escapeHtml(ans)}</div>
          <div class="wrong-meta">${w.chapter || ''}</div>
        </div>`;
      }).join('');
    }
  }

  document.getElementById('reset-progress').addEventListener('click', () => {
    if (confirm('确定要重置所有进度吗？此操作不可恢复。')) {
      state = Object.assign({}, defaultState);
      saveState();
      renderTopbar();
      renderProfile();
      renderPath();
    }
  });

  // ===== 飘动奖励 =====
  function spawnFloatingReward(amount) {
    if (amount <= 0) return;
    const el = document.createElement('div');
    el.className = 'floating-reward';
    el.style.color = amount >= 10 ? 'var(--green-dark)' : 'var(--text-gray)';
    el.style.left = '50%';
    el.style.top = '40%';
    el.style.transform = 'translateX(-50%)';
    el.textContent = '+' + amount + ' XP';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ===== 工具 =====
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ===== 启动 =====
  function init() {
    renderTopbar();
    showPage('learn');
  }
  init();
})();
