/* =========================
   PreCheck — app.js (FULL)
   Supabase-driven items + shelf life
   - Home categories tiles
   - Sauce subcategories
   - Summary (grouped like your mockup)
   - Manager store toggle (PDD/SKH only, no BOTH)
   - Date format: "13 Jan 2026"
   ========================= */

/* ---------- CONFIG (EDIT THIS) ---------- */
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

/* ---------- Small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(msg, ms = 1800) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* Date format: "13 Jan 2026" */
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = MON[d.getMonth()];
  const yy = d.getFullYear();
  return `${dd} ${mm} ${yy}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d) {
  const x = startOfDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/* ---------- Minimal Supabase REST client (no library needed) ---------- */
async function sbFetch(path, { method = "GET", body } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase error ${res.status}: ${txt}`);
  }
  // Some responses can be empty
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- App State ---------- */
const LS_SESSION = "precheck_session_v3";
const LS_ROLE = "precheck_role_v3"; // "staff" | "manager"

const state = {
  session: loadSession(),
  role: localStorage.getItem(LS_ROLE) || "staff",
  items: [],           // loaded from Supabase
  view: "home",        // home | category | sauceSubs | summary | manager
  activeCategory: null,
  activeSauceSub: null,
  managerStore: null,  // "PDD" | "SKH" (manager summary store filter)
};

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // auto reset after midnight
    const today = isoDate(new Date());
    if (s?.day !== today) return null;
    return s;
  } catch {
    return null;
  }
}
function saveSession(s) {
  localStorage.setItem(LS_SESSION, JSON.stringify(s));
  state.session = s;
}
function clearSession() {
  localStorage.removeItem(LS_SESSION);
  state.session = null;
}

/* ---------- Build Base Layout (no dependency on your old HTML) ---------- */
function mountBase() {
  document.body.innerHTML = `
    <header class="topbar" id="topbar">
      <div class="topbar-row">
        <button id="btnMenu" class="menu-btn" type="button" aria-label="Menu">☰</button>
        <div class="brand-wrap">
          <div class="brand">PreCheck</div>
          <div class="session-line" id="sessionLine">Loading…</div>
        </div>
        <div class="topbar-right">
          <div class="role-pill">
            <button id="btnRole" class="role-btn staff" type="button">
              <span class="role-ico">👤</span>
              <span id="roleText">Staff</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="container" id="app"></main>

    <!-- Drawer -->
    <div class="drawer-backdrop hidden" id="drawerBackdrop">
      <aside class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div class="drawer-title">Menu</div>
          <button class="icon-btn" id="btnCloseDrawer" type="button" aria-label="Close">✕</button>
        </div>
        <div class="drawer-body">
          <button class="drawer-item big" data-nav="home">🏠 Home</button>
          <button class="drawer-item big" data-nav="alerts">🔔 Alerts</button>
          <button class="drawer-item big" data-nav="manager">👑 Manager</button>
          <button class="drawer-item big" data-nav="summary">📊 Summary</button>
          <button class="drawer-item big" data-nav="wisr">🧾 WISR Count</button>
          <div class="drawer-spacer"></div>
          <button class="drawer-item danger" id="btnLogout">⛔ Logout</button>
        </div>
      </aside>
    </div>

    <!-- Modal -->
    <div class="backdrop hidden" id="modalBackdrop">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title" id="modalTitle">Modal</div>
          <button class="icon-btn" id="btnCloseModal" type="button" aria-label="Close">✕</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>
  `;
}

/* ---------- UI: Drawer/Modal ---------- */
function openDrawer() { $("#drawerBackdrop").classList.remove("hidden"); }
function closeDrawer() { $("#drawerBackdrop").classList.add("hidden"); }

function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modalBackdrop").classList.remove("hidden");
}
function closeModal() { $("#modalBackdrop").classList.add("hidden"); }

