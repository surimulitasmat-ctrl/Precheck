/* =========================
   PreCheck — app.js (FULL)
   STEP 5+ UI + Manager (Compact)
   - Home: Summary cards + category tiles (icon images)
   - Category page: inline qty + expiry + Yellow Save (keeps logic)
   - Expiry logic: AUTO / MANUAL / EOD / HOURLY + Chicken Bacon (C) + shelf-life rules
   - Drawer menu (uses your index.html IDs: btnMenu, drawerBackdrop, btnDrawerClose, drawerHome/Alerts/Manager/Logout)
   - Role badge top-right (uses your #rolePill button)
   - Manager: Dashboard tiles
     * Add Item
     * Edit Items (category tiles first, then compact rows, expand only on Edit)
     * Categories (tiles without icon; tap tile to edit category)
   - Store-separated: all manager operations + /api/items + /api/expiry are by store
   ========================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}
// ===== Expiry Date Formatting (STEP 1) =====
function formatDate(d) {
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function todayStr() {
  return formatDate(new Date());
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}
function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDaysISODate(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function isoDateOnlyFromAny(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.includes("T")) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function toISOAtLocalEndOfDay(isoDate) {
  const d = new Date(`${isoDate}T23:59:00`);
  return d.toISOString();
}
function toISOAtLocalTime(isoDate, hhmm) {
  const [hh, mm] = String(hhmm).split(":").map((x) => Number(x));
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------- Constants (UI categories stay same) ---------- */
/**
 * IMPORTANT:
 * - UI shows "Fountain Drinks"
 * - DB legacy category "Back counter" maps to "Fountain Drinks" (display)
 */
const UI_CATEGORIES = [
  "Prepared items",
  "Unopened chiller",
  "Thawing",
  "Vegetables",
  "Backroom",
  "Front counter",
  "Back counter chiller",
  "Fountain Drinks",
  "Sauce",
];

const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

// fixed time dropdown items (only if you still want it)
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);

// Always manual date-only items (besides Unopened chiller)
const MANUAL_ALWAYS = new Set([]);

/* ---------- Category Tiles: colors + icon images ---------- */
const CAT_UI = {
  "Prepared items": { tone: "green", icon: "/assets/cat-icons/prepared.png" },
  "Unopened chiller": { tone: "blue", icon: "/assets/cat-icons/unopened.png" },
  Thawing: { tone: "cyan", icon: "/assets/cat-icons/thawing.png" },
  Vegetables: { tone: "green2", icon: "/assets/cat-icons/vegetables.png" },
  Backroom: { tone: "orange", icon: "/assets/cat-icons/backroom.png" },
  "Front counter": { tone: "red", icon: "/assets/cat-icons/frontcounter.png" },
  "Back counter chiller": { tone: "teal", icon: "/assets/cat-icons/backcounterchiller.png" },
  "Fountain Drinks": { tone: "green3", icon: "/assets/cat-icons/fountain.png" },
  Sauce: { tone: "purple", icon: "/assets/cat-icons/sauce.png" },
};

/* ---------- DOM ---------- */
const main = $("#main");
const topbar = $("#topbar");
const sessionLine = $("#sessionLine");
const rolePillBtn = $("#rolePill");

// Drawer from your index.html
const btnMenu = $("#btnMenu");
const drawerBackdrop = $("#drawerBackdrop");
const btnDrawerClose = $("#btnDrawerClose");
const drawerHome = $("#drawerHome");
const drawerAlerts = $("#drawerAlerts");
const drawerManager = $("#drawerManager");
const drawerLogout = $("#drawerLogout");

// modal elements
const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  items: [],
  view: { page: "session", category: null, sauceSub: null, filter: "all" },
  manager: { token: "" },
  navStack: [],
  latestExpiryRows: [],
  categoryDraft: {}, // category page drafts
  managerUI: {
    tab: "dashboard", // dashboard | itemCats | items | addItem | categories | editCategory | addCategory
    cat: null,
    sub: null,
    expandedItemId: null, // compact list expand
    categories: [], // manager categories cache
    editCat: null, // current category being edited
  },
};

/* ---------- Storage ---------- */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session = {
        store: s.store || "",
        shift: s.shift || "",
        staff: s.staff || "",
      };
    }
  } catch {}
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}
function getManagerToken() {
  return localStorage.getItem("managerToken") || "";
}
function setManagerToken(t) {
  if (t) localStorage.setItem("managerToken", t);
  else localStorage.removeItem("managerToken");
  state.manager.token = t || "";
}
function isManagerMode() {
  return !!getManagerToken();
}

/* ---------- Toast ---------- */
function ensureToast() {
  if ($("#toast")) return;
  const t = document.createElement("div");
  t.id = "toast";
  t.className = "toast hidden";
  document.body.appendChild(t);
}
function toast(msg) {
  ensureToast();
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1800);
}

/* ---------- Modal ---------- */
function hasModal() {
  return !!(modalBackdrop && modalTitleEl && modalBodyEl);
}
function openModal(title, bodyHtml) {
  if (!hasModal()) {
    alert(title || "Notice");
    return;
  }
  modalTitleEl.textContent = title || " ";
  modalBodyEl.innerHTML = bodyHtml || "";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
}
function closeModal() {
  if (!hasModal()) return;
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  modalBodyEl.innerHTML = "";
}
function bindModal() {
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }
}

/* ---------- API ---------- */
async function apiJSON(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
async function apiGet(url) {
  const res = await fetch(url);
  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}
async function apiManager(method, url, body) {
  const token = getManagerToken();
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setManagerToken("");
    updateRolePill();
    toast("Manager session expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Category mapping ---------- */
function uiCategoryFromDb(cat) {
  const raw = String(cat || "").trim();
  if (norm(raw) === norm("Back counter")) return "Fountain Drinks";
  return raw;
}
function dbCategoryFromUi(uiCat) {
  const raw = String(uiCat || "").trim();
  if (norm(raw) === norm("Fountain Drinks")) return "Back counter";
  return raw;
}
function canonicalCategory(cat) {
  const ui = uiCategoryFromDb(cat);
  const n = norm(ui);
  const hit = UI_CATEGORIES.find((x) => norm(x) === n);
  return hit || ui || "Unknown";
}

/* ---------- Shelf life ---------- */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? item.shelfLifeDays ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/* ---------- Expiry mode ---------- */
function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  if (nameN === norm("Chicken Bacon (C)")) return "EOD";
  if (cat === "Unopened chiller") return "MANUAL_DATE";
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";
  return "AUTO";
}

/* ---------- Drawer (use existing HTML) ---------- */
function drawerOpen() {
  if (!drawerBackdrop) return;
  drawerBackdrop.classList.remove("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "false");
}
function drawerClose() {
  if (!drawerBackdrop) return;
  drawerBackdrop.classList.add("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "true");
}
function bindDrawer() {
  if (!drawerBackdrop) return;

  // click outside drawer closes
  drawerBackdrop.addEventListener("click", (e) => {
    if (e.target === drawerBackdrop) drawerClose();
  });

  if (btnDrawerClose) {
    btnDrawerClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      drawerClose();
    });
  }

  if (btnMenu) {
    btnMenu.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      drawerOpen();
    });
  }

  if (drawerHome) {
    drawerHome.addEventListener("click", () => {
      drawerClose();
      state.navStack = [];
      state.view = { page: "home", category: null, sauceSub: null, filter: "all" };
      render();
    });
  }
  if (drawerAlerts) {
    drawerAlerts.addEventListener("click", () => {
      drawerClose();
      setView({ page: "alerts", category: null, sauceSub: null, filter: "all" }, true);
    });
  }
  if (drawerManager) {
    drawerManager.addEventListener("click", () => {
      drawerClose();
      if (isManagerMode()) setView({ page: "manager" }, true);
      else openManagerLogin();
    });
  }
  if (drawerLogout) {
    drawerLogout.addEventListener("click", () => {
      drawerClose();
      doLogout();
    });
  }
}

