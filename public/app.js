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

// ---------- Modal (SAFE fallback if modal missing) ----------
function hasModal() {
  return !!(modalBackdrop && modalTitleEl && modalBodyEl);
}

function openModal(title, bodyHtml) {
  if (!hasModal()) {
    // fallback
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

  // Auto logout if unauthorized
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

  if (homeBtn.dataset.bound === "1") return;
  homeBtn.dataset.bound = "1";
  alertsBtn.dataset.bound = "1";
  logoutBtn.dataset.bound = "1";

  homeBtn.addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  alertsBtn.addEventListener("click", () => {
    state.view = { page: "alerts", category: null, sauceSub: null };
    render();
  });

  logoutBtn.addEventListener("click", () => {
    if (getManagerToken && getManagerToken()) {
      if (!confirm("Exit manager mode?")) return;
      setManagerToken("");
      state.view = { page: "home", category: null, sauceSub: null };
      render();
      return;
    }

    if (!confirm("Logout staff session?")) return;
    state.session = { store: "", shift: "", staff: "" };
    state.view = { page: "session", category: null, sauceSub: null };
    render();
  });
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

// ---------- Category helpers ----------
function canonicalCategory(cat) {
  const c = String(cat ?? "").trim();
  const n = norm(c);

  if (n === "back counter chiller") return "Back counter chiller";
  if (n === "front counter") return "Front counter";
  if (n === "back counter") return "Back counter";
  if (n === "prepared items" || n === "prepared item") return "Prepared items";
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

  // SKH-only rule for Beef Taco (H)
  if (norm(category) === "front counter") {
    list = list.filter((it) => {
      const nm = norm(it.name);
      if (nm === norm("Beef Taco (H)") || nm === norm("Beef Taco(H)") || nm === norm("Beef Taco")) {
        return norm(state.session.store) === "skh";
      }
      return true;
    });
  }

  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  return list;
}

// ---------- Manager login ----------
function openManagerLogin() {
  openModal(
    "Manager Login",
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="field">
        <div class="label">PIN</div>
        <input id="mgrPin" class="input" inputmode="numeric" type="password" placeholder="Enter PIN" />
        <div class="helper">Manager only</div>
      </div>
      <button id="mgrLoginBtn" class="btn btn-primary" type="button" style="width:100%">Login</button>
      <div id="mgrErr" class="error hidden"></div>
    </div>
    `
  );

  const loginBtn = $("#mgrLoginBtn");
  if (!loginBtn) return;

  loginBtn.addEventListener("click", async () => {
    const pin = ($("#mgrPin")?.value || "").trim();
    const err = $("#mgrErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    try {
      const out = await apiPost("/api/manager/login", { pin });
      setManagerToken(out.token || "");
      closeModal();
      state.view = { page: "manager", category: null, sauceSub: null };
      updateTopbar();
      updateSessionPill();
      render();
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Login failed";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Login failed");
      }
    }
  });
}

// ---------- Rendering ----------
function render() {
  updateTopbar();
  updateSessionPill();

  const page = state.view.page;

  if (page === "session") return renderSession();
  if (page === "home") return renderHome();
  if (page === "sauce_menu") return renderSauceMenu();
  if (page === "category") return renderCategory();
  if (page === "alerts") return renderAlerts();
  if (page === "manager") return renderManager();

  state.view = { page: "home", category: null, sauceSub: null };
  return renderHome();
}

function renderSession() {
  if (!main) return;

  main.innerHTML = `
    <div class="card">
      <div class="h1">Start Session</div>

      <div class="field">
        <div class="label">Store</div>
        <select id="storeSel" class="input">
          <option value="">Select store</option>
          <option value="PDD">PDD</option>
          <option value="SKH">SKH</option>
        </select>
      </div>

      <div class="field">
        <div class="label">Shift</div>
        <select id="shiftSel" class="input">
          <option value="">Select shift</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div class="field">
        <div class="label">Staff</div>
        <input id="staffInp" class="input" placeholder="Name / ID" />
      </div>

      <button id="startBtn" class="btn btn-primary" type="button" style="width:100%">Start</button>

      <div style="height:10px"></div>
      <button id="mgrBtn" class="btn btn-ghost" type="button" style="width:100%">Manager Login</button>

      <div id="sessErr" class="error hidden"></div>
    </div>
  `;

  $("#storeSel").value = state.session.store || "";
  $("#shiftSel").value = state.session.shift || "";
  $("#staffInp").value = state.session.staff || "";

  $("#startBtn").addEventListener("click", async () => {
    const store = ($("#storeSel").value || "").trim();
    const shift = ($("#shiftSel").value || "").trim();
    const staff = ($("#staffInp").value || "").trim();

    const err = $("#sessErr");
    err.classList.add("hidden");
    err.textContent = "";

    if (!store || !shift || !staff) {
      err.textContent = "Please select store, shift, and staff.";
      err.classList.remove("hidden");
      return;
    }

    state.session.store = store;
    state.session.shift = shift;
    state.session.staff = staff;
    saveSession();

    await loadItems();
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  $("#mgrBtn").addEventListener("click", openManagerLogin);
}

function renderHome() {
  if (!main) return;

  const counts = {};
  for (const cat of CATEGORIES) {
    if (cat === "Sauce") {
      counts[cat] = state.items.filter((x) => norm(canonicalCategory(x.category)) === "sauce").length;
    } else {
      counts[cat] = state.items.filter((x) => norm(canonicalCategory(x.category)) === norm(cat)).length;
    }
  }

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

      <div style="height:12px"></div>
      <button id="mgrQuick" class="btn btn-ghost" type="button" style="width:100%">
        ${isManagerMode() ? "Open Manager" : "Manager Login"}
      </button>
    </section>
  `;

  $("#mgrQuick").addEventListener("click", () => {
    if (isManagerMode()) {
      state.view = { page: "manager", category: null, sauceSub: null };
      render();
    } else {
      openManagerLogin();
    }
  });

  main.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-cat");
      if (cat === "Sauce") state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
      else state.view = { page: "category", category: cat, sauceSub: null };
      render();
    });
  });
}

