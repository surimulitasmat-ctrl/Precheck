/* PreCheck app.js (single-file, safe copy/paste) */

const $ = (sel, root = document) => root.querySelector(sel);

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateLabel(d) {
  // "24 May 2026"
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function isoLocal(d) {
  // ISO without Z, for Postgres timestamptz parsing in most setups
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:${pad2(d.getSeconds())}`;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return d;
}

// ---------- DOM (SAFE) ----------
const main = $("#main");

const sessionPill = $("#sessionPill");
const btnHome = $("#btnHome");
const btnAlerts = $("#btnAlerts");
const btnLogout = $("#btnLogout");

const modalBackdrop = $("#modalBackdrop");
const modalTitleEl = $("#modalTitle");
const modalBodyEl = $("#modalBody");
const modalCloseBtn = $("#modalClose");

// ---------- State ----------
const state = {
  session: { store: "", shift: "", staff: "" },
  items: [],
  view: { page: "session", category: null, sauceSub: null },
  alerts: [],
  lowStock: [],
  managerItems: [],
  managerSearch: "",
};

// ---------- Constants ----------
const CATEGORIES = [
  "Prepared items",
  "Unopened chiller",
  "Thawing",
  "Vegetables",
  "Backroom",
  "Back counter",
  "Front counter",
  "Back counter chiller",
  "Sauce",
];

const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

// Home tile look (emoji + your css tones)
const TILE_META = {
  "Prepared items": { tone: "green", icon: "🥪" },
  "Unopened chiller": { tone: "blue", icon: "🧊" },
  Thawing: { tone: "cyan", icon: "❄️" },
  Vegetables: { tone: "lime", icon: "🥬" },
  Backroom: { tone: "orange", icon: "📦" },
  "Back counter": { tone: "yellow", icon: "🧂" },
  "Front counter": { tone: "red", icon: "🧾" },
  "Back counter chiller": { tone: "teal", icon: "🧀" },
  Sauce: { tone: "purple", icon: "🧴" },
};

// Items that must be manual DATE only (no time)
const MANUAL_ALWAYS = new Set(
  [
    "canola oil",
    "salt open inner",
    "pepper open inner",
    "olive open bottle",
    "parmesan oregano",
    "shallot",
    "honey oat",
    "parmesan open inner",
    "shallot open inner",
    "honey oat open inner",
    "salt",
    "pepper",
    "cookies",
    "olive oil",
    "milo",
    "tea bag",
  ].map(norm)
);

// HOURLY_FIXED items (time dropdown 11/3/7/11)
const HOURLY_FIXED_ITEMS = new Set([norm("Bread"), norm("Tomato Soup (H)"), norm("Mushroom Soup (H)")]);

// HOURLY_FIXED options
const HOURLY_FIXED_OPTIONS = [
  { label: "11:00 AM", value: "11:00" },
  { label: "3:00 PM", value: "15:00" },
  { label: "7:00 PM", value: "19:00" },
  { label: "11:00 PM", value: "23:00" },
];

// ---------- Modal (SAFE fallback if modal missing) ----------
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

if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const existing = $("#toast");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "toast";
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

// ---------- Manager token ----------
function getManagerToken() {
  return localStorage.getItem("managerToken") || "";
}
function setManagerToken(token) {
  if (token) localStorage.setItem("managerToken", token);
  else localStorage.removeItem("managerToken");
}
function isManagerMode() {
  return !!getManagerToken();
}

// ---------- API helpers ----------
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return await res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
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
    updateTopbar();
    updateSessionPill();
    alert("Manager session expired. Please login again.");
    state.view = { page: "home", category: null, sauceSub: null };
    render();
    throw new Error("unauthorized");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

// ---------- Session ----------
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if (s && typeof s === "object") {
      state.session.store = s.store || "";
      state.session.shift = s.shift || "";
      state.session.staff = s.staff || "";
    }
  } catch {}
}

function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

// ---------- UI helpers ----------
function badgeHtml(text, bg) {
  return `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:4px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:900;
      color:#fff;
      background:${bg};
      box-shadow:0 6px 14px rgba(0,0,0,0.12);
      margin-right:8px;
      ">
      ${text}
    </span>
  `;
}

function updateSessionPill() {
  if (!sessionPill) return;

  const store = state.session.store || "";
  const shift = state.session.shift || "";
  const staff = state.session.staff || "";

  const staffBadge = badgeHtml("STAFF", "#1E88E5"); // blue
  const managerBadge = isManagerMode() ? badgeHtml("MANAGER", "#E53935") : ""; // red

  const parts = [];
  if (store) parts.push(store);
  if (shift) parts.push(shift);
  if (staff) parts.push(staff);

  sessionPill.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
      ${managerBadge}${staffBadge}
    </div>
    <div style="font-weight:900;font-size:14px">${escapeHtml(parts.join(" • ") || "No session yet")}</div>
  `;
  sessionPill.classList.remove("hidden");
}

function updateTopbar() {
  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  if (btnHome) btnHome.classList.toggle("hidden", !hasSession);
  if (btnAlerts) btnAlerts.classList.toggle("hidden", !hasSession);

  if (btnLogout) {
    btnLogout.textContent = isManagerMode() ? "Exit Manager" : "Logout";
    btnLogout.classList.toggle("hidden", !hasSession && !isManagerMode());
  }
}

// Bind top buttons (SAFE)
function bindTopButtons() {
  const homeBtn = document.getElementById("btnHome");
  const alertsBtn = document.getElementById("btnAlerts");
  const logoutBtn = document.getElementById("btnLogout");

  if (!homeBtn || !alertsBtn || !logoutBtn) {
    console.warn("[PreCheck] Topbar buttons not ready");
    return;
  }

  // prevent double binding
  if (homeBtn.dataset.bound === "1") return;
  homeBtn.dataset.bound = "1";
  alertsBtn.dataset.bound = "1";
  logoutBtn.dataset.bound = "1";

  homeBtn.addEventListener("click", () => {
    navTo({ page: "home", category: null, sauceSub: null });
  });

  alertsBtn.addEventListener("click", () => {
    navTo({ page: "alerts", category: null, sauceSub: null });
  });

  logoutBtn.addEventListener("click", () => {
    if (isManagerMode()) {
      if (!confirm("Exit manager mode?")) return;
      setManagerToken("");
      updateTopbar();
      updateSessionPill();
      navTo({ page: "home", category: null, sauceSub: null });
      return;
    }

    if (!confirm("Logout staff session?")) return;
    state.session = { store: "", shift: "", staff: "" };
    saveSession();
    updateTopbar();
    updateSessionPill();
    navTo({ page: "session", category: null, sauceSub: null });
  });
}

// ---------- Navigation + Swipe back ----------
const viewStack = [];
function sameView(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function navTo(view) {
  if (!sameView(state.view, view)) viewStack.push(state.view);
  state.view = view;
  render();
}
function navBack() {
  const prev = viewStack.pop();
  if (!prev) {
    // at root – prevent accidental close
    if (confirm("Exit PreCheck?")) history.back();
    return;
  }
  state.view = prev;
  render();
}

(function enableSwipeBack() {
  let x0 = null;
  let y0 = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      x0 = t.clientX;
      y0 = t.clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (x0 == null || y0 == null) return;
      const t = e.changedTouches?.[0];
      if (!t) return;

      const dx = t.clientX - x0;
      const dy = t.clientY - y0;

      x0 = null;
      y0 = null;

      // horizontal swipe
      if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
        // swipe right = back
        if (dx > 0) {
          // if modal open, close it first
          if (hasModal() && !modalBackdrop.classList.contains("hidden")) {
            closeModal();
            return;
          }
          navBack();
        }
      }
    },
    { passive: true }
  );
})();

