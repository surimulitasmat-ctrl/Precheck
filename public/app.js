/* PreCheck - public/app.js (FULL FILE — copy/paste top-to-bottom)
   Assumes index.html contains:
   #main, #modalBackdrop, #modalTitle, #modalBody, #modalClose
   #btnHome, #btnAlerts, #btnLogout, #sessionPill
*/

(() => {
  // -----------------------------
  // DOM helpers
  // -----------------------------
  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // "24 May 2026"
  function formatDateLong(d) {
    const day = d.getDate();
    const month = d.toLocaleString(undefined, { month: "short" });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }

  function todayLocalMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  function endOfDay2359(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
  }

  function toIso(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function normalizeName(n) {
    return String(n ?? "").trim();
  }

  function normalizeCat(c) {
    return String(c ?? "").trim();
  }

  // -----------------------------
  // Session storage
  // -----------------------------
  const SESSION_KEY = "precheck_session_v1";

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.store || !obj?.shift || !obj?.staff) return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveSession(sess) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // -----------------------------
  // App state
  // -----------------------------
  const state = {
    session: null,
    items: [],
    view: { page: "session", category: null, sauceSub: null }, // session | home | sauce_menu | category | alerts
  };

  // -----------------------------
  // Final Menus
  // -----------------------------
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

  // -----------------------------
  // Expiry rules
  // MANUAL = DATE ONLY (no time)
  // -----------------------------
  const FORCE_MANUAL_NAMES = new Set([
    "Canola Oil",
    "Salt Open Inner",
    "Pepper Open Inner",
    "Olive Open Bottle",
    "Parmesan Oregano",
    "Shallot",
    "Honey Oat",
    "Parmesan Open Inner",
    "Shallot Open Inner",
    "Honey Oat Open Inner",
    "Salt",
    "Pepper",
    "Cookies",
    "Olive Oil",
    "Milo",
    "Tea Bag",
    "Cajun Spice Packet",
  ]);

  const HOURLY_FIXED_NAMES = new Set(["Bread", "Tomato Soup (H)", "Mushroom Soup (H)"]);
  const EOD_NAMES = new Set(["Chicken Bacon"]);

  // Your DB has "Beef Taco" in Front counter. Treat that as SKH-only HOURLY, show label "(H)".
  const BEEF_TACO_H_LABEL = "Beef Taco (H)";
  function isFrontCounterBeefTaco(item) {
    return normalizeCat(item.category) === "Front counter" && normalizeName(item.name) === "Beef Taco";
  }

  function getEffectiveShelfLifeDays(item) {
    // Special rule: Cajun Spice Open Inner => AUTO 5 days
    if (normalizeName(item.name) === "Cajun Spice Open Inner") return 5;

    const raw = Number(item.shelf_life_days);
    return Number.isFinite(raw) ? raw : 0;
  }

  function getExpiryMode(item) {
    const name = normalizeName(item.name);
    const category = normalizeCat(item.category);

    // Unopened chiller always manual date
    if (category === "Unopened chiller") return "MANUAL_DATE";

    // Shelf life > 7 => manual date
    if (getEffectiveShelfLifeDays(item) > 7) return "MANUAL_DATE";

    // Forced manual names => manual date
    if (FORCE_MANUAL_NAMES.has(name)) return "MANUAL_DATE";

    // Beef Taco in Front counter => HOURLY (SKH only)
    if (isFrontCounterBeefTaco(item)) return "HOURLY";

    // Hourly fixed
    if (HOURLY_FIXED_NAMES.has(name)) return "HOURLY_FIXED";

    // EOD
    if (EOD_NAMES.has(name)) return "EOD";

    // Default AUTO
    return "AUTO";
  }

  function getHelperText(item) {
    const mode = getExpiryMode(item);
    if (mode === "AUTO") return "Select expiry date.";
    if (mode === "MANUAL_DATE") return "Select expiry date.";
    if (mode === "EOD") return "Expiry will be saved as end of day (23:59).";
    if (mode === "HOURLY") return "Select expiry time.";
    if (mode === "HOURLY_FIXED") return "Select expiry time (11am / 3pm / 7pm / 11pm).";
    return "";
  }

  // -----------------------------
  // API
  // -----------------------------
  async function apiGet(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) throw new Error(json?.error || text || `POST ${url} failed: ${res.status}`);
    return json;
  }

  function applyStoreRules(items) {
    const store = state.session?.store;

    return (items || [])
      .filter((it) => {
        // Hide Front counter Beef Taco for PDD
        if (isFrontCounterBeefTaco(it) && store !== "SKH") return false;
        return true;
      })
      .map((it) => {
        // For SKH, display it as Beef Taco (H)
        if (isFrontCounterBeefTaco(it) && store === "SKH") return { ...it, name: BEEF_TACO_H_LABEL };
        return it;
      });
  }

  async function loadItems() {
    const items = await apiGet("/api/items");
    state.items = applyStoreRules(items);
  }

  // -----------------------------
  // UI Elements
  // -----------------------------
  const main = $("#main");
  const modalBackdrop = $("#modalBackdrop");
  const modalTitle = $("#modalTitle");
  const modalBody = $("#modalBody");
  const modalClose = $("#modalClose");

  const btnHome = $("#btnHome");
  const btnAlerts = $("#btnAlerts");
  const btnLogout = $("#btnLogout");
  const sessionPill = $("#sessionPill");

  // If any required nodes missing -> show error instead of blank
  const required = { main, modalBackdrop, modalTitle, modalBody, modalClose, btnHome, btnAlerts, btnLogout, sessionPill };
  for (const [k, v] of Object.entries(required)) {
    if (!v) {
      document.body.innerHTML = `<div style="padding:16px;font-family:system-ui;color:#fff;background:#111">
        Missing required element: <b>${escapeHtml(k)}</b>. Check your <code>index.html</code> IDs.
      </div>`;
      return;
    }
  }

  function setTopbarVisible(visible) {
    btnHome.classList.toggle("hidden", !visible);
    btnAlerts.classList.toggle("hidden", !visible);
    btnLogout.classList.toggle("hidden", !visible);
    sessionPill.classList.toggle("hidden", !visible);
  }

  function updateSessionPill() {
    if (!state.session) return;
    sessionPill.textContent = `${state.session.store} • ${state.session.shift} • ${state.session.staff}`;
  }

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalBackdrop.classList.remove("hidden");
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
    modalBody.innerHTML = "";
  }

  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  btnHome.addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  btnAlerts.addEventListener("click", () => {
    state.view = { page: "alerts", category: null, sauceSub: null };
    render();
  });

  btnLogout.addEventListener("click", () => {
    clearSession();
    state.session = null;
    state.items = [];
    state.view = { page: "session", category: null, sauceSub: null };
    render();
  });

  // -----------------------------
  // Session screen
  // -----------------------------
  function renderSession() {
    setTopbarVisible(false);

    main.innerHTML = `
      <section class="card">
        <h1 class="h1">Start Session</h1>

        <div class="field">
          <label class="label">Store</label>
          <select id="storeSelect" class="input">
            <option value="">Select store</option>
            <option value="PDD">PDD</option>
            <option value="SKH">SKH</option>
          </select>
        </div>

        <div class="field">
          <label class="label">Shift</label>
          <select id="shiftSelect" class="input">
            <option value="">Select shift</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>

        <div class="field">
          <label class="label">Staff</label>
          <input id="staffInput" class="input" type="text" placeholder="Enter staff name/ID" />
        </div>

        <button id="startBtn" class="btn btn-primary" type="button">Continue</button>
        <div id="sessionError" class="error"></div>
      </section>
    `;

    const storeSelect = $("#storeSelect");
    const shiftSelect = $("#shiftSelect");
    const staffInput = $("#staffInput");
    const startBtn = $("#startBtn");
    const sessionError = $("#sessionError");

    const old = loadSession();
    if (old) {
      storeSelect.value = old.store || "";
      shiftSelect.value = old.shift || "";
      staffInput.value = old.staff || "";
    }

    startBtn.addEventListener("click", async () => {
      sessionError.textContent = "";
      const store = storeSelect.value;
      const shift = shiftSelect.value;
      const staff = staffInput.value.trim();

      if (!store || !shift || !staff) {
        sessionError.textContent = "Please select Store, Shift, and enter Staff.";
        return;
      }

      state.session = { store, shift, staff };
      saveSession(state.session);

      try {
        await loadItems();
      } catch (e) {
        sessionError.textContent = `Failed to load items: ${e.message}`;
        return;
      }

      updateSessionPill();
      state.view = { page: "home", category: null, sauceSub: null };
      render();
    });
  }

  // -----------------------------
  // Home
  // -----------------------------
  function renderHome() {
    setTopbarVisible(true);
    updateSessionPill();

    main.innerHTML = `
      <section class="grid">
        ${CATEGORIES.map(
          (cat) => `
          <button class="tile" data-cat="${escapeHtml(cat)}" type="button">
            <div class="tile-title">${escapeHtml(cat)}</div>
          </button>`
        ).join("")}
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

  // -----------------------------
  // Sauce menu
  // -----------------------------
  function renderSauceMenu() {
    setTopbarVisible(true);
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
            <div class="tile-title">${escapeHtml(s)}</div>
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

  // -----------------------------
  // Category list
  // -----------------------------
  function getItemsForCurrentList() {
    const { category, sauceSub } = state.view;

    let list = state.items.filter((it) => normalizeCat(it.category) === category);

    if (category === "Sauce") {
      list = list.filter((it) => (it.sub_category || "") === (sauceSub || ""));
    }

    list.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));
    return list;
  }

  function renderCategoryList() {
    setTopbarVisible(true);
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
        if (item) openLogModal(item);
      });
    });
  }

  // -----------------------------
  // Expiry input builders
  // -----------------------------
  function buildAutoDateOptions(shelfLifeDays) {
    const base = todayLocalMidnight();
    const options = [];
    for (let i = 0; i <= shelfLifeDays; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 0, 0, 0, 0);
      options.push({
        label: formatDateLong(d),
        value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      });
    }
    return options;
  }

  function buildHourlyTimeOptions(stepMinutes = 30) {
    const opts = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += stepMinutes) {
        const hh = pad2(h);
        const mm = pad2(m);
        const d = new Date(2000, 0, 1, h, m, 0, 0);
        const label = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        opts.push({ label, value: `${hh}:${mm}` });
      }
    }
    return opts;
  }

  function buildHourlyFixedOptions() {
    return [
      { label: "11:00 AM", value: "11:00" },
      { label: "3:00 PM", value: "15:00" },
      { label: "7:00 PM", value: "19:00" },
      { label: "11:00 PM", value: "23:00" },
    ];
  }

  // -----------------------------
  // Log modal
  // -----------------------------
  function openLogModal(item) {
    const mode = getExpiryMode(item);
    const shelfLife = getEffectiveShelfLifeDays(item);

    let expiryFieldHtml = "";

    if (mode === "AUTO") {
      const options = buildAutoDateOptions(shelfLife)
        .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join("");
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Date</label>
          <select id="expirySelect" class="input">
            <option value="">Select date</option>
            ${options}
          </select>
          <div class="helper">${escapeHtml(getHelperText(item))}</div>
        </div>
      `;
    }

    if (mode === "MANUAL_DATE") {
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Date</label>
          <input id="expiryDate" class="input" type="date" />
          <div class="helper">${escapeHtml(getHelperText(item))}</div>
        </div>
      `;
    }

    if (mode === "EOD") {
      const label = `${formatDateLong(todayLocalMidnight())} • 23:59`;
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry</label>
          <div class="pill">${escapeHtml(label)}</div>
          <div class="helper">${escapeHtml(getHelperText(item))}</div>
        </div>
      `;
    }

    if (mode === "HOURLY") {
      const options = buildHourlyTimeOptions(30)
        .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join("");
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Time</label>
          <select id="expiryTime" class="input">
            <option value="">Select time</option>
            ${options}
          </select>
          <div class="helper">${escapeHtml(getHelperText(item))}</div>
        </div>
      `;
    }

    if (mode === "HOURLY_FIXED") {
      const options = buildHourlyFixedOptions()
        .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join("");
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Time</label>
          <select id="expiryTimeFixed" class="input">
            <option value="">Select time</option>
            ${options}
          </select>
          <div class="helper">${escapeHtml(getHelperText(item))}</div>
        </div>
      `;
    }

    openModal(
      "Log Item",
      `
      <div class="modal-item-title">${escapeHtml(item.name)}</div>

      <div class="field">
        <label class="label">Quantity (optional)</label>
        <input id="qtyInput" class="input" type="number" inputmode="numeric" placeholder="Leave blank if not needed" />
        <div class="helper">Blank allowed. 0 allowed.</div>
      </div>

      ${expiryFieldHtml}

      <div id="formError" class="error"></div>
      <button id="saveBtn" class="btn btn-primary" type="button">Save</button>
    `
    );

    $("#saveBtn").addEventListener("click", async () => {
      $("#formError").textContent = "";

      const qtyRaw = $("#qtyInput")?.value;
      const qty = qtyRaw === "" || qtyRaw === null || qtyRaw === undefined ? null : Number(qtyRaw);

      let expiryIso = null;

      if (mode === "AUTO") {
        const v = $("#expirySelect").value;
        if (!v) return ($("#formError").textContent = "Please select an expiry date.");
        const [yy, mm, dd] = v.split("-").map(Number);
        expiryIso = toIso(endOfDay2359(new Date(yy, mm - 1, dd)));
      }

      if (mode === "MANUAL_DATE") {
        const v = $("#expiryDate").value;
        if (!v) return ($("#formError").textContent = "Please select an expiry date.");
        const [yy, mm, dd] = v.split("-").map(Number);
        expiryIso = toIso(endOfDay2359(new Date(yy, mm - 1, dd)));
      }

      if (mode === "EOD") {
        expiryIso = toIso(endOfToday2359());
      }

      if (mode === "HOURLY") {
        const v = $("#expiryTime").value;
        if (!v) return ($("#formError").textContent = "Please select an expiry time.");
        const base = todayLocalMidnight();
        const [hh, mi] = v.split(":").map(Number);
        expiryIso = toIso(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mi, 0, 0));
      }

      if (mode === "HOURLY_FIXED") {
        const v = $("#expiryTimeFixed").value;
        if (!v) return ($("#formError").textContent = "Please select an expiry time.");
        const base = todayLocalMidnight();
        const [hh, mi] = v.split(":").map(Number);
        expiryIso = toIso(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mi, 0, 0));
      }

      try {
        await apiPost("/api/log", {
          item_id: item.id,
          store: state.session.store,
          shift: state.session.shift,
          staff: state.session.staff,
          quantity: qty,
          expiry: expiryIso,
        });
        closeModal();
        showToast("Saved");
      } catch (e) {
        $("#formError").textContent = e.message || "Save failed.";
      }
    });
  }

  // -----------------------------
  // Alerts page
  // -----------------------------
  async function renderAlerts() {
    setTopbarVisible(true);
    updateSessionPill();

    main.innerHTML = `
      <div class="page-head">
        <div class="page-title">Alerts</div>
      </div>

      <section class="card">
        <div class="card-title">Expiry Alerts</div>
        <div id="expiryAlerts" class="muted">Loading…</div>
      </section>

      <section class="card">
        <div class="card-title">Low Stock</div>
        <div id="lowStock" class="muted">Loading…</div>
      </section>
    `;

    const store = state.session.store;

    try {
      const expiry = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
      $("#expiryAlerts").innerHTML = renderAlertList(expiry || [], "expiry");
    } catch (e) {
      $("#expiryAlerts").textContent = `Failed: ${e.message}`;
    }

    try {
      const low = await apiGet(`/api/low_stock?store=${encodeURIComponent(store)}`);
      $("#lowStock").innerHTML = renderAlertList(low || [], "low");
    } catch (e) {
      $("#lowStock").textContent = `Failed: ${e.message}`;
    }
  }

  function renderAlertList(list, kind) {
    if (!list || list.length === 0) return `<div class="empty">No alerts.</div>`;

    return `<div class="alert-list">${
      list
        .map((x) => {
          const name = x.name || `Item ${x.item_id || ""}`;
          const extra =
            kind === "expiry"
              ? (x.expiry ? new Date(x.expiry).toLocaleString() : "")
              : (x.quantity !== undefined && x.quantity !== null ? `Qty: ${x.quantity}` : "");
          return `
            <div class="alert-row">
              <div class="alert-name">${escapeHtml(name)}</div>
              <div class="alert-extra">${escapeHtml(String(extra || ""))}</div>
            </div>
          `;
        })
        .join("")
    }</div>`;
  }

  // -----------------------------
  // Toast
  // -----------------------------
  let toastTimer = null;
  function showToast(msg) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast hidden";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1200);
  }

  // -----------------------------
  // Router / Render
  // -----------------------------
  function render() {
    if (!state.session) return renderSession();

    if (state.view.page === "home") return renderHome();
    if (state.view.page === "sauce_menu") return renderSauceMenu();
    if (state.view.page === "category") return renderCategoryList();
    if (state.view.page === "alerts") return renderAlerts();
    return renderHome();
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    state.session = loadSession();

    if (state.session) {
      try {
        await loadItems();
        state.view = { page: "home", category: null, sauceSub: null };
      } catch {
        clearSession();
        state.session = null;
        state.view = { page: "session", category: null, sauceSub: null };
      }
    }

    render();
  }

  boot();
})();