function renderSauceMenu() {
  if (!main) return;

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
          <div class="tile-sub">Tap to view</div>
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

function renderCategory() {
  if (!main) return;

  const cat = state.view.category;
  const sauceSub = state.view.sauceSub;
  const title = cat === "Sauce" ? `Sauce • ${sauceSub}` : cat;

  const list = getItemsForCategory(cat, sauceSub);

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
            <div class="list-row-sub">Tap to log</div>
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
    if (cat === "Sauce") state.view = { page: "sauce_menu", category: "Sauce", sauceSub: null };
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

function renderAlerts() {
  if (!main) return;

  const rows = Array.isArray(state.alerts) ? state.alerts : [];

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Alerts</div>
    </div>

    <div class="card">
      <div class="card-title">Expiry Alerts</div>
      ${
        rows.length
          ? rows
              .map(
                (r) => `
        <div class="alert-row">
          <div>
            <div class="alert-name">${escapeHtml(r.name)}</div>
            <div class="alert-extra">${escapeHtml(r.category)}${r.sub_category ? ` • ${escapeHtml(r.sub_category)}` : ""}</div>
          </div>
          <div class="alert-extra">${escapeHtml(r.expiry_value || "")}</div>
        </div>`
              )
              .join("")
          : `<div class="muted">No alerts yet.</div>`
      }
    </div>
  `;

  $("#backBtn").addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });
}

// ---------- Log modal (simple date-only) ----------
function openLogModal(item) {
  openModal(
    item.name,
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="field">
        <div class="label">Quantity (optional)</div>
        <input id="qtyInp" class="input" inputmode="numeric" placeholder="Leave blank if not needed" />
        <div class="helper">Blank allowed, 0 allowed</div>
      </div>

      <div class="field">
        <div class="label">Expiry</div>
        <input id="expInp" class="input" type="date" />
        <div class="helper">Select expiry date</div>
      </div>

      <button id="saveLogBtn" class="btn btn-primary" type="button" style="width:100%">Save</button>
      <div id="logErr" class="error hidden"></div>
    </div>
    `
  );

  const saveBtn = $("#saveLogBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const qtyRaw = ($("#qtyInp")?.value || "").trim();
    const exp = ($("#expInp")?.value || "").trim();

    const err = $("#logErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    if (!exp) {
      if (err) {
        err.textContent = "Expiry required.";
        err.classList.remove("hidden");
      } else {
        alert("Expiry required.");
      }
      return;
    }

    const payload = {
      item_id: item.id,
      item_name: item.name,
      category: canonicalCategory(item.category),
      sub_category: item.sub_category ?? null,
      store: state.session.store,
      staff: state.session.staff,
      shift: state.session.shift,
      quantity: qtyRaw === "" ? null : Number(qtyRaw),
      expiry: exp,
      created_at: new Date().toISOString(),
    };

    try {
      await apiPost("/api/log", payload);
      closeModal();
      loadAlertsSafe();
      alert("Saved ✅");
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Save failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Save failed.");
      }
    }
  });
}

