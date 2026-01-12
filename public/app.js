/* =========================
   PreCheck — app.js (FULL)
   ========================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const norm = (s) => String(s ?? "").trim().toLowerCase();

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
function fmtDatePretty(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString(undefined, { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/* DOM */
const main = $("#main");
const sessionLine = $("#sessionLine");
const roleHost = $("#roleHost");

const drawerBackdrop = $("#drawerBackdrop");
const btnMenu = $("#btnMenu");
const btnDrawerClose = $("#btnDrawerClose");

const drawerHome = $("#drawerHome");
const drawerAlerts = $("#drawerAlerts");
const drawerManager = $("#drawerManager");
const drawerSummary = $("#drawerSummary");
const drawerWISR = $("#drawerWISR");
const drawerLogout = $("#drawerLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* Constants */
const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];
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

const CAT_UI = {
  "Prepared items": { tone: "t-green", icon: "/assets/cat-icons/prepared.png" },
  "Unopened chiller": { tone: "t-blue", icon: "/assets/cat-icons/unopened.png" },
  "Thawing": { tone: "t-cyan", icon: "/assets/cat-icons/thawing.png" },
  "Vegetables": { tone: "t-green2", icon: "/assets/cat-icons/vegetables.png" },
  "Backroom": { tone: "t-orange", icon: "/assets/cat-icons/backroom.png" },
  "Front counter": { tone: "t-red", icon: "/assets/cat-icons/frontcounter.png" },
  "Back counter chiller": { tone: "t-teal", icon: "/assets/cat-icons/backcounterchiller.png" },
  "Fountain Drinks": { tone: "t-green", icon: "/assets/cat-icons/fountain.png" },
  "Sauce": { tone: "t-purple", icon: "/assets/cat-icons/sauce.png" },
};

const SAUCE_TONES = {
  "Sandwich Unit": "t-purple",
  "Standby": "t-pink",
  "Open Inner": "t-teal",
};

const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([norm("Soup"), norm("Soups")]);

const POPUP_ITEMS = [
  "Mix green",
  "Mac&cheese",
  "Lettuce",
  "Chicken Bacon (C)",
  "Liquid Egg",
  "Flatbread(Thawing)",
  "Avocado",
];

/* State */
const state = {
  session: { store: "", shift: "", staff: "", sessionDay: "" },
  categories: [],
  items: [],
  view: { page: "session", category: null, sauceSub: null, filter: null, scope: null },

  manager: { token: "" },

  navStack: [],
  latestExpiryRows: [],
  latestExpiryRowsPDD: [],
  latestExpiryRowsSKH: [],

  categoryDraft: {},
};

/* Storage */
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session = {
        store: s.store || "",
        shift: s.shift || "",
        staff: s.staff || "",
        sessionDay: s.sessionDay || "",
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

/* Toast */
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1700);
}

/* Modal */
function openModal(title, bodyHtml) {
  modalTitleEl.textContent = title || " ";
  modalBodyEl.innerHTML = bodyHtml || "";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.setAttribute("aria-hidden", "false");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.setAttribute("aria-hidden", "true");
  modalBodyEl.innerHTML = "";
}

/* API */
async function apiJSON(res) { try { return await res.json(); } catch { return null; } }
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
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setManagerToken("");
    updateRoleBadge();
    toast("Manager session expired");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* Midnight auto reset (show popup even without logout) */
function ensureSessionDayFresh() {
  const today = todayISODate();
  if (!state.session.sessionDay) state.session.sessionDay = today;

  if (state.session.sessionDay !== today) {
    state.session.sessionDay = today;
    localStorage.removeItem("popupShownDay"); // force popup again
    saveSession();
  }
}
function shouldShowPopup() {
  const today = todayISODate();
  const seen = localStorage.getItem("popupShownDay") || "";
  return seen !== today;
}
function markPopupShown() {
  localStorage.setItem("popupShownDay", todayISODate());
}

