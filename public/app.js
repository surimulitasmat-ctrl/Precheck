/* =========================
   PreCheck — public/app.js (FULL)
   PART 1 / 4

   Includes:
   - DOM helpers
   - constants
   - state
   - boot + session storage
   - date/time helpers
   - hourly times
   - API helpers
   - Render wakeServer
   - data load + normalizeSub
   - topbar + drawer + modal/toast
   - saving overlay (Saving… / Deleting…)
   - shift DONE + last item saved (single source of truth) ✅
   - popup + midnight reset
   - login page

   NOTE:
   - PART 2: navigation + drafts + home/category + editors + saveCategory + NEW iOS wheel picker ✅
   - PART 3: stock alert + summary (shows last item) + wisr
   - PART 4: manager pages (with loading overlay) + logout + utils
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
  __draftsHydrated: false,
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

  // Wake server (best-effort)
  await wakeServer().catch(() => {});

  if (!state.session.store || !state.session.staff) {
    state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };
    render();
    setTimeout(hideSplashScreen, 300); // ✅ Hides splash screen on login page
    return;
  }

  showSaving("Loading…");
  try {
    await loadAllForCurrentStore();
    await refreshStockDot().catch(() => {});
  } finally {
    hideSaving();
  }

  maybeShowExpiryPopup(false);
  render();
  
  setTimeout(hideSplashScreen, 500); // ✅ Hides splash screen after data loads
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
   HOURLY SHORT TIMES
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

/* =========================================================
   Render sleep handling — Wake server
   ========================================================= */
async function wakeServer() {
  try {
    await apiGet("/api/health");
  } catch {
    // don’t crash; just inform user
    toast("Waking server… try again in 5–10s");
  }
}

/* =========================================================
   DATA LOAD
   ========================================================= */
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

  // 1. Assign the classes. 
  // The CSS (.role-btn.manager or .role-btn.staff) will handle the colors now.
  btn.className = `role-btn ${state.session.isManager ? "manager" : "staff"}`;

  // 2. Set the text/icon
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

  // ✅ Removed Dark Mode toggle binding

  bind("#drawerLogout", () => doLogout());
}

function openDrawer() {
  const b = $("#drawerBackdrop");
  if (b) b.classList.remove("hidden");
}
function closeDrawer() { const b = $("#drawerBackdrop"); if (b) b.classList.add("hidden"); }

/* Stock Alert label + dot (single source of truth) */
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
      if (e.target === backdrop) {
        // ✅ block closing if noBackdropClose was requested
        if (backdrop.dataset.noClose === "1") return;
        closeModal();
      }
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
back.dataset.noClose = opts.noBackdropClose ? "1" : "0";

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
  if (back) {
    back.classList.add("hidden");
    back.dataset.noClose = "0"; // ✅ add
  }
  if (b) b.innerHTML = "";
}


/* =========================================================
   LOADING / SAVING OVERLAY ✅
   Used by staff save + manager actions so app doesn't feel stuck
   ========================================================= */
/* =========================================================
   LOADING / SAVING OVERLAY (Sandwich Edition 🥪)
   ========================================================= */
