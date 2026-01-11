/* =========================
   PreCheck — app.js (FULL)
   Home = mock-style summary + wide tiles
   No bottom nav; left drawer menu
   Summary pages: Expiring Today/Tomorrow/2-3 Days/Safe
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
function norm(s) { return String(s ?? "").trim().toLowerCase(); }
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
function daysBetweenISO(aISO, bISO) {
  const a = new Date(`${aISO}T00:00:00`).getTime();
  const b = new Date(`${bISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}
function parseExpiryValueToISODate(v) {
  // v may be "YYYY-MM-DD" or ISO datetime
  const s = String(v || "").trim();
  if (!s) return "";
  // date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // datetime -> take local date
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
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

/* ---------- Constants ---------- */
const DEFAULT_CATEGORIES = [
  "Prepared items",
  "Unopened chiller",
  "Thawing",
  "Vegetables",
  "Backroom",
  "Fountain Drinks",          // changed from Back counter
  "Front counter",
  "Back counter chiller",
  "Sauce",
];

const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

const FIXED_TIME_SLOTS = ["11:00", "15:00", "19:00", "23:00"];
const HOURLY_FIXED_ITEMS = new Set([ norm("Soup"), norm("Soups") ]);

const MANUAL_ALWAYS = new Set([]);

/* ---------- UI meta ---------- */
const TILE_META = {
  "Prepared items": { tone: "t-green",  ico: "🥪" },
  "Unopened chiller": { tone: "t-blue", ico: "🧊" },
  "Thawing": { tone: "t-teal", ico: "💧" },
  "Vegetables": { tone: "t-lime", ico: "🥬" },
  "Backroom": { tone: "t-orange", ico: "📦" },
  "Fountain Drinks": { tone: "t-yellow", ico: "🥤" },
  "Front counter": { tone: "t-red", ico: "🧾" },
  "Back counter chiller": { tone: "t-teal", ico: "🧀" },
  "Sauce": { tone: "t-purple", ico: "🧴" },
};

/* ---------- DOM ---------- */
const main = $("#main");
const sessionLine = $("#sessionLine");
const rolePill = $("#rolePill");

const btnMenu = $("#btnMenu");
const drawerBackdrop = $("#drawerBackdrop");
const btnDrawerClose = $("#btnDrawerClose");
const drawerHome = $("#drawerHome");
const drawerAlerts = $("#drawerAlerts");
const drawerManager = $("#drawerManager");
const drawerLogout = $("#drawerLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

/* ---------- State ---------- */
const state = {
  session: { store: "", shift: "", staff: "" },
  items: [],
  categories: [], // optional (if you add categories table later)
  view: { page: "session", category: null, sauceSub: null, summaryType: null },
  manager: { token: "" },
  navStack: [],
  expiryCache: null, // cached result from /api/expiry?store=
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
  setTimeout(() => t.classList.add("hidden"), 1600);
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

/* ---------- Drawer ---------- */
function openDrawer() {
  drawerBackdrop.classList.remove("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  drawerBackdrop.classList.add("hidden");
  drawerBackdrop.setAttribute("aria-hidden", "true");
}
function bindDrawer() {
  if (!drawerBackdrop) return;

  btnMenu?.addEventListener("click", openDrawer);
  btnDrawerClose?.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", (e) => {
    if (e.target === drawerBackdrop) closeDrawer();
  });

  drawerHome?.addEventListener("click", () => {
    closeDrawer();
    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null, summaryType: null };
    render();
  });

  drawerAlerts?.addEventListener("click", () => {
    closeDrawer();
    setView({ page: "alerts", category: null, sauceSub: null, summaryType: null }, true);
  });

  drawerManager?.addEventListener("click", () => {
    closeDrawer();
    if (isManagerMode()) setView({ page: "manager" }, true);
    else openManagerLogin();
  });

  drawerLogout?.addEventListener("click", () => {
    closeDrawer();

    if (isManagerMode()) {
      if (!confirm("Exit manager mode?")) return;
      setManagerToken("");
      toast("Back to staff mode");
      state.view = { page: "home", category: null, sauceSub: null, summaryType: null };
      render();
      return;
    }

    if (!confirm("Logout staff session?")) return;
    state.session = { store: "", shift: "", staff: "" };
    saveSession();
    state.navStack = [];
    state.view = { page: "session", category: null, sauceSub: null, summaryType: null };
    render();
  });
}

