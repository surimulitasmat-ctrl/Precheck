/* =========================
   PreCheck — public/app.js (FULL)
   PART 1 / 3
   FIXED & STABLE BASE
   ========================= */

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- SAFETY HELPERS (MISSING BEFORE) ---------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function enforceArray(x) {
  return Array.isArray(x) ? x : [];
}

/* ---------- TILE TONE (FIXED) ---------- */
function tileToneFor(name) {
  const map = {
    "Prepared items": "t-green",
    "Unopened chiller": "t-blue",
    "Thawing": "t-cyan",
    "Vegetables": "t-green2",
    "Backroom": "t-orange",
    "Front counter": "t-red",
    "Back counter chiller": "t-teal",
    "Fountain Drinks": "t-green2",
    "Sauce": "t-purple",
  };
  return map[name] || "t-pink";
}

/* ---------- constants ---------- */
const POPUP_ITEMS = [
  "Mix green",
  "Mac&cheese",
  "Lettuce",
  "Chicken Bacon (c)",
  "Liquid Egg",
  "Flatbread(Thawing)",
  "Avocado",
  "BakedWaffle",
];

const CAT_EMOJI = {
  "Prepared items": "🥪",
  "Unopened chiller": "🧊",
  "Thawing": "💧",
  "Vegetables": "🥕",
  "Backroom": "📦",
  "Front counter": "🥪",
  "Back counter chiller": "❄️",
  "Fountain Drinks": "🥤",
  "Sauce": "🧴",
};

/* ---------- state ---------- */
const state = {
  view: { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null },
  navStack: [],
  session: loadJSON("session", {
    store: "",
    staff: "",
    shift: "AM",
    isManager: false,
    managerToken: "",
    sessionDayKey: "",
  }),
  data: { categories: [], items: [] },
  drafts: {},
  stock: { hasDot: false, rows: [] },
};

/* ---------- BOOT ---------- */
bindTopbar();
bindDrawer();
bindModal();
bindAppBackGuard();
startMidnightWatcher();

/* ---------- STOCK DOT (SAFE NO-CRASH VERSION) ---------- */
async function refreshStockDot() {
  updateDrawerAlertLabel(false);
  state.stock.hasDot = false;
  state.stock.rows = [];
}

/* ---------- START ---------- */
boot().catch(console.error);

async function boot() {
  ensureSessionDayKey();
  await wakeServer();
  updateDrawerAlertLabel(false);

  if (!state.session.store || !state.session.staff) {
    state.view.page = "login";
    render();
    return;
  }

  await loadAllForCurrentStore();
  await refreshStockDot();
  maybeShowExpiryPopup(false);
  render();
}

/* ---------- STORAGE ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

/* ---------- DATE HELPERS ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function dayKeyNow() { return todayISO(); }
function ensureSessionDayKey() {
  if (!state.session.sessionDayKey) {
    state.session.sessionDayKey = dayKeyNow();
    saveSession();
  }
}

/* ---------- API ---------- */
async function apiGet(path) {
  const r = await fetch(path);
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}

/* ---------- RENDER WAKE ---------- */
async function wakeServer() {
  try { await apiGet("/api/health"); }
  catch { toast("Waking server…"); }
}

/* ---------- DATA ---------- */
async function loadAllForCurrentStore() {
  const s = state.session.store;
  state.data.categories = await apiGet(`/api/categories?store=${s}`);
  state.data.items = await apiGet(`/api/items?store=${s}`);
}

/* ---------- TOPBAR ---------- */
function bindTopbar() { renderRolePill(); }
function renderRolePill() {
  const host = $("#roleHost");
  if (!host) return;
  host.innerHTML = `<div class="pill">${state.session.isManager ? "👑 Manager" : "👤 Staff"}</div>`;
}
function updateSessionLine() {
  const el = $("#sessionLine");
  if (!el) return;
  el.textContent = `${state.session.store} • ${state.session.shift} • ${state.session.staff}`;
  el.classList.remove("hidden");
}

/* ---------- DRAWER ---------- */
function bindDrawer() {
  $("#btnMenu")?.addEventListener("click", () => $("#drawerBackdrop")?.classList.remove("hidden"));
  $("#btnDrawerClose")?.addEventListener("click", () => $("#drawerBackdrop")?.classList.add("hidden"));
  $("#drawerHome")?.addEventListener("click", () => goHome());
  $("#drawerLogout")?.addEventListener("click", () => doLogout());
}
function updateDrawerAlertLabel() {}