// ---------- Manager page ----------
async function renderManager() {
  if (!main) return;

  if (!isManagerMode()) {
    openManagerLogin();
    state.view = { page: "home", category: null, sauceSub: null };
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <button id="backBtn" class="btn btn-ghost" type="button">← Back</button>
      <div class="page-title">Manager</div>
    </div>

    <div class="card">
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <button id="tabItems" class="btn btn-primary" type="button">Items</button>
        <button id="tabCats" class="btn btn-ghost" type="button">Categories</button>
        <button id="btnAddItem" class="btn btn-ghost" type="button" style="margin-left:auto">+ Add Item</button>
      </div>
      <div style="height:12px"></div>
      <div id="mgrBody" class="muted">Loading…</div>
    </div>
  `;

  $("#backBtn").addEventListener("click", () => {
    state.view = { page: "home", category: null, sauceSub: null };
    render();
  });

  let tab = "items";

  const setTab = async (t) => {
    tab = t;
    $("#tabItems").classList.toggle("btn-primary", tab === "items");
    $("#tabItems").classList.toggle("btn-ghost", tab !== "items");
    $("#tabCats").classList.toggle("btn-primary", tab === "cats");
    $("#tabCats").classList.toggle("btn-ghost", tab !== "cats");
    await renderManagerBody(tab);
  };

  $("#tabItems").addEventListener("click", () => setTab("items"));
  $("#tabCats").addEventListener("click", () => setTab("cats"));
  $("#btnAddItem").addEventListener("click", () => openManagerAddItem());

  await setTab("items");
}

async function renderManagerBody(tab) {
  const host = $("#mgrBody");
  if (!host) return;
  host.innerHTML = "Loading…";

  if (tab === "items") {
    const data = await apiManager("GET", "/api/manager/items");
    host.innerHTML = `
      <div class="field" style="margin-top:0">
        <div class="label">Search</div>
        <input id="mgrSearch" class="input" placeholder="Search item name…" />
      </div>

      <div id="mgrList" class="list"></div>
      <div class="helper">To create a new category: add an item and type a new category name.</div>
    `;

    const all = Array.isArray(data) ? data : [];
    const renderList = (q) => {
      const qq = norm(q);
      const filtered = qq ? all.filter((x) => norm(x.name).includes(qq)) : all;

      $("#mgrList").innerHTML = filtered.length
        ? filtered
            .map(
              (it) => `
        <div class="list-row" style="cursor:default">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(it.name)}</div>
            <div class="list-row-sub">${escapeHtml(canonicalCategory(it.category))}${it.sub_category ? ` • ${escapeHtml(it.sub_category)}` : ""} • shelf ${escapeHtml(it.shelf_life_days ?? "")}</div>
          </div>
          <div style="display:flex; gap:8px">
            <button class="icon-btn" data-edit="${it.id}" type="button" title="Edit">✏️</button>
            <button class="icon-btn" data-del="${it.id}" type="button" title="Delete">🗑️</button>
          </div>
        </div>`
            )
            .join("")
        : `<div class="empty">No items.</div>`;

      host.querySelectorAll("[data-edit]").forEach((b) => {
        b.addEventListener("click", () => {
          const id = Number(b.getAttribute("data-edit"));
          const item = all.find((x) => Number(x.id) === id);
          if (!item) return;
          openManagerEditItem(item);
        });
      });

      host.querySelectorAll("[data-del]").forEach((b) => {
        b.addEventListener("click", () => {
          const id = Number(b.getAttribute("data-del"));
          const item = all.find((x) => Number(x.id) === id);
          if (!item) return;
          openManagerDeleteItem(item);
        });
      });
    };

    renderList("");
    $("#mgrSearch").addEventListener("input", (e) => renderList(e.target.value));
    return;
  }

  if (tab === "cats") {
    const data = await apiManager("GET", "/api/manager/categories");
    const rows = Array.isArray(data) ? data : [];

    host.innerHTML = `
      <div class="muted" style="margin-bottom:10px">
        Categories are text stored on items. Add category by adding an item with a new category name.
      </div>

      <div class="list">
        ${
          rows.length
            ? rows
                .map(
                  (r) => `
          <div class="list-row" style="cursor:default">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(r.category)}</div>
              <div class="list-row-sub">${escapeHtml(r.count)} item(s)</div>
            </div>
            <div style="display:flex; gap:8px">
              <button class="icon-btn" data-rename="${escapeHtml(r.category)}" type="button" title="Rename">✏️</button>
              <button class="icon-btn" data-delcat="${escapeHtml(r.category)}" type="button" title="Delete Category">🗑️</button>
            </div>
          </div>`
                )
                .join("")
            : `<div class="empty">No categories found.</div>`
        }
      </div>
    `;

    host.querySelectorAll("[data-rename]").forEach((b) => {
      b.addEventListener("click", () => {
        const from = b.getAttribute("data-rename");
        openManagerRenameCategory(from);
      });
    });

    host.querySelectorAll("[data-delcat]").forEach((b) => {
      b.addEventListener("click", () => {
        const name = b.getAttribute("data-delcat");
        openManagerDeleteCategory(name);
      });
    });

    return;
  }
}

function openManagerAddItem() {
  openModal(
    "Add Item",
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="field">
        <div class="label">Item name</div>
        <input id="mName" class="input" placeholder="e.g. Lettuce Packet" />
      </div>
      <div class="field">
        <div class="label">Category</div>
        <input id="mCat" class="input" placeholder="Type category (can create new)" />
      </div>
      <div class="field">
        <div class="label">Sub-category (optional)</div>
        <input id="mSub" class="input" placeholder="e.g. Open Inner (Sauce only)" />
      </div>
      <div class="field">
        <div class="label">Shelf life days</div>
        <input id="mSL" class="input" inputmode="numeric" placeholder="0" />
      </div>

      <button id="mSave" class="btn btn-primary" type="button" style="width:100%">Create</button>
      <div id="mErr" class="error hidden"></div>
    </div>
    `
  );

  const saveBtn = $("#mSave");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const name = ($("#mName")?.value || "").trim();
    const category = ($("#mCat")?.value || "").trim();
    const sub_category = ($("#mSub")?.value || "").trim() || null;
    const shelf_life_days = Number((($("#mSL")?.value || "0").trim() || 0));

    const err = $("#mErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    if (!name || !category) {
      if (err) {
        err.textContent = "Name and Category are required.";
        err.classList.remove("hidden");
      } else {
        alert("Name and Category are required.");
      }
      return;
    }

    try {
      await apiManager("POST", "/api/manager/items", { name, category, sub_category, shelf_life_days });
      closeModal();
      await loadItems();
      state.view = { page: "manager", category: null, sauceSub: null };
      render();
      alert("Item created ✅");
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Create failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Create failed.");
      }
    }
  });
}

