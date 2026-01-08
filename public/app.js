/* PreCheck app.js — works with current index.html + style.css */
(() => {
  "use strict";

  // ----------------------------
  // DOM
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  const sessionPill = $("#sessionPill");
  const btnHome = $("#btnHome");
  const btnAlerts = $("#btnAlerts");
  const btnLogout = $("#btnLogout");
  const main = $("#main");

  const modalBackdrop = $("#modalBackdrop");
  const modalTitleEl = $("#modalTitle");
  const modalBody = $("#modalBody");
  const modalClose = $("#modalClose");

  // Toast element (created if missing)
  let toastEl = $(".toast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast hidden";
    document.body.appendChild(toastEl);
  }

  // ----------------------------
  // Config / Rules
  // ----------------------------
  const API = ""; // same origin
  const LS_KEY = "precheck_session_v2";

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

  // Must be MANUAL date-only always
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
    ].map(norm)
  );

  // HOURLY_FIXED time dropdown
  const HOURLY_FIXED_ITEMS = new Set(
    ["bread", "tomato soup (h)", "mushroom soup (h)"].map(norm)
  );

  // EOD items
  const EOD_ITEMS = new Set(["chicken bacon"].map(norm));

  // HOURLY items (time dropdown)
  // (Front counter Beef Taco treated as HOURLY for SKH; hidden for PDD)
  const HOURLY_ITEMS = new Set(["beef taco (h)"].map(norm));

  const HOURLY_FIXED_TIMES = [
    { label: "11:00 AM", value: "11:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "7:00 PM", value: "19:00" },
    { label: "11:00 PM", value: "23:00" },
  ];

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    session: loadSession(),
    items: [],
    view: { page: "session", category: null, sauceSub: null },
    modalItem: null,
    alerts: { expiry: [], low: [], lowNotConfigured: false },
  };

  // ----------------------------
  // Boot
  // ----------------------------
  bindNav();
  bindModal();

  (async function boot() {
    if (!state.session) {
      state.view = { page: "session", category: null, sauceSub: null };
      render();
      return;
    }
    await loadItems();
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  })();

  // ----------------------------
  // Navigation + modal binding
  // ----------------------------
  function bindNav() {
    btnHome.addEventListener("click", () => {
      state.view = { page: "home", category: null, sauceSub: null };
      render();
    });

    btnAlerts.addEventListener("click", async () => {
      state.view = { page: "alerts", category: null, sauceSub: null };
      await loadAlerts();
      render();
    });

    btnLogout.addEventListener("click", () => {
      saveSession(null);
      state.session = null;
      state.items = [];
      state.view = { page: "session", category: null, sauceSub: null };
      render();
    });
  }

  function bindModal() {
    modalClose.addEventListener("click", closeModal);
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  // ----------------------------
  // Data
  // ----------------------------
  async function loadItems() {
    try {
      const res = await fetch(`${API}/api/items`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Failed to load items (${res.status})`);
      const raw = await res.json();

      const cleaned = raw.map((it) => ({
        id: Number(it.id),
        name: (it.name || "").trim(),
        category: canonicalCategory(it.category),
        sub_category: it.sub_category ? String(it.sub_category).trim() : null,
        shelf_life_days: Number(it.shelf_life_days ?? 0),
      }));

      const store = state.session?.store || "PDD";

      // Enforce SKH-only Front counter Beef Taco
      state.items = cleaned.filter((it) => {
        const cat = canonicalCategory(it.category);
        const nm = norm(it.name);

        if (cat === "Front counter" && nm === norm("Beef Taco")) {
          return store === "SKH";
        }
        if (nm === norm("Beef Taco (H)")) {
          return store === "SKH";
        }
        return true;
      });
    } catch (e) {
      console.error(e);
      showToast(String(e.message || e), true);
      state.items = [];
    }
  }

  async function loadAlerts() {
    state.alerts = { expiry: [], low: [], lowNotConfigured: false };
    const store = state.session?.store || "PDD";

    // expiry
    try {
      const r = await fetch(`${API}/api/expiry?store=${encodeURIComponent(store)}`);
      if (r.ok) state.alerts.expiry = await r.json();
    } catch {}

    // low stock (optional)
    try {
      const r2 = await fetch(`${API}/api/low_stock?store=${encodeURIComponent(store)}`);
      if (r2.status === 404) state.alerts.lowNotConfigured = true;
      else if (r2.ok) state.alerts.low = await r2.json();
    } catch {}
  }

  // ----------------------------
  // Render router
  // ----------------------------
  function render() {
    updateTopbar();

    switch (state.view.page) {
      case "session":
        return renderSession();
      case "home":
        return renderHome();
      case "sauce_menu":
        return renderSauceMenu();
      case "category":
        return renderCategoryList();
      case "alerts":
        return renderAlerts();
      default:
        state.view = { page: state.session ? "home" : "session", category: null, sauceSub: null };
        return render();
    }
  }

  function updateTopbar() {
    const hasSession = !!state.session;

    // session pill
    if (hasSession) {
      sessionPill.classList.remove("hidden");
      sessionPill.textContent = `${state.session.store} • ${state.session.shift} • ${state.session.staff}`;
    } else {
      sessionPill.classList.add("hidden");
      sessionPill.textContent = "";
    }

    // buttons
    toggleHidden(btnHome, !hasSession);
    toggleHidden(btnAlerts, !hasSession);
    toggleHidden(btnLogout, !hasSession);
  }

  // ----------------------------
  // Session page
  // ----------------------------
  function renderSession() {
    main.innerHTML = `
      <div class="card">
        <div class="h1">Start Session</div>
        <div class="muted">Select store, shift, and staff.</div>

        <div class="field">
          <div class="label">Store</div>
          <select id="sStore" class="input">
            <option value="">Select store</option>
            <option value="PDD">PDD</option>
            <option value="SKH">SKH</option>
          </select>
        </div>

        <div class="field">
          <div class="label">Shift</div>
          <select id="sShift" class="input">
            <option value="">Select shift</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>

        <div class="field">
          <div class="label">Staff</div>
          <input id="sStaff" class="input" placeholder="Enter name / ID" maxlength="30"/>
        </div>

        <button id="sStart" class="btn btn-primary" type="button">Start</button>
      </div>
    `;

    const sStore = $("#sStore");
    const sShift = $("#sShift");
    const sStaff = $("#sStaff");
    const sStart = $("#sStart");

    const existing = loadSession();
    if (existing) {
      sStore.value = existing.store || "";
      sShift.value = existing.shift || "";
      sStaff.value = existing.staff || "";
    }

    sStart.addEventListener("click", async () => {
      const store = (sStore.value || "").trim();
      const shift = (sShift.value || "").trim();
      const staff = (sStaff.value || "").trim();

      if (!store) return showToast("Please select store.", true);
      if (!shift) return showToast("Please select shift.", true);
      if (!staff) return showToast("Please enter staff.", true);

      state.session = { store, shift, staff };
      saveSession(state.session);

      await loadItems();
      state.view = { page: "home", category: null, sauceSub: null };
      render();
    });
  }

  // ----------------------------
  // Home page (emoji tiles)
  // ----------------------------
  function renderHome() {
    const counts = {};
    for (const c of CATEGORIES) counts[c] = 0;
    for (const it of state.items) {
      const cat = canonicalCategory(it.category);
      if (counts[cat] !== undefined) counts[cat]++;
    }

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
      </section>
    `;

    main.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-cat");
        if (cat === "Sauce") state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
        else state.view = { page: "category", category: cat, sauceSub: null };
        render();
      });
    });
  }

  // ----------------------------
  // Sauce menu
  // ----------------------------
  function renderSauceMenu() {
    main.innerHTML = `
      <div class="page-head">
        <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
        <div class="page-title">Sauce</div>
      </div>

      <section class="grid">
        ${SAUCE_SUBS.map(
          (s) => `
          <button class="tile tile--green" data-sauce="${escapeHtml(s)}" type="button">
            <div class="tile-title">${escapeHtml(s)}</div>
            <div class="tile-sub">Tap to view items</div>
          </button>`
        ).join("")}
      </section>
    `;

    $("#backBtn").addEventListener("click", () => {
      state.view = { page: "home", category: null, sauceSub: null };
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

  // ----------------------------
  // Category list
  // ----------------------------
  function getItemsForCurrentList() {
    const { category, sauceSub } = state.view;

    let list = state.items.filter((it) => canonicalCategory(it.category) === category);

    if (category === "Sauce") {
      list = list.filter((it) => (it.sub_category || "") === (sauceSub || ""));
    }

    list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
    return list;
  }

  function renderCategoryList() {
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

    $("#backBtn").addEventListener("click", () => {
      if (category === "Sauce") state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
      else state.view = { page: "home", category: null, sauceSub: null };
      render();
    });

    main.querySelectorAll("[data-item-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-item-id"));
        const item = state.items.find((x) => Number(x.id) === id);
        if (!item) return;
        openLogModal(item);
      });
    });
  }

  // ----------------------------
  // Alerts page
  // ----------------------------
  function renderAlerts() {
    const exp = state.alerts.expiry || [];
    const low = state.alerts.low || [];

    main.innerHTML = `
      <div class="card">
        <div class="card-title">Expiry Alerts</div>
        ${
          exp.length
            ? exp
                .map(
                  (a) => `
          <div class="alert-row">
            <div>
              <div class="alert-name">${escapeHtml(a.name || a.item_name || "Item")}</div>
              <div class="alert-extra">${escapeHtml(a.category || "")}</div>
            </div>
            <div class="alert-extra">${escapeHtml(a.expiry || a.expiry_at || a.message || "")}</div>
          </div>`
                )
                .join("")
            : `<div class="muted">No expiry alerts.</div>`
        }
      </div>

      <div class="card">
        <div class="card-title">Low Stock</div>
        ${
          state.alerts.lowNotConfigured
            ? `<div class="muted">Low stock not enabled yet.</div>`
            : low.length
            ? low
                .map(
                  (a) => `
          <div class="alert-row">
            <div>
              <div class="alert-name">${escapeHtml(a.name || a.item_name || "Item")}</div>
              <div class="alert-extra">${escapeHtml(a.category || "")}</div>
            </div>
            <div class="alert-extra">${escapeHtml(a.qty ?? a.quantity ?? a.message ?? "")}</div>
          </div>`
                )
                .join("")
            : `<div class="muted">No low stock alerts.</div>`
        }
      </div>
    `;
  }

  // ----------------------------
  // Modal: log item
  // ----------------------------
  function openLogModal(item) {
    state.modalItem = item;
    modalTitleEl.textContent = "Log Item";

    const mode = getMode(item);
    modalBody.innerHTML = `
      <div class="modal-item-title">${escapeHtml(item.name)}</div>

      <div class="field">
        <div class="label">Quantity (optional)</div>
        <input id="qtyInput" class="input" inputmode="decimal" placeholder="Leave blank if not needed" />
        <div class="helper">Blank allowed. 0 allowed.</div>
      </div>

      ${buildExpiryUi(item, mode)}

      <div class="field">
        <button id="saveBtn" class="btn btn-primary" type="button">Save</button>
        <div class="helper">${escapeHtml(getHelperText(item))}</div>
      </div>
    `;

    $("#saveBtn").addEventListener("click", () => saveLog(item, mode));

    showModal();
  }

  async function saveLog(item, mode) {
    const qtyRaw = ($("#qtyInput").value || "").trim();
    const qty = qtyRaw === "" ? null : Number(qtyRaw);

    if (qtyRaw !== "" && Number.isNaN(qty)) {
      showToast("Quantity must be a number (or leave blank).", true);
      return;
    }

    const expiryAtIso = getExpiryAtFromUi(item, mode);
    if (!expiryAtIso) return;

   const payload = {
  // session
  store: state.session.store,
  staff: state.session.staff,
  shift: state.session.shift,

  // item
  item_id: Number(item.id),
  itemId: Number(item.id),
  name: item.name,
  item_name: item.name,
  category: canonicalCategory(item.category),
  sub_category: item.sub_category || null,

  // qty (optional)
  qty: qty,
  quantity: qty,

  // expiry (send multiple keys so server always receives what it expects)
  expiry_at: expiryAtIso,
  expiryAt: expiryAtIso,
  expiry: expiryAtIso,
  expiry_datetime: expiryAtIso,
  expiry_date: expiryAtIso,
};


    try {
      const r = await fetch(`${API}/api/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const out = await safeJson(r);
      if (!r.ok) throw new Error(out?.error || `Save failed (${r.status})`);

      showToast("Saved ✅");
      closeModal();
    } catch (e) {
      console.error(e);
      showToast(String(e.message || e), true);
    }
  }

  function showModal() {
    modalBackdrop.classList.remove("hidden");
    modalBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
    modalBackdrop.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
    state.modalItem = null;
  }

  // ----------------------------
  // Expiry modes + UI
  // ----------------------------
  function getMode(item) {
    const cat = canonicalCategory(item.category);
    const nameN = norm(item.name);

    // Unopened chiller always manual date-only
    if (cat === "Unopened chiller") return "MANUAL_DATE";

    // Always manual list
    if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

    // Special: Cajun Spice Open Inner AUTO 5 days
    if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

    // Fixed time dropdown
    if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

    // EOD auto set 23:59 today
    if (EOD_ITEMS.has(nameN)) return "EOD";

    // Front counter Beef Taco treated as HOURLY (SKH only)
    if (canonicalCategory(item.category) === "Front counter" && nameN === norm("Beef Taco")) return "HOURLY";
    if (HOURLY_ITEMS.has(nameN)) return "HOURLY";

    // Shelf life > 7 => manual date
    const sl = getShelfLifeDays(item);
    if (sl > 7) return "MANUAL_DATE";

    // Default AUTO (date dropdown)
    return "AUTO";
  }

  function getShelfLifeDays(item) {
    const nameN = norm(item.name);
    if (nameN === norm("Cajun Spice Open Inner")) return 5;
    const n = Number(item.shelf_life_days ?? 0);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function buildExpiryUi(item, mode) {
    if (mode === "EOD") {
      return `
        <div class="field">
          <div class="label">Expiry</div>
          <div class="pill">Automatically set to end of today (23:59)</div>
        </div>
      `;
    }

    if (mode === "AUTO") {
      const days = getShelfLifeDays(item);
      const opts = buildDateOptions(days); // N+1
      return `
        <div class="field">
          <div class="label">Expiry Date</div>
          <select id="expiryDateSelect" class="input">
            <option value="">Select date</option>
            ${opts.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <div class="helper">Select expiry date.</div>
        </div>
      `;
    }

    if (mode === "MANUAL_DATE") {
      return `
        <div class="field">
          <div class="label">Expiry Date</div>
          <input id="expiryDateManual" class="input" type="date" />
          <div class="helper">Select expiry date.</div>
        </div>
      `;
    }

    if (mode === "HOURLY") {
      const times = buildHourlyTimes();
      return `
        <div class="field">
          <div class="label">Expiry Time</div>
          <select id="expiryTimeSelect" class="input">
            <option value="">Select time</option>
            ${times.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("")}
          </select>
          <div class="helper">Past time allowed.</div>
        </div>
      `;
    }

    if (mode === "HOURLY_FIXED") {
      return `
        <div class="field">
          <div class="label">Expiry Time</div>
          <select id="expiryTimeFixed" class="input">
            <option value="">Select time</option>
            ${HOURLY_FIXED_TIMES.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("")}
          </select>
          <div class="helper">Select one time. Past time allowed.</div>
        </div>
      `;
    }

    return "";
  }

  function getExpiryAtFromUi(item, mode) {
    const now = new Date();

    if (mode === "EOD") {
      return endOfDay(now).toISOString();
    }

    if (mode === "AUTO") {
      const v = ($("#expiryDateSelect")?.value || "").trim();
      if (!v) return showToast("Please select expiry date.", true), null;
      return endOfDay(parseYmdToDate(v)).toISOString();
    }

    if (mode === "MANUAL_DATE") {
      const v = ($("#expiryDateManual")?.value || "").trim();
      if (!v) return showToast("Please select expiry date.", true), null;
      return endOfDay(parseYmdToDate(v)).toISOString();
    }

    if (mode === "HOURLY") {
      const v = ($("#expiryTimeSelect")?.value || "").trim();
      if (!v) return showToast("Please select expiry time.", true), null;
      return setTimeOnDate(now, v).toISOString();
    }

    if (mode === "HOURLY_FIXED") {
      const v = ($("#expiryTimeFixed")?.value || "").trim();
      if (!v) return showToast("Please select expiry time.", true), null;
      return setTimeOnDate(now, v).toISOString();
    }

    return showToast("Expiry input missing.", true), null;
  }

  function getHelperText(item) {
    const mode = getMode(item);
    if (mode === "EOD") return "Expiry will be set to end of today.";
    if (mode === "HOURLY_FIXED") return "Select time: 11am / 3pm / 7pm / 11pm.";
    if (mode === "HOURLY") return "Select expiry time (past time allowed).";
    return "Select expiry date.";
  }

  // ----------------------------
  // Time/date option helpers
  // ----------------------------
  function buildDateOptions(shelfLifeDays) {
    const n = Number(shelfLifeDays ?? 0);
    const safeN = Number.isFinite(n) ? Math.max(0, n) : 0;

    const list = [];
    const today = startOfDay(new Date());

    for (let i = 0; i <= safeN; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push({ value: toYmd(d), label: formatHumanDate(d) });
    }
    return list;
  }

  function buildHourlyTimes() {
    const out = [];
    for (let h = 0; h <= 23; h++) {
      const value = `${String(h).padStart(2, "0")}:00`;
      out.push({ value, label: format12h(h, 0) });
    }
    return out;
  }

  function formatHumanDate(d) {
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "long" });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }

  function format12h(h, m) {
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    const mm = String(m).padStart(2, "0");
    return `${hh}:${mm} ${ampm}`;
  }

  function toYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseYmdToDate(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date();
    dt.setFullYear(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 0, 0);
    return x;
  }

  function setTimeOnDate(dateBase, hhmm) {
    const [hh, mm] = hhmm.split(":").map(Number);
    const d = new Date(dateBase);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  // ----------------------------
  // Utilities
  // ----------------------------
  function canonicalCategory(cat) {
    const c = (cat || "").trim();
    if (!c) return c;
    const n = norm(c);

    if (n === norm("High risk")) return "Unopened chiller";
    if (n === norm("High Risk")) return "Unopened chiller";

    if (n === norm("Prepared Items")) return "Prepared items";
    if (n === norm("Prepared items")) return "Prepared items";

    if (n === norm("Front Counter")) return "Front counter";
    if (n === norm("Back Counter")) return "Back counter";
    if (n === norm("Back Counter Chiller")) return "Back counter chiller";

    if (n === norm("Sauces")) return "Sauce";

    return c;
  }

  function norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toggleHidden(el, hide) {
    if (!el) return;
    el.classList.toggle("hidden", !!hide);
  }

  function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.style.background = isError ? "#c62828" : "var(--green)";
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function saveSession(sess) {
    try {
      if (!sess) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify(sess));
    } catch {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s?.store || !s?.shift || !s?.staff) return null;
      return { store: s.store, shift: s.shift, staff: s.staff };
    } catch {
      return null;
    }
  }
})();
