'use strict';

/* ===== State ===== */
const K = { users: 'mehub_users', session: 'mehub_session', students: 'mehub_students', att: 'mehub_attendance' };
const STATUSES = ['Present', 'Absent', 'Late'];
const TITLES = { dashboard: 'Dashboard', attendance: 'Attendance', students: 'Students', reports: 'Reports', settings: 'Settings' };
let page = 'dashboard';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const nowTime = () => new Date().toTimeString().slice(0, 5);

/* ===== Storage ===== */
function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
const write = (key, val) => localStorage.setItem(key, JSON.stringify(val));
const list = key => { const v = read(key, []); return Array.isArray(v) ? v : []; };
// students() also accepts records saved by the older dashboard (studentId/className)
const users = () => list(K.users), students = () => list(K.students).map(x => ({ ...x, name: x.name ?? '', sid: x.sid ?? x.studentId ?? '', cls: x.cls ?? x.className ?? '' })), records = () => list(K.att);

function seed() {
  // Seed only when a key has never existed, so cleared or edited data is never recreated.
  if (localStorage.getItem(K.users) === null)
    write(K.users, [{ name: 'Demo Admin', email: 'admin@mehub.local', password: 'admin123', role: 'Administrator' }]);
  if (localStorage.getItem(K.students) === null)
    write(K.students, [['Amina Yusuf', 'S001', 'Class 5A'], ['Daniel Okoro', 'S002', 'Class 5A'], ['Grace Bello', 'S003', 'Class 5B'], ['Samuel Ade', 'S004', 'Class 5B']]
      .map(([name, sid, cls]) => ({ id: crypto.randomUUID(), name, sid, cls })));
}

/* ===== Notifications & modals ===== */
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3000);
}
function modal(title, body, okLabel, onOk, danger) {
  const d = $('#modal');
  d.innerHTML = `<form novalidate><h2>${esc(title)}</h2>${body}<p class="err" id="mErr"></p><div class="row end"><button type="button" class="btn" id="mNo">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}">${esc(okLabel)}</button></div></form>`;
  $('#mNo', d).onclick = () => d.close();
  $('form', d).onsubmit = e => { e.preventDefault(); const err = onOk(d); if (err) $('#mErr', d).textContent = err; else d.close(); };
  d.showModal();
  const first = $('input', d); if (first) first.focus();
}

/* ===== Authentication ===== */
const session = () => read(K.session, null) || JSON.parse(sessionStorage.getItem(K.session) || 'null');
const currentUser = () => { const s = session(); return s && users().find(u => u.email === s.email); };

function fieldErrors(errs) {
  $$('[data-err]').forEach(p => p.textContent = '');
  Object.entries(errs).forEach(([k, v]) => { const p = $(`[data-err="${k}"]`); if (p) p.textContent = v; });
  return !Object.keys(errs).length;
}
const val = id => $('#' + id).value.trim();
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const pwError = p => (p.length < 6 || !/[a-z]/i.test(p) || !/\d/.test(p)) ? 'Use at least 6 characters with a letter and a number.' : '';