// ---------- Categories ----------
function canonicalCategory(cat) {
  const c = String(cat ?? "").trim();
  const n = norm(c);

  if (n === "back counter chiller") return "Back counter chiller";
  if (n === "front counter") return "Front counter";
  if (n === "back counter") return "Back counter";
  if (n === "prepared items" || n === "prepared item" || n === "prepared items ") return "Prepared items";
  if (n === "unopened chiller") return "Unopened chiller";
  if (n === "sauce" || n === "sauces") return "Sauce";
  if (n === "vegetables") return "Vegetables";
  if (n === "thawing") return "Thawing";
  if (n === "backroom") return "Backroom";

  const hit = CATEGORIES.find((x) => norm(x) === n);
  return hit || c || "Unknown";
}

function getItemsForCategory(category, sauceSub) {
  let list = state.items
    .map((it) => ({
      ...it,
      category: canonicalCategory(it.category),
      sub_category: it.sub_category ?? null,
    }))
    .filter((it) => norm(it.category) === norm(category));

  if (norm(category) === "sauce") {
    list = list.filter((it) => norm(it.sub_category || "") === norm(sauceSub || ""));
  }

  // Beef Taco Front counter SKH-only (hide for PDD)
  if (norm(category) === "front counter") {
    list = list.filter((it) => {
      const nameN = norm(it.name);
      const isBeefTaco = nameN.includes("beef taco");
      if (!isBeefTaco) return true;
      return norm(state.session.store) === "skh";
    });
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

// ---------- Expiry mode logic (DATE ONLY manual) ----------
function getShelfLifeDays(item) {
  const n = Number(item?.shelf_life_days);
  return Number.isFinite(n) ? n : 0;
}

function getMode(item) {
  const cat = canonicalCategory(item.category);
  const nameN = norm(item.name);

  // Unopened chiller always manual DATE
  if (norm(cat) === norm("Unopened chiller")) return "MANUAL_DATE";

  // Always manual list
  if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

  // Cajun Spice Open Inner AUTO 5 days
  if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

  // HOURLY_FIXED items
  if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

  // Chicken Bacon (C) is EOD ONLY (exact)
  if (nameN === norm("Chicken Bacon (C)")) return "EOD";

  // Front counter Beef Taco treated as HOURLY (SKH only)
  if (norm(cat) === norm("Front counter") && nameN.includes("beef taco")) return "HOURLY";

  // Shelf life > 7 must be manual DATE
  const sl = getShelfLifeDays(item);
  if (sl > 7) return "MANUAL_DATE";

  // Default AUTO
  return "AUTO";
}

function getHelperText(item) {
  const mode = getMode(item);
  if (mode === "AUTO") return "Select expiry date";
  if (mode === "MANUAL_DATE") return "Enter expiry date";
  if (mode === "EOD") return "Expiry will be set to end of day";
  if (mode === "HOURLY_FIXED") return "Select expiry time (11am / 3pm / 7pm / 11pm)";
  if (mode === "HOURLY") return "Select expiry time";
  return "";
}

// ---------- Build expiry controls ----------
function buildAutoDateOptions(item) {
  const base = todayStart();
  let sl = getShelfLifeDays(item);

  // Cajun Spice Open Inner override
  if (norm(item.name) === norm("Cajun Spice Open Inner")) sl = 5;

  const options = [];
  const count = Math.max(0, sl) + 1; // N+1 (Today..Today+N)

  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    options.push({ label: formatDateLabel(d), value: d.toISOString().slice(0, 10) }); // YYYY-MM-DD
  }
  return options;
}

function buildHourlyOptions() {
  // 30-min steps
  const out = [];
  for (let h = 0; h < 24; h++) {
    out.push({ label: `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`, value: `${pad2(h)}:00` });
    out.push({ label: `${((h + 11) % 12) + 1}:30 ${h < 12 ? "AM" : "PM"}`, value: `${pad2(h)}:30` });
  }
  return out;
}

// ---------- Logging modal ----------
async function openLogModal(item) {
  const mode = getMode(item);
  const helper = getHelperText(item);

  let expiryHtml = "";
  const today = todayStart();

  if (mode === "AUTO") {
    const opts = buildAutoDateOptions(item);
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <select id="expirySelect" class="input">
          <option value="">Select date</option>
          ${opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  } else if (mode === "MANUAL_DATE") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Date</label>
        <input id="expiryDate" class="input" type="date" />
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  } else if (mode === "EOD") {
    expiryHtml = `
      <div class="pill">
        <div style="font-weight:900">Expiry</div>
        <div class="helper">${escapeHtml(helper)}</div>
        <div style="margin-top:8px;font-weight:900">${escapeHtml(formatDateLabel(endOfDay(today)))}, 11:59 PM</div>
      </div>
    `;
  } else if (mode === "HOURLY_FIXED") {
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Time</label>
        <select id="expiryTimeFixed" class="input">
          <option value="">Select time</option>
          ${HOURLY_FIXED_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join(
            ""
          )}
        </select>
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  } else if (mode === "HOURLY") {
    const opts = buildHourlyOptions();
    expiryHtml = `
      <div class="field">
        <label class="label">Expiry Time</label>
        <select id="expiryTime" class="input">
          <option value="">Select time</option>
          ${opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="helper">${escapeHtml(helper)}</div>
      </div>
    `;
  }

  const body = `
    <div class="modal-item-title">${escapeHtml(item.name)}</div>

    <div class="field">
      <label class="label">Quantity (optional)</label>
      <input id="qtyInput" class="input" type="number" inputmode="numeric" placeholder="Leave blank if not needed" />
      <div class="helper">Blank allowed. 0 allowed.</div>
    </div>

    ${expiryHtml}

    <div id="logErr" class="error hidden"></div>

    <div style="display:flex;gap:10px;margin-top:14px;">
      <button id="btnSaveLog" class="btn btn-primary" type="button" style="flex:1;">Save</button>
      <button id="btnCancelLog" class="btn btn-ghost" type="button" style="flex:1;">Cancel</button>
    </div>
  `;

  openModal("Log Item", body);

  const errEl = $("#logErr", modalBodyEl);

  $("#btnCancelLog", modalBodyEl)?.addEventListener("click", closeModal);

  $("#btnSaveLog", modalBodyEl)?.addEventListener("click", async () => {
    try {
      if (errEl) errEl.classList.add("hidden");

      const qtyRaw = $("#qtyInput", modalBodyEl)?.value ?? "";
      const quantity = qtyRaw === "" ? null : Number(qtyRaw);

      // quantity never blocks save
      const store = state.session.store;
      const staff = state.session.staff;
      const shift = state.session.shift;

      let expiryAt = null; // ISO datetime string
      let expiryLabel = "";

      if (mode === "AUTO") {
        const v = $("#expirySelect", modalBodyEl)?.value ?? "";
        if (!v) throw new Error("expiry_required");
        const d = new Date(v + "T00:00:00");
        expiryAt = isoLocal(endOfDay(d));
        expiryLabel = formatDateLabel(d);
      }

      if (mode === "MANUAL_DATE") {
        const v = $("#expiryDate", modalBodyEl)?.value ?? "";
        if (!v) throw new Error("expiry_required");
        const d = new Date(v + "T00:00:00");
        expiryAt = isoLocal(endOfDay(d));
        expiryLabel = formatDateLabel(d);
      }

      if (mode === "EOD") {
        expiryAt = isoLocal(endOfDay(todayStart()));
        expiryLabel = formatDateLabel(todayStart()) + " 11:59 PM";
      }

      if (mode === "HOURLY_FIXED") {
        const t = $("#expiryTimeFixed", modalBodyEl)?.value ?? "";
        if (!t) throw new Error("expiry_required");
        const d = new Date(todayStart());
        const [hh, mm] = t.split(":").map(Number);
        d.setHours(hh, mm, 0, 0);
        expiryAt = isoLocal(d);
        expiryLabel = `${formatDateLabel(d)} ${pad2(hh)}:${pad2(mm)}`;
      }

      if (mode === "HOURLY") {
        const t = $("#expiryTime", modalBodyEl)?.value ?? "";
        if (!t) throw new Error("expiry_required");
        const d = new Date(todayStart());
        const [hh, mm] = t.split(":").map(Number);
        d.setHours(hh, mm, 0, 0);
        // Past time allowed (no blocking)
        expiryAt = isoLocal(d);
        expiryLabel = `${formatDateLabel(d)} ${pad2(hh)}:${pad2(mm)}`;
      }

      // Safety: must have expiryAt unless EOD created it
      if (!expiryAt) throw new Error("expiry_required");

      const payload = {
        item_id: item.id,
        item_name: item.name,
        category: canonicalCategory(item.category),
        sub_category: item.sub_category ?? null,
        store,
        staff,
        shift,
        quantity,
        qty: quantity,
        expiry_at: expiryAt,
        expiry: expiryLabel,
        created_at: isoLocal(new Date()),
      };

      await apiPost("/api/log", payload);

      closeModal();
      toast("Saved");
    } catch (e) {
      const msg =
        e?.message === "expiry_required" || e === "expiry_required"
          ? "Expiry required"
          : e?.message || "Save failed";
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove("hidden");
      } else {
        alert(msg);
      }
    }
  });
}

