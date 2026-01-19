/* =========================
   PreCheck — public/app.js (FULL)
   PATCHED:
   ✅ Hourly expiry options: 7am / 11am / 3pm / 7pm / 11pm
   ✅ Add 2nd date: single date + qty (no earliest/latest)
   ✅ Done + Set date buttons: green (inline style, no CSS needed)
   ✅ Removed duplicate updateDrawerAlertLabel (keep only one)
   ========================= */

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

// manual date only categories
const FORCE_MANUAL_DATE_CATS = new Set(["Unopened chiller", "Fountain Drinks"]);

// exclude from Stock Alert page
const STOCK_ALERT_EXCLUDE_CATS = new Set(["Sauce", "Front counter"]);

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

const SAUCE_SUBS = [
  { name: "Standby", emoji: "🧃", tone: "teal" },
  { name: "Open Inner", emoji: "🧴", tone: "purple" },
  { name: "Sandwich Unit", emoji: "🌶️", tone: "orange" },
];

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
  // per itemKey: { qty, expType, expDateISO, expTimeShort, extraISO, extraQty }
  drafts: {},
  stock: { hasDot: false, rows: [] },
};

/* ---------- boot ---------- */
bindTopbar();
bindDrawer();
bindModal();
bindAppBackGuard();
startMidnightWatcher();
boot().catch(console.error);

async function boot() {
  ensureSessionDayKey();

  // update drawer label on load
  updateDrawerAlertLabel(false);

  if (!state.session.store || !state.session.staff) {
    state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };
    render();
    return;
  }

  await loadAllForCurrentStore();
  await refreshStockDot().catch(() => {});
  maybeShowExpiryPopup(false);
  render();
}

/* =========================================================
   STORAGE
   ========================================================= */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

/* =========================================================
   DATE/TIME HELPERS
   ========================================================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function dayKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function ensureSessionDayKey() {
  const k = dayKeyNow();
  if (!state.session.sessionDayKey) {
    state.session.sessionDayKey = k;
    saveSession();
  }
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysISO(baseISO, n) {
  const dt = new Date(baseISO + "T00:00:00");
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function formatLongDMY(iso) {
  const dt = new Date(String(iso).slice(0, 10) + "T00:00:00");
  const day = dt.getDate();
  const mon = dt.toLocaleString("en-GB", { month: "long" });
  const year = dt.getFullYear();
  return `${day} ${mon} ${year}`;
}
function isChickenBaconC(name) {
  const t = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  return t === "chicken bacon (c)" || t === "chicken bacon(c)" || t === "chicken bacon c";
}

function formatTime12(hhmm) {
  const [hS, mS] = String(hhmm).split(":");
  let h = Number(hS);
  const m = Number(mS);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ampm}`;
}

function isoFromTodayAndTime(hhmm) {
  return `${todayISO()}T${String(hhmm)}:00`;
}

function datePartFromRow(row) {
  if (row?.expiry_at) return String(row.expiry_at).slice(0, 10);
  return String(row?.expiry_value || row?.expiry || "").slice(0, 10);
}
function timePartFromRow(row) {
  if (!row?.expiry_at) return "";
  try {
    const d = new Date(row.expiry_at);
    return formatTime12(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  } catch {
    return "";
  }
}

/* =========================================================
   HOURLY SHORT TIMES (NEW ✅)
   Only: 7am, 11am, 3pm, 7pm, 11pm
   ========================================================= */
const HOURLY_SHORT = [
  { value: "07:00", label: "7 AM" },
  { value: "11:00", label: "11 AM" },
  { value: "15:00", label: "3 PM" },
  { value: "19:00", label: "7 PM" },
  { value: "23:00", label: "11 PM" },
];

/* =========================================================
   API
   ========================================================= */
async function apiGet(path, token = "") {
  const r = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiPost(path, body, token = "") {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiPatch(path, body, token = "") {
  const r = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiDel(path, token = "") {
  const r = await fetch(path, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}

async function loadAllForCurrentStore() {
  const store = state.session.store;
  state.data.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  state.data.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);

  state.data.items = (state.data.items || []).map((it) => ({
    ...it,
    sub_category: it.sub_category ? normalizeSub(it.sub_category) : null,
    is_hourly: !!it.is_hourly,
    stock_alert_enabled: !!it.stock_alert_enabled,
    stock_min: it.stock_min != null ? Number(it.stock_min) : null,
  }));
}

function normalizeSub(s) {
  const t = String(s || "").trim().toLowerCase();
  if (t === "open inner" || t === "openinner") return "Open Inner";
  if (t === "standby") return "Standby";
  if (t === "sandwich unit" || t === "sandwichunit") return "Sandwich Unit";
  return String(s || "").trim();
}
/* =========================================================
   TOPBAR
   ========================================================= */
function bindTopbar() {
  renderRolePill();
}
function renderRolePill() {
  const host = $("#roleHost");
  if (!host) return;

  host.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `role-btn ${state.session.isManager ? "manager" : "staff"}`;
  if (state.session.isManager) {
    btn.style.background = "var(--red)";
    btn.style.color = "#fff";
  } else {
    btn.style.background = "var(--yellow)";
    btn.style.color = "#111";
  }
  btn.innerHTML = `
    <span class="role-ico">${state.session.isManager ? "👑" : "👤"}</span>
    <span style="font-weight:1200">${state.session.isManager ? "Manager" : "Staff"}</span>
  `;
  btn.addEventListener("click", () => toast(state.session.isManager ? "Manager mode" : "Staff mode"));
  host.appendChild(btn);
}
function updateSessionLine() {
  const el = $("#sessionLine");
  if (!el) return;
  const s = state.session;
  const show = !!(s.store && s.staff);
  el.classList.toggle("hidden", !show);
  el.textContent = show ? `${s.store} • ${s.shift} • ${s.staff}` : "";
}

/* =========================================================
   DRAWER
   ========================================================= */
function bindDrawer() {
  const btnMenu = $("#btnMenu");
  const backdrop = $("#drawerBackdrop");
  const btnClose = $("#btnDrawerClose");

  if (btnMenu) btnMenu.addEventListener("click", (e) => { e.preventDefault(); openDrawer(); });
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDrawer();
    });
  }
  if (btnClose) btnClose.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); });

  const bind = (id, fn) => {
    const b = $(id);
    if (b) b.addEventListener("click", () => { closeDrawer(); fn(); });
  };

  bind("#drawerHome", () => goHome());
  bind("#drawerAlerts", () => setView({ page: "stockAlerts" }, true));
  bind("#drawerManager", () => setView({ page: "manager" }, true));
  bind("#drawerSummary", () => setView({ page: "summaryHome" }, true));
  bind("#drawerWISR", () => setView({ page: "wisr" }, true));
  bind("#drawerLogout", () => doLogout());
}
function openDrawer() { const b = $("#drawerBackdrop"); if (b) b.classList.remove("hidden"); }
function closeDrawer() { const b = $("#drawerBackdrop"); if (b) b.classList.add("hidden"); }

/* Stock Alert label + dot (single source of truth ✅) */
function updateDrawerAlertLabel(hasDot) {
  const btn = $("#drawerAlerts");
  if (!btn) return;

  btn.innerHTML = hasDot
    ? `📦 Stock Alert <span class="tiny-dot" aria-label="New"></span>`
    : `📦 Stock Alert`;
}

/* =========================================================
   MODAL + TOAST
   ========================================================= */
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
  const closeBtn = $("#modalClose");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  const backdrop = $("#modalBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
}
function openModal(title, html, opts = {}) {
  const t = $("#modalTitle");
  const b = $("#modalBody");
  const back = $("#modalBackdrop");
  if (!t || !b || !back) return;

  t.textContent = title || "Modal";
  b.innerHTML = html || "";
  back.classList.remove("hidden");

  if (opts.noBackdropClose) {
    back.onclick = (e) => {
      if (e.target === back) e.stopPropagation();
    };
  } else {
    back.onclick = null;
  }
}
function closeModal() {
  const back = $("#modalBackdrop");
  const b = $("#modalBody");
  if (back) back.classList.add("hidden");
  if (b) b.innerHTML = "";
}

