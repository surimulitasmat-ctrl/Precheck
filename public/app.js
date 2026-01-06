/* PreCheck - public/app.js
   Assumes backend provides:
   - GET  /api/items
   - POST /api/log
   - GET  /api/expiry?store=PDD|SKH
   - GET  /api/low_stock?store=PDD|SKH   (we add this in server.js below)
*/

(() => {
  // -----------------------------
  // Helpers
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

  // Format: "24 May 2026"
  function formatDateLong(d) {
    const day = d.getDate();
    const month = d.toLocaleString(undefined, { month: "short" }); // Jan, Feb...
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }

  // Build a Date at local midnight for "today"
  function todayLocalMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  // End of day today 23:59 local
  function endOfToday2359() {
    const t = todayLocalMidnight();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 0, 0);
  }

  // Convert Date -> ISO string for storage
  function toIso(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // -----------------------------
  // Session state
  // -----------------------------
  const SESSION_KEY = "precheck_session_v1";

  const state = {
    session: null,   // { store, shift, staff }
    items: [],       // items from Supabase
    view: {          // navigation
      page: "session",            // session | home | category | sauce_menu | alerts
      category: null,             // e.g. "Backroom"
      sauceSub: null,             // "Sandwich Unit" | "Standby" | "Open Inner"
    },
  };

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
  // Expiry mode rules (FINAL)
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

  // These MUST be MANUAL even if shelf life small/0
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
    "Cajun Spice Packet", // manual by rule
  ]);

  // HOURLY_FIXED items
  const HOURLY_FIXED_NAMES = new Set([
    "Bread",
    "Tomato Soup (H)",
    "Mushroom Soup (H)",
  ]);

  // EOD items
  const EOD_NAMES = new Set([
    "Chicken Bacon",
  ]);

  // SKH-only item rule
  const SKH_ONLY_NAME = "Beef Taco (H)";

  // Sauce subcategories (final)
  const SAUCE_SUBS = ["Sandwich Unit", "Standby", "Open Inner"];

  function normalizeName(n) {
    return String(n ?? "").trim();
  }

  function getEffectiveShelfLifeDays(item) {
    // Vegetables rule:
    // - Default AUTO
    // - Mix Green Packet shelf life = 1 day (today + 1)
    // - Other vegetables shelf life = 2 days (today + 1 + 2)
    if (item.category === "Vegetables") {
      const nm = normalizeName(item.name);
      if (nm === "Mix Green Packet") return 1;
      // If your Supabase has shelf_life_days filled and you want to use it, keep it.
      // But your FINAL rule says other vegetables = 2. So enforce 2.
      return 2;
    }

    // Cajun Spice Open Inner special rule: AUTO 5 days
    if (normalizeName(item.name) === "Cajun Spice Open Inner") {
      return 5;
    }

    const raw = Number(item.shelf_life_days);
    return Number.isFinite(raw) ? raw : 0;
  }

  function getExpiryMode(item) {
    const name = normalizeName(item.name);

    // Unopened chiller category is MANUAL
    if (item.category === "Unopened chiller") return "MANUAL";

    // Shelf life > 7 -> MANUAL
    const sl = getEffectiveShelfLifeDays(item);
    if (sl > 7) return "MANUAL";

    // Forced manual list
    if (FORCE_MANUAL_NAMES.has(name)) return "MANUAL";

    // Hourly fixed list
    if (HOURLY_FIXED_NAMES.has(name)) return "HOURLY_FIXED";

    // EOD list
    if (EOD_NAMES.has(name)) return "EOD";

    // SKH-only Beef Taco (H): HOURLY
    if (name === SKH_ONLY_NAME) return "HOURLY";

    // Default modes by category:
    // Vegetables default AUTO (handled)
    // Otherwise default AUTO unless rules override
    return "AUTO";
  }

  function getHelperText(item) {
    const mode = getExpiryMode(item);
    if (mode === "AUTO") return "Select expiry date (dropdown).";
    if (mode === "MANUAL") return "Select expiry date & time.";
    if (mode === "EOD") return "Expiry will be saved as end of day (23:59).";
    if (mode === "HOURLY") return "Select expiry time (dropdown).";
    if (mode === "HOURLY_FIXED") return "Select expiry time (11am / 3pm / 7pm / 11pm).";
    return "";
  }

  // -----------------------------
  // Data loading
  // -----------------------------
  async function apiGet(url) {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const msg = json?.error || text || `POST ${url} failed: ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  function applyStoreRules(items) {
    const store = state.session?.store;

    // Remove Beef Taco (H) for PDD
    let out = items.filter(it => {
      const nm = normalizeName(it.name);
      if (nm === SKH_ONLY_NAME && store !== "SKH") return false;
      return true;
    });

    // Ensure Beef Taco (H) is in Front counter (even if DB is wrong) for SKH:
    out = out.map(it => {
      const nm = normalizeName(it.name);
      if (nm === SKH_ONLY_NAME) {
        return { ...it, category: "Front counter" };
      }
      return it;
    });

    return out;
  }

  async function loadItems() {
    const items = await apiGet("/api/items");
    // Expect array of {id,name,category,sub_category,shelf_life_days}
    state.items = applyStoreRules(items || []);
  }

  // -----------------------------
  // UI rendering
  // -----------------------------
  const main = $("#main");
  const modalBackdrop = $("#modalBackdrop");
  const modalBody = $("#modalBody");
  const modalTitle = $("#modalTitle");
  const modalClose = $("#modalClose");

  const btnHome = $("#btnHome");
  const btnAlerts = $("#btnAlerts");
  const btnLogout = $("#btnLogout");
  const sessionPill = $("#sessionPill");

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

    // Prefill if present
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

      const sess = { store, shift, staff };
      state.session = sess;
      saveSession(sess);

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
  // Home categories
  // -----------------------------
  function renderHome() {
    setTopbarVisible(true);
    updateSessionPill();

    const tiles = CATEGORIES.map(cat => {
      return `
        <button class="tile" data-cat="${escapeHtml(cat)}" type="button">
          <div class="tile-title">${escapeHtml(cat)}</div>
        </button>
      `;
    }).join("");

    main.innerHTML = `
      <section class="grid">
        ${tiles}
      </section>

      <section class="hint">
        <div class="hint-title">Tip</div>
        <div class="hint-text">Tap a category, then select an item to log Quantity (optional) and Expiry (required based on the item).</div>
      </section>
    `;

    main.querySelectorAll("[data-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-cat");
        if (cat === "Sauce") {
          state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
        } else {
          state.view = { page: "category", category: cat, sauceSub: null };
        }
        render();
      });
    });
  }

  // -----------------------------
  // Sauce menu (2-level)
  // -----------------------------
  function renderSauceMenu() {
    setTopbarVisible(true);
    updateSessionPill();

    const cards = SAUCE_SUBS.map(s => `
      <button class="tile" data-sauce="${escapeHtml(s)}" type="button">
        <div class="tile-title">${escapeHtml(s)}</div>
      </button>
    `).join("");

    main.innerHTML = `
      <div class="page-head">
        <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
        <div class="page-title">Sauce</div>
      </div>

      <section class="grid">
        ${cards}
      </section>
    `;

    $("#backBtn").addEventListener("click", () => {
      state.view = { page: "home", category: null, sauceSub: null };
      render();
    });

    main.querySelectorAll("[data-sauce]").forEach(btn => {
      btn.addEventListener("click", () => {
        const sub = btn.getAttribute("data-sauce");
        state.view = { page: "category", category: "Sauce", sauceSub: sub };
        render();
      });
    });
  }

  // -----------------------------
  // Category item list
  // -----------------------------
  function getItemsForCurrentList() {
    const { category, sauceSub } = state.view;
    let list = state.items.filter(it => it.category === category);

    if (category === "Sauce") {
      list = list.filter(it => (it.sub_category || "") === (sauceSub || ""));
    }

    // Sort by name
    list.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));
    return list;
  }

  function renderCategoryList() {
    setTopbarVisible(true);
    updateSessionPill();

    const { category, sauceSub } = state.view;
    const title = category === "Sauce" ? `Sauce • ${sauceSub}` : category;

    const list = getItemsForCurrentList();

    const rows = list.map(it => `
      <button class="list-row" data-item-id="${it.id}" type="button">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(it.name)}</div>
          <div class="list-row-sub">${escapeHtml(getHelperText(it))}</div>
        </div>
        <div class="chev">›</div>
      </button>
    `).join("");

    main.innerHTML = `
      <div class="page-head">
        <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
        <div class="page-title">${escapeHtml(title)}</div>
      </div>

      <section class="list">
        ${rows || `<div class="empty">No items found.</div>`}
      </section>
    `;

    $("#backBtn").addEventListener("click", () => {
      if (category === "Sauce") {
        state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
      } else {
        state.view = { page: "home", category: null, sauceSub: null };
      }
      render();
    });

    main.querySelectorAll("[data-item-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-item-id"));
        const item = state.items.find(x => Number(x.id) === id);
        if (!item) return;
        openLogModal(item);
      });
    });
  }

  // -----------------------------
  // Expiry inputs by mode
  // -----------------------------
  function buildAutoDateOptions(shelfLifeDays) {
    // If shelf life = N → dropdown shows N+1 options (Today … Today+N)
    const base = todayLocalMidnight();
    const options = [];
    for (let i = 0; i <= shelfLifeDays; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 0, 0, 0, 0);
      options.push({
        label: formatDateLong(d),
        value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, // YYYY-MM-DD
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
        // label in 12h format with AM/PM
        const d = new Date(2000, 0, 1, h, m, 0, 0);
        const label = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        opts.push({ label, value: `${hh}:${mm}` }); // 24h
      }
    }
    return opts;
  }

  function buildHourlyFixedOptions() {
    // ONLY these 4 options
    return [
      { label: "11:00 AM", value: "11:00" },
      { label: "3:00 PM", value: "15:00" },
      { label: "7:00 PM", value: "19:00" },
      { label: "11:00 PM", value: "23:00" },
    ];
  }

  function openLogModal(item) {
    const mode = getExpiryMode(item);
    const helper = getHelperText(item);
    const shelfLife = getEffectiveShelfLifeDays(item);

    // For EOD: expiry auto set
    const eodIso = mode === "EOD" ? toIso(endOfToday2359()) : null;

    let expiryFieldHtml = "";
    if (mode === "AUTO") {
      const options = buildAutoDateOptions(shelfLife).map(o =>
        `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
      ).join("");
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Date</label>
          <select id="expirySelect" class="input">
            <option value="">Select date</option>
            ${options}
          </select>
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "MANUAL") {
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Date & Time</label>
          <input id="expiryDatetime" class="input" type="datetime-local" />
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "EOD") {
      const label = formatDateLong(todayLocalMidnight()) + " • 23:59";
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry</label>
          <div class="pill">${escapeHtml(label)}</div>
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "HOURLY") {
      const options = buildHourlyTimeOptions(30).map(o =>
        `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
      ).join("");
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Time</label>
          <select id="expiryTime" class="input">
            <option value="">Select time</option>
            ${options}
          </select>
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    } else if (mode === "HOURLY_FIXED") {
      const options = buildHourlyFixedOptions().map(o =>
        `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
      ).join("");
      expiryFieldHtml = `
        <div class="field">
          <label class="label">Expiry Time</label>
          <select id="expiryTimeFixed" class="input">
            <option value="">Select time</option>
            ${options}
          </select>
          <div class="helper">${escapeHtml(helper)}</div>
        </div>
      `;
    }

    openModal("Log Item", `
      <div class="modal-item-title">${escapeHtml(item.name)}</div>

      <div class="field">
        <label class="label">Quantity (optional)</label>
        <input id="qtyInput" class="input" type="number" inputmode="numeric" placeholder="Leave blank if not needed" />
        <div class="helper">Blank allowed. 0 allowed.</div>
      </div>

      ${expiryFieldHtml}

      <div id="formError" class="error"></div>
      <button id="saveBtn" class="btn btn-primary" type="button">Save</button>
    `);

    $("#saveBtn").addEventListener("click", async () => {
      $("#formError").textContent = "";

      // Quantity rules: optional, blank allowed, 0 allowed, never blocks save.
      const qtyRaw = $("#qtyInput")?.value;
      const qty =
        qtyRaw === "" || qtyRaw === null || qtyRaw === undefined
          ? null
          : Number(qtyRaw);

      // Expiry rules by mode
      let expiryIso = null;

      if (mode === "AUTO") {
        const v = $("#expirySelect").value;
        if (!v) {
          $("#formError").textContent = "Please select an expiry date.";
          return;
        }
        // Store as end-of-day? Your rule says dropdown dates; keep as 23:59 for that date to be safe.
        const [yy, mm, dd] = v.split("-").map(Number);
        const d = new Date(yy, (mm - 1), dd, 23, 59, 0, 0);
        expiryIso = toIso(d);
      }

      if (mode === "MANUAL") {
        const v = $("#expiryDatetime").value;
        if (!v) {
          $("#formError").textContent = "Please select an expiry date & time.";
          return;
        }
        // datetime-local gives "YYYY-MM-DDTHH:mm"
        const d = new Date(v);
        if (isNaN(d.getTime())) {
          $("#formError").textContent = "Invalid date/time.";
          return;
        }
        expiryIso = toIso(d);
      }

      if (mode === "EOD") {
        expiryIso = eodIso;
      }

      if (mode === "HOURLY") {
        const v = $("#expiryTime").value;
        if (!v) {
          $("#formError").textContent = "Please select an expiry time.";
          return;
        }
        // Combine selected time with TODAY (past allowed)
        const base = todayLocalMidnight();
        const [hh, mi] = v.split(":").map(Number);
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mi, 0, 0);
        expiryIso = toIso(d);
      }

      if (mode === "HOURLY_FIXED") {
        const v = $("#expiryTimeFixed").value;
        if (!v) {
          $("#formError").textContent = "Please select an expiry time.";
          return;
        }
        const base = todayLocalMidnight();
        const [hh, mi] = v.split(":").map(Number);
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mi, 0, 0);
        expiryIso = toIso(d);
      }

      try {
        await apiPost("/api/log", {
          item_id: item.id,
          item_name: item.name,        // optional convenience
          category: item.category,      // optional convenience
          sub_category: item.sub_category || null,
          store: state.session.store,
          shift: state.session.shift,
          staff: state.session.staff,
          quantity: qty,               // can be null or 0
          expiry: expiryIso,           // required except EOD auto provides
        });

        closeModal();

        // Optional: a small toast
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

    // Expiry
    try {
      const expiry = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
      const list = Array.isArray(expiry) ? expiry : (expiry?.data || []);
      $("#expiryAlerts").innerHTML = renderAlertList(list, "expiry");
    } catch (e) {
      $("#expiryAlerts").textContent = `Failed to load: ${e.message}`;
    }

    // Low stock
    try {
      const low = await apiGet(`/api/low_stock?store=${encodeURIComponent(store)}`);
      const list = Array.isArray(low) ? low : (low?.data || []);
      $("#lowStock").innerHTML = renderAlertList(list, "low");
    } catch (e) {
      $("#lowStock").textContent = `Failed to load: ${e.message}`;
    }
  }

  function renderAlertList(list, kind) {
    if (!list || list.length === 0) {
      return `<div class="empty">No alerts.</div>`;
    }

    // Normalize expected fields
    const rows = list.map(x => {
      const name = x.name || x.item_name || x.item || "Item";
      const extra =
        kind === "expiry"
          ? (x.expiry ? new Date(x.expiry).toLocaleString() : (x.when || ""))
          : (x.quantity !== undefined && x.quantity !== null ? `Qty: ${x.quantity}` : "");

      return `
        <div class="alert-row">
          <div class="alert-name">${escapeHtml(name)}</div>
          <div class="alert-extra">${escapeHtml(String(extra || ""))}</div>
        </div>
      `;
    }).join("");

    return `<div class="alert-list">${rows}</div>`;
  }

  // -----------------------------
  // Toast (minimal)
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
  // Render router
  // -----------------------------
  function render() {
    if (!state.session) {
      renderSession();
      return;
    }

    if (state.view.page === "home") renderHome();
    else if (state.view.page === "sauce_menu") renderSauceMenu();
    else if (state.view.page === "category") renderCategoryList();
    else if (state.view.page === "alerts") renderAlerts();
    else renderHome();
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    state.session = loadSession();

    if (state.session) {
      updateSessionPill();
      setTopbarVisible(true);
      try {
        await loadItems();
        state.view = { page: "home", category: null, sauceSub: null };
      } catch {
        // If items fail, force session screen
        state.session = null;
        clearSession();
        state.view = { page: "session", category: null, sauceSub: null };
      }
    }

    render();
  }

  boot();
})();