// ---------- Data loading ----------
async function loadItems() {
  const rows = await apiGet("/api/items");
  state.items = Array.isArray(rows) ? rows : [];
}

// expiry + low stock
async function loadAlerts() {
  const store = state.session.store;
  if (!store) return;

  // expiry
  try {
    state.alerts = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
  } catch {
    state.alerts = [];
  }

  // low stock (optional)
  try {
    state.lowStock = await apiGet(`/api/low_stock?store=${encodeURIComponent(store)}`);
  } catch {
    state.lowStock = [];
  }
}

// manager items
async function loadManagerItems() {
  const out = await apiManager("GET", "/api/manager/items");
  state.managerItems = Array.isArray(out) ? out : [];
}

// ---------- Views ----------
function renderSession() {
  updateTopbar();
  updateSessionPill();

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
        <input id="staffInp" class="input" placeholder="Name / ID" />
      </div>

      <div id="sessErr" class="error hidden"></div>

      <button id="btnStart" class="btn btn-primary" type="button" style="width:100%;margin-top:10px;">
        Continue
      </button>

      <div style="display:flex;gap:10px;margin-top:12px;">
        <button id="btnManager" class="btn btn-ghost" type="button" style="flex:1;">Manager</button>
        <button id="btnReload" class="btn btn-ghost" type="button" style="flex:1;">Reload Items</button>
      </div>
    </div>
  `;

  const storeSel = $("#storeSel");
  const shiftSel = $("#shiftSel");
  const staffInp = $("#staffInp");
  const errEl = $("#sessErr");

  // prefill
  if (storeSel) storeSel.value = state.session.store || "";
  if (shiftSel) shiftSel.value = state.session.shift || "";
  if (staffInp) staffInp.value = state.session.staff || "";

  $("#btnStart")?.addEventListener("click", async () => {
    try {
      errEl?.classList.add("hidden");

      const store = storeSel?.value || "";
      const shift = shiftSel?.value || "";
      const staff = (staffInp?.value || "").trim();

      if (!store || !shift || !staff) throw new Error("Please fill Store, Shift, Staff.");

      state.session = { store, shift, staff };
      saveSession();

      updateTopbar();
      updateSessionPill();

      navTo({ page: "home", category: null, sauceSub: null });
    } catch (e) {
      if (errEl) {
        errEl.textContent = e?.message || "Session error";
        errEl.classList.remove("hidden");
      } else {
        alert(e?.message || "Session error");
      }
    }
  });

  $("#btnReload")?.addEventListener("click", async () => {
    try {
      await loadItems();
      toast("Items refreshed");
    } catch {
      toast("Failed to load items");
    }
  });

  $("#btnManager")?.addEventListener("click", () => {
    openManagerLogin();
  });
}

function getCategoryCounts() {
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;

  for (const it of state.items) {
    const cat = canonicalCategory(it.category);
    if (!counts.hasOwnProperty(cat)) continue;

    // Beef taco in front counter counts SKH only
    if (norm(cat) === norm("Front counter")) {
      if (norm(it.name).includes("beef taco") && norm(state.session.store) !== "skh") continue;
    }

    counts[cat] += 1;
  }
  return counts;
}

function renderHome() {
  updateTopbar();
  updateSessionPill();

  const counts = getCategoryCounts();

  main.innerHTML = `
    <section class="home-surface">
      <div class="home-title">Categories</div>

      <section class="grid tiles-grid">
        ${CATEGORIES.map((cat) => {
          const meta = TILE_META[cat] || { tone: "green", icon: "✅" };
          const count = counts[cat] ?? 0;

          return `
            <button class="tile tile--${meta.tone}" data-cat="${escapeHtml(cat)}" type="button">
              <div class="tile-top">
                <div class="tile-icon" aria-hidden="true">${meta.icon}</div>
              </div>
              <div class="tile-title">${escapeHtml(cat)}</div>
              <div class="tile-sub">${count} item${count === 1 ? "" : "s"}</div>
            </button>
          `;
        }).join("")}
      </section>

      <div style="margin-top:14px;display:flex;gap:10px;">
        <button id="btnHomeManager" class="btn btn-ghost" type="button" style="flex:1;">Manager</button>
        <button id="btnHomeRefresh" class="btn btn-ghost" type="button" style="flex:1;">Refresh</button>
      </div>
    </section>
  `;

  $("#btnHomeRefresh")?.addEventListener("click", async () => {
    try {
      await loadItems();
      toast("Refreshed");
      renderHome();
    } catch {
      toast("Failed");
    }
  });

  $("#btnHomeManager")?.addEventListener("click", () => {
    if (isManagerMode()) {
      navTo({ page: "manager", category: null, sauceSub: null });
    } else {
      openManagerLogin();
    }
  });

  main.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") navTo({ page: "sauce_menu", category: "Sauce", sauceSub: null });
      else navTo({ page: "category", category: cat, sauceSub: null });
    });
  });
}

function renderSauceMenu() {
  updateTopbar();
  updateSessionPill();

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Sauce</div>
    </div>

    <section class="grid">
      ${SAUCE_SUBS.map(
        (s) => `
        <button class="tile" data-sauce="${escapeHtml(s)}" type="button">
          <div class="tile-title" style="color:#14341f">${escapeHtml(s)}</div>
        </button>`
      ).join("")}
    </section>
  `;

  $("#backBtn")?.addEventListener("click", () => navBack());

  main.querySelectorAll("[data-sauce]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sauce");
      navTo({ page: "category", category: "Sauce", sauceSub: sub });
    });
  });
}

