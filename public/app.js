/* =========================
   PreCheck — app.js (FULL)
   ALL-IN-ONE (STEP 2–5):
   - Home UI (summary cards + category tiles + icons + colors)
   - Drawer hamburger (uses existing index.html: #btnMenu, #drawerBackdrop, etc.)
   - Category editor UI (qty + expiry + yellow Save)
   - Expiry logic: AUTO / MANUAL / EOD / HOURLY + Chicken Bacon (C) rule + shelf life rules
   - Alerts page (Today / Tomorrow / Safe) — NO 2-3 days
   - Manager mode (PIN login + tidy dashboard tiles)
   - Manager CRUD: items + categories (soft delete)
   - Store-separated: PDD vs SKH
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

/* ---------- DOM ---------- */
const main = $("#main");
const topbar = $("#topbar");
const sessionLine = $("#sessionLine");

// drawer elements from your index.html
const drawerBackdrop = $("#drawerBackdrop");
const btnMenu = $("#btnMenu");
const btnDrawerClose = $("#btnDrawerClose");
const drawerHome = $("#drawerHome");
const drawerAlerts = $("#drawerAlerts");
const drawerManager = $("#drawerManager");
const drawerLogout = $("#drawerLogout");

// modal
const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* ---------- Constants ---------- */
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

// fixed time dropdown for HOURLY_FIXED
const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];

// items that are hourly fixed (edit if needed)
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);

// Always manual date-only items (besides Unopened chiller)
const MANUAL_ALWAYS = new Set([]);

/**
 * IMPORTANT: Visible category names (must match what you want)
 * Legacy DB may still have "Back counter". We DISPLAY it as "Fountain Drinks".
 */
const DEFAULT_CATEGORIES = [
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

/* Tile UI: colors + icons */
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

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  view: { page: "session", category: null, sauceSub: null, filter: "all" },
  navStack: [],
  manager: { token: "" },

  // data
  categories: [...DEFAULT_CATEGORIES],
  items: [],
  latestExpiryRows: [],

  // per-category draft
  categoryDraft: {},

  // manager ui
  managerModePage: "dashboard", // dashboard | items | categories
};

/* ---------- Storage ---------- */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session = { store: s.store || "", shift: s.shift || "", staff: s.staff || "" };
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
  setTimeout(() => t.classList.add("hidden"), 1700);
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

/* ---------- Category normalize (legacy mapping) ---------- */
function canonicalCategory(cat) {
  const raw = String(cat || "").trim();
  const n = norm(raw);

  // Legacy rename: "Back counter" -> "Fountain Drinks" (DISPLAY)
  if (n === norm("Back counter")) return "Fountain Drinks";

  // if DB already uses Fountain Drinks, keep it
  const hit = state.categories.find((x) => norm(x) === n) || DEFAULT_CATEGORIES.find((x) => norm(x) === n);
  return hit || raw || "Unknown";
}

/* ---------- Shelf life ---------- */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? item.shelfLifeDays ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/* ---------- Expiry mode logic ---------- */
function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Chicken Bacon (C) = EOD
  if (nameN === norm("Chicken Bacon (C)")) return "EOD";

  // Unopened chiller always manual date-only
  if (cat === "Unopened chiller") return "MANUAL_DATE";

  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  // >7 days => manual date-only
  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";

  // default
  return "AUTO";
}

/* ---------- Drawer (uses your index.html drawer) ---------- */
function openDrawer() {
  if (!drawerBackdrop) return;
  drawerBackdrop.classList.remove("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  if (!drawerBackdrop) return;
  drawerBackdrop.classList.add("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "true");
}
function bindDrawer() {
  if (!drawerBackdrop) return;

  if (btnMenu) {
    btnMenu.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDrawer();
    };
  }
  if (btnDrawerClose) {
    btnDrawerClose.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    };
  }

  // click outside to close
  drawerBackdrop.addEventListener("click", (e) => {
    if (e.target === drawerBackdrop) closeDrawer();
  });

  // buttons
  if (drawerHome) drawerHome.onclick = () => { closeDrawer(); setView({ page: "home", category: null, sauceSub: null }, true); };
  if (drawerAlerts) drawerAlerts.onclick = () => { closeDrawer(); setView({ page: "alerts", filter: "all" }, true); };
  if (drawerManager) drawerManager.onclick = () => {
    closeDrawer();
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  };
  if (drawerLogout) drawerLogout.onclick = () => { closeDrawer(); doLogout(); };
}