/* ---------- Session Popup ---------- */
function showStartSession() {
  const store = state.session?.store || "PDD";
  const shift = state.session?.shift || "AM";
  const staff = state.session?.staff || "";

  openModal("Start Session", `
    <div class="card">
      <div class="field">
        <div class="label">Select Store</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <button class="btn-store btn-pdd ${store === "PDD" ? "" : "dim"}" id="btnStorePDD" type="button">PDD</button>
          <button class="btn-store btn-skh ${store === "SKH" ? "" : "dim"}" id="btnStoreSKH" type="button">SKH</button>
        </div>
      </div>

      <div class="field">
        <label class="label">Shift</label>
        <select class="input" id="inpShift">
          <option value="AM" ${shift === "AM" ? "selected" : ""}>AM</option>
          <option value="PM" ${shift === "PM" ? "selected" : ""}>PM</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Staff Name / ID</label>
        <input class="input" id="inpStaff" placeholder="e.g. Suri" value="${escapeHtml(staff)}" />
      </div>

      <div class="field">
        <button class="btn-yellow" id="btnStartSession" type="button">Start</button>
        <div class="muted" style="margin-top:10px; font-weight:900;">Session auto resets after midnight.</div>
      </div>
    </div>
  `);

  let selectedStore = store;

  $("#btnStorePDD").onclick = () => {
    selectedStore = "PDD";
    $("#btnStorePDD").classList.remove("dim");
    $("#btnStoreSKH").classList.add("dim");
  };
  $("#btnStoreSKH").onclick = () => {
    selectedStore = "SKH";
    $("#btnStoreSKH").classList.remove("dim");
    $("#btnStorePDD").classList.add("dim");
  };

  $("#btnStartSession").onclick = async () => {
    const staffVal = ($("#inpStaff").value || "").trim();
    const shiftVal = $("#inpShift").value;

    if (!staffVal) return toast("Enter Staff Name/ID");

    saveSession({
      day: isoDate(new Date()),
      store: selectedStore,
      shift: shiftVal,
      staff: staffVal,
    });

    closeModal();
    await bootData();
    render();
  };
}

/* ---------- Data Loading ---------- */
async function bootData() {
  if (!state.session) return;

  // load items for both stores, we will filter based on role
  // IMPORTANT: use your real table name/columns
  // This assumes table = public.items
  const rows = await sbFetch(
    `items?select=id,name,category,sub_category,shelf_life_days,store,is_active,active,deleted_at&order=category.asc,name.asc`
  );

  // keep only "not deleted" and active
  state.items = (rows || []).filter((r) => {
    const activeFlag =
      (r.is_active === true) ||
      (r.active === true); // support both columns
    const notDeleted = !r.deleted_at;
    return activeFlag && notDeleted;
  });

  updateTopbarSessionLine();
}

/* ---------- Role handling ---------- */
function setRole(role) {
  state.role = role;
  localStorage.setItem(LS_ROLE, role);
  updateRolePill();
  render();
}

function updateRolePill() {
  const btn = $("#btnRole");
  const text = $("#roleText");

  if (state.role === "manager") {
    btn.classList.remove("staff");
    btn.classList.add("manager");
    btn.innerHTML = `<span class="role-ico">👑</span><span id="roleText">Manager</span>`;
  } else {
    btn.classList.remove("manager");
    btn.classList.add("staff");
    btn.innerHTML = `<span class="role-ico">👤</span><span id="roleText">Staff</span>`;
  }
}

function updateTopbarSessionLine() {
  const line = $("#sessionLine");
  if (!state.session) {
    line.textContent = "Not started";
    return;
  }
  line.textContent = `${state.session.store} • ${state.session.shift} • ${state.session.staff}`;
}

/* ---------- Filtering helpers ---------- */
function visibleStoreFilter() {
  // staff only see their store; manager can switch store in summary/manager
  if (state.role === "staff") return state.session.store;
  // manager browsing: default to session store unless manager store set
  return state.managerStore || state.session.store;
}

function itemsForCategory(category, store) {
  return state.items.filter((r) => {
    return r.store === store && String(r.category || "").trim() === category;
  });
}