function signIn(e) {
  e.preventDefault();
  const id = val('siId').toLowerCase(), pw = $('#siPw').value, errs = {};
  if (!id) errs.siId = 'Enter your email or username.';
  if (!pw) errs.siPw = 'Enter your password.';
  if (!fieldErrors(errs)) return;
  const u = users().find(x => x.email.toLowerCase() === id || x.name.toLowerCase() === id);
  if (!u || u.password !== pw) return fieldErrors({ form: 'Incorrect email/username or password.' });
  const data = JSON.stringify({ email: u.email });
  localStorage.removeItem(K.session); sessionStorage.removeItem(K.session);
  ($('#siRem').checked ? localStorage : sessionStorage).setItem(K.session, data);
  e.target.reset(); toast('Signed in successfully.'); route('dashboard');
}
function signUp(e) {
  e.preventDefault();
  const name = val('suName'), email = val('suEmail').toLowerCase(), pw = $('#suPw').value, errs = {};
  if (!name) errs.suName = 'Full name is required.';
  if (!email) errs.suEmail = 'Email is required.';
  else if (!emailOk(email)) errs.suEmail = 'Enter a valid email address.';
  else if (users().some(u => u.email.toLowerCase() === email)) errs.suEmail = 'An account with this email already exists.';
  if (pwError(pw)) errs.suPw = pwError(pw);
  if (pw !== $('#suPw2').value) errs.suPw2 = 'Passwords do not match.';
  if (!fieldErrors(errs)) return;
  write(K.users, [...users(), { name, email, password: pw, role: 'Administrator' }]);
  e.target.reset(); toast('Account created. Please sign in.'); show('signin');
}
function recover(e) {
  e.preventDefault();
  const step2 = $('#rcStep2');
  const u = users().find(x => x.email.toLowerCase() === val('rcEmail').toLowerCase());
  if (step2.hidden) {
    if (!u) return fieldErrors({ rcEmail: 'No account with this email exists on this device.' });
    fieldErrors({}); step2.hidden = false; $('#rcEmail').readOnly = true; $('#rcBtn').textContent = 'Set new password'; return;
  }
  const pw = $('#rcPw').value, errs = {};
  if (pwError(pw)) errs.rcPw = pwError(pw);
  if (pw !== $('#rcPw2').value) errs.rcPw2 = 'Passwords do not match.';
  if (!fieldErrors(errs)) return;
  write(K.users, users().map(x => x === u || x.email === u.email ? { ...x, password: pw } : x));
  resetRecover(); toast('Password updated. Please sign in.'); show('signin');
}
function resetRecover() {
  $('#fRecover').reset(); $('#rcStep2').hidden = true; $('#rcEmail').readOnly = false; $('#rcBtn').textContent = 'Verify account'; fieldErrors({});
}
function logout() {
  localStorage.removeItem(K.session); sessionStorage.removeItem(K.session);
  $('#app').classList.remove('shell-open'); toast('Signed out.'); route('signin');
}