function renderCategoryList() {
  updateTopbar();
  updateSessionPill();

  const { category, sauceSub } = state.view;
  const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

  const list = getItemsForCategory(category, sauceSub);

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">${escapeHtml(title)}</div>
    </div>

    <section class="list">
      ${
        list.length
          ? list
              .map(
                (it) => `
        <button class="list-row" data-item-id="${it.id}" type="button">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(it.name)}</div>
            <div class="list-row-sub">${escapeHtml(getHelperText(it))}</div>
          </div>
          <div class="chev">›</div>
        </button>`
              )
              .join("")
          : `<div class="empty">No items found.</div>`
      }
    </section>
  `;

  $("#backBtn")?.addEventListener("click", () => navBack());

  main.querySelectorAll("[data-item-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-item-id"));
      const item = state.items.find((x) => Number(x.id) === id);
      if (!item) return;
      openLogModal(item);
    });
  });
}

function renderAlerts() {
  updateTopbar();
  updateSessionPill();

  const store = state.session.store;

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="card-title">Expiry Alerts (${escapeHtml(store)})</div>
      <div id="expiryWrap" class="muted">Loading...</div>
    </div>

    <div class="card">
      <div class="card-title">Low Stock (${escapeHtml(store)})</div>
      <div id="lowWrap" class="muted">Loading...</div>
    </div>

    <button id="btnRefreshAlerts" class="btn btn-primary" type="button" style="width:100%;margin-top:10px;">
      Refresh
    </button>
  `;

  $("#backBtn")?.addEventListener("click", () => navBack());

  const expiryWrap = $("#expiryWrap");
  const lowWrap = $("#lowWrap");

  (async () => {
    try {
      await loadAlerts();

      // expiry render
      if (expiryWrap) {
        if (!state.alerts?.length) {
          expiryWrap.innerHTML = `<div class="muted">No expiry items found.</div>`;
        } else {
          expiryWrap.innerHTML = state.alerts
            .map(
              (x) => `
              <div class="alert-row">
                <div>
                  <div class="alert-name">${escapeHtml(x.name)}</div>
                  <div class="alert-extra">${escapeHtml(canonicalCategory(x.category))}${
                x.sub_category ? " • " + escapeHtml(x.sub_category) : ""
              }</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:900">${escapeHtml(x.expiry_value || "")}</div>
                </div>
              </div>
            `
            )
            .join("");
        }
      }

      // low stock render (optional endpoint)
      if (lowWrap) {
        if (!state.lowStock?.length) {
          lowWrap.innerHTML = `<div class="muted">No low stock data (or endpoint not enabled).</div>`;
        } else {
          lowWrap.innerHTML = state.lowStock
            .map(
              (x) => `
              <div class="alert-row">
                <div>
                  <div class="alert-name">${escapeHtml(x.name)}</div>
                  <div class="alert-extra">${escapeHtml(canonicalCategory(x.category))}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:900">${escapeHtml(String(x.qty ?? ""))}</div>
                </div>
              </div>
            `
            )
            .join("");
        }
      }
    } catch (e) {
      if (expiryWrap) expiryWrap.innerHTML = `<div class="error">Failed to load alerts</div>`;
      if (lowWrap) lowWrap.innerHTML = `<div class="muted">No data</div>`;
    }
  })();

  $("#btnRefreshAlerts")?.addEventListener("click", async () => {
    toast("Refreshing...");
    renderAlerts();
  });
}