function ensureSavingOverlay() {
  let el = document.getElementById("pcSavingOverlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "pcSavingOverlay";
  el.className = "hidden";
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.background = "rgba(0,0,0,0.45)"; // Slightly darker for contrast
  el.style.backdropFilter = "blur(4px)"; // Blur background content
  el.style.zIndex = "9999";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  
  // New HTML with Sandwich Animation Structure
  el.innerHTML = `
    <div style="background:#fff; border-radius:24px; padding:24px 30px; min-width:240px; box-shadow:0 20px 60px rgba(0,0,0,0.3); text-align:center;">
      
      <div class="sandwich-loader">
        <div class="sb-layer sb-bun-bot"></div>
        <div class="sb-layer sb-meat"></div>
        <div class="sb-layer sb-cheese"></div>
        <div class="sb-layer sb-lettuce"></div>
        <div class="sb-layer sb-tomato"></div>
        <div class="sb-layer sb-bun-top"></div>
      </div>

      <div id="pcSavingMsg" style="font-weight:1200; font-size:18px; color:#111;">Making it fresh...</div>
      <div class="muted" style="margin-top:6px; font-weight:900; font-size:14px;">Please wait</div>
    </div>
  `;
  
  document.body.appendChild(el);
  return el;
}
function showSaving(msg = "Saving…") {
  const el = ensureSavingOverlay();
  const m = document.getElementById("pcSavingMsg");
  if (m) m.textContent = msg;
  el.classList.remove("hidden");
}
function hideSaving() {
  const el = document.getElementById("pcSavingOverlay");
  if (el) el.classList.add("hidden");
}

/* =========================================================
   SHIFT DONE + LAST ITEM ✅ (single source of truth)
   - Marks shift as DONE even if only 1 item saved
   - Stores last item saved (device-based, per day)
   ========================================================= */
function shiftDoneLastKey(store, dayKey, shift) {
  return `pc_done_last_${store}_${dayKey}_${shift}`;
}
function recordShiftDoneAndLast({ store, shift, staff, lastItemName }) {
  try {
    const dayKey = dayKeyNow();
    localStorage.setItem(
      shiftDoneLastKey(store, dayKey, shift),
      JSON.stringify({
        done: true,
        store,
        shift,
        staff: staff || "",
        lastItemName: lastItemName || "",
        at: new Date().toISOString(),
      })
    );
  } catch {}
}
function readShiftDoneAndLast(store, shift) {
  try {
    const dayKey = dayKeyNow();
    const raw = localStorage.getItem(shiftDoneLastKey(store, dayKey, shift));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

  // Generate Tags HTML
  const listHtml = POPUP_ITEMS.map((x) => `
    <div class="popup-tag">${escapeHtml(x)}</div>
  `).join("");

  openModal(
    " ", // Empty title to let our custom HTML handle the layout cleaner
    `
      <div class="popup-content-center">
        <div class="popup-icon-large">⚠️</div>
        
        <div class="popup-title-text">
          Double Check Required
        </div>
        
        <div class="popup-sub-text">
          Please verify the expiry dates for these specific items before saving:
        </div>

        <div class="popup-tags-grid">
          ${listHtml}
        </div>

        <button id="popupOk" class="btn btn-yellow btn-action">
          I've Checked Them
        </button>
      </div>
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

    showSaving("Loading…");
    try {
      await wakeServer().catch(() => {});
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
    } finally {
      hideSaving();
    }
  });
}

/* =========================
   END PART 1 / 4
   ========================= */
/* =========================
   PreCheck — public/app.js (FULL)
   PART 2A / 4

   Includes:
   - navigation
   - back/swipe guard
   - draft persistence (store+shift+day)
   - render root
   - home + category
   - shelfLifeModeFor
   - category progress tracker
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
  state.view = prev
    ? prev
    : { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null };
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
  try {
    history.pushState({ pc: 1 }, "");
  } catch {}
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
    try {
      backGuardArmed = false;
      history.back();
    } catch {}
  });
}

/* =========================================================
   Draft persistence (store+shift+day scoped)
   ========================================================= */
function draftsKey() {
  const s = state.session;
  const store = s.store || "NA";
  const shift = s.shift || "AM";
  const day = s.sessionDayKey || dayKeyNow();
  return `drafts_${store}_${shift}_${day}`;
}
function loadDraftsFromStorage() {
  try {
    const raw = localStorage.getItem(draftsKey());
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") state.drafts = obj;
  } catch {}
}
function saveDraftsToStorage() {
  try {
    localStorage.setItem(draftsKey(), JSON.stringify(state.drafts || {}));
  } catch {}
}

/* hydrate once if already logged in */
(function hydrateDraftsOnce() {
  if (state.session?.store && state.session?.staff) loadDraftsFromStorage();
})();

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

  if (!state.__draftsHydrated) {
    state.__draftsHydrated = true;
    loadDraftsFromStorage();
  }

  switch (state.view.page) {
    case "login":
      return renderLoginPage();
    case "home":
      return renderHome();
    case "category":
      return renderCategory();
    case "stockAlerts":
      return renderStockAlerts();
    case "summaryHome":
      return renderSummaryHome();
    case "summaryList":
      return renderSummaryList();
    case "wisr":
      return renderWISR();
    case "manager":
      return renderManagerHome();
    case "managerEditItems":
      return renderManagerEditItems();
    case "managerCategories":
      return renderManagerCategories();
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
  
  // Create Category Tiles HTML (Keep your existing logic)
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

  // --- NEW: Render Structure ---
  main.innerHTML = `
    <div class="col">
      <div style="position:relative; margin-bottom: 10px;">
        <input id="homeSearch" class="input" placeholder="🔍 Search item..." 
               style="padding-left: 44px; height: 50px; border-radius: 99px; box-shadow: var(--shadow-soft);">
        <div style="position:absolute; left:16px; top:13px; font-size:20px">🔍</div>
      </div>

      <div id="homeSearchResults" class="hidden col"></div>

      <div id="homeTiles" class="tiles-2col">${tiles}</div>
    </div>
  `;

  // --- Bind Category Clicks ---
  $$(".tile", main).forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.dataset.cat;
      setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });

  // --- NEW: Bind Search Logic ---
  const inp = $("#homeSearch");
  const res = $("#homeSearchResults");
  const grid = $("#homeTiles");

  inp.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();

    if (!q) {
      res.classList.add("hidden");
      grid.classList.remove("hidden");
      return;
    }

    grid.classList.add("hidden");
    res.classList.remove("hidden");

    // Filter Items
    const matches = (state.data.items || []).filter(it => 
      it.name.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      res.innerHTML = `
        <div class="card" style="text-align:center; padding:30px;">
          <div style="font-size:32px">🤔</div>
          <div style="font-weight:1200; margin-top:10px">No items found</div>
        </div>`;
      return;
    }

    // Render Matching Items (Re-using renderItemEditor logic is tricky here because 
    // renderItemEditor expects a specific context. 
    // Instead, we make "Jump to Category" buttons).
   // Render Matching Items (New Clean Design)
    res.innerHTML = matches.map(it => `
      <button class="search-result-card jump-btn" 
              data-cat="${escapeHtml(it.category)}" 
              data-sub="${escapeHtml(it.sub_category || "")}">
        
        <div style="flex:1; padding-right:10px; overflow:hidden;">
          <div style="font-weight:1200; font-size:17px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${escapeHtml(it.name)}
          </div>
          <div style="font-size:13px; opacity:0.6; font-weight:800; display:flex; align-items:center; gap:4px">
            <span style="font-size:14px">📂</span> 
            ${escapeHtml(it.category)} 
            ${it.sub_category ? `• ${escapeHtml(it.sub_category)}` : ""}
          </div>
        </div>

        <div class="search-pill">
          Go
        </div>

      </button>
    `).join("");
    // Bind Jump Buttons
    $$(".jump-btn", res).forEach(btn => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.cat;
        const sub = btn.dataset.sub || null;
        
        // 1. Go to category
        setView({ page: "category", category: cat, sauceSub: sub }, true);
        
        // 2. Optional: Scroll to item (Advanced) - requires setTimeout to wait for render
      });
    });
  });
}
function tileToneFor(name) {
  const map = {
    "Prepared items": "t-green",
    "Unopened chiller": "t-blue",
    Thawing: "t-cyan",
    Vegetables: "t-green2",
    Backroom: "t-orange",
    "Front counter": "t-red",
    "Back counter chiller": "t-teal",
    "Fountain Drinks": "t-green2",
    Sauce: "t-purple",
  };
  return map[name] || "t-pink";
}

/* =========================================================
   CATEGORY
   ========================================================= */
function renderCategory() {
  const main = $("#main");
  const cat = state.view.category;

  // --- 1. Handle "Sauce" Sub-menu Navigation ---
  if (cat === "Sauce" && !state.view.sauceSub) {
    const tiles = SAUCE_SUBS.map((s, idx) => {
      const tone =
        s.tone === "teal" ? "t-teal" : s.tone === "purple" ? "t-purple" : "t-orange";
      return `
        <button class="tile ${tone}" style="min-height:120px;animation-delay:${idx * 60}ms" data-sub="${escapeHtml(
        s.name
      )}" type="button">
          <div class="emoji" style="font-size:56px">${s.emoji}</div>
          <div class="title" style="font-size:20px">${escapeHtml(s.name)}</div>
          <div class="sub">Tap to open</div>
        </button>
      `;
    }).join("");

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

  // --- 2. Prepare Items & Progress ---
  const sauceSub = state.view.sauceSub;
  const title = cat === "Sauce" && sauceSub ? `Sauce — ${sauceSub}` : cat;

  let items = (state.data.items || []).filter((x) => x.category === cat);
  if (cat === "Sauce" && sauceSub) {
    items = items.filter((x) => (x.sub_category || "") === normalizeSub(sauceSub));
  }

  const prog = categoryProgress(items, cat);
  const doneAll = prog.total > 0 && prog.done === prog.total;

  // --- 3. Render List of Editors ---
  const list = items.map((it) => renderItemEditor(it, cat)).join("");

  // --- 4. New Visual Empty Hint ---
  const emptyHint = items.length
    ? ""
    : `
    <div style="text-align:center; padding: 40px 20px; opacity:0.6">
      <div style="font-size:48px; margin-bottom:10px">🥬</div>
      <div style="font-weight:1200; font-size:18px">No items here</div>
      <div style="font-size:14px; margin-top:4px">Everything looks clean!</div>
    </div>
  `;

  // --- 5. Render Main HTML (With Progress Bar) ---
  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      
      <div class="page-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1">
        <span>${escapeHtml(title)}</span>
        ${
          prog.total
            ? `
            <div style="display:flex; align-items:center; margin-left:auto;">
               <span id="catProgText" style="font-size:12px; font-weight:900; opacity:0.7; margin-right:8px">
                 ${prog.done}/${prog.total}
               </span>
               <div class="prog-track">
                 <div id="catProgBar" class="prog-fill" style="width:${prog.pct}%"></div>
               </div>
            </div>`
            : ""
        }
      </div>
    </div>

    ${emptyHint}

    <div class="edit-list" id="editList">${list}</div>

    <div class="save-bar">
      <button
        id="saveBtn"
        type="button"
        id="saveBtn"
        style="width:min(92%,520px); margin:0 auto; padding:14px 18px; border-radius:999px; font-weight:1200; font-size:16px;
               background:var(--green); color:#fff; border:0; box-shadow:0 14px 26px rgba(0,0,0,.16);"
      >${doneAll ? "Done checking ✅ (Save)" : "Save"}</button>
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
  if (it.is_hourly) return { mode: "HOURLY", life: 0 };

  const life = Number(it.shelf_life_days || 0);

  if (isChickenBaconC(it.name)) return { mode: "EOD_AUTO", life };
  if (FORCE_MANUAL_DATE_CATS.has(cat)) return { mode: "MANUAL", life };
  if (!Number.isFinite(life) || life <= 0) return { mode: "MANUAL", life };
  if (life > 7) return { mode: "MANUAL", life };

  return { mode: "PRESET", life };
}

/* =========================================================
   Category progress tracker
   ========================================================= */
function categoryProgress(items, cat) {
  let total = 0;
  let done = 0;
  const today = todayISO();

  for (const it of items || []) {
    const key = itemKey(it);
    const d = state.drafts[key] || {};
    const qty = Number(d.qty) || 0;
    if (qty <= 0) continue;
    total++;

    const rule = shelfLifeModeFor(it, cat);
    if (rule.mode === "HOURLY") {
      if (d.expTimeShort) done++;
      continue;
    }
    if (rule.mode === "EOD_AUTO") {
      done++;
      continue;
    }
    const exp = String(d.expDateISO || "");
    if (exp) {
      // ✅ now backdated is allowed to be selected, so "done" means it has a date
      done++;
    }
  }

  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}
function refreshCategoryProgressUI(items, cat) {
  const prog = categoryProgress(items, cat);
  
  // 1. Update text (e.g., "5/10")
  const textEl = document.getElementById("catProgText");
  if (textEl) {
    textEl.textContent = prog.total ? `${prog.done}/${prog.total}` : "";
  }

  // 2. Animate the bar width
  const barEl = document.getElementById("catProgBar");
  if (barEl) {
    barEl.style.width = `${prog.pct}%`;
  }

  // 3. Update Save button state
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    const doneAll = prog.total > 0 && prog.done === prog.total;
    saveBtn.textContent = doneAll ? "Done checking ✅ (Save)" : "Save";
  }
}

/* =========================
   END PART 2A / 4
   ========================= */
/* =========================================================
   DATE WHEEL PICKER (iOS-style wheel, themed)
   - Day + Month: looping wheel (no empty end)
   - Year: 2000..2100 (default), or clamp to min/max if provided
   - Backdated allowed, but warns on confirm if date < today
   ========================================================= */

function ensurePCWheelStyles() {
  if (document.getElementById("pcWheelStyles")) return;
  const css = document.createElement("style");
  css.id = "pcWheelStyles";
  css.textContent = `
  .pc-ios-wheel{
    padding:12px 6px 6px;
    user-select:none;
  }
  .pc-ios-wheel .pc-wheel-title{
    font-weight:1200;
    font-size:16px;
    margin-bottom:10px;
  }
  .pc-ios-wheel .pc-wheel-frame{
    position:relative;
    border-radius:22px;
    background:#fff;
    border:1px solid var(--line);
    overflow:hidden;
    padding:10px 10px 12px;
  }
  .pc-ios-wheel .pc-wheel-cols{
    display:flex;
    gap:10px;
  }
  .pc-ios-wheel .pc-col{
    flex:1;
    min-width:0;
  }
  .pc-ios-wheel .pc-label{
    font-weight:1100;
    font-size:12px;
    color:#666;
    margin:0 4px 6px;
  }
  .pc-ios-wheel .pc-list{
    height:220px;
    overflow:auto;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
    border-radius:18px;
    background:rgba(0,0,0,0.02);
    position:relative;
  }
  .pc-ios-wheel .pc-list::-webkit-scrollbar{ display:none; }

  .pc-ios-wheel .pc-item{
    height:44px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight:1200;
    font-size:18px;
    color:#111;
    border:0;
    background:transparent;
    width:100%;
  }
  .pc-ios-wheel .pc-item.dim{
    opacity:0.25;
    font-weight:1100;
  }

  .pc-ios-wheel .pc-highlight{
    position:absolute;
    left:10px; right:10px;
    top:50%;
    transform:translateY(-50%);
    height:44px;
    border-radius:16px;
    background:rgba(0, 153, 84, 0.10);
    border:1px solid rgba(0, 153, 84, 0.18);
    pointer-events:none;
  }
  .pc-ios-wheel .pc-fadeTop,
  .pc-ios-wheel .pc-fadeBot{
    position:absolute; left:0; right:0;
    height:42px;
    pointer-events:none;
    z-index:3;
  }
  .pc-ios-wheel .pc-fadeTop{
    top:0;
    background:linear-gradient(#fff, rgba(255,255,255,0));
  }
  .pc-ios-wheel .pc-fadeBot{
    bottom:0;
    background:linear-gradient(rgba(255,255,255,0), #fff);
  }

  .pc-ios-wheel .pc-actions{
    display:flex;
    gap:12px;
    margin-top:12px;
  }
  .pc-ios-wheel .pc-btn{
    flex:1;
    padding:14px 14px;
    border-radius:999px;
    font-weight:1200;
    border:0;
  }
  .pc-ios-wheel .pc-btn.cancel{
    background:var(--yellow);
    color:#111;
  }
  .pc-ios-wheel .pc-btn.ok{
    background:var(--green);
    color:#fff;
  }
  `;
  document.head.appendChild(css);
}

function openDateWheelModal({ title, initialISO, minISO, maxISO, onPick }) {
  ensurePCWheelStyles();

  const today = todayISO();

  // Default range: allow backdated + up to 2100
  const min = String(minISO || "2000-01-01").slice(0, 10);
  const max = String(maxISO || "2100-12-31").slice(0, 10);

  function parseISO(iso) {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    return isNaN(d) ? null : d;
  }
  function clampISO(iso) {
    const s = String(iso).slice(0, 10);
    if (s < min) return min;
    if (s > max) return max;
    return s;
  }
  const initISO = clampISO(initialISO || today);

  let cur = parseISO(initISO) || parseISO(today) || new Date();
  let y = cur.getFullYear();
  let m = cur.getMonth() + 1;
  let d = cur.getDate();

  function daysInMonth(yy, mm) {
    return new Date(yy, mm, 0).getDate(); // mm 1..12
  }
  function toISO(yy, mm, dd) {
    return `${yy}-${pad2(mm)}-${pad2(dd)}`;
  }
  const monthLabel = (mm) => new Date(2000, mm - 1, 1).toLocaleString("en", { month: "long" });

  // Year list (non-loop), clamped to min/max years, max <= 2100
  const minY = Math.max(2000, new Date(min + "T00:00:00").getFullYear());
  const maxY = Math.min(2100, new Date(max + "T00:00:00").getFullYear());

  const years = [];
  for (let yy = minY; yy <= maxY; yy++) years.push(yy);

  openModal(
    title || "Pick date",
    `
    <div class="pc-ios-wheel">
      <div class="pc-wheel-title">${escapeHtml(title || "Pick date")}</div>

      <div class="pc-wheel-frame">
        <div class="pc-wheel-cols">
          <div class="pc-col">
            <div class="pc-label">Day</div>
            <div class="pc-list" id="pcWheelDay"></div>
          </div>
          <div class="pc-col">
            <div class="pc-label">Month</div>
            <div class="pc-list" id="pcWheelMon"></div>
          </div>
          <div class="pc-col">
            <div class="pc-label">Year</div>
            <div class="pc-list" id="pcWheelYear"></div>
          </div>
        </div>

        <div class="pc-highlight" aria-hidden="true"></div>
        <div class="pc-fadeTop" aria-hidden="true"></div>
        <div class="pc-fadeBot" aria-hidden="true"></div>
      </div>

      <div class="pc-actions">
        <button class="pc-btn cancel" type="button" id="pcWheelCancel">Cancel</button>
        <button class="pc-btn ok" type="button" id="pcWheelOk">Set date</button>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  const dayEl = $("#pcWheelDay");
  const monEl = $("#pcWheelMon");
  const yearEl = $("#pcWheelYear");
  const okEl = $("#pcWheelOk");

  $("#pcWheelCancel")?.addEventListener("click", closeModal);

  // --- Looping builders (3 cycles) ---
  const LOOP_CYCLES = 3;

  function buildMonthLoop() {
    const arr = [];
    for (let c = 0; c < LOOP_CYCLES; c++) {
      for (let mm = 1; mm <= 12; mm++) {
        arr.push(mm);
      }
    }
    monEl.innerHTML = arr
      .map((mm) => `<button class="pc-item" type="button" data-v="${mm}">${escapeHtml(monthLabel(mm))}</button>`)
      .join("");
  }

  function buildDayLoop() {
    const dim = daysInMonth(y, m);
    if (d > dim) d = dim;
    if (d < 1) d = 1;

    const arr = [];
    for (let c = 0; c < LOOP_CYCLES; c++) {
      for (let dd = 1; dd <= dim; dd++) arr.push(dd);
    }
    dayEl.innerHTML = arr
      .map((dd) => `<button class="pc-item" type="button" data-v="${dd}">${dd}</button>`)
      .join("");
  }

  function buildYear() {
    yearEl.innerHTML = years
      .map((yy) => `<button class="pc-item" type="button" data-v="${yy}">${yy}</button>`)
      .join("");
  }

  function setActiveByValue(container, value) {
    // mark nearest visible matching as "active" by styling (optional)
    // We keep it simple: no active class needed; snap decides value.
    container.querySelectorAll(".pc-item").forEach((x) => x.classList.remove("active"));
    const match = container.querySelector(`.pc-item[data-v="${cssEsc(String(value))}"]`);
    if (match) match.classList.add("active");
  }

  function scrollToValueLoop(container, value) {
    const items = Array.from(container.querySelectorAll(".pc-item"));
    if (!items.length) return;

    // pick the middle cycle occurrence so you can scroll up/down
    const midIndex = Math.floor(items.length / 2);
    let best = null;
    let bestDist = Infinity;

    for (const it of items) {
      if (String(it.dataset.v) !== String(value)) continue;
      const idx = items.indexOf(it);
      const dist = Math.abs(idx - midIndex);
      if (dist < bestDist) {
        bestDist = dist;
        best = it;
      }
    }
    if (!best) best = items[0];

    const top = best.offsetTop - container.clientHeight / 2 + best.clientHeight / 2;
    container.scrollTo({ top, behavior: "auto" });
  }

  function scrollToValue(container, value) {
    const it = container.querySelector(`.pc-item[data-v="${cssEsc(String(value))}"]`);
    if (!it) return;
    const top = it.offsetTop - container.clientHeight / 2 + it.clientHeight / 2;
    container.scrollTo({ top, behavior: "auto" });
  }

  function snapToClosest(container, onPickVal, isLoop) {
    const items = Array.from(container.querySelectorAll(".pc-item"));
    if (!items.length) return;

    const center = container.scrollTop + container.clientHeight / 2;

    let best = null;
    let bestDist = Infinity;
    for (const it of items) {
      const itCenter = it.offsetTop + it.clientHeight / 2;
      const dist = Math.abs(itCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = it;
      }
    }
    if (!best) return;

    const v = best.dataset.v;
    onPickVal(v, true);

    // For looping lists: keep the scroll around the middle cycle so it never hits end
    if (isLoop) {
      // after picking, re-center to the middle cycle matching value
      setTimeout(() => scrollToValueLoop(container, v), 0);
    }
  }

  function bindWheel(container, onPickVal, isLoop = false) {
    if (container.dataset.bound === "1") return;
    container.dataset.bound = "1";

    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".pc-item");
      if (!btn) return;
      onPickVal(btn.dataset.v, false);
      // click should also center it
      if (isLoop) scrollToValueLoop(container, btn.dataset.v);
      else scrollToValue(container, btn.dataset.v);
      haptic(10);
    });

    let t = null;
    container.addEventListener(
      "scroll",
      () => {
        clearTimeout(t);
        t = setTimeout(() => snapToClosest(container, onPickVal, isLoop), 90);
      },
      { passive: true }
    );
  }

  function setDay(v, fromSnap) {
    d = Number(v);
    const dim = daysInMonth(y, m);
    if (d > dim) d = dim;
    if (d < 1) d = 1;
    setActiveByValue(dayEl, d);
    if (!fromSnap) haptic(8);
  }

  function setMon(v, fromSnap) {
    m = Number(v);
    if (m < 1) m = 1;
    if (m > 12) m = 12;
    buildMonthLoop();
    buildDayLoop();
    bindWheel(monEl, setMon, true);
    bindWheel(dayEl, setDay, true);
    scrollToValueLoop(monEl, m);
    scrollToValueLoop(dayEl, d);
    setActiveByValue(monEl, m);
    if (!fromSnap) haptic(8);
  }

  function setYear(v, fromSnap) {
    y = Number(v);
    if (!Number.isFinite(y)) y = minY;
    buildYear();
    buildMonthLoop();
    buildDayLoop();
    bindWheel(yearEl, setYear, false);
    bindWheel(monEl, setMon, true);
    bindWheel(dayEl, setDay, true);
    scrollToValue(yearEl, y);
    scrollToValueLoop(monEl, m);
    scrollToValueLoop(dayEl, d);
    setActiveByValue(yearEl, y);
    if (!fromSnap) haptic(8);
  }

  // initial render
  buildYear();
  buildMonthLoop();
  buildDayLoop();

  bindWheel(yearEl, setYear, false);
  bindWheel(monEl, setMon, true);
  bindWheel(dayEl, setDay, true);

  // start centered
  setTimeout(() => {
    scrollToValue(yearEl, y);
    scrollToValueLoop(monEl, m);
    scrollToValueLoop(dayEl, d);
  }, 0);

  okEl.addEventListener("click", () => {
    const picked = toISO(y, m, d);
    const iso = clampISO(picked);

    // backdated warning (but still allow)
    if (iso < today) {
      openModal(
        "Backdated date",
        `
          <div class="card">
            <div style="font-weight:1200;font-size:18px;margin-bottom:8px">Warning ⚠️</div>
            <div class="muted" style="font-weight:1100;margin-bottom:14px">
              You selected a backdated expiry (<b>${escapeHtml(formatLongDMY(iso))}</b>).
              This product should be <b>discarded</b>.
            </div>
            <div class="row" style="gap:12px">
              <button id="bdCancel" class="btn btn-yellow" style="flex:1">Change date</button>
              <button id="bdOk" class="btn btn-red" style="flex:1">Confirm</button>
            </div>
          </div>
        `,
        { noBackdropClose: true }
      );

      $("#bdCancel")?.addEventListener("click", () => {
        // go back to picker modal
        closeModal();
        // reopen picker modal with same current selection
        openDateWheelModal({
          title: title || "Pick date",
          initialISO: iso,
          minISO: min,
          maxISO: max,
          onPick,
        });
      });

      $("#bdOk")?.addEventListener("click", () => {
        closeModal();
        closeModal(); // close picker behind (it is still open)
        onPick && onPick(iso);
      });

      return;
    }

    closeModal();
    onPick && onPick(iso);
  });
}