/* =========================================================
   SESSION POPUP + MIDNIGHT RESET
   ========================================================= */
function startMidnightWatcher() {
  setInterval(() => {
    const nowKey = dayKeyNow();
    if (state.session.sessionDayKey && state.session.sessionDayKey !== nowKey) {
      state.session.sessionDayKey = nowKey;
      saveSession();
      maybeShowExpiryPopup(true);
      render();
    }
  }, 30000);
}

function maybeShowExpiryPopup(force) {
  const k = dayKeyNow();
  const seenKey = `expiry_popup_seen_${k}`;
  if (!force && localStorage.getItem(seenKey) === "1") return;
  localStorage.setItem(seenKey, "1");

  const list = POPUP_ITEMS.map((x) => `
    <li><span class="popup-dot"></span>${escapeHtml(x)}</li>
  `).join("");

  openModal(
    "PLEASE check the expiry date",
    `
      <div class="popup-title">PLEASE check the expiry date of the items below:</div>
      <div class="popup-lead muted">Make sure expiry is correct before saving.</div>
      <ul class="popup-list">${list}</ul>
      <button id="popupOk" class="btn btn-yellow" style="width:100%; margin-top:8px">OK</button>
    `,
    { noBackdropClose: true }
  );

  const ok = $("#popupOk");
  if (ok) ok.addEventListener("click", closeModal);
}

/* =========================================================
   LOGIN PAGE
   ========================================================= */
