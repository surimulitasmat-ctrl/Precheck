/* =========================
   PreCheck — public/app.js (FULL)
   Works with your current index.html IDs:
   - #topbar, #btnMenu, #drawerBackdrop, #btnDrawerClose
   - #drawerHome, #drawerAlerts, #drawerManager, #drawerLogout
   - #main, #rolePill, #sessionLine
   - modal: #modalBackdrop #modalClose #modalTitle #modalBody
   ========================= */

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- tiny CSS safety (in case some classes missing) ---------- */
(function injectTinyCss() {
  const css = `
  .hidden{display:none !important;}
  .btn{border:0;border-radius:14px;padding:12px 14px;font-weight:800}
  .btn-yellow{background:#F7C948;color:#1a1a1a}
  .btn-red{background:#E53935;color:#fff}
  .btn-blue{background:#1E88E5;color:#fff}
  .btn-ghost{background:transparent;border:1px solid rgba(0,0,0,.12)}
  .row{display:flex;gap:10px;align-items:center}
  .col{display:flex;flex-direction:column;gap:10px}
  .card{background:#fff;border-radius:18px;padding:14px;box-shadow:0 10px 24px rgba(0,0,0,.08)}
  .muted{opacity:.7}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .tileBig{border-radius:22px;padding:18px;color:#fff;min-height:120px;display:flex;flex-direction:column;justify-content:center;gap:10px;position:relative;overflow:hidden;transform:translateY(10px);opacity:0;animation:tileIn .45s ease forwards}
  .tileBig .emoji{font-size:44px;line-height:1}
  .tileBig .name{font-size:20px;font-weight:900}
  .tileBig .sub{font-size:13px;font-weight:800;opacity:.9}
  @keyframes tileIn{to{transform:translateY(0);opacity:1}}
  .pill{border-radius:999px;padding:10px 14px;font-weight:900;display:inline-flex;align-items:center;gap:8px}
  .pill.manager{background:#E53935;color:#fff}
  .pill.staff{background:#1E88E5;color:#fff}
  .listItem{padding:14px;border-radius:16px;background:#fff;box-shadow:0 8px 18px rgba(0,0,0,.07)}
  .qtyBox{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(0,0,0,.10);border-radius:14px;padding:10px 12px;min-width:140px}
  .qtyBtn{width:42px;height:42px;border-radius:14px;border:0;background:rgba(0,0,0,.06);font-size:22px;font-weight:900}
  .select{width:100%;border:1px solid rgba(0,0,0,.12);border-radius:14px;padding:12px 12px;font-size:16px;background:#fff}
  .divider{height:1px;background:rgba(0,0,0,.08);margin:10px 0}
  .topBack{display:inline-flex;align-items:center;gap:10px}
  .fadeIn{animation:fadeIn .22s ease both}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  `;
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ---------- App state ---------- */
const state = {
  view: { page: "home", category: null, sauceSub: null },
  navStack: [],
  session: loadJSON("session", {
    store: "",
    staff: "",
    shift: "AM",
    isManager: false,
    managerToken: "",
    sessionDayKey: "", // used for midnight reset
  }),
  data: {
    categories: [],
    items: [],
    expiry: [], // latest expiry per item from /api/expiry
  },
  drafts: {}, // category page: { [itemIdOrNameKey]: {qty, expType, expValue, expDateISO} }
};

/* ---------- constants ---------- */
const POPUP_ITEMS = [
  "Mix green",
  "Mac&cheese",
  "Lettuce",
  "Chicken Bacon (c)",
  "Liquid Egg",
  "Flatbread(Thawing)",
  "Avocado",
];

// Home emojis (you asked: emoji only, BIG)
const CAT_EMOJI = {
  "Prepared items": "🥪",
  "Unopened chiller": "🧊",
  "Thawing": "💧",
  "Vegetables": "🥕",
  "Backroom": "📦",
  "Front counter": "🥪",
  "Back counter chiller": "❄️",
  "Fountain Drinks": "🥤",
  "Sauce": "🧴",
};

// Sauce subcategories (fix standby/open inner missing + 3 colors + emoji big)
const SAUCE_SUBS = [
  { name: "Standby", emoji: "🧃", tone: "teal" },
  { name: "Open Inner", emoji: "🧴", tone: "purple" },
  { name: "Sandwich Unit", emoji: "🌶️", tone: "orange" },
];

// Categories where expiry must be MANUAL single bar (you asked: Unopened chiller + Fountain Drinks)
const FORCE_MANUAL_DATE_CATS = new Set(["Unopened chiller", "Fountain Drinks"]);

// Chicken Bacon (c) rule (auto end-of-day)
function isChickenBaconC(name) {
  const t = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  return t === "chicken bacon (c)" || t === "chicken bacon(c)" || t === "chicken bacon c";
}

/* ---------- boot ---------- */
bindTopbar();
bindDrawer();
bindModal();

midnightAutoReset(); // your request: session auto resets after midnight

boot().catch(console.error);

async function boot() {
  ensureSessionDayKey();

  // Show session popup once per session/day (even if not logged out)
  maybeShowExpiryPopup();

  // If store not set yet, show session setup modal
  if (!state.session.store || !state.session.staff) {
    openSessionSetup();
    return;
  }

  await loadAllForCurrentStore();
  render();
}

/* ---------- storage ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}
function saveSession() {
  localStorage.setItem("session", JSON.stringify(state.session));
}

/* ---------- date helpers ---------- */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function ymd(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function formatDMY(d) {
  const dt = new Date(d);
  const day = dt.getDate();
  const mon = dt.toLocaleString("en-GB", { month: "short" });
  const year = dt.getFullYear();
  return `${day} ${mon} ${year}`; // "23 May 2026"
}
function todayISO() {
  return ymd(new Date());
}
function addDaysISO(baseISO, n) {
  const dt = new Date(baseISO + "T00:00:00");
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}

/* ---------- API ---------- */
async function apiGet(path) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(path, body, token = "") {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiPatch(path, body, token = "") {
  const r = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}
async function apiDel(path, token = "") {
  const r = await fetch(path, {
    method: "DELETE",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : {};
}

async function loadAllForCurrentStore() {
  const store = state.session.store;
  state.data.categories = await apiGet(`/api/categories?store=${encodeURIComponent(store)}`);
  state.data.items = await apiGet(`/api/items?store=${encodeURIComponent(store)}`);
  state.data.expiry = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);

  // Fix: ensure sauce items show under standby/open inner/sandwich unit even if sub_category inconsistent casing
  state.data.items = state.data.items.map((it) => ({
    ...it,
    sub_category: it.sub_category ? String(it.sub_category).trim() : null,
  }));
}

/* ---------- UI: topbar ---------- */
function bindTopbar() {
  const rolePill = $("#rolePill");
  if (rolePill) {
    rolePill.addEventListener("click", () => {
      // toggle manager/staff quickly (optional)
      if (state.session.isManager) toast("Manager mode");
      else toast("Staff mode");
    });
  }
}

function updateTopbar() {
  const sessionLine = $("#sessionLine");
  if (sessionLine) {
    const s = state.session;
    const show = s.store && s.staff;
    sessionLine.classList.toggle("hidden", !show);
    sessionLine.textContent = show ? `${s.store} • ${s.shift} • ${s.staff}` : "";
  }

  const rolePill = $("#rolePill");
  if (rolePill) {
    rolePill.classList.toggle("hidden", false);
    if (state.session.isManager) {
      rolePill.className = "role-pill pill manager";
      rolePill.textContent = "Manager 👑";
    } else {
      rolePill.className = "role-pill pill staff";
      rolePill.textContent = "Staff 👤";
    }
  }
}

/* ---------- UI: drawer ---------- */
function bindDrawer() {
  const btnMenu = $("#btnMenu");
  const backdrop = $("#drawerBackdrop");
  const btnClose = $("#btnDrawerClose");

  if (btnMenu) {
    btnMenu.addEventListener("click", (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDrawer();
    });
  }
  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeDrawer();
    });
  }

  // big buttons
  const dHome = $("#drawerHome");
  const dAlerts = $("#drawerAlerts");
  const dManager = $("#drawerManager");
  const dLogout = $("#drawerLogout");

  if (dHome) dHome.addEventListener("click", () => { closeDrawer(); goHome(); });
  if (dAlerts) dAlerts.addEventListener("click", () => { closeDrawer(); setView({ page: "alerts" }, true); });
  if (dManager) dManager.addEventListener("click", () => { closeDrawer(); setView({ page: "manager" }, true); });
  if (dLogout) dLogout.addEventListener("click", () => { closeDrawer(); doLogout(); });

  // Add "Summary" + "WISR Count" under hamburger (you asked)
  ensureDrawerExtraButtons();
}

function ensureDrawerExtraButtons() {
  const drawer = $("#drawer");
  if (!drawer) return;

  // if already added, skip
  if ($("#drawerSummary")) return;

  const body = $(".drawer-body", drawer);
  if (!body) return;

  const sep = document.createElement("div");
  sep.className = "drawer-sep";
  sep.style.margin = "10px 0";

  const summary = document.createElement("button");
  summary.id = "drawerSummary";
  summary.className = "drawer-item";
  summary.type = "button";
  summary.textContent = "📊 Summary";
  summary.style.fontSize = "18px";
  summary.style.padding = "16px 14px";
  summary.addEventListener("click", () => {
    closeDrawer();
    setView({ page: "summaryHome" }, true);
  });

  const wisr = document.createElement("button");
  wisr.id = "drawerWISR";
  wisr.className = "drawer-item";
  wisr.type = "button";
  wisr.textContent = "🧮 WISR Count";
  wisr.style.fontSize = "18px";
  wisr.style.padding = "16px 14px";
  wisr.addEventListener("click", () => {
    closeDrawer();
    toast("WISR Count (blank for now)");
    setView({ page: "wisr" }, true);
  });

  // Insert above logout (logout is already in body)
  body.insertBefore(sep, $("#drawerLogout"));
  body.insertBefore(summary, $("#drawerLogout"));
  body.insertBefore(wisr, $("#drawerLogout"));

  // Make logout BIG + RED + no door icon (your request)
  const logout = $("#drawerLogout");
  if (logout) {
    logout.textContent = "🚫 Logout";
    logout.style.fontSize = "18px";
    logout.style.padding = "18px 14px";
    logout.style.borderRadius = "16px";
    logout.style.background = "#E53935";
    logout.style.color = "#fff";
    logout.style.fontWeight = "900";
  }
}

function openDrawer() {
  const b = $("#drawerBackdrop");
  if (b) b.classList.remove("hidden");
}
function closeDrawer() {
  const b = $("#drawerBackdrop");
  if (b) b.classList.add("hidden");
}

/* ---------- navigation ---------- */
function setView(next, push) {
  const curr = { ...state.view };
  if (push) state.navStack.push(curr);
  state.view = { ...state.view, ...next };
  render();
}
function goBack() {
  const prev = state.navStack.pop();
  if (prev) state.view = prev;
  else state.view = { page: "home", category: null, sauceSub: null };
  render();
}
function goHome() {
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null };
  render();
}

/* ---------- modal ---------- */
function bindModal() {
  const mClose = $("#modalClose");
  if (mClose) mClose.addEventListener("click", closeModal);
  const backdrop = $("#modalBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
}
function openModal(title, html, opts = {}) {
  $("#modalTitle").textContent = title || "Modal";
  $("#modalBody").innerHTML = html || "";
  $("#modalBackdrop").classList.remove("hidden");
  if (opts.noBackdropClose) {
    $("#modalBackdrop").onclick = (e) => { if (e.target === $("#modalBackdrop")) e.stopPropagation(); };
  }
}
function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
  $("#modalBody").innerHTML = "";
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

/* =========================================================
   SESSION: auto reset after midnight + setup modal + popup
   ========================================================= */

function dayKeyNow() {
  // local date key
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ensureSessionDayKey() {
  const k = dayKeyNow();
  if (!state.session.sessionDayKey) {
    state.session.sessionDayKey = k;
    saveSession();
  }
}

function midnightAutoReset() {
  // If the app stays open overnight, reset at midnight
  const check = () => {
    const k = dayKeyNow();
    if (state.session.sessionDayKey && state.session.sessionDayKey !== k) {
      state.session.sessionDayKey = k;

      // force popup again after midnight (your request)
      localStorage.removeItem("expiry_popup_seen_" + k); // ensure not marked
      saveSession();

      // show popup next render
      maybeShowExpiryPopup(true);
      render();
    }
  };
  setInterval(check, 30 * 1000);
}

function maybeShowExpiryPopup(force = false) {
  const k = dayKeyNow();
  const seenKey = "expiry_popup_seen_" + k;

  if (!force && localStorage.getItem(seenKey) === "1") return;

  // show once per day
  localStorage.setItem(seenKey, "1");

  // theme-matching popup (your request)
  const list = POPUP_ITEMS.map((x) => `<li style="padding:6px 0;font-weight:800">${escapeHtml(x)}</li>`).join("");
  openModal(
    "PLEASE check the expiry date",
    `
    <div class="card fadeIn" style="border:2px solid rgba(0,154,68,.18)">
      <div style="font-weight:900;margin-bottom:8px">PLEASE check the expiry date of the items below:</div>
      <ul style="margin:8px 0 0 18px">${list}</ul>
      <div class="divider"></div>
      <button id="okPopup" class="btn btn-yellow" style="width:100%;font-size:16px">OK</button>
    </div>
    `,
    { noBackdropClose: true }
  );
  $("#okPopup").addEventListener("click", closeModal);
}

function openSessionSetup() {
  const s = state.session;

  openModal(
    "Start Session",
    `
    <div class="card fadeIn">
      <div class="col">
        <div style="font-weight:900">Select Store</div>
        <div class="row">
          <button id="pickPDD" class="btn btn-green" style="flex:1;background:#009A44;color:#fff">PDD</button>
          <button id="pickSKH" class="btn btn-green" style="flex:1;background:#009A44;color:#fff;opacity:.85">SKH</button>
        </div>

        <div style="font-weight:900;margin-top:10px">Shift</div>
        <select id="shiftSel" class="select">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>

        <div style="font-weight:900;margin-top:10px">Staff Name / ID</div>
        <input id="staffInp" class="select" placeholder="e.g. Suri" value="${escapeHtml(s.staff || "")}" />

        <div class="divider"></div>
        <button id="startBtn" class="btn btn-yellow" style="width:100%;font-size:16px">Start</button>

        <div style="font-size:12px" class="muted">Session will reset after midnight automatically.</div>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  let storePick = s.store || "PDD";

  const setPick = (val) => {
    storePick = val;
    $("#pickPDD").style.opacity = val === "PDD" ? "1" : ".75";
    $("#pickSKH").style.opacity = val === "SKH" ? "1" : ".75";
  };
  setPick(storePick);

  $("#pickPDD").addEventListener("click", () => setPick("PDD"));
  $("#pickSKH").addEventListener("click", () => setPick("SKH"));

  $("#startBtn").addEventListener("click", async () => {
    const staff = String($("#staffInp").value || "").trim();
    const shift = String($("#shiftSel").value || "AM");
    if (!staff) return toast("Please enter staff name/ID");

    state.session.store = storePick;
    state.session.shift = shift;
    state.session.staff = staff;
    state.session.isManager = false;
    state.session.managerToken = "";
    state.session.sessionDayKey = dayKeyNow();
    saveSession();

    closeModal();
    try {
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Failed to load data");
    }
  });
}

/* =========================================================
   RENDER
   ========================================================= */
function render() {
  updateTopbar();

  const main = $("#main");
  if (!main) return;

  // If session missing, show setup
  if (!state.session.store || !state.session.staff) {
    main.innerHTML = `<div class="card fadeIn">Session not started.</div>`;
    openSessionSetup();
    return;
  }

  const v = state.view.page;

  if (v === "home") return renderHome();
  if (v === "category") return renderCategoryPage();
  if (v === "alerts") return renderAlerts();
  if (v === "manager") return renderManagerHome();
  if (v === "managerEditItems") return renderManagerEditItems();
  if (v === "managerCategories") return renderManagerCategories();
  if (v === "summaryHome") return renderSummaryHome();
  if (v === "summaryList") return renderSummaryList();
  if (v === "wisr") return renderWISR();

  // fallback
  $("#main").innerHTML = `<div class="card">Unknown page</div>`;
}

/* ---------- HOME ---------- */
function renderHome() {
  const main = $("#main");

  const cats = state.data.categories.map((c) => c.name);

  // count items per category
  const counts = {};
  for (const it of state.data.items) {
    const c = it.category;
    counts[c] = (counts[c] || 0) + 1;
  }

  const tiles = cats
    .map((name, idx) => {
      const emoji = CAT_EMOJI[name] || "✅";
      const color = tileColorFor(name);
      const count = counts[name] || 0;
      const delay = 40 * idx;

      return `
      <button class="tileBig" style="${color};animation-delay:${delay}ms" data-cat="${escapeHtml(name)}" type="button">
        <div class="emoji">${emoji}</div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="sub">${count} items</div>
      </button>`;
    })
    .join("");

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="grid2">${tiles}</div>
    </div>
  `;

  // bind tile clicks
  $$(".tileBig", main).forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.dataset.cat;

      // Sauce -> subcategory tiles first (bigger emoji, no frame, 3 colors)
      if (cat === "Sauce") {
        setView({ page: "category", category: "Sauce", sauceSub: null }, true);
      } else {
        setView({ page: "category", category: cat, sauceSub: null }, true);
      }
    });
  });
}