/* ---------- Top-right role pill (use your #rolePill button) ---------- */
function updateRolePill() {
  if (!rolePillBtn) return;

  const isMgr = isManagerMode();
  const label = isMgr ? "Manager" : "Staff";
  const icon = isMgr ? "👑" : "🧢";

  rolePillBtn.classList.remove("hidden");
  rolePillBtn.innerHTML = `
    <span class="role-text">${escapeHtml(label)}</span>
    <span class="role-ico" aria-hidden="true">${icon}</span>
  `;
  rolePillBtn.className = `role-pill ${isMgr ? "role-pill--mgr" : "role-pill--staff"}`;

  rolePillBtn.onclick = () => {
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  };
}

/* ---------- Session line ---------- */
function updateSessionLine() {
  if (!sessionLine) return;
  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";
  const line = [store, shift, staff].filter(Boolean).join(" • ");
  sessionLine.classList.toggle("hidden", !line);
  sessionLine.textContent = line || "";
}

/* ---------- Navigation ---------- */
function setView(next, push = true) {
  const prev = { ...state.view };
  state.view = { ...state.view, ...next };
  if (push) state.navStack.push(prev);

  try {
    history.pushState({ t: Date.now() }, "");
  } catch {}

  render();
}
function goBack() {
  const prev = state.navStack.pop();
  if (prev) {
    state.view = prev;
    render();
    return;
  }
  if (confirm("Exit PreCheck?")) {
  } else {
    try {
      history.pushState({ t: Date.now() }, "");
    } catch {}
  }
}

/* ---------- Swipe back ---------- */
function bindSwipeBack() {
  let sx = 0,
    sy = 0,
    st = 0;

  window.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || !e.touches[0]) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    },
    { passive: true }
  );

  window.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;

      if (dx > 70 && Math.abs(dy) < 45 && dt < 600) {
        const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
        const drawerOpenNow = drawerBackdrop && !drawerBackdrop.classList.contains("hidden");
        if (modalOpen || drawerOpenNow) return;
        goBack();
      }
    },
    { passive: true }
  );

  window.addEventListener("popstate", () => {
    const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
    if (modalOpen) {
      closeModal();
      return;
    }
    const drawerOpenNow = drawerBackdrop && !drawerBackdrop.classList.contains("hidden");
    if (drawerOpenNow) {
      drawerClose();
      return;
    }
    goBack();
  });

  try {
    history.replaceState({ t: Date.now() }, "");
    history.pushState({ t: Date.now() }, "");
  } catch {}
}

/* ---------- Data load ---------- */
async function loadItems() {
  const rows = await apiGet(`/api/items?store=${encodeURIComponent(state.session.store)}`);
  state.items = (rows || []).map((x) => ({
    ...x,
    category: canonicalCategory(x.category),
    sub_category: x.sub_category ?? null,
  }));
}
async function loadLatestExpiry() {
  try {
    const rows = await apiGet(`/api/expiry?store=${encodeURIComponent(state.session.store)}`);
    state.latestExpiryRows = Array.isArray(rows) ? rows : [];
  } catch {
    state.latestExpiryRows = [];
  }
}

/* ---------- Summary counts ---------- */
function computeSummaryCounts() {
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  let expToday = 0;
  let expTomorrow = 0;

  for (const r of state.latestExpiryRows || []) {
    const d = isoDateOnlyFromAny(r.expiry_value || r.expiry || r.expiry_at);
    if (!d) continue;
    if (d === today) expToday++;
    else if (d === tomorrow) expTomorrow++;
  }

  const totalWithExpiry = (state.latestExpiryRows || []).filter((r) => isoDateOnlyFromAny(r.expiry_value)).length;
  const allSafe = Math.max(0, totalWithExpiry - expToday - expTomorrow);

  return { expToday, expTomorrow, allSafe };
}

/* ---------- Home counts ---------- */
function categoryCounts() {
  const counts = {};
  for (const c of UI_CATEGORIES) counts[c] = 0;
  for (const it of state.items) {
    const c = canonicalCategory(it.category);
    if (counts[c] == null) counts[c] = 0;
    counts[c]++;
  }
  return counts;
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateRolePill();
  updateSessionLine();

  main.innerHTML = `
    <div class="card">
      <div class="h1">Start Session</div>
      <div class="muted">Select store, shift, and staff name.</div>

      <div class="field">
        <label class="label">Store</label>
        <select id="storeSel" class="input">
          <option value="">Select store</option>
          <option value="PDD">PDD</option>
          <option value="SKH">SKH</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Shift</label>
        <select id="shiftSel" class="input">
          <option value="">Select shift</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div class="field">
        <label class="label">Staff</label>
        <input id="staffInp" class="input" placeholder="Your name" />
      </div>

      <button id="btnStart" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Start
      </button>

      <div id="startErr" class="error hidden"></div>
    </div>
  `;

  const storeSel = $("#storeSel");
  const shiftSel = $("#shiftSel");
  const staffInp = $("#staffInp");
  const btnStart = $("#btnStart");
  const err = $("#startErr");

  storeSel.value = state.session.store || "";
  shiftSel.value = state.session.shift || "";
  staffInp.value = state.session.staff || "";

  btnStart.addEventListener("click", async () => {
    err.classList.add("hidden");

    const store = storeSel.value.trim();
    const shift = shiftSel.value.trim();
    const staff = staffInp.value.trim();

    if (!store || !shift || !staff) {
      err.textContent = "Please select Store, Shift and Staff.";
      err.classList.remove("hidden");
      return;
    }

    state.session = { store, shift, staff };
    saveSession();

    try {
      await loadItems();
      await loadLatestExpiry();
    } catch (e) {
      err.textContent = `Failed to load: ${e.message || e}`;
      err.classList.remove("hidden");
      return;
    }

    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null, filter: "all" };
    render();
  });
}