/* =========================================================
   Add 2nd date popup (single extra expiry)
   - now allows backdated (warn handled by picker)
   ========================================================= */
function openAddDateModal({ it, cat, key }) {
  const d = state.drafts[key] || (state.drafts[key] = {});
  d.extraISO = d.extraISO || "";
  d.extraQty = d.extraQty || 0;

  const rule = shelfLifeModeFor(it, cat);

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
          Backdated is allowed, but will show a discard warning when confirming.
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
    saveDraftsToStorage();
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
      saveDraftsToStorage();
      closeModal();
      render();
      toast("Added 2nd date ✅");
    });
    return;
  }

  $("#exPick")?.addEventListener("click", () => {
    openDateWheelModal({
      title: "Pick 2nd expiry date",
      initialISO: d.extraISO || todayISO(),
      minISO: todayISO(),
      maxISO: "2100-12-31",
      onPick: (iso) => {
        d.extraISO = iso;
        saveDraftsToStorage();
        const el = $("#exShow");
        if (el) el.textContent = formatLongDMY(iso);
      },
    });
  });

  $("#exCancel")?.addEventListener("click", closeModal);

  $("#exOk")?.addEventListener("click", () => {
    const q = Number(d.extraQty || 0);
    if (q > 0 && !d.extraISO) return toast("Pick date for qty > 0");
    saveDraftsToStorage();
    closeModal();
    render();
    toast("Added 2nd date ✅");
  });
}