function tileColorFor(name) {
  // simple mapping similar to your mockups
  const map = {
    "Prepared items": "background:linear-gradient(135deg,#0B7A38,#0E9A44)",
    "Unopened chiller": "background:linear-gradient(135deg,#1E6BD6,#2A86FF)",
    Thawing: "background:linear-gradient(135deg,#0AA0B5,#0CC0D8)",
    Vegetables: "background:linear-gradient(135deg,#2E7D32,#4CAF50)",
    Backroom: "background:linear-gradient(135deg,#F57C00,#FB8C00)",
    "Front counter": "background:linear-gradient(135deg,#C62828,#E53935)",
    "Back counter chiller": "background:linear-gradient(135deg,#00796B,#009688)",
    "Fountain Drinks": "background:linear-gradient(135deg,#1B5E20,#2E7D32)",
    Sauce: "background:linear-gradient(135deg,#5E35B1,#7E57C2)",
  };
  return map[name] || "background:linear-gradient(135deg,#37474F,#546E7A)";
}

/* ---------- CATEGORY PAGE ---------- */
function renderCategoryPage() {
  const main = $("#main");
  const cat = state.view.category;

  // Sauce special: show subcategory tiles first
  if (cat === "Sauce" && !state.view.sauceSub) {
    const tiles = SAUCE_SUBS.map((s, idx) => {
      const tone = s.tone;
      const color =
        tone === "teal"
          ? "background:linear-gradient(135deg,#00796B,#009688)"
          : tone === "purple"
          ? "background:linear-gradient(135deg,#5E35B1,#7E57C2)"
          : "background:linear-gradient(135deg,#F57C00,#FB8C00)";
      return `
        <button class="tileBig" style="${color};min-height:110px;animation-delay:${idx * 50}ms" type="button" data-sub="${escapeHtml(s.name)}">
          <div class="emoji" style="font-size:48px">${s.emoji}</div>
          <div class="name" style="font-size:22px">${escapeHtml(s.name)}</div>
        </button>
      `;
    }).join("");

    main.innerHTML = `
      <div class="col fadeIn">
        <div class="topBack">
          <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
          <div style="font-size:26px;font-weight:900;color:#0B7A38">Sauce</div>
        </div>
        <div class="grid2">${tiles}</div>
      </div>
    `;
    $("#btnBack").addEventListener("click", goBack);
    $$(".tileBig", main).forEach((b) => {
      b.addEventListener("click", () => {
        const sub = b.dataset.sub;
        setView({ page: "category", category: "Sauce", sauceSub: sub }, true);
      });
    });
    return;
  }

  const sauceSub = state.view.sauceSub;
  const title = sauceSub ? `Sauce — ${sauceSub}` : cat;

  // items filtered
  let items = state.data.items.filter((x) => x.category === cat);
  if (cat === "Sauce" && sauceSub) {
    // Fix: normalize to match
    items = items.filter((x) => String(x.sub_category || "").toLowerCase() === String(sauceSub).toLowerCase());
  }

  // If missing (your bug report standby/open inner has no items)
  // show hint if empty
  const emptyHint = items.length
    ? ""
    : `<div class="card" style="border-left:6px solid #F7C948">
         <div style="font-weight:900">No items found</div>
         <div class="muted" style="margin-top:6px">
           This usually means the item sub-category name in DB doesn’t match (${escapeHtml(sauceSub || "N/A")}).
         </div>
       </div>`;

  const rows = items.map((it) => renderItemRow(it, cat)).join("");

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">${escapeHtml(title)}</div>
      </div>

      ${emptyHint}

      <div class="col" id="itemsWrap">${rows}</div>

      <button id="saveCat" class="btn btn-yellow" style="width:100%;font-size:18px;padding:16px;border-radius:18px">
        Save ${escapeHtml(cat)}
      </button>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);

  // bind controls for items
  bindCategoryItemControls(items, cat);

  $("#saveCat").addEventListener("click", async () => {
    await saveCategoryDrafts(items, cat);
  });
}