/* ---------- API ---------- */
async function apiJSON(res) {
  try { return await res.json(); } catch { return null; }
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
    updateTopRolePill();
    toast("Manager session expired. Login again.");
    throw new Error("unauthorized");
  }

  const data = await apiJSON(res);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

/* ---------- Expiry mode / helper ---------- */
function getShelfLifeDays(item) {
  const v = Number(item.shelf_life_days ?? item.shelfLifeDays ?? 0);
  return Number.isFinite(v) ? v : 0;
}
function getMode(item) {
  const cat = String(item.category || "").trim();
  const nameN = norm(item.name);

  if (nameN === norm("Chicken Bacon (C)")) return "EOD";
  if (cat === "Unopened chiller") return "MANUAL_DATE";
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";
  return "AUTO";
}
function getHelperText(it) {
  const mode = getMode(it);
  const sl = getShelfLifeDays(it);

  if (mode === "EOD") return "Expiry: End of day (auto).";
  if (mode === "HOURLY_FIXED") return "Expiry: Select fixed time (today).";
  if (mode === "MANUAL_DATE") return "Expiry: Staff sets date (manual).";
  if (mode === "AUTO") return `Expiry: Select date (0–${sl} day${sl === 1 ? "" : "s"}).`;
  return "Select expiry.";
}

/* ---------- Top role pill + session line ---------- */
function updateTopRolePill() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  if (!rolePill) return;

  rolePill.classList.toggle("hidden", !hasSession);

  // show ONLY one role (fix your issue)
  if (isManagerMode()) {
    rolePill.classList.remove("staff");
    rolePill.classList.add("manager");
    rolePill.innerHTML = `<span class="dot"></span><span>MANAGER</span><span aria-hidden="true">👑</span>`;
  } else {
    rolePill.classList.remove("manager");
    rolePill.classList.add("staff");
    rolePill.innerHTML = `<span class="dot"></span><span>STAFF</span><span aria-hidden="true">🧢</span>`;
  }
}
function updateSessionLine() {
  if (!sessionLine) return;
  const { store, shift, staff } = state.session;
  const line = [store, shift, staff].filter(Boolean).join(" • ");
  sessionLine.textContent = line || "";
  sessionLine.classList.toggle("hidden", !line);
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
  if (prev) { state.view = prev; render(); return; }
  if (confirm("Exit PreCheck?")) return;
  try { history.pushState({ t: Date.now() }, ""); } catch {}
}

/* ---------- Swipe back (optional) ---------- */
function bindSwipeBack() {
  let sx = 0, sy = 0, st = 0;

  window.addEventListener("touchstart", (e) => {
    if (!e.touches || !e.touches[0]) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    st = Date.now();
  }, { passive: true });

  window.addEventListener("touchend", (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const dt = Date.now() - st;
    if (dx > 70 && Math.abs(dy) < 45 && dt < 600) {
      const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
      const drawerOpen = drawerBackdrop && !drawerBackdrop.classList.contains("hidden");
      if (modalOpen || drawerOpen) return;
      goBack();
    }
  }, { passive: true });

  window.addEventListener("popstate", () => {
    const modalOpen = modalBackdrop && !modalBackdrop.classList.contains("hidden");
    const drawerOpen = drawerBackdrop && !drawerBackdrop.classList.contains("hidden");
    if (modalOpen) { closeModal(); return; }
    if (drawerOpen) { closeDrawer(); return; }
    goBack();
  });

  try {
    history.replaceState({ t: Date.now() }, "");
    history.pushState({ t: Date.now() }, "");
  } catch {}
}

/* ---------- Data load ---------- */
async function loadItems() {
  // expects server filters by store OR returns store field. safest: use store query.
  const store = encodeURIComponent(state.session.store);
  const rows = await apiGet(`/api/items?store=${store}`);
  state.items = (rows || []).map((x) => ({
    ...x,
    category: String(x.category || "").trim(),
    sub_category: x.sub_category ?? null,
  }));
}
function getCategoriesList() {
  // If later you have /api/categories?store= you can plug it in.
  // For now: derive from DEFAULT list (as your app already does).
  return DEFAULT_CATEGORIES.slice();
}

/* ---------- Counts ---------- */
function categoryCounts() {
  const cats = getCategoriesList();
  const counts = {};
  for (const c of cats) counts[c] = 0;
  for (const it of state.items) {
    const c = String(it.category || "").trim();
    if (counts[c] == null) counts[c] = 0;
    counts[c]++;
  }
  return counts;
}