// ---------- Manager UI ----------
function openManagerLogin() {
  openModal(
    "Manager Login",
    `
    <div class="field">
      <label class="label">PIN</label>
      <input id="mgrPin" class="input" inputmode="numeric" type="password" placeholder="Enter PIN" />
      <div class="helper">Manager access only.</div>
    </div>

    <div id="mgrErr" class="error hidden"></div>

    <div style="display:flex;gap:10px;margin-top:14px;">
      <button id="mgrLoginBtn" class="btn btn-primary" type="button" style="flex:1;">Login</button>
      <button id="mgrCancelBtn" class="btn btn-ghost" type="button" style="flex:1;">Cancel</button>
    </div>
    `
  );

  $("#mgrCancelBtn", modalBodyEl)?.addEventListener("click", closeModal);

  $("#mgrLoginBtn", modalBodyEl)?.addEventListener("click", async () => {
    const pin = ($("#mgrPin", modalBodyEl)?.value || "").trim();
    const errEl = $("#mgrErr", modalBodyEl);
    try {
      errEl?.classList.add("hidden");
      const out = await apiPost("/api/manager/login", { pin });
      setManagerToken(out.token || "");
      closeModal();
      updateTopbar();
      updateSessionPill();
      navTo({ page: "manager", category: null, sauceSub: null });
    } catch (e) {
      if (errEl) {
        errEl.textContent = "Invalid PIN";
        errEl.classList.remove("hidden");
      } else {
        alert("Invalid PIN");
      }
    }
  });
}