function openManagerEditItem(item) {
  openModal(
    "Edit Item",
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="field">
        <div class="label">Item name</div>
        <input id="mName" class="input" value="${escapeHtml(item.name)}" />
      </div>
      <div class="field">
        <div class="label">Category</div>
        <input id="mCat" class="input" value="${escapeHtml(item.category)}" />
      </div>
      <div class="field">
        <div class="label">Sub-category (optional)</div>
        <input id="mSub" class="input" value="${escapeHtml(item.sub_category || "")}" />
      </div>
      <div class="field">
        <div class="label">Shelf life days</div>
        <input id="mSL" class="input" inputmode="numeric" value="${escapeHtml(item.shelf_life_days ?? 0)}" />
      </div>

      <button id="mSave" class="btn btn-primary" type="button" style="width:100%">Save</button>
      <div id="mErr" class="error hidden"></div>
    </div>
    `
  );

  const saveBtn = $("#mSave");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const name = ($("#mName")?.value || "").trim();
    const category = ($("#mCat")?.value || "").trim();
    const sub_category = ($("#mSub")?.value || "").trim() || null;
    const shelf_life_days = Number((($("#mSL")?.value || "0").trim() || 0));

    const err = $("#mErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    if (!name || !category) {
      if (err) {
        err.textContent = "Name and Category are required.";
        err.classList.remove("hidden");
      } else {
        alert("Name and Category are required.");
      }
      return;
    }

    try {
      await apiManager("PATCH", `/api/manager/items/${item.id}`, { name, category, sub_category, shelf_life_days });
      closeModal();
      await loadItems();
      state.view = { page: "manager", category: null, sauceSub: null };
      render();
      alert("Saved ✅");
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Save failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Save failed.");
      }
    }
  });
}

function openManagerDeleteItem(item) {
  openModal(
    "Delete Item",
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="card-title">Are you sure?</div>
      <div class="muted">${escapeHtml(item.name)}<br/>${escapeHtml(item.category)}${item.sub_category ? ` • ${escapeHtml(item.sub_category)}` : ""}</div>
      <div style="height:12px"></div>
      <button id="delYes" class="btn btn-primary" type="button" style="width:100%">Delete</button>
      <div style="height:10px"></div>
      <button id="delNo" class="btn btn-ghost" type="button" style="width:100%">Cancel</button>
      <div id="delErr" class="error hidden"></div>
    </div>
    `
  );

  const noBtn = $("#delNo");
  const yesBtn = $("#delYes");
  if (noBtn) noBtn.addEventListener("click", closeModal);
  if (!yesBtn) return;

  yesBtn.addEventListener("click", async () => {
    const err = $("#delErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    try {
      await apiManager("DELETE", `/api/manager/items/${item.id}`);
      closeModal();
      await loadItems();
      state.view = { page: "manager", category: null, sauceSub: null };
      render();
      alert("Deleted ✅");
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Delete failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Delete failed.");
      }
    }
  });
}