/* ---------- Expiry summary ---------- */
async function loadExpirySummaryRows() {
  if (state.expiryCache) return state.expiryCache;
  const store = encodeURIComponent(state.session.store);
  // expected: [{name, category, sub_category, expiry_value}]
  const rows = await apiGet(`/api/expiry?store=${store}`);
  state.expiryCache = Array.isArray(rows) ? rows : [];
  return state.expiryCache;
}
function splitExpiryBuckets(rows) {
  const today = todayISODate();
  const out = { today: [], tomorrow: [], days23: [], safe: [] };

  for (const r of rows) {
    const iso = parseExpiryValueToISODate(r.expiry_value);
    if (!iso) { out.safe.push(r); continue; }

    const d = daysBetweenISO(today, iso);
    if (d <= 0) out.today.push(r);
    else if (d === 1) out.tomorrow.push(r);
    else if (d === 2 || d === 3) out.days23.push(r);
    else out.safe.push(r);
  }

  // stable sort
  const bySoon = (a, b) => {
    const da = parseExpiryValueToISODate(a.expiry_value);
    const db = parseExpiryValueToISODate(b.expiry_value);
    return String(da).localeCompare(String(db)) || norm(a.name).localeCompare(norm(b.name));
  };
  out.today.sort(bySoon);
  out.tomorrow.sort(bySoon);
  out.days23.sort(bySoon);
  out.safe.sort(bySoon);

  return out;
}

/* ---------- Render: Session ---------- */
function renderSession() {
  updateSessionLine();
  updateTopRolePill();

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

      <button id="btnStart" type="button" class="btn btn-primary" style="width:100%;padding:14px 16px;">
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
    state.expiryCache = null;

    try {
      await loadItems();
    } catch (e) {
      err.textContent = `Failed to load items: ${e.message || e}`;
      err.classList.remove("hidden");
      return;
    }

    state.navStack = [];
    state.view = { page: "home", category: null, sauceSub: null, summaryType: null };
    render();
  });
}

/* ---------- Render: Home (mock-style) ---------- */
async function renderHome() {
  updateSessionLine();
  updateTopRolePill();

  const counts = categoryCounts();

  main.innerHTML = `
    <section class="home-shell">
      <div class="home-head">
        <div class="home-title">Tap a Category to Manage Items</div>
        <div class="home-sub">Summary shows your latest logged expiry per item.</div>
      </div>

      <div id="summaryStrip" class="summary-strip">
        <div class="summary-card red" data-sum="today">
          <div class="summary-num">…</div>
          <div class="summary-lab">Expiring Today</div>
        </div>
        <div class="summary-card orange" data-sum="tomorrow">
          <div class="summary-num">…</div>
          <div class="summary-lab">Expiring Tomorrow</div>
        </div>
        <div class="summary-card yellow" data-sum="days23">
          <div class="summary-num">…</div>
          <div class="summary-lab">Expiring 2–3 Days</div>
        </div>
        <div class="summary-card green" data-sum="safe">
          <div class="summary-num">…</div>
          <div class="summary-lab">All Safe</div>
        </div>
      </div>

      <div class="tile-grid" id="tileGrid">
        ${getCategoriesList().map((cat) => {
          const meta = TILE_META[cat] || { tone:"t-green", ico:"📦" };
          const n = counts[cat] ?? 0;
          return `
            <button class="tile-wide ${meta.tone}" type="button" data-cat="${escapeHtml(cat)}">
              <div class="ico" aria-hidden="true">${meta.ico}</div>
              <div class="txt">
                <div class="name">${escapeHtml(cat)}</div>
                <div class="count">${n} item${n === 1 ? "" : "s"}</div>
              </div>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;

  // Summary click -> list page
  $$("[data-sum]", main).forEach((el) => {
    el.addEventListener("click", () => {
      const t = el.getAttribute("data-sum");
      setView({ page: "summary", summaryType: t }, true);
    });
  });

  // Category tile click
  $$("[data-cat]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") setView({ page: "sauce_menu", category: "Sauce", sauceSub: null }, true);
      else setView({ page: "category", category: cat, sauceSub: null }, true);
    });
  });

  // Fill summary numbers
  try {
    const rows = await loadExpirySummaryRows();
    const buckets = splitExpiryBuckets(rows);
    $("#summaryStrip .summary-card.red .summary-num").textContent = String(buckets.today.length);
    $("#summaryStrip .summary-card.orange .summary-num").textContent = String(buckets.tomorrow.length);
    $("#summaryStrip .summary-card.yellow .summary-num").textContent = String(buckets.days23.length);
    $("#summaryStrip .summary-card.green .summary-num").textContent = String(buckets.safe.length);
  } catch {
    // keep …
  }
}