function itemKey(it) {
  // prefer id
  return it.id != null ? `id:${it.id}` : `name:${it.name}|${it.category}|${it.sub_category || ""}`;
}

function renderItemRow(it, cat) {
  const key = itemKey(it);

  const draft = state.drafts[key] || { qty: 0, expType: "", expValue: "", expDateISO: "" };

  // expiry UI rules:
  // - Unopened chiller + Fountain Drinks = manual date input ONLY (one bar)
  // - Chicken Bacon (c) = EOD auto (no picker)
  // - else: compact dropdown (Select / Today / Tomorrow / Pick Date)
  const forceManual = FORCE_MANUAL_DATE_CATS.has(cat);
  const isCBC = isChickenBaconC(it.name);

  let expiryUI = "";

  if (isCBC) {
    expiryUI = `<div class="muted" style="font-weight:800;margin-top:6px">Expiry: End of day (auto).</div>`;
  } else if (forceManual) {
    const v = draft.expDateISO || "";
    expiryUI = `
      <div style="margin-top:8px">
        <input class="select" data-expdate="${escapeHtml(key)}" type="date" value="${escapeHtml(v)}" />
        <div class="muted" style="font-weight:800;margin-top:6px">Expiry: Pick a date (manual).</div>
      </div>
    `;
  } else {
    // dropdown -> show formatted date options
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const pick = draft.expType === "PICK" ? (draft.expDateISO ? formatDMY(draft.expDateISO) : "Pick Date") : "Pick Date";

    const selVal = draft.expType || "";
    expiryUI = `
      <div style="margin-top:8px">
        <select class="select" data-expsel="${escapeHtml(key)}">
          <option value="">Select</option>
          <option value="TODAY"${selVal === "TODAY" ? " selected" : ""}>Today — ${formatDMY(today)}</option>
          <option value="TOMORROW"${selVal === "TOMORROW" ? " selected" : ""}>Tomorrow — ${formatDMY(tomorrow)}</option>
          <option value="PICK"${selVal === "PICK" ? " selected" : ""}>${pick}</option>
        </select>
        <div data-pickwrap="${escapeHtml(key)}" class="${selVal === "PICK" ? "" : "hidden"}" style="margin-top:8px">
          <input class="select" data-expdate="${escapeHtml(key)}" type="date" value="${escapeHtml(draft.expDateISO || "")}" />
        </div>
        <div class="muted" style="font-weight:800;margin-top:6px">
          Expiry: Today / Tomorrow / Pick Date.
        </div>
      </div>
    `;
  }

  return `
    <div class="listItem" data-item="${escapeHtml(key)}">
      <div style="font-size:22px;font-weight:900">${escapeHtml(it.name)}</div>
      <div class="row" style="margin-top:12px">
        <div class="qtyBox">
          <button class="qtyBtn" data-dec="${escapeHtml(key)}" type="button">−</button>
          <div style="font-weight:900;font-size:18px;min-width:26px;text-align:center" data-qty="${escapeHtml(key)}">${draft.qty || 0}</div>
          <button class="qtyBtn" data-inc="${escapeHtml(key)}" type="button">+</button>
        </div>
        <div style="flex:1">${expiryUI}</div>
      </div>
    </div>
  `;
}