/* Role badge (Manager red / Staff blue) */
function updateRoleBadge() {
  const isMgr = isManagerMode();
  const cls = isMgr ? "manager" : "staff";
  const label = isMgr ? "Manager" : "Staff";
  const ico = isMgr ? "👑" : "🧢";

  roleHost.innerHTML = `
    <div class="role-pill">
      <button id="roleBtn" class="role-btn ${cls}" type="button" aria-label="${label}">
        <span>${label}</span>
        <span class="role-ico" aria-hidden="true">${ico}</span>
      </button>
    </div>
  `;

  $("#roleBtn").addEventListener("click", () => {
    if (isManagerMode()) setView({ page: "manager_dashboard" }, true);
    else openManagerLogin();
  });
}

/* Session line */
function updateSessionLine() {
  const { store, shift, staff } = state.session;
  const line = [store, shift, staff].filter(Boolean).join(" • ");
  sessionLine.classList.toggle("hidden", !line);
  sessionLine.textContent = line || "";
}

/* Drawer */
function openDrawer() {
  drawerBackdrop.classList.remove("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  drawerBackdrop.classList.add("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "true");
}
function bindDrawer() {
  btnMenu.onclick = (e) => { e.preventDefault(); openDrawer(); };
  btnDrawerClose.onclick = (e) => { e.preventDefault(); closeDrawer(); };

  drawerBackdrop.addEventListener("click", (e) => {
    if (e.target === drawerBackdrop) closeDrawer();
  });

  drawerHome.onclick = () => { closeDrawer(); goHome(); };
  drawerAlerts.onclick = () => { closeDrawer(); setView({ page: "alerts" }, true); };
  drawerManager.onclick = () => { closeDrawer(); isManagerMode() ? setView({ page: "manager_dashboard" }, true) : openManagerLogin(); };
  drawerSummary.onclick = () => { closeDrawer(); setView({ page: "summary_cards" }, true); };
  drawerWISR.onclick = () => { closeDrawer(); setView({ page: "wisr" }, true); };
  drawerLogout.onclick = () => { closeDrawer(); doLogout(); };
}

/* Navigation */
function setView(next, push = true) {
  const prev = { ...state.view };
  state.view = { ...state.view, ...next };
  if (push) state.navStack.push(prev);
  try { history.pushState({ t: Date.now() }, ""); } catch {}
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  if (prev) { state.view = prev; render(); return; }
  setView({ page: "home" }, false);
}
function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null, filter: null, scope: null };
  render();
}
function bindBack() {
  window.addEventListener("popstate", () => {
    if (!modalBackdrop.classList.contains("hidden")) { closeModal(); return; }
    if (!drawerBackdrop.classList.contains("hidden")) { closeDrawer(); return; }
    goBack();
  });
  try { history.replaceState({ t: Date.now() }, ""); history.pushState({ t: Date.now() }, ""); } catch {}
}

/* Data */
async function loadCategories() {
  const rows = await apiGet(`/api/categories?store=${encodeURIComponent(state.session.store)}`);
  state.categories = Array.isArray(rows) ? rows.map(r => r.name) : [];
  if (!state.categories.length) state.categories = DEFAULT_CATEGORIES.slice();
}
async function loadItems() {
  const rows = await apiGet(`/api/items?store=${encodeURIComponent(state.session.store)}`);
  state.items = Array.isArray(rows) ? rows : [];
}
async function loadExpiryForStore(store) {
  return await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
}
async function loadExpiry() {
  state.latestExpiryRows = await loadExpiryForStore(state.session.store);

  if (isManagerMode()) {
    const [pdd, skh] = await Promise.allSettled([loadExpiryForStore("PDD"), loadExpiryForStore("SKH")]);
    state.latestExpiryRowsPDD = pdd.status === "fulfilled" ? (pdd.value || []) : [];
    state.latestExpiryRowsSKH = skh.status === "fulfilled" ? (skh.value || []) : [];
  }
}

/* Shelf life / modes */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = String(item.category || "").trim();
  const nameN = norm(item.name);

  if (nameN === norm("Chicken Bacon (C)")) return "EOD";
  if (norm(cat) === norm("Unopened chiller")) return "MANUAL_DATE_ONE";
  if (norm(cat) === norm("Fountain Drinks")) return "MANUAL_DATE_ONE";
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE_ONE";
  return "AUTO";
}

