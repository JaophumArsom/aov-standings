/* ============================================================
   อารีน่า 5v5 — บันทึกผลการแข่งขันและตารางคะแนน Arena of Valor
   Static + localStorage (ไม่ต้องมี server)
   ธีมขาว/น้ำเงิน/ฟ้า · ระบบกลุ่ม · โลโก้ทีม · คิลรายเกม ·
   Tiebreaker Group Stage (ผลต่างชนะแพ้ → คิล → ตาย → H2H)
   ============================================================ */

/* ========== MODE: หน้าบ้าน (public) vs หลังบ้าน (admin) ==========
   แต่ละหน้า HTML ตั้ง window.PAGE_MODE ก่อนโหลด app.js
   index.html  = public (เห็นแค่ตารางคะแนน, อ่านอย่างเดียว)
   admin.html  = admin  (ควบคุมทั้งหมด) */
const IS_ADMIN = (typeof window !== 'undefined' && window.PAGE_MODE === 'admin');

/* ========== FIREBASE (ข้อมูลกลาง) ==========
   index/admin โหลด CDN firebase + firebase_config.js
   - หลังบ้าน (admin) เขียนข้อมูลที่ node "standings"
   - ทุกหน้า (admin/public) subscribe อ่าน real-time
   - config ไม่ครบ / offline → ใช้ localStorage (โหมดเดิม) */
let fbApp = null;
let fbDb = null;
let fbReady = false;     // แน่ใจว่าเชื่อม Firebase ได้
let cloudState = null;   // state ล่าสุดจาก Firebase (subscribe)
let fbListener = null;   // reference ของ listener ที่ subscribe ไว้ (กันซ้ำ)

function hasFirebase() {
  return typeof window !== 'undefined' && typeof window.firebase !== 'undefined';
}

function fbConfigOk() {
  const c = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || null;
  if (!c) return false;
  return !!(c.apiKey && c.apiKey !== 'YOUR_API_KEY' && c.databaseURL && c.projectId && c.projectId !== 'YOUR_PROJECT');
}

function initFirebase() {
  if (fbDb || !hasFirebase() || !fbConfigOk()) return;
  try {
    const cfg = window.FIREBASE_CONFIG;
    fbApp = window.firebase.initializeApp(cfg);
    fbDb = window.firebase.database(fbApp);
    fbReady = true;
    console.log('🔥 Firebase connected:', cfg.databaseURL);

    const ref = fbDb.ref('standings');
    fbListener !== null && ref.off('value', fbListener); // no-op ป้องกันซ้ำ
    fbListener = ref.on('value', (snap) => {
      const val = snap.val();
      if (val && typeof val === 'object') {
        cloudState = normalizeState(val);
      } else {
        cloudState = null;
        // node ว่าง + เป็นหลังบ้าน + มีข้อมูลในเครื่อง → ย้ายขึ้น cloud ครั้งแรก
        if (IS_ADMIN) {
          const local = rawLocalState();
          if (local) ref.set(JSON.parse(JSON.stringify(local))).catch(e => console.error('seed error', e));
        }
      }
      renderFromCloud();
    });
  } catch (e) {
    console.warn('Firebase init error (ใช้ localStorage แทน):', e);
    fbReady = false;
  }
}

function renderFromCloud() {
  try {
    if (IS_ADMIN) renderActiveView();
    else renderStandings();
  } catch (e) { console.warn('renderFromCloud:', e); }
}

/* ========== STATE / DATA LAYER ========== */
const KEY = 'aov_standings_v1';

const DEFAULT_STATE = () => ({
  version: 1,
  settings: {
    leagueName: '',
    format: 'BO2',
    points: { win: 3, draw: 1, loss: 0 },
    groups: [],                               // [{ id, name, color }]
  },
  teams: [],                                  // { id, name, tag, color, logo, groupId }
  matches: [],                                // { id, date, teamAId, teamBId, games, kills?, note }
});

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE();
  return {
    ...DEFAULT_STATE(),
    ...parsed,
    settings: {
      ...DEFAULT_STATE().settings,
      ...(parsed.settings || {}),
      points: { ...DEFAULT_STATE().settings.points, ...(parsed.settings?.points || {}) },
      groups: Array.isArray(parsed.settings?.groups) ? parsed.settings.groups : [],
    },
    teams: Array.isArray(parsed.teams) ? parsed.teams.map(t => ({
      logo: t.logo || '',
      groupId: t.groupId || '',
      ...t,
    })) : [],
    matches: Array.isArray(parsed.matches) ? parsed.matches.map(m => ({
      kills: Array.isArray(m.kills) ? m.kills : [],
      ...m,
    })) : [],
  };
}

// อ่าน state: เลือก Firebase (ข้อมูลกลาง) ก่อน ถ้ายังไม่มี → localStorage
function loadState() {
  if (cloudState) return cloudState;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE();
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.warn('loadState error:', e);
    return DEFAULT_STATE();
  }
}

// state เก่าในเครื่อง (สำหรับย้ายข้อมูลขึ้น Firebase ครั้งแรก)
function rawLocalState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