function bindCategoryItemControls(items, cat) {
  const wrap = $("#itemsWrap");
  if (!wrap) return;

  for (const it of items) {
    const key = itemKey(it);
    if (!state.drafts[key]) state.drafts[key] = { qty: 0, expType: "", expValue: "", expDateISO: "" };

    const inc = $(`[data-inc="${cssEsc(key)}"]`, wrap);
    const dec = $(`[data-dec="${cssEsc(key)}"]`, wrap);
    const qtyEl = $(`[data-qty="${cssEsc(key)}"]`, wrap);
    const sel = $(`[data-expsel="${cssEsc(key)}"]`, wrap);
    const dateInp = $(`[data-expdate="${cssEsc(key)}"]`, wrap);

    if (inc) inc.addEventListener("click", () => {
      state.drafts[key].qty = (Number(state.drafts[key].qty) || 0) + 1;
      if (qtyEl) qtyEl.textContent = String(state.drafts[key].qty);
    });

    if (dec) dec.addEventListener("click", () => {
      state.drafts[key].qty = Math.max(0, (Number(state.drafts[key].qty) || 0) - 1);
      if (qtyEl) qtyEl.textContent = String(state.drafts[key].qty);
    });

    if (sel) sel.addEventListener("change", () => {
      const v = String(sel.value || "");
      state.drafts[key].expType = v;
      if (v !== "PICK") state.drafts[key].expDateISO = "";
      const pickWrap = $(`[data-pickwrap="${cssEsc(key)}"]`, wrap);
      if (pickWrap) pickWrap.classList.toggle("hidden", v !== "PICK");
      // update option label if needed
    });

    if (dateInp) dateInp.addEventListener("change", () => {
      state.drafts[key].expDateISO = String(dateInp.value || "");
      if (!state.drafts[key].expType) {
        // for manual-date categories, keep expType as MANUAL
        state.drafts[key].expType = "MANUAL";
      }
    });
  }
}