function openManagerRenameCategory(from) {
  openModal(
    "Rename Category",
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="field">
        <div class="label">From</div>
        <input class="input" value="${escapeHtml(from)}" disabled />
      </div>
      <div class="field">
        <div class="label">To</div>
        <input id="toCat" class="input" placeholder="New category name" />
      </div>
      <button id="doRename" class="btn btn-primary" type="button" style="width:100%">Rename</button>
      <div id="renErr" class="error hidden"></div>
    </div>
    `
  );

  const renameBtn = $("#doRename");
  if (!renameBtn) return;

  renameBtn.addEventListener("click", async () => {
    const to = ($("#toCat")?.value || "").trim();
    const err = $("#renErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    if (!to) {
      if (err) {
        err.textContent = "New category name required.";
        err.classList.remove("hidden");
      } else {
        alert("New category name required.");
      }
      return;
    }

    if (!confirm(`Rename category "${from}" → "${to}" ?`)) return;

    try {
      const out = await apiManager("POST", "/api/manager/categories/rename", { from, to });
      closeModal();
      await loadItems();
      state.view = { page: "manager", category: null, sauceSub: null };
      render();
      alert(`Renamed ✅ (${out.updated} items updated)`);
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Rename failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Rename failed.");
      }
    }
  });
}

function openManagerDeleteCategory(name) {
  openModal(
    "Delete Category",
    `
    <div class="card" style="margin:0;border:none;box-shadow:none">
      <div class="card-title" style="color:#E53935">Danger</div>
      <div class="muted">
        This will delete <b>ALL items</b> in category:<br/>
        <b>${escapeHtml(name)}</b>
      </div>

      <div class="field">
        <div class="label">Type the category name to confirm</div>
        <input id="catConfirm" class="input" placeholder="${escapeHtml(name)}" />
      </div>

      <button id="doDelCat" class="btn btn-primary" type="button" style="width:100%">Delete Category</button>
      <div style="height:10px"></div>
      <button id="cancelDelCat" class="btn btn-ghost" type="button" style="width:100%">Cancel</button>

      <div id="catErr" class="error hidden"></div>
    </div>
    `
  );

  const cancelBtn = $("#cancelDelCat");
  const delBtn = $("#doDelCat");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  if (!delBtn) return;

  delBtn.addEventListener("click", async () => {
    const typed = ($("#catConfirm")?.value || "").trim();
    const err = $("#catErr");
    if (err) {
      err.classList.add("hidden");
      err.textContent = "";
    }

    if (typed !== name) {
      if (err) {
        err.textContent = "Category name does not match.";
        err.classList.remove("hidden");
      } else {
        alert("Category name does not match.");
      }
      return;
    }

    if (!confirm(`FINAL CONFIRM: Delete category "${name}" and all its items?`)) return;

    try {
      const out = await apiManager("DELETE", `/api/manager/categories?name=${encodeURIComponent(name)}`);
      closeModal();
      await loadItems();
      state.view = { page: "manager", category: null, sauceSub: null };
      render();
      alert(`Deleted category ✅ (${out.deleted} items removed)`);
    } catch (e) {
      if (err) {
        err.textContent = e?.message || "Delete failed.";
        err.classList.remove("hidden");
      } else {
        alert(e?.message || "Delete failed.");
      }
    }
  });
}

// ---------- Boot ----------
async function boot() {
  loadSession();

  try {
    await loadItems();
  } catch {}

  if (state.session.store && state.session.shift && state.session.staff) {
    state.view = { page: "home", category: null, sauceSub: null };
  } else {
    state.view = { page: "session", category: null, sauceSub: null };
  }

  updateTopbar();
  updateSessionPill();
  render();
}

boot();