/* =========================================================
   Item editor + bind editors
   - changed pickers to allow backdated (warning is inside picker)
   ========================================================= */
function renderItemEditor(it, cat) {
  const key = itemKey(it);
  if (!state.drafts[key]) {
    state.drafts[key] = {
      qty: 0,
      expType: "",
      expDateISO: "",
      expTimeShort: "",
      extraISO: "",
      extraQty: 0,
    };
  }
  const d = state.drafts[key];

  const rule = shelfLifeModeFor(it, cat);
  let expiryUI = "";

  if (rule.mode === "HOURLY") {
    const opts = HOURLY_SHORT.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${
          d.expTimeShort === o.value ? " selected" : ""
        }>${escapeHtml(o.label)}</option>`
    ).join("");

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
      <button class="btn btn-yellow" type="button" data-pickdate="${escapeHtml(
        key
      )}" style="width:100%">Pick date</button>
      <div class="edit-helper">${d.expDateISO ? escapeHtml(formatLongDMY(d.expDateISO)) : "Select date"}</div>
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
        <option value="MANUAL"${d.expType === "MANUAL" ? " selected" : ""}>Manual (pick date)</option>
      </select>
      <div data-pickwrap="${escapeHtml(key)}" class="${d.expType === "MANUAL" ? "" : "hidden"}" style="margin-top:8px">
        <button class="btn btn-yellow" type="button" data-pickdate="${escapeHtml(
          key
        )}" style="width:100%">Pick date</button>
        <div class="edit-helper">${d.expDateISO ? escapeHtml(formatLongDMY(d.expDateISO)) : ""}</div>
      </div>
      <div class="edit-helper">Preset dates (from shelf life)</div>
    `;
  }

  const addDateBtn =
    rule.mode === "HOURLY"
      ? ""
      : `<button class="btn btn-ghost" type="button" data-adddate="${escapeHtml(
          key
        )}" title="Add second expiry" style="padding:10px 12px">＋ Date</button>`;

  const extraBadge =
    Number(d.extraQty) > 0
      ? `<div class="muted" style="font-weight:1100;margin-top:6px">2nd date: ${Number(
          d.extraQty
        ) || 0}</div>`
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
          <input class="qty-inp" data-qty="${escapeHtml(key)}" inputmode="numeric" value="${escapeHtml(
            d.qty || 0
          )}" />
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

  const refreshProg = () => {
    try {
      if (typeof refreshCategoryProgressUI === "function") {
        refreshCategoryProgressUI(items, cat);
      }
    } catch {}
  };

  for (const it of items) {
    const key = itemKey(it);
    const d =
      state.drafts[key] ||
      (state.drafts[key] = {
        qty: 0,
        expType: "",
        expDateISO: "",
        expTimeShort: "",
        extraISO: "",
        extraQty: 0,
      });

    const inc = $(`[data-inc="${cssEsc(key)}"]`, root);
    const dec = $(`[data-dec="${cssEsc(key)}"]`, root);
    const qty = $(`[data-qty="${cssEsc(key)}"]`, root);

    const presetSel = $(`[data-exppreset="${cssEsc(key)}"]`, root);
    const timeSel = $(`[data-exptime="${cssEsc(key)}"]`, root);
    const pickBtn = $(`[data-pickdate="${cssEsc(key)}"]`, root);
    const addDate = $(`[data-adddate="${cssEsc(key)}"]`, root);

    updateQtyUI(root, key);
    refreshProg();

    if (inc)
      inc.addEventListener("click", () => {
        d.qty = (Number(d.qty) || 0) + 1;
        saveDraftsToStorage();
        updateQtyUI(root, key);
        pulseBtn(inc);
        haptic(12);
        refreshProg();
      });

    if (dec)
      dec.addEventListener("click", () => {
        d.qty = Math.max(0, (Number(d.qty) || 0) - 1);
        saveDraftsToStorage();
        updateQtyUI(root, key);
        pulseBtn(dec);
        haptic(10);
        refreshProg();
      });

    if (qty)
      qty.addEventListener("input", () => {
        const n = Number(qty.value || 0);
        d.qty = Number.isFinite(n) ? Math.max(0, n) : 0;
        saveDraftsToStorage();
        updateQtyUI(root, key);
        refreshProg();
      });

    if (timeSel)
      timeSel.addEventListener("change", () => {
        d.expTimeShort = String(timeSel.value || "");
        d.expType = "HOURLY";
        saveDraftsToStorage();
        refreshProg();
        render();
      });

    if (presetSel)
      presetSel.addEventListener("change", () => {
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
        saveDraftsToStorage();
        refreshProg();
        render();
      });

    if (pickBtn)
      pickBtn.addEventListener("click", () => {
        openDateWheelModal({
          title: "Pick expiry date",
          initialISO: d.expDateISO || todayISO(),
          minISO: todayISO(),
          maxISO: "2100-12-31",
          onPick: (iso) => {
            d.expDateISO = iso;
            if (!d.expType) d.expType = "MANUAL";
            saveDraftsToStorage();
            refreshProg();
            render();
          },
        });
      });

    if (addDate) addDate.addEventListener("click", () => openAddDateModal({ it, cat, key }));
  }
}

/* =========================================================
   Save category ✅ (UPDATED)
   - NO longer blocks past dates (warning is handled by picker confirm)
   ========================================================= */