async function saveCategoryDrafts(items, cat) {
  const store = state.session.store;
  const staff = state.session.staff;
  const shift = state.session.shift;

  const rows = [];

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  for (const it of items) {
    const key = itemKey(it);
    const d = state.drafts[key] || { qty: 0, expType: "", expDateISO: "" };
    const qty = Number(d.qty) || 0;
    if (qty <= 0) continue;

    let expiry = null;

    if (isChickenBaconC(it.name)) {
      // End of day => store only date as today (server can interpret)
      expiry = today;
    } else if (FORCE_MANUAL_DATE_CATS.has(cat)) {
      expiry = d.expDateISO || null;
    } else {
      if (d.expType === "TODAY") expiry = today;
      else if (d.expType === "TOMORROW") expiry = tomorrow;
      else if (d.expType === "PICK") expiry = d.expDateISO || null;
      else expiry = null;
    }

    rows.push({
      item_id: it.id ?? null,
      item_name: it.name,
      category: it.category,
      sub_category: it.sub_category || null,
      quantity: qty,
      expiry: expiry, // YYYY-MM-DD
      expiry_at: null,
    });
  }

  if (!rows.length) return toast("Nothing to save");

  try {
    await apiPost("/api/log/batch", { store, staff, shift, rows });
    toast("Saved ✅");
    // reload expiry for summary
    state.data.expiry = await apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
  } catch (e) {
    console.error(e);
    toast("Save failed");
  }
}

/* ---------- ALERTS (simple placeholder) ---------- */
function renderAlerts() {
  $("#main").innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">Alerts</div>
      </div>
      <div class="card">
        <div style="font-weight:900">Coming soon</div>
        <div class="muted">We’ll add expiry alerts list here.</div>
      </div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);
}

/* =========================================================
   SUMMARY
   - Staff: summary for their store only
   - Manager: can switch store / view both
   - Drawer "Summary" goes to summaryHome (3 big cards)
   - Cards go to DIFFERENT pages now (your change)
   ========================================================= */

function computeSummaryForStore(store, expiryRows) {
  // expiryRows: [{name, category, sub_category, expiry_value}]
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  let todayList = [];
  let tomorrowList = [];
  let safeList = [];

  // show quantity = latest logged quantity per item? (server expiry endpoint doesn't return qty)
  // So we display qty as "—" for now unless your server adds it later.
  for (const r of expiryRows) {
    const e = String(r.expiry_value || "").slice(0, 10);
    if (!e) continue;
    if (e === today) todayList.push(r);
    else if (e === tomorrow) tomorrowList.push(r);
    else safeList.push(r);
  }

  return {
    today: todayList,
    tomorrow: tomorrowList,
    safe: safeList,
  };
}

async function loadExpiryFor(store) {
  return apiGet(`/api/expiry?store=${encodeURIComponent(store)}`);
}

function renderSummaryHome() {
  const main = $("#main");

  const isMgr = state.session.isManager;
  const store = state.session.store;

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">Summary</div>
      </div>

      ${isMgr ? `
      <div class="card">
        <div style="font-weight:900;margin-bottom:8px">Store</div>
        <div class="row">
          <button id="sumPDD" class="btn" style="flex:1;background:#009A44;color:#fff">PDD</button>
          <button id="sumSKH" class="btn" style="flex:1;background:#009A44;color:#fff;opacity:.75">SKH</button>
          <button id="sumBOTH" class="btn btn-blue" style="flex:1">BOTH</button>
        </div>
        <div class="muted" style="margin-top:8px">Manager can view both stores. Staff only sees their store.</div>
      </div>
      ` : ""}

      <div id="sumCards" class="col"></div>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);

  let mode = isMgr ? "PDD" : store;

  const setMode = async (m) => {
    mode = m;

    if (isMgr) {
      $("#sumPDD").style.opacity = m === "PDD" ? "1" : ".75";
      $("#sumSKH").style.opacity = m === "SKH" ? "1" : ".75";
      $("#sumBOTH").style.opacity = m === "BOTH" ? "1" : ".75";
    }

    const wrap = $("#sumCards");
    wrap.innerHTML = `<div class="card">Loading…</div>`;

    try {
      let rows = [];
      if (m === "BOTH") {
        const [a, b] = await Promise.all([loadExpiryFor("PDD"), loadExpiryFor("SKH")]);
        rows = a.map((x) => ({ ...x, _store: "PDD" })).concat(b.map((x) => ({ ...x, _store: "SKH" })));
      } else {
        rows = await loadExpiryFor(m);
        rows = rows.map((x) => ({ ...x, _store: m }));
      }

      const today = todayISO();
      const tomorrow = addDaysISO(today, 1);

      const todayCount = rows.filter((x) => String(x.expiry_value || "").slice(0, 10) === today).length;
      const tomorrowCount = rows.filter((x) => String(x.expiry_value || "").slice(0, 10) === tomorrow).length;
      const safeCount = rows.filter((x) => {
        const e = String(x.expiry_value || "").slice(0, 10);
        return e && e !== today && e !== tomorrow;
      }).length;

      wrap.innerHTML = `
        <button class="card fadeIn" id="goToday" style="background:linear-gradient(135deg,#C62828,#E53935);color:#fff;border:0;text-align:left">
          <div style="font-size:18px;font-weight:900">Expiring Today</div>
          <div style="font-size:40px;font-weight:1000;line-height:1;margin-top:6px">${todayCount}</div>
          <div class="muted" style="color:rgba(255,255,255,.85);font-weight:800">Tap to view</div>
        </button>

        <button class="card fadeIn" id="goTomorrow" style="background:linear-gradient(135deg,#F57C00,#FB8C00);color:#fff;border:0;text-align:left">
          <div style="font-size:18px;font-weight:900">Expiring Tomorrow</div>
          <div style="font-size:40px;font-weight:1000;line-height:1;margin-top:6px">${tomorrowCount}</div>
          <div class="muted" style="color:rgba(255,255,255,.85);font-weight:800">Tap to view</div>
        </button>

        <button class="card fadeIn" id="goSafe" style="background:linear-gradient(135deg,#2E7D32,#4CAF50);color:#fff;border:0;text-align:left">
          <div style="font-size:18px;font-weight:900">All Safe</div>
          <div style="font-size:40px;font-weight:1000;line-height:1;margin-top:6px">${safeCount}</div>
          <div class="muted" style="color:rgba(255,255,255,.85);font-weight:800">Tap to view</div>
        </button>
      `;

      $("#goToday").addEventListener("click", () => setView({ page: "summaryList", summaryMode: mode, bucket: "TODAY" }, true));
      $("#goTomorrow").addEventListener("click", () => setView({ page: "summaryList", summaryMode: mode, bucket: "TOMORROW" }, true));
      $("#goSafe").addEventListener("click", () => setView({ page: "summaryList", summaryMode: mode, bucket: "SAFE" }, true));
    } catch (e) {
      console.error(e);
      wrap.innerHTML = `<div class="card">Failed to load summary</div>`;
    }
  };

  if (isMgr) {
    $("#sumPDD").addEventListener("click", () => setMode("PDD"));
    $("#sumSKH").addEventListener("click", () => setMode("SKH"));
    $("#sumBOTH").addEventListener("click", () => setMode("BOTH"));
  }

  setMode(mode);
}