/* ---------- Render: Summary list ---------- */
async function renderSummary() {
  updateSessionLine();
  updateTopRolePill();

  const type = state.view.summaryType || "today";

  const titleMap = {
    today: "Expiring Today",
    tomorrow: "Expiring Tomorrow",
    days23: "Expiring 2–3 Days",
    safe: "All Safe",
  };
  const title = titleMap[type] || "Summary";

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <div class="card">
      <div id="sumWrap" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  const wrap = $("#sumWrap");
  try {
    const rows = await loadExpirySummaryRows();
    const buckets = splitExpiryBuckets(rows);
    const list = buckets[type] || [];

    if (!list.length) {
      wrap.innerHTML = `<div class="muted">No items.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="list">
        ${list.map((r) => {
          const exp = r.expiry_value || "-";
          const sub = r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : "";
          return `
            <div class="list-row" style="cursor:default">
              <div>
                <div class="list-row-title">${escapeHtml(r.name)}</div>
                <div class="list-row-sub">${escapeHtml(r.category || "")}${sub}</div>
              </div>
              <div style="font-weight:1000;color:var(--green-dark)">${escapeHtml(exp)}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Render: Sauce menu ---------- */
function renderSauceMenu() {
  updateSessionLine();
  updateTopRolePill();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <div class="tile-grid">
      ${SAUCE_SUBS.map((s) => {
        const meta = TILE_META["Sauce"];
        return `
          <button class="tile-wide ${meta.tone}" data-sauce="${escapeHtml(s)}" type="button">
            <div class="ico" aria-hidden="true">${meta.ico}</div>
            <div class="txt">
              <div class="name">${escapeHtml(s)}</div>
              <div class="count">Tap to view items</div>
            </div>
          </button>
        `;
      }).join("")}
    </div>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  $$("[data-sauce]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
    });
  });
}

/* ---------- Category list + log modal ---------- */
function getItemsForCurrentList() {
  const { category, sauceSub } = state.view;

  let list = state.items.filter((it) => norm(it.category) === norm(category));
  if (category === "Sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }
  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}
function renderCategoryList() {
  updateSessionLine();
  updateTopRolePill();

  const { category, sauceSub } = state.view;
  const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForCurrentList();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <section class="list">
      ${
        list.length
          ? list.map((it) => `
              <button class="list-row" data-item-id="${it.id}" type="button">
                <div>
                  <div class="list-row-title">${escapeHtml(it.name)}</div>
                  <div class="list-row-sub">${escapeHtml(getHelperText(it))}</div>
                </div>
                <div class="chev">›</div>
              </button>
            `).join("")
          : `<div class="empty">No items found.</div>`
      }
    </section>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  $$("[data-item-id]", main).forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const it = state.items.find((x) => Number(x.id) === id);
      if (!it) return;
      openLogModal(it);
    });
  });
}