function sauceSubcategories(store) {
  const subs = new Set();
  state.items.forEach((r) => {
    if (r.store !== store) return;
    if (String(r.category || "").trim() !== "Sauce") return;
    const sub = String(r.sub_category || "").trim();
    if (sub) subs.add(sub);
  });
  return Array.from(subs).sort((a,b)=>a.localeCompare(b));
}

function itemsForSauceSub(store, sub) {
  return state.items.filter((r) => {
    return (
      r.store === store &&
      String(r.category || "").trim() === "Sauce" &&
      String(r.sub_category || "").trim() === sub
    );
  });
}

/* ---------- Expiry / Logs (local only for now) ---------- */
/* If you already have logs table, tell me its columns and I’ll switch to Supabase logs.
   For now, this keeps expiry records locally so Summary works. */
const LS_LOGS = "precheck_logs_v3";

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem(LS_LOGS) || "[]");
  } catch {
    return [];
  }
}
function saveLogs(logs) {
  localStorage.setItem(LS_LOGS, JSON.stringify(logs));
}

function upsertLog(store, itemId, qty, expiryIso) {
  const logs = loadLogs();
  const day = isoDate(new Date());
  const idx = logs.findIndex(
    (x) => x.day === day && x.store === store && x.item_id === itemId
  );
  const rec = { day, store, item_id: itemId, qty: Number(qty || 0), expiry: expiryIso || null };
  if (idx >= 0) logs[idx] = rec;
  else logs.push(rec);
  saveLogs(logs);
}

/* ---------- Summary calculations ---------- */
function computeSummary(store) {
  const logs = loadLogs().filter((x) => x.store === store && x.day === isoDate(new Date()) && x.qty > 0 && x.expiry);
  const today = startOfDay(new Date());
  const t0 = isoDate(today);
  const t1 = isoDate(addDays(today, 1));
  const t3 = isoDate(addDays(today, 3)); // up to 2-3 days group

  const itemsById = new Map(state.items.map((r) => [r.id, r]));

  const groups = {
    today: [],
    tomorrow: [],
    days23: [],
    safe: [],
  };

  for (const l of logs) {
    const it = itemsById.get(l.item_id);
    if (!it) continue;

    if (l.expiry === t0) groups.today.push({ ...l, item: it });
    else if (l.expiry === t1) groups.tomorrow.push({ ...l, item: it });
    else if (l.expiry > t1 && l.expiry <= t3) groups.days23.push({ ...l, item: it });
    else groups.safe.push({ ...l, item: it });
  }

  return groups;
}

/* ---------- Renderers ---------- */
function render() {
  updateTopbarSessionLine();
  updateRolePill();

  const app = $("#app");
  const store = visibleStoreFilter();

  if (!state.session) {
    app.innerHTML = `<div class="card"><div class="h1">Start Session</div><div class="muted">Tap the popup to begin.</div></div>`;
    showStartSession();
    return;
  }

  if (state.view === "home") {
    renderHome(app, store);
  } else if (state.view === "category") {
    renderCategory(app, store, state.activeCategory);
  } else if (state.view === "sauceSubs") {
    renderSauceSubs(app, store);
  } else if (state.view === "summary") {
    renderSummary(app, store);
  } else if (state.view === "manager") {
    renderManager(app);
  } else {
    app.innerHTML = `<div class="card"><div class="h1">Page</div><div class="muted">Not implemented yet.</div></div>`;
  }
}