function renderLoginPage() {
  const main = $("#main");
  const s = state.session;
  const storePick = s.store || "PDD";

  main.innerHTML = `
    <div class="card" style="max-width:560px;margin:14px auto">
      <div style="font-weight:1200;font-size:20px;margin-bottom:10px">Start Session</div>

      <div style="font-weight:1200">Select Store</div>
      <div class="row" style="gap:12px;margin-top:10px">
        <button id="pickPDD" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">PDD</button>
        <button id="pickSKH" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">SKH</button>
      </div>

      <div style="margin-top:14px;font-weight:1200">Shift</div>
      <select id="shiftSel" class="select">
        <option value="AM"${(s.shift||"AM")==="AM"?" selected":""}>AM</option>
        <option value="PM"${(s.shift||"AM")==="PM"?" selected":""}>PM</option>
      </select>

      <div style="margin-top:14px;font-weight:1200">Staff Name / ID</div>
      <input id="staffInp" class="input" placeholder="e.g. Suri" value="${escapeHtml(s.staff || "")}" />

      <button id="startBtn" class="btn btn-yellow" style="width:100%;margin-top:14px;padding:16px 16px;font-size:18px;font-weight:1200">Start</button>

      <div class="muted" style="font-size:12px;margin-top:10px;font-weight:900">
        Session auto resets after midnight.
      </div>
    </div>
  `;

  let pick = storePick;

  const applyStoreBtnUI = () => {
    const a = $("#pickPDD");
    const b = $("#pickSKH");

    if (a) { a.style.background = "#fff"; a.style.color = "#111"; a.style.border = "1px solid var(--line)"; }
    if (b) { b.style.background = "#fff"; b.style.color = "#111"; b.style.border = "1px solid var(--line)"; }

    if (pick === "PDD" && a) { a.style.background = "var(--pdd)"; a.style.color = "#fff"; a.style.border = "0"; }
    if (pick === "SKH" && b) { b.style.background = "var(--skh)"; b.style.color = "#fff"; b.style.border = "0"; }
  };
  applyStoreBtnUI();

  $("#pickPDD").addEventListener("click", () => { pick = "PDD"; applyStoreBtnUI(); });
  $("#pickSKH").addEventListener("click", () => { pick = "SKH"; applyStoreBtnUI(); });

  $("#startBtn").addEventListener("click", async () => {
    const staff = String($("#staffInp").value || "").trim();
    const shift = String($("#shiftSel").value || "AM");
    if (!staff) return toast("Please enter staff name/ID");

    state.session.store = pick;
    state.session.shift = shift;
    state.session.staff = staff;
    state.session.isManager = false;
    state.session.managerToken = "";
    state.session.sessionDayKey = dayKeyNow();
    saveSession();

    try {
      await loadAllForCurrentStore();
      await refreshStockDot().catch(() => {});
      renderRolePill();
      updateSessionLine();

      state.navStack = [];
      state.view = { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
      render();

      setTimeout(() => maybeShowExpiryPopup(true), 150);
    } catch (e) {
      console.error(e);
      toast("Failed to load data");
    }
  });
}
/* =========================
   PART 3 / 5  (REPLACEMENT — USE THIS)
   From: NAVIGATION → CATEGORY → shelfLifeModeFor → Date Wheel Picker (with green Set date)
   ========================= */

/* =========================================================
   NAVIGATION
   ========================================================= */
function setView(next, push) {
  if (push) {
    state.navStack.push({ ...state.view });
    safePushHistory();
  }
  state.view = { ...state.view, ...next };
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  state.view = prev ? prev : { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
  render();
}
function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
  render();
}

/* =========================================================
   BACK / SWIPE GUARD
   ========================================================= */
let backGuardArmed = false;
function bindAppBackGuard() {
  try {
    history.replaceState({ pc: 1 }, "");
    history.pushState({ pc: 1 }, "");
    backGuardArmed = true;
  } catch {}

  window.addEventListener("popstate", () => {
    if (!backGuardArmed) return;

    const modalOpen = !$("#modalBackdrop")?.classList.contains("hidden");
    if (modalOpen) {
      closeModal();
      safePushHistory();
      return;
    }

    if (!state.session.store || !state.session.staff) {
      safePushHistory();
      return;
    }

    if (state.navStack.length > 0) {
      goBack();
      safePushHistory();
      return;
    }

    openConfirmExit();
    safePushHistory();
  });
}
function safePushHistory() {
  try { history.pushState({ pc: 1 }, ""); } catch {}
}
function openConfirmExit() {
  openModal(
    "Exit PreCheck?",
    `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:10px">Do you want to exit?</div>
        <div class="muted" style="font-weight:900;margin-bottom:14px">This prevents accidental closing.</div>
        <div class="row" style="gap:12px">
          <button id="exitNo" class="btn btn-yellow" style="flex:1">No</button>
          <button id="exitYes" class="btn btn-red" style="flex:1">Yes</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#exitNo").addEventListener("click", closeModal);
  $("#exitYes").addEventListener("click", () => {
    closeModal();
    try { backGuardArmed = false; history.back(); } catch {}
  });
}

/* =========================================================
   RENDER ROOT
   ========================================================= */
function render() {
  updateSessionLine();
  renderRolePill();

  const main = $("#main");
  if (!main) return;

  if (!state.session.store || !state.session.staff) {
    renderLoginPage();
    return;
  }

  switch (state.view.page) {
    case "login": return renderLoginPage();
    case "home": return renderHome();
    case "category": return renderCategory();
    case "stockAlerts": return renderStockAlerts();
    case "summaryHome": return renderSummaryHome();
    case "summaryList": return renderSummaryList();
    case "wisr": return renderWISR();
    case "manager": return renderManagerHome();
    case "managerEditItems": return renderManagerEditItems();
    case "managerCategories": return renderManagerCategories();
    default:
      main.innerHTML = `<div class="card">Unknown page</div>`;
  }
}

/* =========================================================
   HOME
   ========================================================= */
function renderHome() {
  const main = $("#main");

  const cats = (state.data.categories || []).map((c) => c.name);
  const counts = {};
  for (const it of state.data.items || []) {
    counts[it.category] = (counts[it.category] || 0) + 1;
  }

  const tiles = cats
    .map((name, idx) => {
      const emoji = CAT_EMOJI[name] || "✅";
      const tone = tileToneFor(name);
      return `
      <button class="tile ${tone}" style="animation-delay:${idx * 45}ms" data-cat="${escapeHtml(name)}" type="button">
        <div class="emoji" style="font-size:54px">${emoji}</div>
        <div class="title" style="font-size:20px;font-weight:1200">${escapeHtml(name)}</div>
        <div class="sub">${counts[name] || 0} items</div>
      </button>
    `;
    })
    .join("");

  main.innerHTML = `
    <div class="col">
      <div class="tiles-2col">${tiles}</div>
    </div>
  `;

  $$(".tile", main).forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.dataset.cat;
      setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

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

/* =========================================================
   CATEGORY
   ========================================================= */
function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  // Sauce sub-menu
  if (cat === "Sauce" && !state.view.sauceSub) {
    const tiles = SAUCE_SUBS
      .map((s, idx) => {
        const tone = s.tone === "teal" ? "t-teal" : s.tone === "purple" ? "t-purple" : "t-orange";
        return `
        <button class="tile ${tone}" style="min-height:120px;animation-delay:${idx * 60}ms" data-sub="${escapeHtml(s.name)}" type="button">
          <div class="emoji" style="font-size:56px">${s.emoji}</div>
          <div class="title" style="font-size:20px">${escapeHtml(s.name)}</div>
          <div class="sub">Tap to open</div>
        </button>
      `;
      })
      .join("");

    main.innerHTML = `
      <div class="page-head">
        <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
        <div class="page-title">Sauce</div>
      </div>
      <div class="tiles-2col">${tiles}</div>
    `;
    $("#btnBack").addEventListener("click", goBack);
    $$(".tile", main).forEach((b) => {
      b.addEventListener("click", () => setView({ sauceSub: b.dataset.sub }, true));
    });
    return;
  }

  const sauceSub = state.view.sauceSub;
  const title = cat === "Sauce" && sauceSub ? `Sauce — ${sauceSub}` : cat;

  let items = (state.data.items || []).filter((x) => x.category === cat);
  if (cat === "Sauce" && sauceSub) {
   items = items.filter((x) => (x.sub_category || "") === normalizeSub(sauceSub));

  }

  const list = items.map((it) => renderItemEditor(it, cat)).join("");
  const emptyHint = items.length
    ? ""
    : `
    <div class="card" style="border-left:6px solid var(--yellow)">
      <div style="font-weight:1200">No items found</div>
      <div class="muted" style="margin-top:6px">
        This means your Sauce sub-category names in DB don’t match exactly.
      </div>
    </div>
  `;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    ${emptyHint}

    <div class="edit-list" id="editList">${list}</div>

    <div class="save-bar">
      <button
        id="saveBtn"
        class="btn-yellow"
        type="button"
        style="width:min(92%,520px); margin:0 auto; padding:14px 18px; border-radius:999px; font-weight:1200; font-size:16px;"
      >Save</button>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);
  bindItemEditors(items, cat);

  $("#saveBtn").addEventListener("click", async () => {
    await saveCategory(items, cat);
  });
}

function itemKey(it) {
  return it.id != null ? `id:${it.id}` : `name:${it.name}|${it.category}|${it.sub_category || ""}`;
}

function shelfLifeModeFor(it, cat) {
  // hourly wins
  if (it.is_hourly) return { mode: "HOURLY", life: 0 };

  const life = Number(it.shelf_life_days || 0);

  if (isChickenBaconC(it.name)) return { mode: "EOD_AUTO", life };
  if (FORCE_MANUAL_DATE_CATS.has(cat)) return { mode: "MANUAL", life };
  if (!Number.isFinite(life) || life <= 0) return { mode: "MANUAL", life };
  if (life > 7) return { mode: "MANUAL", life };

  return { mode: "PRESET", life };
}

/* =========================================================
   DATE WHEEL PICKER (iOS-style)
   - "Set date" button is GREEN ✅
   ========================================================= */
function openDateWheelModal({ title, initialISO, minISO, maxISO, onPick }) {
  const today = todayISO();
  const min = (minISO || today).slice(0, 10);
  const max = (maxISO || addDaysISO(today, 365 * 5)).slice(0, 10);
  const init = (initialISO || min).slice(0, 10);

  const minDt = new Date(min + "T00:00:00");
  const maxDt = new Date(max + "T00:00:00");

  function parseISO(iso) {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    return isNaN(d) ? null : d;
  }
  function clamp(dt) {
    if (dt < minDt) return new Date(minDt);
    if (dt > maxDt) return new Date(maxDt);
    return dt;
  }

  let cur = clamp(parseISO(init) || parseISO(min) || new Date());

  const yearMin = minDt.getFullYear();
  const yearMax = maxDt.getFullYear();
  const years = [];
  for (let yy = yearMin; yy <= yearMax; yy++) years.push(yy);

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate(); // m = 1..12
  }
  function toISO(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  function inRangeISO(iso) {
    return iso >= min && iso <= max;
  }

  // current parts
  let y = cur.getFullYear();
  let m = cur.getMonth() + 1;
  let d = cur.getDate();

  openModal(
    title || "Select date",
    `
    <div class="pc-wheel">
     
      <div class="pc-wheel-cols">
        <div class="pc-wheel-col">
          <div class="pc-wheel-label">Day</div>
          <div class="pc-wheel-list" id="wheelDay"></div>
        </div>

        <div class="pc-wheel-col">
          <div class="pc-wheel-label">Month</div>
          <div class="pc-wheel-list" id="wheelMon"></div>
        </div>

        <div class="pc-wheel-col">
          <div class="pc-wheel-label">Year</div>
          <div class="pc-wheel-list" id="wheelYear"></div>
        </div>

        <div class="pc-wheel-highlight" aria-hidden="true"></div>
      </div>

      <div class="pc-wheel-actions">
        <button class="pc-wheel-btn cancel" type="button" id="wheelCancel">Cancel</button>
        <button class="pc-wheel-btn ok" type="button" id="wheelOk"
          style="background:var(--green);color:#fff;border:0"
        >Set date</button>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  $("#wheelX")?.addEventListener("click", closeModal);
  $("#wheelCancel")?.addEventListener("click", closeModal);

  const dayEl = $("#wheelDay");
  const monEl = $("#wheelMon");
  const yearEl = $("#wheelYear");
  const okEl = $("#wheelOk");

  const monthLabel = (mm) => new Date(2000, mm - 1, 1).toLocaleString("en", { month: "long" });

  function scrollToActive(container) {
    const active = container.querySelector(".pc-wheel-item.active");
    if (!active) return;
    const top = active.offsetTop - (container.clientHeight / 2) + (active.clientHeight / 2);
    container.scrollTo({ top, behavior: "smooth" });
  }

function snapToClosest(container) {
  const items = Array.from(container.querySelectorAll(".pc-wheel-item"));
  if (!items.length) return;

  const center = container.scrollTop + container.clientHeight / 2;

  // current active value (before snapping)
  const active = container.querySelector(".pc-wheel-item.active");
  const activeV = active ? active.dataset.v : null;

  let best = null;
  let bestDist = Infinity;

  for (const it of items) {
    if (it.classList.contains("dim")) continue;
    const itCenter = it.offsetTop + it.clientHeight / 2;
    const dist = Math.abs(itCenter - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = it;
    }
  }
  if (!best) return;

  // vibrate ONLY if value actually changes
  if (best.dataset.v !== activeV) haptic(8);

  best.click();
}


  // 🔔 vibrate ONLY when value changes
  if (best.dataset.v !== activeV) {
    haptic(8);
  }

  best.click();
}


  function bindWheel(container, onPickVal) {
    $$(".pc-wheel-item", container).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("dim")) return;
        onPickVal(btn.dataset.v);
        renderWheel();
      });
    });

    let t = null;
    container.addEventListener("scroll", () => {
      clearTimeout(t);
      t = setTimeout(() => snapToClosest(container), 90);
    });
  }

  function setOkEnabled() {
    const iso = toISO(y, m, d);
    okEl.disabled = !inRangeISO(iso);
    okEl.style.opacity = okEl.disabled ? "0.5" : "1";
  }

  function renderWheel() {
    const dim = daysInMonth(y, m);
    if (d > dim) d = dim;
    if (d < 1) d = 1;

    dayEl.innerHTML = `
      <div class="pc-wheel-pad"></div>
      ${Array.from({ length: dim }, (_, i) => {
        const dd = i + 1;
        const iso = toISO(y, m, dd);
        const active = dd === d ? "active" : "";
        const dimCls = inRangeISO(iso) ? "" : "dim";
        return `<button class="pc-wheel-item ${active} ${dimCls}" type="button" data-v="${dd}">${dd}</button>`;
      }).join("")}
      <div class="pc-wheel-pad"></div>
    `;

    monEl.innerHTML = `
      <div class="pc-wheel-pad"></div>
      ${Array.from({ length: 12 }, (_, i) => {
        const mm = i + 1;
        const isoStart = toISO(y, mm, 1);
        const isoEnd = toISO(y, mm, daysInMonth(y, mm));
        const dimCls = (isoEnd < min || isoStart > max) ? "dim" : "";
        const active = mm === m ? "active" : "";
        return `<button class="pc-wheel-item ${active} ${dimCls}" type="button" data-v="${mm}">${escapeHtml(monthLabel(mm))}</button>`;
      }).join("")}
      <div class="pc-wheel-pad"></div>
    `;

    yearEl.innerHTML = `
      <div class="pc-wheel-pad"></div>
      ${years.map((yy) => {
        const isoStart = toISO(yy, 1, 1);
        const isoEnd = toISO(yy, 12, 31);
        const dimCls = (isoEnd < min || isoStart > max) ? "dim" : "";
        const active = yy === y ? "active" : "";
        return `<button class="pc-wheel-item ${active} ${dimCls}" type="button" data-v="${yy}">${yy}</button>`;
      }).join("")}
      <div class="pc-wheel-pad"></div>
    `;

    bindWheel(dayEl, (v) => (d = Number(v)));
    bindWheel(monEl, (v) => (m = Number(v)));
    bindWheel(yearEl, (v) => (y = Number(v)));

    setOkEnabled();

    setTimeout(() => {
      scrollToActive(dayEl);
      scrollToActive(monEl);
      scrollToActive(yearEl);
    }, 0);
  }

  renderWheel();

  okEl.addEventListener("click", () => {
    const iso = toISO(y, m, d);
    if (!inRangeISO(iso)) return;
    closeModal();
    onPick && onPick(iso);
  });
}

