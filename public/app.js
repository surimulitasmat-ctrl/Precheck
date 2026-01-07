/* PreCheck - public/app.js
   Single-file SPA (no frameworks)
   Subway theme (green/white/yellow) injected for safety
*/
(() => {
  "use strict";

  // -----------------------------
  // Config / Constants
  // -----------------------------
  const API = ""; // same origin
  const LS_KEY = "precheck_session_v1";

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

  // Items that must be MANUAL date (date only), even if shelf life small/0
  const MANUAL_ALWAYS = new Set(
    [
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
      "Cajun Spice Packet", // manual
    ].map(norm)
  );

  // HOURLY_FIXED items
  const HOURLY_FIXED_ITEMS = new Set(
    ["Bread", "Tomato Soup (H)", "Mushroom Soup (H)"].map(norm)
  );

  // EOD items
  const EOD_ITEMS = new Set(["Chicken Bacon"].map(norm));

  // HOURLY items (time dropdown)
  const HOURLY_ITEMS = new Set(
    [
      "Beef Taco (H)", // if you later rename it
      // If your DB currently has "Beef Taco" in Front counter, we treat it as HOURLY for SKH only
    ].map(norm)
  );

  // Fixed times (24h internally)
  const HOURLY_FIXED_TIMES = [
    { label: "11:00 AM", value: "11:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "7:00 PM", value: "19:00" },
    { label: "11:00 PM", value: "23:00" },
  ];

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    session: loadSession(),
    items: [],
    view: { page: "boot", category: null, sauceSub: null },
    modal: { open: false, item: null },
    loading: false,
    toast: null,
    alerts: { expiry: [], low: [], lowNotConfigured: false },
  };

  // -----------------------------
  // DOM
  // -----------------------------
  const app = document.getElementById("app") || document.body;
  app.innerHTML = `
    <div class="pc-root">
      <header class="pc-topbar" id="topbar">
        <div class="pc-brand">
          <div class="pc-brand-name">PreCheck</div>
          <div class="pc-session-pill" id="sessionPill"></div>
        </div>
        <nav class="pc-nav">
          <button class="pc-navbtn" id="navHome" type="button">Home</button>
          <button class="pc-navbtn" id="navAlerts" type="button">Alerts</button>
          <button class="pc-navbtn pc-navbtn--ghost" id="navLogout" type="button">Logout</button>
        </nav>
      </header>

      <main class="pc-main" id="main"></main>

      <div class="pc-modal-backdrop" id="modalBackdrop" aria-hidden="true">
        <div class="pc-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="pc-modal-head">
            <div class="pc-modal-title" id="modalTitle">Log Item</div>
            <button class="pc-iconbtn" id="modalClose" type="button" aria-label="Close">✕</button>
          </div>
          <div class="pc-modal-body" id="modalBody"></div>
        </div>
      </div>

      <div class="pc-toast" id="toast" aria-live="polite"></div>
    </div>
  `;

  const $ = (sel, root = document) => root.querySelector(sel);
  const main = $("#main");
  const topbar = $("#topbar");
  const sessionPill = $("#sessionPill");
  const toastEl = $("#toast");
  const modalBackdrop = $("#modalBackdrop");
  const modalBody = $("#modalBody");

  // Inject a safe Subway theme so you don’t get dark/black UI even if style.css is messy
  injectThemeOverride();

  // Wire nav
  $("#navHome").addEventListener("click", () => {
    if (!state.session) return;
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });
  $("#navAlerts").addEventListener("click", async () => {
    if (!state.session) return;
    state.view = { page: "alerts", category: null, sauceSub: null };
    await loadAlerts();
    render();
  });
  $("#navLogout").addEventListener("click", () => {
    state.session = null;
    saveSession(null);
    state.view = { page: "session", category: null, sauceSub: null };
    render();
  });

  $("#modalClose").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  // -----------------------------
  // Boot
  // -----------------------------
  (async function boot() {
    setTopbarVisible(false);

    if (!state.session) {
      state.view = { page: "session", category: null, sauceSub: null };
      render();
      return;
    }

    await loadItems();
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  })();

  // -----------------------------
  // Data load
  // -----------------------------
  async function loadItems() {
    state.loading = true;
    renderLoading();

    try {
      const res = await fetch(`${API}/api/items`, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`Failed to load items (${res.status})`);
      const raw = await res.json();

      // Normalize categories to your desired exact naming
      const cleaned = raw.map((it) => ({
        id: Number(it.id),
        name: (it.name || "").trim(),
        category: canonicalCategory(it.category),
        sub_category: (it.sub_category || null),
        shelf_life_days: Number(it.shelf_life_days ?? 0),
      }));

      // Store filtering rule: hide SKH-only Beef Taco (Front counter) for PDD
      // (since your DB doesn’t have store column, we enforce on client)
      const store = state.session.store;
      state.items = cleaned.filter((it) => {
        const cat = canonicalCategory(it.category);
        const nm = norm(it.name);

        // If your DB currently has "Beef Taco" in Front counter, only show for SKH
        if (cat === "Front counter" && nm === norm("Beef Taco")) {
          return store === "SKH";
        }

        // Also hide exact "Beef Taco (H)" if it exists and store is not SKH
        if (nm === norm("Beef Taco (H)")) {
          return store === "SKH";
        }

        return true;
      });

    } catch (err) {
      console.error(err);
      showToast(String(err.message || err), true);
      state.items = [];
    } finally {
      state.loading = false;
    }
  }

  async function loadAlerts() {
    state.alerts = { expiry: [], low: [], lowNotConfigured: false };

    // Expiry alerts
    try {
      const r = await fetch(`${API}/api/expiry?store=${encodeURIComponent(state.session.store)}`);
      if (r.ok) state.alerts.expiry = await r.json();
      else state.alerts.expiry = [];
    } catch {
      state.alerts.expiry = [];
    }

    // Low stock (optional endpoint)
    try {
      const r2 = await fetch(`${API}/api/low_stock?store=${encodeURIComponent(state.session.store)}`);
      if (r2.status === 404) {
        state.alerts.lowNotConfigured = true;
      } else if (r2.ok) {
        state.alerts.low = await r2.json();
      }
    } catch {
      // ignore
    }
  }

  // -----------------------------
  // Render router
  // -----------------------------
  function render() {
    if (state.loading) return renderLoading();

    if (!state.session) {
      setTopbarVisible(false);
      return renderSession();
    }

    setTopbarVisible(true);
    updateSessionPill();

    switch (state.view.page) {
      case "home":
        return renderHome();
      case "sauce_menu":
        return renderSauceMenu();
      case "category":
        return renderCategoryList();
      case "alerts":
        return renderAlerts();
      case "session":
      default:
        return renderSession();
    }
  }

  function renderLoading() {
    main.innerHTML = `
      <div class="pc-card pc-center">
        <div class="pc-h1">Loading…</div>
        <div class="pc-muted">Please wait.</div>
      </div>
    `;
  }

  // -----------------------------
  // Session screen
  // -----------------------------
  function renderSession() {
    setTopbarVisible(false);

    main.innerHTML = `
      <div class="pc-card pc-session">
        <div class="pc-h1">Start Session</div>
        <div class="pc-muted">Select store, shift, and staff.</div>

        <div class="pc-form">
          <label class="pc-label">Store</label>
          <select class="pc-input" id="sStore">
            <option value="">Select store</option>
            <option value="PDD">PDD</option>
            <option value="SKH">SKH</option>
          </select>

          <label class="pc-label">Shift</label>
          <select class="pc-input" id="sShift">
            <option value="">Select shift</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>

          <label class="pc-label">Staff</label>
          <input class="pc-input" id="sStaff" placeholder="Enter name / ID" maxlength="30" />

          <button class="pc-btn pc-btn--primary" id="sStart" type="button">Start</button>
        </div>
      </div>
    `;

    const sStore = $("#sStore");
    const sShift = $("#sShift");
    const sStaff = $("#sStaff");
    const sStart = $("#sStart");

    // If existing session saved
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

  // -----------------------------
  // Home tiles with SVG icons
  // -----------------------------
  function renderHome() {
    // Count per category
    const counts = {};
    for (const c of CATEGORIES) counts[c] = 0;
    for (const it of state.items) {
      const cat = canonicalCategory(it.category);
      if (counts[cat] !== undefined) counts[cat]++;
    }

    // SVG icons
    const ICONS = {
      box: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.5 12 3 3 8.5 12 14l9-5.5Z"></path><path d="M21 8.5V16l-9 5-9-5V8.5"></path><path d="M12 14v7"></path></svg>`,
      snow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20"></path><path d="M4.5 7.5 19.5 16.5"></path><path d="M19.5 7.5 4.5 16.5"></path><path d="M6 6l2.5 1.5"></path><path d="M18 6l-2.5 1.5"></path><path d="M6 18l2.5-1.5"></path><path d="M18 18l-2.5-1.5"></path></svg>`,
      leaf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4c-8 0-14 6-14 14"></path><path d="M20 4c0 10-6 16-16 16"></path><path d="M7 13c2 0 4-1 6-3"></path></svg>`,
      bottle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4"></path><path d="M10 2v3l-1 2v3c0 1-1 2-1 3v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6c0-1-1-2-1-3V7l-1-2V2"></path><path d="M9 10h6"></path></svg>`,
      counter: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M6 7v12"></path><path d="M18 7v12"></path><path d="M4 19h16"></path><path d="M9 12h6"></path></svg>`,
      receipt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v20l-2-1-2 1-2-1-2 1-2-1-2 1V2Z"></path><path d="M9 7h6"></path><path d="M9 11h6"></path><path d="M9 15h4"></path></svg>`,
      fridge: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a2 2 0 0 1 2 2v18"></path><path d="M5 22V4a2 2 0 0 1 2-2"></path><path d="M5 12h14"></path><path d="M8 7h1"></path><path d="M8 16h1"></path></svg>`,
      sandwich: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10c0-2 2-4 8-4s8 2 8 4"></path><path d="M5 10l1 9h12l1-9"></path><path d="M7 14h10"></path><path d="M8 6c1-2 3-3 4-3s3 1 4 3"></path></svg>`,
    };

    const TILE_META = {
      "Prepared items": { tone: "green", icon: "sandwich" },
      "Unopened chiller": { tone: "blue", icon: "fridge" },
      "Thawing": { tone: "cyan", icon: "snow" },
      "Vegetables": { tone: "lime", icon: "leaf" },
      "Backroom": { tone: "orange", icon: "box" },
      "Back counter": { tone: "yellow", icon: "counter" },
      "Front counter": { tone: "red", icon: "receipt" },
      "Back counter chiller": { tone: "teal", icon: "fridge" },
      "Sauce": { tone: "purple", icon: "bottle" },
    };

    main.innerHTML = `
      <div class="pc-pagehead">
        <div class="pc-h1">Categories</div>
        <div class="pc-muted">Tap a category to log items.</div>
      </div>

      <section class="pc-grid">
        ${CATEGORIES.map((cat) => {
          const meta = TILE_META[cat] || { tone: "green", icon: "sandwich" };
          const count = counts[cat] ?? 0;

          return `
            <button class="pc-tile pc-tile--${meta.tone}" data-cat="${escapeHtml(cat)}" type="button">
              <div class="pc-tile-top">
                <div class="pc-tile-icon">${ICONS[meta.icon] || ICONS.sandwich}</div>
              </div>
              <div class="pc-tile-title">${escapeHtml(cat)}</div>
              <div class="pc-tile-sub">${count} item${count === 1 ? "" : "s"}</div>
            </button>
          `;
        }).join("")}
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
  // Sauce sub-menu
  // -----------------------------
  function renderSauceMenu() {
    main.innerHTML = `
      <div class="pc-pagehead pc-pagehead--row">
        <button class="pc-btn pc-btn--ghost" id="backHome" type="button">← Back</button>
        <div>
          <div class="pc-h1">Sauce</div>
          <div class="pc-muted">Select location.</div>
        </div>
      </div>

      <section class="pc-grid">
        ${SAUCE_SUBS.map((s) => `
          <button class="pc-tile pc-tile--green" data-sauce="${escapeHtml(s)}" type="button">
            <div class="pc-tile-title">${escapeHtml(s)}</div>
            <div class="pc-tile-sub">Tap to view items</div>
          </button>
        `).join("")}
      </section>
    `;

    $("#backHome").addEventListener("click", () => {
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
      <div class="pc-pagehead pc-pagehead--row">
        <button class="pc-btn pc-btn--ghost" id="backBtn" type="button">← Back</button>
        <div>
          <div class="pc-h1">${escapeHtml(title)}</div>
          <div class="pc-muted">Tap an item to log expiry.</div>
        </div>
      </div>

      <section class="pc-list">
        ${
          list.length
            ? list.map((it) => `
              <button class="pc-row" data-item-id="${it.id}" type="button">
                <div class="pc-row-main">
                  <div class="pc-row-title">${escapeHtml(it.name)}</div>
                  <div class="pc-row-sub">${escapeHtml(getHelperText(it))}</div>
                </div>
                <div class="pc-row-chev">›</div>
              </button>
            `).join("")
            : `<div class="pc-card"><div class="pc-muted">No items found.</div></div>`
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

  // -----------------------------
  // Alerts page
  // -----------------------------
  function renderAlerts() {
    const exp = state.alerts.expiry || [];
    const low = state.alerts.low || [];

    main.innerHTML = `
      <div class="pc-pagehead">
        <div class="pc-h1">Alerts</div>
        <div class="pc-muted">Expiry alerts and low stock (if enabled).</div>
      </div>

      <div class="pc-card">
        <div class="pc-card-title">Expiry Alerts</div>
        ${
          exp.length
            ? `<div class="pc-alertlist">
                ${exp.map((a) => `
                  <div class="pc-alert">
                    <div class="pc-alert-title">${escapeHtml(a.name || a.item_name || "Item")}</div>
                    <div class="pc-alert-sub">${escapeHtml(a.message || a.expiry || "")}</div>
                  </div>
                `).join("")}
              </div>`
            : `<div class="pc-muted">No expiry alerts.</div>`
        }
      </div>

      <div class="pc-card" style="margin-top:12px;">
        <div class="pc-card-title">Low Stock</div>
        ${
          state.alerts.lowNotConfigured
            ? `<div class="pc-muted">Low stock endpoint not configured yet.</div>`
            : low.length
              ? `<div class="pc-alertlist">
                  ${low.map((a) => `
                    <div class="pc-alert">
                      <div class="pc-alert-title">${escapeHtml(a.name || a.item_name || "Item")}</div>
                      <div class="pc-alert-sub">${escapeHtml(a.message || a.qty || "")}</div>
                    </div>
                  `).join("")}
                </div>`
              : `<div class="pc-muted">No low stock alerts.</div>`
        }
      </div>
    `;
  }

  // -----------------------------
  // Modal: Log item
  // -----------------------------
  function openLogModal(item) {
    state.modal.open = true;
    state.modal.item = item;

    const mode = getMode(item);
    const modeUi = buildExpiryUi(item, mode);

    modalBody.innerHTML = `
      <div class="pc-modal-section">
        <div class="pc-modal-item">${escapeHtml(item.name)}</div>

        <label class="pc-label">Quantity (optional)</label>
        <input class="pc-input" id="qtyInput" inputmode="decimal" placeholder="Leave blank if not needed" />

        <div class="pc-muted" style="margin-top:6px;">Blank allowed. 0 allowed.</div>

        ${modeUi}

        <div class="pc-rowbtns">
          <button class="pc-btn pc-btn--primary" id="saveBtn" type="button">Save</button>
        </div>

        <div class="pc-muted" id="saveHint" style="margin-top:8px;"></div>
      </div>
    `;

    // show
    modalBackdrop.classList.add("is-open");
    modalBackdrop.setAttribute("aria-hidden", "false");

    // Save handler
    $("#saveBtn").addEventListener("click", async () => {
      const qtyRaw = ($("#qtyInput").value || "").trim();
      const qty = qtyRaw === "" ? null : Number(qtyRaw);

      // qty is optional; allow blank, allow 0, but block non-number
      if (qtyRaw !== "" && Number.isNaN(qty)) {
        return showToast("Quantity must be a number (or leave blank).", true);
      }

      const expiryAt = getExpiryAtFromUi(item, mode);
      if (!expiryAt) return; // function already shows toast

      const payload = {
        store: state.session.store,
        staff: state.session.staff,
        item_id: Number(item.id),
        qty: qty,
        expiry_at: expiryAt, // ISO string
      };

      try {
        const r = await fetch(`${API}/api/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const out = await safeJson(r);
        if (!r.ok) throw new Error(out?.error || `Save failed (${r.status})`);

        showToast("Saved.");
        closeModal();
      } catch (e) {
        console.error(e);
        showToast(String(e.message || e), true);
      }
    });
  }

  function closeModal() {
    state.modal.open = false;
    state.modal.item = null;
    modalBackdrop.classList.remove("is-open");
    modalBackdrop.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
  }

  // -----------------------------
  // Expiry logic
  // -----------------------------
  function getMode(item) {
    const cat = canonicalCategory(item.category);
    const nameN = norm(item.name);

    // Category rule: Unopened chiller is MANUAL date only
    if (cat === "Unopened chiller") return "MANUAL_DATE";

    // Always manual list
    if (MANUAL_ALWAYS.has(nameN)) return "MANUAL_DATE";

    // Special: Cajun Spice Open Inner = AUTO 5 days
    if (nameN === norm("Cajun Spice Open Inner")) return "AUTO";

    // HOURLY_FIXED
    if (HOURLY_FIXED_ITEMS.has(nameN)) return "HOURLY_FIXED";

    // EOD
    if (EOD_ITEMS.has(nameN)) return "EOD";

    // HOURLY (Front counter Beef Taco = HOURLY but SKH only; PDD item filtered earlier)
    if (canonicalCategory(item.category) === "Front counter" && nameN === norm("Beef Taco")) return "HOURLY";
    if (HOURLY_ITEMS.has(nameN)) return "HOURLY";

    // Shelf life > 7 => manual date
    const sl = getShelfLifeDays(item);
    if (sl > 7) return "MANUAL_DATE";

    // Default AUTO
    return "AUTO";
  }

  function getShelfLifeDays(item) {
    const nameN = norm(item.name);
    if (nameN === norm("Cajun Spice Open Inner")) return 5; // special override
    const n = Number(item.shelf_life_days ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  function buildExpiryUi(item, mode) {
    if (mode === "EOD") {
      return `
        <div class="pc-spacer"></div>
        <div class="pc-card pc-card--soft">
          <div class="pc-card-title">Expiry</div>
          <div class="pc-muted">Automatically set to end of today (23:59).</div>
        </div>
      `;
    }

    if (mode === "AUTO") {
      const days = getShelfLifeDays(item);
      const opts = buildDateOptions(days); // N+1
      return `
        <div class="pc-spacer"></div>
        <label class="pc-label">Expiry Date</label>
        <select class="pc-input" id="expiryDateSelect">
          <option value="">Select date</option>
          ${opts.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
        <div class="pc-muted" style="margin-top:6px;">Select expiry date.</div>
      `;
    }

    if (mode === "MANUAL_DATE") {
      return `
        <div class="pc-spacer"></div>
        <label class="pc-label">Expiry Date</label>
        <input class="pc-input" id="expiryDateManual" type="date" />
        <div class="pc-muted" style="margin-top:6px;">Select expiry date.</div>
      `;
    }

    if (mode === "HOURLY") {
      const times = buildHourlyTimes();
      return `
        <div class="pc-spacer"></div>
        <label class="pc-label">Expiry Time</label>
        <select class="pc-input" id="expiryTimeSelect">
          <option value="">Select time</option>
          ${times.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("")}
        </select>
        <div class="pc-muted" style="margin-top:6px;">Past time allowed.</div>
      `;
    }

    if (mode === "HOURLY_FIXED") {
      return `
        <div class="pc-spacer"></div>
        <label class="pc-label">Expiry Time</label>
        <select class="pc-input" id="expiryTimeFixed">
          <option value="">Select time</option>
          ${HOURLY_FIXED_TIMES.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("")}
        </select>
        <div class="pc-muted" style="margin-top:6px;">Select one time. Past time allowed.</div>
      `;
    }

    // fallback
    return "";
  }

  function getExpiryAtFromUi(item, mode) {
    const now = new Date();

    if (mode === "EOD") {
      const eod = endOfDay(now);
      return eod.toISOString();
    }

    if (mode === "AUTO") {
      const sel = $("#expiryDateSelect");
      const v = sel ? (sel.value || "") : "";
      if (!v) {
        showToast("Please select expiry date.", true);
        return null;
      }
      // store end-of-day for selected date
      const d = parseYmdToDate(v);
      return endOfDay(d).toISOString();
    }

    if (mode === "MANUAL_DATE") {
      const inp = $("#expiryDateManual");
      const v = inp ? (inp.value || "") : "";
      if (!v) {
        showToast("Please select expiry date.", true);
        return null;
      }
      const d = parseYmdToDate(v);
      return endOfDay(d).toISOString();
    }

    if (mode === "HOURLY") {
      const sel = $("#expiryTimeSelect");
      const v = sel ? (sel.value || "") : "";
      if (!v) {
        showToast("Please select expiry time.", true);
        return null;
      }
      const dt = setTimeOnDate(now, v);
      return dt.toISOString();
    }

    if (mode === "HOURLY_FIXED") {
      const sel = $("#expiryTimeFixed");
      const v = sel ? (sel.value || "") : "";
      if (!v) {
        showToast("Please select expiry time.", true);
        return null;
      }
      const dt = setTimeOnDate(now, v);
      return dt.toISOString();
    }

    showToast("Expiry mode not supported.", true);
    return null;
  }

  function getHelperText(item) {
    const mode = getMode(item);
    if (mode === "EOD") return "Expiry will be set to end of today.";
    if (mode === "HOURLY_FIXED") return "Select time: 11am / 3pm / 7pm / 11pm.";
    if (mode === "HOURLY") return "Select expiry time (past time allowed).";
    if (mode === "MANUAL_DATE") return "Select expiry date.";
    if (mode === "AUTO") return "Select expiry date.";
    return "Select expiry.";
  }

  // -----------------------------
  // Helpers: dates/times
  // -----------------------------
  function buildDateOptions(shelfLifeDays) {
    const n = Number(shelfLifeDays ?? 0);
    const safeN = Number.isFinite(n) ? Math.max(0, n) : 0;

    const list = [];
    const today = startOfDay(new Date());

    // N+1 options: Today..Today+N
    for (let i = 0; i <= safeN; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push({
        value: toYmd(d),
        label: formatHumanDate(d), // "24 May 2026"
      });
    }
    return list;
  }

  function buildHourlyTimes() {
    // simple every hour list (00:00..23:00) with friendly label
    const arr = [];
    for (let h = 0; h <= 23; h++) {
      const value = String(h).padStart(2, "0") + ":00";
      arr.push({ value, label: format12h(h, 0) });
    }
    return arr;
  }

  function formatHumanDate(d) {
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "short" });
    const year = d.getFullYear();
    // “24 May 2026” (month short but same look; if you want full “May” already)
    const monthFull = d.toLocaleString("en-GB", { month: "long" });
    return `${day} ${monthFull} ${year}`;
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
    const [y, m, d] = ymd.split("-").map((x) => Number(x));
    const dt = new Date();
    dt.setFullYear(y, (m - 1), d);
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
    const [hh, mm] = hhmm.split(":").map((x) => Number(x));
    const d = new Date(dateBase);
    d.setSeconds(0, 0);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  // -----------------------------
  // Utilities
  // -----------------------------
  function canonicalCategory(cat) {
    const c = (cat || "").trim();

    // normalize common variants from your DB
    if (!c) return c;

    const n = norm(c);

    if (n === norm("Prepared Items")) return "Prepared items";
    if (n === norm("Prepared items")) return "Prepared items";

    if (n === norm("Front Counter")) return "Front counter";
    if (n === norm("Front counter")) return "Front counter";

    if (n === norm("Back Counter")) return "Back counter";
    if (n === norm("Back counter")) return "Back counter";

    if (n === norm("Back Counter Chiller")) return "Back counter chiller";
    if (n === norm("Back counter chiller")) return "Back counter chiller";

    if (n === norm("Unopened Chiller")) return "Unopened chiller";
    if (n === norm("Unopened chiller")) return "Unopened chiller";

    if (n === norm("High Risk")) return "Unopened chiller"; // old name
    if (n === norm("High risk")) return "Unopened chiller";

    if (n === norm("Sauces")) return "Sauce";
    if (n === norm("Sauce")) return "Sauce";

    return c;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.className = "pc-toast" + (isError ? " pc-toast--error" : " pc-toast--ok");
    toastEl.style.opacity = "1";
    clearTimeout(state.toast);
    state.toast = setTimeout(() => {
      toastEl.style.opacity = "0";
    }, 2200);
  }

  function setTopbarVisible(on) {
    topbar.style.display = on ? "flex" : "none";
  }

  function updateSessionPill() {
    if (!state.session) {
      sessionPill.textContent = "";
      return;
    }
    sessionPill.textContent = `${state.session.store} • ${state.session.shift} • ${state.session.staff}`;
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

  // -----------------------------
  // Theme override (Subway colors)
  // -----------------------------
  function injectThemeOverride() {
    if (document.getElementById("pc-theme-override")) return;

    const css = `
      :root{
        --pc-green:#009A44;
        --pc-green2:#007A35;
        --pc-yellow:#FFC72C;
        --pc-yellow2:#F2A900;
        --pc-white:#ffffff;
        --pc-ink:#102015;
        --pc-muted:#5b6a60;
        --pc-card:#ffffff;
        --pc-line:rgba(16,32,21,.10);
      }

      .pc-root{
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        color: var(--pc-ink);
        background: linear-gradient(180deg, rgba(0,154,68,.16), rgba(255,255,255,1) 240px);
        min-height: 100vh;
      }

      .pc-topbar{
        position: sticky; top: 0; z-index: 20;
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 14px;
        background: linear-gradient(90deg, var(--pc-green), var(--pc-green2));
        color:#fff;
        box-shadow: 0 6px 18px rgba(0,0,0,.12);
      }

      .pc-brand-name{ font-weight: 900; font-size: 18px; letter-spacing:.2px; }
      .pc-session-pill{ font-size: 12px; opacity:.92; margin-top:2px; font-weight:700; }

      .pc-nav{ display:flex; gap:10px; }
      .pc-navbtn{
        border: 1px solid rgba(255,255,255,.28);
        background: rgba(255,255,255,.14);
        color:#fff; font-weight:800;
        border-radius: 999px;
        padding: 10px 14px;
      }
      .pc-navbtn--ghost{ background: rgba(255,255,255,.08); }

      .pc-main{ padding: 14px; max-width: 860px; margin: 0 auto; }

      .pc-pagehead{ margin-bottom: 12px; }
      .pc-pagehead--row{ display:flex; gap:10px; align-items:flex-start; }
      .pc-h1{ font-size: 18px; font-weight: 950; margin: 0; }
      .pc-muted{ color: var(--pc-muted); font-size: 13px; font-weight:700; }

      .pc-card{
        background: var(--pc-card);
        border: 1px solid var(--pc-line);
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 10px 22px rgba(0,0,0,.06);
      }
      .pc-card--soft{
        background: linear-gradient(180deg, rgba(255,199,44,.20), rgba(255,255,255,1));
      }
      .pc-card-title{ font-weight: 950; margin-bottom: 8px; }

      .pc-center{ text-align:center; }

      .pc-form{ display:flex; flex-direction:column; gap:10px; margin-top: 12px; }
      .pc-label{ font-size: 12px; font-weight: 900; color: var(--pc-ink); }
      .pc-input{
        width:100%;
        border-radius: 14px;
        border: 1px solid var(--pc-line);
        padding: 12px 12px;
        font-size: 15px;
        background: #fff;
        outline: none;
      }

      .pc-btn{
        border: 1px solid var(--pc-line);
        border-radius: 999px;
        padding: 10px 14px;
        font-weight: 900;
        background: #fff;
      }
      .pc-btn--primary{
        background: var(--pc-green);
        border-color: rgba(0,0,0,.0);
        color: #fff;
      }
      .pc-btn--ghost{
        background: rgba(255,255,255,.16);
        border-color: rgba(255,255,255,.28);
        color: #fff;
      }

      .pc-grid{
        display:grid;
        grid-template-columns: repeat(2, minmax(0,1fr));
        gap: 12px;
      }

      .pc-tile{
        text-align:left;
        border: 0;
        border-radius: 18px;
        padding: 14px;
        color:#fff;
        box-shadow: 0 12px 26px rgba(0,0,0,.10);
        overflow:hidden;
        position: relative;
      }
      .pc-tile:active{ transform: scale(.985); }

      .pc-tile::before{
        content:"";
        position:absolute;
        right:-60px; top:-70px;
        width:180px; height:180px;
        background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.40), transparent 60%);
        transform: rotate(15deg);
      }

      .pc-tile-top{ display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
      .pc-tile-title{ font-weight: 950; font-size: 16px; line-height:1.1; }
      .pc-tile-sub{ font-weight: 800; opacity: .92; font-size: 12px; margin-top: 6px; }

      .pc-tile-icon{
        width: 46px; height: 46px;
        border-radius: 14px;
        display:grid; place-items:center;
        background: rgba(255,255,255,.18);
        border: 1px solid rgba(255,255,255,.25);
        backdrop-filter: blur(6px);
      }
      .pc-tile-icon svg{
        width: 26px; height: 26px;
        stroke: rgba(255,255,255,.98);
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .pc-tile--green  { background: linear-gradient(135deg, #009A44, #007A35); }
      .pc-tile--yellow { background: linear-gradient(135deg, #FFC72C, #F2A900); color:#102015; }
      .pc-tile--yellow .pc-tile-sub{ color: rgba(16,32,21,.85); }
      .pc-tile--yellow .pc-tile-icon{ background: rgba(255,255,255,.35); border-color: rgba(255,255,255,.40); }
      .pc-tile--yellow .pc-tile-icon svg{ stroke: rgba(16,32,21,.90); }

      .pc-tile--orange { background: linear-gradient(135deg, #FF8A00, #E45D00); }
      .pc-tile--red    { background: linear-gradient(135deg, #E53935, #B71C1C); }
      .pc-tile--blue   { background: linear-gradient(135deg, #1E88E5, #1565C0); }
      .pc-tile--cyan   { background: linear-gradient(135deg, #00ACC1, #007C91); }
      .pc-tile--teal   { background: linear-gradient(135deg, #26A69A, #00796B); }
      .pc-tile--lime   { background: linear-gradient(135deg, #43A047, #2E7D32); }
      .pc-tile--purple { background: linear-gradient(135deg, #7E57C2, #5E35B1); }

      .pc-list{ display:flex; flex-direction:column; gap:10px; }
      .pc-row{
        width:100%;
        border-radius: 16px;
        border: 1px solid var(--pc-line);
        padding: 12px;
        display:flex; justify-content:space-between; align-items:center;
        background:#fff;
        box-shadow: 0 8px 18px rgba(0,0,0,.05);
        text-align:left;
      }
      .pc-row-title{ font-weight: 950; }
      .pc-row-sub{ font-size: 12px; font-weight: 800; color: var(--pc-muted); margin-top: 4px; }
      .pc-row-chev{ font-size: 22px; opacity: .35; font-weight: 900; }

      .pc-modal-backdrop{
        position: fixed; inset: 0;
        background: rgba(0,0,0,.35);
        display:none;
        align-items:flex-end;
        justify-content:center;
        padding: 14px;
        z-index: 50;
      }
      .pc-modal-backdrop.is-open{ display:flex; }

      .pc-modal{
        width: min(720px, 100%);
        background: #fff;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.0);
        box-shadow: 0 18px 40px rgba(0,0,0,.18);
        overflow:hidden;
      }
      .pc-modal-head{
        display:flex; justify-content:space-between; align-items:center;
        padding: 12px 14px;
        background: linear-gradient(90deg, rgba(0,154,68,.10), rgba(255,199,44,.18));
        border-bottom: 1px solid var(--pc-line);
      }
      .pc-modal-title{ font-weight: 950; }
      .pc-iconbtn{
        border: 1px solid var(--pc-line);
        background:#fff;
        width: 40px; height:40px;
        border-radius: 14px;
        font-weight: 950;
      }
      .pc-modal-body{ padding: 14px; }
      .pc-modal-item{ font-weight: 950; font-size: 18px; margin-bottom: 10px; }
      .pc-spacer{ height: 10px; }
      .pc-rowbtns{ margin-top: 14px; display:flex; gap:10px; }

      .pc-toast{
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        background: rgba(16,32,21,.92);
        color: #fff;
        padding: 10px 14px;
        border-radius: 999px;
        font-weight: 900;
        opacity: 0;
        transition: opacity .2s ease;
        z-index: 60;
        max-width: calc(100vw - 30px);
        text-align:center;
      }
      .pc-toast--error{ background: rgba(183,28,28,.92); }
      .pc-toast--ok{ background: rgba(0,122,53,.92); }

      @media (max-width:420px){
        .pc-grid{ grid-template-columns: repeat(2, minmax(0,1fr)); }
      }
    `;

    const style = document.createElement("style");
    style.id = "pc-theme-override";
    style.textContent = css;
    document.head.appendChild(style);
  }

})();