async function saveCategory(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;
  const today = todayISO();

  const rows = [];

  for (const it of items) {
    const key = itemKey(it);
    const d =
      state.drafts[key] || {
        qty: 0,
        expType: "",
        expDateISO: "",
        expTimeShort: "",
        extraISO: "",
        extraQty: 0,
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
        // ✅ no blocking of backdated here
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
      const expiry = rule.mode === "EOD_AUTO" ? today : d.extraISO || "";
      if (!expiry) {
        toast("Set 2nd date");
        return;
      }
      // ✅ no blocking of backdated here

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

  showSaving("Saving…");
  try {
    await apiPost("/api/log/batch", { store, staff, shift, rows });

    const lastName = rows.length ? (rows[rows.length - 1].item_name || "") : "";
    recordShiftDoneAndLast({ store, shift, staff, lastItemName: lastName });

    toast("Saved ✅");
    await refreshStockDot().catch(() => {});
  } catch (e) {
    console.error(e);
    toast("Save failed");
  } finally {
    hideSaving();
  }
}

/* =========================
   END PART 2B / 4
   ========================= */
/* =========================
   PreCheck — public/app.js (FULL)
   PART 3A / 4

   Includes:
   - Stock Alert page
   - Summary Home + Summary List
   - Shift completion cards (API + local fallback)
   - WISR placeholder

   NOTE:
   - PART 3B continues from "Manager Home" onward
   ========================= */

/* =========================================================
   STOCK ALERT PAGE
   ========================================================= */
async function refreshStockDot() {
  const store = state.session.store;
  try {
    const r = await apiGet(`/api/stock/low?store=${encodeURIComponent(store)}`);
    const rows = enforceArray(r).filter(
      (x) => !STOCK_ALERT_EXCLUDE_CATS.has(String(x.category || ""))
    );
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
  // Replace the old loading line with this:
  wrap.innerHTML = `
    <div class="card skeleton skeleton-card"></div>
    <div class="card skeleton skeleton-card" style="opacity:0.6"></div>
    <div class="card skeleton skeleton-card" style="opacity:0.3"></div>
  `;
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
   SUMMARY HELPERS
   ========================================================= */
// ✅ Cross-device status: use /api/status (server truth)
async function getStatusByShift(store, shift) {
  const data = await apiGet(`/api/status?store=${encodeURIComponent(store)}`);
  const sh = String(shift || "AM").toUpperCase() === "PM" ? "PM" : "AM";
  const row = data?.[sh] || null;

  // Normalize to shape statusToUI() expects
  return row
    ? {
        last_saved_at: row.last_saved_at,
        last_saved_by: row.last_saved_by,
        total_rows: row.total_rows || 0,
        last_item_name: row.last_item_name || "",
      }
    : null;
}

function statusToUI(s) {
  if (!s || !s.last_saved_by)
    return { done: false, who: "", hhmm: "", count: 0, lastItemName: "" };
  const when = s.last_saved_at ? new Date(s.last_saved_at) : null;
  const hhmm = when ? formatTime12(`${pad2(when.getHours())}:${pad2(when.getMinutes())}`) : "";
  const who = String(s.last_saved_by || "");
  const count = Number(s.total_rows || 0);
  const lastItemName = String(s.last_item_name || "");
  return { done: true, who, hhmm, count, lastItemName };
}

/* local fallback (same device) */
function readLocalDoneLast(store, shift) {
  const local = readShiftDoneAndLast(store, shift); // from PART 1
  if (!local || !local.done) return { done: false, who: "", hhmm: "", lastItemName: "" };

  const when = local.at ? new Date(local.at) : null;
  const hhmm = when ? formatTime12(`${pad2(when.getHours())}:${pad2(when.getMinutes())}`) : "";
  return {
    done: true,
    who: String(local.staff || ""),
    hhmm,
    lastItemName: String(local.lastItemName || ""),
  };
}

function renderShiftCardUI(shift, info, fallback) {
  // if API not done, but local says done -> show done using fallback
  const done = info?.done || fallback?.done || false;
  const who = info?.who || fallback?.who || "";
  const hhmm = info?.hhmm || fallback?.hhmm || "";
  const count = info?.count || 0;
  const lastItemName = info?.lastItemName || fallback?.lastItemName || "";

  const badgeBg = done ? "var(--green)" : "var(--red)";
  const badgeText = done ? "DONE" : "NOT DONE";

  return `
    <div style="flex:1;min-width:240px;border:1px solid var(--line);border-radius:18px;padding:14px 14px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:1400;font-size:18px">${shift}</div>
        <div style="background:${badgeBg};color:#fff;border-radius:999px;padding:6px 10px;font-weight:1200;font-size:12px">
          ${badgeText}
        </div>
      </div>

      ${
        done
          ? `
        <div class="muted" style="margin-top:10px;font-weight:1100">
          Done by <b>${escapeHtml(who || "-")}</b>${hhmm ? ` at <b>${escapeHtml(hhmm)}</b>` : ""}
        </div>
        ${
          count
            ? `<div class="muted" style="margin-top:6px;font-weight:1100">Items saved: <b>${count}</b></div>`
            : `<div class="muted" style="margin-top:6px;font-weight:1100">Items saved: <b>—</b></div>`
        }
        ${
          lastItemName
            ? `<div class="muted" style="margin-top:6px;font-weight:1100">Last item saved: <b>${escapeHtml(
                lastItemName
              )}</b></div>`
            : ``
        }
      `
          : `
        <div class="muted" style="margin-top:10px;font-weight:1100">
          No save recorded yet.
        </div>
      `
      }
    </div>
  `;
}

/* =========================================================
   Manager progress snapshot (local drafts)
   ========================================================= */
function localProgressSnapshot() {
  const cats = (state.data.categories || []).map((c) => c.name);
  const catToItems = new Map();
  for (const c of cats) catToItems.set(c, []);
  for (const it of state.data.items || []) {
    if (!catToItems.has(it.category)) catToItems.set(it.category, []);
    catToItems.get(it.category).push(it);
  }

  let started = 0;
  let total = cats.length || 0;

  for (const c of cats) {
    const items = catToItems.get(c) || [];
    let any = false;
    for (const it of items) {
      const k = itemKey(it);
      const d = state.drafts[k];
      if (d && Number(d.qty) > 0) {
        any = true;
        break;
      }
    }
    if (any) started++;
  }

  return { started, total };
}

/* =========================================================
   SUMMARY HOME
   ========================================================= */
async function renderSummaryHome() {
  const main = $("#main");

  const isMgr = !!state.session.isManager;
  const storeView = isMgr ? state.view.summaryMode || "PDD" : state.session.store;
  state.view.summaryMode = storeView;

  main.innerHTML = `
    <div class="page-head">
      <button id="btnBack" class="btn btn-yellow" type="button">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    ${
      isMgr
        ? `
      <div class="card">
        <div style="font-weight:1200;margin-bottom:8px">Store view</div>
        <div class="row" style="gap:12px">
          <button id="mPDD" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">PDD</button>
          <button id="mSKH" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">SKH</button>
        </div>
      </div>
    `
        : ""
    }

    ${
      isMgr
        ? `
      <div class="card" style="margin-top:12px">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Progress snapshot</div>
        <div id="progSnap" class="muted" style="font-weight:1100">Loading…</div>
        <div class="muted" style="margin-top:8px;font-weight:1000">
          *This shows progress on THIS device. For true staff tracking across devices, we add API later.
        </div>
      </div>
    `
        : ""
    }

    <div class="card" style="margin-top:12px">
      <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Shift completion</div>
      <div id="shiftGrid" class="row" style="gap:12px;flex-wrap:wrap"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Expiry overview</div>
      <div id="sumWrap" class="col"></div>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);

  if (isMgr) {
    $("#mPDD").addEventListener("click", () => setSummaryMode("PDD"));
    $("#mSKH").addEventListener("click", () => setSummaryMode("SKH"));
    updateSummaryModeButtons();

    const ps = localProgressSnapshot();
    const el = $("#progSnap");
    if (el) el.innerHTML = `Categories started: <b>${ps.started}</b> / <b>${ps.total}</b>`;
  }

  // Shift completion
  const grid = $("#shiftGrid");
  if (grid) {
    grid.innerHTML = `<div class="muted" style="font-weight:1100">Loading…</div>`;

    let am = null,
      pm = null;

    try {
      am = await getStatusByShift(storeView, "AM");
    } catch {}
    try {
      pm = await getStatusByShift(storeView, "PM");
    } catch {}

    const amUI = statusToUI(am);
    const pmUI = statusToUI(pm);

    const amLocal = readLocalDoneLast(storeView, "AM");
    const pmLocal = readLocalDoneLast(storeView, "PM");

    grid.innerHTML = `
      ${renderShiftCardUI("AM", amUI, amLocal)}
      ${renderShiftCardUI("PM", pmUI, pmLocal)}
    `;
  }

  // Expiry overview cards
  await drawSummaryCards().catch(console.error);
}

function setSummaryMode(mode) {
  state.view.summaryMode = mode;
  updateSummaryModeButtons();
  renderSummaryHome().catch(console.error);
}

function updateSummaryModeButtons() {
  if (!state.session.isManager) return;
  const m = state.view.summaryMode;
  const a = $("#mPDD"),
    b = $("#mSKH");

  if (a) {
    a.style.background = "#fff";
    a.style.color = "#111";
    a.style.border = "1px solid var(--line)";
  }
  if (b) {
    b.style.background = "#fff";
    b.style.color = "#111";
    b.style.border = "1px solid var(--line)";
  }

  if (m === "PDD" && a) {
    a.style.background = "var(--pdd)";
    a.style.color = "#fff";
    a.style.border = "0";
  }
  if (m === "SKH" && b) {
    b.style.background = "var(--skh)";
    b.style.color = "#fff";
    b.style.border = "0";
  }
}

async function drawSummaryCards() {
  const wrap = $("#sumWrap");
  if (!wrap) return;
 // Replace the old loading line with this:
  wrap.innerHTML = `
    <div class="card skeleton skeleton-card"></div>
    <div class="card skeleton skeleton-card" style="opacity:0.6"></div>
    <div class="card skeleton skeleton-card" style="opacity:0.3"></div>
  `;
  const mode = state.session.isManager ? state.view.summaryMode || "PDD" : state.session.store;

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
  $("#sTomorrow").addEventListener("click", () =>
    setView({ page: "summaryList", bucket: "TOMORROW" }, true)
  );
  $("#sSafe").addEventListener("click", () => setView({ page: "summaryList", bucket: "SAFE" }, true));
}

async function renderSummaryList() {
  const main = $("#main");
  const mode = state.session.isManager ? state.view.summaryMode || "PDD" : state.session.store;
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
  
  // 1. Correct Loading State (Skeleton)
  wrap.innerHTML = `
    <div class="card skeleton skeleton-card"></div>
    <div class="card skeleton skeleton-card" style="opacity:0.6"></div>
    <div class="card skeleton skeleton-card" style="opacity:0.3"></div>
  `;

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

  // 2. Correct Empty State (The Fix is here!)
  // Previously, you had the skeleton code here by mistake.
  if (!rows.length) {
    wrap.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; opacity:0.6">
        <div style="font-size:48px; margin-bottom:10px">✨</div>
        <div style="font-weight:1200; font-size:18px">No items found</div>
        <div style="font-size:14px; margin-top:4px">Nothing in this list.</div>
      </div>
    `;
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
            .sort((a, b) => String(a.name || a.item_name).localeCompare(String(b.name || b.item_name)))
            .map((rr) => {
              const dt = formatLongDMY(datePartFromRow(rr));
              const tm = timePartFromRow(rr);
              const qty =
                rr.qty != null ? Number(rr.qty) : rr.quantity != null ? Number(rr.quantity) : null;
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

/* =========================
   END PART 3A / 4
   ========================= */
/* =========================
   PreCheck — public/app.js (FULL)
   PART 3B / 4

   Includes:
   - Manager Home
   - Manager Login
   - Manager Edit Items (with Saving overlay)
   - Manager Categories (with Saving overlay)
   - Manager Add Item modal (with Saving overlay)

   NOTE:
   - PART 4 will contain: Download Log + CSV, Logout, Utils (and we will REMOVE dark mode there)
   ========================= */

/* =========================================================
   MANAGER HOME
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
        <div class="sub">CSV export</div>
      </button>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);
  $("#tAdd").addEventListener("click", () => openAddItemModal());
  $("#tEdit").addEventListener("click", () => setView({ page: "managerEditItems" }, true));
  $("#tCats").addEventListener("click", () => setView({ page: "managerCategories" }, true));
  $("#tLog").addEventListener("click", () => openDownloadLogModal());
}

/* =========================================================
   MANAGER LOGIN
   ========================================================= */
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

    showSaving("Logging in…");
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
    } finally {
      hideSaving();
    }
  });
}

/* =========================================================
   MANAGER: EDIT ITEMS (with Saving overlay)
   ========================================================= */
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

  showSaving("Loading items…");
  try {
    items = await apiGet(`/api/manager/items?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Failed loading items");
  } finally {
    hideSaving();
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
            ${list
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map(managerItemRow)
              .join("")}
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

        showSaving("Saving…");
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
        } finally {
          hideSaving();
        }
      });

      del.addEventListener("click", async () => {
        if (!confirm("Delete this item?")) return;

        showSaving("Deleting…");
        try {
          await apiDel(
            `/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`,
            token
          );
          toast("Deleted ✅");
          items = items.filter((x) => String(x.id) !== String(id));
          renderList($("#mgrSearch").value);
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Delete failed");
        } finally {
          hideSaving();
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
    .map(
      (c) =>
        `<option value="${escapeHtml(c)}"${c === it.category ? " selected" : ""}>${escapeHtml(
          c
        )}</option>`
    )
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
      <div class="muted" style="margin-top:8px;font-weight:1000">
        ${escapeHtml(it.category)} • ${escapeHtml(it.shelf_life_days)} day
      </div>

      <div class="hidden" data-panel="${escapeHtml(id)}" style="margin-top:12px">
        <div class="col">
          <div style="font-weight:1200">Category</div>
          <select class="select" data-cat="${escapeHtml(id)}">${catOpts}</select>

          <div style="font-weight:1200">Sauce Sub-category</div>
          <select class="select" data-sub="${escapeHtml(id)}">${subOpts}</select>

          <div style="font-weight:1200">Shelf life (days)</div>
          <input class="input" type="number" min="0" data-life="${escapeHtml(id)}" value="${escapeHtml(
    it.shelf_life_days
  )}">

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

/* =========================================================
   MANAGER: CATEGORIES (with Saving overlay)
   ========================================================= */
async function renderManagerCategories() {
  if (!state.session.isManager) return openManagerLogin();

  const main = $("#main");
  let cats = [];

  showSaving("Loading categories…");
  try {
    cats = await apiGet(
      `/api/manager/categories?store=${encodeURIComponent(state.session.store)}`,
      state.session.managerToken
    );
  } catch (e) {
    console.error(e);
    toast("Failed loading categories");
  } finally {
    hideSaving();
  }

  const tiles = cats
    .filter((c) => c.is_active !== false)
    .map((c, idx) => {
      const tone = tileToneFor(c.name);
      return `
        <button class="tile ${tone}" style="min-height:100px;animation-delay:${idx * 45}ms"
          data-cid="${c.id}" data-cname="${escapeHtml(c.name)}" type="button">
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

    showSaving("Saving…");
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
    } finally {
      hideSaving();
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

    showSaving("Saving…");
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
    } finally {
      hideSaving();
    }
  });

  $("#catDelete").addEventListener("click", async () => {
    if (!confirm("Delete this category?")) return;

    showSaving("Deleting…");
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
    } finally {
      hideSaving();
    }
  });
}