/* alias */
function openDateSliderModal(opts) {
  return openDateWheelModal(opts);
}
/* =========================
   PART 4 / 5  (REQUESTED)
   - Add 2nd date modal (single date + qty)
   - Hourly expiry list short: 7am,11am,3pm,7pm,11pm
   - renderItemEditor + bindItemEditors + saveCategory updated
   ========================= */

/* ---------- Add 2nd date popup (single extra expiry) ---------- */
function openAddDateModal({ it, cat, key }) {
  const d = state.drafts[key] || (state.drafts[key] = {});
  d.extraISO = d.extraISO || "";
  d.extraQty = d.extraQty || 0;

  const rule = shelfLifeModeFor(it, cat);
  const today = todayISO();
  const blockPast = today;

  openModal(
    "Add 2nd date",
    `
      <div class="card">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">${escapeHtml(it.name)}</div>

        <div style="border:1px solid var(--line);border-radius:14px;padding:12px">
          <div style="font-weight:1200;margin-bottom:8px">2nd expiry date</div>

          ${
            rule.mode === "HOURLY"
              ? `<div class="muted" style="font-weight:1000">Hourly items cannot use Add 2nd date.</div>`
              : rule.mode === "EOD_AUTO"
              ? `<div class="muted" style="font-weight:1000">Chicken Bacon (c) is auto today (EOD).</div>`
              : `
                <button id="exPick" class="btn btn-yellow" style="width:100%">Pick date</button>
                <div id="exShow" style="margin-top:8px;font-weight:1200">
                  ${d.extraISO ? escapeHtml(formatLongDMY(d.extraISO)) : "Not set"}
                </div>
              `
          }

          <div style="margin-top:10px;font-weight:1200">Qty</div>
          <input id="exQty" class="input" inputmode="numeric" value="${escapeHtml(d.extraQty || 0)}">
        </div>

        <div class="muted" style="margin-top:10px;font-weight:1100">
          Note: Past dates are blocked.
        </div>

        <div class="row" style="gap:12px;margin-top:14px">
          <button id="exCancel" class="btn btn-yellow" style="flex:1">Cancel</button>
          <button id="exOk" class="btn" style="flex:1;background:var(--green);color:#fff;border:0">Done</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#exQty")?.addEventListener("input", () => {
    d.extraQty = Number($("#exQty").value || 0);
  });

  if (rule.mode === "HOURLY") {
    $("#exCancel")?.addEventListener("click", closeModal);
    $("#exOk")?.addEventListener("click", closeModal);
    return;
  }

  if (rule.mode === "EOD_AUTO") {
    $("#exCancel")?.addEventListener("click", closeModal);
    $("#exOk")?.addEventListener("click", () => {
      d.extraISO = todayISO();
      closeModal();
      toast("Added 2nd date ✅");
    });
    return;
  }

  $("#exPick")?.addEventListener("click", () => {
    openDateWheelModal({
      title: "Pick 2nd expiry date",
      initialISO: d.extraISO || todayISO(),
      minISO: blockPast,
      onPick: (iso) => {
        d.extraISO = iso;
        const el = $("#exShow");
        if (el) el.textContent = formatLongDMY(iso);
      },
    });
  });

  $("#exCancel")?.addEventListener("click", closeModal);

 $("#exOk")?.addEventListener("click", () => {
  const q = Number(d.extraQty || 0);
  if (q > 0 && !d.extraISO) return toast("Pick date for qty > 0");
  if (d.extraISO && d.extraISO < blockPast) return toast("Past dates not allowed");
  closeModal();
  render(); // 🔥 refresh item card so "2nd date" badge appears
  toast("Added 2nd date ✅");
});

}

/* ---------- item editor card ---------- */
function renderItemEditor(it, cat) {
  const key = itemKey(it);
  if (!state.drafts[key]) {
    state.drafts[key] = {
      qty: 0,
      expType: "",
      expDateISO: "",
      expTimeShort: "",  // ✅ new
      extraISO: "",      // ✅ new
      extraQty: 0        // ✅ new
    };
  }
  const d = state.drafts[key];

  const rule = shelfLifeModeFor(it, cat);
  let expiryUI = "";

  if (rule.mode === "HOURLY") {
    const opts = HOURLY_SHORT
      .map((o) => `<option value="${escapeHtml(o.value)}"${d.expTimeShort === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
      .join("");

    expiryUI = `
      <label class="label">Expiry time (Today)</label>
      <select class="select" data-exptime="${escapeHtml(key)}">
        <option value="">Select time</option>
        ${opts}
      </select>
      <div class="edit-helper">Hourly expiry (today only)</div>
    `;
  } else if (rule.mode === "EOD_AUTO") {
    expiryUI = `<div class="muted" style="font-weight:900">Expiry: End of day (auto)</div>`;
  } else if (rule.mode === "MANUAL") {
    expiryUI = `
      <label class="label">Expiry date</label>
      <button class="btn btn-yellow" type="button" data-pickdate="${escapeHtml(key)}" style="width:100%">Pick date</button>
      <div class="edit-helper">${d.expDateISO ? escapeHtml(formatLongDMY(d.expDateISO)) : "Manual date"}</div>
    `;
  } else {
    const today = todayISO();
    const n = Math.max(1, Math.min(7, Number(rule.life) || 1)); // 1..7
    const opts = Array.from({ length: n }, (_, i) => {
      const iso = addDaysISO(today, i);
      const sel = d.expDateISO === iso ? " selected" : "";
      return `<option value="${escapeHtml(iso)}"${sel}>${escapeHtml(formatLongDMY(iso))}</option>`;
    }).join("");

    expiryUI = `
      <label class="label">Expiry</label>
      <select class="select" data-exppreset="${escapeHtml(key)}">
        <option value="">Select</option>
        ${opts}
        <option value="MANUAL"${d.expType==="MANUAL"?" selected":""}>Manual (pick date)</option>
      </select>
      <div data-pickwrap="${escapeHtml(key)}" class="${d.expType==="MANUAL" ? "" : "hidden"}" style="margin-top:8px">
        <button class="btn btn-yellow" type="button" data-pickdate="${escapeHtml(key)}" style="width:100%">Pick date</button>
        <div class="edit-helper">${d.expDateISO ? escapeHtml(formatLongDMY(d.expDateISO)) : ""}</div>
      </div>
      <div class="edit-helper">Preset dates (from shelf life)</div>
    `;
  }

  // "+ Date" button (not for HOURLY)
  const addDateBtn = (rule.mode === "HOURLY")
    ? ""
    : `<button class="btn btn-ghost" type="button" data-adddate="${escapeHtml(key)}" title="Add second expiry" style="padding:10px 12px">＋ Date</button>`;

  const extraBadge = (Number(d.extraQty) > 0)
    ? `<div class="muted" style="font-weight:1100;margin-top:6px">2nd date: ${Number(d.extraQty) || 0}</div>`
    : "";

  return `
    <div class="edit-card" data-key="${escapeHtml(key)}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div class="edit-name">${escapeHtml(it.name)}</div>
        ${addDateBtn}
      </div>
      ${extraBadge}

      <div class="edit-row">
        <div class="qty-stepper">
          <button class="qty-btn" type="button" data-dec="${escapeHtml(key)}">−</button>
          <input class="qty-inp" data-qty="${escapeHtml(key)}" inputmode="numeric" value="${escapeHtml(d.qty || 0)}" />
          <button class="qty-btn" type="button" data-inc="${escapeHtml(key)}">+</button>
        </div>

        <div class="exp-wrap">
          ${expiryUI}
        </div>
      </div>
    </div>
  `;
}

function bindItemEditors(items, cat) {
  const root = $("#editList");
  if (!root) return;

  for (const it of items) {
    const key = itemKey(it);
    const d = state.drafts[key] || (state.drafts[key] = {
      qty: 0, expType: "", expDateISO: "", expTimeShort: "",
      extraISO: "", extraQty: 0
    });

    const inc = $(`[data-inc="${cssEsc(key)}"]`, root);
    const dec = $(`[data-dec="${cssEsc(key)}"]`, root);
    const qty = $(`[data-qty="${cssEsc(key)}"]`, root);

    const presetSel = $(`[data-exppreset="${cssEsc(key)}"]`, root);
    const timeSel = $(`[data-exptime="${cssEsc(key)}"]`, root);
    const pickBtn = $(`[data-pickdate="${cssEsc(key)}"]`, root);
    const addDate = $(`[data-adddate="${cssEsc(key)}"]`, root);

    updateQtyUI(root, key);

    if (inc) inc.addEventListener("click", () => {
      d.qty = (Number(d.qty) || 0) + 1;
      updateQtyUI(root, key);
      pulseBtn(inc);
      haptic(12);
    });

    if (dec) dec.addEventListener("click", () => {
      d.qty = Math.max(0, (Number(d.qty) || 0) - 1);
      updateQtyUI(root, key);
      pulseBtn(dec);
      haptic(10);
    });

    if (qty) qty.addEventListener("input", () => {
      const n = Number(qty.value || 0);
      d.qty = Number.isFinite(n) ? Math.max(0, n) : 0;
      updateQtyUI(root, key);
    });

    if (timeSel) timeSel.addEventListener("change", () => {
      d.expTimeShort = String(timeSel.value || "");
      d.expType = "HOURLY";
    });

    if (presetSel) presetSel.addEventListener("change", () => {
      const v = String(presetSel.value || "");
      const wrap = $(`[data-pickwrap="${cssEsc(key)}"]`, root);

      if (v === "MANUAL") {
        d.expType = "MANUAL";
        if (wrap) wrap.classList.remove("hidden");
      } else {
        d.expType = "PRESET";
        d.expDateISO = v || "";
        if (wrap) wrap.classList.add("hidden");
      }
    });

    if (pickBtn) pickBtn.addEventListener("click", () => {
      openDateWheelModal({
        title: "Pick expiry date",
        initialISO: d.expDateISO || todayISO(),
        minISO: todayISO(),
        onPick: (iso) => {
          d.expDateISO = iso;
          if (!d.expType) d.expType = "MANUAL";
          render();
        },
      });
    });

    if (addDate) addDate.addEventListener("click", () => {
      openAddDateModal({ it, cat, key });
    });
  }
}

/* ---------- save category (includes Add 2nd date row) ---------- */
async function saveCategory(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;
  const today = todayISO();

  const rows = [];

  for (const it of items) {
    const key = itemKey(it);
    const d = state.drafts[key] || {
      qty: 0, expType: "", expDateISO: "", expTimeShort: "",
      extraISO: "", extraQty: 0
    };

    const qty = Number(d.qty) || 0;
    const xq = Number(d.extraQty) || 0;

    const rule = shelfLifeModeFor(it, cat);

    // main row
    if (qty > 0) {
      let expiry = null;
      let expiry_at = null;

      if (rule.mode === "HOURLY") {
        if (!d.expTimeShort) {
          toast(`Pick time for ${it.name}`);
          return;
        }
        expiry = today;
        expiry_at = isoFromTodayAndTime(d.expTimeShort);
      } else if (rule.mode === "EOD_AUTO") {
        expiry = today;
     } else {
  expiry = d.expDateISO || null;
  if (!expiry) {
    toast(`Pick expiry for ${it.name}`);
    return;
  }
  if (expiry < today) {
    toast("Past dates not allowed");
    return;
  }
}

      rows.push({
        item_id: it.id ?? null,
        item_name: it.name,
        category: it.category,
        sub_category: it.sub_category || null,
        quantity: qty,
        expiry,
        expiry_at,
        shift,
        is_extra: false,
      });
    }

    // extra 2nd date row
    if (xq > 0) {
      const expiry = (rule.mode === "EOD_AUTO") ? today : (d.extraISO || "");
      if (!expiry) { toast("Set 2nd date"); return; }
      if (expiry < today) { toast("Past dates not allowed"); return; }

      rows.push({
        item_id: it.id ?? null,
        item_name: it.name,
        category: it.category,
        sub_category: it.sub_category || null,
        quantity: xq,
        expiry,
        expiry_at: null,
        shift,
        is_extra: true,
        extra_tag: "SECOND",
      });
    }
  }

  if (!rows.length) return toast("Nothing to save");

  try {
    await apiPost("/api/log/batch", { store, staff, shift, rows });
    toast("Saved ✅");
    await refreshStockDot().catch(() => {});
  } catch (e) {
    console.error(e);
    toast("Save failed");
  }
}
/* =========================
   PART 5 / 5
   From: STOCK ALERT → SUMMARY → WISR → MANAGER → LOGOUT → UTILS
   (No extra theme/logic changes)
   ========================= */

/* =========================================================
   STOCK ALERT PAGE
   ========================================================= */
async function refreshStockDot() {
  const store = state.session.store;
  try {
    const r = await apiGet(`/api/stock/low?store=${encodeURIComponent(store)}`);
    const rows = enforceArray(r).filter((x) => !STOCK_ALERT_EXCLUDE_CATS.has(String(x.category || "")));
    state.stock.rows = rows;
    state.stock.hasDot = rows.length > 0;
    updateDrawerAlertLabel(state.stock.hasDot);
  } catch {
    state.stock.rows = [];
    state.stock.hasDot = false;
    updateDrawerAlertLabel(false);
  }
}

async function renderStockAlerts() {
  const main = $("#main");

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Stock Alert</div>
    </div>
    <div id="saWrap" class="col"></div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const wrap = $("#saWrap");
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  await refreshStockDot().catch(() => {});
  const rows = state.stock.rows || [];

  if (!rows.length) {
    wrap.innerHTML = `
      <div class="card">
        <div style="font-weight:1200">No low stock ✅</div>
        <div class="muted" style="margin-top:6px">All items are above minimum.</div>
      </div>
    `;
    return;
  }

  const grouped = new Map();
  for (const rr of rows) {
    const cat = rr.category || "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(rr);
  }

  let html = "";
  for (const [cat, list] of grouped.entries()) {
    html += `
      <div class="card">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">${escapeHtml(cat)}</div>
        <div class="col" style="gap:10px">
          ${list
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map((x) => {
              const cur = x.current_qty != null ? Number(x.current_qty) : null;
              const min = x.min_qty != null ? Number(x.min_qty) : null;
              return `
                <div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px">
                  <div style="display:flex;justify-content:space-between;gap:10px">
                    <div style="font-weight:1200">${escapeHtml(x.name)}</div>
                    <div style="font-weight:1200">${min != null ? `Min ${min}` : ""}</div>
                  </div>
                  <div class="muted" style="margin-top:6px;font-weight:1100">
                    Current: <b>${cur != null ? cur : "?"}</b>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  wrap.innerHTML = html;
}

/* =========================================================
   SUMMARY
   ========================================================= */
async function renderSummaryHome() {
  const main = $("#main");

  const isMgr = !!state.session.isManager;
  const defaultMode = isMgr ? (state.view.summaryMode || "PDD") : state.session.store;
  state.view.summaryMode = defaultMode;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    ${isMgr ? `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:8px">Store view</div>
        <div class="row" style="gap:12px">
          <button id="mPDD" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">PDD</button>
          <button id="mSKH" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">SKH</button>
        </div>
        <div id="doneLine" class="muted" style="margin-top:10px;font-weight:1000"></div>
      </div>
    ` : ""}

    <div id="sumWrap" class="col"></div>
  `;

  $("#btnBack").addEventListener("click", goBack);

  if (isMgr) {
    $("#mPDD").addEventListener("click", () => setSummaryMode("PDD"));
    $("#mSKH").addEventListener("click", () => setSummaryMode("SKH"));
  }

  updateSummaryModeButtons();
  await updateDoneIndicator();
  drawSummaryCards().catch(console.error);
}

function setSummaryMode(mode) {
  state.view.summaryMode = mode;
  updateSummaryModeButtons();
  updateDoneIndicator().catch(() => {});
  drawSummaryCards().catch(console.error);
}

function updateSummaryModeButtons() {
  if (!state.session.isManager) return;
  const m = state.view.summaryMode;
  const a = $("#mPDD"), b = $("#mSKH");

  if (a) { a.style.background = "#fff"; a.style.color = "#111"; a.style.border = "1px solid var(--line)"; }
  if (b) { b.style.background = "#fff"; b.style.color = "#111"; b.style.border = "1px solid var(--line)"; }

  if (m === "PDD" && a) { a.style.background = "var(--pdd)"; a.style.color = "#fff"; a.style.border = "0"; }
  if (m === "SKH" && b) { b.style.background = "var(--skh)"; b.style.color = "#fff"; b.style.border = "0"; }
}

async function updateDoneIndicator() {
  if (!state.session.isManager) return;
  const mode = state.view.summaryMode || "PDD";
  const line = $("#doneLine");
  if (!line) return;

  try {
    const s = await apiGet(`/api/status?store=${encodeURIComponent(mode)}`);
    if (!s) {
      line.innerHTML = `⏳ <b>${mode}</b> not done yet today`;
      return;
    }
    const when = s.last_saved_at ? new Date(s.last_saved_at) : null;
    const hhmm = when ? formatTime12(`${pad2(when.getHours())}:${pad2(when.getMinutes())}`) : "";
    line.innerHTML = `✅ <b>${mode}</b> done — last saved by <b>${escapeHtml(s.last_saved_by || "")}</b>${hhmm ? ` at <b>${hhmm}</b>` : ""}`;
  } catch {
    line.textContent = "";
  }
}

async function drawSummaryCards() {
  const wrap = $("#sumWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  const mode = state.session.isManager ? (state.view.summaryMode || "PDD") : state.session.store;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const r = await apiGet(`/api/expiry?store=${encodeURIComponent(mode)}`);
  const rows = enforceArray(r).map((x) => ({ ...x, _store: mode }));

  const todayCount = rows.filter((x) => datePartFromRow(x) === today).length;
  const tomCount = rows.filter((x) => datePartFromRow(x) === tomorrow).length;
  const safeCount = rows.filter((x) => {
    const e = datePartFromRow(x);
    return e && e !== today && e !== tomorrow;
  }).length;

  wrap.innerHTML = `
    <button class="dash-card dash-red" id="sToday" type="button">
      <div class="dash-left">
        <div class="dash-title">Expiring Today</div>
        <div class="dash-sub">Use immediately</div>
      </div>
      <div class="dash-right">
        <div class="dash-num">${todayCount}</div>
        <div class="dash-go">›</div>
      </div>
    </button>

    <button class="dash-card dash-amber" id="sTomorrow" type="button">
      <div class="dash-left">
        <div class="dash-title">Expiring Tomorrow</div>
        <div class="dash-sub">Plan usage</div>
      </div>
      <div class="dash-right">
        <div class="dash-num">${tomCount}</div>
        <div class="dash-go">›</div>
      </div>
    </button>

    <button class="dash-card dash-green" id="sSafe" type="button">
      <div class="dash-left">
        <div class="dash-title">All Safe & Fresh</div>
        <div class="dash-sub">Good to go!</div>
      </div>
      <div class="dash-right">
        <div class="dash-num">${safeCount}</div>
        <div class="dash-go">›</div>
      </div>
    </button>
  `;

  $("#sToday").addEventListener("click", () => setView({ page: "summaryList", bucket: "TODAY" }, true));
  $("#sTomorrow").addEventListener("click", () => setView({ page: "summaryList", bucket: "TOMORROW" }, true));
  $("#sSafe").addEventListener("click", () => setView({ page: "summaryList", bucket: "SAFE" }, true));
}

async function renderSummaryList() {
  const main = $("#main");
  const mode = state.session.isManager ? (state.view.summaryMode || "PDD") : state.session.store;
  const bucket = state.view.bucket || "TODAY";

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">${bucketTitle(bucket)}</div>
    </div>
    <div id="sumList" class="col"></div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const wrap = $("#sumList");
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const r = await apiGet(`/api/expiry?store=${encodeURIComponent(mode)}`);
  let rows = enforceArray(r).map((x) => ({ ...x, _store: mode }));

  rows = rows.filter((x) => {
    const e = datePartFromRow(x);
    if (!e) return false;
    if (bucket === "TODAY") return e === today;
    if (bucket === "TOMORROW") return e === tomorrow;
    return e !== today && e !== tomorrow;
  });

  if (!rows.length) {
    wrap.innerHTML = `<div class="card">No items</div>`;
    return;
  }

  const map = new Map();
  for (const rr of rows) {
    const c = rr.category || "Other";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(rr);
  }

  let html = "";
  for (const [cat, list] of map.entries()) {
    html += `
      <div class="card">
        <div style="font-weight:1200; font-size:18px; margin-bottom:10px">${escapeHtml(cat)}</div>
        <div class="col" style="gap:8px">
          ${list
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map((rr) => {
              const dt = formatLongDMY(datePartFromRow(rr));
              const tm = timePartFromRow(rr);
              const qty = rr.qty != null ? Number(rr.qty) : (rr.quantity != null ? Number(rr.quantity) : null);
              const sh = rr.shift ? String(rr.shift) : "";

              return `
              <div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px">
                <div style="display:flex;justify-content:space-between;gap:10px">
                  <div style="font-weight:1200">${escapeHtml(rr.name || rr.item_name)}</div>
                  <div style="font-weight:1200">${escapeHtml(dt)}</div>
                </div>
                <div class="muted" style="margin-top:6px;font-weight:1000;display:flex;justify-content:space-between">
                  <div>${tm ? `Time: ${escapeHtml(tm)}` : ""} ${sh ? `• ${escapeHtml(sh)}` : ""}</div>
                  <div>${qty != null ? `Qty: ${qty}` : ""}</div>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  wrap.innerHTML = html;
}

function bucketTitle(b) {
  if (b === "TODAY") return "Expiring Today";
  if (b === "TOMORROW") return "Expiring Tomorrow";
  return "All Safe";
}

/* =========================================================
   WISR
   ========================================================= */
function renderWISR() {
  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">WISR Count</div>
    </div>
    <div class="card">
      <div style="font-weight:1200">Blank for now</div>
      <div class="muted">You will provide the data later.</div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);
}

/* =========================================================
   MANAGER
   (same as your original — unchanged)
   ========================================================= */
function renderManagerHome() {
  if (!state.session.isManager) {
    openManagerLogin();
    return;
  }

  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="tiles-2col">
      <button class="tile t-blue" style="animation-delay:0ms" id="tAdd" type="button">
        <div class="emoji">➕</div>
        <div class="title">Add Item</div>
        <div class="sub">Create new item</div>
      </button>

      <button class="tile t-teal" style="animation-delay:45ms" id="tEdit" type="button">
        <div class="emoji">📝</div>
        <div class="title">Edit Items</div>
        <div class="sub">Compact expand</div>
      </button>

      <button class="tile t-purple" style="animation-delay:90ms" id="tCats" type="button">
        <div class="emoji">🗂️</div>
        <div class="title">Categories</div>
        <div class="sub">Tap tile to edit</div>
      </button>

      <button class="tile t-orange" style="animation-delay:135ms" id="tLog" type="button">
        <div class="emoji">⬇️</div>
        <div class="title">Download Log</div>
        <div class="sub">Placeholder</div>
      </button>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);
  $("#tAdd").addEventListener("click", () => openAddItemModal());
  $("#tEdit").addEventListener("click", () => setView({ page: "managerEditItems" }, true));
  $("#tCats").addEventListener("click", () => setView({ page: "managerCategories" }, true));
  $("#tLog").addEventListener("click", () => toast("Download Log: add server endpoint later"));
}

function openManagerLogin() {
  openModal(
    "Manager Login",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">PIN</div>
          <input id="pinInp" class="input" type="password" inputmode="numeric" placeholder="Enter PIN">
          <button id="pinBtn" class="btn btn-red" style="width:100%">Login as Manager</button>
          <button id="pinCancel" class="btn btn-yellow" style="width:100%">Cancel</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#pinCancel").addEventListener("click", () => {
    closeModal();
    goBack();
  });

  $("#pinBtn").addEventListener("click", async () => {
    const pin = String($("#pinInp").value || "").trim();
    if (!pin) return toast("Enter PIN");

    try {
      const r = await apiPost("/api/manager/login", { pin, store: state.session.store });
      state.session.isManager = true;
      state.session.managerToken = r.token || "";
      saveSession();
      closeModal();
      renderRolePill();
      toast("Manager ✅");
      render();
    } catch (e) {
      console.error(e);
      toast("Wrong PIN");
    }
  });
}

/* ---------- manager: edit items ---------- */
async function renderManagerEditItems() {
  if (!state.session.isManager) return openManagerLogin();

  const main = $("#main");
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Edit Items</div>
    </div>

    <div class="card">
      <div style="font-weight:1200">Search</div>
      <input id="mgrSearch" class="input" placeholder="Type item name...">
    </div>

    <div id="mgrList" class="col"></div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const token = state.session.managerToken;
  let items = [];
  try {
    items = await apiGet(`/api/manager/items?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Failed loading items");
  }

  const renderList = (q) => {
    q = String(q || "").toLowerCase().trim();
    const filtered = q ? items.filter((x) => String(x.name).toLowerCase().includes(q)) : items;

    const map = new Map();
    for (const it of filtered) {
      const c = it.category || "Other";
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }

    let html = "";
    for (const [cat, list] of map.entries()) {
      html += `
        <div class="card">
          <div style="font-weight:1200; font-size:18px; margin-bottom:10px">${escapeHtml(cat)}</div>
          <div class="col" style="gap:10px">
            ${list.sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(managerItemRow).join("")}
          </div>
        </div>
      `;
    }

    const wrap = $("#mgrList");
    wrap.innerHTML = html;

    $$(".mgrRow", wrap).forEach((row) => {
      const id = row.dataset.id;
      const toggle = $(`[data-toggle="${cssEsc(id)}"]`, row);
      const panel = $(`[data-panel="${cssEsc(id)}"]`, row);
      const save = $(`[data-save="${cssEsc(id)}"]`, row);
      const del = $(`[data-del="${cssEsc(id)}"]`, row);

      toggle.addEventListener("click", () => {
        panel.classList.toggle("hidden");
        toggle.textContent = panel.classList.contains("hidden") ? "Edit" : "Close";
      });

      save.addEventListener("click", async () => {
        const catSel = $(`[data-cat="${cssEsc(id)}"]`, row);
        const subSel = $(`[data-sub="${cssEsc(id)}"]`, row);
        const lifeInp = $(`[data-life="${cssEsc(id)}"]`, row);
        const hourlyChk = $(`[data-hourly="${cssEsc(id)}"]`, row);

        const category = String(catSel.value || "").trim();
        const sub_category = String(subSel.value || "").trim() || null;
        const shelf_life_days = Number(lifeInp.value || 0);
        const is_hourly = !!hourlyChk?.checked;

        try {
          await apiPatch(
            `/api/manager/items/${id}`,
            { store: state.session.store, category, sub_category, shelf_life_days, is_hourly },
            token
          );
          toast("Saved ✅");
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Save failed");
        }
      });

      del.addEventListener("click", async () => {
        if (!confirm("Delete this item?")) return;
        try {
          await apiDel(`/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`, token);
          toast("Deleted ✅");
          items = items.filter((x) => String(x.id) !== String(id));
          renderList($("#mgrSearch").value);
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Delete failed");
        }
      });
    });
  };

  $("#mgrSearch").addEventListener("input", (e) => renderList(e.target.value));
  renderList("");
}

function managerItemRow(it) {
  const id = String(it.id);
  const cats = (state.data.categories || []).map((c) => c.name);
  const catOpts = cats
    .map((c) => `<option value="${escapeHtml(c)}"${c === it.category ? " selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");

  const subOpts = [`<option value="">(none)</option>`]
    .concat(
      SAUCE_SUBS.map(
        (s) =>
          `<option value="${escapeHtml(s.name)}"${
            normalizeSub(it.sub_category || "") === s.name ? " selected" : ""
          }>${escapeHtml(s.name)}</option>`
      )
    )
    .join("");

  return `
    <div class="mgrRow" data-id="${escapeHtml(id)}" style="border:1px solid var(--line);border-radius:16px;padding:12px">
      <div class="row" style="justify-content:space-between">
        <div style="font-weight:1200">${escapeHtml(it.name)}</div>
        <button class="btn btn-ghost" data-toggle="${escapeHtml(id)}" type="button">Edit</button>
      </div>
      <div class="muted" style="margin-top:8px;font-weight:1000">${escapeHtml(it.category)} • ${escapeHtml(it.shelf_life_days)} day</div>

      <div class="hidden" data-panel="${escapeHtml(id)}" style="margin-top:12px">
        <div class="col">
          <div style="font-weight:1200">Category</div>
          <select class="select" data-cat="${escapeHtml(id)}">${catOpts}</select>

          <div style="font-weight:1200">Sauce Sub-category</div>
          <select class="select" data-sub="${escapeHtml(id)}">${subOpts}</select>

          <div style="font-weight:1200">Shelf life (days)</div>
          <input class="input" type="number" min="0" data-life="${escapeHtml(id)}" value="${escapeHtml(it.shelf_life_days)}">

          <label style="display:flex;gap:10px;align-items:center;margin-top:6px;font-weight:1200">
            <input type="checkbox" data-hourly="${escapeHtml(id)}" ${it.is_hourly ? "checked" : ""}>
            Hourly expiry (time only)
          </label>

          <div class="row">
            <button class="btn btn-yellow" data-save="${escapeHtml(id)}" type="button" style="flex:1">Save</button>
            <button class="btn btn-red" data-del="${escapeHtml(id)}" type="button" style="flex:1">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---------- manager: categories ---------- */
async function renderManagerCategories() {
  if (!state.session.isManager) return openManagerLogin();

  const main = $("#main");
  let cats = [];
  try {
    cats = await apiGet(
      `/api/manager/categories?store=${encodeURIComponent(state.session.store)}`,
      state.session.managerToken
    );
  } catch (e) {
    console.error(e);
    toast("Failed loading categories");
  }

  const tiles = cats
    .filter((c) => c.is_active !== false)
    .map((c, idx) => {
      const tone = tileToneFor(c.name);
      return `
        <button class="tile ${tone}" style="min-height:100px;animation-delay:${idx*45}ms" data-cid="${c.id}" data-cname="${escapeHtml(c.name)}" type="button">
          <div class="title" style="font-size:20px">${escapeHtml(c.name)}</div>
          <div class="sub">Tap to edit</div>
        </button>
      `;
    })
    .join("");

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Categories</div>
    </div>

    <div class="tiles-2col">${tiles}</div>

    <button id="addCat" class="btn btn-blue" style="width:100%">➕ Add Category</button>
  `;

  $("#btnBack").addEventListener("click", goBack);

  $$(".tile", main).forEach((b) => {
    b.addEventListener("click", () => openEditCategoryModal(b.dataset.cid, b.dataset.cname));
  });

  $("#addCat").addEventListener("click", openAddCategoryModal);
}

function openAddCategoryModal() {
  openModal(
    "Add Category",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">Name</div>
          <input id="catName" class="input" placeholder="Category name">
          <div style="font-weight:1200">Sort order</div>
          <input id="catSort" class="input" type="number" value="100">
          <button id="catSave" class="btn btn-yellow" style="width:100%">Save</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave").addEventListener("click", async () => {
    const name = String($("#catName").value || "").trim();
    const sort_order = Number($("#catSort").value || 100);
    if (!name) return toast("Name required");

    try {
      await apiPost(
        "/api/manager/categories",
        { store: state.session.store, name, sort_order },
        state.session.managerToken
      );
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });
}

function openEditCategoryModal(id, currentName) {
  openModal(
    "Edit Category",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">Name</div>
          <input id="catName" class="input" value="${escapeHtml(currentName)}">
          <div style="font-weight:1200">Active</div>
          <select id="catActive" class="select">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <button id="catSave" class="btn btn-yellow" style="width:100%">Save</button>
          <button id="catDelete" class="btn btn-red" style="width:100%">Delete</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave").addEventListener("click", async () => {
    const name = String($("#catName").value || "").trim();
    const is_active = $("#catActive").value === "true";
    if (!name) return toast("Name required");

    try {
      await apiPatch(
        `/api/manager/categories/${id}`,
        { store: state.session.store, name, is_active, sort_order: 100 },
        state.session.managerToken
      );
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });

  $("#catDelete").addEventListener("click", async () => {
    if (!confirm("Delete this category?")) return;
    try {
      await apiDel(
        `/api/manager/categories/${id}?store=${encodeURIComponent(state.session.store)}`,
        state.session.managerToken
      );
      toast("Deleted ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Delete failed");
    }
  });
}

/* ---------- manager: add item modal ---------- */
function openAddItemModal() {
  const cats = (state.data.categories || []).map((c) => c.name);
  const catOpts = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const subOpts = [`<option value="">(none)</option>`]
    .concat(SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`))
    .join("");

  openModal(
    "Add Item",
    `
      <div class="card">
        <div class="col">
          <div style="font-weight:1200">Item name</div>
          <input id="itName" class="input" placeholder="e.g. Beef Brisket">

          <div style="font-weight:1200">Category</div>
          <select id="itCat" class="select">${catOpts}</select>

          <div style="font-weight:1200">Sauce Sub-category</div>
          <select id="itSub" class="select">${subOpts}</select>

          <div style="font-weight:1200">Shelf life (days)</div>
          <input id="itLife" class="input" type="number" min="0" value="0">

          <label style="display:flex;gap:10px;align-items:center;margin-top:6px;font-weight:1200">
            <input id="itHourly" type="checkbox">
            Hourly expiry (time only)
          </label>

          <button id="itSave" class="btn btn-yellow" style="width:100%">Save</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#itSave").addEventListener("click", async () => {
    const name = String($("#itName").value || "").trim();
    const category = String($("#itCat").value || "").trim();
    const sub_category = String($("#itSub").value || "").trim() || null;
    const shelf_life_days = Number($("#itLife").value || 0);
    const is_hourly = !!$("#itHourly")?.checked;

    if (!name || !category) return toast("Missing name/category");

    try {
      await apiPost(
        "/api/manager/items",
        { store: state.session.store, name, category, sub_category, shelf_life_days, is_hourly },
        state.session.managerToken
      );
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });
}

/* =========================================================
   LOGOUT
   ========================================================= */
function doLogout() {
  state.session.store = "";
  state.session.staff = "";
  state.session.shift = "AM";
  state.session.isManager = false;
  state.session.managerToken = "";
  state.session.sessionDayKey = dayKeyNow();
  saveSession();

  state.data.categories = [];
  state.data.items = [];
  state.drafts = {};
  state.navStack = [];
  state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };

  renderRolePill();
  render();
}

/* =========================================================
   UTILS (must be last in your file)
   ========================================================= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function cssEsc(s) {
  return String(s).replaceAll('"', '\\"');
}
function enforceArray(v) {
  return Array.isArray(v) ? v : [];
}

/* =========================
   QTY UX helpers
   ========================= */
function haptic(ms = 12) {
  try {
    if (navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {}
}
function pulseBtn(btn) {
  if (!btn) return;
  btn.classList.remove("pulse");
  void btn.offsetWidth;
  btn.classList.add("pulse");
}
function updateQtyUI(root, key) {
  const d = state.drafts[key] || { qty: 0 };
  const dec = $(`[data-dec="${cssEsc(key)}"]`, root);
  const qty = $(`[data-qty="${cssEsc(key)}"]`, root);

  const q = Math.max(0, Number(d.qty) || 0);
  d.qty = q;
  if (qty) qty.value = String(q);

  if (dec) {
    const disabled = q <= 0;
    dec.disabled = disabled;
    dec.classList.toggle("is-disabled", disabled);
  }
}