async function renderSummaryList() {
  const main = $("#main");
  const mode = state.view.summaryMode || state.session.store;
  const bucket = state.view.bucket || "TODAY";

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">${bucketTitle(bucket)}</div>
      </div>
      <div id="sumList" class="col"></div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const wrap = $("#sumList");
  wrap.innerHTML = `<div class="card">Loading…</div>`;

  try {
    let rows = [];
    if (mode === "BOTH") {
      const [a, b] = await Promise.all([loadExpiryFor("PDD"), loadExpiryFor("SKH")]);
      rows = a.map((x) => ({ ...x, _store: "PDD" })).concat(b.map((x) => ({ ...x, _store: "SKH" })));
    } else {
      rows = await loadExpiryFor(mode);
      rows = rows.map((x) => ({ ...x, _store: mode }));
    }

    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);

    rows = rows.filter((x) => {
      const e = String(x.expiry_value || "").slice(0, 10);
      if (!e) return false;
      if (bucket === "TODAY") return e === today;
      if (bucket === "TOMORROW") return e === tomorrow;
      return e !== today && e !== tomorrow;
    });

    // group by category
    const byCat = new Map();
    for (const r of rows) {
      const c = r.category || "Other";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(r);
    }

    if (!rows.length) {
      wrap.innerHTML = `<div class="card">No items</div>`;
      return;
    }

    let html = "";
    for (const [cat, list] of byCat.entries()) {
      html += `
        <div class="card">
          <div style="font-weight:900;font-size:18px;margin-bottom:10px">${escapeHtml(cat)}</div>
          <div class="col" style="gap:8px">
            ${list
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map((r) => {
                const dateText = formatDMY(String(r.expiry_value).slice(0, 10));
                const qtyText = "—"; // server doesn’t return qty yet (you can add later)
                const storeTag = mode === "BOTH" ? `<span class="muted" style="font-weight:900">(${r._store})</span>` : "";
                return `
                  <div style="display:flex;justify-content:space-between;gap:10px;border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:10px 12px">
                    <div style="font-weight:900">${escapeHtml(r.name)} ${storeTag}</div>
                    <div style="font-weight:900">${qtyText} • ${escapeHtml(dateText)}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }
    wrap.innerHTML = html;
  } catch (e) {
    console.error(e);
    wrap.innerHTML = `<div class="card">Failed to load</div>`;
  }
}

function bucketTitle(b) {
  if (b === "TODAY") return "Expiring Today";
  if (b === "TOMORROW") return "Expiring Tomorrow";
  return "All Safe";
}

/* =========================================================
   MANAGER
   - Dashboard with summary cards + tool tiles (bigger + color)
   - Add Item / Edit Items (compact expand) / Categories
   - Download Log tile (placeholder unless you add server endpoint)
   - Manager can see both stores in Summary (via Summary menu)
   ========================================================= */

function renderManagerHome() {
  const main = $("#main");

  // force manager login if not manager
  if (!state.session.isManager) {
    return openManagerLogin();
  }

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">Manager</div>
      </div>

      <div class="grid3">
        ${miniSummaryCard("Expiring Today", "#E53935", "today")}
        ${miniSummaryCard("Expiring Tomorrow", "#FB8C00", "tomorrow")}
        ${miniSummaryCard("All Safe", "#43A047", "safe")}
      </div>

      <div style="font-size:22px;font-weight:900;margin-top:4px">Tools</div>

      <div class="grid2">
        ${toolTile("➕", "Add Item", "Create a new item", "addItem", "#1E88E5")}
        ${toolTile("📝", "Edit Items", "By category (compact)", "editItems", "#009688")}
        ${toolTile("🗂️", "Categories", "Add / Edit / Delete", "cats", "#7E57C2")}
        ${toolTile("⬇️", "Download Log", "Export logs (soon)", "dl", "#F57C00")}
      </div>
    </div>
  `;

  $("#btnBack").addEventListener("click", goBack);

  $("#tool_addItem").addEventListener("click", () => openAddItemModal());
  $("#tool_editItems").addEventListener("click", () => setView({ page: "managerEditItems" }, true));
  $("#tool_cats").addEventListener("click", () => setView({ page: "managerCategories" }, true));
  $("#tool_dl").addEventListener("click", () => toast("Download Log: add server endpoint later"));

  // summary cards should open summaryHome (manager can choose BOTH there)
  $("#sum_today").addEventListener("click", () => setView({ page: "summaryList", summaryMode: "BOTH", bucket: "TODAY" }, true));
  $("#sum_tomorrow").addEventListener("click", () => setView({ page: "summaryList", summaryMode: "BOTH", bucket: "TOMORROW" }, true));
  $("#sum_safe").addEventListener("click", () => setView({ page: "summaryList", summaryMode: "BOTH", bucket: "SAFE" }, true));
}

function miniSummaryCard(label, color, key) {
  const id = key === "today" ? "sum_today" : key === "tomorrow" ? "sum_tomorrow" : "sum_safe";
  return `
    <button id="${id}" class="card" style="border:0;background:${color};color:#fff;text-align:left">
      <div style="font-weight:900">${label}</div>
      <div style="font-size:30px;font-weight:1000;margin-top:8px">›</div>
    </button>
  `;
}

function toolTile(icon, title, sub, id, color) {
  return `
    <button id="tool_${id}" class="card" style="border:0;background:${color};color:#fff;text-align:left;min-height:120px">
      <div style="font-size:34px">${icon}</div>
      <div style="font-weight:1000;font-size:20px;margin-top:6px">${title}</div>
      <div style="opacity:.9;font-weight:800">${sub}</div>
    </button>
  `;
}

/* ---------- Manager login ---------- */
function openManagerLogin() {
  openModal(
    "Manager Login",
    `
    <div class="card fadeIn">
      <div class="col">
        <div style="font-weight:900">PIN</div>
        <input id="pinInp" class="select" type="password" inputmode="numeric" placeholder="Enter PIN" />
        <div class="divider"></div>
        <button id="pinBtn" class="btn btn-red" style="width:100%;font-size:16px">Login as Manager</button>
        <button id="pinCancel" class="btn btn-yellow" style="width:100%;font-size:16px;margin-top:8px">Cancel</button>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  $("#pinCancel").addEventListener("click", () => { closeModal(); goBack(); });

  $("#pinBtn").addEventListener("click", async () => {
    const pin = String($("#pinInp").value || "").trim();
    if (!pin) return toast("Enter PIN");

    try {
      const r = await apiPost("/api/manager/login", { pin, store: state.session.store });
      state.session.isManager = true;
      state.session.managerToken = r.token || "";
      saveSession();
      closeModal();
      toast("Manager ✅");
      render();
    } catch (e) {
      console.error(e);
      toast("Wrong PIN");
    }
  });
}