function renderManager() {
  updateTopbar();
  updateSessionPill();

  if (!isManagerMode()) {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Login required.</div>
        <button id="btnMgrLogin" class="btn btn-primary" type="button" style="width:100%;margin-top:10px;">Login</button>
        <button id="btnMgrBack" class="btn btn-ghost" type="button" style="width:100%;margin-top:10px;">Back</button>
      </div>
    `;
    $("#btnMgrLogin")?.addEventListener("click", openManagerLogin);
    $("#btnMgrBack")?.addEventListener("click", () => navBack());
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div class="card-title">Items</div>

      <div class="field">
        <label class="label">Search</label>
        <input id="mgrSearch" class="input" placeholder="Search item name..." value="${escapeHtml(state.managerSearch)}" />
      </div>

      <div style="display:flex;gap:10px;">
        <button id="mgrRefresh" class="btn btn-ghost" type="button" style="flex:1;">Refresh</button>
        <button id="mgrAdd" class="btn btn-primary" type="button" style="flex:1;">Add New</button>
      </div>

      <div id="mgrList" class="list" style="margin-top:12px;">
        <div class="muted">Loading...</div>
      </div>
    </div>
  `;

  $("#backBtn")?.addEventListener("click", () => navBack());

  $("#mgrSearch")?.addEventListener("input", (e) => {
    state.managerSearch = e.target.value || "";
    renderManagerList();
  });

  $("#mgrRefresh")?.addEventListener("click", async () => {
    await loadManagerItems().catch(() => {});
    toast("Refreshed");
    renderManagerList();
  });

  $("#mgrAdd")?.addEventListener("click", () => openManagerItemEditor(null));

  // initial load
  (async () => {
    await loadManagerItems().catch(() => {});
    renderManagerList();
  })();
}

function renderManagerList() {
  const wrap = $("#mgrList");
  if (!wrap) return;

  const q = norm(state.managerSearch);
  let list = state.managerItems || [];
  if (q) list = list.filter((x) => norm(x.name).includes(q));

  if (!list.length) {
    wrap.innerHTML = `<div class="muted">No items.</div>`;
    return;
  }

  wrap.innerHTML = list
    .slice(0, 200)
    .map(
      (it) => `
      <div class="list-row" style="cursor:default;">
        <div style="flex:1;">
          <div class="list-row-title">${escapeHtml(it.name)}</div>
          <div class="list-row-sub">${escapeHtml(canonicalCategory(it.category))}${
        it.sub_category ? " • " + escapeHtml(it.sub_category) : ""
      } • Shelf life: ${escapeHtml(String(it.shelf_life_days ?? ""))}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="icon-btn" data-edit="${it.id}" type="button">Edit</button>
          <button class="icon-btn" data-del="${it.id}" type="button" style="border-color:#e53935;color:#e53935;">Del</button>
        </div>
      </div>
    `
    )
    .join("");

  wrap.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = Number(b.getAttribute("data-edit"));
      const it = state.managerItems.find((x) => Number(x.id) === id);
      openManagerItemEditor(it);
    });
  });

  wrap.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = Number(b.getAttribute("data-del"));
      const it = state.managerItems.find((x) => Number(x.id) === id);
      if (!it) return;
      if (!confirm(`Delete "${it.name}"?`)) return;
      try {
        await apiManager("DELETE", `/api/manager/items/${id}`);
        state.managerItems = state.managerItems.filter((x) => Number(x.id) !== id);
        toast("Deleted");
        renderManagerList();
        // also reload staff items
        await loadItems().catch(() => {});
      } catch (e) {
        alert("Delete failed");
      }
    });
  });
}