/* =========================================================
   MANAGER: ADD ITEM MODAL (with Saving overlay)
   ========================================================= */
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

    showSaving("Saving…");
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
    } finally {
      hideSaving();
    }
  });
}

/* =========================
   END PART 3B / 4
   ========================= */
/* =========================
   PreCheck — public/app.js (FULL)
   PART 4A / 4  (SPLIT 1 of 2)

   Includes (NEW / CHANGES):
   ✅ REMOVE Dark Mode (force light, hide drawer switch, override theme functions)
   ✅ New iOS-style wheel date picker:
      - fits PreCheck colors
      - year up to 2100
      - Day + Month loop (no empty look)
      - Allows backdated selection
      - If backdated (before threshold), shows warning popup: "Discard product?"
   ✅ Overrides:
      - openDateWheelModal()
      - openAddDateModal()  (no hard block past; warn instead)
      - saveCategory()      (no hard block past; warn instead)

   NOTE:
   - PART 4B / 4 will contain: Download Log + CSV, Logout, Utils
   ========================= */

/* =========================================================
   ✅ REMOVE DARK MODE (force light + hide UI)
   - overrides previous theme functions from PART 1
   ========================================================= */
function applyTheme() {
  // force light always
  try {
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
  } catch {}
}
function getTheme() {
  return "light";
}
function setTheme() {
  applyTheme("light");
}
function toggleTheme() {
  // disabled
  applyTheme("light");
  toast("Light mode ✅");
}
function updateThemeToggleUI() {
  // hide the drawer theme row if exists
  const host = document.getElementById("drawerTheme");
  if (host) host.style.display = "none";
}
(function forceLightThemeNow() {
  try {
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
    const host = document.getElementById("drawerTheme");
    if (host) host.style.display = "none";
  } catch {}
})();

/* =========================================================
   Backdated warning helper
   ========================================================= */
