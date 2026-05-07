// FBC Lerum Pre-Season App — app.js
// ================================================================

const APP_VERSION = 'v1.0';

// ── CONFIG ──────────────────────────────────────────────────────
// Paste your Google Apps Script Web App URL here after deploying Code.gs:
let SCRIPT_URL = localStorage.getItem('fbc_script_url') || '';

// ── STATE ────────────────────────────────────────────────────────
let profile = JSON.parse(localStorage.getItem('fbc_profile') || 'null') || {
  name: '', firstName: '', lastName: '', avatar: '⚡', admin: false,
};
let state = JSON.parse(localStorage.getItem('fbc_state') || 'null') || {
  sessions: [], prs: [], attendance: {},
};
let program   = JSON.parse(localStorage.getItem('fbc_program') || '{}');
let members   = JSON.parse(localStorage.getItem('fbc_members') || '[]');
let currentSection = null;

// ── UTILITIES ────────────────────────────────────────────────────
function save() {
  localStorage.setItem('fbc_state',   JSON.stringify(state));
  localStorage.setItem('fbc_profile', JSON.stringify(profile));
}
function saveProgram() { localStorage.setItem('fbc_program', JSON.stringify(program)); }
function saveMembers() { localStorage.setItem('fbc_members', JSON.stringify(members)); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function localIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('sv-SE', { weekday:'short', month:'short', day:'numeric' });
}