function renderHome(app, store) {
  // Category list (exact labels)
  const categories = [
    "Prepared items",
    "Unopened chiller",
    "Thawing",
    "Vegetables",
    "Backroom",
    "Front counter",
    "Back counter chiller",
    "Sauce",
  ];

  // counts (from items list)
  const counts = {};
  categories.forEach((c) => {
    if (c === "Sauce") {
      // Sauce total = all sauce items across subcategories
      counts[c] = state.items.filter((r) => r.store === store && r.category === "Sauce").length;
    } else {
      counts[c] = itemsForCategory(c, store).length;
    }
  });

  // Summary top cards based on logs
  const g = computeSummary(store);
  const expToday = g.today.length;
  const expTomorrow = g.tomorrow.length;
  const allSafe = g.safe.length + g.days23.length; // "safe-ish"
  // keep your 3 original cards
  app.innerHTML = `
    <div class="summary-row">
      <button class="sum-card sum-red" type="button" id="goToday">
        <div class="sum-num">${expToday}</div>
        <div class="sum-lbl">Expiring<br/>Today</div>
      </button>
      <button class="sum-card sum-amber" type="button" id="goTomorrow">
        <div class="sum-num">${expTomorrow}</div>
        <div class="sum-lbl">Expiring<br/>Tomorrow</div>
      </button>
      <button class="sum-card sum-green" type="button" id="goSafe">
        <div class="sum-num">${allSafe}</div>
        <div class="sum-lbl">All Safe</div>
      </button>
    </div>

    <div class="tiles-2col">
      ${tileHtml("Prepared items", counts["Prepared items"], "t-green", "/icons/sandwich.png")}
      ${tileHtml("Unopened chiller", counts["Unopened chiller"], "t-blue", "/icons/chiller.png")}
      ${tileHtml("Thawing", counts["Thawing"], "t-cyan", "/icons/waterdrop.png")}
      ${tileHtml("Vegetables", counts["Vegetables"], "t-green2", "/icons/vegetable.png")}
      ${tileHtml("Backroom", counts["Backroom"], "t-orange", "/icons/box.png")}
      ${tileHtml("Front counter", counts["Front counter"], "t-red", "/icons/sandwich.png")}
      ${tileHtml("Back counter chiller", counts["Back counter chiller"], "t-teal", "/icons/snowflake.png")}
      ${tileHtml("Sauce", counts["Sauce"], "t-purple", "/icons/sauce.png")}
    </div>
  `;

  $("#goToday").onclick = () => { state.view="summary"; render(); };
  $("#goTomorrow").onclick = () => { state.view="summary"; render(); };
  $("#goSafe").onclick = () => { state.view="summary"; render(); };

  $$(".tile").forEach((btn) => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      if (cat === "Sauce") {
        state.view = "sauceSubs";
        state.activeCategory = "Sauce";
      } else {
        state.view = "category";
        state.activeCategory = cat;
      }
      render();
    };
  });
}

function tileHtml(title, count, tone, iconPath) {
  return `
    <button class="tile ${tone}" type="button" data-cat="${escapeHtml(title)}">
      <div class="ico"><img alt="" src="${iconPath}"></div>
      <div class="title">${escapeHtml(title)}</div>
      <div class="sub">${count} items</div>
    </button>
  `;
}

function renderSauceSubs(app, store) {
  const subs = sauceSubcategories(store);

  app.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <div class="card">
      <div class="h1">Select subcategory</div>
      <div class="edit-list" style="margin-top:12px;">
        ${subs.map((s) => `
          <button class="drawer-item big" type="button" data-sub="${escapeHtml(s)}">🧴 ${escapeHtml(s)}</button>
        `).join("")}
      </div>
    </div>
  `;

  $("#btnBack").onclick = () => { state.view="home"; render(); };

  $$("[data-sub]").forEach((b) => {
    b.onclick = () => {
      state.activeSauceSub = b.dataset.sub;
      state.view = "category";        // reuse category screen
      state.activeCategory = "Sauce"; // but we filter by sub too
      render();
    };
  });
}

function renderCategory(app, store, category) {
  const isSauce = category === "Sauce";
  const rows = isSauce
    ? itemsForSauceSub(store, state.activeSauceSub || "")
    : itemsForCategory(category, store);

  const title = isSauce ? `Sauce — ${state.activeSauceSub || ""}` : category;

  app.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <div class="edit-list">
      ${rows.map((r) => itemEditorRow(r, store)).join("")}
    </div>

    <div class="save-bar">
      <button class="btn-yellow" id="btnSave" type="button">Save ${escapeHtml(title)}</button>
    </div>
  `;

  $("#btnBack").onclick = () => {
    if (isSauce) state.view = "sauceSubs";
    else state.view = "home";
    render();
  };

  // stepper
  $$(".qty-btn").forEach((b) => {
    b.onclick = () => {
      const wrap = b.closest(".edit-card");
      const inp = $(".qty-inp", wrap);
      const val = Number(inp.value || 0);
      const dir = b.dataset.dir;
      inp.value = Math.max(0, val + (dir === "+" ? 1 : -1));
    };
  });

  $("#btnSave").onclick = () => {
    // save all rows
    rows.forEach((r) => {
      const wrap = $(`#row_${r.id}`);
      const qty = Number($(".qty-inp", wrap).value || 0);
      const expSel = $(".exp-select", wrap);
      const expiry = expSel ? (expSel.value || null) : null;
      upsertLog(store, r.id, qty, expiry);
    });
    toast("Saved");
  };
}