/* Summary counts */
function computeCounts(rows) {
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  let expToday = 0, expTomorrow = 0, safe = 0;
  for (const r of rows || []) {
    const d = isoDateOnlyFromAny(r.expiry_value || r.expiry || r.expiry_at);
    if (!d) continue;
    if (d === today) expToday++;
    else if (d === tomorrow) expTomorrow++;
    else safe++;
  }
  return { expToday, expTomorrow, safe };
}
function countsByCategory() {
  const counts = {};
  for (const c of state.categories) counts[c] = 0;
  for (const it of state.items) {
    const c = String(it.category || "").trim();
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}
function tileHTML(cat, count, delayMs=0) {
  const ui = CAT_UI[cat] || { tone:"t-green", icon:"" };
  return `
    <button class="tile ${ui.tone}" data-cat="${escapeHtml(cat)}" style="animation-delay:${delayMs}ms" type="button">
      <div class="ico">
        <img src="${escapeHtml(ui.icon)}" alt="" loading="lazy" onerror="this.style.opacity=.2" />
      </div>
      <div class="title">${escapeHtml(cat)}</div>
      <div class="sub">${count} item${count===1?"":"s"}</div>
    </button>
  `;
}

/* Pages */
function renderSession() {
  updateRoleBadge();
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

      <button id="btnStart" class="btn-yellow" type="button">Start</button>
      <div id="startErr" class="error hidden"></div>
    </div>
  `;

  $("#storeSel").value = state.session.store || "";
  $("#shiftSel").value = state.session.shift || "";
  $("#staffInp").value = state.session.staff || "";

  $("#btnStart").addEventListener("click", async () => {
    const store = $("#storeSel").value.trim();
    const shift = $("#shiftSel").value.trim();
    const staff = $("#staffInp").value.trim();

    const err = $("#startErr");
    err.classList.add("hidden");

    if (!store || !shift || !staff) {
      err.textContent = "Please select Store, Shift and Staff.";
      err.classList.remove("hidden");
      return;
    }

    state.session = { store, shift, staff, sessionDay: todayISODate() };
    saveSession();
    localStorage.removeItem("popupShownDay");

    try {
      await loadCategories();
      await loadItems();
      await loadExpiry();
      state.view = { page:"home" };
      render();
      maybeShowChecklistPopup();
    } catch (e) {
      err.textContent = e.message || "Failed to load.";
      err.classList.remove("hidden");
    }
  });
}

function renderHome() {
  updateRoleBadge(); updateSessionLine();
  const counts = countsByCategory();
  const { expToday, expTomorrow, safe } = computeCounts(state.latestExpiryRows);

  main.innerHTML = `
    <section>
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
          <div class="sum-num">${safe}</div>
          <div class="sum-lbl">All<br/>Safe</div>
        </button>
      </div>

      <div class="h1" style="margin:6px 2px 12px;">Tap a Category</div>

      <div class="tiles-2col" id="catTiles">
        ${state.categories.map((cat, i) => tileHTML(cat, counts[cat] || 0, i*55)).join("")}
      </div>
    </section>
  `;

  $("#sumToday").onclick = () => setView({ page:"summary_list", filter:"today", scope:"store" }, true);
  $("#sumTomorrow").onclick = () => setView({ page:"summary_list", filter:"tomorrow", scope:"store" }, true);
  $("#sumSafe").onclick = () => setView({ page:"summary_list", filter:"safe", scope:"store" }, true);

  $$("[data-cat]", main).forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.getAttribute("data-cat");
      if (cat === "Sauce") setView({ page:"sauce_menu", category:"Sauce" }, true);
      else setView({ page:"category", category:cat, sauceSub:null }, true);
    });
  });
}

function renderSauceMenu() {
  updateRoleBadge(); updateSessionLine();
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <div class="tiles-2col">
      ${SAUCE_SUBS.map((s, i) => {
        const tone = SAUCE_TONES[s] || "t-purple";
        return `
          <button class="tile ${tone}" data-sauce="${escapeHtml(s)}" style="animation-delay:${i*60}ms" type="button">
            <div class="ico">
              <img src="/assets/cat-icons/sauce.png" alt="" loading="lazy" />
            </div>
            <div class="title">${escapeHtml(s)}</div>
            <div class="sub">Tap to view items</div>
          </button>
        `;
      }).join("")}
    </div>
  `;
  $("#backBtn").onclick = () => goBack();
  $$("[data-sauce]", main).forEach((b) => {
    b.onclick = () => setView({ page:"category", category:"Sauce", sauceSub:b.getAttribute("data-sauce") }, true);
  });
}

function itemsForCurrentList() {
  const cat = state.view.category;
  const sub = state.view.sauceSub;

  let list = state.items.filter((it) => norm(it.category) === norm(cat));
  if (cat === "Sauce") list = list.filter((it) => norm(it.sub_category || "") === norm(sub || ""));

  list.sort((a,b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

function buildChoices(it) {
  const mode = getMode(it);
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  if (mode === "EOD") return [{ type:"EOD", label:"End of day (today)", value:today }];
  if (mode === "HOURLY_FIXED") {
    return [{ type:"TIME", label:"Pick Time (Today)", value:"" }, ...FIXED_TIME_SLOTS.map(t => ({type:"TIME", label:t, value:t}))];
  }
  return [
    { type:"DATE", label:`Today • ${fmtDatePretty(today)}`, value:today },
    { type:"DATE", label:`Tomorrow • ${fmtDatePretty(tomorrow)}`, value:tomorrow },
    { type:"PICK", label:"Pick Date", value:"" },
  ];
}
function helperText(it) {
  const mode = getMode(it);
  if (mode === "EOD") return "Expiry: End of day (auto).";
  if (mode === "HOURLY_FIXED") return "Expiry: Select fixed time (today).";
  if (mode === "MANUAL_DATE_ONE") return "Expiry: Pick a date (manual).";
  const sl = getShelfLifeDays(it);
  return `Expiry: Today / Tomorrow / Pick Date (max ${sl} day${sl===1?"":"s"}).`;
}

function cardHTML(it, delayMs) {
  const id = Number(it.id);
  if (!state.categoryDraft[id]) state.categoryDraft[id] = { qty:null, expMode:"", expValue:"", pick:"" };
  const d = state.categoryDraft[id];
  const mode = getMode(it);
  const qtyShown = d.qty == null ? "" : String(d.qty);

  if (mode === "MANUAL_DATE_ONE") {
    return `
      <div class="edit-card" data-item="${id}" style="animation-delay:${delayMs}ms">
        <div class="edit-name">${escapeHtml(it.name)}</div>
        <div class="edit-row">
          <div class="qty-stepper">
            <button class="qty-btn" data-act="dec" type="button">−</button>
            <input class="qty-inp" inputmode="numeric" value="${escapeHtml(qtyShown)}" />
            <button class="qty-btn" data-act="inc" type="button">+</button>
          </div>
          <div class="exp-wrap">
            <input class="input exp-date-only" type="date" value="${escapeHtml(d.expValue || "")}" />
          </div>
        </div>
        <div class="edit-helper">Expiry: Pick a date (manual).</div>
      </div>
    `;
  }

  const choices = buildChoices(it);
  const selected = d.expMode ? `${d.expMode}::${d.expValue || ""}` : "";
  const showPick = d.expMode === "PICK";
  const pickVal = showPick ? (d.pick || "") : "";

  return `
    <div class="edit-card" data-item="${id}" style="animation-delay:${delayMs}ms">
      <div class="edit-name">${escapeHtml(it.name)}</div>
      <div class="edit-row">
        <div class="qty-stepper">
          <button class="qty-btn" data-act="dec" type="button">−</button>
          <input class="qty-inp" inputmode="numeric" value="${escapeHtml(qtyShown)}" />
          <button class="qty-btn" data-act="inc" type="button">+</button>
        </div>

        <div class="exp-wrap">
          <select class="input exp-sel">
            <option value="">Select</option>
            ${choices.map((c) => {
              const key = `${c.type}::${c.value || ""}`;
              const sel = key === selected ? "selected" : "";
              return `<option value="${escapeHtml(key)}" ${sel}>${escapeHtml(c.label)}</option>`;
            }).join("")}
          </select>

          <input class="input exp-pick ${showPick ? "" : "hidden"}" type="date" value="${escapeHtml(pickVal)}" />
        </div>
      </div>

      <div class="edit-helper">${escapeHtml(helperText(it))}</div>
    </div>
  `;
}

function bindCard(card) {
  const id = Number(card.getAttribute("data-item"));
  const d = state.categoryDraft[id];
  const qtyInp = $(".qty-inp", card);
  const decBtn = $(`[data-act="dec"]`, card);
  const incBtn = $(`[data-act="inc"]`, card);

  const setQty = (v) => {
    if (v === "" || v == null) { d.qty = null; qtyInp.value = ""; return; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return;
    d.qty = n;
    qtyInp.value = String(n);
  };
  decBtn.onclick = () => setQty(Math.max(0, (d.qty ?? 0) - 1));
  incBtn.onclick = () => setQty((d.qty ?? 0) + 1);
  qtyInp.oninput = () => setQty(String(qtyInp.value || "").trim());

  const dateOnly = $(".exp-date-only", card);
  if (dateOnly) {
    dateOnly.onchange = () => { d.expMode = "MANUAL"; d.expValue = String(dateOnly.value || "").trim(); };
    return;
  }

  const sel = $(".exp-sel", card);
  const pick = $(".exp-pick", card);

  sel.onchange = () => {
    const v = String(sel.value || "");
    if (!v) { d.expMode=""; d.expValue=""; d.pick=""; pick.classList.add("hidden"); pick.value=""; return; }
    const [t,val] = v.split("::");
    d.expMode = t || "";
    d.expValue = val || "";
    if (d.expMode === "PICK") { pick.classList.remove("hidden"); d.pick=""; pick.value=""; }
    else { pick.classList.add("hidden"); d.pick=""; pick.value=""; }
  };
  pick.onchange = () => { d.pick = String(pick.value || "").trim(); };
}

function renderCategory() {
  updateRoleBadge(); updateSessionLine();
  const cat = state.view.category;
  const sub = state.view.sauceSub;
  const title = cat === "Sauce" ? `Sauce • ${sub}` : cat;

  const list = itemsForCurrentList();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <section class="edit-list">
      ${list.length ? list.map((it, i) => cardHTML(it, i*35)).join("") : `<div class="card"><div class="muted">No items found.</div></div>`}
    </section>

    <div class="save-bar">
      <button id="btnSave" class="btn-yellow" type="button">Save ${escapeHtml(title)}</button>
      <div id="saveErr" class="error hidden"></div>
    </div>
  `;

  $("#backBtn").onclick = () => goBack();
  $$(".edit-card", main).forEach((card) => bindCard(card));
  $("#btnSave").onclick = () => saveCategory(list);
}

async function saveCategory(list) {
  const err = $("#saveErr");
  err.classList.add("hidden");
  err.textContent = "";

  const rows = [];
  const today = todayISODate();

  for (const it of list) {
    const d = state.categoryDraft[it.id];
    if (!d) continue;

    const hasQty = d.qty != null && Number.isFinite(Number(d.qty));
    const hasExp = !!(d.expMode || d.expValue || d.pick);
    if (!hasQty && !hasExp) continue;

    let expiry = null;
    let expiry_at = null;
    const mode = getMode(it);

    if (mode === "EOD") {
      expiry_at = toISOAtLocalEndOfDay(today);
    } else if (mode === "HOURLY_FIXED") {
      if (d.expMode !== "TIME" || !d.expValue) {
        err.textContent = `Select time for "${it.name}".`;
        err.classList.remove("hidden");
        return;
      }
      expiry_at = toISOAtLocalTime(today, d.expValue);
    } else if (mode === "MANUAL_DATE_ONE") {
      if (!d.expValue) {
        err.textContent = `Pick a date for "${it.name}".`;
        err.classList.remove("hidden");
        return;
      }
      expiry = d.expValue;
    } else {
      if (!d.expMode) {
        err.textContent = `Select expiry for "${it.name}".`;
        err.classList.remove("hidden");
        return;
      }
      if (d.expMode === "DATE") expiry = d.expValue;
      if (d.expMode === "PICK") {
        if (!d.pick) {
          err.textContent = `Pick a date for "${it.name}".`;
          err.classList.remove("hidden");
          return;
        }
        expiry = d.pick;
      }
    }

    if (expiry && mode === "AUTO") {
      const sl = getShelfLifeDays(it);
      const maxDate = addDaysISODate(today, Math.max(0, sl || 0));
      if (expiry < today || expiry > maxDate) {
        err.textContent = `"${it.name}" must be between ${fmtDatePretty(today)} and ${fmtDatePretty(maxDate)}.`;
        err.classList.remove("hidden");
        return;
      }
    }

    rows.push({
      item_id: it.id,
      item_name: it.name,
      category: it.category,
      sub_category: it.sub_category || null,
      quantity: d.qty == null ? null : Number(d.qty),
      expiry: expiry || null,
      expiry_at: expiry_at || null,
    });
  }

  if (!rows.length) { toast("Nothing to save"); return; }

  try {
    $("#btnSave").disabled = true;

    await apiPost("/api/log/batch", {
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,
      rows,
    });

    toast("Saved ✅");

    for (const it of list) state.categoryDraft[it.id] = { qty:null, expMode:"", expValue:"", pick:"" };

    await loadExpiry();
    render();
  } catch (e) {
    err.textContent = e.message || "Save failed.";
    err.classList.remove("hidden");
  } finally {
    $("#btnSave").disabled = false;
  }
}

/* Summary pages */
function summaryCard(label, cls, num, filter, scope) {
  return `
    <button class="sum-card ${cls}" data-sum="1" data-filter="${escapeHtml(filter)}" data-scope="${escapeHtml(scope)}" type="button">
      <div class="sum-num">${num}</div>
      <div class="sum-lbl">${escapeHtml(label)}</div>
    </button>
  `;
}

function renderSummaryCards() {
  updateRoleBadge(); updateSessionLine();
  const isMgr = isManagerMode();

  const rowsStore = state.latestExpiryRows || [];
  const rowsPDD = state.latestExpiryRowsPDD || [];
  const rowsSKH = state.latestExpiryRowsSKH || [];

  const countsStore = computeCounts(rowsStore);
  const countsPDD = computeCounts(rowsPDD);
  const countsSKH = computeCounts(rowsSKH);

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Summary</div>
    </div>

    ${!isMgr ? `
      <div class="summary-row">
        ${summaryCard("Expiring Today", "sum-red", countsStore.expToday, "today", "store")}
        ${summaryCard("Expiring Tomorrow", "sum-amber", countsStore.expTomorrow, "tomorrow", "store")}
        ${summaryCard("All Safe", "sum-green", countsStore.safe, "safe", "store")}
      </div>
      <div class="card"><div class="muted">Store: <b>${escapeHtml(state.session.store)}</b></div></div>
    ` : `
      <div class="card" style="margin-bottom:12px;">
        <div class="h1">Manager Summary (Both Stores)</div>
        <div class="muted">Tap a card to see details.</div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div style="font-weight:1200;margin-bottom:10px;">PDD</div>
        <div class="summary-row">
          ${summaryCard("Today", "sum-red", countsPDD.expToday, "today", "PDD")}
          ${summaryCard("Tomorrow", "sum-amber", countsPDD.expTomorrow, "tomorrow", "PDD")}
          ${summaryCard("Safe", "sum-green", countsPDD.safe, "safe", "PDD")}
        </div>
      </div>

      <div class="card">
        <div style="font-weight:1200;margin-bottom:10px;">SKH</div>
        <div class="summary-row">
          ${summaryCard("Today", "sum-red", countsSKH.expToday, "today", "SKH")}
          ${summaryCard("Tomorrow", "sum-amber", countsSKH.expTomorrow, "tomorrow", "SKH")}
          ${summaryCard("Safe", "sum-green", countsSKH.safe, "safe", "SKH")}
        </div>
      </div>
    `}
  `;

  $("#backBtn").onclick = () => goBack();
  $$("[data-sum]", main).forEach((b) => {
    b.onclick = () => {
      const filter = b.getAttribute("data-filter");
      const scope = b.getAttribute("data-scope");
      setView({ page:"summary_list", filter, scope }, true);
    };
  });
}

function renderSummaryList() {
  updateRoleBadge(); updateSessionLine();

  const filter = state.view.filter || "all";
  const scope = state.view.scope || "store";
  const today = todayISODate();
  const tomorrow = addDaysISODate(today, 1);

  let rows = [];
  if (scope === "store") rows = state.latestExpiryRows || [];
  else if (scope === "PDD") rows = state.latestExpiryRowsPDD || [];
  else if (scope === "SKH") rows = state.latestExpiryRowsSKH || [];

  rows = rows
    .map((r) => ({
      ...r,
      _date: isoDateOnlyFromAny(r.expiry_value || r.expiry || r.expiry_at),
      _qty: r.quantity ?? null,
    }))
    .filter((r) => r._date);

  if (filter === "today") rows = rows.filter((r) => r._date === today);
  if (filter === "tomorrow") rows = rows.filter((r) => r._date === tomorrow);
  if (filter === "safe") rows = rows.filter((r) => r._date !== today && r._date !== tomorrow);

  const title = `${scope === "store" ? state.session.store : scope} • ${filter.toUpperCase()}`;

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <div class="card">
      <div class="muted">Latest expiry per item.</div>
      <div style="margin-top:12px;">
        ${rows.length ? rows.map(r => `
          <div class="alert-row">
            <div>
              <div class="alert-name">${escapeHtml(r.name)}</div>
              <div class="alert-extra">${escapeHtml(r.category)}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:1200;color:var(--green-dark)">${escapeHtml(fmtDatePretty(r._date))}</div>
              ${r._qty != null ? `<div class="alert-extra">Qty: ${escapeHtml(r._qty)}</div>` : ``}
            </div>
          </div>
        `).join("") : `<div class="muted">No items for this filter.</div>`}
      </div>
    </div>
  `;

  $("#backBtn").onclick = () => goBack();
}

/* Alerts + WISR placeholder */
function renderAlerts() {
  updateRoleBadge(); updateSessionLine();
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>
    <div class="card">
      <div class="muted">Reserved for future alert rules.</div>
    </div>
  `;
  $("#backBtn").onclick = () => goBack();
}
function renderWISR() {
  updateRoleBadge(); updateSessionLine();
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">WISR Count</div>
    </div>
    <div class="card">
      <div class="muted">Blank for now. You will provide data later.</div>
    </div>
  `;
  $("#backBtn").onclick = () => goBack();
}

/* Manager */
function openManagerLogin() {
  openModal("Manager Access", `
    <div class="field">
      <label class="label">Enter PIN</label>
      <input id="pinInp" class="input" inputmode="numeric" placeholder="PIN" />
      <div class="muted" style="margin-top:6px;font-weight:900;">Manager only.</div>
    </div>

    <div id="pinErr" class="error hidden"></div>
    <button id="btnPinLogin" class="btn-yellow" type="button">Login</button>
  `);

  $("#pinInp", modalBodyEl).focus();

  $("#btnPinLogin", modalBodyEl).onclick = async () => {
    const pin = ($("#pinInp", modalBodyEl).value || "").trim();
    const err = $("#pinErr", modalBodyEl);
    err.classList.add("hidden");

    if (!pin) { err.textContent="PIN required."; err.classList.remove("hidden"); return; }

    try {
      const out = await apiPost("/api/manager/login", { pin, store: state.session.store });
      setManagerToken(out.token || "");
      closeModal();
      toast("Manager mode ✅");
      await loadExpiry();
      updateRoleBadge();
      setView({ page:"manager_dashboard" }, true);
    } catch (e) {
      err.textContent = e.message || "Login failed.";
      err.classList.remove("hidden");
    }
  };
}

async function downloadLogs() {
  const store = state.session.store;
  const token = getManagerToken();
  const url = `/api/manager/logs/download?store=${encodeURIComponent(store)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { toast("Download failed"); return; }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `precheck_logs_${store}_${todayISODate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Download started");
}

function renderManagerDashboard() {
  updateRoleBadge(); updateSessionLine();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" class="btn-yellow" style="margin-top:12px" type="button">Enter PIN</button>
      </div>
    `;
    $("#btnGoLogin").onclick = openManagerLogin;
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="summary-row">
      <button class="sum-card sum-red" id="mgrSum" type="button">
        <div class="sum-num">📊</div>
        <div class="sum-lbl">Summary</div>
      </button>
      <button class="sum-card sum-amber" id="mgrDownload" type="button">
        <div class="sum-num">⬇️</div>
        <div class="sum-lbl">Download<br/>Log</div>
      </button>
      <button class="sum-card sum-green" id="mgrWISR" type="button">
        <div class="sum-num">🧾</div>
        <div class="sum-lbl">WISR<br/>Count</div>
      </button>
    </div>

    <div class="card">
      <div class="muted">More manager editing tiles will be added in next patch (if you want).</div>
    </div>
  `;

  $("#backBtn").onclick = () => goBack();
  $("#mgrSum").onclick = () => setView({ page:"summary_cards" }, true);
  $("#mgrDownload").onclick = () => downloadLogs();
  $("#mgrWISR").onclick = () => setView({ page:"wisr" }, true);
}

/* Popup checklist */
function maybeShowChecklistPopup() {
  ensureSessionDayFresh();
  if (!shouldShowPopup()) return;

  openModal("PLEASE check the expiry date", `
    <div class="popup-title">PLEASE check the expiry date of the items below:</div>
    <div class="popup-lead">Store: <b>${escapeHtml(state.session.store)}</b></div>

    <ul class="popup-list">
      ${POPUP_ITEMS.map(x => `<li><span class="popup-dot"></span><span>${escapeHtml(x)}</span></li>`).join("")}
    </ul>

    <button id="btnPopupOk" class="btn-yellow" style="margin-top:12px" type="button">OK</button>
  `);

  $("#btnPopupOk", modalBodyEl).onclick = () => {
    markPopupShown();
    closeModal();
  };
}

/* Logout */
function doLogout() {
  if (isManagerMode()) {
    if (!confirm("Exit manager mode?")) return;
    setManagerToken("");
    toast("Back to staff mode");
    updateRoleBadge();
    setView({ page:"home" }, false);
    return;
  }
  if (!confirm("Logout staff session?")) return;
  state.session = { store:"", shift:"", staff:"", sessionDay:"" };
  saveSession();
  localStorage.removeItem("popupShownDay");
  state.navStack = [];
  state.view = { page:"session" };
  render();
}

/* Router */
async function render() {
  ensureSessionDayFresh();
  updateRoleBadge();
  updateSessionLine();

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!hasSession && state.view.page !== "session") state.view = { page:"session" };

  switch (state.view.page) {
    case "session": return renderSession();
    case "home": return renderHome();
    case "sauce_menu": return renderSauceMenu();
    case "category": return renderCategory();
    case "alerts": return renderAlerts();
    case "summary_cards": return renderSummaryCards();
    case "summary_list": return renderSummaryList();
    case "wisr": return renderWISR();
    case "manager_dashboard": return renderManagerDashboard();
    default:
      state.view = { page:"home" };
      return renderHome();
  }
}

/* Boot */
async function boot() {
  modalCloseBtn.onclick = closeModal;
  modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

  bindDrawer();
  bindBack();

  loadSession();
  setManagerToken(getManagerToken());
  ensureSessionDayFresh();

  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadCategories();
      await loadItems();
      await loadExpiry();
      state.view = { page:"home" };
      render();
      maybeShowChecklistPopup();
    } catch {
      state.view = { page:"session" };
      render();
    }
  } else {
    state.view = { page:"session" };
    render();
  }
}

boot().catch((e) => {
  console.error(e);
  main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(e?.message || e)}</div></div>`;
});