function saveState(state) {
  // เขียน localStorage เสมอ (สำรอง / โหมด offline)
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('saveState error:', e);
    showToast('ไม่สามารถบันทึกข้อมูลได้ (พื้นที่จัดเก็บเต็ม?)', 'error');
  }
  // หลังบ้าน + Firebase พร้อม → อัปโหลดข้อมูลกลาง (คนดู/ทุกเครื่องเห็นอัตโนมัติ)
  if (IS_ADMIN && fbReady && fbDb) {
    fbDb.ref('standings').set(JSON.parse(JSON.stringify(state))).catch(e => {
      console.error('Firebase write error:', e);
      showToast('ไม่สามารถอัปโหลดข้อมูลไป Firebase ได้', 'error');
    });
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function uid() { return newId(); }

// วันที่วันนี้ตาม timezone ของเครื่อง (yyyy-mm-dd)
function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ========== HELPERS: ทีม / กลุ่ม ========== */
function getTeam(state, id) {
  return state.teams.find(t => t.id === id) || null;
}
function getTeamName(state, id) {
  const t = getTeam(state, id);
  return t ? t.name : '?';
}
function getGroup(state, id) {
  return (state.settings.groups || []).find(g => g.id === id) || null;
}
function groupsOf(state) {
  return state.settings.groups || [];
}

// ตัวย่อของทีมสำหรับ fallback เมื่อไม่มีโลโก้
function teamInitials(t) {
  if (t.tag) return t.tag.slice(0, 2).toUpperCase();
  const name = (t.name || '?').trim();
  if (name.length <= 2) return name.toUpperCase();
  const bits = name.split(/\s+/).filter(Boolean);
  if (bits.length >= 2) return (bits[0][0] + bits[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ---------- Avatar: โลโก้ หรือ วงกลมสี + ตัวย่อ ---------- */
function avatarOf(t, cls = 'w-8 h-8 text-xs', rounded = 'rounded-full') {
  if (!t) return '<span class="inline-block"></span>';
  if (t.logo) {
    return `<img src="${esc(t.logo)}" alt="${esc(t.name)}" class="${cls} ${rounded} object-cover shrink-0 bg-slate-100 ring-1 ring-slate-200" referrerpolicy="no-referrer" onerror="this.style.opacity=0">`;
  }
  const color = t.color || '#94A3B8';
  return `<span class="inline-flex items-center justify-center ${cls} ${rounded} shrink-0 font-black text-white uppercase select-none shadow-sm" style="background:${color}">${esc(teamInitials(t))}</span>`;
}

/* ========== SETTINGS HELPERS ========== */
const FORMAT_GAMES = { BO1: 1, BO2: 2, BO3: 3, BO5: 5 };

function gamesForFormat(format) {
  return FORMAT_GAMES[format] || 2;
}

/* ========== DERIVED: ผลแมตช์ ========== */
function matchResult(m) {
  let aWins = 0, bWins = 0;
  for (const g of m.games || []) {
    if (g === 'A') aWins++;
    else if (g === 'B') bWins++;
  }
  let type = 'draw';
  if (aWins > bWins) type = 'A';
  else if (bWins > aWins) type = 'B';
  return { type, aWins, bWins };
}

/* ========== STANDINGS ENGINE ==========
   เรียง: แต้ม ↓ → ผลต่างเกมชนะ-แพ้ ↓ → [คิลรวม ↓ → ตายรวม ↑] → H2H ↓ → ชื่อ ↑
   (คิล/ตาย ใช้เฉพาะเมื่อมีแมตช์ที่กรอกคิล; ถ้าไม่มีแมตช์ไหนกรอกคิลเลย ข้ามไป H2H ตรง ๆ)
   H2H คำนวณเฉพาะกลุ่มทีมที่แต้มเท่ากัน ในบล็อกเดียวกัน */
function computeStandings() {
  const state = loadState();
  const pts = state.settings.points;
  const hasAnyKills = state.matches.some(m =>
    (m.kills || []).some(k => Array.isArray(k) && k.length >= 2 && (k[0] !== null && k[0] !== undefined && k[0] !== '' || (k[1] !== null && k[1] !== undefined && k[1] !== '')))
  );

  const rows = {};
  for (const team of state.teams) {
    rows[team.id] = {
      team,
      played: 0, wins: 0, draws: 0, losses: 0,
      gamesWon: 0, gamesLost: 0, points: 0,
      totalKills: 0, totalDeaths: 0,
    };
  }

  for (const m of state.matches) {
    const a = rows[m.teamAId], b = rows[m.teamBId];
    if (!a || !b) continue; // ป้องกันแมตช์อ้างอิงทีมที่ถูกลบ
    const { type, aWins, bWins } = matchResult(m);

    a.played++; b.played++;
    a.gamesWon += aWins; a.gamesLost += bWins;
    b.gamesWon += bWins; b.gamesLost += aWins;

    // คิล/ตาย รายเกม (คิลของฝ่ายตรงข้าม = ตายของเรา)
    for (const k of (m.kills || [])) {
      if (!Array.isArray(k) || k.length < 2) continue;
      const ka = Number(k[0]), kb = Number(k[1]);
      if (!Number.isFinite(ka) || !Number.isFinite(kb)) continue;
      a.totalKills += ka; a.totalDeaths += kb;
      b.totalKills += kb; b.totalDeaths += ka;
    }

    if (type === 'A') {
      a.wins++; b.losses++;
      a.points += pts.win; b.points += pts.loss;
    } else if (type === 'B') {
      b.wins++; a.losses++;
      b.points += pts.win; a.points += pts.loss;
    } else {
      a.draws++; b.draws++;
      a.points += pts.draw; b.points += pts.draw;
    }
  }

  let list = Object.values(rows).map(r => ({
    ...r,
    mapDiff: r.gamesWon - r.gamesLost,
    killDiff: r.totalKills - r.totalDeaths,
    winRate: r.played > 0 ? (r.wins + 0.5 * r.draws) / r.played : 0,
  }));

  function effKey(r) {
    return [r.points, r.mapDiff, hasAnyKills ? r.totalKills : 0, hasAnyKills ? r.totalDeaths : 0].join('|');
  }

  function h2hPoints(teamId, blockIds) {
    let p = 0;
    for (const m of state.matches) {
      const isA = m.teamAId === teamId && blockIds.has(m.teamBId);
      const isB = m.teamBId === teamId && blockIds.has(m.teamAId);
      if (!isA && !isB) continue;
      const r = matchResult(m);
      const won = (isA && r.type === 'A') || (isB && r.type === 'B');
      p += won ? pts.win : (r.type === 'draw' ? pts.draw : pts.loss);
    }
    return p;
  }

  // sort หลัก
  list.sort((x, y) =>
    y.points - x.points ||
    y.mapDiff - x.mapDiff ||
    (hasAnyKills ? (y.totalKills - x.totalKills || x.totalDeaths - y.totalDeaths) : 0) ||
    x.team.name.localeCompare(y.team.name, 'th')
  );

  // แบ่งบล็อกที่ "แต้ม + ผลต่าง + (คิล/ตาย)" เท่ากัน แล้วตัดสิน H2H ภายในบล็อก
  let i = 0;
  while (i < list.length) {
    let j = i + 1;
    const k = effKey(list[i]);
    while (j < list.length && effKey(list[j]) === k) j++;
    if (j - i > 1) {
      const block = list.slice(i, j);
      const ids = new Set(block.map(r => r.team.id));
      block.sort((x, y) =>
        h2hPoints(y.team.id, ids) - h2hPoints(x.team.id, ids) ||
        x.team.name.localeCompare(y.team.name, 'th')
      );
      list.splice(i, j - i, ...block);
    }
    i = j;
  }

  list.forEach((r, i) => { r.rank = i + 1; });
  return list;
}

/* ========== TAB NAVIGATION ========== */
let currentTab = 'standings';
let standingsDetail = false;   // false = ย่อ (compact), true = ขยาย (รายละเอียด)

function switchTab(name) {
  currentTab = name;
  // desktop nav tabs
  document.querySelectorAll('#navTabs .tab-btn').forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('tab-active', active);
  });
  // bottom nav (มือถือ)
  document.querySelectorAll('#bottomNav .b-nav-btn').forEach(btn => {
    btn.classList.toggle('b-nav-active', btn.dataset.tab === name);
  });
  ['standings', 'matches', 'teams', 'settings'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
  });
  renderActiveView();
}

function renderActiveView() {
  if (currentTab === 'standings') renderStandings();
  else if (currentTab === 'matches') renderMatches();
  else if (currentTab === 'teams') renderTeams();
  else if (currentTab === 'settings') renderSettings();
}

function renderAll() {
  renderStandings();
  updateNavLeague();
  if (!IS_ADMIN) return; // หน้าบ้านไม่มีหน้าจัดการ
  renderMatches(); renderTeams(); renderSettings();
}

function updateNavLeague() {
  // ชื่อลีกล็อกตายตัว (ไม่ให้แก้ผ่านตั้งค่า)
  const el = document.getElementById('navLeague');
  if (el) el.textContent = 'ROV CUP 2026 ครั้งที่ 1';
}

/* ========== RENDERING HELPERS ========== */
function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateTh(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function rankBadge(rank) {
  if (rank === 1) return '<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-navy-800 to-navy-600 text-white font-black shadow-sm">1</span>';
  if (rank === 2) return '<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800 font-black shadow-sm">2</span>';
  if (rank === 3) return '<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-accentSoft to-accent text-white font-black shadow-sm">3</span>';
  return `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white text-slate-400 font-bold border border-slate-200">${rank}</span>`;
}

function emptyState(icon, title, desc, actionHtml = '') {
  return `
    <div class="glass rounded-2xl py-12 px-6 text-center animate-fade-in">
      ${svgIcon(icon, 'w-12 h-12 text-slate-300 mx-auto mb-3')}
      <div class="text-lg font-bold text-slate-900 mb-1">${esc(title)}</div>
      <p class="text-sm text-slate-500 mb-5 max-w-sm mx-auto">${esc(desc)}</p>
      ${actionHtml}
    </div>`;
}

// SVG icon set (inline, stroke-based) — แทน emoji เพื่อให้หน้าตาดูเป็นมืออาชีพ
function svgIcon(name, cls = 'w-5 h-5') {
  const paths = {
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3"/>',
    gamepad: '<path d="M6 11h4M8 9v4M15 10h.01M17 12h.01M7 6h10a5 5 0 0 1 4.9 6l-.5 3.5a2.5 2.5 0 0 1-4.3 1.3L15 14H9l-2.1 2.8a2.5 2.5 0 0 1-4.3-1.3L2.1 12A5 5 0 0 1 7 6Z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 12v4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M8 13h8M8 17h5"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6"/>',
    flask: '<path d="M10 2v6l-6.5 9.5A1.5 1.5 0 0 0 4.8 20h14.4a1.5 1.5 0 0 0 1.3-2.5L14 8V2M7.5 14h9"/>',
    download: '<path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M7 10l5 5 5-5M12 15V3"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    'hash': '<path d="M9 3L7 21M17 3L15 21M5 9h16M3 15h16"/>',
    'ok': '<path d="M5 13l4 4L19 7"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>',
    'warn': '<path d="M12 3L2 20h20L12 3ZM12 10v4M12 17h.01"/>',
  };
  const d = paths[name] || paths.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

function groupChipDot(color) {
  return `<span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:${color}"></span>`;
}

/* =================================================================
   RENDER: ตารางคะแนน (แยกกลุ่ม + กรอง + re-rank + ย่อ/ขยาย)
   ================================================================= */
let standingsFilterGroup = ''; // '' = ทุกกลุ่ม

const TIEBREAK_NOTE = 'ⓘ กฎตัดสินเมื่อคะแนนเท่ากัน: ① ผลต่างชนะ-แพ้ ② คิลรวม ③ ตายรวม ④ เฮดทูเฮด (ผลคิล-ตาย ใช้ต่อเมื่อมีการใส่คิล)';

function renderStandings() {
  const state = loadState();
  const all = computeStandings();
  const fmt = state.settings.format;
  const pts = state.settings.points;
  const groups = groupsOf(state);
  const hasGroups = groups.length > 0;

  document.getElementById('standingsSubtitle').innerHTML =
    `ฟอร์แมต: <span class="text-accentDark font-bold">${fmt}</span> &nbsp;·&nbsp; ` +
    `คะแนน: ชนะ <span class="text-green-600 font-bold">${pts.win}</span> / เสมอ <span class="text-amber-600 font-bold">${pts.draw}</span> / แพ้ <span class="text-red-600 font-bold">${pts.loss}</span>`;
  updateNavLeague();

  // ปุ่มย่อ/ขยาย
  const toggleBtn = document.getElementById('toggleDetailBtn');
  if (all.length) {
    toggleBtn.classList.remove('hidden');
    toggleBtn.textContent = standingsDetail ? '🙈 ย่อตาราง' : '🔍 ดูรายละเอียด';
  } else {
    toggleBtn.classList.add('hidden');
  }

  // chips กรองกลุ่ม
  const chipsEl = document.getElementById('groupChips');
  if (!hasGroups) {
    chipsEl.innerHTML = '';
  } else {
    const chip = (val, label, color) =>
      `<button onclick="setGroupFilter('${val}')" class="${standingsFilterGroup === val ? 'chip-active' : ''} group-chip px-3 py-1.5 rounded-full text-sm font-semibold transition">${color ? groupChipDot(color) : ''}${label}</button>`;
    let html = chip('', 'ทุกกลุ่ม', null);
    groups.forEach(g => { html += chip(g.id, g.name, g.color); });
    const noGroupTeams = all.filter(r => !r.team.groupId);
    if (noGroupTeams.length) html += chip('__nogroup__', 'ไม่มีกลุ่ม', '#94A3B8');
    chipsEl.innerHTML = html;
  }

  const body = document.getElementById('standingsBody');
  if (!all.length) {
    // หน้าบ้าน: ข้อความอ่านอย่างเดียว / หลังบ้าน: ปุ่มไปสร้างแมตช์แรก
    const emptyAction = IS_ADMIN
      ? `<button onclick="openMatchModal(null)" class="btn-press bg-accent hover:bg-accentDark text-white font-bold px-4 py-2 rounded-xl transition shadow-md shadow-accent/30">บันทึกแมตช์แรก</button>`
      : '';
    body.innerHTML = emptyState('trophy', 'ยังไม่มีตารางคะแนน',
      'เพิ่มทีมและบันทึกแมตช์ก่อน แล้วตารางคะแนนจะคำนวณให้อัตโนมัติ',
      emptyAction);
    return;
  }

  function table(rows) {
    const detail = standingsDetail;
    return `
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200 bg-slate-50">
            <th class="px-3 py-3 font-semibold w-10">#</th>
            <th class="px-3 py-3 font-semibold">ทีม</th>
            <th class="px-3 py-3 font-semibold text-center">แข่ง</th>
            <th class="px-3 py-3 font-semibold text-center">ชนะ</th>
            <th class="px-3 py-3 font-semibold text-center">เสมอ</th>
            <th class="px-3 py-3 font-semibold text-center">แพ้</th>
            ${detail ? `
            <th class="px-3 py-3 font-semibold text-center" title="เกมได้-เสีย">เกม±</th>
            <th class="px-3 py-3 font-semibold text-center" title="ผลต่างเกมชนะ-แพ้ (tiebreak ①)">คิล</th>
            <th class="px-3 py-3 font-semibold text-center" title="คิลรวม (tiebreak ②)">ตาย</th>
            <th class="px-3 py-3 font-semibold text-center" title="ตายรวม (tiebreak ③)">คิล±</th>
            ` : ''}
            <th class="px-3 py-3 font-semibold text-center">แต้ม</th>
            <th class="px-3 py-3 font-semibold text-center">ชนะ%</th>
          </tr>
        </thead>
        <tbody>
        ${rows.map(r => {
          const g = getGroup(state, r.team.groupId);
          return `
          <tr class="table-row-hover border-b border-slate-100 last:border-0">
            <td class="px-3 py-3">${rankBadge(r.rank)}</td>
            <td class="px-3 py-3">
              <div class="flex items-center gap-2.5">
                ${avatarOf(r.team, 'w-8 h-8 text-sm')}
                <div class="min-w-0">
                  <div class="font-semibold text-slate-900 truncate">${esc(r.team.name)}${g ? `<span class="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold align-middle" style="background:${g.color}22;color:${g.color}">${esc(g.name)}</span>` : ''}</div>
                  ${r.team.tag ? `<div class="text-[11px] text-slate-400">${esc(r.team.tag)}</div>` : ''}
                </div>
              </div>
            </td>
            <td class="px-3 py-3 text-center text-slate-600 font-medium">${r.played}</td>
            <td class="px-3 py-3 text-center"><span class="dot-stat inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span><span class="text-slate-700 font-medium">${r.wins}</span></td>
            <td class="px-3 py-3 text-center"><span class="dot-stat inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span><span class="text-slate-700 font-medium">${r.draws}</span></td>
            <td class="px-3 py-3 text-center"><span class="dot-stat inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span><span class="text-slate-700 font-medium">${r.losses}</span></td>
            ${detail ? `
            <td class="px-3 py-3 text-center text-slate-600">${r.gamesWon}–${r.gamesLost}</td>
            <td class="px-3 py-3 text-center text-slate-600 font-medium">${r.totalKills}</td>
            <td class="px-3 py-3 text-center text-slate-600 font-medium">${r.totalDeaths}</td>
            <td class="px-3 py-3 text-center ${r.killDiff > 0 ? 'text-green-600 font-bold' : r.killDiff < 0 ? 'text-red-600 font-bold' : 'text-slate-400'}">${r.killDiff > 0 ? '+' : ''}${r.killDiff}</td>
            ` : ''}
            <td class="px-3 py-3 text-center ${r.rank === 1 ? 'text-navy-900 font-black text-base' : 'text-slate-900 font-bold'}">${r.points}</td>
            <td class="px-3 py-3 text-center text-slate-500">${r.played ? Math.round(r.winRate * 100) : 0}%</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;
  }

  function panel(title, color, count, rowsHtml) {
    return `
      <div class="glass rounded-2xl overflow-hidden animate-fade-in">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-slate-100" style="background:${color}14">
          ${color ? `<span class="inline-block w-3 h-3 rounded-full" style="background:${color}"></span>` : ''}
          <span class="font-bold text-slate-900">${esc(title)}</span>
          <span class="text-xs text-slate-400">${count} ทีม</span>
        </div>
        <div class="overflow-x-auto">${rowsHtml}</div>
      </div>`;
  }

  let html = `<p class="text-xs text-slate-400 mb-3">${TIEBREAK_NOTE}</p><div class="space-y-6">`;

  if (standingsFilterGroup === '') {
    if (hasGroups) {
      groups.forEach(g => {
        const rows = all.filter(r => r.team.groupId === g.id).map((r, i) => ({ ...r, rank: i + 1 }));
        if (!rows.length) return;
        html += panel(g.name, g.color, rows.length, table(rows));
      });
      const noGroupRows = all.filter(r => !r.team.groupId).map((r, i) => ({ ...r, rank: i + 1 }));
      if (noGroupRows.length) html += panel('ไม่มีกลุ่ม', '#94A3B8', noGroupRows.length, table(noGroupRows));
    } else {
      html += panel('ทั้งหมด', null, all.length, table(all.map((r, i) => ({ ...r, rank: i + 1 }))));
    }
  } else {
    let rows;
    if (standingsFilterGroup === '__nogroup__') rows = all.filter(r => !r.team.groupId);
    else rows = all.filter(r => r.team.groupId === standingsFilterGroup);
    const re = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    if (!re.length) {
      html += emptyState('folder', 'กลุ่มนี้ยังไม่มีทีม', 'เพิ่มทีมในกลุ่มนี้จากหน้าทีม');
    } else {
      const g = getGroup(state, standingsFilterGroup);
      html += panel(g ? g.name : 'ไม่มีกลุ่ม', g ? g.color : '#94A3B8', re.length, table(re));
    }
  }

  html += '</div>';
  body.innerHTML = html;
}

function setGroupFilter(val) {
  standingsFilterGroup = val;
  renderStandings();
}

function toggleStandingsDetail() {
  standingsDetail = !standingsDetail;
  renderStandings();
}

/* ========== RENDER: แมตช์ ========== */
function renderMatches() {
  const state = loadState();
  const body = document.getElementById('matchesBody');
  if (!body) return; // หน้าบ้านไม่มี element นี้

  if (!state.matches.length) {
    body.innerHTML = emptyState('gamepad', 'ยังไม่มีแมตช์',
      'กดปุ่ม "บันทึกแมตช์ใหม่" เพื่อบันทึกผลการแข่งขันครั้งแรก',
      `<button onclick="openMatchModal(null)" class="btn-press bg-accent hover:bg-accentDark text-white font-bold px-4 py-2 rounded-xl transition shadow-md shadow-accent/30">บันทึกแมตช์ใหม่</button>`);
    return;
  }

  const sorted = [...state.matches].sort((a, b) => (b.date > a.date) ? -1 : (b.date < a.date) ? 1 : 0);
  body.innerHTML = `
    <div class="flex items-center gap-2 mb-3 text-sm text-slate-500">
      <span class="px-2.5 py-1 rounded-full bg-white border border-slate-200">${state.matches.length} แมตช์</span>
    </div>
    <div class="space-y-3">
    ${sorted.map(m => {
      const tA = getTeam(state, m.teamAId), tB = getTeam(state, m.teamBId);
      if (!tA || !tB) return '';
      const res = matchResult(m);
      const winBadge = (teamName) => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-200">${svgIcon('trophy', 'w-3 h-3')}${esc(teamName)} ชนะ</span>`;
      const badge = res.type === 'A' ? winBadge(tA.name) : res.type === 'B' ? winBadge(tB.name)
        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">${svgIcon('hash', 'w-3 h-3')}เสมอ</span>`;
      const gamesHtml = m.games.map((g, i) => {
        const k = (m.kills || [])[i];
        const killTxt = Array.isArray(k) && (k[0] !== null && k[0] !== '' || k[1] !== null && k[1] !== '')
          ? ` · คิล ${k[0]}–${k[1]}` : '';
        return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-700 border border-slate-200">
          <span class="w-1.5 h-1.5 rounded-full ${g === 'A' ? 'bg-green-500' : 'bg-accent'}"></span>เกม ${i + 1}: ${g === 'A' ? esc(tA.tag || tA.name) : esc(tB.tag || tB.name)}${killTxt}
        </span>`;
      }).join('');
      return `
      <div class="glass rounded-2xl p-4 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="flex items-center gap-1.5 font-bold text-slate-900">${avatarOf(tA, 'w-7 h-7 text-xs')} ${esc(tA.name)}</span>
            <span class="text-xl font-black text-accentDark mx-0.5">${res.aWins} – ${res.bWins}</span>
            <span class="flex items-center gap-1.5 font-bold text-slate-900">${esc(tB.name)} ${avatarOf(tB, 'w-7 h-7 text-xs')}</span>
            <span class="mx-1">${badge}</span>
          </div>
          <div class="flex items-center gap-1 text-sm">
            <button onclick="openMatchModal('${m.id}')" title="แก้ไขแมตช์" class="icon-btn edit btn-press w-8 h-8 inline-flex items-center justify-center rounded-lg transition">${svgIcon('edit', 'w-4 h-4')}</button>
            <button onclick="requestDeleteMatch('${m.id}')" title="ลบแมตช์" class="icon-btn del btn-press w-8 h-8 inline-flex items-center justify-center rounded-lg transition">${svgIcon('trash', 'w-4 h-4')}</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mb-1.5">${gamesHtml}</div>
        <div class="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
          <span class="inline-flex items-center gap-1">${svgIcon('calendar', 'w-3.5 h-3.5')}${formatDateTh(m.date)}</span>
          ${m.note ? `<span class="inline-flex items-center gap-1">${svgIcon('note', 'w-3.5 h-3.5')}${esc(m.note)}</span>` : ''}
        </div>
      </div>`;
    }).join('')}
    </div>`;
}

/* ========== RENDER: ทีม ========== */
function renderTeams() {
  const state = loadState();
  const body = document.getElementById('teamsBody');
  if (!body) return; // หน้าบ้านไม่มี element นี้

  if (!state.teams.length) {
    body.innerHTML = emptyState('shield', 'ยังไม่มีทีม',
      'กด "เพิ่มทีม" เพื่อสร้างทีมแรกของคุณ',
      `<button onclick="openTeamModal(null)" class="btn-press bg-accent/10 hover:bg-accent/20 text-accentDark font-bold px-4 py-2 rounded-xl border border-accent/50 transition">เพิ่มทีม</button>`);
    return;
  }

  const rows = computeStandings();
  const statsById = {};
  rows.forEach(r => { statsById[r.team.id] = r; });

  body.innerHTML = `
    <div class="flex items-center gap-2 mb-3 text-sm text-slate-500">
      <span class="px-2.5 py-1 rounded-full bg-white border border-slate-200">${state.teams.length} ทีม</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    ${state.teams.map(t => {
      const st = statsById[t.id] || { played: 0, wins: 0, draws: 0, losses: 0 };
      const g = getGroup(state, t.groupId);
      return `
      <div class="glass rounded-2xl overflow-hidden animate-fade-in">
        <div class="h-1.5" style="background:${t.color}"></div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5">
              ${avatarOf(t, 'w-11 h-11 text-base')}
              <div>
                <div class="font-bold text-slate-900">${esc(t.name)}</div>
                <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  ${t.tag ? `<span class="text-[11px] text-slate-500 font-semibold">${esc(t.tag)}</span>` : ''}
                  ${g ? `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style="background:${g.color}22;color:${g.color}">${esc(g.name)}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="flex gap-1">
              <button onclick="openTeamModal('${t.id}')" title="แก้ไขทีม" class="icon-btn edit btn-press w-8 h-8 inline-flex items-center justify-center rounded-lg transition">${svgIcon('edit', 'w-4 h-4')}</button>
              <button onclick="requestDeleteTeam('${t.id}')" title="ลบทีม" class="icon-btn del btn-press w-8 h-8 inline-flex items-center justify-center rounded-lg transition">${svgIcon('trash', 'w-4 h-4')}</button>
            </div>
          </div>
          <div class="mt-3 flex gap-3 text-xs">
            <span class="text-slate-500">แข่ง <b class="text-slate-900">${st.played}</b></span>
            <span class="text-green-600">ชนะ <b>${st.wins}</b></span>
            <span class="text-amber-600">เสมอ <b>${st.draws}</b></span>
            <span class="text-red-600">แพ้ <b>${st.losses}</b></span>
          </div>
        </div>
      </div>`;
    }).join('')}
    </div>`;
}

/* ========== RENDER: ตั้งค่า ========== */
function renderSettings() {
  if (!document.getElementById('view-settings')) return; // หน้าบ้านไม่มีหน้าตั้งค่า
  renderSettingsForm();
  renderGroupsList();
}

function renderSettingsForm() {
  const s = loadState().settings;
  document.getElementById('setPtWin').value = s.points.win;
  document.getElementById('setPtDraw').value = s.points.draw;
  document.getElementById('setPtLoss').value = s.points.loss;
  document.querySelectorAll('#formatBtns .format-btn').forEach(btn => {
    btn.classList.toggle('format-active', btn.dataset.format === s.format);
  });
}

function pickFormat(fmt) {
  document.querySelectorAll('#formatBtns .format-btn').forEach(btn => {
    btn.classList.toggle('format-active', btn.dataset.format === fmt);
  });
}

function saveSettingsForm() {
  const state = loadState();
  const format = document.querySelector('#formatBtns .format-active')?.dataset.format || state.settings.format;
  const win = Math.max(0, parseInt(document.getElementById('setPtWin').value) || 0);
  const draw = Math.max(0, parseInt(document.getElementById('setPtDraw').value) || 0);
  const loss = Math.max(0, parseInt(document.getElementById('setPtLoss').value) || 0);
  state.settings = { ...state.settings, format, points: { win, draw, loss } };
  saveState(state);
  renderAll();
  showToast('บันทึกการตั้งค่าเรียบร้อย', 'success');
}

/* ---------- จัดการกลุ่ม ---------- */
const GROUP_COLORS = ['#38BDF8', '#818CF8', '#F472B6', '#34D399', '#F59E0B', '#A78BFA', '#22D3EE', '#FB923C', '#94A3B8', '#F87171'];

function newGroupColor(state) {
  const used = groupColorsInUse(state) || [];
  for (const c of GROUP_COLORS) {
    if (!used.includes(c)) return c;
  }
  return GROUP_COLORS[GROUP_COLORS.length - 1];
}
function groupColorsInUse(state) {
  return groupsOf(state).map(g => g.color).filter(Boolean);
}

function renderGroupsList() {
  const state = loadState();
  const groups = groupsOf(state);
  const emptyEl = document.getElementById('groupsEmpty');
  const listEl = document.getElementById('groupsList');
  if (!groups.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = groups.map(g => {
    const count = state.teams.filter(t => t.groupId === g.id).length;
    return `
      <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-wrap">
        <input type="color" value="${esc(g.color)}" onchange="setGroupColor('${g.id}', this.value)" class="w-8 h-8 rounded-lg" title="เปลี่ยนสีกลุ่ม">
        <input type="text" value="${esc(g.name)}" onchange="renameGroup('${g.id}', this.value)" maxlength="20" placeholder="ชื่อกลุ่ม" class="min-w-24 flex-1 input-glow !py-1.5">
        <span class="text-xs text-slate-400 shrink-0">${count} ทีม</span>
        <button onclick="removeGroup('${g.id}')" title="ลบกลุ่ม" class="icon-btn del btn-press w-8 h-8 inline-flex items-center justify-center rounded-lg transition shrink-0">${svgIcon('trash', 'w-4 h-4')}</button>
      </div>`;
  }).join('');
}

function addGroup() {
  const state = loadState();
  const groups = groupsOf(state);
  const color = newGroupColor(state);
  const name = `กลุ่ม ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[groups.length] || (groups.length + 1)}`;
  groups.push({ id: uid(), name, color });
  saveState(state);
  renderGroupsList();
  showToast('เพิ่มกลุ่มเรียบร้อย', 'success');
}

function renameGroup(id, name) {
  const state = loadState();
  const g = getGroup(state, id);
  if (g) { g.name = (name || '').trim() || g.name; saveState(state); renderGroupsList(); renderStandings(); }
}

function setGroupColor(id, color) {
  const state = loadState();
  const g = getGroup(state, id);
  if (g) { g.color = color; saveState(state); renderGroupsList(); renderStandings(); }
}

function removeGroup(id) {
  const state = loadState();
  const g = getGroup(state, id);
  if (!g) return;
  const members = state.teams.filter(t => t.groupId === id).length;
  const message = members
    ? `ลบกลุ่ม "${g.name}"? ทีม ${members} ทีมในกลุ่มนี้จะถูกย้ายไป "ไม่มีกลุ่ม" (คะแนนยังคงอยู่)`
    : `ลบกลุ่ม "${g.name}" ใช่หรือไม่?`;
  openConfirm({
    icon: 'folder',
    title: 'ลบกลุ่ม?',
    message,
    actions: [
      { label: '🚫 ยกเลิก', style: 'btn-ghost', onClick: closeConfirm },
      { label: 'กลุ่ม', style: 'btn-danger', onClick: () => {
          state.settings.groups = state.settings.groups.filter(x => x.id !== id);
          state.teams.forEach(t => { if (t.groupId === id) t.groupId = ''; });
          saveState(state);
          if (standingsFilterGroup === id) standingsFilterGroup = '';
          renderAll();
          closeConfirm();
          showToast('กลุ่มเรียบร้อย', 'success');
        } },
    ],
  });
}

/* ========== THEME: สีทีม ========== */
const TEAM_COLORS = ['#38BDF8', '#1D4ED8', '#F87171', '#34D399', '#A78BFA', '#22D3EE', '#FB923C', '#F472B6', '#94A3B8', '#A3E635'];
let selectedColor = '#38BDF8';

function renderColorPicker() {
  const co = document.getElementById('colorPicker');
  co.innerHTML = TEAM_COLORS.map(c =>
    `<button type="button" onclick="pickColor('${c}')" class="color-swatch w-8 h-8 rounded-lg transition" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  document.querySelectorAll('#colorPicker .color-swatch').forEach(s => {
    s.classList.toggle('swatch-active', s.dataset.color === selectedColor);
  });
}
function pickColor(c) { selectedColor = c; renderColorPicker(); }

/* ---------- LOGO: draft + upload + resize ---------- */
let logoDraft = null;

function updateLogoPreview() {
  const t = { name: document.getElementById('teamName').value || '?', tag: document.getElementById('teamTag').value, color: selectedColor, logo: logoDraft };
  const previewEl = document.getElementById('teamLogoPreview');
  if (logoDraft) {
    previewEl.innerHTML = `<img src="${esc(logoDraft)}" alt="" class="w-14 h-14 object-cover">`;
    previewEl.style.background = '#e2e8f0';
  } else {
    previewEl.textContent = teamInitials(t);
    previewEl.style.background = t.color;
  }
  document.getElementById('teamLogoRemove').classList.toggle('hidden', !logoDraft);
}

function handleLogoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!/image\/(png|jpe?g|webp|gif|svg\+xml)/.test(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('รูปใหญ่เกินไป (สูงสุด 5MB)', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    if (dataUrl.startsWith('data:image/svg')) {
      if (dataUrl.length > 300 * 1024) { showToast('SVG ใหญ่เกินไป (สูงสุด 300KB)', 'error'); return; }
      logoDraft = dataUrl;
      updateLogoPreview();
      showToast('เลือกโลโก้แล้ว (กดบันทึกเพื่อยืนยัน)', 'success');
      return;
    }
    resizeImage(dataUrl, 128, (croppedDataUrl) => {
      if (!croppedDataUrl) { showToast('ไม่สามารถประมวลผลรูปได้', 'error'); return; }
      logoDraft = croppedDataUrl;
      updateLogoPreview();
      showToast('เลือกโลโก้แล้ว (กดบันทึกเพื่อยืนยัน)', 'success');
    });
  };
  reader.onerror = () => showToast('อ่านไฟล์รูปไม่สำเร็จ', 'error');
  reader.readAsDataURL(file);
  e.target.value = '';
}

function resizeImage(dataUrl, size, cb) {
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { cb(null); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      const srcRatio = img.width / img.height;
      let sw, sh, sx, sy;
      if (srcRatio > 1) {
        sh = img.height; sw = img.height;
        sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = img.width;
        sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      cb(canvas.toDataURL('image/jpeg', 0.85));
    } catch (err) {
      console.error('resize error:', err);
      cb(null);
    }
  };
  img.onerror = () => cb(null);
  img.src = dataUrl;
}

function removeLogo() {
  logoDraft = null;
  updateLogoPreview();
}

/* ========== TEAM MODAL ========== */
function renderGroupSelect() {
  const state = loadState();
  const groups = groupsOf(state);
  const sel = document.getElementById('teamGroup');
  if (!groups.length) {
    sel.innerHTML = `<option value="">ไม่มีกลุ่ม</option>`;
    return;
  }
  sel.innerHTML = groups.map(g =>
    `<option value="${g.id}">${esc(g.name)}</option>`
  ).join('');
}

function openTeamModal(teamId) {
  const state = loadState();
  document.getElementById('teamModalTitle').textContent = teamId ? 'แก้ไขทีม' : 'เพิ่มทีม';
  document.getElementById('teamModalId').value = teamId || '';
  renderGroupSelect();

  if (teamId) {
    const t = getTeam(state, teamId);
    if (!t) return;
    document.getElementById('teamName').value = t.name;
    document.getElementById('teamTag').value = t.tag || '';
    const sel = document.getElementById('teamGroup');
    sel.value = t.groupId && getGroup(state, t.groupId) ? t.groupId : (sel.options[0] ? sel.options[0].value : '');
    selectedColor = t.color;
    logoDraft = t.logo || null;
  } else {
    document.getElementById('teamName').value = '';
    document.getElementById('teamTag').value = '';
    const sel = document.getElementById('teamGroup');
    sel.value = sel.options[0] ? sel.options[0].value : '';
    selectedColor = TEAM_COLORS[0];
    logoDraft = null;
  }
  renderColorPicker();
  updateLogoPreview();
  document.getElementById('modalTeam').classList.remove('hidden');
  setTimeout(() => document.getElementById('teamName')?.focus(), 50);
}

function closeTeamModal() {
  document.getElementById('modalTeam').classList.add('hidden');
  logoDraft = null;
}

function teamNameInputOnChange() {
  updateLogoPreview();
}

function saveTeamForm(e) {
  e.preventDefault();
  const state = loadState();
  const id = document.getElementById('teamModalId').value;
  const name = document.getElementById('teamName').value.trim();
  const tag = document.getElementById('teamTag').value.trim().toUpperCase();
  const groupId = document.getElementById('teamGroup').value;

  if (!name) { showToast('กรุณากรอกชื่อทีม', 'error'); return; }
  const dup = state.teams.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== id);
  if (dup) showToast('มีทีมชื่อนี้อยู่แล้ว', 'warning');

  if (id) {
    const t = getTeam(state, id);
    if (t) {
      t.name = name; t.tag = tag; t.groupId = groupId; t.color = selectedColor; t.logo = logoDraft || '';
      saveState(state);
      showToast('แก้ไขทีมเรียบร้อย', 'success');
    }
  } else {
    state.teams.push({ id: newId(), name, tag, color: selectedColor, logo: logoDraft || '', groupId, createdAt: Date.now() });
    saveState(state);
    showToast('เพิ่มทีมเรียบร้อย', 'success');
  }
  closeTeamModal();
  renderActiveView();
}

function requestDeleteTeam(teamId) {
  const state = loadState();
  const t = getTeam(state, teamId);
  if (!t) return;
  const hasMatches = state.matches.some(m => m.teamAId === teamId || m.teamBId === teamId);
  if (hasMatches) {
    openConfirm({
      icon: 'warn',
      title: 'ลบทีมนี้?',
      message: `ทีม "${t.name}" มีการแข่งขันอยู่ในระบบ หากลบจะส่งผลต่อตารางคะแนน\n\nต้องการลบทีมพร้อมการแข่งขันทั้งหมด หรือยกเลิก?`,
      actions: [
        { label: '🚫 ยกเลิก', style: 'btn-ghost', onClick: closeConfirm },
        { label: 'ทีมพร้อมการแข่งขันทั้งหมด', style: 'btn-danger', onClick: () => { deleteTeam(teamId, true); closeConfirm(); } },
      ],
    });
  } else {
    openConfirm({
      icon: 'trash',
      title: 'ลบทีมนี้?',
      message: `ต้องการลบทีม "${t.name}" ใช่หรือไม่?`,
      actions: [
        { label: '🚫 ยกเลิก', style: 'btn-ghost', onClick: closeConfirm },
        { label: 'ทีม', style: 'btn-danger', onClick: () => { deleteTeam(teamId, false); closeConfirm(); } },
      ],
    });
  }
}

function deleteTeam(teamId, cascade) {
  const state = loadState();
  const t = getTeam(state, teamId);
  state.teams = state.teams.filter(x => x.id !== teamId);
  if (cascade) state.matches = state.matches.filter(m => m.teamAId !== teamId && m.teamBId !== teamId);
  saveState(state);
  renderAll();
  showToast(`ทีม "${t.name}"${cascade ? ' พร้อมการแข่งขันทั้งหมด' : ''} เรียบร้อย`, 'success');
}

/* ========== MATCH MODAL ========== */
let matchFormDraft = { games: [], kills: [] };
let editingMatchId = null;

function openMatchModal(matchId) {
  const state = loadState();
  if (state.teams.length < 2) {
    showToast('กรุณาสร้างทีมอย่างน้อย 2 ทีมก่อน', 'error');
    switchTab('teams');
    return;
  }

  editingMatchId = matchId;
  document.getElementById('matchModalTitle').textContent = matchId ? 'แก้ไขแมตช์' : 'บันทึกแมตช์';
  document.getElementById('matchModalFormat').textContent = state.settings.format + ` (${gamesForFormat(state.settings.format)} เกม)`;
  document.getElementById('matchModalId').value = matchId || '';

  const selA = document.getElementById('matchTeamA');
  const selB = document.getElementById('matchTeamB');
  selA.innerHTML = '<option value="">— เลือกทีม A —</option>' + state.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  selB.innerHTML = '<option value="">— เลือกทีม B —</option>' + state.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');

  const n = gamesForFormat(state.settings.format);
  if (matchId) {
    const match = state.matches.find(x => x.id === matchId);
    if (!match) { showToast('ไม่พบแมตช์นี้ในระบบ', 'error'); return; }
    selA.value = match.teamAId;
    selB.value = match.teamBId;
    document.getElementById('matchDate').value = match.date || '';
    document.getElementById('matchNote').value = match.note || '';
    matchFormDraft.games = [...(match.games || [])];
    matchFormDraft.kills = (match.kills || []).map(k => Array.isArray(k) ? [k[0], k[1]] : [null, null]).concat(Array.from({ length: n }, () => [null, null])).slice(0, n);
  } else {
    document.getElementById('matchDate').value = todayLocal();
    document.getElementById('matchNote').value = '';
    matchFormDraft.games = [];
    matchFormDraft.kills = Array.from({ length: n }, () => [null, null]);
  }

  onTeamSelectChange();
  document.getElementById('modalMatch').classList.remove('hidden');
}

function onTeamSelectChange() {
  const selA = document.getElementById('matchTeamA');
  const selB = document.getElementById('matchTeamB');
  const a = selA.value, b = selB.value;
  Array.from(selB.options).forEach(o => o.disabled = (o.value !== '' && o.value === a));
  Array.from(selA.options).forEach(o => o.disabled = (o.value !== '' && o.value === b));
  renderGamePickers();
  updateMatchPreview();
}

function renderGamePickers() {
  const state = loadState();
  const a = document.getElementById('matchTeamA').value;
  const b = document.getElementById('matchTeamB').value;
  const teamA = getTeam(state, a), teamB = getTeam(state, b);
  const fmt = state.settings.format;
  const n = gamesForFormat(fmt);

  const container = document.getElementById('gamePickers');
  container.innerHTML = '';

  if (!teamA || !teamB) {
    container.innerHTML = `<p class="text-xs text-slate-500">เลือกทีม A และทีม B ก่อน แล้วเลือกผู้ชนะในแต่ละเกม</p>`;
    return;
  }

  for (let i = 0; i < n; i++) {
    const pick = matchFormDraft.games[i] || null;
    const kills = matchFormDraft.kills[i] || [null, null];

    const row = document.createElement('div');
    row.className = 'flex flex-col gap-1.5';
    row.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-bold text-slate-400 w-14 shrink-0">เกม ${i + 1}</span>
        <div class="game-picker flex-1 min-w-[240px] grid grid-cols-2 gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl">
          <button type="button" data-game="${i}" data-side="A" onclick="pickGameWinner(${i},'A')" class="gp-btn px-2 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5">${avatarOf(teamA, 'w-5 h-5 text-[10px]')} ${esc(teamA.name)}</button>
          <button type="button" data-game="${i}" data-side="B" onclick="pickGameWinner(${i},'B')" class="gp-btn px-2 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5">${avatarOf(teamB, 'w-5 h-5 text-[10px]')} ${esc(teamB.name)}</button>
        </div>
      </div>
      <div class="flex items-center gap-2 pl-16">
        <span class="text-[11px] text-slate-400 w-20 shrink-0">คิล (ไม่บังคับ)</span>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="flex items-center gap-1 text-xs"><b class="text-slate-700">${esc(teamA.tag || teamA.name)}</b>
            <input type="number" min="0" placeholder="0" data-kill="${i}" data-side="A" value="${kills[0] ?? ''}" oninput="onKillInput(${i},'A',this.value)" class="input-glow !py-1 !px-2 w-16 text-center text-sm">
          </span>
          <span class="text-slate-300">:</span>
          <span class="flex items-center gap-1 text-xs"><input type="number" min="0" placeholder="0" data-kill="${i}" data-side="B" value="${kills[1] ?? ''}" oninput="onKillInput(${i},'B',this.value)" class="input-glow !py-1 !px-2 w-16 text-center text-sm">
            <b class="text-slate-700">${esc(teamB.tag || teamB.name)}</b>
          </span>
          <span class="text-[10px] text-slate-400">(ตาย = คิลของฝ่ายตรงข้าม)</span>
        </div>
      </div>`;
    container.appendChild(row);

    if (pick) setGamePickActive(i, pick);
  }
  updateMatchPreview();
}

function pickGameWinner(gameIdx, side) {
  matchFormDraft.games[gameIdx] = side;
  setGamePickActive(gameIdx, side);
  updateMatchPreview();
}

function setGamePickActive(gameIdx, side) {
  document.querySelectorAll(`[data-game="${gameIdx}"].gp-btn`).forEach(btn => {
    btn.classList.toggle('gp-active', btn.dataset.side === side);
  });
}

function onKillInput(gameIdx, side, val) {
  if (!matchFormDraft.kills) matchFormDraft.kills = [];
  if (!matchFormDraft.kills[gameIdx]) matchFormDraft.kills[gameIdx] = [null, null];
  const parsed = val === '' ? null : Math.max(0, parseInt(val, 10) || 0);
  matchFormDraft.kills[gameIdx][side === 'A' ? 0 : 1] = parsed;
}

function updateMatchPreview() {
  const state = loadState();
  const a = document.getElementById('matchTeamA').value;
  const b = document.getElementById('matchTeamB').value;
  const teamA = getTeam(state, a), teamB = getTeam(state, b);
  const n = gamesForFormat(state.settings.format);
  const preview = document.getElementById('matchPreview');

  const filled = matchFormDraft.games.filter(g => g === 'A' || g === 'B').length;
  if (filled < n || !teamA || !teamB) {
    preview.classList.add('hidden');
    return;
  }
  const aWins = matchFormDraft.games.filter(g => g === 'A').length;
  const bWins = matchFormDraft.games.filter(g => g === 'B').length;
  let label;
  if (aWins > bWins) label = `${teamA.name} ชนะ ${aWins}–${bWins}`;
  else if (bWins > aWins) label = `${teamB.name} ชนะ ${bWins}–${aWins}`;
  else label = `🤝 เสมอ ${aWins}–${bWins}`;
  preview.textContent = `ผล: ${label}`;
  preview.classList.remove('hidden');
}

function saveMatchForm(e) {
  e.preventDefault();
  const state = loadState();
  const id = document.getElementById('matchModalId').value;
  const date = document.getElementById('matchDate').value;
  const teamAId = document.getElementById('matchTeamA').value;
  const teamBId = document.getElementById('matchTeamB').value;
  const note = document.getElementById('matchNote').value.trim();
  const fmt = state.settings.format;
  const n = gamesForFormat(fmt);

  if (!teamAId || !teamBId) { showToast('กรุณาเลือกทีมทั้งสองทีม', 'error'); return; }
  if (teamAId === teamBId) { showToast('กรุณาเลือกทีมที่ต่างกัน 2 ทีม', 'error'); return; }
  const filled = matchFormDraft.games.filter(g => g === 'A' || g === 'B').length;
  if (filled < n) { showToast(`กรุณาเลือกผู้ชนะในทุกเกม (ทั้งหมด ${n} เกม)`, 'error'); return; }

  const games = [];
  for (let i = 0; i < n; i++) games.push(matchFormDraft.games[i] || 'A');

  // เก็บคิล: ป้อนครบคู่ต่อเกม → [ka,kb]; เกมที่ไม่ได้กรอกเลย → null
  const killsArr = [];
  for (let i = 0; i < n; i++) {
    const k = matchFormDraft.kills[i];
    if (!Array.isArray(k)) { killsArr.push(null); continue; }
    const ka = (k[0] === null || k[0] === undefined) ? null : Number(k[0]);
    const kb = (k[1] === null || k[1] === undefined) ? null : Number(k[1]);
    if (ka === null && kb === null) { killsArr.push(null); continue; }
    killsArr.push([ka === null ? 0 : ka, kb === null ? 0 : kb]);
  }
  const kills = killsArr.some(k => k !== null) ? killsArr : [];

  if (id) {
    const m = state.matches.find(x => x.id === id);
    if (m) {
      m.date = date; m.teamAId = teamAId; m.teamBId = teamBId; m.games = games; m.kills = kills; m.note = note;
      saveState(state);
      showToast('แก้ไขแมตช์เรียบร้อย', 'success');
    }
  } else {
    state.matches.push({ id: newId(), date, teamAId, teamBId, games, kills, note, createdAt: Date.now() });
    saveState(state);
    showToast('บันทึกแมตช์สำเร็จ', 'success');
  }
  closeMatchModal();
  renderActiveView();
}

function closeMatchModal() {
  document.getElementById('modalMatch').classList.add('hidden');
  matchFormDraft = { games: [], kills: [] };
  editingMatchId = null;
}

function requestDeleteMatch(matchId) {
  const state = loadState();
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  const tA = getTeam(state, m.teamAId), tB = getTeam(state, m.teamBId);
  openConfirm({
    icon: 'trash',
    title: 'ลบแมตช์นี้?',
    message: `ลบแมตช์ "${tA?.name || '?'} vs ${tB?.name || '?'}" ใช่หรือไม่? ตารางคะแนนจะถูกคำนวณใหม่`,
    actions: [
      { label: '🚫 ยกเลิก', style: 'btn-ghost', onClick: closeConfirm },
      { label: 'แมตช์', style: 'btn-danger', onClick: () => { deleteMatch(matchId); closeConfirm(); } },
    ],
  });
}

function deleteMatch(matchId) {
  const state = loadState();
  state.matches = state.matches.filter(m => m.id !== matchId);
  saveState(state);
  renderAll();
  showToast('แมตช์เรียบร้อย', 'success');
}

/* ========== CONFIRM MODAL ========== */
function openConfirm({ icon, title, message, actions }) {
  document.getElementById('confirmIcon').innerHTML = icon ? svgIcon(icon, 'w-9 h-9 mx-auto mb-2') : svgIcon('warn', 'w-9 h-9 mx-auto mb-2');
  document.getElementById('confirmTitle').textContent = title || 'ยืนยัน';
  document.getElementById('confirmMessage').innerHTML = message || '';
  document.getElementById('confirmMessage').style.whiteSpace = 'pre-line';
  const actBox = document.getElementById('confirmActions');
  actBox.innerHTML = actions.map((a, i) =>
    `<button onclick="confirmRun(${i})" class="confirm-action btn-press ${a.style} w-full py-2.5 rounded-xl font-bold text-sm transition">${a.label}</button>`
  ).join('');
  window._confirmAction = actions;
  document.getElementById('modalConfirm').classList.remove('hidden');
}

function confirmRun(idx = 0) {
  const a = window._confirmAction?.[idx];
  if (a && a.onClick) a.onClick();
}

function closeConfirm() {
  document.getElementById('modalConfirm').classList.add('hidden');
  window._confirmAction = null;
}

function requestResetAll() {
  openConfirm({
    icon: 'trash',
    title: 'ล้างข้อมูลทั้งหมด?',
    message: 'จะลบทีม แมตช์ กลุ่ม และการตั้งค่าทั้งหมดในเครื่องนี้ — การกระทำนี้ย้อนกลับไม่ได้',
    actions: [
      { label: '🚫 ยกเลิก', style: 'btn-ghost', onClick: closeConfirm },
      { label: 'ล้างทั้งหมด', style: 'btn-danger', onClick: () => { resetAllData(); closeConfirm(); } },
    ],
  });
}

function resetAllData() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  cloudState = null;
  if (IS_ADMIN && fbReady && fbDb) {
    fbDb.ref('standings').remove().catch(e => console.error('firebase remove error', e));
  }
  standingsFilterGroup = '';
  standingsDetail = false;
  renderAll();
  switchTab('standings');
  showToast('ล้างข้อมูลทั้งหมดเรียบร้อย', 'success');
}

/* ========== TOAST ========== */
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const colors = {
    success: 'bg-emerald-500 text-white border-emerald-600',
    error: 'bg-red-500 text-white border-red-600',
    warning: 'bg-amber-500 text-white border-amber-600',
  };
  const icons = { success: 'ok', error: 'x', warning: 'warn' };
  el.innerHTML = `<div class="toast-slide flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg font-medium text-sm ${colors[type] || colors.success}">
    <span>${svgIcon(icons[type] || 'ok', 'w-4 h-4')}</span><span>${msg}</span>
  </div>`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 3000);
}

/* ========== INIT ========== */
(function init() {
  initFirebase();
  if (IS_ADMIN) {
    switchTab('standings');
  } else {
    // หน้าบ้าน: แสดงเฉพาะตารางคะแนน + รีเฟรชอัตโนมัติเมื่อกลับมาที่แท็บ/โฟกัสหน้าจอ
    renderStandings();
    window.addEventListener('focus', () => renderStandings());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) renderStandings();
    });
  }
})();