function openBackdatedWarning({ pickedISO, thresholdISO, onProceed }) {
  const picked = String(pickedISO || "").slice(0, 10);
  const threshold = String(thresholdISO || "").slice(0, 10);

  // if no threshold, just proceed
  if (!threshold || picked >= threshold) return onProceed?.();

  openModal(
    "Backdated date detected",
    `
      <div class="card">
        <div style="font-weight:1200;font-size:18px;margin-bottom:8px">This date is in the past.</div>
        <div class="muted" style="font-weight:1100;line-height:1.35">
          Picked: <b>${escapeHtml(formatLongDMY(picked))}</b><br/>
          Today: <b>${escapeHtml(formatLongDMY(todayISO()))}</b>
        </div>

        <div style="margin-top:12px;border:1px solid var(--line);border-radius:14px;padding:10px 12px">
          <div style="font-weight:1200;margin-bottom:6px">Action</div>
          <div class="muted" style="font-weight:1100;line-height:1.35">
            If the product is already expired, discard the product before saving.
          </div>
        </div>

        <div class="row" style="gap:12px;margin-top:14px">
          <button id="bdCancel" class="btn btn-yellow" style="flex:1">Cancel</button>
          <button id="bdProceed" class="btn btn-red" style="flex:1">Proceed</button>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  $("#bdCancel")?.addEventListener("click", closeModal);
  $("#bdProceed")?.addEventListener("click", () => {
    closeModal();
    onProceed?.();
  });
}

/* =========================================================
   ✅ iOS-style wheel date picker (looping Day + Month)
   - year: 1900..2100 (default) OR from min/max if provided
   - allows selecting outside threshold (minISO) but warns on OK
   - hard max enforced (maxISO) if provided
   ========================================================= */
function openDateWheelModal({ title, initialISO, minISO, maxISO, onPick }) {
  const today = todayISO();

  // threshold for backdated warning (NOT a hard limit)
  const threshold = String(minISO || today).slice(0, 10);

  // hard bounds for picker
  const hardMin = "1900-01-01";
  const hardMax = String(maxISO || "2100-12-31").slice(0, 10);

  const init = String(initialISO || today).slice(0, 10);

  function clampISO(iso) {
    let x = String(iso || "").slice(0, 10);
    if (!x) x = today;
    if (x < hardMin) x = hardMin;
    if (x > hardMax) x = hardMax;
    return x;
  }

  function toYMD(iso) {
    const [yy, mm, dd] = String(iso).slice(0, 10).split("-").map((n) => Number(n));
    return { y: yy || 2000, m: mm || 1, d: dd || 1 };
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate(); // m=1..12
  }

  function monthName(mm) {
    return new Date(2000, mm - 1, 1).toLocaleString("en", { month: "long" });
  }

  function toISO(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // Build looping arrays: 5 copies to feel "infinite"
  const LOOP_COPIES = 5;
  const MID_COPY = Math.floor(LOOP_COPIES / 2);

  const monthsLoop = [];
  for (let c = 0; c < LOOP_COPIES; c++) {
    for (let mm = 1; mm <= 12; mm++) monthsLoop.push(mm);
  }

  // Year range (dynamic but capped to 1900..2100)
  const hardMinY = 1900;
  const hardMaxY = 2100;
  let yearMin = hardMinY;
  let yearMax = hardMaxY;

  try {
    const minY = Number(String(hardMin).slice(0, 4));
    const maxY = Number(String(hardMax).slice(0, 4));
    if (Number.isFinite(minY)) yearMin = Math.max(hardMinY, minY);
    if (Number.isFinite(maxY)) yearMax = Math.min(hardMaxY, maxY);
  } catch {}

  const years = [];
  for (let yy = yearMin; yy <= yearMax; yy++) years.push(yy);

  // current selection
  let curISO = clampISO(init);
  let { y, m, d } = toYMD(curISO);
  d = Math.max(1, Math.min(d, daysInMonth(y, m)));

  // helper to rebuild day loop based on y/m
  function buildDaysLoop(y_, m_) {
    const dim = daysInMonth(y_, m_);
    const out = [];
    for (let c = 0; c < LOOP_COPIES; c++) {
      for (let dd = 1; dd <= dim; dd++) out.push(dd);
    }
    return out;
  }

  let daysLoop = buildDaysLoop(y, m);

  // modal HTML + inline style (so you don’t need to edit css again)
  openModal(
    title || "Select date",
    `
      <div class="pc-ioswheel">
        <style>
          .pc-ioswheel{padding:6px 2px}
          .pc-ioswheel .wheelwrap{
            position:relative;
            display:flex;
            gap:10px;
            background:#fff;
            border:1px solid var(--line);
            border-radius:18px;
            padding:10px;
            overflow:hidden;
          }
          .pc-ioswheel .col{flex:1;min-width:0}
          .pc-ioswheel .label{
            font-weight:1200;
            font-size:12px;
            color:#111;
            margin:0 0 8px 2px;
            opacity:.75;
          }
          .pc-ioswheel .list{
            height:220px;
            overflow:auto;
            -webkit-overflow-scrolling:touch;
            scroll-snap-type:y mandatory;
            border-radius:14px;
            background:linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,.65) 25%, rgba(255,255,255,.65) 75%, rgba(255,255,255,1));
          }
          .pc-ioswheel .item{
            height:44px;
            display:flex;
            align-items:center;
            justify-content:center;
            scroll-snap-align:center;
            font-weight:1200;
            font-size:16px;
            color:#111;
            opacity:.55;
            user-select:none;
          }
          .pc-ioswheel .item.active{opacity:1; color:#111}
          .pc-ioswheel .hl{
            position:absolute;
            left:10px; right:10px;
            top:10px;
            height:44px;
            transform:translateY(calc(220px/2 - 22px));
            border-radius:14px;
            border:2px solid rgba(0,0,0,.06);
            box-shadow:0 6px 18px rgba(0,0,0,.08) inset;
            pointer-events:none;
          }
          .pc-ioswheel .fadeTop, .pc-ioswheel .fadeBot{
            position:absolute; left:0; right:0; height:44px; pointer-events:none;
          }
          .pc-ioswheel .fadeTop{top:0;background:linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,0))}
          .pc-ioswheel .fadeBot{bottom:0;background:linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0))}
          .pc-ioswheel .actions{display:flex; gap:12px; margin-top:12px}
          .pc-ioswheel .btnx{
            flex:1; padding:12px 12px; border-radius:14px; font-weight:1200; border:1px solid var(--line);
            background:#fff;
          }
          .pc-ioswheel .btnok{background:var(--green); color:#fff; border:0}
          .pc-ioswheel .hint{
            margin-top:10px;
            font-weight:1100;
            font-size:12px;
            color:#111;
            opacity:.7;
          }
        </style>

        <div class="wheelwrap">
          <div class="col">
            <div class="label">Day</div>
            <div class="list" id="wDay"></div>
          </div>
          <div class="col">
            <div class="label">Month</div>
            <div class="list" id="wMon"></div>
          </div>
          <div class="col">
            <div class="label">Year</div>
            <div class="list" id="wYear"></div>
          </div>

          <div class="hl" aria-hidden="true"></div>
          <div class="fadeTop" aria-hidden="true"></div>
          <div class="fadeBot" aria-hidden="true"></div>
        </div>

        <div class="actions">
          <button class="btnx" type="button" id="wCancel">Cancel</button>
          <button class="btnx btnok" type="button" id="wOk">Set date</button>
        </div>

        <div class="hint">
          Tip: Past dates are allowed. If you pick a past date, you will see a discard warning.
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  const dayEl = $("#wDay");
  const monEl = $("#wMon");
  const yearEl = $("#wYear");

  function renderList(el, arr, formatter) {
    el.innerHTML = arr
      .map((v) => `<div class="item" data-v="${escapeHtml(String(v))}">${formatter(v)}</div>`)
      .join("");
  }

  function setActiveByValue(el, value) {
    const items = $$(".item", el);
    items.forEach((x) => x.classList.remove("active"));
    const hit = items.find((x) => String(x.dataset.v) === String(value));
    if (hit) hit.classList.add("active");
  }

  function centerToValue(el, arr, value, loop = false) {
    const items = $$(".item", el);
    if (!items.length) return;

    // find target index: for loop lists, go to middle copy
    let idx = arr.findIndex((v) => String(v) === String(value));
    if (idx < 0) idx = 0;

    if (loop) {
      const baseLen = loop === "month" ? 12 : daysInMonth(y, m);
      const target = MID_COPY * baseLen + ((Number(value) - 1) % baseLen);
      idx = Math.max(0, Math.min(items.length - 1, target));
    }

    const item = items[idx];
    const top = item.offsetTop - el.clientHeight / 2 + item.clientHeight / 2;
    el.scrollTo({ top, behavior: "auto" });
    setActiveByValue(el, value);
  }

  function readCenteredValue(el) {
    const items = $$(".item", el);
    if (!items.length) return null;
    const center = el.scrollTop + el.clientHeight / 2;

    let best = null;
    let bestDist = Infinity;
    for (const it of items) {
      const itCenter = it.offsetTop + it.clientHeight / 2;
      const dist = Math.abs(itCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = it;
      }
    }
    return best ? best.dataset.v : null;
  }

  function normalizeLoopScroll(el, baseLen) {
    // keep scroll around middle copy so it never "ends"
    const items = $$(".item", el);
    if (!items.length) return;
    const centered = readCenteredValue(el);
    if (!centered) return;

    const v = Number(centered);
    const targetIndex = MID_COPY * baseLen + (v - 1);
    const targetItem = items[targetIndex];
    if (!targetItem) return;

    const targetTop = targetItem.offsetTop - el.clientHeight / 2 + targetItem.clientHeight / 2;
    // if user drags too far near edges, jump silently
    const tooHigh = el.scrollTop < el.clientHeight * 0.5;
    const tooLow = el.scrollTop > el.scrollHeight - el.clientHeight * 1.5;
    if (tooHigh || tooLow) el.scrollTo({ top: targetTop, behavior: "auto" });
  }

  function rebuildDaysIfNeeded() {
    const dim = daysInMonth(y, m);
    if (d > dim) d = dim;
    daysLoop = buildDaysLoop(y, m);
    renderList(dayEl, daysLoop, (dd) => String(dd));
    setActiveByValue(dayEl, d);
    centerToValue(dayEl, daysLoop, d, "day");
  }

  function updateCurISO() {
    curISO = clampISO(toISO(y, m, d));
  }

  // initial render
  renderList(monEl, monthsLoop, (mm) => monthName(mm));
  renderList(yearEl, years, (yy) => String(yy));
  rebuildDaysIfNeeded();

  // center to current values
  centerToValue(monEl, monthsLoop, m, "month");
  centerToValue(yearEl, years, y, false);

  // events
  let tDay = null,
    tMon = null,
    tYear = null;

  function onScrollDay() {
    clearTimeout(tDay);
    tDay = setTimeout(() => {
      normalizeLoopScroll(dayEl, daysInMonth(y, m));
      const v = readCenteredValue(dayEl);
      if (v) {
        d = Number(v);
        updateCurISO();
        setActiveByValue(dayEl, d);
      }
    }, 90);
  }

  function onScrollMon() {
    clearTimeout(tMon);
    tMon = setTimeout(() => {
      normalizeLoopScroll(monEl, 12);
      const v = readCenteredValue(monEl);
      if (v) {
        m = Number(v);
        rebuildDaysIfNeeded();
        updateCurISO();
        setActiveByValue(monEl, m);
      }
    }, 90);
  }

  function onScrollYear() {
    clearTimeout(tYear);
    tYear = setTimeout(() => {
      const v = readCenteredValue(yearEl);
      if (v) {
        y = Number(v);
        rebuildDaysIfNeeded();
        updateCurISO();
        setActiveByValue(yearEl, y);
      }
    }, 90);
  }

  dayEl.addEventListener("scroll", onScrollDay, { passive: true });
  monEl.addEventListener("scroll", onScrollMon, { passive: true });
  yearEl.addEventListener("scroll", onScrollYear, { passive: true });

  // tap select
  function bindTap(el, setter) {
    el.addEventListener("click", (e) => {
      const it = e.target.closest(".item");
      if (!it) return;
      setter(it.dataset.v);
    });
  }

  bindTap(dayEl, (v) => {
    d = Number(v);
    updateCurISO();
    centerToValue(dayEl, daysLoop, d, "day");
    haptic(8);
  });

  bindTap(monEl, (v) => {
    m = Number(v);
    rebuildDaysIfNeeded();
    updateCurISO();
    centerToValue(monEl, monthsLoop, m, "month");
    haptic(8);
  });

  bindTap(yearEl, (v) => {
    y = Number(v);
    rebuildDaysIfNeeded();
    updateCurISO();
    centerToValue(yearEl, years, y, false);
    haptic(8);
  });

  // cancel / ok
  $("#wCancel")?.addEventListener("click", closeModal);

  $("#wOk")?.addEventListener("click", () => {
    const picked = clampISO(toISO(y, m, d));

    // enforce hard max (and hard min)
    if (picked < hardMin || picked > hardMax) {
      toast("Date out of range");
      return;
    }

    closeModal();

    // if picked is before threshold, warn first
    openBackdatedWarning({
      pickedISO: picked,
      thresholdISO: threshold,
      onProceed: () => onPick && onPick(picked),
    });
  });
}

