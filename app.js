/* EduTrack fresh build. Only authentication and teacher display names use Supabase.
   Student records are stored in this browser under a teacher-specific local key. */
(() => {
  'use strict';

  const ACCOMMODATIONS = [
    'Extended time', 'Small-group setting', 'Preferential seating', 'Frequent breaks',
    'Directions read aloud', 'Text-to-speech', 'Speech-to-text', 'Chunk assignments',
    'Reduced-distraction setting', 'Calculator', 'Graphic organizer', 'Word bank',
    'Check for understanding', 'Hard copy notes'
  ];
  const blankData = () => ({ students: [], classes: [], logs: [], tests: [], scores: [], teks: [] });
  const $ = (id) => document.getElementById(id);
  let supabase = null;
  let session = null;
  let profile = null;
  let data = blankData();
  let viewName = 'home';
  let studentClassFilter = '';
  let selectedStudent = null;
  let saveTimer;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function dateToday() { return new Date().toISOString().slice(0, 10); }
  function recordDateKey(record) { return record.date || String(record.createdAt || '').slice(0, 10); }
  function formatTestScore(test) { return test.possible ? `${test.earned}/${test.possible} (${Math.round(100*test.earned/test.possible)}%)` : `${test.earned} points`; }
  function localKey() { return `edutrack-private-v1-${session.user.id}`; }
  function normalizeData(input) {
    const clean = blankData();
    for (const key of Object.keys(clean)) clean[key] = Array.isArray(input?.[key]) ? input[key] : [];
    return clean;
  }
  function persist() {
    if (!session?.user) return;
    try {
      localStorage.setItem(localKey(), JSON.stringify(data));
      showSavedState('Saved on this device');
    } catch (_) {
      showSavedState('Could not save in this browser. Download a backup and free browser storage.', true);
    }
  }
  function showSavedState(text, error = false) {
    const el = $('saveState');
    if (el) { el.textContent = text; el.classList.toggle('error-text', error); }
  }
  function toast(text) {
    const el = $('toast'); if (!el) return;
    el.textContent = text; el.classList.add('show'); clearTimeout(saveTimer);
    saveTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }
  function initials(name) { return String(name || 'Teacher').trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(); }
  function currentTeacherName() { return profile?.display_name || session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || 'Teacher'; }

  function authMessage(message, error = false) {
    $('authMessage').textContent = message;
    $('authMessage').className = `message${error ? ' error-text' : ''}`;
  }
  function setAuthMode(signup) {
    $('authTitle').textContent = signup ? 'Create your teacher account' : 'Sign in to EduTrack';
    $('authIntro').textContent = signup ? 'Your teacher sign-in is online. Classroom records stay in this browser.' : 'Sign in to open your classroom on this device.';
    $('nameWrap').hidden = !signup;
    $('teacherName').required = signup;
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    $('password').minLength = signup ? 8 : 1;
    $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
    $('authToggle').textContent = signup ? 'Already have an account? Sign in' : 'Create a teacher account';
    $('authToggle').dataset.signup = String(signup);
    authMessage('');
  }
  function showConfigHelp() {
    $('authNotice').hidden = false;
    $('authNotice').innerHTML = 'Connect your new Supabase project first. Copy <code>supabase-config.example.js</code> to <code>supabase-config.js</code> and add your project URL and publishable key. Then run <code>supabase/schema.sql</code> once in Supabase SQL Editor.';
    $('authForm').hidden = true; $('authToggle').hidden = true;
  }

  async function start() {
    const config = window.EDUTRACK_SUPABASE;
    if (!config || !config.url?.startsWith('https://') || !config.publishableKey || config.url.includes('YOUR-PROJECT')) {
      showConfigHelp(); return;
    }
    if (!window.supabase?.createClient) {
      $('authNotice').hidden = false;
      $('authNotice').textContent = 'Could not load the sign-in service. Check your internet connection and refresh.';
      return;
    }
    supabase = window.supabase.createClient(config.url, config.publishableKey);
    $('authForm').addEventListener('submit', handleAuth);
    $('authToggle').addEventListener('click', () => setAuthMode($('authToggle').dataset.signup !== 'true'));
    $('signOut').addEventListener('click', signOut);
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
    $('view').addEventListener('click', onViewClick);
    $('view').addEventListener('change', onViewChange);
    $('view').addEventListener('submit', onViewSubmit);
    $('modalRoot').addEventListener('click', onModalClick);
    $('modalRoot').addEventListener('submit', onModalSubmit);
    $('modalRoot').addEventListener('change', onModalChange);
    $('modalRoot').addEventListener('input', onModalInput);
    $('authNotice').hidden = true;
    supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.user && session?.user?.id !== newSession.user.id) setTimeout(() => openWorkspace(newSession), 0);
      if (!newSession && session) setTimeout(() => showAuth(), 0);
    });
    const { data: result, error } = await supabase.auth.getSession();
    if (error) { $('authNotice').hidden = false; $('authNotice').textContent = friendlyError(error); return; }
    if (result.session) await openWorkspace(result.session);
  }

  async function handleAuth(event) {
    event.preventDefault();
    const signup = $('authToggle').dataset.signup === 'true';
    const button = $('authSubmit'); button.disabled = true;
    button.textContent = signup ? 'Creating account…' : 'Signing in…'; authMessage('');
    const email = $('email').value.trim(); const password = $('password').value;
    try {
      if (signup) {
        const displayName = $('teacherName').value.trim();
        const { data: result, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (error) throw error;
        if (!result.session) authMessage('Account created. Check your email to confirm it, then return here to sign in.');
        else await openWorkspace(result.session);
      } else {
        const { data: result, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await openWorkspace(result.session);
      }
    } catch (error) { authMessage(friendlyError(error), true); }
    finally { button.disabled = false; button.textContent = signup ? 'Create account' : 'Sign in'; }
  }

  function friendlyError(error) {
    const text = error?.message || 'The connection could not be completed.';
    if (/failed to fetch|network/i.test(text)) return 'EduTrack could not reach Supabase. Check your project URL, publishable key, and Supabase status, then try again.';
    if (/invalid login/i.test(text)) return 'That email and password do not match. Try again or create an account.';
    if (/email not confirmed/i.test(text)) return 'Confirm your email using the message from Supabase, then sign in.';
    return text;
  }

  async function openWorkspace(newSession) {
    session = newSession;
    try {
      const { data: row, error } = await supabase.from('teacher_profiles').select('display_name').eq('id', session.user.id).maybeSingle();
      if (error) throw error;
      profile = row || { display_name: session.user.user_metadata?.display_name || '' };
      if (!row) {
        const { error: insertError } = await supabase.from('teacher_profiles').insert({ id: session.user.id, display_name: profile.display_name });
        if (insertError) throw insertError;
      }
    } catch (error) {
      session = null; $('authNotice').hidden = false;
      $('authNotice').textContent = `Teacher sign-in worked, but the teacher profile table could not be reached. Run this fresh project's supabase/schema.sql in the Supabase SQL Editor. ${friendlyError(error)}`;
      return;
    }
    try { data = normalizeData(JSON.parse(localStorage.getItem(localKey()) || 'null')); }
    catch (_) { data = blankData(); }
    showApp(); showView('home');
  }
  function showAuth() {
    session = null; profile = null; data = blankData();
    $('appScreen').hidden = true; $('authScreen').hidden = false; setAuthMode(false);
  }
  async function signOut() { await supabase.auth.signOut(); showAuth(); }
  function showApp() {
    $('authScreen').hidden = true; $('appScreen').hidden = false;
    const name = currentTeacherName();
    $('teacherLabel').textContent = name; $('teacherAvatar').textContent = initials(name); $('topAvatar').textContent = initials(name);
    $('schoolLabel').textContent = profile?.school_name || 'My classroom';
  }

  function showView(next, classId = '') {
    viewName = next; selectedStudent = null;
    studentClassFilter = next === 'students' ? classId : '';
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === next));
    $('crumb').textContent = ({ home: 'Overview', students: 'Students', classes: 'Classes', standards: 'Set Standards', reports: 'Reports', settings: 'Settings' })[next] || 'Overview';
    const renders = { home: renderHome, students: renderStudents, classes: renderClasses, standards: renderStandards, reports: renderReports, settings: renderSettings };
    $('view').innerHTML = (renders[next] || renderHome)(); $('view').focus({ preventScroll: true });
  }
  function studentCard(student) {
    const className = getClassName(student.classId);
    return `<button class="student-row" data-action="student" data-id="${escapeHtml(student.id)}"><span class="student-badge">${escapeHtml(initials(student.name))}</span><span class="student-row-main"><b>${escapeHtml(student.name)}</b><small>${escapeHtml(student.grade || 'Grade not entered')} · ${escapeHtml(className || 'No class')} · ${student.accommodations.length} accommodations</small></span><span class="tag">${escapeHtml(student.supportArea || 'Learning')}</span><span class="chevron">›</span></button>`;
  }
  function getClassName(classId) { return data.classes.find(item => item.id === classId)?.name || ''; }
  function renderHome() {
    const recent = data.logs.slice().sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)).slice(0, 5);
    const activeAccoms = data.students.reduce((sum, student) => sum + student.accommodations.length, 0);
    return `<section class="welcome"><div><div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>Welcome, ${escapeHtml(currentTeacherName().split(/\s+/)[0])}</h1><p>A simple place to record supports and see student growth.</p></div><button class="button primary" data-action="add-student">＋ Add student</button></section>
      <section class="stat-grid"><div class="stat-card"><span>Students</span><b>${data.students.length}</b></div><div class="stat-card"><span>Active accommodations</span><b>${activeAccoms}</b></div><div class="stat-card"><span>Check-ins this week</span><b>${data.logs.filter(log => daysAgo(log.date) <= 6).length}</b></div><div class="stat-card"><span>TEKS tracked</span><b>${new Set(data.scores.map(score => score.teks)).size}</b></div></section>
      <section class="home-grid"><div class="panel"><div class="panel-heading"><div><h2>Your students</h2><p>Choose a student to record supports or review progress.</p></div><button class="button secondary small" data-action="view-students">All students</button></div>${data.students.length ? `<div class="student-list">${data.students.slice(0, 5).map(studentCard).join('')}</div>` : emptyBlock('No students yet', 'Add a student to start a private classroom roster.', 'add-student')}</div>
      <div class="panel"><div class="panel-heading"><div><h2>Recent check-ins</h2><p>Accommodation use recorded recently.</p></div><button class="button secondary small" data-action="log">＋ Log</button></div>${recent.length ? `<div class="recent-list">${recent.map(log => { const student = data.students.find(item => item.id === log.studentId); const count = Object.values(log.usage || {}).filter(Boolean).length; return `<div class="recent-item"><span class="dot"></span><div><b>${escapeHtml(student?.name || 'Student')} · ${count} used</b><small>${escapeHtml(log.context)} · ${prettyDate(log.date)}</small></div></div>`; }).join('')}</div>` : '<p class="muted padded">Saved check-ins will appear here.</p>'}</div></section>
      <div class="local-banner"><b>Saved on this device</b><span>Student information is not sent to Supabase. Use Settings to download a backup before switching devices or clearing browser data.</span><span id="saveState">Saved on this device</span></div>`;
  }
  function daysAgo(date) { const day = new Date(`${date}T00:00:00`).getTime(); return Math.floor((Date.now() - day) / 86400000); }
  function prettyDate(date) { if (!date) return ''; const d = new Date(`${date}T00:00:00`); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function emptyBlock(title, body, action) { const label=action==='add-class'?'＋ Add class':'＋ Add student'; return `<div class="empty"><div class="empty-icon">✳</div><b>${title}</b><p>${body}</p><button class="button primary" data-action="${action}">${label}</button></div>`; }
  function renderStudents() {
    const classOptions=data.classes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===studentClassFilter?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
    const visibleStudents=data.students.filter(student=>!studentClassFilter||student.classId===studentClassFilter).sort((a,b)=>a.name.localeCompare(b.name));
    const rows=visibleStudents.map(studentCard).join('');
    return `<section class="page-heading"><div><div class="eyebrow">YOUR CLASSROOM</div><h1>Students</h1><p>Select a student to record accommodations, scores, and TEKS growth.</p></div><button class="button primary" data-action="add-student">＋ Add student</button></section><div class="panel">${data.students.length ? `<div class="student-filters"><label class="search-label">Find a student<input id="studentSearch" type="search" placeholder="Type a name…"></label><label class="search-label">Class or period<select id="classFilter"><option value="">All classes</option>${classOptions}</select></label></div><div id="studentList" class="student-list">${rows||'<p class="muted padded">No students are assigned to this class yet.</p>'}</div>` : emptyBlock('Your roster is empty', 'Add your first student to get started.', 'add-student')}</div>`;
  }
  function renderClasses() {
    const cards=data.classes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(item=>{
      const roster=data.students.filter(student=>student.classId===item.id);
      return `<article class="class-card"><div class="class-card-top"><span class="class-icon">▦</span><div><h2>${escapeHtml(item.name)}</h2><p>${roster.length} ${roster.length===1?'student':'students'}</p></div></div><div class="class-card-actions"><button class="button primary small" data-action="view-class" data-id="${escapeHtml(item.id)}">View students</button><button class="button secondary small" data-action="add-existing-students" data-id="${escapeHtml(item.id)}">＋ Add existing</button><button class="button secondary small" data-action="add-student-to-class" data-id="${escapeHtml(item.id)}">＋ New student</button><button class="button secondary small" data-action="edit-class" data-id="${escapeHtml(item.id)}">Rename</button><button class="icon-button" data-action="delete-class" data-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}">×</button></div></article>`;
    }).join('');
    return `<section class="page-heading"><div><div class="eyebrow">ORGANIZE YOUR ROSTER</div><h1>Classes</h1><p>Create class periods, assign students, and open a class roster with one click.</p></div><button class="button primary" data-action="add-class">＋ Add class</button></section>${cards?`<div class="class-grid">${cards}</div>`:`<div class="panel">${emptyBlock('No classes set up yet','Add class periods such as Period 1 or Math 3, then assign students to them.','add-class')}</div>`}`;
  }
  function renderReports() {
    const rows = teksSummary().map(item => `<tr><td><b>${escapeHtml(item.code)}</b>${item.priority ? ' <span class="priority">Priority</span>' : ''}</td><td>${item.studentCount}</td><td>${item.first == null ? '—' : `${Math.round(item.first)}%`}</td><td>${item.latest == null ? '—' : `${Math.round(item.latest)}%`}</td><td class="${item.growth > 0 ? 'positive' : item.growth < 0 ? 'negative' : ''}">${item.growth == null ? '—' : `${item.growth > 0 ? '+' : ''}${Math.round(item.growth)} pp`}</td></tr>`).join('');
    return `<section class="page-heading"><div><div class="eyebrow">LOOK BACK AND SHARE</div><h1>Reports</h1><p>Print a compact student summary or see progress across the TEKS you track.</p></div><button class="button secondary" data-action="backup">↓ Download backup</button></section>
      <div class="report-grid"><div class="panel"><div class="panel-heading"><div><h2>Student reports</h2><p>Choose a student for a print-friendly plan, logs, and scores.</p></div></div>${data.students.length ? `<div class="student-list">${data.students.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(studentCard).join('')}</div>` : '<p class="muted padded">Add a student to make a report.</p>'}</div>
      <div class="panel"><div class="panel-heading"><div><h2>TEKS growth</h2><p>First and latest recorded percentages by TEKS.</p></div></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>TEKS</th><th>Students</th><th>First</th><th>Latest</th><th>Growth</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted padded">Record test scores by TEKS to see growth here.</p>'}</div></div>
      <div class="privacy-card"><b>Sharing a report?</b><span>Reports are generated in your browser. Review the information before printing or sharing it.</span></div>`;
  }
  function renderStandards() {
    const teksRows = data.teks.map((item, index) => `<div class="teks-row"><div><b>${escapeHtml(item.code)}</b>${item.description ? `<small>${escapeHtml(item.description)}</small>` : ''}</div><label class="checkline"><input type="checkbox" data-action="priority-teks" data-index="${index}" ${item.priority ? 'checked' : ''}> Priority</label><button class="icon-button" data-action="remove-teks" data-index="${index}" aria-label="Remove TEKS">×</button></div>`).join('');
    return `<section class="page-heading"><div><div class="eyebrow">YOUR CLASSROOM</div><h1>Set Standards for Monitoring</h1><p>Add the TEKS your team wants to track. They will appear in the test score form.</p></div></section>
      <section class="panel"><div class="panel-heading"><div><h2>Standards to monitor</h2><p>Add a TEKS code, an optional reminder, and mark priority standards.</p></div></div><form id="teksForm" class="teks-form"><label>TEKS code<input name="code" required placeholder="For example, 5.3A"></label><label>Description <span class="optional">optional</span><input name="description" placeholder="Short description"></label><label class="checkline"><input name="priority" type="checkbox"> Priority TEKS</label><button class="button primary" type="submit">Add TEKS</button></form><div id="teksList">${teksRows || '<p class="muted padded">No standards yet. Add the first TEKS above.</p>'}</div></section>`;
  }
  function renderSettings() {
    return `<section class="page-heading"><div><div class="eyebrow">YOUR SPACE</div><h1>Settings</h1><p>Manage your teacher name and classroom backup.</p></div></section>
      <section class="panel"><div class="panel-heading"><div><h2>Backup and restore</h2><p>Your classroom data stays in this browser. A backup lets you move it to another device.</p></div></div><div class="settings-actions"><button class="button secondary" data-action="backup">↓ Download backup</button><label class="button secondary file-button">↑ Restore backup<input id="restoreFile" type="file" accept="application/json,.json"></label></div><div class="soft-note"><b>This device only</b><p>Clearing this browser’s site data removes your saved classroom data. Download a backup regularly. Backups contain student information; store and share them according to your school’s rules.</p></div><div class="profile-form"><h3>Teacher name</h3><label>Display name<input id="profileName" value="${escapeHtml(currentTeacherName())}"></label><button class="button secondary" data-action="save-name">Save name</button></div></section>`;
  }
  function onViewSubmit(event) {
    if (event.target.id !== 'teksForm') return;
    event.preventDefault();
    const fields = new FormData(event.target);
    const code = String(fields.get('code') || '').trim();
    const description = String(fields.get('description') || '').trim();
    if (!code) { toast('Enter a TEKS code first'); return; }
    if (data.teks.some(item => item.code.toLowerCase() === code.toLowerCase())) {
      toast('That TEKS is already on your list'); return;
    }
    data.teks.push({ id: uid(), code, description, priority: fields.get('priority') === 'on' });
    persist(); showView('standards'); toast(`${code} added to your standards`);
  }
  function teksSummary() {
    const codes = new Set([...data.teks.map(item => item.code), ...data.scores.map(item => item.teks)]);
    return [...codes].map(code => {
      const scores = data.scores.filter(item => item.teks === code);
      const students = new Set(scores.map(item => item.studentId));
      const series = [...students].map(studentId => {
        const byDate = new Map();
        scores.filter(score => score.studentId === studentId).forEach(score => { const date=recordDateKey(score); const current = byDate.get(date) || []; current.push(100 * score.earned / score.possible); byDate.set(date, current); });
        const values = [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,arr])=>arr.reduce((a,b)=>a+b,0)/arr.length);
        return values.length ? { first: values[0], latest: values.at(-1) } : null;
      }).filter(Boolean);
      return { code, priority: data.teks.find(item => item.code === code)?.priority || scores.some(item => item.priority), studentCount: students.size, first: series.length ? series.reduce((n,item)=>n+item.first,0)/series.length : null, latest: series.length ? series.reduce((n,item)=>n+item.latest,0)/series.length : null, growth: series.length ? series.reduce((n,item)=>n+item.latest-item.first,0)/series.length : null };
    }).sort((a,b)=>Number(b.priority)-Number(a.priority)||a.code.localeCompare(b.code));
  }

  function onViewClick(event) {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'add-student') openStudentForm();
    else if (action === 'student') openStudent(button.dataset.id);
    else if (action === 'view-students') showView('students');
    else if (action === 'add-class') openClassForm();
    else if (action === 'edit-class') openClassForm(button.dataset.id);
    else if (action === 'view-class') showView('students',button.dataset.id);
    else if (action === 'add-existing-students') openExistingStudentsForm(button.dataset.id);
    else if (action === 'add-student-to-class') { studentClassFilter=button.dataset.id; openStudentForm(); }
    else if (action === 'delete-class') deleteClass(button.dataset.id);
    else if (action === 'log') openLogForm();
    else if (action === 'score') openScoreForm(button.dataset.id);
    else if (action === 'edit-student') openStudentForm(button.dataset.id);
    else if (action === 'delete-student') deleteStudent(button.dataset.id);
    else if (action === 'student-report') openReport(button.dataset.id);
    else if (action === 'backup') downloadBackup();
    else if (action === 'save-name') saveTeacherName();
    else if (action === 'remove-teks') { data.teks.splice(Number(button.dataset.index),1); persist(); showView('standards'); }
  }
  function onViewChange(event) {
    if (event.target.id === 'classFilter') { showView('students',event.target.value); return; }
    if (event.target.matches('[data-action="priority-teks"]')) {
      data.teks[Number(event.target.dataset.index)].priority = event.target.checked; persist(); showView('standards');
    }
    if (event.target.id === 'restoreFile') restoreBackup(event.target.files?.[0]);
  }
  function onViewInput(event) {
    if (event.target.id === 'studentSearch') {
      const query = event.target.value.toLowerCase();
      $('studentList').innerHTML = data.students.filter(student => student.name.toLowerCase().includes(query)&&(!studentClassFilter||student.classId===studentClassFilter)).sort((a,b)=>a.name.localeCompare(b.name)).map(studentCard).join('') || '<p class="muted padded">No students match this search and class.</p>';
    }
  }
  function onModalClick(event) {
    const close = event.target.closest('[data-close]'); if (close || event.target.id === 'modalBackdrop') closeModal();
    const actionButton = event.target.closest('[data-modal-action]');
    const action = actionButton?.dataset.modalAction;
    if (action === 'add-accommodation') addCustomAccommodation();
    if (action === 'go-classes') { closeModal(); showView('classes'); }
    if (action === 'report-print') window.print();
    if (action === 'report-csv') exportStudentCSV(actionButton.dataset.id);
    if (action === 'add-score-row') addScoreRow();
    if (action === 'remove-score-row') {
      actionButton.closest('[data-score-row]')?.remove();
    }
  }
  function onModalSubmit(event) {
    if (event.target.id === 'studentForm') { event.preventDefault(); saveStudent(event.target); }
    if (event.target.id === 'classForm') { event.preventDefault(); saveClass(event.target); }
    if (event.target.id === 'existingStudentsForm') { event.preventDefault(); saveExistingStudents(event.target); }
    if (event.target.id === 'logForm') { event.preventDefault(); saveLog(event.target); }
    if (event.target.id === 'scoreForm') { event.preventDefault(); saveScore(event.target); }
    if (event.target.id === 'quickAddForm') { event.preventDefault(); addQuickAccommodation(event.target); }
  }
  function onModalChange(event) {
    if (event.target.id === 'logStudent') { renderLogAccommodations(event.target.value); }
    if (event.target.matches('#scoreRows select[name="teks"]')) {
      const selected = data.teks.find(item => item.code === event.target.value);
      event.target.closest('[data-score-row]').querySelector('[name="priority"]').checked = !!selected?.priority;
    }
  }
  function onModalInput(event) {
    if (event.target.id === 'scoreRows') { /* reserved for future row editing */ }
  }
  $('view')?.addEventListener('input', onViewInput);

  function openModal(content, wide = false) {
    $('modalRoot').innerHTML = `<div id="modalBackdrop" class="modal-backdrop"><section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${content}</section></div>`;
    document.body.classList.add('modal-open');
    $('modalRoot').querySelector('input:not([type=hidden]),button,select')?.focus();
  }
  function closeModal() { $('modalRoot').innerHTML = ''; document.body.classList.remove('modal-open'); }
  function modalHead(title, subtitle = '') { return `<header class="modal-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button" data-close aria-label="Close">×</button></header>`; }
  function openClassForm(classId = '') {
    const item=data.classes.find(row=>row.id===classId);
    openModal(`${modalHead(item?'Rename class':'Add a class',item?'Update the class or period label for this roster.':'Use a simple label teachers recognize, such as Period 1 or Math 3.')}
      <form id="classForm" data-id="${escapeHtml(classId)}"><label>Class or period name<input name="name" required maxlength="60" value="${escapeHtml(item?.name||'')}" placeholder="For example, Period 1 — Math"></label><footer class="modal-footer"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">${item?'Save name':'Add class'}</button></footer></form>`);
  }
  function saveClass(form) {
    const name=String(new FormData(form).get('name')||'').trim();
    if(!name){toast('Enter a class or period name');return;}
    if(data.classes.some(item=>item.name.toLowerCase()===name.toLowerCase()&&item.id!==form.dataset.id)){toast('That class name is already on your list');return;}
    const id=form.dataset.id;
    if(id) data.classes=data.classes.map(item=>item.id===id?{...item,name}:item);
    else data.classes.push({id:uid(),name});
    persist();closeModal();showView('classes');toast(id?'Class renamed':'Class added');
  }
  function deleteClass(classId) {
    const item=data.classes.find(row=>row.id===classId);if(!item)return;
    const count=data.students.filter(student=>student.classId===classId).length;
    if(!confirm(`Remove ${item.name}? ${count?`${count} assigned ${count===1?'student will':'students will'} remain in your roster as unassigned.`:'This class will be removed from your list.'}`))return;
    data.classes=data.classes.filter(row=>row.id!==classId);
    data.students=data.students.map(student=>student.classId===classId?{...student,classId:''}:student);
    persist();showView('classes');toast('Class removed');
  }
  function openExistingStudentsForm(classId) {
    const classItem=data.classes.find(item=>item.id===classId);if(!classItem)return;
    const candidates=data.students.filter(student=>student.classId!==classId).sort((a,b)=>a.name.localeCompare(b.name));
    const choices=candidates.map(student=>`<label class="existing-student-choice"><input type="checkbox" name="studentId" value="${escapeHtml(student.id)}"><span><b>${escapeHtml(student.name)}</b><small>${escapeHtml(student.grade||'Grade not entered')} · ${escapeHtml(getClassName(student.classId)||'No class assigned')}</small></span></label>`).join('');
    openModal(`${modalHead(`Add students to ${escapeHtml(classItem.name)}`,candidates.some(student=>student.classId)?'Choose students from your roster. Students assigned to another class will move into this class.':'Choose students from your roster to add to this class.')}
      <form id="existingStudentsForm" data-class="${escapeHtml(classId)}">${choices?`<div class="existing-students-list">${choices}</div>`:'<div class="soft-note">There are no other students in your roster to add. You can create a new student from the Classes page.</div>'}<footer class="modal-footer"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit" ${choices?'':'disabled'}>Add selected students</button></footer></form>`,true);
  }
  function saveExistingStudents(form) {
    const classId=form.dataset.class;
    const selected=new Set(new FormData(form).getAll('studentId').map(String));
    if(!selected.size){toast('Select at least one student');return;}
    data.students=data.students.map(student=>selected.has(student.id)?{...student,classId}:student);
    persist();closeModal();showView('classes');toast(`${selected.size} ${selected.size===1?'student':'students'} added to class`);
  }
  function openStudentForm(studentId = '') {
    const student = data.students.find(item => item.id === studentId);
    const selected = new Set(student?.accommodations || []);
    const checks = ACCOMMODATIONS.map(name => `<label class="accom-choice"><input type="checkbox" name="accommodation" value="${escapeHtml(name)}" ${selected.has(name) ? 'checked' : ''}><span>${escapeHtml(name)}</span></label>`).join('');
    const classOptions=data.classes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(item=>`<option value="${escapeHtml(item.id)}" ${student?.classId===item.id||(!student&&studentClassFilter===item.id)?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
    openModal(`${modalHead(student ? 'Edit student' : 'Add student', 'Choose common accommodations, then save the student plan.')}
      <form id="studentForm" data-id="${escapeHtml(studentId)}"><div class="form-grid"><label>Student name<input name="name" required value="${escapeHtml(student?.name || '')}" placeholder="First and last name"></label><label>Grade<input name="grade" value="${escapeHtml(student?.grade || '')}" placeholder="For example, 5"></label><label>Class or period<select name="classId"><option value="">No class assigned</option>${classOptions}</select></label><label>Support area<select name="supportArea"><option ${!student?.supportArea || student.supportArea==='Learning'?'selected':''}>Learning</option><option ${student?.supportArea==='Access'?'selected':''}>Access</option><option ${student?.supportArea==='Sensory'?'selected':''}>Sensory</option><option ${student?.supportArea==='Other'?'selected':''}>Other</option></select></label></div>${data.classes.length?'':'<div class="soft-note">Want to assign a period? Add your classes first in the Classes tab.<button type="button" class="link-button" data-modal-action="go-classes">Go to Classes</button></div>'}<fieldset><legend>Accommodations</legend><div class="accom-grid">${checks}</div><div id="customAccomList" class="custom-accom-list">${(student?.accommodations || []).filter(item => !ACCOMMODATIONS.includes(item)).map(name => `<label class="accom-choice"><input type="checkbox" name="accommodation" checked value="${escapeHtml(name)}"><span>${escapeHtml(name)}</span></label>`).join('')}</div><div class="inline-add"><input id="customAccommodation" placeholder="Add a custom accommodation"><button type="button" class="button secondary small" data-modal-action="add-accommodation">Add</button></div></fieldset><label>Plan notes <span class="optional">optional</span><textarea name="notes" rows="3" placeholder="Helpful classroom reminders">${escapeHtml(student?.notes || '')}</textarea></label><footer class="modal-footer"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit">Save student</button></footer></form>`);
  }
  function addCustomAccommodation() {
    const input = $('customAccommodation'); const value = input.value.trim(); if (!value) return;
    const list = $('customAccomList'); const label = document.createElement('label'); label.className = 'accom-choice';
    label.innerHTML = `<input type="checkbox" name="accommodation" checked><span></span>`;
    label.querySelector('input').value = value; label.querySelector('span').textContent = value; list.append(label); input.value = '';
  }
  function saveStudent(form) {
    const formData = new FormData(form); const id = form.dataset.id;
    const student = { id: id || uid(), name: String(formData.get('name')).trim(), grade: String(formData.get('grade') || '').trim(), classId: String(formData.get('classId') || ''), supportArea: formData.get('supportArea'), accommodations: formData.getAll('accommodation').map(String), notes: String(formData.get('notes') || '').trim(), updatedAt: new Date().toISOString() };
    if (id) data.students = data.students.map(item => item.id === id ? student : item); else data.students.push(student);
    const currentClassFilter=studentClassFilter;
    persist(); closeModal(); showView(viewName,currentClassFilter); toast(id ? 'Student updated' : 'Student added');
  }
  function openStudent(id) {
    const student = data.students.find(item => item.id === id); if (!student) return;
    selectedStudent = id;
    const logs = data.logs.filter(log => log.studentId === id).sort((a,b)=>`${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)).slice(0,5);
    const scores = data.scores.filter(score => score.studentId === id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
    const tests = data.tests.filter(test => test.studentId === id).sort((a,b)=>recordDateKey(b).localeCompare(recordDateKey(a))).slice(0,5);
    $('modalRoot').innerHTML = `<div id="modalBackdrop" class="modal-backdrop"><section class="modal modal-wide" role="dialog" aria-modal="true"><header class="student-profile-head"><div class="student-badge large">${escapeHtml(initials(student.name))}</div><div><div class="eyebrow">${escapeHtml(student.grade || 'Grade not entered')} · ${escapeHtml(student.supportArea)}</div><h2>${escapeHtml(student.name)}</h2><p>${student.accommodations.length} active accommodations</p></div><button class="icon-button" data-close aria-label="Close">×</button></header><div class="profile-actions"><button class="button primary" data-action="log" data-modal-local="1">＋ Record today</button><button class="button secondary" data-action="score" data-id="${escapeHtml(id)}">＋ Add test score</button><button class="button secondary" data-action="student-report" data-id="${escapeHtml(id)}">Print report</button><button class="button secondary" data-modal-action="report-csv" data-id="${escapeHtml(id)}">Download CSV</button><button class="button secondary" data-action="edit-student" data-id="${escapeHtml(id)}">Edit plan</button></div><div class="profile-columns"><section><h3>Accommodation plan</h3>${student.accommodations.length ? `<ul class="plan-list">${student.accommodations.map(name=>`<li>${escapeHtml(name)}</li>`).join('')}</ul>` : '<p class="muted">No accommodations added.</p>'}${student.notes?`<div class="soft-note"><b>Plan notes</b><p>${escapeHtml(student.notes)}</p></div>`:''}<h3>Recent accommodation use</h3>${logs.length ? `<div class="record-list">${logs.map(log=>{const used=Object.values(log.usage||{}).filter(Boolean).length;return `<div><b>${prettyDate(log.date)} · ${escapeHtml(log.context)}</b><small>${used} of ${Object.keys(log.usage||{}).length} marked used${log.notes?` · ${escapeHtml(log.notes)}`:''}</small></div>`}).join('')}</div>` : '<p class="muted">No check-ins recorded.</p>'}</section><section><h3>Recent overall test scores</h3>${tests.length ? `<div class="record-list">${tests.map(test=>`<div><b>${escapeHtml(test.assessment||'Test')}</b><small>${prettyDate(test.date)||'Date not entered'} · ${formatTestScore(test)}</small></div>`).join('')}</div>` : '<p class="muted">No overall test scores recorded.</p>'}<h3>Recent TEKS scores</h3>${scores.length ? `<div class="record-list">${scores.map(score=>`<div><b>${escapeHtml(score.assessment||'Test')} · ${escapeHtml(score.teks)}</b><small>${prettyDate(score.date)||'Date not entered'} · ${score.earned}/${score.possible} (${Math.round(100*score.earned/score.possible)}%)</small></div>`).join('')}</div>` : '<p class="muted">No TEKS scores recorded.</p>'}<h3>TEKS progress</h3>${studentGrowth(id)}</section></div><div class="delete-row"><button class="text-danger" data-action="delete-student" data-id="${escapeHtml(id)}">Delete student and their records</button></div></section></div>`;
    document.body.classList.add('modal-open');
  }
  function studentGrowth(studentId) {
    const codes = [...new Set(data.scores.filter(score=>score.studentId===studentId).map(score=>score.teks))];
    if (!codes.length) return '<p class="muted">Add scores to track TEKS growth.</p>';
    return `<div class="growth-list">${codes.map(code=>{const rows=data.scores.filter(score=>score.studentId===studentId&&score.teks===code).sort((a,b)=>recordDateKey(a).localeCompare(recordDateKey(b)));const first=rows[0],last=rows.at(-1),change=(100*last.earned/last.possible)-(100*first.earned/first.possible);return `<div><b>${escapeHtml(code)}</b><span>${Math.round(100*last.earned/last.possible)}% latest${rows.length>1?` · ${change>0?'+':''}${Math.round(change)} pp`:''}</span></div>`}).join('')}</div>`;
  }
  function deleteStudent(id) {
    const student = data.students.find(item=>item.id===id); if (!student) return;
    if (!confirm(`Delete ${student.name} and all of their check-ins and test scores from this browser? This cannot be undone.`)) return;
    const currentClassFilter=studentClassFilter;
    data.students = data.students.filter(item=>item.id!==id); data.logs=data.logs.filter(item=>item.studentId!==id); data.tests=data.tests.filter(item=>item.studentId!==id); data.scores=data.scores.filter(item=>item.studentId!==id); persist(); closeModal(); showView(viewName,currentClassFilter); toast('Student and records deleted');
  }
  function openLogForm(studentId = '') {
    if (!data.students.length) { toast('Add a student first'); return; }
    const options = data.students.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===studentId?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
    openModal(`${modalHead('Record accommodations used', 'For each accommodation, tap Used or Not used for this student.')}
      <form id="logForm"><div class="form-grid"><label>Student<select id="logStudent" name="studentId" required>${options}</select></label><label>Date<input type="date" name="date" value="${dateToday()}" required></label><label>When<select name="context"><option>Daily</option><option>Test</option><option>Other</option></select></label></div><div id="logAccommodationList" class="usage-list"></div><label>Notes <span class="optional">optional</span><input name="notes" placeholder="Optional note about today"></label><footer class="modal-footer"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit">Save check-in</button></footer></form>`, true);
    renderLogAccommodations(studentId || data.students[0].id);
  }
  function renderLogAccommodations(studentId) {
    const student = data.students.find(item=>item.id===studentId); const container=$('logAccommodationList'); if (!container) return;
    if (!student?.accommodations.length) { container.innerHTML='<div class="soft-note">This student has no accommodations on their plan yet. Edit the student to add them.</div>'; return; }
    container.innerHTML = `<div class="usage-heading"><b>Accommodation</b><span>Used?</span></div>` + student.accommodations.map((name,index)=>`<div class="usage-row"><span>${escapeHtml(name)}</span><div class="toggle-group"><label><input type="radio" name="usage-${index}" value="yes" required><span>Used</span></label><label><input type="radio" name="usage-${index}" value="no"><span>Not used</span></label></div></div>`).join('');
    container.dataset.studentId=studentId; container.dataset.count=student.accommodations.length;
  }
  function saveLog(form) {
    const formData=new FormData(form), student=data.students.find(item=>item.id===formData.get('studentId'));
    if (!student) return;
    const usage={}; let missing=false;
    student.accommodations.forEach((name,index)=>{const choice=form.querySelector(`input[name="usage-${index}"]:checked`); if (!choice) missing=true; else usage[name]=choice.value==='yes';});
    if (missing) { toast('Choose Used or Not used for each accommodation'); return; }
    data.logs.push({id:uid(),studentId:student.id,date:formData.get('date'),context:formData.get('context'),usage,notes:String(formData.get('notes')||'').trim(),createdAt:new Date().toISOString()});
    persist(); closeModal(); showView(viewName); toast('Accommodation check-in saved');
  }
  function openScoreForm(studentId) {
    const student=data.students.find(item=>item.id===studentId); if (!student) return;
    openModal(`${modalHead('Record a test', `Enter the overall test score for ${escapeHtml(student.name)}. TEKS tracking is optional.`)}<form id="scoreForm" data-student="${escapeHtml(studentId)}"><div class="form-grid score-test-info"><label>Overall test score<input name="overallEarned" type="number" min="0" step="any" required placeholder="Enter the score" autofocus></label><label>Points possible <span class="optional">optional</span><input name="overallPossible" type="number" min="0.01" step="any" placeholder="For example, 100"></label><label>Test name <span class="optional">optional</span><input name="assessment" placeholder="Unit assessment"></label><label>Test date <span class="optional">optional</span><input type="date" name="date" value="${dateToday()}"></label></div><div class="score-section-title"><b>TEKS tracking <span class="optional">optional</span></b><span>Add scores only when you want to monitor individual standards.</span></div><div id="scoreRows" class="score-rows"></div>${data.teks.length?'<button type="button" class="button secondary small add-score-row" data-modal-action="add-score-row">＋ Add TEKS scores</button>':'<p class="muted">To enter individual TEKS scores, add your standards in the Set Standards tab first.</p>'}<footer class="modal-footer"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit">Save test score</button></footer></form>`, true);
  }
  function scoreRowHtml() {
    const options=data.teks.map(item=>`<option value="${escapeHtml(item.code)}" ${item.priority?'data-priority="true"':''}>${escapeHtml(item.code)}${item.priority?' · Priority':''}</option>`).join('');
    return `<div class="score-row" data-score-row><label>TEKS<select name="teks" required>${options}</select></label><label>Points earned<input name="earned" type="number" min="0" step="any" required placeholder="0"></label><label>Points possible<input name="possible" type="number" min="0.01" step="any" required placeholder="0"></label><label class="checkline priority-score"><input name="priority" type="checkbox" ${data.teks[0]?.priority?'checked':''}> Priority TEKS</label><button type="button" class="icon-button score-remove" data-modal-action="remove-score-row" aria-label="Remove this TEKS row">×</button></div>`;
  }
  function addScoreRow() {
    const container=$('scoreRows'); if (!container) return;
    container.insertAdjacentHTML('beforeend',scoreRowHtml());
    container.lastElementChild.querySelector('select')?.focus();
  }
  function saveScore(form) {
    const rows=[...form.querySelectorAll('[data-score-row]')];
    const entries=rows.map(row=>({teks:row.querySelector('[name="teks"]').value,earned:Number(row.querySelector('[name="earned"]').value),possible:Number(row.querySelector('[name="possible"]').value),priority:row.querySelector('[name="priority"]').checked}));
    if (entries.some(item=>!item.possible||item.earned<0||item.earned>item.possible)) { toast('Check each score: points earned must be between zero and points possible'); return; }
    if (new Set(entries.map(item=>item.teks)).size !== entries.length) { toast('Each TEKS can only be added once for this test'); return; }
    const fields=new FormData(form), assessment=String(fields.get('assessment')||'').trim(), date=String(fields.get('date')||'').trim(), overallEarned=Number(fields.get('overallEarned')), possibleText=String(fields.get('overallPossible')||'').trim(), overallPossible=possibleText?Number(possibleText):null;
    if (Number.isNaN(overallEarned)||overallEarned<0) { toast('Enter a valid overall test score'); return; }
    if (overallPossible!==null&&(!overallPossible||overallPossible<0||overallEarned>overallPossible)) { toast('Check the overall score and points possible'); return; }
    const testId=uid();
    data.tests.push({id:testId,studentId:form.dataset.student,assessment,date,earned:overallEarned,possible:overallPossible,createdAt:new Date().toISOString()});
    entries.forEach(item=>data.scores.push({id:uid(),testId,studentId:form.dataset.student,assessment,date,teks:item.teks,earned:item.earned,possible:item.possible,priority:item.priority,createdAt:new Date().toISOString()}));
    persist(); closeModal(); openStudent(form.dataset.student); toast(entries.length?`Test result and ${entries.length} TEKS ${entries.length===1?'score':'scores'} saved`:'Test score saved');
  }
  function openReport(studentId) {
    const student=data.students.find(item=>item.id===studentId); if (!student) return;
    const logs=data.logs.filter(item=>item.studentId===studentId).sort((a,b)=>a.date.localeCompare(b.date));
    const tests=data.tests.filter(item=>item.studentId===studentId).sort((a,b)=>recordDateKey(a).localeCompare(recordDateKey(b)));
    const scores=data.scores.filter(item=>item.studentId===studentId).sort((a,b)=>a.date.localeCompare(b.date));
    const supportNames=[...new Set([...student.accommodations,...logs.flatMap(log=>Object.keys(log.usage||{}))])];
    const accomRows=supportNames.map(name=>{const entries=logs.filter(log=>Object.hasOwn(log.usage||{},name));const used=entries.filter(log=>log.usage[name]).length;const notUsed=entries.length-used;return `<tr><td>${escapeHtml(name)}</td><td>${entries.length}</td><td>${used}</td><td>${notUsed}</td></tr>`}).join('');
    const logRows=logs.map(log=>`<tr><td>${prettyDate(log.date)}</td><td>${escapeHtml(log.context)}</td><td>${Object.entries(log.usage||{}).filter(([,used])=>used).map(([name])=>escapeHtml(name)).join(', ')||'None marked used'}</td><td>${escapeHtml(log.notes||'')}</td></tr>`).join('');
    const testRows=tests.map(test=>`<tr><td>${prettyDate(test.date)||'—'}</td><td>${escapeHtml(test.assessment||'Test')}</td><td>${formatTestScore(test)}</td><td>${test.possible?`${Math.round(100*test.earned/test.possible)}%`:'—'}</td></tr>`).join('');
    const scoreRows=scores.map(score=>`<tr><td>${prettyDate(score.date)}</td><td>${escapeHtml(score.assessment)}</td><td>${escapeHtml(score.teks)}${score.priority?' · Priority':''}</td><td>${score.earned}/${score.possible}</td><td>${Math.round(100*score.earned/score.possible)}%</td></tr>`).join('');
    $('modalRoot').innerHTML=`<div id="modalBackdrop" class="modal-backdrop report-backdrop"><section class="modal report-modal" role="dialog" aria-modal="true"><div class="report-controls"><button class="button secondary" data-modal-action="report-print">Print / Save as PDF</button><button class="button secondary" data-modal-action="report-csv" data-id="${escapeHtml(studentId)}">Download CSV</button><button class="icon-button" data-close aria-label="Close">×</button></div><article class="print-report"><header><div class="eyebrow">EduTrack · Student support record</div><h1>${escapeHtml(student.name)}</h1><p>${escapeHtml(student.grade||'Grade not entered')} · ${escapeHtml(student.supportArea)} support · Prepared ${prettyDate(dateToday())}</p><small>Teacher: ${escapeHtml(currentTeacherName())}</small></header><div class="report-metrics"><div><b>${student.accommodations.length}</b><span>Active accommodations</span></div><div><b>${logs.length}</b><span>Check-ins</span></div><div><b>${scores.length}</b><span>TEKS scores</span></div></div><section><h2>Accommodation plan</h2>${student.accommodations.length?`<ul>${student.accommodations.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:'<p>No accommodations entered.</p>'}${student.notes?`<p><b>Plan notes:</b> ${escapeHtml(student.notes)}</p>`:''}</section><section><h2>Accommodation use summary</h2>${accomRows?`<div class="table-wrap"><table><thead><tr><th>Accommodation</th><th>Records</th><th>Used</th><th>Not used</th></tr></thead><tbody>${accomRows}</tbody></table></div>`:'<p>No check-ins recorded.</p>'}</section><section><h2>Check-in history</h2>${logRows?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Accommodations used</th><th>Notes</th></tr></thead><tbody>${logRows}</tbody></table></div>`:'<p>No check-ins recorded.</p>'}</section><section><h2>Overall test scores</h2>${testRows?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Test</th><th>Score</th><th>Percent</th></tr></thead><tbody>${testRows}</tbody></table></div>`:'<p>No overall test scores recorded.</p>'}</section><section><h2>Individual TEKS scores</h2>${scoreRows?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Test</th><th>TEKS</th><th>Score</th><th>Percent</th></tr></thead><tbody>${scoreRows}</tbody></table></div>`:'<p>No TEKS scores recorded.</p>'}</section><p class="report-footnote">This report was prepared in EduTrack. Review it for accuracy before sharing.</p></article></section></div>`;
    document.body.classList.add('modal-open');
  }
  function exportStudentCSV(id) {
    const student=data.students.find(item=>item.id===id); if (!student) return;
    const rows=[['record_type','student','date','context_or_test','accommodation_or_teks','used','score','possible','notes']];
    data.logs.filter(item=>item.studentId===id).forEach(log=>Object.entries(log.usage||{}).forEach(([name,used])=>rows.push(['accommodation',student.name,log.date,log.context,name,used?'Used':'Not used','','',log.notes||''])));
    data.tests.filter(item=>item.studentId===id).forEach(test=>rows.push(['overall_test_score',student.name,test.date,test.assessment,'Overall test','',test.earned,test.possible,'']));
    data.scores.filter(item=>item.studentId===id).forEach(score=>rows.push(['score',student.name,score.date,score.assessment,score.teks,score.priority?'Priority':'',score.earned,score.possible,'']));
    downloadText(`${safeFile(student.name)}-edutrack.csv`, rows.map(row=>row.map(csvCell).join(',')).join('\r\n'), 'text/csv');
  }
  function csvCell(value) { return `"${String(value ?? '').replace(/"/g,'""')}"`; }
  function safeFile(name) { return String(name||'student').normalize('NFKD').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'student'; }
  function downloadText(name, text, type) { const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000); }
  function downloadBackup() {
    const backup={app:'EduTrack',version:1,exportedAt:new Date().toISOString(),teacher:currentTeacherName(),data};
    downloadText(`edutrack-backup-${dateToday()}.json`,JSON.stringify(backup,null,2),'application/json');toast('Backup downloaded');
  }
  async function restoreBackup(file) {
    if (!file) return;
    try {
      const parsed=JSON.parse(await file.text()); const restored=normalizeData(parsed.data||parsed);
      if (!confirm(`Restore ${restored.students.length} students and their records? This replaces this teacher's current classroom data in this browser.`)) return;
      data=restored;persist();showView('settings');toast('Backup restored');
    } catch (_) { toast('That file is not a valid EduTrack backup'); }
  }
  async function saveTeacherName() {
    const display_name=$('profileName').value.trim(); if (!display_name) { toast('Enter your name first'); return; }
    const {error}=await supabase.from('teacher_profiles').upsert({id:session.user.id,display_name});
    if (error) { toast(friendlyError(error)); return; }
    profile={...profile,display_name}; showApp(); showView('settings'); toast('Teacher name saved');
  }
  function addQuickAccommodation(form) {
    const name=new FormData(form).get('name').trim();
    if (!name) return;
    if (!ACCOMMODATIONS.includes(name)) ACCOMMODATIONS.push(name);
    const list=$('customAccomList'); const label=document.createElement('label');label.className='accom-choice';label.innerHTML='<input type="checkbox" name="accommodation" checked><span></span>';label.querySelector('input').value=name;label.querySelector('span').textContent=name;list.append(label);form.reset();
  }
  function onModalSubmitExtra(event) { if(event.target.id==='quickAddForm') addQuickAccommodation(event.target); }

  // Clicks inside the student detail dialog need the same navigation helpers.
  $('modalRoot').addEventListener('click', event => {
    const button=event.target.closest('[data-action]');if(!button)return;
    const action=button.dataset.action;
    if(action==='log') openLogForm(selectedStudent||button.dataset.id||'');
    if(action==='score') openScoreForm(button.dataset.id);
    if(action==='edit-student') openStudentForm(button.dataset.id);
    if(action==='delete-student') deleteStudent(button.dataset.id);
    if(action==='student-report') openReport(button.dataset.id);
  });

  start();
})();