let _toastTimer;
function showToast(msg, duration=2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function xhrPost(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function isAdmin() {
  return profile.admin ||
    (members.find(m => m.name === profile.name)?.admin === true) ||
    localStorage.getItem('fbc_admin') === 'true';
}

// ── DATE HEADER ──────────────────────────────────────────────────
function updateDate() {
  const now = new Date();
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  const el = document.getElementById('headerDate');
  if (el) el.textContent = now.toLocaleDateString('sv-SE', opts);
}
updateDate();
setInterval(updateDate, 60000);

// ── NAVIGATION ───────────────────────────────────────────────────
const SECTIONS = {
  log:        { icon:'📋', label:'Log',      build: buildLog,        render: renderLog },
  program:    { icon:'📅', label:'Program',  build: buildProgram,    render: renderProgram },
  timer:      { icon:'⏱', label:'Timer',     build: buildTimer,      render: () => {} },
  prs:        { icon:'🏆', label:'PRs',       build: buildPRs,        render: renderPRs },
  members:    { icon:'👥', label:'Team',      build: buildMembers,    render: renderMembers },
  attendance: { icon:'📌', label:'Presence',  build: buildAttendance, render: renderAttendance },
  standings:  { icon:'🏒', label:'Board',     build: buildStandings,  render: renderStandings },
  admin:      { icon:'🔑', label:'Admin',     build: buildAdmin,      render: renderAdmin },
};

function selectSection(name) {
  const cfg = SECTIONS[name];
  if (!cfg) return;
  const grid    = document.getElementById('homeGrid');
  const dc      = document.getElementById('dash-content');
  const navRow  = document.getElementById('headerNavRow');

  grid.classList.remove('expanded');
  grid.classList.add('section-open');

  document.querySelectorAll('.home-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.hnav-btn').forEach(b => b.classList.remove('active'));
  const hbtn = document.getElementById('hbtn-' + name);
  const hnav = document.getElementById('hnav-' + name);
  if (hbtn) hbtn.classList.add('active');
  if (hnav) hnav.classList.add('active');
  if (navRow) navRow.classList.add('visible');

  currentSection = name;
  dc.classList.remove('hidden');
  dc.innerHTML = cfg.build();
  cfg.render();
  window.scrollTo(0, 0);
}

function goHome() {
  const grid = document.getElementById('homeGrid');
  const dc   = document.getElementById('dash-content');
  const nav  = document.getElementById('headerNavRow');
  grid.classList.remove('section-open');
  grid.classList.add('expanded');
  document.querySelectorAll('.home-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.hnav-btn').forEach(b => b.classList.remove('active'));
  if (nav) nav.classList.remove('visible');
  if (dc) { dc.classList.add('hidden'); dc.innerHTML = ''; }
  currentSection = null;
  window.scrollTo(0, 0);
}

// ── PROFILE MODAL ─────────────────────────────────────────────
function openProfileModal() {
  const registered = !!profile.name;
  const modal = document.getElementById('modalContainer');
  modal.innerHTML = `
  <div class="modal-overlay" id="profileModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${registered ? 'Profil' : 'Skapa konto'}</span>
        ${registered ? `<button class="modal-close" onclick="closeModal('profileModal')">✕</button>` : ''}
      </div>
      <div class="modal-body">
        ${!registered ? `<p style="font-size:0.82rem;color:var(--muted);margin-bottom:1rem;">
          Välkommen! Ange ditt namn för att komma igång.
        </p>` : ''}

        ${!SCRIPT_URL ? `
        <div class="form-group">
          <label class="form-label">Apps Script URL</label>
          <input class="form-input" id="pScriptUrl" type="url" placeholder="https://script.google.com/..." value="${SCRIPT_URL}">
          <div style="font-size:0.7rem;color:var(--muted);margin-top:0.3rem;">Kräver av admin för synkronisering</div>
        </div>` : ''}

        <div style="display:flex;gap:0.75rem;">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Förnamn</label>
            <input class="form-input" id="pFirstName" placeholder="Anna" value="${profile.firstName || ''}">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Efternamn</label>
            <input class="form-input" id="pLastName" placeholder="Svensson" value="${profile.lastName || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Avatar</label>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
            ${['⚡','🏒','🦁','🔥','⚔️','🎯','💪','🏃','🥅','🦅','🐆','🌪️'].map(a =>
              `<button onclick="document.querySelectorAll('.av-pick').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.dataset.sel='1';" 
               class="av-pick ${(profile.avatar||'⚡')===a?'active':''}" data-av="${a}"
               style="width:2.2rem;height:2.2rem;border-radius:6px;border:2px solid ${(profile.avatar||'⚡')===a?'var(--crimson)':'var(--border)'};background:var(--card);cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;">
               ${a}</button>`).join('')}
          </div>
        </div>

        <button class="btn btn-crimson btn-full" onclick="saveProfile()">
          ${registered ? 'Spara ändringar' : 'Skapa konto'}
        </button>
        ${registered ? `<button class="btn btn-ghost btn-full" style="margin-top:0.5rem;" onclick="confirmLogout()">Logga ut</button>` : ''}
      </div>
    </div>
  </div>`;

  // Click outside to close if registered
  if (registered) {
    setTimeout(() => {
      document.getElementById('profileModal').addEventListener('click', e => {
        if (e.target.id === 'profileModal') closeModal('profileModal');
      });
    }, 100);
  }
}

function saveProfile() {
  const fn = document.getElementById('pFirstName')?.value?.trim() || '';
  const ln = document.getElementById('pLastName')?.value?.trim() || '';
  if (!fn || !ln) { showToast('Ange för- och efternamn'); return; }

  const scriptInput = document.getElementById('pScriptUrl');
  if (scriptInput && scriptInput.value.trim()) {
    SCRIPT_URL = scriptInput.value.trim();
    localStorage.setItem('fbc_script_url', SCRIPT_URL);
  }

  const activePick = document.querySelector('.av-pick.active');
  const av = activePick?.dataset.av || profile.avatar || '⚡';
  const fullName = `${fn} ${ln}`;
  const isNew = !profile.name;

  profile.firstName = fn;
  profile.lastName = ln;
  profile.name = fullName;
  profile.avatar = av;
  save();
  updateHeaderProfile();

  if (isNew && SCRIPT_URL) {
    xhrPost(SCRIPT_URL, { action: 'registerMember', firstName: fn, lastName: ln, avatar: av })
      .then(() => { showToast('✓ Registrerad!'); fetchMembers(); syncProgram(); })
      .catch(() => showToast('Registrerat lokalt (offline)'));
  } else {
    showToast('✓ Profil sparad');
  }
  closeModal('profileModal');
  applyAdminVisibility();
}

function confirmLogout() {
  if (confirm('Logga ut? All lokal data bevaras.')) {
    profile = { name:'', firstName:'', lastName:'', avatar:'⚡', admin: false };
    save();
    updateHeaderProfile();
    closeModal('profileModal');
    goHome();
    setTimeout(openProfileModal, 300);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function updateHeaderProfile() {
  const btn = document.getElementById('hdrProfileAvatar');
  if (btn) btn.textContent = profile.avatar || '👤';
}

function applyAdminVisibility() {
  const admin = isAdmin();
  const hbtnAdmin = document.getElementById('hbtn-admin');
  const hnavAdmin = document.getElementById('hnav-admin');
  if (hbtnAdmin) hbtnAdmin.style.display = admin ? '' : 'none';
  if (hnavAdmin) hnavAdmin.style.display = admin ? '' : 'none';
}

// ── SYNC ────────────────────────────────────────────────────────
async function syncAll() {
  if (!SCRIPT_URL) {
    showToast('Ange Script URL i profilen');
    openProfileModal();
    return;
  }
  showToast('⟳ Synkroniserar…');
  await Promise.all([syncProgram(), fetchMembers(), cloudPull()]);
  showToast('✓ Synkronisering klar');
}

async function syncProgram() {
  if (!SCRIPT_URL) return;
  try {
    const data = await xhrPost(SCRIPT_URL, { action: 'getProgram' });
    if (data.program) {
      program = data.program;
      saveProgram();
      if (currentSection === 'program') selectSection('program');
    }
  } catch(e) { console.warn('Sync program failed:', e); }
}

async function fetchMembers() {
  if (!SCRIPT_URL) return;
  try {
    const data = await xhrPost(SCRIPT_URL, { action: 'getMembers' });
    if (data.members) {
      members = data.members;
      saveMembers();
      // Update admin status
      const me = members.find(m => m.name === profile.name);
      if (me && me.admin) {
        profile.admin = true; save();
      }
      applyAdminVisibility();
      if (currentSection === 'members') renderMembers();
      // Update last seen
      if (profile.name) {
        xhrPost(SCRIPT_URL, { action: 'updateLastSeen', memberName: profile.name }).catch(() => {});
      }
    }
  } catch(e) { console.warn('Fetch members failed:', e); }
}

async function cloudPull() {
  if (!SCRIPT_URL || !profile.name) return;
  try {
    const data = await xhrPost(SCRIPT_URL, { action: 'cloudPull', memberName: profile.name });
    if (data.sessions) {
      // Merge — keep local items not on server
      const serverIds = new Set(data.sessions.map(s => String(s.id)));
      const localOnly = state.sessions.filter(s => !serverIds.has(String(s.id)));
      state.sessions = [...data.sessions, ...localOnly];
    }
    if (data.prs) {
      const serverIds = new Set(data.prs.map(p => String(p.id)));
      const localOnly = state.prs.filter(p => !serverIds.has(String(p.id)));
      state.prs = [...data.prs, ...localOnly];
    }
    save();
    if (currentSection === 'log') renderLog();
    if (currentSection === 'prs') renderPRs();
  } catch(e) { console.warn('Cloud pull failed:', e); }
}

async function cloudPush(type, item, deleted=false) {
  if (!SCRIPT_URL || !profile.name) return;
  try {
    await xhrPost(SCRIPT_URL, { action:'cloudPush', memberName:profile.name, type, item, deleted });
  } catch(e) { console.warn('Cloud push failed:', e); }
}

// ── LOG SECTION ──────────────────────────────────────────────────
let logTab = 'all';
function buildLog() {
  return `
  <div class="section-title">Log</div>
  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.85rem;">
    <button class="btn btn-crimson btn-sm" onclick="openSessionModal()">+ Session</button>
    <button class="btn btn-outline btn-sm" onclick="openPRModal()">+ PR</button>
    <button class="btn btn-ghost btn-sm" onclick="cloudPull()">☁ Sync</button>
  </div>
  <div class="log-tabs">
    <button class="log-tab ${logTab==='all'?'active':''}" onclick="setLogTab('all')">Alla</button>
    <button class="log-tab ${logTab==='session'?'active':''}" onclick="setLogTab('session')">Sessions</button>
    <button class="log-tab ${logTab==='pr'?'active':''}" onclick="setLogTab('pr')">PRs</button>
  </div>
  <div id="logList"></div>`;
}
function renderLog() {
  const el = document.getElementById('logList');
  if (!el) return;
  const today = localIso(new Date());

  let items = [];
  if (logTab !== 'pr') {
    items.push(...state.sessions.map(s => ({ ...s, _type:'session' })));
  }
  if (logTab !== 'session') {
    items.push(...state.prs.map(p => ({ ...p, _type:'pr' })));
  }
  items.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>
      <p>Inga loggade sessions än.</p>
      <button class="btn btn-crimson btn-sm" onclick="openSessionModal()">+ Logga session</button></div>`;
    return;
  }

  el.innerHTML = items.map((item, idx) => {
    const id = `lei_${idx}`;
    if (item._type === 'session') {
      return `<div class="log-entry">
        <div class="log-entry-header" onclick="toggleLogEntry('${id}')">
          <span class="log-badge" style="color:var(--crimson);border-color:var(--crimson);">${item.type||'SESSION'}</span>
          <span style="font-family:'Barlow Condensed';font-weight:700;font-size:0.9rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name||'Session'}</span>
          <span style="font-size:0.72rem;color:var(--muted);flex-shrink:0;">${formatDate(item.date)}</span>
          <span style="color:var(--muted);font-size:0.7rem;flex-shrink:0;">▼</span>
        </div>
        <div class="log-entry-body" id="${id}">
          ${item.score ? `<div style="font-family:'Bebas Neue';font-size:1.2rem;color:var(--green);">Score: ${item.score}</div>` : ''}
          ${item.notes ? `<div style="font-size:0.8rem;color:var(--muted);margin-top:0.3rem;white-space:pre-wrap;">${item.notes}</div>` : ''}
          ${item.parts ? renderSessionParts(item.parts) : ''}
          <div style="display:flex;gap:0.5rem;margin-top:0.65rem;">
            <button class="btn btn-outline btn-sm" onclick="deleteSession('${item.id}')">🗑 Radera</button>
          </div>
        </div>
      </div>`;
    } else {
      return `<div class="log-entry">
        <div class="log-entry-header" onclick="toggleLogEntry('${id}')">
          <span class="log-badge" style="color:var(--green);border-color:var(--green);">PR</span>
          <span style="font-family:'Barlow Condensed';font-weight:700;font-size:0.9rem;flex:1;">${item.movement}</span>
          <span style="font-family:'Bebas Neue';font-size:1rem;color:var(--green);flex-shrink:0;">${item.value}${item.unit||'kg'}</span>
          <span style="font-size:0.72rem;color:var(--muted);flex-shrink:0;margin-left:0.3rem;">${formatDate(item.date)}</span>
          <span style="color:var(--muted);font-size:0.7rem;flex-shrink:0;">▼</span>
        </div>
        <div class="log-entry-body" id="${id}">
          ${item.notes ? `<div style="font-size:0.8rem;color:var(--muted);">${item.notes}</div>` : ''}
          <div style="margin-top:0.65rem;">
            <button class="btn btn-outline btn-sm" onclick="deletePR('${item.id}')">🗑 Radera</button>
          </div>
        </div>
      </div>`;
    }
  }).join('');
}
function setLogTab(t) {
  logTab = t;
  if (currentSection === 'log') selectSection('log');
}
function toggleLogEntry(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  const chev = el.previousElementSibling?.querySelector(':last-child');
  if (chev) chev.textContent = open ? '▼' : '▲';
}
function renderSessionParts(parts) {
  if (!parts || typeof parts !== 'object') return '';
  return Object.entries(parts).map(([k,v]) => `
    <div style="margin-top:0.4rem;padding:0.4rem 0.5rem;background:var(--card2);border-radius:4px;">
      <div style="font-family:'Barlow Condensed';font-weight:700;font-size:0.75rem;color:var(--muted);">${k}</div>
      <div style="font-size:0.8rem;white-space:pre-wrap;">${v}</div>
    </div>`).join('');
}

// ── SESSION MODAL ────────────────────────────────────────────────
function openSessionModal(prefillFromProgram) {
  const today = localIso(new Date());
  const types = ['WOD','Strength','Endurance','Sprint','Team','Skills','Other'];
  document.getElementById('modalContainer').innerHTML = `
  <div class="modal-overlay" id="sessionModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">Logga Session</span>
        <button class="modal-close" onclick="closeModal('sessionModal')">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:0.5rem;">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Datum</label>
            <input class="form-input" id="sDate" type="date" value="${today}">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Typ</label>
            <select class="form-input" id="sType">
              ${types.map(t=>`<option value="${t}" ${t==='WOD'?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Namn / beskrivning</label>
          <input class="form-input" id="sName" placeholder="t.ex. Sprint 10×30m" value="${prefillFromProgram||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Score / Tid</label>
          <input class="form-input" id="sScore" placeholder="t.ex. 12:34 eller 145kg">
        </div>
        <div class="form-group">
          <label class="form-label">Anteckningar</label>
          <textarea class="form-input" id="sNotes" placeholder="Hur kändes det? Teknikpunkter..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Del A (valfritt)</label>
          <textarea class="form-input" id="sPa" placeholder="t.ex. 5×5 Backsquat 80kg" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Del B (valfritt)</label>
          <textarea class="form-input" id="sPb" placeholder="t.ex. 400m intervaller..." rows="2"></textarea>
        </div>
        <button class="btn btn-crimson btn-full" onclick="saveSession()">Spara session</button>
      </div>
    </div>
  </div>`;
}

function saveSession() {
  const name = document.getElementById('sName')?.value?.trim();
  const date = document.getElementById('sDate')?.value;
  if (!name) { showToast('Ange ett namn'); return; }
  const parts = {};
  const pa = document.getElementById('sPa')?.value?.trim();
  const pb = document.getElementById('sPb')?.value?.trim();
  if (pa) parts['Del A'] = pa;
  if (pb) parts['Del B'] = pb;
  const session = {
    id:    uid(),
    name,
    date,
    type:  document.getElementById('sType')?.value,
    score: document.getElementById('sScore')?.value?.trim(),
    notes: document.getElementById('sNotes')?.value?.trim(),
    parts: Object.keys(parts).length ? parts : null,
  };
  state.sessions.unshift(session);
  save();
  cloudPush('session', session);
  // Update attendance
  if (!state.attendance[date]) state.attendance[date] = [];
  if (!state.attendance[date].includes(profile.name)) {
    state.attendance[date].push(profile.name);
    save();
    cloudPush('attendance', { date, member: profile.name });
  }
  closeModal('sessionModal');
  showToast('✓ Session sparad!');
  if (currentSection === 'log') renderLog();
}

function deleteSession(id) {
  if (!confirm('Radera denna session?')) return;
  const s = state.sessions.find(x => x.id === id);
  state.sessions = state.sessions.filter(x => x.id !== id);
  save();
  if (s) cloudPush('session', s, true);
  showToast('Raderad');
  renderLog();
}

// ── PR MODAL ─────────────────────────────────────────────────────
const PR_MOVEMENTS = [
  '40m Sprint','100m Sprint','1km Löpning','3km Löpning',
  'Squat','Front Squat','Deadlift','Bench Press','Power Clean',
  'Pull-ups','Push-ups','Broad Jump','Box Jump',
  'Plank (tid)','Bänkpress','Hantelpress',
];
function openPRModal() {
  const today = localIso(new Date());
  document.getElementById('modalContainer').innerHTML = `
  <div class="modal-overlay" id="prModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">Logga PR</span>
        <button class="modal-close" onclick="closeModal('prModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Rörelse</label>
          <input class="form-input" id="prMov" list="prMovList" placeholder="Välj eller skriv...">
          <datalist id="prMovList">
            ${PR_MOVEMENTS.map(m=>`<option value="${m}">`).join('')}
          </datalist>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <div class="form-group" style="flex:2;">
            <label class="form-label">Värde</label>
            <input class="form-input" id="prVal" type="number" step="0.5" placeholder="0">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Enhet</label>
            <select class="form-input" id="prUnit">
              <option>kg</option><option>s</option><option>m</option><option>rep</option>
            </select>
          </div>
          <div class="form-group" style="flex:1.5;">
            <label class="form-label">Datum</label>
            <input class="form-input" id="prDate" type="date" value="${today}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Anteckningar</label>
          <input class="form-input" id="prNotes" placeholder="Valfritt">
        </div>
        <button class="btn btn-crimson btn-full" onclick="savePR()">Spara PR</button>
      </div>
    </div>
  </div>`;
}
function savePR() {
  const movement = document.getElementById('prMov')?.value?.trim();
  const value = parseFloat(document.getElementById('prVal')?.value);
  if (!movement || isNaN(value)) { showToast('Ange rörelse och värde'); return; }
  const pr = {
    id:       uid(),
    movement,
    value,
    unit:     document.getElementById('prUnit')?.value,
    date:     document.getElementById('prDate')?.value,
    notes:    document.getElementById('prNotes')?.value?.trim(),
  };
  state.prs.unshift(pr);
  save();
  cloudPush('pr', pr);
  closeModal('prModal');
  showToast('✓ PR sparad!');
  if (currentSection === 'prs') renderPRs();
  if (currentSection === 'log') renderLog();
}
function deletePR(id) {
  if (!confirm('Radera denna PR?')) return;
  const p = state.prs.find(x => x.id === id);
  state.prs = state.prs.filter(x => x.id !== id);
  save();
  if (p) cloudPush('pr', p, true);
  showToast('Raderad');
  renderLog();
}

// ── PROGRAM SECTION ──────────────────────────────────────────────
let progViewDate = localIso(new Date());
function buildProgram() {
  return `<div id="progContainer"></div>`;
}
function renderProgram() {
  const el = document.getElementById('progContainer');
  if (!el) return;
  const today = localIso(new Date());
  const d = progViewDate;
  const data = program[d];
  const isToday = d === today;
  const isFuture = d > today;

  const dayNames = { mon:'Måndag',tue:'Tisdag',wed:'Onsdag',thu:'Torsdag',fri:'Fredag',sat:'Lördag',sun:'Söndag' };
  const dateObj = new Date(d + 'T00:00:00');
  const weekday = dateObj.toLocaleDateString('sv-SE', { weekday:'long' });
  const dateDisp = dateObj.toLocaleDateString('sv-SE', { day:'numeric', month:'long' });

  el.innerHTML = `
  <div class="section-title">Program</div>
  <div class="prog-date-nav">
    <button class="prog-nav-btn" onclick="progNav(-1)">‹</button>
    <span class="prog-date-label" style="color:${isToday?'var(--gold)':isFuture?'#a78bfa':'var(--muted)'};">
      ${isToday?'Idag — ':''} ${weekday} ${dateDisp}
    </span>
    <button class="prog-nav-btn" onclick="progNav(1)">›</button>
  </div>

  ${data ? `
  <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
    <a href="https://lerumsboxen.zoezi.se/bokapass" target="_blank" rel="noopener"
      style="font-family:'Barlow Condensed';font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;background:var(--crimson);color:#fff;border:none;border-radius:3px;padding:0.35rem 0.75rem;cursor:pointer;text-decoration:none;">
      📆 Boka pass
    </a>
    <button class="btn btn-outline btn-sm" onclick="openSessionModal('${(data.strength||data.workout||'').replace(/'/g,"\\'")}')">
      + Logga session
    </button>
  </div>
  ${data.strength ? `
  <div class="prog-block">
    <div class="prog-block-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
      <span class="prog-block-label" style="color:var(--gold);">💪 Styrka</span>
      <span style="color:var(--muted);font-size:0.75rem;">▼</span>
    </div>
    <div class="prog-block-body">${enrichText(data.strength)}</div>
  </div>` : ''}
  ${data.workout ? `
  <div class="prog-block">
    <div class="prog-block-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
      <span class="prog-block-label" style="color:var(--crimson);">🏒 WOD</span>
      <span style="color:var(--muted);font-size:0.75rem;">▼</span>
    </div>
    <div class="prog-block-body">${enrichText(data.workout)}</div>
  </div>` : ''}
  ` : `
  <div class="empty-state">
    <div class="empty-icon">📅</div>
    <p>Inget program för detta datum.</p>
    <button class="btn btn-ghost btn-sm" onclick="syncProgram().then(renderProgram)">⟳ Synka program</button>
  </div>`}

  <div style="margin-top:1.25rem;">
    <div style="font-family:'Barlow Condensed';font-weight:700;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:0.5rem;">Veckoöversikt</div>
    ${buildWeekStrip()}
  </div>`;
}
function progNav(dir) {
  const d = new Date(progViewDate + 'T00:00:00');
  d.setDate(d.getDate() + dir);
  progViewDate = localIso(d);
  renderProgram();
}
function progJump(date) { progViewDate = date; renderProgram(); }
function buildWeekStrip() {
  const today = localIso(new Date());
  const d = new Date(progViewDate + 'T00:00:00');
  const dow = d.getDay();
  const monday = new Date(d); monday.setDate(d.getDate() - (dow === 0 ? 6 : dow-1));
  const days = [];
  for (let i=0;i<7;i++) { const nd=new Date(monday); nd.setDate(monday.getDate()+i); days.push(localIso(nd)); }
  return `<div style="display:flex;gap:0.25rem;">` +
    days.map(dd => {
      const has = !!program[dd];
      const isT = dd===today;
      const isSel = dd===progViewDate;
      const dayLetter = new Date(dd+'T00:00:00').toLocaleDateString('sv-SE',{weekday:'narrow'});
      return `<div onclick="progJump('${dd}')" style="flex:1;text-align:center;cursor:pointer;padding:0.35rem 0.1rem;border-radius:4px;background:${isSel?'var(--crimson)':has?'rgba(139,26,46,0.15)':'var(--card)'};border:1px solid ${isT?'var(--gold)':isSel?'transparent':'var(--border)'};">
        <div style="font-size:0.55rem;color:${isSel?'#fff':'var(--muted)'};font-family:'Barlow Condensed';font-weight:700;">${dayLetter}</div>
        <div style="font-size:0.7rem;color:${isSel?'#fff':has?'var(--text)':'var(--muted)'};font-weight:600;">${has?'●':'·'}</div>
      </div>`;
    }).join('') + `</div>`;
}
function enrichText(text) {
  if (!text) return '';
  // Highlight percentages and kg values
  return text
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '<span style="color:var(--gold);">$1%</span>')
    .replace(/(\d+(?:[.,]\d+)?)\s*kg/gi, '<span style="color:var(--green);">$1 kg</span>')
    .replace(/(\d+(?:[.,]\d+)?)\s*s\b/g, '<span style="color:var(--blue);">$1s</span>');
}

// ── PRs SECTION ───────────────────────────────────────────────────
function buildPRs() {
  return `
  <div class="section-title">PRs</div>
  <div style="display:flex;gap:0.5rem;margin-bottom:0.85rem;">
    <button class="btn btn-crimson btn-sm" onclick="openPRModal()">+ Ny PR</button>
    <input id="prSearch" class="form-input" style="flex:1;max-width:180px;padding:0.35rem 0.6rem;font-size:0.82rem;" placeholder="Sök rörelse…" oninput="renderPRs()">
  </div>
  <div id="prList"></div>`;
}
function renderPRs() {
  const el = document.getElementById('prList');
  if (!el) return;
  const q = (document.getElementById('prSearch')?.value || '').toLowerCase();
  // Best PR per movement
  const best = {};
  state.prs.forEach(p => {
    const mv = p.movement;
    if (!best[mv] || p.value > best[mv].value) best[mv] = p;
  });
  const sorted = Object.values(best)
    .filter(p => !q || p.movement.toLowerCase().includes(q))
    .sort((a,b) => a.movement.localeCompare(b.movement));

  if (!sorted.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><p>Inga PRs loggade ännu.</p></div>`;
    return;
  }
  el.innerHTML = sorted.map(p => {
    const dv = p.unit==='s'
      ? (Math.floor(p.value/60)+':'+String(Math.round(p.value%60)).padStart(2,'0'))
      : p.value + (p.unit||'kg');
    return `<div class="pr-row" onclick="editPR('${p.id}')">
      <span class="pr-name">${p.movement}</span>
      <span style="font-size:0.68rem;color:var(--muted);flex-shrink:0;">${formatDate(p.date)}</span>
      <span class="pr-val">${dv}</span>
    </div>`;
  }).join('');
}
function editPR(id) {
  const p = state.prs.find(x => x.id === id);
  if (!p) return;
  openPRModal();
  setTimeout(() => {
    const m = document.getElementById('prMov');
    const v = document.getElementById('prVal');
    const u = document.getElementById('prUnit');
    const d = document.getElementById('prDate');
    if (m) m.value = p.movement;
    if (v) v.value = p.value;
    if (u) u.value = p.unit || 'kg';
    if (d) d.value = p.date;
    // Change save button to update
    const btn = document.querySelector('#prModal .btn-crimson');
    if (btn) {
      btn.textContent = 'Uppdatera PR';
      btn.onclick = () => {
        deletePR(id);
        setTimeout(savePR, 100);
      };
    }
  }, 50);
}

// ── TIMER ─────────────────────────────────────────────────────────
let timerMode='stopwatch', timerRunning=false, timerSeconds=0, timerInterval=null;
let timerCountdown=false, startCountdownEnabled=false, timerTotalSecs=600;
let emomInterval=1, tabataWork=20, tabataRest=10, tabataRounds=8;
let timerRound=1, timerPhase='work', timerTotalRounds=8;
let amrapRounds=0;

function buildTimer() {
  return `
  <div class="section-title">Timer</div>
  <div class="timer-modes">
    ${['stopwatch','countdown','emom','amrap','tabata'].map(m=>`
    <button class="timer-mode-btn ${m===timerMode?'active':''}" onclick="setTimerMode('${m}')">${m.toUpperCase()}</button>`).join('')}
  </div>

  <div style="text-align:center;padding:1rem 0;">
    <div class="timer-label" id="timerLabel">STOPWATCH</div>
    <div class="timer-display" id="timerDisplay">00:00</div>
    <div id="timerRoundInd" style="display:none;font-family:'Barlow Condensed';font-size:0.85rem;letter-spacing:0.08em;color:var(--muted);margin-top:0.25rem;text-align:center;"></div>
    <div id="amrapCounter" style="display:none;margin-top:0.75rem;">
      <div style="font-family:'Barlow Condensed';font-weight:700;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:0.4rem;">ROUNDS COMPLETED</div>
      <div style="display:flex;border-radius:8px;overflow:hidden;border:1.5px solid var(--border);">
        <div onclick="amrapDec()" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0.85rem 0;cursor:pointer;border-right:1px solid var(--border);">
          <span style="font-family:'Bebas Neue';font-size:2rem;color:var(--muted);">−</span>
          <span style="font-size:0.6rem;color:var(--muted);font-family:'Barlow Condensed';font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Ta bort</span>
        </div>
        <div style="flex:1.2;text-align:center;padding:0.85rem 0;">
          <span id="amrapCount" style="font-family:'Bebas Neue';font-size:3rem;color:var(--crimson);display:block;line-height:1;">0</span>
          <span style="font-size:0.6rem;color:var(--muted);font-family:'Barlow Condensed';font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Rounds</span>
        </div>
        <div onclick="amrapInc()" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0.85rem 0;cursor:pointer;border-left:1px solid var(--border);">
          <span style="font-family:'Bebas Neue';font-size:2rem;color:var(--crimson);">+</span>
          <span style="font-size:0.6rem;color:var(--crimson);font-family:'Barlow Condensed';font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Lägg till</span>
        </div>
      </div>
    </div>
  </div>

  <div id="timerInputs" style="display:none;margin-bottom:1rem;padding:0.75rem;background:var(--card);border-radius:6px;border:1px solid var(--border);">
  </div>

  <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
    <button class="btn btn-crimson" id="timerStartBtn" onclick="timerToggle()">START</button>
    <button class="btn btn-outline" onclick="timerReset()">RESET</button>
    <button class="btn btn-outline ${startCountdownEnabled?'active':''}" onclick="toggleStartCountdown()" title="10s nedräkning">10s</button>
  </div>`;
}
function amrapInc() { amrapRounds++; const el=document.getElementById('amrapCount'); if(el) el.textContent=amrapRounds; }
function amrapDec() { if(amrapRounds>0){amrapRounds--;} const el=document.getElementById('amrapCount'); if(el) el.textContent=amrapRounds; }

function setTimerMode(m) {
  timerMode = m;
  timerReset();
  if (currentSection==='timer') selectSection('timer');
}
function toggleStartCountdown() {
  startCountdownEnabled = !startCountdownEnabled;
  const btn = document.querySelector('#timerStartBtn');
  showToast(startCountdownEnabled ? '10s nedräkning PÅ' : '10s nedräkning AV');
}
function timerToggle() {
  if (timerRunning || timerCountdown) {
    clearInterval(timerInterval); timerRunning=false; timerCountdown=false;
    document.getElementById('timerStartBtn').textContent='RESUME';
    return;
  }
  if (startCountdownEnabled && !timerRunning && timerSeconds===0) {
    timerCountdown=true;
    let cd=10;
    document.getElementById('timerDisplay').textContent='00:'+String(cd).padStart(2,'0');
    document.getElementById('timerLabel').textContent='STARTING IN…';
    document.getElementById('timerStartBtn').textContent='CANCEL';
    timerInterval=setInterval(()=>{
      cd--;
      if(cd<=0){ clearInterval(timerInterval); timerCountdown=false; timerStart(); return; }
      document.getElementById('timerDisplay').textContent='00:'+String(cd).padStart(2,'0');
      if(cd<=3) document.getElementById('timerDisplay').classList.add('warning');
    },1000);
    return;
  }
  timerStart();
}
function timerStart() {
  timerRunning=true;
  document.getElementById('timerDisplay').classList.remove('warning','done-pulse');
  document.getElementById('timerStartBtn').textContent='PAUSE';
  if(timerMode==='stopwatch') {
    document.getElementById('timerLabel').textContent='STOPWATCH';
    timerInterval=setInterval(()=>{ timerSeconds++; updateTimerDisplay(); },1000);
  } else if(timerMode==='countdown') {
    const mins=parseInt(document.getElementById('cdMins')?.value||10);
    const secs=parseInt(document.getElementById('cdSecs')?.value||0);
    if(timerSeconds===0) timerSeconds=(mins*60+secs);
    document.getElementById('timerLabel').textContent='COUNTDOWN';
    timerInterval=setInterval(()=>{
      timerSeconds--;
      updateTimerDisplay();
      const d=document.getElementById('timerDisplay');
      d.classList.toggle('warning',timerSeconds<=10&&timerSeconds>0);
      if(timerSeconds<=0){clearInterval(timerInterval);timerRunning=false;d.classList.add('done-pulse');d.classList.remove('warning');d.textContent='00:00';document.getElementById('timerStartBtn').textContent='START';}
    },1000);
  } else if(timerMode==='emom') {
    document.getElementById('timerLabel').textContent='EMOM';
    const intv=(parseInt(document.getElementById('emomInt')?.value||1))*60;
    const total=(parseInt(document.getElementById('emomRounds')?.value||10));
    timerTotalRounds=total; timerRound=1; timerSeconds=0;
    timerInterval=setInterval(()=>{
      timerSeconds++;
      updateTimerDisplay();
      if(timerSeconds>=intv){
        timerSeconds=0; timerRound++;
        if(timerRound>timerTotalRounds){clearInterval(timerInterval);timerRunning=false;document.getElementById('timerDisplay').classList.add('done-pulse');return;}
        updateRoundInd();
      }
    },1000);
    updateRoundInd();
  } else if(timerMode==='amrap') {
    document.getElementById('timerLabel').textContent='AMRAP';
    const total=(parseInt(document.getElementById('amrapMins')?.value||8))*60;
    timerTotalSecs=total; if(timerSeconds===0) timerSeconds=total;
    timerInterval=setInterval(()=>{
      timerSeconds--;
      updateTimerDisplay();
      if(timerSeconds<=0){clearInterval(timerInterval);timerRunning=false;document.getElementById('timerDisplay').classList.add('done-pulse');}
    },1000);
  } else if(timerMode==='tabata') {
    document.getElementById('timerLabel').textContent='TABATA';
    tabataWork=parseInt(document.getElementById('tabWork')?.value||20);
    tabataRest=parseInt(document.getElementById('tabRest')?.value||10);
    timerTotalRounds=parseInt(document.getElementById('tabRounds')?.value||8);
    timerRound=1; timerPhase='work'; timerSeconds=tabataWork;
    updateRoundInd();
    timerInterval=setInterval(()=>{
      timerSeconds--;
      updateTimerDisplay();
      const d=document.getElementById('timerDisplay');
      d.classList.toggle('warning',timerSeconds<=3&&timerSeconds>0);
      if(timerSeconds<=0){
        if(timerPhase==='work'){timerPhase='rest';timerSeconds=tabataRest;}
        else{timerPhase='work';timerRound++;timerSeconds=tabataWork;if(timerRound>timerTotalRounds){clearInterval(timerInterval);timerRunning=false;d.classList.add('done-pulse');return;}}
        updateRoundInd();
      }
    },1000);
  }
}
function updateTimerDisplay() {
  const m=Math.floor(Math.abs(timerSeconds)/60);
  const s=Math.abs(timerSeconds)%60;
  const el=document.getElementById('timerDisplay');
  if(el) el.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function updateRoundInd() {
  const el=document.getElementById('timerRoundInd');
  if(!el) return;
  if(timerMode==='emom') { el.style.display='block'; el.textContent=`Round ${timerRound} / ${timerTotalRounds}`; }
  else if(timerMode==='tabata') { el.style.display='block'; el.textContent=`Round ${timerRound}/${timerTotalRounds} · ${timerPhase==='work'?'WORK':'REST'}`; el.style.color=timerPhase==='work'?'var(--crimson)':'var(--green)'; }
  else el.style.display='none';
}
function timerReset() {
  clearInterval(timerInterval); timerRunning=false; timerCountdown=false;
  timerSeconds=0; timerRound=1; timerPhase='work'; amrapRounds=0;
  const d=document.getElementById('timerDisplay');
  if(d){d.textContent='00:00';d.classList.remove('warning','done-pulse');}
  const s=document.getElementById('timerStartBtn');
  if(s) s.textContent='START';
  const ri=document.getElementById('timerRoundInd');
  if(ri) ri.style.display='none';
  const ac=document.getElementById('amrapCount');
  if(ac) ac.textContent='0';
}

// ── MEMBERS SECTION ───────────────────────────────────────────────
function buildMembers() {
  return `
  <div class="section-title">Team</div>
  <div style="margin-bottom:0.85rem;">
    <input id="memberSearch" class="form-input" style="max-width:100%;padding:0.45rem 0.65rem;font-size:0.85rem;" placeholder="Sök spelare…" oninput="renderMembers()">
  </div>
  <div id="memberList"></div>`;
}
function renderMembers() {
  const el = document.getElementById('memberList');
  if (!el) return;
  const q = (document.getElementById('memberSearch')?.value||'').toLowerCase();
  const list = members.filter(m => !q || m.name.toLowerCase().includes(q));

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>${members.length?'Inga träffar.':'Hämtar lagmedlemmar…'}</p><button class="btn btn-ghost btn-sm" onclick="fetchMembers()">⟳ Ladda lag</button></div>`;
    return;
  }
  el.innerHTML = list.map(m => `
  <div class="member-card" onclick="openMemberProfile('${m.name.replace(/'/g,"\\'")}')">
    <div class="member-avatar">${m.avatar||'⚡'}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-family:'Bebas Neue';font-size:1.05rem;letter-spacing:0.04em;">${m.name}</div>
      ${m.lastSeen?`<div style="font-size:0.68rem;color:var(--muted);">Sist sedd ${formatDate(m.lastSeen)}</div>`:''}
    </div>
    ${m.admin?`<span style="font-size:0.6rem;font-family:'Barlow Condensed';font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:rgba(139,26,46,0.2);color:var(--crimson);border:1px solid var(--crimson);border-radius:3px;padding:0.1rem 0.35rem;">Admin</span>`:''}
    <span style="color:var(--muted);font-size:0.9rem;">›</span>
  </div>`).join('');
}
function openMemberProfile(name) {
  const m = members.find(x => x.name === name) || { name, avatar:'⚡' };
  const prs = isAdmin() ? [] : state.prs.filter(p => p.movement);
  document.getElementById('modalContainer').innerHTML = `
  <div class="modal-overlay" id="memberModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${m.name}</span>
        <button class="modal-close" onclick="closeModal('memberModal')">✕</button>
      </div>
      <div class="modal-body" style="text-align:center;">
        <div style="font-size:3.5rem;margin-bottom:0.5rem;">${m.avatar||'⚡'}</div>
        <div style="font-family:'Bebas Neue';font-size:1.4rem;">${m.name}</div>
        ${m.lastSeen?`<div style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem;">Sist sedd ${formatDate(m.lastSeen)}</div>`:''}
        ${isAdmin()&&m.name!==profile.name?`
        <button class="btn btn-outline btn-sm" style="margin-top:0.5rem;" onclick="closeModal('memberModal');adminViewMemberLogs('${m.name.replace(/'/g,"\\'")}')">
          📋 Se sessions & PRs
        </button>`:``}
      </div>
    </div>
  </div>`;
  document.getElementById('memberModal').addEventListener('click', e => { if(e.target.id==='memberModal') closeModal('memberModal'); });
}

// ── ATTENDANCE ────────────────────────────────────────────────────
function buildAttendance() {
  return `<div class="section-title">Närvaro</div><div id="attList"></div>`;
}
function renderAttendance() {
  const el = document.getElementById('attList');
  if (!el) return;
  // Count sessions per member
  const counts = {};
  state.sessions.forEach(s => {
    const n = profile.name;
    counts[n] = (counts[n]||0) + 1;
  });
  const allDates = Object.keys(state.attendance).sort().reverse();
  if (!allDates.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📌</div><p>Ingen närvaro loggad ännu.<br>Logga en session för att registrera närvaro.</p></div>`;
    return;
  }
  el.innerHTML = `
  <div style="margin-bottom:1rem;">
    <div style="font-family:'Barlow Condensed';font-weight:700;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:0.5rem;">Din närvaro — ${state.sessions.length} sessions</div>
    ${allDates.slice(0,20).map(d=>`
    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border);">
      <span style="font-size:0.82rem;flex:1;">${formatDate(d)}</span>
      <span style="font-size:0.72rem;color:var(--green);">✓ Närvaro</span>
    </div>`).join('')}
  </div>`;
}

// ── STANDINGS (floorball pre-season specifics) ─────────────────────
function buildStandings() {
  return `<div class="section-title">Board</div><div id="standList"></div>`;
}
function renderStandings() {
  const el = document.getElementById('standList');
  if (!el) return;

  // Calculate member stats from sessions
  const memberStats = {};
  // For this demo, count from known members
  members.forEach(m => {
    memberStats[m.name] = { name: m.name, avatar: m.avatar||'⚡', sessions: 0, prs: 0 };
  });
  // Local user's own stats
  if (profile.name) {
    if (!memberStats[profile.name]) memberStats[profile.name] = { name:profile.name, avatar:profile.avatar||'⚡', sessions:0, prs:0 };
    memberStats[profile.name].sessions = state.sessions.length;
    memberStats[profile.name].prs = state.prs.length;
  }
  const ranked = Object.values(memberStats)
    .filter(m => m.sessions > 0 || m.prs > 0)
    .sort((a,b) => b.sessions - a.sessions || b.prs - a.prs);

  if (!ranked.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏒</div><p>Inga data att visa ännu.<br>Börja logga sessions!</p></div>`;
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = `
  <div style="margin-bottom:0.75rem;">
    <div style="display:grid;grid-template-columns:2rem 1fr 4rem 4rem;gap:0.5rem;padding:0.3rem 0.5rem;font-family:'Barlow Condensed';font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);">
      <span>#</span><span>Spelare</span><span style="text-align:center;">Sessions</span><span style="text-align:center;">PRs</span>
    </div>
    ${ranked.map((m,i)=>`
    <div style="display:grid;grid-template-columns:2rem 1fr 4rem 4rem;gap:0.5rem;align-items:center;padding:0.6rem 0.5rem;background:${m.name===profile.name?'rgba(139,26,46,0.15)':'var(--card)'};border:1px solid ${m.name===profile.name?'var(--crimson)':'var(--border)'};border-radius:6px;margin-bottom:0.35rem;">
      <span style="font-family:'Bebas Neue';font-size:1rem;">${medals[i]||i+1}</span>
      <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
        <span style="font-size:1rem;">${m.avatar}</span>
        <span style="font-family:'Barlow Condensed';font-weight:700;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.name}</span>
      </div>
      <span style="text-align:center;font-family:'Bebas Neue';font-size:1.1rem;color:var(--crimson);">${m.sessions}</span>
      <span style="text-align:center;font-family:'Bebas Neue';font-size:1.1rem;color:var(--green);">${m.prs}</span>
    </div>`).join('')}
  </div>`;
}

// ── ADMIN SECTION ─────────────────────────────────────────────────
function buildAdmin() {
  if (!isAdmin()) return `<div class="empty-state"><div class="empty-icon">🔒</div><p>Admin only</p></div>`;
  return `
  <div class="section-title">Admin</div>
  <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
    <button class="btn btn-outline btn-sm" onclick="adminLoadAllSessions()">⟳ Ladda alla sessions</button>
    <button class="btn btn-outline btn-sm" onclick="adminSyncMembers()">👥 Uppdatera lag</button>
  </div>
  <div id="adminContent">
    <div class="empty-state"><div class="empty-icon">🔑</div><p>Tryck "Ladda alla sessions" för att se teamets logg.</p></div>
  </div>`;
}
function renderAdmin() {}

async function adminLoadAllSessions() {
  if (!SCRIPT_URL) { showToast('Ange Script URL'); return; }
  const el = document.getElementById('adminContent');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);">Laddar…</div>';
  try {
    const data = await xhrPost(SCRIPT_URL, { action: 'adminGetAllSessions' });
    const sessions = data.sessions || [];
    if (!sessions.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Inga sessions ännu.</p></div>';
      return;
    }
    // Group by member
    const byMember = {};
    sessions.forEach(s => {
      if (!byMember[s.member]) byMember[s.member] = [];
      byMember[s.member].push(s);
    });
    el.innerHTML = Object.keys(byMember).sort().map(name => `
    <div style="margin-bottom:1.25rem;">
      <div style="font-family:'Bebas Neue';font-size:1rem;letter-spacing:0.08em;color:var(--crimson);margin-bottom:0.5rem;padding-bottom:0.3rem;border-bottom:1px solid var(--border);">
        ${name} <span style="font-family:'Barlow Condensed';font-size:0.75rem;color:var(--muted);">${byMember[name].length} sessions</span>
      </div>
      ${byMember[name].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map((s,idx)=>{
        const sid = `adms_${name.replace(/\s/g,'_')}_${idx}`;
        return `<div class="admin-session-card">
          <div class="admin-session-header" onclick="adminToggleSession('${sid}')">
            <span class="log-badge" style="color:var(--crimson);border-color:var(--crimson);">${s.type||'SESSION'}</span>
            <span style="font-family:'Barlow Condensed';font-weight:700;font-size:0.85rem;flex:1;">${s.name||'Session'}</span>
            <span style="font-size:0.72rem;color:var(--muted);">${formatDate(s.date)}</span>
            <span style="font-size:0.7rem;color:var(--muted);">▼</span>
          </div>
          <div class="admin-session-body" id="${sid}">
            ${s.score?`<div style="font-family:'Bebas Neue';font-size:1.1rem;color:var(--green);margin-top:0.4rem;">Score: ${s.score}</div>`:''}
            ${s.notes?`<div style="font-size:0.8rem;color:var(--muted);margin-top:0.3rem;white-space:pre-wrap;">${s.notes}</div>`:''}
            ${s.parts?Object.entries(s.parts).map(([k,v])=>`
            <div style="margin-top:0.5rem;padding:0.4rem 0.6rem;background:var(--card2);border-radius:4px;">
              <div style="font-family:'Barlow Condensed';font-weight:700;font-size:0.72rem;color:var(--muted);">${k}</div>
              <div style="font-size:0.8rem;white-space:pre-wrap;">${v}</div>
              <div style="margin-top:0.35rem;">
                <textarea class="log-comment-input" id="cmt_${s.id}_${k.replace(/\s/g,'_')}" placeholder="Kommentar till ${k}…" rows="2"></textarea>
                <button class="btn btn-outline btn-sm" style="margin-top:0.25rem;" onclick="saveAdminComment('${s.id}','${k.replace(/'/g,"\\'")}','cmt_${s.id}_${k.replace(/\s/g,'_')}')">Spara kommentar</button>
              </div>
            </div>`).join(''):''}
            <div style="margin-top:0.6rem;">
              <div style="font-family:'Barlow Condensed';font-weight:700;font-size:0.72rem;color:var(--muted);margin-bottom:0.25rem;">Kommentar till hela sessionen</div>
              <textarea class="log-comment-input" id="cmt_${s.id}_session" placeholder="Kommentar till sessionen…" rows="2"></textarea>
              <button class="btn btn-outline btn-sm" style="margin-top:0.25rem;" onclick="saveAdminComment('${s.id}','session','cmt_${s.id}_session')">Spara kommentar</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('');
    // Load existing comments
    adminLoadComments(sessions.map(s=>s.id));
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Fel: ${e.message}</p></div>`;
  }
}

function adminToggleSession(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  const chev = el.previousElementSibling?.querySelector(':last-child');
  if (chev) chev.textContent = open ? '▼' : '▲';
}

async function saveAdminComment(sessionId, partKey, inputId) {
  const el = document.getElementById(inputId);
  const comment = el?.value?.trim();
  if (!comment) { showToast('Skriv en kommentar'); return; }
  if (!SCRIPT_URL) { showToast('Script URL saknas'); return; }
  try {
    await xhrPost(SCRIPT_URL, { action:'saveComment', sessionId, partKey, comment, adminName:profile.name });
    showToast('✓ Kommentar sparad!');
  } catch(e) { showToast('Fel: '+e.message); }
}

async function adminLoadComments(sessionIds) {
  if (!SCRIPT_URL) return;
  for (const sid of sessionIds) {
    try {
      const data = await xhrPost(SCRIPT_URL, { action:'getComments', sessionId:String(sid) });
      if (data.comments) {
        data.comments.forEach(c => {
          const inputId = `cmt_${sid}_${c.partKey.replace(/\s/g,'_')}`;
          const el = document.getElementById(inputId);
          if (el && !el.value) el.value = c.comment;
          // Show existing comment
          const commentBox = el?.nextElementSibling;
          if (commentBox) {
            const existing = el.parentElement.querySelector('.admin-existing-comment');
            if (!existing) {
              const div = document.createElement('div');
              div.className = 'log-comment-box admin-existing-comment';
              div.innerHTML = `<strong>${c.admin}:</strong> ${c.comment} <span style="font-size:0.65rem;color:var(--muted);">${c.ts}</span>`;
              el.parentElement.insertBefore(div, el);
            }
          }
        });
      }
    } catch(e) {}
  }
}

async function adminViewMemberLogs(memberName) {
  if (!SCRIPT_URL) { showToast('Script URL saknas'); return; }
  const modal = document.getElementById('modalContainer');
  modal.innerHTML = `
  <div class="modal-overlay" id="memberLogsModal">
    <div class="modal-box" style="max-width:480px;">
      <div class="modal-header">
        <span class="modal-title">${memberName} — Log & PRs</span>
        <button class="modal-close" onclick="closeModal('memberLogsModal')">✕</button>
      </div>
      <div style="display:flex;border-bottom:1px solid var(--border);">
        <button id="mlTab1" onclick="mlSwitch('sessions')" style="flex:1;padding:0.6rem;font-family:'Barlow Condensed';font-weight:700;font-size:0.82rem;letter-spacing:0.1em;text-transform:uppercase;background:none;border:none;border-bottom:2px solid var(--crimson);color:var(--text);cursor:pointer;">Sessions</button>
        <button id="mlTab2" onclick="mlSwitch('prs')" style="flex:1;padding:0.6rem;font-family:'Barlow Condensed';font-weight:700;font-size:0.82rem;letter-spacing:0.1em;text-transform:uppercase;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);cursor:pointer;">PRs</button>
      </div>
      <div id="mlBody" style="padding:1rem;max-height:60dvh;overflow-y:auto;">
        <div style="text-align:center;padding:2rem;color:var(--muted);">Laddar…</div>
      </div>
    </div>
  </div>`;

  try {
    const data = await xhrPost(SCRIPT_URL, { action:'cloudPull', memberName });
    window._mlData = data;
    mlSwitch('sessions');
  } catch(e) {
    document.getElementById('mlBody').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}
function mlSwitch(tab) {
  const t1=document.getElementById('mlTab1');
  const t2=document.getElementById('mlTab2');
  const b=document.getElementById('mlBody');
  if(!b) return;
  if(t1){t1.style.borderBottomColor=tab==='sessions'?'var(--crimson)':'transparent';t1.style.color=tab==='sessions'?'var(--text)':'var(--muted)';}
  if(t2){t2.style.borderBottomColor=tab==='prs'?'var(--crimson)':'transparent';t2.style.color=tab==='prs'?'var(--text)':'var(--muted)';}
  const d=window._mlData||{sessions:[],prs:[]};
  if(tab==='sessions'){
    const s=(d.sessions||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    if(!s.length){b.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><p>Inga sessions.</p></div>';return;}
    b.innerHTML=s.map((item,i)=>{
      const id=`mls_${i}`;
      return `<div class="log-entry">
        <div class="log-entry-header" onclick="toggleLogEntry('${id}')">
          <span class="log-badge" style="color:var(--crimson);border-color:var(--crimson);">${item.type||'SESSION'}</span>
          <span style="font-family:'Barlow Condensed';font-weight:700;font-size:0.85rem;flex:1;">${item.name||'Session'}</span>
          <span style="font-size:0.7rem;color:var(--muted);">${formatDate(item.date)}</span>
          <span style="color:var(--muted);font-size:0.7rem;">▼</span>
        </div>
        <div class="log-entry-body" id="${id}">
          ${item.score?`<div style="font-family:'Bebas Neue';font-size:1.1rem;color:var(--green);">Score: ${item.score}</div>`:''}
          ${item.notes?`<div style="font-size:0.8rem;color:var(--muted);white-space:pre-wrap;">${item.notes}</div>`:''}
          ${item.parts?Object.entries(item.parts).map(([k,v])=>`<div style="margin-top:0.4rem;padding:0.4rem;background:var(--card2);border-radius:4px;"><div style="font-size:0.7rem;color:var(--muted);font-family:'Barlow Condensed';font-weight:700;">${k}</div><div style="font-size:0.8rem;">${v}</div></div>`).join(''):''}
        </div>
      </div>`;}).join('');
  } else {
    const p=(d.prs||[]).sort((a,b)=>a.movement.localeCompare(b.movement));
    if(!p.length){b.innerHTML='<div class="empty-state"><div class="empty-icon">🏆</div><p>Inga PRs.</p></div>';return;}
    b.innerHTML=p.map(pr=>{
      const dv=pr.unit==='s'?(Math.floor(pr.value/60)+':'+String(Math.round(pr.value%60)).padStart(2,'0')):pr.value+(pr.unit||'kg');
      return `<div class="pr-row"><span class="pr-name">${pr.movement}</span><span class="pr-val">${dv}</span></div>`;
    }).join('');
  }
}

function adminSyncMembers() { fetchMembers().then(()=>showToast('✓ Lag uppdaterat')); }

// ── SERVICE WORKER ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── STARTUP ───────────────────────────────────────────────────────
updateHeaderProfile();
applyAdminVisibility();
if (!profile.name) {
  setTimeout(openProfileModal, 600);
} else {
  setTimeout(() => { syncProgram(); fetchMembers(); cloudPull(); }, 2000);
}