/* ---------- Top-right role pill (uses #rolePill from index.html) ---------- */
function updateRolePill() {
  const pill = $("#rolePill");
  if (!pill) return;

  pill.classList.remove("hidden");

  const isMgr = isManagerMode();
  const label = isMgr ? "Manager" : "Staff";
  const icon = isMgr ? "👑" : "🧢";

  pill.className = `role-pill ${isMgr ? "role-pill--mgr" : "role-pill--staff"}`;
  pill.innerHTML = `
    <span class="role-text">${label}</span>
    <span class="role-ico" aria-hidden="true">${icon}</span>
  `;

  pill.onclick = () => {
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

  try { history.pushState({ t: Date.now() }, ""); } catch {}
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  if (prev) {
    state.view = prev;
    render();
  } else {
    setView({ page: "home" }, false);
  }
}
function bindBackHandling() {
  window.addEventListener("popstate", () => {
    // close modal first
    if (modalBackdrop && !modalBackdrop.classList.contains("hidden")) {
      closeModal();
      return;
    }
    // close drawer if open
    if (drawerBackdrop && !drawerBackdrop.classList.contains("hidden")) {
      closeDrawer();
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
async function loadCategories() {
  // Prefer server categories (store-separated). If missing, fallback to default list.
  try {
    const rows = await apiGet(`/api/categories?store=${encodeURIComponent(state.session.store)}`);
    if (Array.isArray(rows) && rows.length) {
      const names = rows.map((r) => String(r.name || "").trim()).filter(Boolean);
      // ensure Sauce exists if you use sauce sub menu
      state.categories = names.length ? names : [...DEFAULT_CATEGORIES];
      // if server returns "Back counter", still display Fountain Drinks (mapping)
      // but keep categories list visible as Fountain Drinks if not present:
      if (!state.categories.some((c) => norm(c) === norm("Fountain Drinks")) && state.categories.some((c) => norm(c) === norm("Back counter"))) {
        state.categories = state.categories.map((c) => (norm(c) === norm("Back counter") ? "Fountain Drinks" : c));
      }
      return;
    }
  } catch {}
  state.categories = [...DEFAULT_CATEGORIES];
}

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

/* ---------- Summary counts (NO 2-3 days) ---------- */
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

  const totalWithExpiry = (state.latestExpiryRows || []).filter((r) => isoDateOnlyFromAny(r.expiry_value || r.expiry || r.expiry_at)).length;
  const allSafe = Math.max(0, totalWithExpiry - expToday - expTomorrow);

  return { expToday, expTomorrow, allSafe };
}

/* ---------- Home counts ---------- */
function categoryCounts() {
  const counts = {};
  for (const c of state.categories) counts[c] = 0;

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

      <button id="btnStart" type="button" class="btn-yellow">
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
      await loadCategories();
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
        ${state.categories.map((cat) => {
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
        const ui = CAT_UI["Sauce"] || {};
        return `
          <button class="mock-tile mock-${escapeHtml(ui.tone || "purple")}" data-sauce="${escapeHtml(s)}" type="button">
            <div class="mock-ico">
              <img src="${escapeHtml(ui.icon || "")}" alt="" loading="lazy" onerror="this.style.opacity=.15" />
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

/* ---------- Expiry dropdown choices (NO 2-3 days) ---------- */
function buildExpiryChoicesForItem(it) {
  const mode = getMode(it);
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  if (mode === "EOD") {
    return [{ type: "EOD", label: "End of day (today)", value: today }];
  }

  if (mode === "HOURLY_FIXED") {
    return [
      { type: "TIME", label: "Select time", value: "" },
      ...FIXED_TIME_SLOTS.map((t) => ({ type: "TIME", label: t, value: t })),
    ];
  }

  if (mode === "MANUAL_DATE") {
    return [{ type: "PICK", label: "Pick Date", value: "" }];
  }

  // AUTO
  return [
    { type: "DATE", label: "Today", value: today },
    { type: "DATE", label: "Tomorrow", value: tomorrow },
    { type: "PICK", label: "Pick Date", value: "" },
  ];
}

/* ---------- Helper text ---------- */
function getInlineHelperText(it) {
  const mode = getMode(it);
  const sl = getShelfLifeDays(it);

  if (mode === "EOD") return "Expiry: End of day (auto).";
  if (mode === "HOURLY_FIXED") return "Expiry: Select fixed time (today).";
  if (mode === "MANUAL_DATE") return "Expiry: Pick a date (manual).";
  if (mode === "AUTO") return `Expiry: Today / Tomorrow / Pick Date (max ${sl} day${sl === 1 ? "" : "s"}).`;
  return "Select expiry.";
}

/* ---------- Render: Category Editor ---------- */
function renderCategoryEditor() {
  updateRolePill();
  updateSessionLine();

  const { category, sauceSub } = state.view;
  const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForCurrentList();
  if (!state.categoryDraft) state.categoryDraft = {};

  // init draft for list
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
                              draft.expType === c.type && String(draft.expValue || "") === String(c.value || "")
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
      <button id="btnSaveCategory" type="button" class="btn-yellow">
        Save ${escapeHtml(title)}
      </button>
      <div id="saveErr" class="error hidden" style="margin-top:10px;"></div>
    </div>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  // bind cards
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

  // save
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

      // validate qty
      if (d.qty != null) {
        const qn = Number(d.qty);
        if (!Number.isFinite(qn) || qn < 0) {
          err.textContent = `Invalid quantity for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
      }

      // build expiry payload
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
        // AUTO
        if (!d.expType) {
          err.textContent = `Select expiry for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
        if (d.expType === "DATE") expiry = d.expValue;
        if (d.expType === "PICK") {
          if (!d.expValue) {
            err.textContent = `Pick a date for "${it.name}".`;
            err.classList.remove("hidden");
            return;
          }
          expiry = d.expValue;
        }
      }

      // shelf-life enforcement (AUTO only)
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
          category: canonicalCategory(it.category),
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
        await sleep(40);
      }

      toast("Saved ✅");
      await loadLatestExpiry();

      // clear drafts for this list
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

/* ---------- Alerts page (Today / Tomorrow / Safe) ---------- */
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
      .map((r) => ({ ...r, _date: isoDateOnlyFromAny(r.expiry_value || r.expiry || r.expiry_at) }))
      .filter((r) => r._date);

    if (filter === "today") rows = rows.filter((r) => r._date === today);
    if (filter === "tomorrow") rows = rows.filter((r) => r._date === tomorrow);
    if (filter === "safe") rows = rows.filter((r) => r._date !== today && r._date !== tomorrow);

    if (!rows.length) {
      wrap.innerHTML = `<div class="muted">No items for this filter.</div>`;
      return;
    }

    // grouped sections
    const todayRows = rows.filter((r) => r._date === today);
    const tomorrowRows = rows.filter((r) => r._date === tomorrow);
    const safeRows = rows.filter((r) => r._date !== today && r._date !== tomorrow);

    function section(title, arr) {
      if (!arr.length) return "";
      return `
        <div class="alert-section">
          <div class="alert-section-title">${escapeHtml(title)}</div>
          ${arr
            .map(
              (r) => `
              <div class="alert-row">
                <div>
                  <div class="alert-name">${escapeHtml(r.name || r.item_name || "")}</div>
                  <div class="alert-extra">${escapeHtml(canonicalCategory(r.category || ""))}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
                </div>
                <div class="alert-date">${escapeHtml(r._date)}</div>
              </div>
            `
            )
            .join("")}
        </div>
      `;
    }

    wrap.innerHTML =
      section("Expiring Today", todayRows) +
      section("Expiring Tomorrow", tomorrowRows) +
      (filter === "safe" || filter === "all" ? section("All Safe", safeRows) : "");
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
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

    <button id="btnPinLogin" type="button" class="btn-yellow">
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
      state.managerModePage = "dashboard";
      setView({ page: "manager" }, true);
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Manager: Dashboard (tidy tiles) ---------- */
function renderManagerDashboard() {
  const { expToday, expTomorrow, allSafe } = computeSummaryCounts();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <section class="manager-panel">
      <div class="summary-row">
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

      <div class="home-h2">Manage</div>

      <div class="mgr-tiles">
        <button class="mgr-tile" id="mgrGoAdd">
          <div class="mgr-t-ico">➕</div>
          <div class="mgr-t-title">Add Item</div>
          <div class="mgr-t-sub">Create a new item</div>
        </button>

        <button class="mgr-tile" id="mgrGoItems">
          <div class="mgr-t-ico">✏️</div>
          <div class="mgr-t-title">Edit Items</div>
          <div class="mgr-t-sub">Search & edit items</div>
        </button>

        <button class="mgr-tile" id="mgrGoCats">
          <div class="mgr-t-ico">🗂️</div>
          <div class="mgr-t-title">Categories</div>
          <div class="mgr-t-sub">Add / edit / delete</div>
        </button>
      </div>
    </section>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  $("#mSumToday").onclick = () => setView({ page: "alerts", filter: "today" }, true);
  $("#mSumTomorrow").onclick = () => setView({ page: "alerts", filter: "tomorrow" }, true);
  $("#mSumSafe").onclick = () => setView({ page: "alerts", filter: "safe" }, true);

  $("#mgrGoAdd").onclick = () => openManagerAddItem();
  $("#mgrGoItems").onclick = () => { state.managerModePage = "items"; renderManager(); };
  $("#mgrGoCats").onclick = () => { state.managerModePage = "categories"; renderManager(); };
}

/* ---------- Manager: Items list editor ---------- */
async function renderManagerItems() {
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Edit Items</div>
    </div>

    <div class="card">
      <div class="card-title">Search</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
      <button id="btnAddItem" type="button" class="btn-yellow" style="margin-top:10px;">
        Add Item
      </button>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div id="mgrList" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn").onclick = () => { state.managerModePage = "dashboard"; renderManager(); };
  $("#btnAddItem").onclick = openManagerAddItem;

  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");

  let rows = [];
  try {
    rows = await apiManager("GET", `/api/manager/items?store=${encodeURIComponent(state.session.store)}`);
  } catch (e) {
    listEl.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
    return;
  }

  function renderRows() {
    const q = norm(searchEl.value || "");
    const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="muted">No matches.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .slice(0, 200)
      .map((r) => {
        const cat = canonicalCategory(r.category);
        const sub = r.sub_category || "";
        const sl = Number(r.shelf_life_days ?? 0);

        return `
          <div class="mgr-item">
            <div class="mgr-item-name">${escapeHtml(r.name)}</div>

            <div class="field">
              <label class="label">Category</label>
              <select class="input mgr-cat" data-id="${r.id}">
                ${state.categories.map((c) => `<option value="${escapeHtml(c)}" ${norm(c) === norm(cat) ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
              <select class="input mgr-sub" data-id="${r.id}">
                <option value="" ${sub ? "" : "selected"}>(none)</option>
                ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${norm(s) === norm(sub) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label class="label">Shelf life (days)</label>
              <input class="input mgr-sl" data-id="${r.id}" inputmode="numeric" value="${escapeHtml(sl)}" />
              <div class="helper">&gt;7 days becomes manual in app.</div>
            </div>

            <div class="mgr-actions">
              <button class="mgr-save btn-yellow" data-id="${r.id}" type="button">Save</button>
              <button class="mgr-del btn-danger" data-id="${r.id}" type="button">Delete</button>
            </div>

            <div class="mgr-err error hidden" data-id="${r.id}"></div>
          </div>
        `;
      })
      .join("");

    // bind save/delete
    $$(".mgr-save", listEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.mgr-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        const catSel = $(`.mgr-cat[data-id="${id}"]`, listEl);
        const subSel = $(`.mgr-sub[data-id="${id}"]`, listEl);
        const slInp = $(`.mgr-sl[data-id="${id}"]`, listEl);

        const category = String(catSel.value || "").trim();
        const sub_category = String(subSel.value || "").trim() || null;
        const shelf_life_days = Number(String(slInp.value || "0").trim());

        const finalSub = norm(category) === norm("Sauce") ? sub_category : null;

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
          await loadItems();
        } catch (e) {
          err.textContent = e.message || "Save failed.";
          err.classList.remove("hidden");
        }
      });
    });

    $$(".mgr-del", listEl).forEach((b) => {
      b.addEventListener("click", async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.mgr-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        if (!confirm("Delete this item? (Soft delete)")) return;

        try {
          await apiManager("DELETE", `/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`);
          toast("Deleted ✅");
          rows = rows.filter((x) => Number(x.id) !== id);
          await loadItems();
          renderRows();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      });
    });
  }

  searchEl.addEventListener("input", renderRows);
  renderRows();
}

/* ---------- Manager: Categories CRUD ---------- */
async function renderManagerCategories() {
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Categories</div>
    </div>

    <div class="card">
      <div class="card-title">Add Category</div>
      <div style="display:flex;gap:10px;">
        <input id="catNewName" class="input" placeholder="Category name" />
        <button id="catAddBtn" class="btn-yellow" type="button" style="width:120px;">Add</button>
      </div>
      <div id="catAddErr" class="error hidden" style="margin-top:8px;"></div>
      <div class="helper" style="margin-top:8px;">Store-separated: PDD categories are separate from SKH.</div>
    </div>

    <div class="card">
      <div class="card-title">Current Categories</div>
      <div id="catList" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn").onclick = () => { state.managerModePage = "dashboard"; renderManager(); };

  const listEl = $("#catList");
  const addErr = $("#catAddErr");
  const addBtn = $("#catAddBtn");
  const nameInp = $("#catNewName");

  // load from server
  let rows = [];
  try {
    rows = await apiManager("GET", `/api/manager/categories?store=${encodeURIComponent(state.session.store)}`);
  } catch (e) {
    listEl.innerHTML = `
      <div class="error">
        Categories endpoints not available yet.<br/>
        (Server needs /api/manager/categories).<br/>
        App will still work using built-in categories.
      </div>
    `;
    return;
  }

  function renderRows() {
    if (!rows.length) {
      listEl.innerHTML = `<div class="muted">No categories.</div>`;
      return;
    }

    listEl.innerHTML = rows
      .map((r) => {
        const name = String(r.name || "").trim();
        return `
          <div class="cat-row">
            <input class="input cat-name" data-id="${r.id}" value="${escapeHtml(canonicalCategory(name))}" />
            <button class="btn-yellow cat-save" data-id="${r.id}" type="button">Save</button>
            <button class="btn-danger cat-del" data-id="${r.id}" type="button">Delete</button>
          </div>
          <div class="cat-err error hidden" data-id="${r.id}"></div>
        `;
      })
      .join("");

    // save
    $$(".cat-save", listEl).forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        const inp = $(`.cat-name[data-id="${id}"]`, listEl);
        const newName = String(inp.value || "").trim();
        if (!newName) {
          err.textContent = "Name required.";
          err.classList.remove("hidden");
          return;
        }

        try {
          await apiManager("PATCH", `/api/manager/categories/${id}`, {
            store: state.session.store,
            name: newName,
          });
          toast("Category saved ✅");
          await loadCategories();
          renderHome(); // refresh counts/tiles names if needed
        } catch (e) {
          err.textContent = e.message || "Save failed.";
          err.classList.remove("hidden");
        }
      };
    });

    // delete
    $$(".cat-del", listEl).forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.getAttribute("data-id"));
        const err = $(`.cat-err[data-id="${id}"]`, listEl);
        err.classList.add("hidden");

        if (!confirm("Delete this category?")) return;

        try {
          await apiManager("DELETE", `/api/manager/categories/${id}?store=${encodeURIComponent(state.session.store)}`);
          toast("Category deleted ✅");
          rows = rows.filter((x) => Number(x.id) !== id);
          await loadCategories();
          renderRows();
        } catch (e) {
          err.textContent = e.message || "Delete failed.";
          err.classList.remove("hidden");
        }
      };
    });
  }

  addBtn.onclick = async () => {
    addErr.classList.add("hidden");
    const name = String(nameInp.value || "").trim();
    if (!name) {
      addErr.textContent = "Name required.";
      addErr.classList.remove("hidden");
      return;
    }

    try {
      const out = await apiManager("POST", "/api/manager/categories", {
        store: state.session.store,
        name,
      });
      rows.unshift(out);
      nameInp.value = "";
      toast("Category added ✅");
      await loadCategories();
      renderRows();
    } catch (e) {
      addErr.textContent = e.message || "Add failed.";
      addErr.classList.remove("hidden");
    }
  };

  renderRows();
}