function openManagerItemEditor(item) {
  const isNew = !item;

  openModal(
    isNew ? "Add Item" : "Edit Item",
    `
    <div class="field">
      <label class="label">Name</label>
      <input id="mName" class="input" value="${escapeHtml(item?.name || "")}" />
    </div>

    <div class="field">
      <label class="label">Category</label>
      <input id="mCat" class="input" value="${escapeHtml(canonicalCategory(item?.category || ""))}" />
      <div class="helper">Use exact category names (Prepared items, Thawing, Sauce, etc.)</div>
    </div>

    <div class="field">
      <label class="label">Sub-category (Sauce only)</label>
      <input id="mSub" class="input" value="${escapeHtml(item?.sub_category || "")}" placeholder="Sandwich Unit / Standby / Open Inner" />
    </div>

    <div class="field">
      <label class="label">Shelf life (days)</label>
      <input id="mLife" class="input" type="number" inputmode="numeric" value="${escapeHtml(
        String(item?.shelf_life_days ?? 0)
      )}" />
    </div>

    <div id="mErr" class="error hidden"></div>

    <div style="display:flex;gap:10px;margin-top:14px;">
      <button id="mSave" class="btn btn-primary" type="button" style="flex:1;">Save</button>
      <button id="mCancel" class="btn btn-ghost" type="button" style="flex:1;">Cancel</button>
    </div>
    `
  );

  $("#mCancel", modalBodyEl)?.addEventListener("click", closeModal);

  $("#mSave", modalBodyEl)?.addEventListener("click", async () => {
    const errEl = $("#mErr", modalBodyEl);
    try {
      errEl?.classList.add("hidden");

      const name = ($("#mName", modalBodyEl)?.value || "").trim();
      const category = ($("#mCat", modalBodyEl)?.value || "").trim();
      const sub_category = ($("#mSub", modalBodyEl)?.value || "").trim() || null;
      const shelf_life_days = Number($("#mLife", modalBodyEl)?.value ?? 0);

      if (!name || !category) throw new Error("Name and Category required");

      if (isNew) {
        await apiManager("POST", "/api/manager/items", { name, category, sub_category, shelf_life_days });
        toast("Added");
      } else {
        await apiManager("PATCH", `/api/manager/items/${item.id}`, { name, category, sub_category, shelf_life_days });
        toast("Saved");
      }

      closeModal();
      await loadManagerItems().catch(() => {});
      renderManagerList();
      await loadItems().catch(() => {});
    } catch (e) {
      if (errEl) {
        errEl.textContent = e?.message || "Save failed";
        errEl.classList.remove("hidden");
      } else {
        alert("Save failed");
      }
    }
  });
}

// ---------- Render router ----------
function render() {
  updateTopbar();
  updateSessionPill();
  bindTopButtons(); // safe

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);

  // force session screen if no session yet
  if (!hasSession && state.view.page !== "session" && !isManagerMode()) {
    state.view = { page: "session", category: null, sauceSub: null };
  }

  if (state.view.page === "session") return renderSession();
  if (state.view.page === "home") return renderHome();
  if (state.view.page === "sauce_menu") return renderSauceMenu();
  if (state.view.page === "category") return renderCategoryList();
  if (state.view.page === "alerts") return renderAlerts();
  if (state.view.page === "manager") return renderManager();

  // fallback
  renderHome();
}

// ---------- Boot ----------
(async function boot() {
  loadSession();
  updateTopbar();
  updateSessionPill();
  bindTopButtons();

  try {
    await loadItems();
  } catch {
    // keep app usable even if load fails
  }

  const hasSession = !!(state.session.store && state.session.shift && state.session.staff);
  state.view = hasSession ? { page: "home", category: null, sauceSub: null } : { page: "session", category: null, sauceSub: null };

  render();
})();