function itemEditorRow(r, store) {
  const id = r.id;
  const name = r.name || "(no name)";
  const days = Number(r.shelf_life_days ?? 0);

  // shelf_life_days = 0 => End of day (auto)
  if (!days) {
    return `
      <div class="edit-card" id="row_${id}">
        <div class="edit-name">${escapeHtml(name)}</div>
        <div class="edit-row">
          <div class="qty-stepper">
            <button class="qty-btn" type="button" data-dir="-">–</button>
            <input class="qty-inp" inputmode="numeric" value="0" />
            <button class="qty-btn" type="button" data-dir="+">+</button>
          </div>
          <div class="exp-wrap">
            <div class="muted" style="font-weight:1000;">Expiry: End of day (auto).</div>
          </div>
        </div>
      </div>
    `;
  }

  // dropdown options count = shelf_life_days (include today)
  // e.g. 3 -> Today, Tomorrow, +2 days
  const today = startOfDay(new Date());
  const options = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const label = i === 0 ? `Today — ${fmtDate(d)}` : i === 1 ? `Tomorrow — ${fmtDate(d)}` : fmtDate(d);
    options.push({ label, value: isoDate(d) });
  }

  // + manual pick date option (still allowed)
  // we store as yyyy-mm-dd
  return `
    <div class="edit-card" id="row_${id}">
      <div class="edit-name">${escapeHtml(name)}</div>
      <div class="edit-row">
        <div class="qty-stepper">
          <button class="qty-btn" type="button" data-dir="-">–</button>
          <input class="qty-inp" inputmode="numeric" value="0" />
          <button class="qty-btn" type="button" data-dir="+">+</button>
        </div>

        <div class="exp-wrap">
          <select class="input exp-select">
            <option value="">Select</option>
            ${options.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <div class="edit-helper">Expiry follows shelf life (${days} day${days>1?"s":""}).</div>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Summary page (like your mockup) ---------- */
function renderSummary(app, store) {
  const groups = computeSummary(store);

  // top 3 original cards stay
  const expToday = groups.today.length;
  const expTomorrow = groups.tomorrow.length;
  const allSafe = groups.safe.length + groups.days23.length;

  app.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    <div class="summary-row">
      <div class="sum-card sum-red">
        <div class="sum-num">${expToday}</div>
        <div class="sum-lbl">Expiring<br/>Today</div>
      </div>
      <div class="sum-card sum-amber">
        <div class="sum-num">${expTomorrow}</div>
        <div class="sum-lbl">Expiring<br/>Tomorrow</div>
      </div>
      <div class="sum-card sum-green">
        <div class="sum-num">${allSafe}</div>
        <div class="sum-lbl">All Safe</div>
      </div>
    </div>

    ${summarySection("Expiring Today", groups.today, "#ef5350")}
    ${summarySection("Expiring Tomorrow", groups.tomorrow, "#ff9800")}
    ${summarySection("Expiring in 2–3 Days", groups.days23, "#ffd54f")}
    ${summarySection("Safe", groups.safe, "#66bb6a")}
  `;

  $("#btnBack").onclick = () => { state.view="home"; render(); };
}