/* ---------- Render: Home ---------- */
function renderHome() {
  updateRolePill();
  updateSessionLine();

  const counts = categoryCounts();
  const { expToday, expTomorrow, allSafe } = computeSummaryCounts();

  main.innerHTML = `
    <section class="home-mock">
      <div class="summary-row">
        <button class="sum-card sum-red" id="sumToday" type="button">
          <div class="sum-num">${expToday}</div>
          <div class="sum-lbl">Expiring<br/>Today</div>
        </button>

        <button class="sum-card sum-amber" id="sumTomorrow" type="button">
          <div class="sum-num">${expTomorrow}</div>
          <div class="sum-lbl">Expiring<br/>Tomorrow</div>
        </button>

        <button class="sum-card sum-green" id="sumSafe" type="button">
          <div class="sum-num">${allSafe}</div>
          <div class="sum-lbl">All<br/>Safe</div>
        </button>
      </div>

      <div class="home-h2">Tap a Category to Manage Items</div>

      <div class="tiles-2col">
        ${UI_CATEGORIES.map((cat) => {
          const ui = CAT_UI[cat] || {};
          const count = counts[cat] ?? 0;
          return `
            <button class="mock-tile mock-${escapeHtml(ui.tone || "green")}" data-cat="${escapeHtml(cat)}" type="button">
              <div class="mock-ico">
                <img src="${escapeHtml(ui.icon || "")}" alt="" loading="lazy" onerror="this.style.opacity=.15" />
              </div>
              <div class="mock-title">${escapeHtml(cat)}</div>
              <div class="mock-sub">${count} item${count === 1 ? "" : "s"}</div>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;

  $("#sumToday").addEventListener("click", () => setView({ page: "alerts", filter: "today" }, true));
  $("#sumTomorrow").addEventListener("click", () => setView({ page: "alerts", filter: "tomorrow" }, true));
  $("#sumSafe").addEventListener("click", () => setView({ page: "alerts", filter: "safe" }, true));

  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") setView({ page: "sauce_menu", category: "Sauce", sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });
}

/* ---------- Sauce menu ---------- */
function renderSauceMenu() {
  updateRolePill();
  updateSessionLine();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="tiles-2col">
      ${SAUCE_SUBS.map((s) => {
        const ui = CAT_UI["Sauce"];
        return `
          <button class="mock-tile mock-${escapeHtml(ui.tone)}" data-sauce="${escapeHtml(s)}" type="button">
            <div class="mock-ico">
              <img src="${escapeHtml(ui.icon)}" alt="" loading="lazy" onerror="this.style.opacity=.15" />
            </div>
            <div class="mock-title">${escapeHtml(s)}</div>
            <div class="mock-sub">Tap to view items</div>
          </button>
        `;
      }).join("")}
    </section>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  $$("[data-sauce]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
    });
  });
}