/* ---------- Manager edit items (compact expand) ---------- */
async function renderManagerEditItems() {
  const main = $("#main");

  if (!state.session.isManager) return openManagerLogin();

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">Edit Items</div>
      </div>
      <div class="card">
        <div style="font-weight:900">Search (optional)</div>
        <input id="mgrSearch" class="select" placeholder="Type item name..." />
      </div>
      <div id="mgrList" class="col"></div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  const token = state.session.managerToken;
  let items = [];
  try {
    items = await apiGet(`/api/manager/items?store=${encodeURIComponent(state.session.store)}`, token);
  } catch (e) {
    console.error(e);
    toast("Failed loading items");
    items = [];
  }

  const renderList = (q) => {
    q = String(q || "").toLowerCase().trim();
    const filtered = q ? items.filter((x) => String(x.name).toLowerCase().includes(q)) : items;

    // group by category
    const map = new Map();
    for (const it of filtered) {
      const c = it.category || "Other";
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }

    let html = "";
    for (const [cat, list] of map.entries()) {
      html += `
        <div class="card">
          <div style="font-weight:1000;font-size:18px;margin-bottom:10px">${escapeHtml(cat)}</div>
          <div class="col" style="gap:10px">
            ${list
              .sort((a, b) => String(a.name).localeCompare(String(b.name)))
              .map((it) => managerItemRow(it))
              .join("")}
          </div>
        </div>
      `;
    }

    $("#mgrList").innerHTML = html;

    // bind expand + save/delete
    $$(".mgrRow").forEach((row) => {
      const id = row.dataset.id;
      const btn = $(`[data-edit="${cssEsc(id)}"]`, row);
      const panel = $(`[data-panel="${cssEsc(id)}"]`, row);
      const closeBtn = $(`[data-close="${cssEsc(id)}"]`, row);

      btn.addEventListener("click", () => {
        panel.classList.toggle("hidden");
        btn.textContent = panel.classList.contains("hidden") ? "Edit" : "Close";
      });
      closeBtn.addEventListener("click", () => {
        panel.classList.add("hidden");
        btn.textContent = "Edit";
      });

      const saveBtn = $(`[data-save="${cssEsc(id)}"]`, row);
      const delBtn = $(`[data-del="${cssEsc(id)}"]`, row);

      saveBtn.addEventListener("click", async () => {
        const catSel = $(`[data-cat="${cssEsc(id)}"]`, row);
        const subSel = $(`[data-sub="${cssEsc(id)}"]`, row);
        const lifeInp = $(`[data-life="${cssEsc(id)}"]`, row);

        const category = String(catSel.value || "").trim();
        const sub_category = String(subSel.value || "").trim() || null;
        const shelf_life_days = Number(lifeInp.value || 0);

        try {
          await apiPatch(`/api/manager/items/${id}`, { store: state.session.store, category, sub_category, shelf_life_days }, token);
          toast("Saved ✅");
          // refresh store data for staff pages too
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Save failed");
        }
      });

      delBtn.addEventListener("click", async () => {
        if (!confirm("Delete this item?")) return;
        try {
          await apiDel(`/api/manager/items/${id}?store=${encodeURIComponent(state.session.store)}`, token);
          toast("Deleted ✅");
          items = items.filter((x) => String(x.id) !== String(id));
          renderList($("#mgrSearch").value);
          await loadAllForCurrentStore();
        } catch (e) {
          console.error(e);
          toast("Delete failed");
        }
      });
    });
  };

  $("#mgrSearch").addEventListener("input", (e) => renderList(e.target.value));
  renderList("");
}

