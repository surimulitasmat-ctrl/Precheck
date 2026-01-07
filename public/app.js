/* PreCheck - public/app.js (EMOJI HOME TILE VERSION) */
(() => {
  "use strict";

  /* =======================
     CONFIG
  ======================= */
  const API = "";
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
    ]
  );

  const HOURLY_FIXED_ITEMS = new Set([
    "bread",
    "tomato soup (h)",
    "mushroom soup (h)",
  ]);

  const EOD_ITEMS = new Set(["chicken bacon"]);

  const HOURLY_FIXED_TIMES = [
    { label: "11:00 AM", value: "11:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "7:00 PM", value: "19:00" },
    { label: "11:00 PM", value: "23:00" },
  ];

  /* =======================
     STATE
  ======================= */
  const state = {
    session: loadSession(),
    items: [],
    view: { page: "boot", category: null, sauceSub: null },
    loading: false,
  };

  /* =======================
     DOM BOOTSTRAP
  ======================= */
  const app = document.getElementById("app") || document.body;
  app.innerHTML = `
    <header class="pc-topbar" id="topbar">
      <div>
        <div class="pc-brand">PreCheck</div>
        <div class="pc-session" id="sessionPill"></div>
      </div>
      <div>
        <button id="navHome">Home</button>
        <button id="navAlerts">Alerts</button>
        <button id="navLogout">Logout</button>
      </div>
    </header>
    <main id="main"></main>
    <div id="toast" class="pc-toast"></div>
  `;

  const main = document.getElementById("main");
  const sessionPill = document.getElementById("sessionPill");
  const toast = document.getElementById("toast");

  document.getElementById("navHome").onclick = () => {
    state.view = { page: "home" };
    render();
  };

  document.getElementById("navAlerts").onclick = () => {
    state.view = { page: "alerts" };
    render();
  };

  document.getElementById("navLogout").onclick = () => {
    localStorage.removeItem(LS_KEY);
    location.reload();
  };

  /* =======================
     BOOT
  ======================= */
  boot();

  async function boot() {
    if (!state.session) {
      renderSession();
      return;
    }
    await loadItems();
    state.view = { page: "home" };
    render();
  }

  /* =======================
     DATA
  ======================= */
  async function loadItems() {
    const res = await fetch("/api/items");
    const raw = await res.json();

    state.items = raw.filter((it) => {
      if (
        it.category === "Front counter" &&
        it.name.toLowerCase() === "beef taco" &&
        state.session.store !== "SKH"
      ) {
        return false;
      }
      return true;
    });
  }

  /* =======================
     RENDER ROUTER
  ======================= */
  function render() {
    updateSessionPill();

    if (state.view.page === "home") return renderHome();
    if (state.view.page === "sauce_menu") return renderSauceMenu();
    if (state.view.page === "category") return renderCategory();
    if (state.view.page === "alerts") return renderAlerts();
  }

  /* =======================
     SESSION
  ======================= */
  function renderSession() {
    document.getElementById("topbar").style.display = "none";
    main.innerHTML = `
      <div class="pc-card">
        <h2>Start Session</h2>
        <select id="sStore">
          <option value="">Store</option>
          <option value="PDD">PDD</option>
          <option value="SKH">SKH</option>
        </select>
        <select id="sShift">
          <option value="">Shift</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        <input id="sStaff" placeholder="Staff name / ID" />
        <button id="sStart">Start</button>
      </div>
    `;

    document.getElementById("sStart").onclick = async () => {
      const store = document.getElementById("sStore").value;
      const shift = document.getElementById("sShift").value;
      const staff = document.getElementById("sStaff").value.trim();

      if (!store || !shift || !staff) {
        showToast("Complete all fields");
        return;
      }

      const sess = { store, shift, staff };
      localStorage.setItem(LS_KEY, JSON.stringify(sess));
      state.session = sess;

      await loadItems();
      state.view = { page: "home" };
      render();
    };
  }

  /* =======================
     HOME (EMOJI TILES)
  ======================= */
  function renderHome() {
    document.getElementById("topbar").style.display = "flex";

    const counts = {};
    CATEGORIES.forEach((c) => (counts[c] = 0));
    state.items.forEach((it) => {
      if (counts[it.category] !== undefined) counts[it.category]++;
    });

    const TILE_META = {
      "Prepared items": { color: "green", icon: "🥪" },
      "Unopened chiller": { color: "blue", icon: "🧊" },
      "Thawing": { color: "cyan", icon: "❄️" },
      "Vegetables": { color: "lime", icon: "🥬" },
      "Backroom": { color: "orange", icon: "📦" },
      "Back counter": { color: "yellow", icon: "🧂" },
      "Front counter": { color: "red", icon: "🧾" },
      "Back counter chiller": { color: "teal", icon: "🧀" },
      "Sauce": { color: "purple", icon: "🧴" },
    };

    main.innerHTML = `
      <div class="grid">
        ${CATEGORIES.map((cat) => {
          const meta = TILE_META[cat];
          return `
            <button class="tile tile-${meta.color}" data-cat="${cat}">
              <div class="icon">${meta.icon}</div>
              <div class="title">${cat}</div>
              <div class="sub">${counts[cat]} items</div>
            </button>
          `;
        }).join("")}
      </div>
    `;

    document.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        if (cat === "Sauce") {
          state.view = { page: "sauce_menu" };
        } else {
          state.view = { page: "category", category: cat };
        }
        render();
      };
    });
  }

  /* =======================
     SAUCE MENU
  ======================= */
  function renderSauceMenu() {
    main.innerHTML = `
      <button onclick="history.back()">← Back</button>
      <div class="grid">
        ${SAUCE_SUBS.map(
          (s) => `<button data-sauce="${s}" class="tile tile-green">${s}</button>`
        ).join("")}
      </div>
    `;

    document.querySelectorAll("[data-sauce]").forEach((btn) => {
      btn.onclick = () => {
        state.view = {
          page: "category",
          category: "Sauce",
          sauceSub: btn.dataset.sauce,
        };
        render();
      };
    });
  }

  /* =======================
     CATEGORY LIST
  ======================= */
  function renderCategory() {
    const { category, sauceSub } = state.view;

    let list = state.items.filter((it) => it.category === category);
    if (category === "Sauce") {
      list = list.filter((it) => it.sub_category === sauceSub);
    }

    main.innerHTML = `
      <button onclick="history.back()">← Back</button>
      <div class="list">
        ${list
          .map(
            (it) => `
          <div class="row">
            <div>${it.name}</div>
            <div class="hint">Tap to log</div>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  /* =======================
     ALERTS
  ======================= */
  function renderAlerts() {
    main.innerHTML = `<div class="pc-card">Alerts page (next step)</div>`;
  }

  /* =======================
     HELPERS
  ======================= */
  function updateSessionPill() {
    if (!state.session) return;
    sessionPill.textContent = `${state.session.store} • ${state.session.shift} • ${state.session.staff}`;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.opacity = 1;
    setTimeout(() => (toast.style.opacity = 0), 2000);
  }

  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY));
    } catch {
      return null;
    }
  }
})();