/* ---------- MODAL + TOAST ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}
function bindModal() {
  $("#modalClose")?.addEventListener("click", closeModal);
}
function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modalBackdrop").classList.remove("hidden");
}
function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
}

/* ---------- LOGIN ---------- */
function renderLoginPage() {
  $("#main").innerHTML = `
    <div class="card">
      <input id="staffInp" class="input" placeholder="Staff name">
      <button id="startBtn" class="btn btn-yellow">Start</button>
    </div>
  `;
  $("#startBtn").onclick = async () => {
    state.session.staff = $("#staffInp").value.trim();
    state.session.store = "PDD";
    saveSession();
    await loadAllForCurrentStore();
    render();
  };
}

/* =========================
   END PART 1 / 3
   ========================= */
/* =========================
   PART 2 / 3
   Navigation, Home, Category
   ========================= */

/* ---------- NAVIGATION ---------- */
function setView(next, push) {
  if (push) state.navStack.push({ ...state.view });
  state.view = { ...state.view, ...next };
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  state.view = prev || { page: "home", category: null };
  render();
}
function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null };
  render();
}

/* ---------- BACK GUARD ---------- */
function bindAppBackGuard() {
  try {
    history.pushState({}, "");
    window.addEventListener("popstate", () => {
      if (state.navStack.length) goBack();
      else openConfirmExit();
    });
  } catch {}
}
function openConfirmExit() {
  openModal(
    "Exit PreCheck?",
    `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:12px">Exit app?</div>
        <button id="exitNo" class="btn btn-yellow">No</button>
        <button id="exitYes" class="btn btn-red">Yes</button>
      </div>
    `
  );
  $("#exitNo").onclick = closeModal;
  $("#exitYes").onclick = () => history.back();
}

/* ---------- ROOT RENDER ---------- */
function render() {
  updateSessionLine();
  renderRolePill();

  const main = $("#main");
  if (!main) return;

  switch (state.view.page) {
    case "login": return renderLoginPage();
    case "home": return renderHome();
    case "category": return renderCategory();
    default:
      main.innerHTML = `<div class="card">Unknown page</div>`;
  }
}

/* ---------- HOME ---------- */
function renderHome() {
  const main = $("#main");
  const cats = enforceArray(state.data.categories).map(c => c.name);

  main.innerHTML = `
    <div class="tiles-2col">
      ${cats.map(c => `
        <button class="tile ${tileToneFor(c)}" data-cat="${escapeHtml(c)}">
          <div class="emoji">${CAT_EMOJI[c] || "✅"}</div>
          <div class="title">${escapeHtml(c)}</div>
        </button>
      `).join("")}
    </div>
  `;

  $$(".tile", main).forEach(btn => {
    btn.onclick = () => setView({ page: "category", category: btn.dataset.cat }, true);
  });
}