/* ---------- Items for current list ---------- */
function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => norm(canonicalCategory(it.category)) === norm(category));
  if (category === "Sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }
  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

/* ---------- Expiry choices (NO 2–3 days) ---------- */
function buildExpiryChoicesForItem(it) {
  const mode = getMode(it);
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  if (mode === "EOD") return [{ type: "EOD", label: "End of day (today)", value: today }];

  if (mode === "HOURLY_FIXED") {
    return [{ type: "TIME", label: "Pick Time (Today)", value: "" }].concat(
      FIXED_TIME_SLOTS.map((t) => ({ type: "TIME", label: t, value: t }))
    );
  }

  if (mode === "MANUAL_DATE") return [{ type: "PICK", label: "Pick Date", value: "" }];

  // AUTO
  return [
    { type: "DATE", label: "Today", value: today },
    { type: "DATE", label: "Tomorrow", value: tomorrow },
    { type: "PICK", label: "Pick Date", value: "" },
  ];
}

function getInlineHelperText(it) {
  const mode = getMode(it);
  const sl = getShelfLifeDays(it);

  if (mode === "EOD") return "Expiry: End of day (auto).";
  if (mode === "HOURLY_FIXED") return "Expiry: Select fixed time (today).";
  if (mode === "MANUAL_DATE") return "Expiry: Pick a date (manual).";
  if (mode === "AUTO") return `Expiry: Today / Tomorrow / Pick Date (max ${sl} day${sl === 1 ? "" : "s"}).`;
  return "Select expiry.";
}

/* ---------- Render: Category Editor (inline qty + expiry + save) ---------- */
function renderCategoryEditor() {
  updateRolePill();
  updateSessionLine();

  const { category, sauceSub } = state.view;
  const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForCurrentList();
  if (!state.categoryDraft) state.categoryDraft = {};

  for (const it of list) {
    if (!state.categoryDraft[it.id]) {
      state.categoryDraft[it.id] = { qty: null, expType: "", expValue: "" };
    }
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <section class="edit-list">
      ${
        list.length
          ? list
              .map((it) => {
                const draft = state.categoryDraft[it.id] || { qty: null, expType: "", expValue: "" };
                const choices = buildExpiryChoicesForItem(it);
                const mode = getMode(it);

                const needsDatePicker = draft.expType === "PICK" || mode === "MANUAL_DATE";
                const datePickerValue = needsDatePicker ? (draft.expValue || "") : "";
                const qtyShown = draft.qty == null ? "" : String(draft.qty);

                return `
                  <div class="edit-card" data-item="${it.id}">
                    <div class="edit-name">${escapeHtml(it.name)}</div>

                    <div class="edit-row">
                      <div class="qty-stepper">
                        <button class="qty-btn" data-act="dec" type="button">−</button>
                        <input class="qty-inp" inputmode="numeric" value="${escapeHtml(qtyShown)}" />
                        <button class="qty-btn" data-act="inc" type="button">+</button>
                      </div>

                      <div class="exp-wrap">
                        <select class="exp-sel input">
                          <option value="">Select</option>
                          ${choices
                            .map((c) => {
                              const key = `${c.type}::${c.value || ""}`;
                              const sel =
                                draft.expType === c.type &&
                                String(draft.expValue || "") === String(c.value || "")
                                  ? "selected"
                                  : "";
                              return `<option value="${escapeHtml(key)}" ${sel}>${escapeHtml(c.label)}</option>`;
                            })
                            .join("")}
                        </select>

                        <div class="exp-pick ${needsDatePicker ? "" : "hidden"}">
                          <input class="exp-date input" type="date" value="${escapeHtml(datePickerValue)}" />
                        </div>
                      </div>
                    </div>

                    <div class="edit-helper">${escapeHtml(getInlineHelperText(it))}</div>
                  </div>
                `;
              })
              .join("")
          : `<div class="empty">No items found.</div>`
      }
    </section>

    <div class="save-bar">
      <button id="btnSaveCategory" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
        Save ${escapeHtml(title)}
      </button>
      <div id="saveErr" class="error hidden" style="margin-top:10px;"></div>
    </div>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  $$(".edit-card", main).forEach((card) => {
    const id = Number(card.getAttribute("data-item"));
    const draft = state.categoryDraft[id];

    const qtyInp = $(".qty-inp", card);
    const decBtn = $(`[data-act="dec"]`, card);
    const incBtn = $(`[data-act="inc"]`, card);

    const expSel = $(".exp-sel", card);
    const expPickWrap = $(".exp-pick", card);
    const expDate = $(".exp-date", card);

    function setQty(v) {
      if (v == null || v === "") {
        draft.qty = null;
        qtyInp.value = "";
        return;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return;
      draft.qty = n;
      qtyInp.value = String(n);
    }

    decBtn.addEventListener("click", () => {
      const cur = draft.qty == null ? 0 : Number(draft.qty);
      setQty(Math.max(0, cur - 1));
    });
    incBtn.addEventListener("click", () => {
      const cur = draft.qty == null ? 0 : Number(draft.qty);
      setQty(cur + 1);
    });
    qtyInp.addEventListener("input", () => {
      const raw = String(qtyInp.value || "").trim();
      if (raw === "") setQty(null);
      else setQty(raw);
    });

    expSel.addEventListener("change", () => {
      const v = String(expSel.value || "");
      if (!v) {
        draft.expType = "";
        draft.expValue = "";
        expPickWrap.classList.add("hidden");
        expDate.value = "";
        return;
      }
      const [t, val] = v.split("::");
      draft.expType = t || "";
      draft.expValue = val || "";

      if (draft.expType === "PICK") {
        expPickWrap.classList.remove("hidden");
        expDate.value = "";
        draft.expValue = "";
      } else {
        expPickWrap.classList.add("hidden");
        expDate.value = "";
      }
    });

    expDate.addEventListener("change", () => {
      draft.expValue = String(expDate.value || "").trim();
    });
  });

  $("#btnSaveCategory").addEventListener("click", async () => {
    const err = $("#saveErr");
    err.classList.add("hidden");
    err.textContent = "";

    const toSave = [];
    const today = todayISODate();

    for (const it of list) {
      const d = state.categoryDraft[it.id];
      if (!d) continue;

      const hasQty = d.qty != null && Number.isFinite(Number(d.qty));
      const hasExpiry = !!d.expType;

      if (!hasQty && !hasExpiry) continue;

      if (d.qty != null) {
        const qn = Number(d.qty);
        if (!Number.isFinite(qn) || qn < 0) {
          err.textContent = `Invalid quantity for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
      }

      let expiry = null;
      let expiry_at = null;

      const mode = getMode(it);

      if (mode === "EOD") {
        expiry_at = toISOAtLocalEndOfDay(today);
      } else if (mode === "HOURLY_FIXED") {
        if (d.expType !== "TIME" || !d.expValue) {
          err.textContent = `Expiry time required for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
        expiry_at = toISOAtLocalTime(today, d.expValue);
      } else if (mode === "MANUAL_DATE") {
        if (d.expType !== "PICK" || !d.expValue) {
          err.textContent = `Pick a date for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
        expiry = d.expValue;
      } else {
        if (!d.expType) {
          err.textContent = `Select expiry for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
        if (d.expType === "DATE") expiry = d.expValue;
        else if (d.expType === "PICK") {
          if (!d.expValue) {
            err.textContent = `Pick a date for "${it.name}".`;
            err.classList.remove("hidden");
            return;
          }
          expiry = d.expValue;
        }
      }

      // enforce shelf-life for AUTO when using date
      if (expiry && mode === "AUTO") {
        const sl = getShelfLifeDays(it);
        const maxDate = addDaysISODate(today, Math.max(0, sl || 0));
        if (expiry < today || expiry > maxDate) {
          err.textContent = `"${it.name}" must be between ${today} and ${maxDate} (shelf life rule).`;
          err.classList.remove("hidden");
          return;
        }
      }

      toSave.push({
        item: it,
        qty: d.qty == null ? null : Number(d.qty),
        expiry,
        expiry_at,
      });
    }

    if (!toSave.length) {
      toast("Nothing to save");
      return;
    }

    try {
      $("#btnSaveCategory").disabled = true;

      for (const s of toSave) {
        const it = s.item;

        const payload = {
          item_id: it.id,
          item_name: it.name,
          category: dbCategoryFromUi(canonicalCategory(it.category)), // store DB value
          sub_category: it.sub_category || null,
          store: state.session.store,
          staff: state.session.staff,
          shift: state.session.shift,
          quantity: s.qty,
          expiry: s.expiry || null,
          expiry_at: s.expiry_at || null,
          created_at: new Date().toISOString(),
        };

        await apiPost("/api/log", payload);
        await sleep(35);
      }

      toast("Saved ✅");
      await loadLatestExpiry();

      for (const it of list) {
        state.categoryDraft[it.id] = { qty: null, expType: "", expValue: "" };
      }

      render();
    } catch (e) {
      err.textContent = e?.message || "Save failed.";
      err.classList.remove("hidden");
    } finally {
      $("#btnSaveCategory").disabled = false;
    }
  });
}

/* ---------- Alerts (filtered) ---------- */
async function renderAlerts() {
  updateRolePill();
  updateSessionLine();

  const filter = state.view.filter || "all";
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="muted">Latest expiry per item • Store ${escapeHtml(state.session.store)}</div>
      <div class="muted" style="margin-top:8px;">Filter: <b>${escapeHtml(filter)}</b></div>
      <div id="alertsWrap" class="muted" style="margin-top:12px;">Loading...</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  const wrap = $("#alertsWrap");

  try {
    if (!state.latestExpiryRows || !state.latestExpiryRows.length) {
      await loadLatestExpiry();
    }

    let rows = state.latestExpiryRows || [];
    rows = rows
      .map((r) => ({ ...r, _date: isoDateOnlyFromAny(r.expiry_value || "") }))
      .filter((r) => r._date);

    if (filter === "today") rows = rows.filter((r) => r._date === today);
    if (filter === "tomorrow") rows = rows.filter((r) => r._date === tomorrow);
    if (filter === "safe") rows = rows.filter((r) => r._date !== today && r._date !== tomorrow);

    if (!rows.length) {
      wrap.innerHTML = `<div class="muted">No items for this filter.</div>`;
      return;
    }

    wrap.innerHTML = rows
      .map(
        (r) => `
        <div class="alert-row">
          <div>
            <div class="alert-name">${escapeHtml(r.name)}</div>
            <div class="alert-extra">${escapeHtml(canonicalCategory(r.category))}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
          </div>
          <div style="font-weight:1000;color:var(--green-dark)">${escapeHtml(r.expiry_value)}</div>
        </div>
      `
      )
      .join("");
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Logout ---------- */
function doLogout() {
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    updateRolePill();
    state.view = { page: "home", category: null, sauceSub: null, filter: "all" };
    render();
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();
  state.navStack = [];
  state.view = { page: "session", category: null, sauceSub: null, filter: "all" };
  render();
}

/* ---------- Manager login modal ---------- */
function openManagerLogin() {
  openModal(
    "Manager Access",
    `
    <div class="field">
      <label class="label">Enter PIN</label>
      <input id="pinInp" class="input" inputmode="numeric" placeholder="PIN" />
      <div class="helper">Manager only.</div>
    </div>

    <div id="pinErr" class="error hidden"></div>

    <button id="btnPinLogin" type="button"
      style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;box-shadow:0 12px 22px rgba(0,0,0,0.10);cursor:pointer;">
      Login
    </button>
  `
  );

  const pinInp = $("#pinInp", modalBodyEl);
  const err = $("#pinErr", modalBodyEl);
  const btn = $("#btnPinLogin", modalBodyEl);

  btn.addEventListener("click", async () => {
    err.classList.add("hidden");
    const pin = (pinInp.value || "").trim();
    if (!pin) {
      err.textContent = "PIN required.";
      err.classList.remove("hidden");
      return;
    }

    try {
      const out = await apiPost("/api/manager/login", { pin, store: state.session.store });
      setManagerToken(out.token || "");
      closeModal();
      toast("Manager mode ✅");
      updateRolePill();
      setView({ page: "manager" }, true);
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager Router ---------- */
async function renderManager() {
  updateRolePill();
  updateSessionLine();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" type="button"
          style="margin-top:12px;width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
          Enter PIN
        </button>
      </div>
    `;
    $("#btnGoLogin").addEventListener("click", openManagerLogin);
    return;
  }

  const tab = state.managerUI.tab || "dashboard";
  if (tab === "dashboard") return renderManagerDashboard();
  if (tab === "itemCats") return renderManagerItemCats();
  if (tab === "items") return renderManagerItemsCompact();
  if (tab === "addItem") return renderManagerAddItem();
  if (tab === "categories") return renderManagerCategoriesTiles();
  if (tab === "editCategory") return renderManagerEditCategory();
  if (tab === "addCategory") return renderManagerAddCategory();

  state.managerUI.tab = "dashboard";
  return renderManagerDashboard();
}

/* ---------- Manager: Dashboard (tiles) ---------- */
function renderManagerDashboard() {
  updateRolePill();
  updateSessionLine();

  // manager summary same as home (no 2–3 days)
  const { expToday, expTomorrow, allSafe } = computeSummaryCounts();

  main.innerHTML = `
    <section class="home-mock">
      <div class="page-head" style="margin-top:2px;">
        <button id="backBtn" class="btn-ghost" type="button">← Back</button>
        <div class="page-title">Manager</div>
      </div>

      <div class="summary-row" style="margin-top:10px;">
        <button class="sum-card sum-red" id="mSumToday" type="button">
          <div class="sum-num">${expToday}</div>
          <div class="sum-lbl">Expiring<br/>Today</div>
        </button>

        <button class="sum-card sum-amber" id="mSumTomorrow" type="button">
          <div class="sum-num">${expTomorrow}</div>
          <div class="sum-lbl">Expiring<br/>Tomorrow</div>
        </button>

        <button class="sum-card sum-green" id="mSumSafe" type="button">
          <div class="sum-num">${allSafe}</div>
          <div class="sum-lbl">All<br/>Safe</div>
        </button>
      </div>

      <div class="home-h2">Tools</div>

      <div class="mgr-grid">
        <button class="mgr-tile" id="mgrAddItem" type="button">
          <div class="mgr-ico">➕</div>
          <div class="mgr-title">Add Item</div>
          <div class="mgr-sub">Create a new item</div>
        </button>

        <button class="mgr-tile" id="mgrEditItems" type="button">
          <div class="mgr-ico">🧾</div>
          <div class="mgr-title">Edit Items</div>
          <div class="mgr-sub">By category (compact)</div>
        </button>

        <button class="mgr-tile" id="mgrCats" type="button">
          <div class="mgr-ico">🗂️</div>
          <div class="mgr-title">Categories</div>
          <div class="mgr-sub">Add / Edit / Delete</div>
        </button>
      </div>
    </section>
  `;

  $("#backBtn").onclick = () => goBack();

  // summary cards go to alerts with filter
  $("#mSumToday").onclick = () => setView({ page: "alerts", filter: "today" }, true);
  $("#mSumTomorrow").onclick = () => setView({ page: "alerts", filter: "tomorrow" }, true);
  $("#mSumSafe").onclick = () => setView({ page: "alerts", filter: "safe" }, true);

  $("#mgrAddItem").onclick = () => {
    state.managerUI.tab = "addItem";
    render();
  };
  $("#mgrEditItems").onclick = () => {
    state.managerUI.tab = "itemCats";
    state.managerUI.cat = null;
    state.managerUI.sub = null;
    state.managerUI.expandedItemId = null;
    render();
  };
  $("#mgrCats").onclick = () => {
    state.managerUI.tab = "categories";
    state.managerUI.editCat = null;
    render();
  };
}

/* ---------- Manager: Edit Items -> Category tiles first (NO ICON, NAME ONLY as requested for manager category selection) ---------- */
function renderManagerItemCats() {
  updateRolePill();
  updateSessionLine();

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Edit Items</div>
    </div>

    <div class="home-h2" style="margin-top:8px;">Choose a Category</div>

    <div class="mgr-cat-tiles">
      ${UI_CATEGORIES.map((cat) => `
        <button class="mgr-cat-tile" data-mcat="${escapeHtml(cat)}" type="button">
          ${escapeHtml(cat)}
        </button>
      `).join("")}
    </div>

    <div id="sauceSubsWrap" class="hidden" style="margin-top:14px;">
      <div class="home-h2">Sauce Sub-category</div>
      <div class="mgr-cat-tiles">
        ${SAUCE_SUBS.map((s) => `
          <button class="mgr-cat-tile" data-msub="${escapeHtml(s)}" type="button">
            ${escapeHtml(s)}
          </button>
        `).join("")}
      </div>
    </div>
  `;

  $("#backBtn").onclick = () => {
    state.managerUI.tab = "dashboard";
    render();
  };

  $$("[data-mcat]", main).forEach((b) => {
    b.onclick = () => {
      const cat = b.getAttribute("data-mcat");
      state.managerUI.cat = cat;
      state.managerUI.sub = null;
      state.managerUI.expandedItemId = null;

      if (norm(cat) === norm("Sauce")) {
        $("#sauceSubsWrap").classList.remove("hidden");
        return;
      }

      state.managerUI.tab = "items";
      render();
    };
  });

  $$("[data-msub]", main).forEach((b) => {
    b.onclick = () => {
      state.managerUI.cat = "Sauce";
      state.managerUI.sub = b.getAttribute("data-msub");
      state.managerUI.expandedItemId = null;
      state.managerUI.tab = "items";
      render();
    };
  });
}

/* ---------- Manager: Items list (COMPACT; expand only on Edit) ---------- */
async function renderManagerItemsCompact() {
  updateRolePill();
  updateSessionLine();

  const chosenCat = state.managerUI.cat;
  const chosenSub = state.managerUI.sub;

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Edit Items • ${escapeHtml(chosenCat || "")}${chosenSub ? ` • ${escapeHtml(chosenSub)}` : ""}</div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-title">Search (optional)</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div id="mgrList" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn").onclick = () => {
    state.managerUI.tab = "itemCats";
    render();
  };

  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");

  let rows = [];
  try {
    rows = await apiManager("GET", `/api/manager/items?store=${encodeURIComponent(state.session.store)}`);
  } catch (e) {
    listEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    return;
  }

  // filter by chosen category/sub
  if (chosenCat) {
    rows = rows.filter((r) => {
      const uiCat = canonicalCategory(uiCategoryFromDb(r.category));
      if (norm(uiCat) !== norm(chosenCat)) return false;
      if (norm(chosenCat) === norm("Sauce")) {
        return norm(r.sub_category || "") === norm(chosenSub || "");
      }
      return true;
    });
  }

  function renderRows() {
    const q = norm(searchEl.value || "");
    const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

    if (!rows.length) {
      listEl.innerHTML = `<div class="muted">No items in this category.</div>`;
      return;
    }
    if (!filtered.length) {
      listEl.innerHTML = `<div class="muted">No matches.</div>`;
      return;
    }

    const expandedId = state.managerUI.expandedItemId;

    listEl.innerHTML = filtered
      .slice(0, 250)
      .map((r) => {
        const id = Number(r.id);
        const isOpen = expandedId === id;

        const uiCat = canonicalCategory(uiCategoryFromDb(r.category));
        const sl = Number(r.shelf_life_days ?? 0);
        const sub = r.sub_category || "";

        return `
          <div class="mgr-row">
            <div class="mgr-row-top">
              <div class="mgr-row-name">${escapeHtml(r.name)}</div>
              <button class="mgr-row-edit" data-edit="${id}" type="button">${isOpen ? "Close" : "Edit"}</button>
            </div>

            <div class="mgr-row-meta">
              <span class="pill">${escapeHtml(uiCat)}</span>
              ${sub ? `<span class="pill pill2">${escapeHtml(sub)}</span>` : ""}
              <span class="pill pill3">${escapeHtml(sl)} day</span>
            </div>

            <div class="mgr-row-body ${isOpen ? "" : "hidden"}" data-body="${id}">
              <div class="field">
                <label class="label">Category</label>
                <select class="input m-cat" data-id="${id}">
                  ${UI_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${norm(c) === norm(uiCat) ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>

              <div class="field">
                <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
                <select class="input m-sub" data-id="${id}">
                  <option value="" ${sub ? "" : "selected"}>(none)</option>
                  ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${norm(s) === norm(sub) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                </select>
              </div>

              <div class="field">
                <label class="label">Shelf life (days)</label>
                <input class="input m-sl" data-id="${id}" inputmode="numeric" value="${escapeHtml(sl)}" />
                <div class="helper">&gt;7 days becomes manual in app.</div>
              </div>

              <div class="mgr-actions">
                <button class="m-save" data-id="${id}" type="button">Save</button>
                <button class="m-del" data-id="${id}" type="button">Delete</button>
              </div>

              <div class="m-err error hidden" data-id="${id}"></div>
            </div>
          </div>
        `;
      })
      .join("");

    // Toggle expand
    $$(".mgr-row-edit", listEl).forEach((b) => {
      b.onclick = () => {
        const id = Number(b.getAttribute("data-edit"));
        state.managerUI.expandedItemId = state.managerUI.expandedItemId === id ? null : id;
        renderRows();
      };
    });

    // Save
    $$(".m-save", listEl).forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.m-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        const catSel = $(`.m-cat[data-id="${id}"]`, listEl);
        const subSel = $(`.m-sub[data-id="${id}"]`, listEl);
        const slInp = $(`.m-sl[data-id="${id}"]`, listEl);

        const uiCategory = String(catSel.value || "").trim();
        const category = dbCategoryFromUi(uiCategory);

        const sub_category = String(subSel.value || "").trim() || null;
        const shelf_life_days = Number(String(slInp.value || "0").trim());

        const finalSub = norm(uiCategory) === norm("Sauce") ? sub_category : null;

        if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
          err.textContent = "Shelf life must be a number ≥ 0.";
          err.classList.remove("hidden");
          return;
        }

        try {
          await apiManager("PATCH", `/api/manager/items/${id}`, {
            store: state.session.store,
            category,
            sub_category: finalSub,
            shelf_life_days,
          });
          toast("Saved ✅");

          // update local list
          rows = rows.map((x) =>
            Number(x.id) === id ? { ...x, category, sub_category: finalSub, shelf_life_days } : x
          );

          await loadItems(); // refresh staff view data
          renderRows();
        } catch (e) {
          err.textContent = e.message || "Save failed.";
          err.classList.remove("hidden");
        }
      };
    });

    // Delete (soft delete)
    $$(".m-del", listEl).forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.m-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        if (!confirm("Delete this item? (Soft delete)")) return;

        try {
          await apiManager("DELETE", `/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`);
          toast("Deleted ✅");
          rows = rows.filter((x) => Number(x.id) !== id);
          if (state.managerUI.expandedItemId === id) state.managerUI.expandedItemId = null;

          await loadItems();
          renderRows();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      };
    });
  }

  searchEl.addEventListener("input", renderRows);
  renderRows();
}

/* ---------- Manager: Add Item (modal-like page) ---------- */
function renderManagerAddItem() {
  updateRolePill();
  updateSessionLine();

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Add Item</div>
    </div>

    <div class="card">
      <div class="field">
        <label class="label">Name</label>
        <input id="newName" class="input" placeholder="Item name" />
      </div>

      <div class="field">
        <label class="label">Category</label>
        <select id="newCat" class="input">
          ${UI_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
        <select id="newSub" class="input">
          <option value="" selected>(none)</option>
          ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label class="label">Shelf life (days)</label>
        <input id="newSL" class="input" inputmode="numeric" value="1" />
      </div>

      <div id="addErr" class="error hidden"></div>

      <button id="btnAddSave" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
        Save
      </button>
    </div>
  `;

  $("#backBtn").onclick = () => {
    state.managerUI.tab = "dashboard";
    render();
  };

  $("#btnAddSave").onclick = async () => {
    const err = $("#addErr");
    err.classList.add("hidden");

    const name = String($("#newName").value || "").trim();
    const uiCategory = String($("#newCat").value || "").trim();
    const category = dbCategoryFromUi(uiCategory);

    const sub = String($("#newSub").value || "").trim() || null;
    const shelf_life_days = Number(String($("#newSL").value || "0").trim());

    if (!name) {
      err.textContent = "Name required.";
      err.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
      err.textContent = "Shelf life must be a number ≥ 0.";
      err.classList.remove("hidden");
      return;
    }

    const finalSub = norm(uiCategory) === norm("Sauce") ? sub : null;

    try {
      await apiManager("POST", "/api/manager/items", {
        store: state.session.store,
        name,
        category,
        sub_category: finalSub,
        shelf_life_days,
      });

      await loadItems();
      toast("Added ✅");
      state.managerUI.tab = "dashboard";
      render();
    } catch (e) {
      err.textContent = e.message || "Failed";
      err.classList.remove("hidden");
    }
  };
}

/* ---------- Manager: Categories (tiles WITHOUT ICON; tap tile to edit) ---------- */
async function renderManagerCategoriesTiles() {
  updateRolePill();
  updateSessionLine();

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Categories</div>
    </div>

    <div class="card" style="margin-top:12px;">
      <button id="btnAddCategory" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
        Add Category
      </button>
      <div class="muted" style="margin-top:10px;">Tap a category tile to edit.</div>
      <div id="catErr" class="error hidden" style="margin-top:10px;"></div>
    </div>

    <div class="card">
      <div class="card-title">Current Categories • ${escapeHtml(state.session.store)}</div>
      <div id="catTiles" class="mgr-cat-tiles" style="margin-top:10px;">Loading…</div>
    </div>
  `;

  $("#backBtn").onclick = () => {
    state.managerUI.tab = "dashboard";
    render();
  };

  $("#btnAddCategory").onclick = () => {
    state.managerUI.tab = "addCategory";
    render();
  };

  const tiles = $("#catTiles");
  const err = $("#catErr");

  try {
    const rows = await apiManager(
      "GET",
      `/api/manager/categories?store=${encodeURIComponent(state.session.store)}`
    );
    state.managerUI.categories = Array.isArray(rows) ? rows : [];

    if (!state.managerUI.categories.length) {
      tiles.innerHTML = `<div class="muted">No categories yet.</div>`;
      return;
    }

    tiles.innerHTML = state.managerUI.categories
      .map((c) => {
        const uiName = canonicalCategory(uiCategoryFromDb(c.name));
        return `<button class="mgr-cat-tile" data-cid="${c.id}" type="button">${escapeHtml(uiName)}</button>`;
      })
      .join("");

    $$("[data-cid]", tiles).forEach((b) => {
      b.onclick = () => {
        const id = Number(b.getAttribute("data-cid"));
        const found = state.managerUI.categories.find((x) => Number(x.id) === id);
        if (!found) return;
        state.managerUI.editCat = found;
        state.managerUI.tab = "editCategory";
        render();
      };
    });
  } catch (e) {
    err.textContent = e.message || "Failed";
    err.classList.remove("hidden");
    tiles.innerHTML = "";
  }
}

/* ---------- Manager: Add Category ---------- */
function renderManagerAddCategory() {
  updateRolePill();
  updateSessionLine();

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Add Category</div>
    </div>

    <div class="card">
      <div class="field">
        <label class="label">Category Name</label>
        <input id="catName" class="input" placeholder="e.g. Prepared items" />
        <div class="helper">Keep spelling consistent.</div>
      </div>

      <div id="addCatErr" class="error hidden"></div>

      <button id="btnCatSave" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
        Save
      </button>
    </div>
  `;

  $("#backBtn").onclick = () => {
    state.managerUI.tab = "categories";
    render();
  };

  $("#btnCatSave").onclick = async () => {
    const err = $("#addCatErr");
    err.classList.add("hidden");

    const uiName = String($("#catName").value || "").trim();
    if (!uiName) {
      err.textContent = "Name required.";
      err.classList.remove("hidden");
      return;
    }

    // store DB name (map fountain -> back counter)
    const dbName = dbCategoryFromUi(uiName);

    try {
      await apiManager("POST", "/api/manager/categories", {
        store: state.session.store,
        name: dbName,
      });
      toast("Category added ✅");
      state.managerUI.tab = "categories";
      render();
    } catch (e) {
      err.textContent = e.message || "Failed";
      err.classList.remove("hidden");
    }
  };
}

/* ---------- Manager: Edit Category (tile clicked) ---------- */
function renderManagerEditCategory() {
  updateRolePill();
  updateSessionLine();

  const c = state.managerUI.editCat;
  if (!c) {
    state.managerUI.tab = "categories";
    return renderManagerCategoriesTiles();
  }

  const uiName = canonicalCategory(uiCategoryFromDb(c.name));

  main.innerHTML = `
    <div class="page-head">
      <button class="btn-ghost" id="backBtn" type="button">← Back</button>
      <div class="page-title">Edit Category</div>
    </div>

    <div class="card">
      <div class="field">
        <label class="label">Category Name</label>
        <input id="catName" class="input" value="${escapeHtml(uiName)}" />
        <div class="helper">Renaming affects how items appear in the app.</div>
      </div>

      <div id="editCatErr" class="error hidden"></div>

      <button id="btnSaveCat" type="button"
        style="width:100%;border:0;border-radius:999px;padding:14px 16px;font-weight:1000;background:var(--yellow);color:#1b1b1b;cursor:pointer;">
        Save
      </button>

      <button id="btnDelCat" type="button"
        style="margin-top:10px;width:100%;border:1px solid rgba(0,0,0,0.14);border-radius:999px;padding:14px 16px;font-weight:1000;background:#fff;color:#c62828;cursor:pointer;">
        Delete Category
      </button>
    </div>
  `;

  $("#backBtn").onclick = () => {
    state.managerUI.tab = "categories";
    render();
  };

  $("#btnSaveCat").onclick = async () => {
    const err = $("#editCatErr");
    err.classList.add("hidden");

    const newUi = String($("#catName").value || "").trim();
    if (!newUi) {
      err.textContent = "Name required.";
      err.classList.remove("hidden");
      return;
    }
    const newDbName = dbCategoryFromUi(newUi);

    try {
      await apiManager("PATCH", `/api/manager/categories/${c.id}`, {
        store: state.session.store,
        name: newDbName,
      });
      toast("Category saved ✅");

      // refresh items too (in case category renamed affects view)
      await loadItems();

      state.managerUI.tab = "categories";
      state.managerUI.editCat = null;
      render();
    } catch (e) {
      err.textContent = e.message || "Failed";
      err.classList.remove("hidden");
    }
  };

  $("#btnDelCat").onclick = async () => {
    const err = $("#editCatErr");
    err.classList.add("hidden");

    if (!confirm("Delete this category? Items under it may become unassigned.")) return;

    try {
      await apiManager("DELETE", `/api/manager/categories/${c.id}?store=${encodeURIComponent(state.session.store)}`);
      toast("Category deleted ✅");
      await loadItems();

      state.managerUI.tab = "categories";
      state.managerUI.editCat = null;
      render();
    } catch (e) {
      err.textContent = e.message || "Failed";
      err.classList.remove("hidden");
    }
  };
}

/* ---------- Render Router ---------- */
async function render() {
  if (!main) return;

  updateRolePill();
  updateSessionLine();

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!hasSession && state.view.page !== "session") {
    state.view = { page: "session", category: null, sauceSub: null, filter: "all" };
  }

  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategoryEditor();
  if (page === "alerts") return renderAlerts();
  if (page === "manager") return renderManager();

  state.view = { page: "home", category: null, sauceSub: null, filter: "all" };
  renderHome();
}

/* ---------- Inject CSS for Step UI + Manager compact ---------- */
function injectCSS() {
  if ($("#precheckStepCss")) return;
  const css = document.createElement("style");
  css.id = "precheckStepCss";
  css.textContent = `
    /* Role pill */
    .role-pill{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:999px;padding:10px 14px;font-weight:1000;cursor:pointer}
    .role-pill--mgr{background:rgba(229,57,53,.12);color:#b71c1c}
    .role-pill--staff{background:rgba(30,136,229,.12);color:#0d47a1}
    .role-text{font-weight:1000}
    .role-ico{font-size:18px}

    /* Home mock */
    .home-mock{padding-bottom:18px}
    .summary-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0 14px}
    .sum-card{border:0;border-radius:14px;padding:12px 10px;box-shadow:0 12px 24px rgba(0,0,0,.10);cursor:pointer}
    .sum-num{font-size:26px;font-weight:1100;line-height:1}
    .sum-lbl{margin-top:6px;font-size:12px;font-weight:900;opacity:.9;line-height:1.1}
    .sum-red{background:#ffe6e6;color:#b71c1c}
    .sum-amber{background:#fff2dd;color:#6a3d00}
    .sum-green{background:#e7f7ea;color:#0b5a2a}

    .home-h2{font-weight:1100;font-size:18px;margin:6px 2px 12px}

    .tiles-2col{display:grid;grid-template-columns:1fr 1fr;gap:12px}

    .mock-tile{border:0;border-radius:16px;padding:14px;box-shadow:0 14px 26px rgba(0,0,0,.12);cursor:pointer;text-align:left;min-height:108px;position:relative;overflow:hidden}
    .mock-ico{width:54px;height:54px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.24);backdrop-filter: blur(4px)}
    .mock-ico img{width:46px;height:46px;object-fit:contain}
    .mock-title{margin-top:10px;font-weight:1100;font-size:16px;color:#fff}
    .mock-sub{margin-top:4px;font-weight:900;font-size:12px;color:rgba(255,255,255,.9)}

    .mock-green{background:linear-gradient(135deg,#1f8a4a,#0f5f33)}
    .mock-blue{background:linear-gradient(135deg,#2b89ff,#1762c7)}
    .mock-cyan{background:linear-gradient(135deg,#26c6da,#0b7a86)}
    .mock-green2{background:linear-gradient(135deg,#4caf50,#2e7d32)}
    .mock-orange{background:linear-gradient(135deg,#ff9800,#e65100)}
    .mock-red{background:linear-gradient(135deg,#ef5350,#b71c1c)}
    .mock-teal{background:linear-gradient(135deg,#26a69a,#00695c)}
    .mock-green3{background:linear-gradient(135deg,#2e7d32,#0b5a2a)}
    .mock-purple{background:linear-gradient(135deg,#7e57c2,#4527a0)}

    /* Category editor */
    .edit-list{display:flex;flex-direction:column;gap:12px;margin-top:12px}
    .edit-card{background:#fff;border-radius:16px;box-shadow:0 12px 24px rgba(0,0,0,.10);padding:14px}
    .edit-name{font-weight:1100;font-size:18px;margin-bottom:10px}
    .edit-row{display:flex;gap:12px;align-items:stretch}
    .qty-stepper{display:grid;grid-template-columns:44px 64px 44px;border:1px solid rgba(0,0,0,.12);border-radius:12px;overflow:hidden;height:44px}
    .qty-btn{border:0;background:#fff;font-size:20px;font-weight:1100;cursor:pointer}
    .qty-inp{border:0;text-align:center;font-weight:1000;font-size:16px;outline:none}
    .exp-wrap{flex:1;display:flex;flex-direction:column;gap:8px}
    .exp-pick.hidden{display:none}
    .edit-helper{margin-top:10px;font-size:12px;opacity:.75;font-weight:700}
    .save-bar{position:sticky;bottom:0;background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.9) 40%, rgba(255,255,255,1));padding:12px 0 6px;margin-top:18px}

    /* Manager dashboard */
    .mgr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .mgr-tile{border:0;background:#fff;border-radius:16px;box-shadow:0 14px 26px rgba(0,0,0,.12);padding:14px;text-align:left;cursor:pointer}
    .mgr-ico{font-size:22px;font-weight:1000}
    .mgr-title{margin-top:10px;font-weight:1100;font-size:16px}
    .mgr-sub{margin-top:4px;font-weight:800;font-size:12px;opacity:.75}

    /* Category tiles (name-only) */
    .mgr-cat-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .mgr-cat-tile{border:0;border-radius:14px;padding:14px 12px;background:#fff;box-shadow:0 10px 18px rgba(0,0,0,.10);font-weight:1000;text-align:left;cursor:pointer}
    .mgr-cat-tile:hover{transform:translateY(-1px)}

    /* Manager compact rows */
    .mgr-row{border-top:1px dashed rgba(0,0,0,.12);padding-top:12px;margin-top:12px}
    .mgr-row-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .mgr-row-name{font-weight:1100;font-size:16px;line-height:1.2}
    .mgr-row-edit{border:0;border-radius:999px;padding:8px 12px;font-weight:1000;background:rgba(0,0,0,.06);cursor:pointer}
    .mgr-row-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .pill{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-weight:900;font-size:12px;background:rgba(0,0,0,.06)}
    .pill2{background:rgba(126,87,194,.12);color:#4527a0}
    .pill3{background:rgba(30,136,229,.10);color:#0d47a1}
    .mgr-row-body.hidden{display:none}
    .mgr-actions{display:flex;gap:10px;margin-top:10px}
    .mgr-actions .m-save{flex:1;border:0;border-radius:999px;padding:12px 14px;font-weight:1100;background:var(--yellow);color:#1b1b1b;cursor:pointer}
    .mgr-actions .m-del{flex:1;border:1px solid rgba(0,0,0,.14);border-radius:999px;padding:12px 14px;font-weight:1100;background:#fff;color:#c62828;cursor:pointer}
  `;
  document.head.appendChild(css);
}

/* ---------- Boot ---------- */
async function boot() {
  ensureToast();
  bindModal();
  injectCSS();
  bindSwipeBack();
  bindDrawer();

  loadSession();
  setManagerToken(getManagerToken());

  // load items + summary if session exists
  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadItems();
      await loadLatestExpiry();
      state.view = { page: "home", category: null, sauceSub: null, filter: "all" };
    } catch {
      state.view = { page: "session", category: null, sauceSub: null, filter: "all" };
    }
  } else {
    state.view = { page: "session", category: null, sauceSub: null, filter: "all" };
  }

  render();
}

boot().catch((e) => {
  console.error(e);
  if (main) {
    main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(
      e?.message || e
    )}</div></div>`;
  }
});