function openLogModal(item) {
  const mode = getMode(item);
  const sl = getShelfLifeDays(item);
  const today = todayISODate();

  let expiryHtml = "";
  if (mode === "MANUAL_DATE") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <input id="expDate" class="input" type="date" />
        <div class="helper">Select expiry date.</div>
      </div>
    `;
  } else if (mode === "HOURLY_FIXED") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Time (Today)</label>
        <select id="expTime" class="input">
          <option value="">Select time</option>
          ${FIXED_TIME_SLOTS.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <div class="helper">Fixed time dropdown (today).</div>
      </div>
    `;
  } else if (mode === "EOD") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry</label>
        <div class="input" style="display:flex;align-items:center;justify-content:space-between;">
          <span>End of day (today)</span>
          <span style="font-weight:1000;color:var(--green-dark);">${escapeHtml(today)}</span>
        </div>
        <div class="helper">Auto-set to 23:59 today.</div>
      </div>
    `;
  } else {
    const opts = [];
    const max = Math.max(0, sl || 0);
    for (let i = 0; i <= max; i++) {
      const d = addDaysISODate(today, i);
      opts.push(`<option value="${d}">${d}</option>`);
    }
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <select id="expSelect" class="input">
          <option value="">Select date</option>
          ${opts.join("")}
        </select>
        <div class="helper">Auto dropdown based on shelf life.</div>
      </div>
    `;
  }

  openModal(
    "Log Item",
    `
    <div class="modal-item-title">${escapeHtml(item.name)}</div>

    <div class="field">
      <label class="label">Quantity (optional)</label>
      <input id="qtyInp" class="input" inputmode="numeric" placeholder="Leave blank if not needed" />
      <div class="helper">Blank allowed.</div>
    </div>

    ${expiryHtml}

    <div id="logErr" class="error hidden"></div>

    <button id="btnSaveLog" type="button"
      class="btn btn-primary" style="margin-top:6px;width:100%;padding:14px 16px;">
      Save
    </button>
  `
  );

  const qtyInp = $("#qtyInp", modalBodyEl);
  const expDate = $("#expDate", modalBodyEl);
  const expSelect = $("#expSelect", modalBodyEl);
  const expTime = $("#expTime", modalBodyEl);
  const err = $("#logErr", modalBodyEl);
  const btnSave = $("#btnSaveLog", modalBodyEl);

  btnSave.addEventListener("click", async () => {
    err.classList.add("hidden");

    const qtyRaw = (qtyInp?.value || "").trim();
    const qty = qtyRaw === "" ? null : Number(qtyRaw);
    if (qtyRaw !== "" && (!Number.isFinite(qty) || qty < 0)) {
      err.textContent = "Quantity must be a number (or blank).";
      err.classList.remove("hidden");
      return;
    }

    let expiry_date = "";
    let expiry_at = null;

    if (mode === "MANUAL_DATE") {
      expiry_date = (expDate?.value || "").trim();
      if (!expiry_date) {
        err.textContent = "Expiry required.";
        err.classList.remove("hidden");
        return;
      }
    } else if (mode === "HOURLY_FIXED") {
      const t = (expTime?.value || "").trim();
      if (!t) {
        err.textContent = "Expiry time required.";
        err.classList.remove("hidden");
        return;
      }
      expiry_at = toISOAtLocalTime(today, t);
    } else if (mode === "EOD") {
      expiry_at = toISOAtLocalEndOfDay(today);
    } else {
      expiry_date = (expSelect?.value || "").trim();
      if (!expiry_date) {
        err.textContent = "Expiry required.";
        err.classList.remove("hidden");
        return;
      }
    }

    const payload = {
      item_id: item.id,
      item_name: item.name,
      category: String(item.category || "").trim(),
      sub_category: item.sub_category || null,
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,
      quantity: qty,
      expiry: expiry_date || null,
      expiry_at: expiry_at || null,
      created_at: new Date().toISOString(),
    };

    try {
      await apiPost("/api/log", payload);
      closeModal();
      toast("Saved ✅");
      state.expiryCache = null; // refresh summary next time
    } catch (e) {
      err.textContent = e?.message || "Save failed.";
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Alerts ---------- */
async function renderAlerts() {
  updateSessionLine();
  updateTopRolePill();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="muted">Latest expiry for this store.</div>
      <div id="alertsWrap" class="muted" style="margin-top:12px;">Loading...</div>
    </div>
  `;
  $("#backBtn").addEventListener("click", () => goBack());

  const wrap = $("#alertsWrap");
  try {
    const store = encodeURIComponent(state.session.store);
    const rows = await apiGet(`/api/expiry?store=${store}`);
    state.expiryCache = Array.isArray(rows) ? rows : [];

    if (!rows || !rows.length) {
      wrap.innerHTML = `<div class="muted">No logged expiry yet.</div>`;
      return;
    }

    wrap.innerHTML = `
      ${rows.map((r) => `
        <div style="border-bottom:1px dashed rgba(0,0,0,0.10);padding:10px 0;display:flex;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-weight:1000">${escapeHtml(r.name)}</div>
            <div class="muted">${escapeHtml(r.category)}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
          </div>
          <div style="font-weight:1000;color:var(--green-dark)">${escapeHtml(r.expiry_value || "-")}</div>
        </div>
      `).join("")}
    `;
  } catch (e) {
    wrap.innerHTML = `<div class="error">Failed: ${escapeHtml(e.message || e)}</div>`;
  }
}

/* ---------- Manager login + page (kept from your current logic) ---------- */
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

    <button id="btnPinLogin" type="button" class="btn btn-primary" style="width:100%;padding:14px 16px;">
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
      state.view = { page: "manager" };
      render();
    } catch (e) {
      err.textContent = e?.message || "Login failed.";
      err.classList.remove("hidden");
    }
  });
}

async function renderManager() {
  updateSessionLine();
  updateTopRolePill();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="page-head">
        <button id="backBtn" class="btn" type="button">← Back</button>
        <div class="page-title">Manager</div>
      </div>

      <div class="card">
        <div class="muted">Login required.</div>
        <button id="btnGoLogin" type="button" class="btn btn-primary" style="margin-top:12px;width:100%;padding:14px 16px;">
          Enter PIN
        </button>
      </div>
    `;
    $("#backBtn").addEventListener("click", () => goBack());
    $("#btnGoLogin").addEventListener("click", openManagerLogin);
    return;
  }

  // Keep your existing manager page (items CRUD) – you can extend categories later.
  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div class="muted">
        Manager can (current):
        <ul style="margin:8px 0 0 18px;">
          <li>Edit item category / sauce sub-category / shelf life</li>
          <li>Add new item</li>
          <li>Soft delete item</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Search</div>
      <input id="mgrSearch" class="input" placeholder="Type item name..." />
      <button id="btnAddItem" type="button" class="btn btn-primary" style="margin-top:10px;width:100%;padding:14px 16px;">
        Add Item
      </button>
    </div>

    <div class="card">
      <div class="card-title">Items</div>
      <div id="mgrList" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", () => goBack());

  const listEl = $("#mgrList");
  const searchEl = $("#mgrSearch");

  let rows = [];
  try {
    const store = encodeURIComponent(state.session.store);
    rows = await apiManager("GET", `/api/manager/items?store=${store}`);
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

    const cats = getCategoriesList();

    listEl.innerHTML = filtered.slice(0, 200).map((r) => {
      const sub = r.sub_category || "";
      const sl = Number(r.shelf_life_days ?? 0);

      return `
        <div style="border-top:1px dashed rgba(0,0,0,0.10);padding-top:12px;margin-top:12px;">
          <div style="font-weight:1000;font-size:16px;margin-bottom:10px;">${escapeHtml(r.name)}</div>

          <div class="field">
            <label class="label">Category</label>
            <select class="input mgr-cat" data-id="${r.id}">
              ${cats.map((c) => `<option value="${escapeHtml(c)}" ${norm(c) === norm(r.category) ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
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
          </div>

          <div style="display:flex;gap:10px;">
            <button class="mgr-save btn btn-primary" data-id="${r.id}" type="button" style="flex:1;">
              Save
            </button>
            <button class="mgr-del btn" data-id="${r.id}" type="button" style="flex:1;color:#c62828;">
              Delete
            </button>
          </div>

          <div class="mgr-err error hidden" data-id="${r.id}"></div>
        </div>
      `;
    }).join("");

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
          state.expiryCache = null;
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
        if (!confirm("Soft delete this item?")) return;

        try {
          await apiManager("DELETE", `/api/manager/items/${id}`, { store: state.session.store });
          toast("Deleted ✅");
          rows = rows.filter((x) => Number(x.id) !== id);
          await loadItems();
          state.expiryCache = null;
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

/* ---------- Render router ---------- */
async function render() {
  if (!main) return;

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  updateSessionLine();
  updateTopRolePill();

  if (!hasSession && state.view.page !== "session") {
    state.view = { page: "session", category: null, sauceSub: null, summaryType: null };
  }

  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "summary") return renderSummary();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategoryList();
  if (page === "alerts") return renderAlerts();
  if (page === "manager") return renderManager();

  state.view = { page: "home", category: null, sauceSub: null, summaryType: null };
  return renderHome();
}

/* ---------- Boot ---------- */
async function boot() {
  ensureToast();
  bindModal();
  bindDrawer();
  bindSwipeBack();

  loadSession();
  setManagerToken(getManagerToken());

  // role pill click: open drawer (simple)
  rolePill?.addEventListener("click", openDrawer);

  if (state.session.store && state.session.shift && state.session.staff) {
    try {
      await loadItems();
      state.view = { page: "home", category: null, sauceSub: null, summaryType: null };
    } catch {
      state.view = { page: "session", category: null, sauceSub: null, summaryType: null };
    }
  } else {
    state.view = { page: "session", category: null, sauceSub: null, summaryType: null };
  }

  render();
}

boot().catch((e) => {
  console.error(e);
  if (main) {
    main.innerHTML = `<div class="card"><div class="h1">Error</div><div class="error">${escapeHtml(e?.message || e)}</div></div>`;
  }
});
