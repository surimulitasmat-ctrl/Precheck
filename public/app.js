// =========================
// PreCheck — FULL app.js
// Plain JS, NO import/module
// =========================

// ========= CONSTANTS =========
const EXPIRY_MODES = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
  EOD: "EOD",
  HOURLY: "HOURLY",
};

// ========= DEMO DATA (replace with your FINAL list later if needed) =========
// Required fields used by the app:
// - category (main menu)
// - sauceSubcategory (only for category "Sauce")
// - stores: ["PDD","SKH"] or ["SKH"] etc.
// - expiryMode: AUTO/MANUAL/EOD/HOURLY
// - expiryHours: number (AUTO/HOURLY)
// - eodTime: "HH:MM" (EOD)
// - helperText: string

const ITEMS = [
  // Front counter
  {
    id: "front-001",
    category: "Front counter",
    name: "Cookies (Example AUTO 6h)",
    stores: ["PDD", "SKH"],
    expiryMode: "AUTO",
    expiryHours: 6,
    helperText: "AUTO: Expiry is calculated automatically.",
  },

  // SKH-only hourly item
  {
    id: "front-skh-001",
    category: "Front counter",
    name: "Beef Taco (H)",
    stores: ["SKH"], // SKH-only
    expiryMode: "HOURLY",
    expiryHours: 1,
    helperText: "HOURLY: Auto expires after 1 hour (SKH only).",
  },

  // Example EOD item
  {
    id: "back-001",
    category: "Backroom",
    name: "Chicken Bacon (EOD)",
    stores: ["PDD", "SKH"],
    expiryMode: "EOD",
    eodTime: "23:59",
    helperText: "EOD: Expires end of day.",
  },

  // Example MANUAL item
  {
    id: "prep-001",
    category: "Prepared items",
    name: "Parmesan Oregano (Manual)",
    stores: ["PDD", "SKH"],
    expiryMode: "MANUAL",
    helperText: "MANUAL: Staff must select expiry date/time.",
  },

  // Sauce items with sub-category navigation
  {
    id: "sauce-standby-001",
    category: "Sauce",
    sauceSubcategory: "Standby",
    name: "Ranch (Standby)",
    stores: ["PDD", "SKH"],
    expiryMode: "AUTO",
    expiryHours: 8,
    helperText: "AUTO: Standby sauce expires after 8 hours.",
  },
  {
    id: "sauce-openinner-001",
    category: "Sauce",
    sauceSubcategory: "Open Inner",
    name: "Ranch (Open Inner)",
    stores: ["PDD", "SKH"],
    expiryMode: "MANUAL",
    helperText: "MANUAL: Select expiry manually for Open Inner.",
  },
  {
    id: "sauce-sandwichunit-001",
    category: "Sauce",
    sauceSubcategory: "Sandwich Unit",
    name: "Chipotle (Sandwich Unit)",
    stores: ["PDD", "SKH"],
    expiryMode: "AUTO",
    expiryHours: 6,
    helperText: "AUTO: Sandwich unit sauce expires after 6 hours.",
  },
];

// Categories shown on left menu
const CATEGORIES = [
  "Prepared items",
  "High risk",
  "Thawing",
  "Vegetables",
  "Backroom",
  "Back counter",
  "Front counter",
  "Back counter chiller",
  "Sauce",
];

// Sauce subcategories shown when you tap Sauce
const SAUCE_SUBCATEGORIES = ["Standby", "Open Inner", "Sandwich Unit"];

// ========= STATE =========
const state = {
  store: "PDD",
  view: "CATEGORIES", // CATEGORIES | ITEMS | SAUCE_SUBCATS | SAUCE_ITEMS
  selectedCategory: null,
  selectedSauceSubcategory: null,
  selectedItemId: null,

  // per-item input state (for manual expiry)
  manualExpiryValueByItemId: {}, // id -> "YYYY-MM-DDTHH:MM"
};