/* ---------- Manager router ---------- */
async function renderManager() {
  updateRolePill();
  updateSessionLine();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" type="button" class="btn-yellow" style="margin-top:12px;">
          Enter PIN
        </button>
      </div>
    `;
    $("#btnGoLogin").addEventListener("click", openManagerLogin);
    return;
  }

  // ensure expiry summary exists for manager dashboard
  if (!state.latestExpiryRows || !state.latestExpiryRows.length) {
    await loadLatestExpiry();
  }

  if (state.managerModePage === "items") return renderManagerItems();
  if (state.managerModePage === "categories") return renderManagerCategories();
  return renderManagerDashboard();
}

/* ---------- Manager: Add item modal ---------- */
function openManagerAddItem() {
  openModal(
    "Add Item",
    `
    <div class="modal-item-title">New item</div>

    <div class="field">
      <label class="label">Name</label>
      <input id="newName" class="input" placeholder="Item name" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <select id="newCat" class="input">
        ${state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
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

    <button id="btnAddSave" type="button" class="btn-yellow">
      Save
    </button>
  `
  );

  const nameEl = $("#newName", modalBodyEl);
  const catEl = $("#newCat", modalBodyEl);
  const subEl = $("#newSub", modalBodyEl);
  const slEl = $("#newSL", modalBodyEl);
  const err = $("#addErr", modalBodyEl);

  $("#btnAddSave", modalBodyEl).addEventListener("click", async () => {
    err.classList.add("hidden");

    const name = String(nameEl.value || "").trim();
    const category = String(catEl.value || "").trim();
    const sub = String(subEl.value || "").trim() || null;
    const shelf_life_days = Number(String(slEl.value || "0").trim());

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

    const finalSub = norm(category) === norm("Sauce") ? sub : null;

    try {
      await apiManager("POST", "/api/manager/items", {
        store: state.session.store,
        name,
        category,
        sub_category: finalSub,
        shelf_life_days,
      });

      await loadItems();
      closeModal();
      toast("Added ✅");

      // stay in manager
      state.managerModePage = "items";
      setView({ page: "manager" }, true);
    } catch (e) {
      err.textContent = e.message || "Failed";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Logout ---------- */
function doLogout() {
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    updateRolePill();
    state.managerModePage = "dashboard";
    setView({ page: "home", category: null, sauceSub: null }, true);
    return;
  }

  if (!confirm("Logout staff session?")) return;
  state.session = { store: "", shift: "", staff: "" };
  saveSession();
  state.navStack = [];
  state.view = { page: "session", category: null, sauceSub: null };
  render();
}

/* ---------- Render router ---------- */
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

/* ---------- Inject CSS (keep current theme, add needed UI styles) ---------- */
function injectFullCSS() {
  if ($("#precheckFullCss")) return;
  const css = document.createElement("style");
  css.id = "precheckFullCss";
  css.textContent = `
    /* Role pill */
    .role-pill{
      display:inline-flex;align-items:center;gap:10px;
      border:0;border-radius:999px;padding:10px 14px;
      font-weight:1000;cursor:pointer;user-select:none;
    }
    .role-pill--mgr{ background:rgba(229,57,53,.12); color:#b71c1c; }
    .role-pill--staff{ background:rgba(30,136,229,.12); color:#0d47a1; }
    .role-text{ font-weight:1000; }
    .role-ico{ font-size:18px; }

    /* Home */
    .home-mock{padding-bottom:18px}
    .summary-row{
      display:grid;grid-template-columns:1fr 1fr 1fr;
      gap:10px;margin:14px 0 14px
    }
    .sum-card{
      border:0;border-radius:14px;padding:12px 10px;
      box-shadow:0 12px 24px rgba(0,0,0,.10);
      cursor:pointer;text-align:left;
    }
    .sum-num{font-size:26px;font-weight:1100;line-height:1}
    .sum-lbl{margin-top:6px;font-size:12px;font-weight:900;opacity:.9;line-height:1.1}
    .sum-red{background:#ffe6e6;color:#b71c1c}
    .sum-amber{background:#fff2dd;color:#6a3d00}
    .sum-green{background:#e7f7ea;color:#0b5a2a}

    .home-h2{font-weight:1100;font-size:18px;margin:6px 2px 12px}
    .tiles-2col{display:grid;grid-template-columns:1fr 1fr;gap:12px}

    .mock-tile{
      border:0;border-radius:16px;padding:14px;
      box-shadow:0 14px 26px rgba(0,0,0,.12);
      cursor:pointer;text-align:left;min-height:108px;
      position:relative;overflow:hidden;
    }
    .mock-ico{
      width:54px;height:54px;border-radius:16px;
      display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,.24);
      backdrop-filter: blur(4px)
    }
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

    /* Buttons */
    .btn-yellow{
      width:100%;
      border:0;
      border-radius:999px;
      padding:14px 16px;
      font-weight:1000;
      background:var(--yellow, #ffcc00);
      color:#1b1b1b;
      box-shadow:0 12px 22px rgba(0,0,0,0.10);
      cursor:pointer;
    }
    .btn-ghost{
      border:1px solid rgba(0,0,0,0.12);
      background:#fff;
      border-radius:999px;
      padding:10px 14px;
      font-weight:900;
      cursor:pointer;
    }
    .btn-danger{
      border:1px solid rgba(0,0,0,0.12);
      background:#fff;
      color:#c62828;
      border-radius:999px;
      padding:12px 14px;
      font-weight:1000;
      cursor:pointer;
    }

    /* Page head */
    .page-head{display:flex;align-items:center;gap:10px;margin:10px 0 12px}
    .page-title{font-weight:1100;font-size:18px}

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

    /* Alerts */
    .alert-section{margin-top:12px}
    .alert-section-title{font-weight:1100;margin:10px 0 8px}
    .alert-row{
      display:flex;justify-content:space-between;gap:12px;
      padding:12px 0;border-top:1px dashed rgba(0,0,0,0.12)
    }
    .alert-name{font-weight:1100}
    .alert-extra{font-size:12px;opacity:.75;font-weight:800}
    .alert-date{font-weight:1100;color:var(--green-dark, #0b5a2a)}

    /* Manager tiles */
    .mgr-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .mgr-tile{
      border:0;border-radius:16px;padding:14px;
      box-shadow:0 14px 26px rgba(0,0,0,.12);
      background:#fff;
      cursor:pointer;text-align:left;
    }
    .mgr-t-ico{font-size:22px}
    .mgr-t-title{margin-top:10px;font-weight:1100}
    .mgr-t-sub{margin-top:4px;font-size:12px;opacity:.75;font-weight:800}

    .mgr-item{border-top:1px dashed rgba(0,0,0,.12);padding-top:12px;margin-top:12px}
    .mgr-item-name{font-weight:1100;font-size:16px;margin-bottom:10px}
    .mgr-actions{display:flex;gap:10px;margin-top:10px}
    .mgr-actions .btn-yellow{width:auto;flex:1}
    .mgr-actions .btn-danger{width:auto;flex:1}

    /* Category rows */
    .cat-row{display:flex;gap:10px;align-items:center;margin-top:10px}
    .cat-row .input{flex:1}
    .cat-row .btn-yellow{width:110px}
    .cat-row .btn-danger{width:110px}

    /* Drawer close button should be clickable */
    #btnDrawerClose{cursor:pointer}
  `;
  document.head.appendChild(css);
}

/* ---------- Boot ---------- */
async function boot() {
  ensureToast();
  bindModal();
  injectFullCSS();
  bindDrawer();
  bindBackHandling();

  loadSession();
  setManagerToken(getManagerToken());

  // load data if session exists
  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadCategories();
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
    main.innerHTML = `
      <div class="card">
        <div class="h1">Error</div>
        <div class="error">${escapeHtml(e?.message || e)}</div>
      </div>
    `;
  }
});