/* ===== Navigation ===== */
function show(view) { // public views
  $('#app').hidden = true; $('#public').hidden = false;
  $$('.view').forEach(v => v.hidden = v.dataset.view !== view);
  fieldErrors({}); window.scrollTo(0, 0);
}
function route(target) {
  const protectedView = !!TITLES[target];
  if (protectedView && !currentUser()) return show('signin');
  if (!protectedView) return show(target);
  page = target;
  $('#public').hidden = true; $('#app').hidden = false; $('#app').classList.remove('shell-open');
  $$('.page').forEach(p => p.hidden = p.dataset.page !== page);
  $$('.side [data-page]').forEach(b => { b.classList.toggle('active', b.dataset.page === page); b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'); });
  $('#pageTitle').textContent = TITLES[page]; $('#userName').textContent = currentUser().name;
  render(); window.scrollTo(0, 0);
}
const render = () => ({ dashboard: renderDashboard, students: renderStudents, attendance: renderAttendance, reports: renderReports, settings: renderSettings })[page]();

/* ===== Helpers for data ===== */
const nameOf = id => (students().find(s => s.id === id) || { name: 'Removed student' }).name;
const tag = s => `<span class="tag ${s}">${s}</span>`;
const rate = (p, l, t) => t ? Math.round((p + l) / t * 100) + '%' : '—';
const count = (recs, s) => recs.filter(r => r.status === s).length;
const matches = (s, q) => !q || s.name.toLowerCase().includes(q) || s.sid.toLowerCase().includes(q);
function showEmpty(el, tbody, isEmpty, msg) { el.hidden = !isEmpty; if (msg) el.textContent = msg; tbody.closest('table').hidden = isEmpty; }

/* ===== Dashboard ===== */
const ICO = {
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M17 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.5-1.5-4.5-4-5.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
};
const ico = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
function renderDashboard() {
  const key = today(), h = new Date().getHours(), all = students();
  const [y, m, d] = key.split('-').map(Number);
  $('#greeting').textContent = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  $('#todayLabel').textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const recs = records().filter(r => r.date === key && all.some(s => s.id === r.studentId));
  const p = count(recs, 'Present'), l = count(recs, 'Late'), a = count(recs, 'Absent');
  const pct = all.length ? Math.round((p + l) / all.length * 100) : 0;
  $('#stats').innerHTML = [['Total Students', all.length, 'var(--blue)', 'users'], ['Present Today', p, 'var(--ok)', 'check'], ['Absent Today', a, 'var(--bad)', 'x'], ['Attendance Rate', pct + '%', 'var(--cyan)', 'chart']]
    .map(([k, v, c, i]) => `<div class="stat" style="--c:${c}"><div><span>${k}</span><strong>${v}</strong></div><i class="stat-ico">${ico(i)}</i></div>`).join('');
  const badge = st => st ? `<span class="badge ${st.toLowerCase()}">${st}</span>` : '<span class="badge none">Not marked</span>';
  const q = $('#dashSearch').value.trim().toLowerCase(), found = all.filter(s => matches(s, q));
  const rows = found.map(s => {
    const r = recs.find(x => x.studentId === s.id);
    return `<tr><td>${esc(s.name)}<br><small>${esc(s.sid)}</small></td><td>${badge(r && r.status)}</td><td>${r && r.status !== 'Absent' && r.time ? r.time : '—'}</td></tr>`;
  }).join('');
  $('#dashList').innerHTML = !all.length
    ? '<div class="empty"><h3>No Students</h3><p>No students have been added yet.</p><button class="btn primary" data-act="addStudent">Add Student</button></div>'
    : !found.length
      ? '<div class="empty"><h3>No students found</h3><p>Try a different name or student ID.</p></div>'
      : `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Status</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ===== Students ===== */
function renderStudents() {
  const q = $('#stSearch').value.trim().toLowerCase(), all = students(), rows = all.filter(s => matches(s, q));
  $('#stBody').innerHTML = rows.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.sid)}</td><td>${esc(s.cls)}</td><td><button class="link" data-act="edit" data-id="${s.id}">Edit</button><button class="link" data-act="del" data-id="${s.id}">Delete</button></td></tr>`).join('');
  showEmpty($('#stEmpty'), $('#stBody'), !rows.length, all.length ? 'No students match your search.' : 'No students yet. Use “Add Student” to create your first one.');
}
function studentForm(s = {}) {
  const f = (id, label, v) => `<label for="${id}">${label}</label><input id="${id}" value="${esc(v || '')}">`;
  return f('fName', 'Full name', s.name) + f('fSid', 'Student ID', s.sid) + f('fCls', 'Class', s.cls);
}
function studentModal(s) {
  modal(s ? 'Edit student' : 'Add student', studentForm(s), s ? 'Save changes' : 'Add student', d => {
    const name = $('#fName', d).value.trim(), sid = $('#fSid', d).value.trim(), cls = $('#fCls', d).value.trim();
    if (!name || !sid || !cls) return 'All fields are required.';
    if (students().some(x => x.sid.toLowerCase() === sid.toLowerCase() && (!s || x.id !== s.id))) return 'That student ID is already in use.';
    write(K.students, s ? students().map(x => x.id === s.id ? { ...x, name, sid, cls } : x) : [...students(), { id: crypto.randomUUID(), name, sid, cls }]);
    toast(s ? 'Student updated.' : 'Student added successfully.'); render();
  });
}
function deleteStudent(id) {
  const s = students().find(x => x.id === id); if (!s) return;
  modal('Delete student', `<p>Delete <b>${esc(s.name)}</b> and their attendance records? This cannot be undone.</p>`, 'Delete', () => {
    write(K.students, students().filter(x => x.id !== id)); write(K.att, records().filter(r => r.studentId !== id));
    toast('Student deleted.'); render();
  }, true);
}

/* ===== Attendance ===== */
function renderAttendance() {
  const date = $('#atDate').value || today(), q = $('#atSearch').value.trim().toLowerCase(), f = $('#atFilter').value;
  $('#atDate').value = date;
  const recs = records().filter(r => r.date === date), all = students();
  const rows = all.filter(s => matches(s, q)).filter(s => { const r = recs.find(x => x.studentId === s.id); return !f || (f === 'none' ? !r : r && r.status === f); });
  $('#atBody').innerHTML = rows.map(s => {
    const cur = (recs.find(x => x.studentId === s.id) || {}).status;
    return `<tr><td>${esc(s.name)}<br><small class="muted">${esc(s.sid)}</small></td><td>${esc(s.cls)}</td><td><div class="seg" role="group" aria-label="Status for ${esc(s.name)}">${STATUSES.map(st => `<button data-act="mark" data-id="${s.id}" data-st="${st}" aria-pressed="${cur === st}">${st}</button>`).join('')}</div></td></tr>`;
  }).join('');
  showEmpty($('#atEmpty'), $('#atBody'), !rows.length, all.length ? 'No students match these filters.' : 'Add students first to record attendance.');
}
function mark(id, status) {
  const date = $('#atDate').value || today(), recs = records(), i = recs.findIndex(r => r.studentId === id && r.date === date);
  const rec = { studentId: id, date, status, time: nowTime() };
  if (i >= 0) recs[i] = rec; else recs.push(rec); // one record per student per date
  write(K.att, recs); toast('Attendance updated.'); renderAttendance();
}

/* ===== Reports ===== */
function renderReports() {
  const sel = $('#rpStudent'), keep = sel.value;
  sel.innerHTML = '<option value="">All students</option>' + students().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = students().some(s => s.id === keep) ? keep : '';
  const d = $('#rpDate').value, st = $('#rpStatus').value;
  const recs = records().filter(r => (!d || r.date === d) && (!sel.value || r.studentId === sel.value) && (!st || r.status === st));
  const [p, a, l] = STATUSES.map(s => count(recs, s));
  $('#rpCards').innerHTML = [['Total Students', students().length], ['Present', p], ['Absent', a], ['Late', l], ['Attendance %', rate(p, l, recs.length)]]
    .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  $('#rpBar').innerHTML = recs.length ? [[p, 'Present'], [a, 'Absent'], [l, 'Late']].map(([n, s]) => `<i class="${s}" style="width:${n / recs.length * 100}%" title="${s}: ${n}"></i>`).join('') : '';
  $('#rpNote').textContent = recs.length ? `${recs.length} record(s). Attendance % counts Present and Late.` : 'No records to chart.';
  const rows = students().filter(s => !sel.value || s.id === sel.value).map(s => {
    const r = recs.filter(x => x.studentId === s.id);
    return r.length ? `<tr><td>${esc(s.name)}</td><td>${count(r, 'Present')}</td><td>${count(r, 'Absent')}</td><td>${count(r, 'Late')}</td><td>${rate(count(r, 'Present'), count(r, 'Late'), r.length)}</td></tr>` : '';
  }).join('');
  $('#rpBody').innerHTML = rows; showEmpty($('#rpEmpty'), $('#rpBody'), !rows);
}

/* ===== Settings ===== */
function renderSettings() {
  const u = currentUser();
  $('#profile').innerHTML = `<dt>Name</dt><dd>${esc(u.name)}</dd><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Role</dt><dd>${esc(u.role || 'Administrator')}</dd>`;
}
function clearData(what) {
  const msg = { att: 'all attendance records', st: 'all students and their attendance records', all: 'all students and attendance. Accounts are kept' }[what];
  modal('Confirm', `<p>This will permanently delete ${msg}.</p>`, 'Delete data', () => {
    if (what !== 'att') write(K.students, []);
    write(K.att, []); toast('Data cleared.'); render();
  }, true);
}

/* ===== Initialization ===== */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const { go, page: pg, act, id, st, what } = b.dataset;
  if (go) { if (go === 'recover') resetRecover(); route(go); }
  else if (pg) route(pg);
  else if (act === 'menu') $('#app').classList.toggle('shell-open');
  else if (act === 'logout') logout();
  else if (act === 'togglepw') { const i = $('#siPw'); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
  else if (act === 'addStudent') studentModal();
  else if (act === 'edit') studentModal(students().find(s => s.id === id));
  else if (act === 'del') deleteStudent(id);
  else if (act === 'mark') mark(id, st);
  else if (act === 'clear') clearData(what);
  else if (act === 'resetReport') { $('#rpDate').value = ''; $('#rpStatus').value = ''; $('#rpStudent').value = ''; renderReports(); }
});
$('.scrim').addEventListener('click', () => $('#app').classList.remove('shell-open'));
$('#fSignin').onsubmit = signIn; $('#fSignup').onsubmit = signUp; $('#fRecover').onsubmit = recover;
['#dashSearch', '#stSearch', '#atSearch', '#atFilter', '#atDate', '#rpDate', '#rpStudent', '#rpStatus'].forEach(s => $(s).addEventListener('input', render));
seed();
route(currentUser() ? 'dashboard' : 'landing');