function summarySection(title, list, color) {
  const today = startOfDay(new Date());
  let dateLabel = "";
  if (title.includes("Today")) dateLabel = fmtDate(today);
  if (title.includes("Tomorrow")) dateLabel = fmtDate(addDays(today, 1));

  return `
    <div class="card" style="padding:0; overflow:hidden; margin-top:14px;">
      <div style="padding:12px 14px; font-weight:1200; background:${color}; color:#111;">
        ${escapeHtml(title)} ${dateLabel ? `<span style="opacity:.85; font-weight:1000; margin-left:8px;">${escapeHtml(dateLabel)}</span>` : ""}
      </div>
      <div style="padding:12px 14px;">
        ${list.length ? list.map((x) => `
          <div class="alert-row">
            <div>
              <div class="alert-name">${escapeHtml(x.item.name)}</div>
              <div class="alert-extra">${x.qty} unit(s) • Exp. ${escapeHtml(x.expiry)}</div>
            </div>
          </div>
        `).join("") : `<div class="muted" style="font-weight:900;">No items</div>`}
      </div>
    </div>
  `;
}

/* ---------- Manager page (NO BOTH button) ---------- */
function renderManager(app) {
  if (state.role !== "manager") {
    app.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted" style="margin-top:8px;">
          Switch to Manager role first (top-right).
        </div>
      </div>
    `;
    return;
  }

  const current = state.managerStore || state.session.store;

  app.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="btnBack">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div class="h1">Manager view</div>
      <div class="muted" style="font-weight:900; margin:8px 0 12px;">
        Staff can only view their store. Manager can switch stores.
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <button class="btn-store btn-pdd ${current === "PDD" ? "" : "dim"}" id="mPDD" type="button">PDD</button>
        <button class="btn-store btn-skh ${current === "SKH" ? "" : "dim"}" id="mSKH" type="button">SKH</button>
      </div>

      <div style="margin-top:12px;">
        <button class="btn-yellow" id="btnGoSummary" type="button">Open Summary</button>
      </div>
    </div>
  `;

  $("#btnBack").onclick = () => { state.view="home"; render(); };

  $("#mPDD").onclick = () => {
    state.managerStore = "PDD";
    render();
  };
  $("#mSKH").onclick = () => {
    state.managerStore = "SKH";
    render();
  };

  $("#btnGoSummary").onclick = () => {
    state.view = "summary";
    render();
  };
}

/* ---------- Navigation / Events ---------- */
function bindGlobalEvents() {
  $("#btnMenu").onclick = () => openDrawer();
  $("#btnCloseDrawer").onclick = () => closeDrawer();
  $("#drawerBackdrop").onclick = (e) => {
    if (e.target.id === "drawerBackdrop") closeDrawer();
  };

  $("#btnCloseModal").onclick = () => closeModal();
  $("#modalBackdrop").onclick = (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  };

  // drawer navigation
  $$(".drawer-item[data-nav]").forEach((b) => {
    b.onclick = () => {
      const nav = b.dataset.nav;
      closeDrawer();
      if (nav === "home") { state.view="home"; render(); }
      else if (nav === "summary") { state.view="summary"; render(); }
      else if (nav === "manager") { state.view="manager"; render(); }
      else toast("Not implemented yet");
    };
  });

  $("#btnLogout").onclick = () => {
    clearSession();
    toast("Logged out");
    closeDrawer();
    render();
    showStartSession();
  };

  // role toggle button
  $("#btnRole").onclick = () => {
    if (state.role === "staff") setRole("manager");
    else setRole("staff");
  };
}

/* ---------- Boot ---------- */
async function boot() {
  mountBase();
  bindGlobalEvents();
  updateRolePill();

  if (!state.session) {
    render();
    return;
  }

  try {
    await bootData();
  } catch (e) {
    console.error(e);
    toast("Supabase error — check console");
  }

  render();
}

boot();