// ========= HELPERS =========
function $(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInputValue(date) {
  const d = new Date(date);
  return (
    d.getFullYear() +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    "T" +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatReadable(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function toSameDayTime(baseDate, hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;

  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function addHours(date, hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return null;
  return new Date(date.getTime() + h * 60 * 60 * 1000);
}

/**
 * Expiry calculator:
 * - AUTO: now + expiryHours
 * - HOURLY: now + expiryHours (same calc; different label)
 * - MANUAL: use user input datetime-local
 * - EOD: "today at eodTime" BUT if now already past that time, use "tomorrow at eodTime"
 */
function computeExpiryAt({ mode, now = new Date(), expiryHours, eodTime, manualExpiry }) {
  const m = (mode || "").toUpperCase();

  if (m === EXPIRY_MODES.MANUAL) {
    if (!(manualExpiry instanceof Date) || isNaN(manualExpiry.getTime())) {
      return { expiryAt: null, error: "Manual expiry date/time is required." };
    }
    return { expiryAt: manualExpiry, error: null };
  }

  if (m === EXPIRY_MODES.EOD) {
    const todayEod = toSameDayTime(now, eodTime);
    if (!todayEod) return { expiryAt: null, error: "EOD time is invalid (use HH:MM)." };

    // If already past EOD time, move to tomorrow same time.
    if (now.getTime() > todayEod.getTime()) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowEod = toSameDayTime(tomorrow, eodTime);
      return { expiryAt: tomorrowEod, error: null };
    }

    return { expiryAt: todayEod, error: null };
  }

  if (m === EXPIRY_MODES.AUTO || m === EXPIRY_MODES.HOURLY) {
    const expiry = addHours(now, expiryHours);
    if (!expiry) return { expiryAt: null, error: "Expiry hours must be a number." };
    return { expiryAt: expiry, error: null };
  }

  return { expiryAt: null, error: "Unknown expiry mode." };
}

function defaultHelperTextForMode(mode) {
  const m = (mode || "").toUpperCase();
  if (m === EXPIRY_MODES.MANUAL) return "Select expiry date/time manually.";
  if (m === EXPIRY_MODES.EOD) return "Expires end of day.";
  if (m === EXPIRY_MODES.HOURLY) return "Hourly item – expires after X hours.";
  if (m === EXPIRY_MODES.AUTO) return "Expiry is calculated automatically.";
  return "";
}

function isItemVisibleForStore(item, store) {
  return Array.isArray(item.stores) && item.stores.includes(store);
}

function getVisibleItems() {
  return ITEMS.filter((it) => isItemVisibleForStore(it, state.store));
}

// ========= RENDER NAV (LEFT) =========
function renderNav() {
  const nav = $("nav");

  if (state.view === "CATEGORIES" || state.view === "ITEMS" || state.view === "SAUCE_SUBCATS" || state.view === "SAUCE_ITEMS") {
    nav.innerHTML = `
      <div class="list">
        ${CATEGORIES.map((cat) => {
          const active = state.selectedCategory === cat && (state.view !== "CATEGORIES");
          return `
            <div class="pill ${active ? "active" : ""}" data-cat="${escapeHtml(cat)}">
              <div>
                <div class="title">${escapeHtml(cat)}</div>
                <div class="sub">Tap to open</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // click handlers for categories
    nav.querySelectorAll("[data-cat]").forEach((el) => {
      el.onclick = () => {
        const cat = el.getAttribute("data-cat");
        state.selectedCategory = unescapeHtml(cat);
        state.selectedItemId = null;

        if (state.selectedCategory === "Sauce") {
          state.view = "SAUCE_SUBCATS";
          state.selectedSauceSubcategory = null;
        } else {
          state.view = "ITEMS";
        }

        renderAll();
      };
    });
  }
}

// ========= RENDER CONTENT (RIGHT) =========
function renderContent() {
  const content = $("content");

  // If nothing selected yet
  if (state.view === "CATEGORIES") {
    content.innerHTML = `
      <div class="muted">Select a category to begin.</div>
      <div class="divider"></div>
      <div class="muted">
        Store filter: <span class="kbd">${escapeHtml(state.store)}</span><br/>
        SKH-only item example: <span class="kbd">Beef Taco (H)</span>
      </div>
    `;
    return;
  }

  // SAUCE SUBCATEGORIES VIEW
  if (state.view === "SAUCE_SUBCATS") {
    content.innerHTML = `
      <div class="backlink" id="backToCats">← Back to Categories</div>
      <div class="divider"></div>
      <h4 class="sectionTitle" style="margin-top:0">Sauce</h4>
      <div class="muted">Choose a sauce sub-category:</div>
      <div class="divider"></div>
      <div class="list">
        ${SAUCE_SUBCATEGORIES.map((sub) => {
          return `
            <div class="pill" data-sauce-sub="${escapeHtml(sub)}">
              <div>
                <div class="title">${escapeHtml(sub)}</div>
                <div class="sub">Tap to open</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    $("backToCats").onclick = () => {
      state.view = "CATEGORIES";
      state.selectedCategory = null;
      state.selectedSauceSubcategory = null;
      state.selectedItemId = null;
      renderAll();
    };

    content.querySelectorAll("[data-sauce-sub]").forEach((el) => {
      el.onclick = () => {
        state.selectedSauceSubcategory = unescapeHtml(el.getAttribute("data-sauce-sub"));
        state.view = "SAUCE_ITEMS";
        state.selectedItemId = null;
        renderAll();
      };
    });

    return;
  }

  // ITEMS LIST VIEW (non-sauce)
  if (state.view === "ITEMS") {
    const visibleItems = getVisibleItems().filter((it) => it.category === state.selectedCategory);

    content.innerHTML = `
      <div class="backlink" id="backToCats">← Back to Categories</div>
      <div class="divider"></div>
      <h4 class="sectionTitle" style="margin-top:0">${escapeHtml(state.selectedCategory || "")}</h4>
      <div class="muted">Store: <span class="kbd">${escapeHtml(state.store)}</span></div>
      <div class="divider"></div>
      ${
        visibleItems.length === 0
          ? `<div class="muted">No items for this store in this category.</div>`
          : `<div class="list">
              ${visibleItems
                .map((it) => {
                  const active = state.selectedItemId === it.id;
                  return `
                    <div class="pill ${active ? "active" : ""}" data-item="${escapeHtml(it.id)}">
                      <div>
                        <div class="title">${escapeHtml(it.name)}</div>
                        <div class="sub">Mode: ${escapeHtml(it.expiryMode)}</div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>`
      }
      <div class="divider"></div>
      ${state.selectedItemId ? renderItemDetailsHtml(state.selectedItemId) : `<div class="muted">Select an item to see expiry details.</div>`}
    `;

    $("backToCats").onclick = () => {
      state.view = "CATEGORIES";
      state.selectedCategory = null;
      state.selectedItemId = null;
      renderAll();
    };

    content.querySelectorAll("[data-item]").forEach((el) => {
      el.onclick = () => {
        state.selectedItemId = unescapeHtml(el.getAttribute("data-item"));
        renderAll(); // re-render to show details
      };
    });

    wireManualInputIfNeeded();
    return;
  }

  // SAUCE ITEMS VIEW
  if (state.view === "SAUCE_ITEMS") {
    const visibleItems = getVisibleItems().filter(
      (it) => it.category === "Sauce" && it.sauceSubcategory === state.selectedSauceSubcategory
    );

    content.innerHTML = `
      <div class="backlink" id="backToSauceSubs">← Back to Sauce sub-categories</div>
      <div class="divider"></div>
      <h4 class="sectionTitle" style="margin-top:0">Sauce → ${escapeHtml(state.selectedSauceSubcategory || "")}</h4>
      <div class="muted">Store: <span class="kbd">${escapeHtml(state.store)}</span></div>
      <div class="divider"></div>
      ${
        visibleItems.length === 0
          ? `<div class="muted">No sauce items for this store in this sub-category.</div>`
          : `<div class="list">
              ${visibleItems
                .map((it) => {
                  const active = state.selectedItemId === it.id;
                  return `
                    <div class="pill ${active ? "active" : ""}" data-item="${escapeHtml(it.id)}">
                      <div>
                        <div class="title">${escapeHtml(it.name)}</div>
                        <div class="sub">Mode: ${escapeHtml(it.expiryMode)}</div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>`
      }
      <div class="divider"></div>
      ${state.selectedItemId ? renderItemDetailsHtml(state.selectedItemId) : `<div class="muted">Select a sauce item to see expiry details.</div>`}
    `;

    $("backToSauceSubs").onclick = () => {
      state.view = "SAUCE_SUBCATS";
      state.selectedItemId = null;
      renderAll();
    };

    content.querySelectorAll("[data-item]").forEach((el) => {
      el.onclick = () => {
        state.selectedItemId = unescapeHtml(el.getAttribute("data-item"));
        renderAll();
      };
    });

    wireManualInputIfNeeded();
    return;
  }
}

// ========= ITEM DETAILS + EXPIRY UI =========
function renderItemDetailsHtml(itemId) {
  const item = ITEMS.find((x) => x.id === itemId);
  if (!item) return `<div class="muted">Item not found.</div>`;

  const now = new Date();
  const helperText = item.helperText || defaultHelperTextForMode(item.expiryMode);

  // Manual input value for this item
  if (!state.manualExpiryValueByItemId[itemId]) {
    state.manualExpiryValueByItemId[itemId] = toLocalDateTimeInputValue(now);
  }
  const manualValue = state.manualExpiryValueByItemId[itemId];

  const manualDate = parseDateTimeLocal(manualValue);

  const result = computeExpiryAt({
    mode: item.expiryMode,
    now,
    expiryHours: item.expiryHours,
    eodTime: item.eodTime,
    manualExpiry: manualDate,
  });

  const expiryDisplay = result.error
    ? `<div class="error"><b>Error:</b> ${escapeHtml(result.error)}</div>`
    : `<div class="ok"><b>Expiry At:</b> ${escapeHtml(formatReadable(result.expiryAt))}</div>`;

  // Show only the needed input controls
  let inputHtml = "";

  if (item.expiryMode === EXPIRY_MODES.MANUAL) {
    inputHtml = `
      <div class="divider"></div>
      <div class="row" style="align-items:flex-start">
        <div style="flex:1; min-width:220px;">
          <label>Manual Expiry (required)</label><br/>
          <input id="manualExpiryInput" type="datetime-local" value="${escapeHtml(manualValue)}" />
          <div class="muted" style="margin-top:6px;">Staff selects expiry date/time.</div>
        </div>
      </div>
    `;
  } else if (item.expiryMode === EXPIRY_MODES.EOD) {
    inputHtml = `
      <div class="divider"></div>
      <div class="muted">
        EOD time: <span class="kbd">${escapeHtml(item.eodTime || "23:59")}</span>
      </div>
    `;
  } else if (item.expiryMode === EXPIRY_MODES.AUTO || item.expiryMode === EXPIRY_MODES.HOURLY) {
    inputHtml = `
      <div class="divider"></div>
      <div class="muted">
        Hours: <span class="kbd">${escapeHtml(String(item.expiryHours ?? ""))}</span>
      </div>
    `;
  }

  return `
    <div>
      <div class="row" style="justify-content:space-between">
        <div>
          <div style="font-weight:900; font-size:16px;">${escapeHtml(item.name)}</div>
          <div class="muted">
            Mode: <span class="kbd">${escapeHtml(item.expiryMode)}</span>
            ${
              item.stores && item.stores.length === 1 && item.stores[0] === "SKH"
                ? ` &nbsp; <span class="kbd">SKH-only</span>`
                : ""
            }
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="muted"><b>Helper:</b> ${escapeHtml(helperText)}</div>

      ${inputHtml}

      <div class="divider"></div>

      ${expiryDisplay}

      <div class="muted" style="margin-top:8px;">
        Current time: <span class="kbd">${escapeHtml(formatReadable(new Date()))}</span>
      </div>
    </div>
  `;
}

function wireManualInputIfNeeded() {
  // Only wire if manual input exists on page
  const input = document.getElementById("manualExpiryInput");
  if (!input) return;

  const itemId = state.selectedItemId;
  input.oninput = (e) => {
    state.manualExpiryValueByItemId[itemId] = e.target.value;
    renderAll(); // update computed expiry immediately
  };
}

// ========= HTML ESCAPE (safe rendering) =========
function escapeHtml(str) {
  const s = String(str ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function unescapeHtml(str) {
  // because we stored escaped attrs for safety; restore minimal
  // (here we only used simple strings, so this is OK)
  return String(str ?? "");
}

// ========= MAIN RENDER =========
function renderAll() {
  renderNav();
  renderContent();
}

// ========= INIT =========
(function init() {
  const storeSelect = $("store");
  storeSelect.value = state.store;

  storeSelect.onchange = (e) => {
    state.store = e.target.value;

    // If selected item is no longer visible after store change, clear it.
    if (state.selectedItemId) {
      const item = ITEMS.find((x) => x.id === state.selectedItemId);
      if (!item || !isItemVisibleForStore(item, state.store)) {
        state.selectedItemId = null;
      }
    }

    // If on a view and category has no items now, that's okay; UI will show empty.
    renderAll();
  };

  // Start on categories view
  state.view = "CATEGORIES";
  renderAll();
})();
