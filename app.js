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
    titleEl.textContent = title;
    document.title = title === 'Study' ? 'Study App' : title + ' · Study App';
    backBtn.hidden = !back;
    backBtn.onclick = back ? () => { location.hash = back; } : null;
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  }

  /* ---------- views ---------- */

  function viewHome() {
    setChrome('Study', null, 'home');
    let html = `<input class="search" id="search" type="search" placeholder="Search notes and questions" autocomplete="off">`;
    html += `<div id="results"></div><div id="lists">`;
    courses.forEach((course) => {
      const all = course.topics.flatMap((t) => t.questions.map((q) => qstat(qkey(course, q))));
      const overall = all.length ? pct(all.reduce((s, x) => s + Math.min(x.box, MASTER_BOX) / MASTER_BOX, 0) / all.length) : 0;
      html += `<div class="card hero">${ring(overall, true)}<div><h2>${esc(course.title)}</h2>
        <p class="muted small">${esc(course.subtitle || '')}</p>
        <p class="muted small">${course.topics.length} topics · ${all.length} questions</p></div></div>`;
      course.groups.forEach((g) => {
        html += `<div class="group-title">${esc(g.title)}</div><div class="topic-list">`;
        g.topics.forEach((tid) => {
          const t = course.topics.find((x) => x.id === tid);
          if (!t) return;
          const m = topicMastery(course, t);
          html += `<a class="card topic" href="#/t/${course.id}/${t.id}">
            ${ring(m.pct)}
            <div class="t-main"><div class="t-title">${esc(t.title)}</div>
            <div class="t-sub">${t.questions.length} questions · ${m.mastered} mastered</div></div>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></a>`;
        });
        html += `</div>`;
      });
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
    const m = topicMastery(course, topic);
    const base = `#/t/${course.id}/${topic.id}`;
    let html = `<div class="seg"><a href="${base}" class="${tab === 'notes' ? 'on' : ''}">Notes</a>
      <a href="${base}/test" class="${tab === 'test' ? 'on' : ''}">Test · ${m.pct}%</a></div>`;

    if (tab === 'notes') {
      html += `<div class="card notes" id="notes"><h2 style="margin:16px 0 4px;font-size:20px">${esc(topic.title)}</h2>`;
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

  function pickQuestions(course, questions) {
    const pool = poolFor(course, questions, setup.mode);
    const n = setup.len ? Math.min(setup.len, pool.length) : pool.length;
    if (setup.mode !== 'smart') return shuffle(pool).slice(0, n);
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

  function startQuiz(course, scope, questions, label, returnTo) {
    const list = pickQuestions(course, questions);
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
    let html = `<div class="card setup center">${ring(p, true).replace('class="ring big"', 'class="ring big" style="--p:' + p + ';margin:0 auto 10px"')}
      <h2>${p >= 80 ? 'Great work' : p >= 50 ? 'Getting there' : 'Keep at it'}</h2>
      <p class="muted">You scored ${quiz.score} out of ${list.length}.</p></div>
      <div class="stats"><div class="card stat"><b>${results.filter((r) => r.result === 1).length}</b><span>correct</span></div>
      <div class="card stat"><b>${results.filter((r) => r.result === 0.5).length}</b><span>partly</span></div>
      <div class="card stat"><b>${results.filter((r) => r.result === 0).length}</b><span>missed</span></div></div>
      <div class="row" style="margin-bottom:16px">
        ${missed.length ? '<button class="btn primary" id="retry">Retry missed</button>' : ''}
        <a class="btn" href="${quiz.returnTo}">Done</a></div>`;
    if (missed.length) {
      html += `<div class="group-title">Review what you missed</div><div class="card missed">` +
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

  function viewQuizAll() {
    const course = courses[0];
    setChrome('Test all topics', null, 'quiz');
    const all = course.topics.flatMap((t) => t.questions);
    app.innerHTML = testSetupHTML(course, 'all', all, course.title + ': all topics');
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
      html += `<div class="card hero">${ring(overall, true)}<div><h2>${esc(course.title)}</h2>
        <p class="muted small">${mastered} of ${qs.length} questions mastered · ${seen} seen · ${sessions.length} test${sessions.length === 1 ? '' : 's'} taken</p></div></div>`;
      html += `<div class="group-title">By topic (weakest first)</div><div class="topic-list">`;
      course.topicOrder.map((t) => ({ t, m: topicMastery(course, t) })).sort((a, b) => a.m.pct - b.m.pct).forEach(({ t, m }) => {
        const last = lastSession('t:' + t.id);
        html += `<a class="card topic" href="#/t/${course.id}/${t.id}/test"><div class="t-main">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-sub">${m.pct}% · ${m.mastered}/${m.total} mastered${last ? ` · last test ${pct(last.score / last.n)}%` : ''}</div>
          <div class="pbar"><i style="width:${m.pct}%"></i></div></div></a>`;
      });
      html += `</div>`;
      if (sessions.length) {
        html += `<div class="group-title">Recent tests</div><div class="card missed">` +
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
      }).catch(() => alert('That file is not a Study App backup.'));
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
    if (!parts.length) viewHome();
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