function managerItemRow(it) {
  const id = String(it.id);
  const cats = state.data.categories.map((c) => c.name);
  const catOpts = cats
    .map((c) => `<option value="${escapeHtml(c)}"${c === it.category ? " selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");

  // Sauce subs only if category Sauce
  const subOpts = [`<option value="">(none)</option>`].concat(
    SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s.name)}"${String(it.sub_category || "").toLowerCase() === s.name.toLowerCase() ? " selected" : ""}>${escapeHtml(s.name)}</option>`)
  ).join("");

  return `
    <div class="mgrRow" data-id="${escapeHtml(id)}" style="border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:12px">
      <div class="row" style="justify-content:space-between">
        <div style="font-weight:1000">${escapeHtml(it.name)}</div>
        <button class="btn btn-ghost" data-edit="${escapeHtml(id)}" type="button" style="font-weight:900">Edit</button>
      </div>

      <div class="muted" style="margin-top:8px;font-weight:800">
        ${escapeHtml(it.category)} • ${escapeHtml(it.shelf_life_days)} day
      </div>

      <div class="hidden" data-panel="${escapeHtml(id)}" style="margin-top:12px">
        <div class="col">
          <div style="font-weight:900">Category</div>
          <select class="select" data-cat="${escapeHtml(id)}">${catOpts}</select>

          <div style="font-weight:900;margin-top:8px">Sauce Sub-category (only if Category = Sauce)</div>
          <select class="select" data-sub="${escapeHtml(id)}">${subOpts}</select>

          <div style="font-weight:900;margin-top:8px">Shelf life (days)</div>
          <input class="select" data-life="${escapeHtml(id)}" type="number" min="0" value="${escapeHtml(it.shelf_life_days)}" />

          <div class="row" style="margin-top:12px">
            <button class="btn btn-yellow" data-save="${escapeHtml(id)}" type="button" style="flex:1">Save</button>
            <button class="btn btn-red" data-del="${escapeHtml(id)}" type="button" style="flex:1">Delete</button>
          </div>

          <button class="btn btn-ghost" data-close="${escapeHtml(id)}" type="button" style="width:100%">Close</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Manager categories (tiles without icon, tap to edit) ---------- */
async function renderManagerCategories() {
  const main = $("#main");
  if (!state.session.isManager) return openManagerLogin();

  let cats = [];
  try {
    cats = await apiGet(`/api/manager/categories?store=${encodeURIComponent(state.session.store)}`, state.session.managerToken);
  } catch (e) {
    console.error(e);
    toast("Failed loading categories");
  }

  // You asked: "under current category just put same tile as home screen but without icon, just name"
  const tiles = cats
    .filter((c) => c.is_active !== false)
    .map((c, idx) => {
      const color = tileColorFor(c.name);
      return `<button class="tileBig" style="${color};min-height:90px;animation-delay:${idx * 40}ms" type="button" data-cid="${c.id}" data-cname="${escapeHtml(c.name)}">
        <div class="name" style="font-size:22px">${escapeHtml(c.name)}</div>
        <div class="sub">Tap to edit</div>
      </button>`;
    })
    .join("");

  main.innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">Categories</div>
      </div>

      <div class="grid2">${tiles}</div>

      <button id="addCat" class="btn btn-blue" style="width:100%;font-size:18px;padding:16px;border-radius:18px">➕ Add Category</button>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);

  $$(".tileBig", main).forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.cid;
      const name = b.dataset.cname;
      openEditCategoryModal(id, name);
    });
  });

  $("#addCat").addEventListener("click", () => openAddCategoryModal());
}

function openAddCategoryModal() {
  openModal(
    "Add Category",
    `
    <div class="card fadeIn">
      <div class="col">
        <div style="font-weight:900">Name</div>
        <input id="catName" class="select" placeholder="Category name" />
        <div style="font-weight:900;margin-top:10px">Sort order</div>
        <input id="catSort" class="select" type="number" value="100" />
        <div class="divider"></div>
        <button id="catSave" class="btn btn-yellow" style="width:100%;font-size:16px">Save</button>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave").addEventListener("click", async () => {
    const name = String($("#catName").value || "").trim();
    const sort_order = Number($("#catSort").value || 100);
    if (!name) return toast("Name required");

    try {
      await apiPost("/api/manager/categories", { store: state.session.store, name, sort_order }, state.session.managerToken);
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });
}

function openEditCategoryModal(id, currentName) {
  openModal(
    "Edit Category",
    `
    <div class="card fadeIn">
      <div class="col">
        <div style="font-weight:900">Name</div>
        <input id="catName" class="select" value="${escapeHtml(currentName)}" />
        <div style="font-weight:900;margin-top:10px">Active</div>
        <select id="catActive" class="select">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        <div class="divider"></div>
        <button id="catSave" class="btn btn-yellow" style="width:100%;font-size:16px">Save</button>
        <button id="catDelete" class="btn btn-red" style="width:100%;font-size:16px;margin-top:10px">Delete</button>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  $("#catSave").addEventListener("click", async () => {
    const name = String($("#catName").value || "").trim();
    const is_active = $("#catActive").value === "true";
    if (!name) return toast("Name required");

    try {
      await apiPatch(`/api/manager/categories/${id}`, { store: state.session.store, name, is_active, sort_order: 100 }, state.session.managerToken);
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });

  $("#catDelete").addEventListener("click", async () => {
    if (!confirm("Delete this category?")) return;
    try {
      await apiDel(`/api/manager/categories/${id}?store=${encodeURIComponent(state.session.store)}`, state.session.managerToken);
      toast("Deleted ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Delete failed");
    }
  });
}

function openAddItemModal() {
  // Minimal add item (name/category/sub/shelf life)
  const cats = state.data.categories.map((c) => c.name);
  const catOpts = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  const subOpts = [`<option value="">(none)</option>`].concat(
    SAUCE_SUBS.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
  ).join("");

  openModal(
    "Add Item",
    `
    <div class="card fadeIn">
      <div class="col">
        <div style="font-weight:900">Item name</div>
        <input id="itName" class="select" placeholder="e.g. Beef Brisket" />

        <div style="font-weight:900;margin-top:10px">Category</div>
        <select id="itCat" class="select">${catOpts}</select>

        <div style="font-weight:900;margin-top:10px">Sauce Sub-category (only if Sauce)</div>
        <select id="itSub" class="select">${subOpts}</select>

        <div style="font-weight:900;margin-top:10px">Shelf life (days)</div>
        <input id="itLife" class="select" type="number" min="0" value="0" />

        <div class="divider"></div>
        <button id="itSave" class="btn btn-yellow" style="width:100%;font-size:16px">Save</button>
      </div>
    </div>
    `,
    { noBackdropClose: true }
  );

  $("#itSave").addEventListener("click", async () => {
    const name = String($("#itName").value || "").trim();
    const category = String($("#itCat").value || "").trim();
    const sub_category = String($("#itSub").value || "").trim() || null;
    const shelf_life_days = Number($("#itLife").value || 0);

    if (!name || !category) return toast("Missing name/category");

    try {
      await apiPost("/api/manager/items", { store: state.session.store, name, category, sub_category, shelf_life_days }, state.session.managerToken);
      toast("Saved ✅");
      closeModal();
      await loadAllForCurrentStore();
      render();
    } catch (e) {
      console.error(e);
      toast("Save failed");
    }
  });
}

/* =========================================================
   WISR (blank page placeholder)
   ========================================================= */
function renderWISR() {
  $("#main").innerHTML = `
    <div class="col fadeIn">
      <div class="topBack">
        <button class="btn btn-yellow" id="btnBack" type="button">← Back</button>
        <div style="font-size:26px;font-weight:900;color:#0B7A38">WISR Count</div>
      </div>
      <div class="card">
        <div style="font-weight:900">Blank for now</div>
        <div class="muted">You’ll give the data later.</div>
      </div>
    </div>
  `;
  $("#btnBack").addEventListener("click", goBack);
}

/* ---------- logout ---------- */
function doLogout() {
  // clear session but keep day key
  state.session.store = "";
  state.session.staff = "";
  state.session.shift = "AM";
  state.session.isManager = false;
  state.session.managerToken = "";
  state.session.sessionDayKey = dayKeyNow();
  saveSession();

  state.data.categories = [];
  state.data.items = [];
  state.data.expiry = [];
  state.drafts = {};
  state.navStack = [];
  state.view = { page: "home", category: null, sauceSub: null };

  openSessionSetup();
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
// for querySelector attribute match
function cssEsc(s) {
  return String(s).replaceAll('"', '\\"');
}
```0