/* =========================================================
   ✅ Override Add 2nd date popup:
   - allow backdated with warning (no hard block)
   ========================================================= */
function openAddDateModal({ it, cat, key }) {
  const d = state.drafts[key] || (state.drafts[key] = {});
  d.extraISO = d.extraISO || "";
  d.extraQty = d.extraQty || 0;

  const rule = shelfLifeModeFor(it, cat);
  const today = todayISO();
  const warnThreshold = today; // warn if past

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
          Past dates are allowed (warning will appear).
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
    saveDraftsToStorage();
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
      saveDraftsToStorage();
      closeModal();
      render();
      toast("Added 2nd date ✅");
    });
    return;
  }

  $("#exPick")?.addEventListener("click", () => {
    openDateWheelModal({
      title: "Pick 2nd expiry date",
      initialISO: d.extraISO || todayISO(),
      minISO: warnThreshold, // warning threshold only
      maxISO: "2100-12-31",
      onPick: (iso) => {
        d.extraISO = iso;
        saveDraftsToStorage();
        const el = $("#exShow");
        if (el) el.textContent = formatLongDMY(iso);
      },
    });
  });

  $("#exCancel")?.addEventListener("click", closeModal);

  $("#exOk")?.addEventListener("click", () => {
    const q = Number(d.extraQty || 0);
    if (q > 0 && !d.extraISO) return toast("Pick date for qty > 0");
    saveDraftsToStorage();
    closeModal();
    render();
    toast("Added 2nd date ✅");
  });
}

/* =========================================================
   ✅ Override Save category:
   - allow backdated expiry BUT show warning before saving
   ========================================================= */
async function saveCategory(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;
  const today = todayISO();

  const rows = [];

  // collect rows first (no blocking for past, just collect)
  for (const it of items) {
    const key = itemKey(it);
    const d =
      state.drafts[key] || {
        qty: 0,
        expType: "",
        expDateISO: "",
        expTimeShort: "",
        extraISO: "",
        extraQty: 0,
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
      const expiry = rule.mode === "EOD_AUTO" ? today : d.extraISO || "";
      if (!expiry) {
        toast("Set 2nd date");
        return;
      }

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

  // if any expiry is backdated, warn once before saving
  const anyBackdated = rows.some((r) => {
    const e = String(r.expiry || "").slice(0, 10);
    return e && e < today;
  });

  const doActualSave = async () => {
    showSaving("Saving…");
    try {
      await apiPost("/api/log/batch", { store, staff, shift, rows });

      const lastName = rows.length ? rows[rows.length - 1].item_name || "" : "";
      recordShiftDoneAndLast({ store, shift, staff, lastItemName: lastName });

      toast("Saved ✅");
      await refreshStockDot().catch(() => {});
    } catch (e) {
      console.error(e);
      toast("Save failed");
    } finally {
      hideSaving();
    }
  };

  if (anyBackdated) {
    openBackdatedWarning({
      pickedISO: today, // not used for display in this case
      thresholdISO: today, // force warning modal
      onProceed: doActualSave,
    });
    return;
  }

  await doActualSave();
}

/* =========================
   END PART 4A / 4
   ========================= */
/* =========================
   PreCheck — public/app.js (FULL)
   PART 4B / 4  (SPLIT 2 of 2)

   Includes:
   - Download Log modal + CSV export (manager)
   - Logout
   - Utils (must be last)

   Notes:
   - This part stays mostly same as your PART 4, but keeps working with the new wheel + light-only setup.
   ========================= */

/* =========================================================
   OPTIONAL: helper to wrap any async action with overlay
   ========================================================= */
async function withSaving(msg, fn) {
  showSaving(msg || "Saving…");
  try {
    return await fn();
  } finally {
    hideSaving();
  }
}

/* =========================================================
   DOWNLOAD LOG (Manager) + CSV
   ========================================================= */
function openDownloadLogModal() {
  openModal(
    "Download Log",
    `
      <div class="card">
        <div style="font-weight:1200;font-size:18px;margin-bottom:10px">Export (CSV)</div>

        <div class="muted" style="font-weight:1100;margin-bottom:12px">
          Choose date range. Export includes AM + PM.
        </div>

        <div class="col" style="gap:10px">
          <div style="font-weight:1200">From</div>
          <button id="dlFromBtn" class="btn btn-yellow" style="width:100%">Pick date</button>
          <div id="dlFromShow" class="muted" style="font-weight:1100">Not set</div>

          <div style="font-weight:1200;margin-top:8px">To</div>
          <button id="dlToBtn" class="btn btn-yellow" style="width:100%">Pick date</button>
          <div id="dlToShow" class="muted" style="font-weight:1100">Not set</div>

          <div class="row" style="gap:12px;margin-top:14px">
            <button id="dlCancel" class="btn btn-yellow" style="flex:1">Cancel</button>
            <button id="dlGo" class="btn" style="flex:1;background:var(--green);color:#fff;border:0">Download</button>
          </div>
        </div>
      </div>
    `,
    { noBackdropClose: true }
  );

  const memKey = "__dl_range__";
  if (!state[memKey]) {
    const t = todayISO();
    state[memKey] = { from: addDaysISO(t, -7), to: t };
  }

  const redraw = () => {
    $("#dlFromShow").textContent = state[memKey].from ? formatLongDMY(state[memKey].from) : "Not set";
    $("#dlToShow").textContent = state[memKey].to ? formatLongDMY(state[memKey].to) : "Not set";
  };
  redraw();

  $("#dlFromBtn").addEventListener("click", () => {
    openDateWheelModal({
      title: "From date",
      initialISO: state[memKey].from || todayISO(),
      minISO: todayISO(), // warning threshold only
      maxISO: "2100-12-31",
      onPick: (iso) => {
        state[memKey].from = iso;
        redraw();
      },
    });
  });

  $("#dlToBtn").addEventListener("click", () => {
    openDateWheelModal({
      title: "To date",
      initialISO: state[memKey].to || todayISO(),
      minISO: todayISO(), // warning threshold only
      maxISO: "2100-12-31",
      onPick: (iso) => {
        state[memKey].to = iso;
        redraw();
      },
    });
  });

  $("#dlCancel").addEventListener("click", closeModal);

  $("#dlGo").addEventListener("click", async () => {
    const from = state[memKey].from;
    const to = state[memKey].to;
    if (!from || !to) return toast("Pick From + To");
    if (from > to) return toast("From cannot be after To");

    try {
      showSaving("Preparing download…");
      await downloadManagerLogCSV({ from, to });
      closeModal();
    } catch (e) {
      console.error(e);
      toast("Download failed");
    } finally {
      hideSaving();
    }
  });
}

async function downloadManagerLogCSV({ from, to }) {
  const store = state.session.store; // downloads current store log
  const token = state.session.managerToken || "";
  if (!token) return toast("Manager login required");

  const url = `/api/manager/log/export.csv?store=${encodeURIComponent(store)}&from=${encodeURIComponent(
    from
  )}&to=${encodeURIComponent(to)}`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());

  const blob = await r.blob();
  const filename = `PreCheck_${store}_log_${from}_to_${to}.csv`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);

  toast("Download started ✅");
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
   UTILS (must be last)
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

/* =========================================================
   QTY UX helpers
   ========================================================= */
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

/* =========================
   END PART 4B / 4
   ========================= */
/* =========================
   SPLASH SCREEN HELPER
   ========================= */
function hideSplashScreen() {
  const el = document.getElementById("splash");
  if (el) {
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 600);
  }
}
