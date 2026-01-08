/* PreCheck app.js (FULL) */

(() => {
  "use strict";

  // -----------------------------
  // DOM
  // -----------------------------
  const main = document.getElementById("main");

  const sessionPill = document.getElementById("sessionPill");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitleEl = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  // desktop fallback buttons (kept)
  const btnHome = document.getElementById("btnHome");
  const btnAlerts = document.getElementById("btnAlerts");
  const btnLogout = document.getElementById("btnLogout");

  // bottom nav
  const bottomNav = document.getElementById("bottomNav");
  const navHome = document.getElementById("navHome");
  const navAlerts = document.getElementById("navAlerts");
  const navManager = document.getElementById("navManager");
  const navLogout = document.getElementById("navLogout");

  const $ = (sel) => document.querySelector(sel);

  // -----------------------------
  // Constants / Config
  // -----------------------------
  const LS_SESSION = "precheck_session_v3";
  const SS_MANAGER_TOKEN = "precheck_manager_token_v1";

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

  // Home tile meta (emoji + color tone)
  const TILE_META = {
    "Prepared items": { tone: "green", icon: "🥪" },
    "Unopened chiller": { tone: "blue", icon: "🧊" },
    "Thawing": { tone: "cyan", icon: "❄️" },
    "Vegetables": { tone: "lime", icon: "🥬" },
    "Backroom": { tone: "orange", icon: "📦" },
    "Back counter": { tone: "yellow", icon: "🧂" },
    "Front counter": { tone: "red", icon: "🧾" },
    "Back counter chiller": { tone: "teal", icon: "🧀" },
    "Sauce": { tone: "purple", icon: "🧴" },
  };

  // Names normalized
  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");

  function escapeHtml(str) {
    return (str ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function canonicalCategory(cat) {
    const c = (cat || "").toString().trim();
    // accept case variants
    const map = new Map(
      CATEGORIES.map((x) => [norm(x), x])
    );
    return map.get(norm(c)) || c;
  }

  // -----------------------------
  // App state
  // -----------------------------
  const state = {
    session: loadSession(),
    view: { page: "session" }, // session | home | sauce_menu | category | alerts | manager
    items: [],
    loading: false,
    modalOpen: false,
  };

  // -----------------------------
  // Modal
  // -----------------------------
  function showModal() {
    modalBackdrop.classList.remove("hidden");
    modalBackdrop.setAttribute("aria-hidden", "false");
    state.modalOpen = true;
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
    modalBackdrop.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
    state.modalOpen = false;
  }

  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  // -----------------------------
  // Bottom nav helpers
  // -----------------------------
  function setBottomNavVisible(v) {
    if (!bottomNav) return;
    bottomNav.classList.toggle("hidden", !v);
  }

  function setActiveNav(key) {
    if (!bottomNav) return;
    [navHome, navAlerts, navManager, navLogout].forEach((b) => b && b.classList.remove("active"));
    if (key === "home") navHome.classList.add("active");
    if (key === "alerts") navAlerts.classList.add("active");
    if (key === "manager") navManager.classList.add("active");
  }

  // -----------------------------
  // Session / Manager Token
  // -----------------------------
  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveSession(sess) {
    localStorage.setItem(LS_SESSION, JSON.stringify(sess));
  }

  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  function getManagerToken() {
    return sessionStorage.getItem(SS_MANAGER_TOKEN) || "";
  }

  function setManagerToken(token) {
    if (token) sessionStorage.setItem(SS_MANAGER_TOKEN, token);
    else sessionStorage.removeItem(SS_MANAGER_TOKEN);
  }

  // -----------------------------
  // API
  // -----------------------------
  async function apiGet(url) {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  }

  async function apiPost(url, body, extraHeaders = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
    return data;
  }
// ================= MANAGER AUTH HELPERS =================
function getManagerToken() {
  return localStorage.getItem("managerToken") || "";
}

function setManagerToken(token) {
  if (token) localStorage.setItem("managerToken", token);
  else localStorage.removeItem("managerToken");
}

async function apiManager(path, { method = "GET", body } = {}) {
  const token = getManagerToken();

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed: ${res.status}`);
  }

  return res.json();
}
// ========================================================

  async function apiPut(url, body, extraHeaders = {}) {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
    return data;
  }

  async function apiDelete(url, extraHeaders = {}) {
    const res = await fetch(url, { method: "DELETE", headers: { ...extraHeaders } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
    return data;
  }

  // -----------------------------
  // Items / Store filtering
  // -----------------------------
  function isItemVisibleForStore(item, store) {
    const cat = canonicalCategory(item.category);
    const nameN = norm(item.name);

    // SKH-only: Beef Taco (H) in Front counter
    if (cat === "Front counter" && nameN === norm("Beef Taco (H)")) {
      return store === "SKH";
    }

    // If your DB still has "Beef Taco" without (H), treat that as SKH-only too (Front counter only)
    if (cat === "Front counter" && nameN === norm("Beef Taco")) {
      return store === "SKH";
    }

    return true;
  }

  async function loadItems() {
    state.loading = true;
    render();
    const data = await apiGet("/api/items");
    state.items = Array.isArray(data) ? data : [];
    state.loading = false;
    render();
  }

  // -----------------------------
  // Expiry modes (no big labels shown)
  // -----------------------------
  // Manual always list (name-based)
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
      "cajun spice packet",
      // also: unopened chiller forced manual anyway
    ].map(norm)
  );

  // HOURLY_FIXED items
  const HOURLY_FIXED_ITEMS = new Set(
    [
      "bread",
      "tomato soup (h)",
      "mushroom soup (h)",
    ].map(norm)
  );

  // HOURLY items (besides beef taco special)
  const HOURLY_ITEMS = new Set(
    [
      // add more hourly here later if needed
    ].map(norm)
  );

  // EOD items set (keep empty, we handle Chicken Bacon (C) by category+name)
  const EOD_ITEMS = new Set([]);

  function getShelfLifeDays(item) {
    let sl = Number(item.shelf_life_days);
    if (!Number.isFinite(sl) || sl < 0) sl = 0;

    // Cajun Spice Open Inner: AUTO 5 days regardless of DB
    if (norm(item.name) === norm("Cajun Spice Open Inner")) return 5;

    return sl;
  }

  function getMode(item) {
    const cat = canonicalCategory(item.category);
    const nameN = norm(item.name);

    // ✅ Only Chicken Bacon (C) in Prepared items is EOD
    if (cat === "Prepared items" && nameN === "chicken bacon (c)") return "EOD";

    // Unopened chiller always manual DATE-only (no time)
    if (cat === "Unopened chiller") return "MANUAL_DATE";

    // Always manual list
    if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

    // Special: Cajun Spice Open Inner AUTO 5 days
    if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

    // Fixed time dropdown
    if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

    // EOD
    if (EOD_ITEMS.has(nameN)) return "EOD";

    // Front counter Beef Taco treated as HOURLY (SKH only)
    if (cat === "Front counter" && (nameN === norm("Beef Taco") || nameN === norm("Beef Taco (H)"))) return "HOURLY";

    // Other HOURLY items
    if (HOURLY_ITEMS.has(nameN)) return "HOURLY";

    // Shelf life > 7 => manual date-only
    const sl = getShelfLifeDays(item);
    if (sl > 7) return "MANUAL_DATE";

    // Default AUTO
    return "AUTO";
  }

  function formatDateLabel(d) {
    // “24 May 2026”
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function buildAutoDateOptions(days) {
    // N+1 options (today..today+N)
    const out = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i <= days; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      out.push({
        label: formatDateLabel(d),
        valueISO: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0).toISOString(),
      });
    }
    return out;
  }

  function buildHourlyOptions() {
    // 24 hour options, past allowed
    const out = [];
    for (let h = 0; h < 24; h++) {
      const hr12 = ((h + 11) % 12) + 1;
      const ampm = h < 12 ? "AM" : "PM";
      out.push({ label: `${hr12}:00 ${ampm}`, hour: h, minute: 0 });
    }
    return out;
  }

  const HOURLY_FIXED = [
    { label: "11:00 AM", hour: 11, minute: 0 },
    { label: "3:00 PM", hour: 15, minute: 0 },
    { label: "7:00 PM", hour: 19, minute: 0 },
    { label: "11:00 PM", hour: 23, minute: 0 },
  ];

  function getHelperText(item) {
    const mode = getMode(item);
    const cat = canonicalCategory(item.category);
    const sl = getShelfLifeDays(item);

    if (mode === "EOD") return "Expiry is end of day (auto)";
    if (mode === "HOURLY_FIXED") return "Select time (11am / 3pm / 7pm / 11pm)";
    if (mode === "HOURLY") return "Select expiry time";
    if (mode === "MANUAL_DATE") {
      if (cat === "Unopened chiller") return "Select expiry date (manual)";
      if (sl > 7) return "Select expiry date (manual)";
      return "Select expiry date (manual)";
    }
    // AUTO
    return `Select expiry date (Today → +${sl} day${sl === 1 ? "" : "s"})`;
  }

  // -----------------------------
  // Start Popup (your checklist)
  // -----------------------------
  const START_POPUP_KEY = "precheck_start_popup_v1";
  const START_POPUP_ITEMS = [
    "Liquid Egg",
    "Flatbread Thawing",
    "Mac & Cheese",
    "Chicken Bacon (C)",
    "Avocado",
    "Mix Green",
    "Lettuce",
  ];

  function shouldShowStartPopup() {
    if (!state.session) return false;
    const key = `${START_POPUP_KEY}:${state.session.store}:${state.session.shift}:${state.session.staff}`;
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(key) !== today;
  }

  function markStartPopupShown() {
    const key = `${START_POPUP_KEY}:${state.session.store}:${state.session.shift}:${state.session.staff}`;
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(key, today);
  }

  function openStartPopup() {
    modalTitleEl.textContent = "Reminder";
    modalBody.innerHTML = `
      <div class="modal-item-title">PLEASE check expiry day for the items below</div>
      <div class="card" style="box-shadow:none; border:1px solid var(--border); margin:0;">
        ${START_POPUP_ITEMS.map((x, i) => `
          <div class="alert-row">
            <div class="alert-name">${i + 1}. ${escapeHtml(x)}</div>
          </div>
        `).join("")}
      </div>
      <div class="field" style="margin-top:14px;">
        <button id="startPopupOk" class="btn btn-primary" type="button">OK</button>
      </div>
    `;
    $("#startPopupOk").addEventListener("click", () => {
      markStartPopupShown();
      closeModal();
    });
    showModal();
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function setSessionPillVisible(v) {
    sessionPill.classList.toggle("hidden", !v);
  }

  function updateSessionPill() {
    if (!state.session) {
      sessionPill.textContent = "";
      setSessionPillVisible(false);
      return;
    }
    const s = state.session;
    // bigger, modern
    sessionPill.textContent = `${s.store} • ${s.shift} • ${s.staff}`;
    setSessionPillVisible(true);
  }

  function logout() {
    setManagerToken("");
    state.session = null;
    clearSession();
    state.view = { page: "session" };
    setBottomNavVisible(false);
    render();
  }

  function renderLoading() {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Loading…</div>
        <div class="muted">Fetching items…</div>
      </div>
    `;
  }

  function renderSession() {
    setBottomNavVisible(false);
    updateSessionPill();

    main.innerHTML = `
      <div class="card">
        <div class="h1">Start Session</div>
        <div class="muted">Select store, shift, and staff.</div>

        <div class="field">
          <label class="label">Store</label>
          <select id="sessStore" class="input">
            <option value="">Select…</option>
            <option value="PDD">PDD</option>
            <option value="SKH">SKH</option>
          </select>
        </div>

        <div class="field">
          <label class="label">Shift</label>
          <select id="sessShift" class="input">
            <option value="">Select…</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
            <option value="MID">MID</option>
          </select>
          <div class="helper">Use the shift you are working now.</div>
        </div>

        <div class="field">
          <label class="label">Staff</label>
          <input id="sessStaff" class="input" placeholder="Name / ID" />
        </div>

        <div class="field">
          <button id="sessStart" class="btn btn-primary" type="button">Start</button>
        </div>

        <div id="sessErr" class="error hidden"></div>
      </div>
    `;

    const storeEl = $("#sessStore");
    const shiftEl = $("#sessShift");
    const staffEl = $("#sessStaff");
    const errEl = $("#sessErr");

    $("#sessStart").addEventListener("click", async () => {
      const store = storeEl.value.trim();
      const shift = shiftEl.value.trim();
      const staff = staffEl.value.trim();

      errEl.classList.add("hidden");
      errEl.textContent = "";

      if (!store || !shift || !staff) {
        errEl.textContent = "Please fill Store, Shift, and Staff.";
        errEl.classList.remove("hidden");
        return;
      }

      state.session = { store, shift, staff };
      saveSession(state.session);

      updateSessionPill();
      await loadItems();

      state.view = { page: "home" };
      render();

      if (shouldShowStartPopup()) openStartPopup();
    });
  }

  function getVisibleItems() {
    if (!state.session) return [];
    return state.items
      .map((it) => ({
        ...it,
        category: canonicalCategory(it.category),
      }))
      .filter((it) => CATEGORIES.includes(it.category))
      .filter((it) => isItemVisibleForStore(it, state.session.store));
  }

  function getCountsByCategory(items) {
    const counts = {};
    for (const cat of CATEGORIES) counts[cat] = 0;
    for (const it of items) {
      const cat = canonicalCategory(it.category);
      if (counts[cat] != null) counts[cat] += 1;
    }
    return counts;
  }

  function renderHome() {
    setBottomNavVisible(true);
    setActiveNav("home");
    updateSessionPill();

    const items = getVisibleItems();
    const counts = getCountsByCategory(items);

    main.innerHTML = `
      <section class="home-surface">
        <div class="home-title">Categories</div>

        <section class="grid tiles-grid">
          ${CATEGORIES.map((cat, i) => {
            const meta = TILE_META[cat] || { tone: "green", icon: "✅" };
            const count = counts[cat] ?? 0;
            return `
              <button class="tile tile--${meta.tone}" style="--d:${i * 55}ms" data-cat="${escapeHtml(cat)}" type="button">
                <div class="tile-top">
                  <div class="tile-icon" aria-hidden="true">${meta.icon}</div>
                </div>
                <div class="tile-title">${escapeHtml(cat)}</div>
                <div class="tile-sub">${count} item${count === 1 ? "" : "s"}</div>
              </button>
            `;
          }).join("")}
        </section>
      </section>
    `;

    main.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-cat");
        if (cat === "Sauce") state.view = { page: "sauce_menu" };
        else state.view = { page: "category", category: cat, sauceSub: null };
        render();
      });
    });
  }

  function renderSauceMenu() {
    setBottomNavVisible(true);
    setActiveNav("home");
    updateSessionPill();

    main.innerHTML = `
      <div class="page-head">
        <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
        <div class="page-title">Sauce</div>
      </div>

      <section class="grid tiles-grid">
        ${SAUCE_SUBS.map((s, i) => `
          <button class="tile tile--green" style="--d:${i * 55}ms" data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-top">
              <div class="tile-icon" aria-hidden="true">🧴</div>
            </div>
            <div class="tile-title">${escapeHtml(s)}</div>
            <div class="tile-sub">Tap to open</div>
          </button>
        `).join("")}
      </section>
    `;

    $("#backBtn").addEventListener("click", () => {
      state.view = { page: "home" };
      render();
    });

    main.querySelectorAll("[data-sauce]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sub = btn.getAttribute("data-sauce");
        state.view = { page: "category", category: "Sauce", sauceSub: sub };
        render();
      });
    });
  }

  function getItemsForCurrentList() {
    const items = getVisibleItems();
    const { category, sauceSub } = state.view;

    let list = items.filter((it) => canonicalCategory(it.category) === canonicalCategory(category));

    if (category === "Sauce") {
      list = list.filter((it) => (it.sub_category || "") === (sauceSub || ""));
    }

    list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
    return list;
  }

  function renderCategoryList() {
    setBottomNavVisible(true);
    setActiveNav("home");
    updateSessionPill();

    const { category, sauceSub } = state.view;
    const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

    const list = getItemsForCurrentList();

    main.innerHTML = `
      <div class="page-head">
        <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
        <div class="page-title">${escapeHtml(title)}</div>
      </div>

      <section class="list">
        ${
          list.length
            ? list.map((it) => `
              <button class="list-row" data-item-id="${it.id}" type="button">
                <div class="list-row-main">
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

    $("#backBtn").addEventListener("click", () => {
      if (category === "Sauce") state.view = { page: "sauce_menu" };
      else state.view = { page: "home" };
      render();
    });

    main.querySelectorAll("[data-item-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-item-id"));
        const item = list.find((x) => Number(x.id) === id);
        if (!item) return;
        openItemLogModal(item);
      });
    });
  }

  // -----------------------------
  // Log Modal (Quantity optional; expiry rules enforced)
  // -----------------------------
  function openItemLogModal(item) {
    const mode = getMode(item);
    const cat = canonicalCategory(item.category);

    modalTitleEl.textContent = cat === "Sauce" ? `Sauce • ${item.sub_category || ""}` : cat;

    const helper = getHelperText(item);

    let expiryFieldHtml = "";
    if (mode === "AUTO") {
      const sl = getShelfLifeDays(item);
      const opts = buildAutoDateOptions(sl);
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Date</label>
          <select id="expirySelect" class="input">
            <option value="">Select date…</option>
            ${opts.map((o) => `<option value="${escapeHtml(o.valueISO)}">${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "MANUAL_DATE") {
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Date</label>
          <input id="expiryDate" type="date" class="input" />
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "EOD") {
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry</label>
          <div class="pill">End of day (auto 23:59)</div>
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "HOURLY") {
      const opts = buildHourlyOptions();
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Time</label>
          <select id="expiryTime" class="input">
            <option value="">Select time…</option>
            ${opts.map((o) => `<option value="${o.hour}:${o.minute}">${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <div class="helper">${escapeHtml(helper)} (past time allowed)</div>
        </div>
      `;
    } else if (mode === "HOURLY_FIXED") {
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Time</label>
          <select id="expiryFixed" class="input">
            <option value="">Select time…</option>
            ${HOURLY_FIXED.map((o) => `<option value="${o.hour}:${o.minute}">${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <div class="helper">${escapeHtml(helper)} (past time allowed)</div>
        </div>
      `;
    }

    modalBody.innerHTML = `
      <div class="modal-item-title">${escapeHtml(item.name)}</div>

      <div class="field">
        <label class="label">Quantity (optional)</label>
        <input id="qtyInput" class="input" inputmode="numeric" placeholder="Leave blank if not counting" />
        <div class="helper">Blank allowed, 0 allowed.</div>
      </div>

      ${expiryFieldHtml}

      <div id="saveErr" class="error hidden"></div>

      <div class="field" style="display:flex; gap:10px;">
        <button id="btnSave" class="btn btn-primary" type="button" style="flex:1;">Save</button>
        <button id="btnCancel" class="btn btn-ghost" type="button">Cancel</button>
      </div>
    `;

    $("#btnCancel").addEventListener("click", closeModal);

    $("#btnSave").addEventListener("click", async () => {
      const errEl = $("#saveErr");
      errEl.classList.add("hidden");
      errEl.textContent = "";

      const qtyRaw = ($("#qtyInput").value || "").trim();
      const qty = qtyRaw === "" ? null : Number(qtyRaw);

      // qty optional; allow 0; allow blank
      if (qtyRaw !== "" && !Number.isFinite(qty)) {
        errEl.textContent = "Quantity must be a number (or leave blank).";
        errEl.classList.remove("hidden");
        return;
      }

      let expiryAtIso = null;

      if (mode === "AUTO") {
        const v = ($("#expirySelect").value || "").trim();
        if (!v) {
          errEl.textContent = "Expiry required.";
          errEl.classList.remove("hidden");
          return;
        }
        expiryAtIso = v;
      }

      if (mode === "MANUAL_DATE") {
        const d = ($("#expiryDate").value || "").trim();
        if (!d) {
          errEl.textContent = "Expiry required.";
          errEl.classList.remove("hidden");
          return;
        }
        // date-only => end of selected day 23:59 local -> ISO
        const parts = d.split("-");
        const yy = Number(parts[0]);
        const mm = Number(parts[1]) - 1;
        const dd = Number(parts[2]);
        const dt = new Date(yy, mm, dd, 23, 59, 0);
        expiryAtIso = dt.toISOString();
      }

      if (mode === "EOD") {
        const now = new Date();
        const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);
        expiryAtIso = dt.toISOString();
      }

      if (mode === "HOURLY") {
        const v = ($("#expiryTime").value || "").trim();
        if (!v) {
          errEl.textContent = "Expiry required.";
          errEl.classList.remove("hidden");
          return;
        }
        const [hh, mi] = v.split(":").map(Number);
        const now = new Date();
        const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mi || 0, 0);
        expiryAtIso = dt.toISOString();
      }

      if (mode === "HOURLY_FIXED") {
        const v = ($("#expiryFixed").value || "").trim();
        if (!v) {
          errEl.textContent = "Expiry required.";
          errEl.classList.remove("hidden");
          return;
        }
        const [hh, mi] = v.split(":").map(Number);
        const now = new Date();
        const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mi || 0, 0);
        expiryAtIso = dt.toISOString();
      }

      try {
        await saveLog(item, qty, expiryAtIso);
        toast("Saved");
        closeModal();
      } catch (e) {
        errEl.textContent = e?.message || "Save failed.";
        errEl.classList.remove("hidden");
      }
    });

    showModal();
  }

  async function saveLog(item, qty, expiryAtIso) {
    if (!state.session) throw new Error("No session");

    // IMPORTANT: only send fields server will use (server ignores extra, but we keep minimal)
    const payload = {
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,

      item_id: Number(item.id),

      qty: qty,
      quantity: qty,

      expiry_at: expiryAtIso,
      expiryAt: expiryAtIso,
      expiry: expiryAtIso,
      expiry_datetime: expiryAtIso,
      expiry_date: expiryAtIso,
    };

    await apiPost("/api/log", payload);
  }

  // -----------------------------
  // Alerts page
  // -----------------------------
  async function renderAlerts() {
    setBottomNavVisible(true);
    setActiveNav("alerts");
    updateSessionPill();

    main.innerHTML = `
      <div class="card">
        <div class="h1">Alerts</div>
        <div class="muted">Expiry alerts & low stock for ${escapeHtml(state.session?.store || "")}</div>
      </div>

      <div id="alertsBlock" class="card">
        <div class="muted">Loading…</div>
      </div>
    `;

    const store = state.session?.store;
    if (!store) return;

    try {
      const data = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
      const low = await apiGet(`/api/low_stock?store=${encodeURIComponent(store)}`);

      const expiring = data?.expiring || [];
      const expired = data?.expired || [];

      const html = `
        <div class="card-title">Expired</div>
        ${
          expired.length
            ? expired
                .slice(0, 60)
                .map((x) => `
                  <div class="alert-row">
                    <div>
                      <div class="alert-name">${escapeHtml(x.name || "Item")}</div>
                      <div class="alert-extra">${escapeHtml(x.expiry_label || "")}</div>
                    </div>
                    <div class="alert-extra">Expired</div>
                  </div>
                `)
                .join("")
            : `<div class="empty">No expired items.</div>`
        }

        <div style="height:12px;"></div>

        <div class="card-title">Expiring Soon</div>
        ${
          expiring.length
            ? expiring
                .slice(0, 80)
                .map((x) => `
                  <div class="alert-row">
                    <div>
                      <div class="alert-name">${escapeHtml(x.name || "Item")}</div>
                      <div class="alert-extra">${escapeHtml(x.expiry_label || "")}</div>
                    </div>
                    <div class="alert-extra">${escapeHtml(x.days_left != null ? `${x.days_left}d` : "")}</div>
                  </div>
                `)
                .join("")
            : `<div class="empty">No expiring soon items.</div>`
        }

        <div style="height:12px;"></div>

        <div class="card-title">Low Stock</div>
        ${
          (low?.items || []).length
            ? low.items.slice(0, 80).map((x) => `
              <div class="alert-row">
                <div>
                  <div class="alert-name">${escapeHtml(x.name || "Item")}</div>
                  <div class="alert-extra">${escapeHtml(x.category || "")}</div>
                </div>
                <div class="alert-extra">${escapeHtml(x.qty_label || "")}</div>
              </div>
            `).join("")
            : `<div class="empty">No low stock items.</div>`
        }
      `;

      $("#alertsBlock").innerHTML = html;
    } catch (e) {
      $("#alertsBlock").innerHTML = `<div class="error">Failed to load alerts: ${escapeHtml(e?.message || "")}</div>`;
    }
  }

  // -----------------------------
  // Manager (PIN 8686)
  // -----------------------------
  function openManagerLogin() {
    modalTitleEl.textContent = "Manager Access";
    modalBody.innerHTML = `
      <div class="modal-item-title">Enter PIN</div>
      <div class="field">
        <input id="mgrPin" class="input" inputmode="numeric" placeholder="PIN" />
        <div class="helper">Manager only.</div>
      </div>
      <div id="mgrErr" class="error hidden"></div>
      <div class="field" style="display:flex; gap:10px;">
        <button id="mgrLogin" class="btn btn-primary" type="button" style="flex:1;">Login</button>
        <button id="mgrCancel" class="btn btn-ghost" type="button">Cancel</button>
      </div>
    `;

    $("#mgrCancel").addEventListener("click", closeModal);
    $("#mgrLogin").addEventListener("click", async () => {
      const pin = ($("#mgrPin").value || "").trim();
      const errEl = $("#mgrErr");
      errEl.classList.add("hidden");
      errEl.textContent = "";

      if (!pin) {
        errEl.textContent = "PIN required.";
        errEl.classList.remove("hidden");
        return;
      }

      try {
        const out = await apiPost("/api/manager/login", { pin });
        setManagerToken(out.token || "");
        closeModal();
        state.view = { page: "manager" };
        render();
      } catch (e) {
        errEl.textContent = e?.message || "Login failed.";
        errEl.classList.remove("hidden");
      }
    });

    showModal();
  }

  async function renderManager() {
    setBottomNavVisible(true);
    setActiveNav("manager");
    updateSessionPill();

    const token = getManagerToken();
    if (!token) {
      main.innerHTML = `
        <div class="card">
          <div class="h1">Manager</div>
          <div class="muted">Login required.</div>
          <div class="field">
            <button id="mgrOpenLogin" class="btn btn-primary" type="button">Enter PIN</button>
          </div>
        </div>
      `;
      $("#mgrOpenLogin").addEventListener("click", openManagerLogin);
      return;
    }

    main.innerHTML = `
      <div class="card">
        <div class="h1">Manager</div>
        <div class="muted">Edit items (category / sub-category / shelf life). Changes apply immediately.</div>

        <div class="field">
          <label class="label">Search</label>
          <input id="mgrSearch" class="input" placeholder="Type item name..." />
        </div>

        <div class="field" style="display:flex; gap:10px;">
          <button id="mgrAdd" class="btn btn-primary" type="button" style="flex:1;">Add Item</button>
          <button id="mgrLogout" class="btn btn-ghost" type="button">Exit Manager</button>
        </div>
      </div>

      <div id="mgrList" class="card">
        <div class="muted">Loading…</div>
      </div>
    `;

    $("#mgrLogout").addEventListener("click", () => {
      setManagerToken("");
      toast("Manager logged out");
      state.view = { page: "home" };
      render();
    });

    $("#mgrAdd").addEventListener("click", () => openManagerEditModal(null));

    const headers = { Authorization: `Bearer ${token}` };

    let all = [];
    try {
      const data = await apiManager("/api/manager/items")
;
      all = data?.items || [];
    } catch (e) {
      $("#mgrList").innerHTML = `<div class="error">Failed: ${escapeHtml(e?.message || "")}</div>`;
      return;
    }

    function draw(filter = "") {
      const q = norm(filter);
      const list = all
        .filter((x) => !q || norm(x.name).includes(q))
        .sort((a, b) => norm(a.category).localeCompare(norm(b.category)) || norm(a.name).localeCompare(norm(b.name)));

      $("#mgrList").innerHTML = `
        <div class="card-title">Items (${list.length})</div>
        <div class="muted">Tap an item to edit.</div>
        <div style="height:10px;"></div>
        <section class="list">
          ${
            list.length
              ? list.map((it) => `
                <button class="list-row" data-mid="${it.id}" type="button">
                  <div class="list-row-main">
                    <div class="list-row-title">${escapeHtml(it.name)}</div>
                    <div class="list-row-sub">${escapeHtml(it.category)}${it.sub_category ? ` • ${escapeHtml(it.sub_category)}` : ""} • shelf ${escapeHtml(String(it.shelf_life_days ?? ""))}</div>
                  </div>
                  <div class="chev">›</div>
                </button>
              `).join("")
              : `<div class="empty">No items.</div>`
          }
        </section>
      `;

      $("#mgrList").querySelectorAll("[data-mid]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.getAttribute("data-mid"));
          const it = all.find((x) => Number(x.id) === id);
          if (!it) return;
          openManagerEditModal(it);
        });
      });
    }

    draw("");

    $("#mgrSearch").addEventListener("input", (e) => draw(e.target.value || ""));

    async function openManagerEditModal(item) {
      const isNew = !item;
      const it = item || { name: "", category: "Prepared items", sub_category: null, shelf_life_days: 0 };

      modalTitleEl.textContent = isNew ? "Add Item" : "Edit Item";

      modalBody.innerHTML = `
        <div class="modal-item-title">${isNew ? "New item" : escapeHtml(it.name)}</div>

        <div class="field">
          <label class="label">Name</label>
          <input id="miName" class="input" value="${escapeHtml(it.name)}" />
        </div>

        <div class="field">
          <label class="label">Category</label>
          <select id="miCat" class="input">
            ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${canonicalCategory(it.category) === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label class="label">Sauce Sub-category (only if Category = Sauce)</label>
          <select id="miSub" class="input">
            <option value="">(none)</option>
            ${SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s)}" ${it.sub_category === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select>
          <div class="helper">If category is not Sauce, sub-category should be empty.</div>
        </div>

        <div class="field">
          <label class="label">Shelf life (days)</label>
          <input id="miSL" class="input" inputmode="numeric" value="${escapeHtml(String(it.shelf_life_days ?? 0))}" />
          <div class="helper">>7 days becomes manual in app.</div>
        </div>

        <div id="miErr" class="error hidden"></div>

        <div class="field" style="display:flex; gap:10px;">
          <button id="miSave" class="btn btn-primary" type="button" style="flex:1;">Save</button>
          ${isNew ? "" : `<button id="miDel" class="btn btn-ghost" type="button">Delete</button>`}
          <button id="miCancel" class="btn btn-ghost" type="button">Cancel</button>
        </div>
      `;

      $("#miCancel").addEventListener("click", closeModal);

      $("#miSave").addEventListener("click", async () => {
        const errEl = $("#miErr");
        errEl.classList.add("hidden");
        errEl.textContent = "";

        const name = ($("#miName").value || "").trim();
        const category = ($("#miCat").value || "").trim();
        const sub = ($("#miSub").value || "").trim();
        const sl = Number(($("#miSL").value || "").trim());

        if (!name) {
          errEl.textContent = "Name required.";
          errEl.classList.remove("hidden");
          return;
        }
        if (!category) {
          errEl.textContent = "Category required.";
          errEl.classList.remove("hidden");
          return;
        }
        if (!Number.isFinite(sl) || sl < 0) {
          errEl.textContent = "Shelf life must be a number ≥ 0.";
          errEl.classList.remove("hidden");
          return;
        }

        const body = {
          name,
          category,
          sub_category: category === "Sauce" ? (sub || null) : null,
          shelf_life_days: sl,
        };

        try {
          if (isNew) {
            const out = await apiPost("/api/manager/items", body, headers);
            all.push(out.item);
          } else {
            const out = await apiPut(`/api/manager/items/${it.id}`, body, headers);
            const idx = all.findIndex((x) => Number(x.id) === Number(it.id));
            if (idx >= 0) all[idx] = out.item;
          }

          // refresh public items in app memory too
          await loadItems();

          closeModal();
          draw($("#mgrSearch").value || "");
          toast("Saved");
        } catch (e) {
          errEl.textContent = e?.message || "Save failed.";
          errEl.classList.remove("hidden");
        }
      });

      if (!isNew) {
        $("#miDel").addEventListener("click", async () => {
          const errEl = $("#miErr");
          errEl.classList.add("hidden");
          errEl.textContent = "";

          if (!confirm("Delete this item?")) return;

          try {
            await apiDelete(`/api/manager/items/${it.id}`, headers);
            all = all.filter((x) => Number(x.id) !== Number(it.id));

            await loadItems();

            closeModal();
            draw($("#mgrSearch").value || "");
            toast("Deleted");
          } catch (e) {
            errEl.textContent = e?.message || "Delete failed.";
            errEl.classList.remove("hidden");
          }
        });
      }

      showModal();
    }
  }

  // -----------------------------
  // Swipe right back (like iOS)
  // -----------------------------
  let touchX0 = 0;
  let touchY0 = 0;

  function goBackSmart() {
    const v = state.view?.page;

    if (v === "category") {
      if (state.view.category === "Sauce") state.view = { page: "sauce_menu" };
      else state.view = { page: "home" };
      render();
      return;
    }
    if (v === "sauce_menu" || v === "alerts" || v === "manager") {
      state.view = { page: "home" };
      render();
      return;
    }
  }

  document.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      touchX0 = e.touches[0].clientX;
      touchY0 = e.touches[0].clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!e.changedTouches || e.changedTouches.length !== 1) return;
      const x1 = e.changedTouches[0].clientX;
      const y1 = e.changedTouches[0].clientY;

      const dx = x1 - touchX0;
      const dy = y1 - touchY0;

      if (dx > 80 && Math.abs(dy) < 60) {
        if (state.modalOpen) return;
        goBackSmart();
      }
    },
    { passive: true }
  );

  // -----------------------------
  // Toast
  // -----------------------------
  let toastTimer = null;
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;

    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.remove();
    }, 1600);
  }

  // -----------------------------
  // Main render
  // -----------------------------
  async function render() {
    // session gate
    if (!state.session) {
      state.view = { page: "session" };
    }

    if (state.loading) {
      renderLoading();
      return;
    }

    // desktop buttons fallback
    const inApp = !!state.session;
    btnHome.classList.toggle("hidden", !inApp);
    btnAlerts.classList.toggle("hidden", !inApp);
    btnLogout.classList.toggle("hidden", !inApp);

    if (state.view.page === "session") return renderSession();
    if (state.view.page === "home") return renderHome();
    if (state.view.page === "sauce_menu") return renderSauceMenu();
    if (state.view.page === "category") return renderCategoryList();
    if (state.view.page === "alerts") return renderAlerts();
    if (state.view.page === "manager") return renderManager();

    // fallback
    state.view = { page: "home" };
    renderHome();
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    updateSessionPill();

    // nav handlers
    if (btnHome) btnHome.addEventListener("click", () => { state.view = { page: "home" }; render(); });
    if (btnAlerts) btnAlerts.addEventListener("click", () => { state.view = { page: "alerts" }; render(); });
    if (btnLogout) btnLogout.addEventListener("click", logout);

    if (navHome) navHome.addEventListener("click", () => { state.view = { page: "home" }; render(); });
    if (navAlerts) navAlerts.addEventListener("click", () => { state.view = { page: "alerts" }; render(); });
    if (navManager) navManager.addEventListener("click", () => openManagerLogin());
    if (navLogout) navLogout.addEventListener("click", logout);

    // load items if session exists
    if (state.session) {
      try {
        await loadItems();
        state.view = { page: "home" };
      } catch {
        // if API down, still show session
        state.session = null;
        clearSession();
        state.view = { page: "session" };
      }
    }

    render();
  }

  boot();
})();