/* ---------- CATEGORY ---------- */
function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  const items = enforceArray(state.data.items).filter(i => i.category === cat);

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow">← Back</button>
      <div class="page-title">${escapeHtml(cat)}</div>
    </div>

    <div class="col" id="editList">
      ${items.map(renderItemEditor).join("")}
    </div>

    <div class="save-bar">
      <button id="saveBtn" class="btn btn-yellow" style="width:90%">Save</button>
    </div>
  `;

  $("#btnBack").onclick = goBack;
  bindItemEditors(items);

  $("#saveBtn").onclick = async () => {
    $("#saveBtn").textContent = "Saving…";
    await saveCategory(items);
    $("#saveBtn").textContent = "Save";
  };
}

/* ---------- ITEM EDITOR (SAFE STUB) ---------- */
function itemKey(it) {
  return `${it.id || it.name}`;
}

function renderItemEditor(it) {
  const key = itemKey(it);
  const d = state.drafts[key] || {};

  return `
    <div class="card">
      <div style="font-weight:1200">${escapeHtml(it.name)}</div>
      <input class="input qty" data-key="${key}" type="number" placeholder="Qty" value="${d.qty || ""}">
    </div>
  `;
}

function bindItemEditors(items) {
  $$(".qty").forEach(inp => {
    inp.oninput = () => {
      const k = inp.dataset.key;
      state.drafts[k] = state.drafts[k] || {};
      state.drafts[k].qty = Number(inp.value || 0);
    };
  });
}

/* ---------- SAVE CATEGORY ---------- */
async function saveCategory(items) {
  const rows = [];
  for (const it of items) {
    const d = state.drafts[itemKey(it)];
    if (d?.qty > 0) {
      rows.push({
        item_id: it.id,
        item_name: it.name,
        category: it.category,
        quantity: d.qty,
        expiry: todayISO(),
      });
    }
  }

  if (!rows.length) return toast("Nothing to save");

  try {
    await apiPost("/api/log/batch", {
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,
      rows,
    });
    toast("Saved ✅");
  } catch (e) {
    console.error(e);
    toast("Save failed");
  }
}

/* =========================
   END PART 2 / 3
   ========================= */
/* =========================
   PART 3 / 3
   Progress, Summary, Logout
   ========================= */

/* ---------- PROGRESS (RESUME WHERE LEFT OFF) ---------- */
function progressKey() {
  const s = state.session;
  return `pc_progress_${s.store}_${s.shift}_${s.staff}`;
}

function saveProgress() {
  try {
    const main = $("#main");
    localStorage.setItem(
      progressKey(),
      JSON.stringify({
        page: state.view.page,
        category: state.view.category,
        scrollTop: main ? main.scrollTop : 0,
        at: new Date().toISOString(),
      })
    );
  } catch {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(progressKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* auto-save progress */
window.addEventListener("beforeunload", saveProgress);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveProgress();
});

/* ---------- RESUME BANNER ---------- */
function renderResumeBanner() {
  const p = loadProgress();
  if (!p || state.view.page !== "home" || !p.category) return "";

  return `
    <div class="card" style="border-left:6px solid var(--green)">
      <div style="font-weight:1200">Continue where you left?</div>
      <div class="muted" style="margin-top:6px">
        ${escapeHtml(p.category)} • ${new Date(p.at).toLocaleString()}
      </div>
      <div class="row" style="gap:10px;margin-top:10px">
        <button id="resumeBtn" class="btn" style="flex:1;background:var(--green);color:#fff">Resume</button>
        <button id="resumeClear" class="btn btn-yellow" style="flex:1">Dismiss</button>
      </div>
    </div>
  `;
}

/* patch home to include resume */
const __renderHome = renderHome;
renderHome = function () {
  __renderHome();
  const main = $("#main");
  if (!main) return;

  const banner = renderResumeBanner();
  if (!banner) return;

  main.innerHTML = `
    <div class="col" style="gap:12px">
      ${banner}
      ${main.innerHTML}
    </div>
  `;

  $("#resumeBtn")?.addEventListener("click", () => {
    const p = loadProgress();
    if (!p) return;
    setView({ page: "category", category: p.category }, true);
    setTimeout(() => {
      const m = $("#main");
      if (m) m.scrollTop = p.scrollTop || 0;
    }, 50);
  });

  $("#resumeClear")?.addEventListener("click", () => {
    localStorage.removeItem(progressKey());
    render();
  });
};

/* save progress on category scroll */
const __renderCategory = renderCategory;
renderCategory = function () {
  __renderCategory();
  saveProgress();
  const main = $("#main");
  if (main) main.onscroll = saveProgress;
};

/* ---------- SUMMARY (AM / PM SEPARATED) ---------- */
function shiftDoneKey(shift) {
  const s = state.session;
  return `pc_done_${s.store}_${dayKeyNow()}_${shift}`;
}

function markShiftDone() {
  localStorage.setItem(
    shiftDoneKey(state.session.shift),
    JSON.stringify({
      staff: state.session.staff,
      at: new Date().toISOString(),
    })
  );
}

/* hook saveCategory */
const __saveCategory = saveCategory;
saveCategory = async function (items) {
  await __saveCategory(items);
  markShiftDone();
};

/* ---------- SUMMARY HOME ---------- */
function renderSummaryHome() {
  const main = $("#main");

  const am = JSON.parse(localStorage.getItem(shiftDoneKey("AM")) || "null");
  const pm = JSON.parse(localStorage.getItem(shiftDoneKey("PM")) || "null");

  const card = (label, d) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between">
        <div style="font-weight:1200">${label}</div>
        <div class="pill ${d ? "pill-green" : "pill-red"}">
          ${d ? "DONE" : "NOT DONE"}
        </div>
      </div>
      ${
        d
          ? `<div class="muted" style="margin-top:8px">
              ${escapeHtml(d.staff)} • ${new Date(d.at).toLocaleString()}
            </div>`
          : `<div class="muted" style="margin-top:8px">No record</div>`
      }
    </div>
  `;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    <div class="col" style="gap:12px">
      ${card("AM Shift", am)}
      ${card("PM Shift", pm)}
    </div>
  `;

  $("#btnBack").onclick = goBack;
}

/* ---------- SAFE PLACEHOLDERS (NO CRASH) ---------- */
function renderStockAlerts() {
  $("#main").innerHTML = `<div class="card">Stock alerts coming soon</div>`;
}
function renderManagerHome() {
  $("#main").innerHTML = `<div class="card">Manager panel coming soon</div>`;
}

/* ---------- LOGOUT ---------- */
function doLogout() {
  saveProgress();

  state.session = {
    store: "",
    staff: "",
    shift: "AM",
    isManager: false,
    managerToken: "",
    sessionDayKey: "",
  };
  saveSession();

  state.view = { page: "login", category: null };
  state.navStack = [];
  state.data = { categories: [], items: [] };
  state.drafts = {};

  render();
}

/* =========================
   END PART 3 / 3
   ========================= */
