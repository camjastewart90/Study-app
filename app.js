/* Study App: notes + knowledge tests, progress kept on this device. */
(function () {
  'use strict';

  const STORE_KEY = 'studyapp.v1';
  const MASTER_BOX = 3; // a question counts as mastered after 3 correct answers in a row
  const app = document.getElementById('app');
  const titleEl = document.getElementById('title');
  const backBtn = document.getElementById('back');

  let courses = [];       // [{id, title, subtitle, groups, topics}]
  const topicIndex = {};  // "course/topic" -> {course, topic, idx}
  let quiz = null;        // active quiz session

  /* ---------- storage ---------- */

  function emptyState() { return { v: 1, q: {}, sessions: [] }; }
  let state = emptyState();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) state = Object.assign(emptyState(), JSON.parse(raw));
    } catch (e) { state = emptyState(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }
  function qstat(key) { return state.q[key] || { box: 0, right: 0, wrong: 0, last: 0 }; }

  /* ---------- helpers ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = (s) => window.marked ? marked.parseInline(String(s)) : esc(s);
  const qkey = (course, q) => course.id + '/' + q.id;
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (n) => Math.round(n * 100);
  const stripNum = (q) => q.replace(/^Q\d+[a-z]?\.\s*/i, '');
  const bankNum = (q) => { const m = q.match(/^Q(\d+[a-z]?)\./i); return m ? m[1] : null; };
  const starify = (html) => html.replace(/⭐\s*PREVIOUS EXAM/g, '<span class="star">⭐ Previous exam</span>');

  function ring(p, big) {
    return `<div class="ring${big ? ' big' : ''}" style="--p:${p}"><span>${p}%</span></div>`;
  }

  // Half-circle progress gauge (FRV reds) with a flame marker, like the reference design's hero arc.
  function gauge(p) {
    const a = Math.PI - (Math.PI * Math.max(0, Math.min(100, p))) / 100;
    const x = 150 + 130 * Math.cos(a), y = 150 - 130 * Math.sin(a);
    return `<svg class="gauge" viewBox="0 0 300 160" aria-hidden="true">
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#8a0b1f"/><stop offset=".6" stop-color="#c8102e"/><stop offset="1" stop-color="#e63946"/></linearGradient></defs>
      <path class="track" d="M20 150 A130 130 0 0 1 280 150" fill="none" stroke-width="5" stroke-dasharray="1.5 6" stroke-linecap="round"/>
      ${p > 0 ? `<path d="M20 150 A130 130 0 0 1 280 150" fill="none" stroke="url(#gg)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="${p} 100"/>` : ''}
      <g class="flame" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="15" fill="#c8102e"/>
        <path d="M0.5 -9.5c1.2 3.1 5.6 5.6 5.6 10.3a6.1 6.1 0 0 1 -12.2 0c0 -2.6 1.3 -4.2 2.6 -5.5c0.2 2 1.1 3.2 2.3 3.6c-0.5 -3.3 0.3 -6 1.7 -8.4z" fill="#fff"/>
        <path d="M0.2 -0.8c1.2 1.6 2.6 2.6 2.6 4.4a2.8 2.8 0 0 1 -5.6 0c0 -1.4 0.9 -2.3 1.7 -3c0.1 0.9 0.5 1.4 1.1 1.6c-0.1 -1.1 0 -2 0.2 -3z" fill="#c8102e"/>
      </g>
    </svg>`;
  }

  // Consecutive days (ending today or yesterday) with at least one finished test.
  function streakDays() {
    const days = new Set(state.sessions.map((s) => new Date(s.at).toDateString()));
    const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function courseStats(course) {
    const qs = course.topics.flatMap((t) => t.questions);
    const stats = qs.map((q) => qstat(qkey(course, q)));
    return {
      qs,
      pct: qs.length ? pct(stats.reduce((s, x) => s + Math.min(x.box, MASTER_BOX) / MASTER_BOX, 0) / qs.length) : 0,
      mastered: stats.filter((x) => x.box >= MASTER_BOX).length,
      seen: stats.filter((x) => x.right + x.wrong > 0).length,
    };
  }

  const chevron = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const shuffleIcon = '<svg viewBox="0 0 24 24"><path d="M4 7h3.5c2 0 3.2 1 4.3 2.7l1.4 2.2c1.1 1.8 2.3 2.8 4.3 2.8H20M4 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4c.8-.9 1.8-1.4 3.2-1.4H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sparkle = '<svg viewBox="0 0 24 24"><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" fill="currentColor"/></svg>';

  function topicMastery(course, topic) {
    const qs = topic.questions;
    if (!qs.length) return { pct: 0, mastered: 0, seen: 0, total: 0 };
    let sum = 0, mastered = 0, seen = 0;
    qs.forEach((q) => {
      const s = qstat(qkey(course, q));
      sum += Math.min(s.box, MASTER_BOX) / MASTER_BOX;
      if (s.box >= MASTER_BOX) mastered++;
      if (s.right + s.wrong > 0) seen++;
    });
    return { pct: pct(sum / qs.length), mastered, seen, total: qs.length };
  }

  function lastSession(scopeKey) {
    for (let i = state.sessions.length - 1; i >= 0; i--) if (state.sessions[i].scope === scopeKey) return state.sessions[i];
    return null;
  }

  function answerHTML(a) {
    if (Array.isArray(a)) return '<ul>' + a.map((x) => {
      const depth = (String(x).match(/^\s*/)[0].length / 2) | 0; // sub-points are indented by 2 spaces
      return `<li${depth ? ` class="sub" style="margin-left:${depth * 16}px"` : ''}>${inline(String(x).trim())}</li>`;
    }).join('') + '</ul>';
    return `<div>${inline(a)}</div>`;
  }

  function setChrome(title, back, tab) {
    titleEl.textContent = title || '';
    titleEl.classList.remove('brand');
    document.title = title && title !== 'SO STUDY GUIDE' ? title + ' · SO Study Guide' : 'SO Study Guide';
    backBtn.hidden = !back;
    backBtn.onclick = back ? () => { location.hash = back; } : null;
    document.querySelectorAll('.dock [data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  }

  /* ---------- views ---------- */

  function viewHome(focusSearch) {
    setChrome('SO STUDY GUIDE', null, focusSearch ? 'search' : 'home');
    titleEl.classList.add('brand');
    const course = courses[0];
    const cs = courseStats(course);
    const streak = streakDays();
    const priority = cs.qs.filter((q) => q.priority).length;
    const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    let lastRef = null;
    try { lastRef = topicIndex[localStorage.getItem('studyapp.lastTopic')]; } catch (e) {}

    let html = `<section class="greet"><p>${cs.seen ? 'Welcome back!' : 'Welcome!'}</p><h2>${esc(today)}</h2></section>
      <section class="gauge-hero">${gauge(cs.pct)}
        <p class="gauge-val">${cs.pct}%</p>
        <p class="gauge-cap">Overall mastery · ${cs.mastered} of ${cs.qs.length} questions mastered</p>
        ${streak ? `<div class="streak">🔥 ${streak}-day streak</div><br>` : ''}
        <div class="hero-actions">
          <a class="pill-btn" href="#/start">${sparkle}<span>${cs.seen ? 'Keep learning' : 'Start learning'}</span></a>
          <a class="pill-btn ghost" href="#/random">${shuffleIcon}<span>Random topic</span></a>
        </div>
      </section>
      <div class="tiles">
        <a class="card tile warm" href="#/quiz/all"><span class="label">Question bank</span><span class="big">${cs.qs.length} Questions</span>
          <span class="foot"><span>⭐ ${priority} priority</span><span>${cs.seen} seen</span></span></a>
        <a class="card tile" href="#/progress"><span class="bubble"><svg viewBox="0 0 24 24"><path d="M4 6.5h6l2 2h8v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
          <span class="big">${course.topicOrder.length} Topics</span>
          <span class="foot"><span>${course.groups.length} sections</span><span>${cs.mastered} mastered</span></span></a>
      </div>`;
    if (lastRef) {
      const m = topicMastery(lastRef.course, lastRef.topic);
      html += `<a class="card continue" href="#/t/${lastRef.course.id}/${lastRef.topic.id}"><div>
        <div class="k">✦ Continue where you left off</div><div class="v">${esc(lastRef.topic.title)}</div></div>${ring(m.pct)}</a>`;
    }
    html += `<input class="search" id="search" type="search" placeholder="Search notes and questions" autocomplete="off">
      <div id="results"></div><div id="lists">`;
    course.groups.forEach((g) => {
      html += `<div class="group-title"><span class="dot"></span>${esc(g.title)}</div><div class="topic-list">`;
      g.topics.forEach((tid) => {
        const t = course.topics.find((x) => x.id === tid);
        if (!t) return;
        const m = topicMastery(course, t);
        html += `<a class="card topic" href="#/t/${course.id}/${t.id}">${ring(m.pct)}
          <div class="t-main"><div class="t-title">${esc(t.title)}</div>
          <div class="t-sub">${t.questions.length} questions · ${m.mastered} mastered</div></div>${chevron}</a>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
    app.innerHTML = html;

    const input = document.getElementById('search');
    const results = document.getElementById('results');
    const lists = document.getElementById('lists');
    let saved = '';
    try { saved = sessionStorage.getItem('studyapp.search') || ''; } catch (e) {}
    input.value = saved;
    const run = () => {
      const term = input.value.trim().toLowerCase();
      try { sessionStorage.setItem('studyapp.search', input.value); } catch (e) {}
      if (term.length < 2) { results.innerHTML = ''; lists.hidden = false; return; }
      lists.hidden = true;
      let out = '';
      courses.forEach((course) => course.topics.forEach((t) => {
        const noteHits = t.notes.filter((n) => n.markdown.toLowerCase().includes(term)).length;
        const qHits = t.questions.filter((q) => (q.q + ' ' + [].concat(q.a).join(' ')).toLowerCase().includes(term)).length;
        const titleHit = t.title.toLowerCase().includes(term);
        if (!noteHits && !qHits && !titleHit) return;
        out += `<a class="card topic" href="#/t/${course.id}/${t.id}?q=${encodeURIComponent(term)}">
          <div class="t-main"><div class="t-title">${esc(t.title)}</div>
          <div class="t-sub">${noteHits} note page${noteHits === 1 ? '' : 's'} · ${qHits} question${qHits === 1 ? '' : 's'}</div></div></a>`;
      }));
      results.innerHTML = out ? `<div class="topic-list">${out}</div>` : `<p class="muted center pad">No matches for “${esc(input.value)}”.</p>`;
    };
    input.addEventListener('input', run);
    run();
    if (focusSearch) { input.scrollIntoView({ block: 'start' }); input.focus({ preventScroll: true }); }
  }

  function highlight(root, term) {
    if (!term) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.toLowerCase().includes(term)) hits.push(walker.currentNode);
    hits.forEach((node) => {
      const frag = document.createDocumentFragment();
      const text = node.nodeValue; const lower = text.toLowerCase();
      let i = 0, j;
      while ((j = lower.indexOf(term, i)) !== -1) {
        frag.appendChild(document.createTextNode(text.slice(i, j)));
        const mark = document.createElement('mark'); mark.textContent = text.slice(j, j + term.length);
        frag.appendChild(mark); i = j + term.length;
      }
      frag.appendChild(document.createTextNode(text.slice(i)));
      node.parentNode.replaceChild(frag, node);
    });
    const first = root.querySelector('mark');
    if (first) first.scrollIntoView({ block: 'center' });
  }

  function viewTopic(courseId, topicId, tab, term) {
    const ref = topicIndex[courseId + '/' + topicId];
    if (!ref) return viewNotFound();
    const { course, topic, idx } = ref;
    setChrome(topic.short || topic.title, '#/', 'home');
    try { localStorage.setItem('studyapp.lastTopic', course.id + '/' + topic.id); } catch (e) {}
    const m = topicMastery(course, topic);
    const base = `#/t/${course.id}/${topic.id}`;
    let html = `<div class="seg"><a href="${base}" class="${tab === 'notes' ? 'on' : ''}">Notes</a>
      <a href="${base}/test" class="${tab === 'test' ? 'on' : ''}">Test · ${m.pct}%</a></div>`;

    if (tab === 'notes') {
      html += `<div class="card notes" id="notes"><h2>${esc(topic.title)}</h2>`;
      if (!topic.notes.length) html += `<p class="muted">No study notes for this topic yet. Use the Test tab.</p>`;
      let lastPage = null;
      topic.notes.forEach((n) => {
        if (n.page !== lastPage) html += `<p class="page-tag">Study Book p.${n.page}</p>`;
        lastPage = n.page;
        html += starify(marked.parse(n.markdown));
      });
      html += `</div>`;
      html += `<a class="btn primary block" style="margin-top:16px" href="${base}/test">Test your knowledge (${topic.questions.length})</a>`;
    } else {
      html += testSetupHTML(course, 't:' + topic.id, topic.questions, `${topic.title}`);
    }

    const prev = course.topicOrder[idx - 1], next = course.topicOrder[idx + 1];
    const tabPath = tab === 'test' ? '/test' : '';
    html += `<div class="pager">`;
    html += prev ? `<a class="card" href="#/t/${course.id}/${prev.id}${tabPath}"><small>‹ Previous</small>${esc(prev.short || prev.title)}</a>` : `<span style="flex:1"></span>`;
    html += next ? `<a class="card next" href="#/t/${course.id}/${next.id}${tabPath}"><small>Next ›</small>${esc(next.short || next.title)}</a>` : `<span style="flex:1"></span>`;
    html += `</div>`;
    app.innerHTML = html;
    if (tab === 'notes' && term) highlight(document.getElementById('notes'), term);
    if (tab === 'test') bindSetup(course, 't:' + topic.id, topic.questions, topic.title, base + '/test');
  }

  /* ---------- test setup ---------- */

  const setup = { mode: 'smart', len: 10 };
  try { Object.assign(setup, JSON.parse(localStorage.getItem('studyapp.setup') || '{}')); } catch (e) {}

  function poolFor(course, questions, mode) {
    return questions.filter((q) => {
      const s = qstat(qkey(course, q));
      if (mode === 'priority') return q.priority;
      if (mode === 'weak') return s.wrong > 0 && s.box < MASTER_BOX;
      if (mode === 'new') return s.right + s.wrong === 0;
      return true;
    });
  }

  function testSetupHTML(course, scope, questions, label) {
    const m = { pct: 0, mastered: 0, seen: 0, total: questions.length };
    let sum = 0;
    questions.forEach((q) => { const s = qstat(qkey(course, q)); sum += Math.min(s.box, MASTER_BOX) / MASTER_BOX; if (s.box >= MASTER_BOX) m.mastered++; if (s.right + s.wrong) m.seen++; });
    m.pct = questions.length ? pct(sum / questions.length) : 0;
    const last = lastSession(scope);
    const counts = {
      smart: questions.length,
      priority: poolFor(course, questions, 'priority').length,
      weak: poolFor(course, questions, 'weak').length,
      new: poolFor(course, questions, 'new').length,
    };
    const modes = [['smart', 'Smart mix'], ['priority', '⭐ Priority'], ['weak', 'Weak spots'], ['new', 'Not seen yet']];
    const lens = [[10, '10'], [20, '20'], [0, 'All']];
    return `<div class="card setup">
      <div style="display:flex;gap:16px;align-items:center">${ring(m.pct, true)}
        <div><h2>${esc(label)}</h2>
        <div class="muted small">${m.mastered} of ${m.total} mastered · ${m.seen} seen</div>
        <div class="muted small">${last ? `Last test: ${last.score}/${last.n} (${pct(last.score / last.n)}%) on ${new Date(last.at).toLocaleDateString()}` : 'Not tested yet'}</div></div></div>
      <div class="opt-label">Questions</div>
      <div class="chips" id="modes">${modes.map(([k, l]) => `<button class="chip${setup.mode === k ? ' on' : ''}" data-mode="${k}" ${counts[k] ? '' : 'disabled'}>${l} (${counts[k]})</button>`).join('')}</div>
      <div class="opt-label">How many</div>
      <div class="chips" id="lens">${lens.map(([k, l]) => `<button class="chip${setup.len === k ? ' on' : ''}" data-len="${k}">${l}</button>`).join('')}</div>
      <p class="muted small" style="margin:14px 0">Smart mix favours questions you've missed or haven't seen. Three correct answers in a row marks a question as mastered.</p>
      <button class="btn primary block" id="start">Start test</button></div>`;
  }

  function bindSetup(course, scope, questions, label, returnTo) {
    const persist = () => { try { localStorage.setItem('studyapp.setup', JSON.stringify(setup)); } catch (e) {} };
    const counts = (mode) => poolFor(course, questions, mode).length;
    if (!counts(setup.mode)) setup.mode = 'smart';
    const refresh = () => {
      document.querySelectorAll('#modes .chip').forEach((b) => b.classList.toggle('on', b.dataset.mode === setup.mode));
      document.querySelectorAll('#lens .chip').forEach((b) => b.classList.toggle('on', +b.dataset.len === setup.len));
    };
    refresh();
    document.getElementById('modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b && !b.disabled) { setup.mode = b.dataset.mode; persist(); refresh(); } };
    document.getElementById('lens').onclick = (e) => { const b = e.target.closest('[data-len]'); if (b) { setup.len = +b.dataset.len; persist(); refresh(); } };
    document.getElementById('start').onclick = () => startQuiz(course, scope, questions, label, returnTo);
  }

  function pickQuestions(course, questions, opts) {
    const mode = (opts && opts.mode) || setup.mode;
    const len = opts && opts.len !== undefined ? opts.len : setup.len;
    const pool = poolFor(course, questions, mode);
    const n = len ? Math.min(len, pool.length) : pool.length;
    if (mode !== 'smart') return shuffle(pool).slice(0, n);
    // weighted sample without replacement: unseen and weak questions come up more often
    const weighted = pool.map((q) => {
      const s = qstat(qkey(course, q));
      const seen = s.right + s.wrong > 0;
      const w = !seen ? 4 : [6, 3, 2, 1, 1, 1][Math.min(s.box, 5)];
      return { q, k: Math.pow(Math.random(), 1 / w) };
    });
    return weighted.sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.q);
  }

  /* ---------- quiz ---------- */

  function startQuiz(course, scope, questions, label, returnTo, opts) {
    const list = pickQuestions(course, questions, opts);
    if (!list.length) return;
    quiz = { course, scope, label, returnTo, list, i: 0, score: 0, results: [], answered: false, allQuestions: questions };
    location.hash = '#/run';
  }

  function viewQuiz() {
    if (!quiz) { location.replace('#/'); return; }
    setChrome(quiz.label, quiz.returnTo, quiz.scope === 'all' ? 'quiz' : 'home');
    if (quiz.i >= quiz.list.length) return viewSummary();
    const q = quiz.list[quiz.i];
    const course = quiz.course;
    const topic = topicIndex[course.id + '/' + q.topic].topic;
    const num = bankNum(q.q);
    const meta = [topic.short || topic.title, num ? 'Bank Q' + num : 'Study Book p.' + q.page, q.priority ? '⭐ Priority' : ''].filter(Boolean).join(' · ');
    quiz.answered = false;

    let html = `<div class="qbar"><span>${quiz.i + 1}/${quiz.list.length}</span><div class="bar"><i style="width:${pct(quiz.i / quiz.list.length)}%"></i></div><span>${quiz.score} ✓</span></div>
      <div class="card qcard"><div class="qtopic">${esc(meta)}</div><p class="qtext">${inline(stripNum(q.q))}</p>`;
    if (q.choices && q.choices.length) {
      const opts = shuffle([{ t: q.a, ok: true }].concat(q.choices.map((c) => ({ t: c, ok: false }))));
      html += `<div class="choices" id="choices">${opts.map((o, k) => `<button class="choice" data-k="${k}" data-ok="${o.ok ? 1 : 0}">${inline(o.t)}</button>`).join('')}</div>
        <div id="after"></div>`;
    } else {
      const items = Array.isArray(q.a) ? q.a.filter((x) => !/^\s/.test(x)).length : 0;
      html += `<p class="hint">${items > 1 ? `Recall all ${items} points, then check yourself.` : 'Answer in your head, then check yourself.'}</p>
        <div id="reveal-area"><button class="btn primary block" id="reveal">Show answer</button></div>`;
    }
    html += `</div>`;
    app.innerHTML = html;
    window.scrollTo(0, 0);

    const choices = document.getElementById('choices');
    if (choices) {
      choices.onclick = (e) => {
        const b = e.target.closest('.choice');
        if (!b || quiz.answered) return;
        const ok = b.dataset.ok === '1';
        choices.querySelectorAll('.choice').forEach((c) => { c.disabled = true; if (c.dataset.ok === '1') c.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        record(q, ok ? 1 : 0);
        document.getElementById('after').innerHTML = `<p class="feedback ${ok ? 'good' : 'bad'}">${ok ? 'Correct' : 'Not quite'}</p>
          <button class="btn primary block" id="next">${quiz.i + 1 < quiz.list.length ? 'Next question' : 'See results'}</button>`;
        bindNext();
      };
    } else {
      document.getElementById('reveal').onclick = () => {
        const multi = Array.isArray(q.a) && q.a.length > 1;
        document.getElementById('reveal-area').innerHTML = `<div class="answer">${answerHTML(q.a)}</div>
          <div class="row">
            <button class="btn bad" data-r="0">Missed it</button>
            ${multi ? '<button class="btn" data-r="0.5">Partly</button>' : ''}
            <button class="btn good" data-r="1">Got it</button>
          </div>`;
        document.getElementById('reveal-area').onclick = (e) => {
          const b = e.target.closest('[data-r]');
          if (!b || quiz.answered) return;
          record(q, +b.dataset.r);
          advance();
        };
      };
    }
  }

  function bindNext() {
    const n = document.getElementById('next');
    n.onclick = advance;
    n.focus();
  }
  function advance() { quiz.i++; viewQuiz(); }

  function record(q, result) {
    quiz.answered = true;
    const key = qkey(quiz.course, q);
    const s = Object.assign({}, qstat(key));
    if (result === 1) { s.box = Math.min(s.box + 1, 5); s.right++; }
    else if (result === 0) { s.box = 0; s.wrong++; }
    else { s.box = Math.max(s.box - 1, 0); s.wrong++; } // partly: step back one box
    s.last = Date.now();
    state.q[key] = s;
    quiz.score += result;
    quiz.results.push({ q, result });
    save();
  }

  function viewSummary() {
    const { list, results, course, scope } = quiz;
    if (!quiz.saved) {
      state.sessions.push({ at: Date.now(), course: course.id, scope, label: quiz.label, n: list.length, score: quiz.score });
      if (state.sessions.length > 300) state.sessions = state.sessions.slice(-300);
      save();
      quiz.saved = true;
    }
    const p = pct(quiz.score / list.length);
    const missed = results.filter((r) => r.result < 1);
    let html = `<section class="gauge-hero">${gauge(p)}<p class="gauge-val">${p}%</p></section>
      <div class="result"><h2>${p >= 80 ? 'Great work' : p >= 50 ? 'Getting there' : 'Keep at it'}</h2>
      <p class="muted" style="margin:0">You scored ${quiz.score} out of ${list.length}.</p></div>
      <div class="stats"><div class="card stat"><b>${results.filter((r) => r.result === 1).length}</b><span>correct</span></div>
      <div class="card stat"><b>${results.filter((r) => r.result === 0.5).length}</b><span>partly</span></div>
      <div class="card stat"><b>${results.filter((r) => r.result === 0).length}</b><span>missed</span></div></div>
      <div class="row" style="margin-bottom:16px">
        ${missed.length ? '<button class="btn primary" id="retry">Retry missed</button>' : ''}
        <a class="btn" href="${quiz.returnTo}">Done</a></div>`;
    if (missed.length) {
      html += `<div class="sub-title">Review what you missed</div><div class="card missed">` +
        missed.map((r) => `<div class="m"><div class="mq">${inline(stripNum(r.q.q))}</div><div class="ma">${answerHTML(r.q.a)}</div></div>`).join('') + `</div>`;
    }
    app.innerHTML = html;
    window.scrollTo(0, 0);
    const retry = document.getElementById('retry');
    if (retry) retry.onclick = () => {
      quiz = Object.assign({}, quiz, { list: shuffle(missed.map((r) => r.q)), i: 0, score: 0, results: [], saved: false });
      viewQuiz();
    };
  }

  function quickStart() {
    const course = courses[0];
    const all = course.topics.flatMap((t) => t.questions);
    quiz = null;
    const list = pickQuestions(course, all, { mode: 'smart', len: 10 });
    quiz = { course, scope: 'all', label: 'Quick test', returnTo: '#/', list, i: 0, score: 0, results: [], answered: false };
    location.replace('#/run');
  }

  // Jump to a random topic's notes, never the same one twice in a row.
  function randomTopic() {
    const course = courses[0];
    let last = null;
    try { last = localStorage.getItem('studyapp.lastTopic'); } catch (e) {}
    const pool = course.topicOrder.filter((t) => course.id + '/' + t.id !== last);
    const t = pool[Math.floor(Math.random() * pool.length)];
    location.replace(`#/t/${course.id}/${t.id}`);
  }

  function viewQuizAll() {
    const course = courses[0];
    setChrome('Test all topics', null, 'quiz');
    const all = course.topics.flatMap((t) => t.questions);
    app.innerHTML = testSetupHTML(course, 'all', all, 'All topics');
    bindSetup(course, 'all', all, 'All topics', '#/quiz/all');
  }

  /* ---------- progress ---------- */

  function viewProgress() {
    setChrome('Progress', null, 'progress');
    let html = '';
    courses.forEach((course) => {
      const qs = course.topics.flatMap((t) => t.questions);
      const stats = qs.map((q) => qstat(qkey(course, q)));
      const overall = qs.length ? pct(stats.reduce((s, x) => s + Math.min(x.box, MASTER_BOX) / MASTER_BOX, 0) / qs.length) : 0;
      const mastered = stats.filter((s) => s.box >= MASTER_BOX).length;
      const seen = stats.filter((s) => s.right + s.wrong > 0).length;
      const sessions = state.sessions.filter((s) => s.course === course.id);
      const streak = streakDays();
      html += `<section class="gauge-hero">${gauge(overall)}<p class="gauge-val">${overall}%</p>
        <p class="gauge-cap">Overall · ${mastered} of ${qs.length} mastered · ${seen} seen</p></section>
        <div class="stats"><div class="card stat"><b>${sessions.length}</b><span>tests taken</span></div>
        <div class="card stat"><b>${streak}</b><span>day streak</span></div>
        <div class="card stat"><b>${sessions.length ? pct(sessions.slice(-10).reduce((a, x) => a + x.score / x.n, 0) / Math.min(10, sessions.length)) : 0}%</b><span>recent avg</span></div></div>`;
      html += `<div class="sub-title">By topic, weakest first</div><div class="topic-list">`;
      course.topicOrder.map((t) => ({ t, m: topicMastery(course, t) })).sort((a, b) => a.m.pct - b.m.pct).forEach(({ t, m }) => {
        const last = lastSession('t:' + t.id);
        html += `<a class="card topic" href="#/t/${course.id}/${t.id}/test"><div class="t-main">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-sub">${m.pct}% · ${m.mastered}/${m.total} mastered${last ? ` · last test ${pct(last.score / last.n)}%` : ''}</div>
          <div class="pbar"><i style="width:${m.pct}%"></i></div></div></a>`;
      });
      html += `</div>`;
      if (sessions.length) {
        html += `<div class="sub-title">Recent tests</div><div class="card missed">` +
          sessions.slice(-10).reverse().map((s) => `<div class="m"><div class="mq">${esc(s.label)}</div>
            <div class="ma">${s.score}/${s.n} (${pct(s.score / s.n)}%) · ${new Date(s.at).toLocaleString()}</div></div>`).join('') + `</div>`;
      }
    });
    html += `<p class="muted small" style="margin-top:24px">Progress is saved on this device only. Back it up to move it to another device.</p>
      <div class="danger-zone">
        <button class="btn" id="export">Back up progress</button>
        <label class="btn" for="import">Restore backup</label><input type="file" id="import" accept="application/json" hidden>
        <button class="btn bad" id="reset">Reset progress</button></div>`;
    app.innerHTML = html;

    document.getElementById('export').onclick = () => {
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'study-progress-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.getElementById('import').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then((txt) => {
        const data = JSON.parse(txt);
        if (!data || typeof data.q !== 'object') throw new Error('bad file');
        state = Object.assign(emptyState(), data);
        save();
        viewProgress();
      }).catch(() => alert('That file is not an SO Study Guide backup.'));
    };
    document.getElementById('reset').onclick = () => {
      if (confirm('Reset all progress on this device? This cannot be undone.')) { state = emptyState(); save(); viewProgress(); }
    };
  }

  function viewNotFound() {
    setChrome('Not found', '#/', 'home');
    app.innerHTML = `<div class="empty">That page doesn't exist. <a href="#/">Go to topics</a></div>`;
  }

  /* ---------- router ---------- */

  function route() {
    const [path, qs] = location.hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    if (parts[0] !== 'run' && quiz && quiz.i < quiz.list.length && quiz.results.length && !quiz.saved) {
      // leaving a quiz part-way: keep what was answered, drop the rest
      quiz = null;
    }
    if (!parts.length) viewHome(params.get('search') === '1');
    else if (parts[0] === 'start') quickStart();
    else if (parts[0] === 'random') randomTopic();
    else if (parts[0] === 't') viewTopic(parts[1], parts[2], parts[3] === 'test' ? 'test' : 'notes', params.get('q'));
    else if (parts[0] === 'quiz') viewQuizAll();
    else if (parts[0] === 'run') viewQuiz();
    else if (parts[0] === 'progress') viewProgress();
    else viewNotFound();
    if (parts[0] !== 'run') window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  /* ---------- theme ---------- */

  document.getElementById('theme').onclick = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('studyapp.theme', root.dataset.theme); } catch (e) {}
  };

  /* ---------- boot ---------- */

  async function boot() {
    load();
    try {
      const index = await (await fetch('data/courses.json')).json();
      courses = await Promise.all(index.courses.map(async (c) => (await fetch('data/' + c.file)).json()));
    } catch (e) {
      app.innerHTML = `<p class="muted center pad">Couldn't load the study material. Check your connection and reload.</p>`;
      return;
    }
    courses.forEach((course) => {
      course.topicOrder = course.groups.flatMap((g) => g.topics).map((id) => course.topics.find((t) => t.id === id)).filter(Boolean);
      course.topicOrder.forEach((topic, idx) => { topicIndex[course.id + '/' + topic.id] = { course, topic, idx }; });
    });
    window.addEventListener('hashchange', route);
    route();
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
