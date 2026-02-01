/* =========================================================
   PreCheck — public/app.js (FULL & COMPLETE)
   - Dark Mode: RESTORED ✅
   - Role Colors: FIXED (Inline styles restored for safety) ✅
   - Summary Page: RESTORED (Original logic) ✅
   - Search/Splash/Sandwich/Popup: INCLUDED ✅
   ========================================================= */

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Constants ---------- */
const POPUP_ITEMS = [
  "Mix green", "Mac&cheese", "Lettuce", "Chicken Bacon (c)",
  "Liquid Egg", "Flatbread(Thawing)", "Avocado", "BakedWaffle"
];
const FORCE_MANUAL_DATE_CATS = new Set(["Unopened chiller", "Fountain Drinks"]);
const STOCK_ALERT_EXCLUDE_CATS = new Set(["Sauce", "Front counter"]);
const CAT_EMOJI = {
  "Prepared items": "🥪", "Unopened chiller": "🧊", "Thawing": "💧",
  "Vegetables": "🥕", "Backroom": "📦", "Front counter": "🥪",
  "Back counter chiller": "❄️", "Fountain Drinks": "🥤", "Sauce": "🧴"
};
const SAUCE_SUBS = [
  { name: "Standby", emoji: "🧃", tone: "teal" },
  { name: "Open Inner", emoji: "🧴", tone: "purple" },
  { name: "Sandwich Unit", emoji: "🌶️", tone: "orange" }
];

/* ---------- State ---------- */
const state = {
  view: { page: "home", category: null, sauceSub: null, summaryMode: null, bucket: null },
  navStack: [],
  session: loadJSON("session", { store: "", staff: "", shift: "AM", isManager: false, managerToken: "", sessionDayKey: "" }),
  data: { categories: [], items: [] },
  drafts: {},
  stock: { hasDot: false, rows: [] },
  __draftsHydrated: false,
};

/* ---------- Boot ---------- */
bindTopbar();
bindDrawer();
bindModal();
bindAppBackGuard();
startMidnightWatcher();
boot().catch(console.error);

async function boot() {
  // 1. Restore Theme
  const savedTheme = localStorage.getItem("theme") || "light";
  applyTheme(savedTheme);

  ensureSessionDayKey();
  updateDrawerAlertLabel(false);
  await wakeServer().catch(() => {});

  if (!state.session.store || !state.session.staff) {
    state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };
    render();
    setTimeout(hideSplashScreen, 300);
    return;
  }

  showSaving("Loading…");
  try {
    await loadAllForCurrentStore();
    await refreshStockDot().catch(() => {});
  } finally {
    hideSaving();
  }

  maybeShowExpiryPopup(false);
  render();
  setTimeout(hideSplashScreen, 800);
}

/* ---------- Theme Logic ---------- */
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
    document.documentElement.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
    document.documentElement.classList.remove("dark");
  }
}
function toggleTheme() {
  const isDark = document.body.classList.contains("dark");
  const newTheme = isDark ? "light" : "dark";
  applyTheme(newTheme);
  localStorage.setItem("theme", newTheme);
  
  const switchEl = document.querySelector("#drawerTheme .theme-switch");
  if (switchEl) {
    if (newTheme === "dark") switchEl.classList.add("on");
    else switchEl.classList.remove("on");
  }
}

/* ---------- Storage & Date Helpers ---------- */
function loadJSON(key, f) { try { const r = localStorage.getItem(key); return r ? { ...f, ...JSON.parse(r) } : f; } catch { return f; } }
function saveSession() { localStorage.setItem("session", JSON.stringify(state.session)); }
function pad2(n) { return String(n).padStart(2, "0"); }
function dayKeyNow() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function ensureSessionDayKey() { const k = dayKeyNow(); if (!state.session.sessionDayKey) { state.session.sessionDayKey = k; saveSession(); } }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDaysISO(b, n) { const d = new Date(b+"T00:00:00"); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function formatLongDMY(iso) { const d = new Date(String(iso).slice(0,10)+"T00:00:00"); return `${d.getDate()} ${d.toLocaleString("en-GB",{month:"long"})} ${d.getFullYear()}`; }
function isChickenBaconC(n) { const t = String(n||"").toLowerCase().replace(/\s+/g," ").trim(); return t==="chicken bacon (c)"||t==="chicken bacon(c)"||t==="chicken bacon c"; }
function formatTime12(hm) { const [hS,mS]=String(hm).split(":"); let h=Number(hS), m=Number(mS), ap=h>=12?"PM":"AM"; h=h%12||12; return `${h}:${pad2(m)} ${ap}`; }
function isoFromTodayAndTime(hm) { return `${todayISO()}T${String(hm)}:00`; }
function datePartFromRow(r) { return String(r?.expiry_at || r?.expiry_value || r?.expiry || "").slice(0,10); }
function timePartFromRow(r) { if(!r?.expiry_at)return""; const d=new Date(r.expiry_at); return formatTime12(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`); }

const HOURLY_SHORT = [{v:"07:00",l:"7 AM"},{v:"11:00",l:"11 AM"},{v:"15:00",l:"3 PM"},{v:"19:00",l:"7 PM"},{v:"23:00",l:"11 PM"}];

/* ---------- API ---------- */
async function apiGet(p,t) { const r=await fetch(p,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{})}}); if(!r.ok)throw new Error(await r.text()); return (await r.text())?JSON.parse(await r.text()||"{}"):{}; }
async function apiPost(p,b,t) { const r=await fetch(p,{method:"POST",headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{})},body:JSON.stringify(b)}); if(!r.ok)throw new Error(await r.text()); return (await r.text())?JSON.parse(await r.text()||"{}"):{}; }
async function apiPatch(p,b,t) { const r=await fetch(p,{method:"PATCH",headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{})},body:JSON.stringify(b)}); if(!r.ok)throw new Error(await r.text()); return (await r.text())?JSON.parse(await r.text()||"{}"):{}; }
async function apiDel(p,t) { const r=await fetch(p,{method:"DELETE",headers:{...(t?{Authorization:`Bearer ${t}`}:{})}}); if(!r.ok)throw new Error(await r.text()); return (await r.text())?JSON.parse(await r.text()||"{}"):{}; }
async function wakeServer() { try{ await fetch("/api/health"); }catch{} }

/* ---------- Load Data ---------- */
async function loadAllForCurrentStore() {
  const s = state.session.store;
  const [c, i] = await Promise.all([
    fetch(`/api/categories?store=${encodeURIComponent(s)}`).then(r=>r.json()),
    fetch(`/api/items?store=${encodeURIComponent(s)}`).then(r=>r.json())
  ]);
  state.data.categories = c;
  state.data.items = (i||[]).map(x => ({ ...x, sub_category: x.sub_category ? normalizeSub(x.sub_category) : null, is_hourly: !!x.is_hourly, stock_alert_enabled: !!x.stock_alert_enabled, stock_min: x.stock_min!=null?Number(x.stock_min):null }));
}
function normalizeSub(s) { const t=String(s||"").trim().toLowerCase(); return t==="open inner"||t==="openinner"?"Open Inner":t==="standby"?"Standby":t==="sandwich unit"||t==="sandwichunit"?"Sandwich Unit":String(s||"").trim(); }

/* ---------- Topbar ---------- */
function bindTopbar() { renderRolePill(); }
function renderRolePill() {
  const host = $("#roleHost"); if (!host) return;
  host.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  
  // RESTORED: Explicit colors to fix "Black Text" or "Invisible Text" issues
  btn.className = `role-btn ${state.session.isManager ? "manager" : "staff"}`;
  
  if (state.session.isManager) {
    btn.style.background = "#D32F2F"; // Red Background
    btn.style.color = "#ffffff";      // White Text
  } else {
    btn.style.background = "#ffffff"; // White Background
    btn.style.color = "#111111";      // Black Text
  }
  
  btn.innerHTML = `<span class="role-ico">${state.session.isManager?"👑":"👤"}</span><span style="font-weight:1200">${state.session.isManager?"Manager":"Staff"}</span>`;
  btn.addEventListener("click", () => toast(state.session.isManager?"Manager Mode":"Staff Mode"));
  host.appendChild(btn);
}
function updateSessionLine() {
  const el = $("#sessionLine"); if (!el) return;
  const show = !!(state.session.store && state.session.staff);
  el.classList.toggle("hidden", !show);
  el.textContent = show ? `${state.session.store} • ${state.session.shift} • ${state.session.staff}` : "";
}

/* ---------- Drawer ---------- */
function bindDrawer() {
  const btn = $("#btnMenu"), back = $("#drawerBackdrop"), close = $("#btnDrawerClose");
  if (btn) btn.addEventListener("click", (e) => { e.preventDefault(); $("#drawerBackdrop").classList.remove("hidden"); });
  if (back) back.addEventListener("click", (e) => { if(e.target===back) back.classList.add("hidden"); });
  if (close) close.addEventListener("click", (e) => { e.preventDefault(); back.classList.add("hidden"); });

  const bind = (id, fn) => { const b=$(id); if(b) b.addEventListener("click", () => { back.classList.add("hidden"); fn(); }); };
  bind("#drawerHome", goHome);
  bind("#drawerAlerts", () => setView({ page: "stockAlerts" }, true));
  bind("#drawerManager", () => setView({ page: "manager" }, true));
  bind("#drawerSummary", () => setView({ page: "summaryHome" }, true));
  bind("#drawerWISR", () => setView({ page: "wisr" }, true));
  bind("#drawerLogout", doLogout);

  // Theme Toggle Logic
  const themeRow = $("#drawerTheme");
  if (themeRow) {
    themeRow.style.display = "flex"; 
    themeRow.addEventListener("click", (e) => { e.preventDefault(); toggleTheme(); });
    // Init state
    if (document.body.classList.contains("dark")) $(".theme-switch", themeRow)?.classList.add("on");
  }
}
function updateDrawerAlertLabel(hasDot) { const b=$("#drawerAlerts"); if(b) b.innerHTML = hasDot ? `📦 Stock Alert <span class="tiny-dot"></span>` : `📦 Stock Alert`; }

/* ---------- Modal & Toast ---------- */
let toastTimer = null;
function toast(m) { const t=$("#toast"); if(t){ t.textContent=m; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add("hidden"),2000); } }
function bindModal() {
  $("#modalClose")?.addEventListener("click", closeModal);
  $("#modalBackdrop")?.addEventListener("click", (e) => { if(e.target===$("#modalBackdrop") && $("#modalBackdrop").dataset.noClose!=="1") closeModal(); });
}
function openModal(title, html, opts={}) {
  const t=$("#modalTitle"), b=$("#modalBody"), back=$("#modalBackdrop"), head=$(".modal-head", back);
  if(!t||!b||!back) return;
  
  if (title === "") { if(head) head.style.display="none"; } 
  else { if(head) head.style.display="flex"; t.textContent=title; }
  
  b.innerHTML = html||"";
  back.classList.remove("hidden");
  back.dataset.noClose = opts.noBackdropClose ? "1" : "0";
}
function closeModal() { $("#modalBackdrop")?.classList.add("hidden"); $("#modalBody").innerHTML=""; }

/* ---------- Sandwich Loader ---------- */
function ensureSavingOverlay() {
  let el = document.getElementById("pcSavingOverlay"); if(el) return el;
  el = document.createElement("div"); el.id = "pcSavingOverlay"; el.className = "hidden";
  el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;";
  el.innerHTML = `<div style="background:#fff;border-radius:24px;padding:24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)"><div class="sandwich-loader"><div class="sb-layer sb-bun-bot"></div><div class="sb-layer sb-meat"></div><div class="sb-layer sb-cheese"></div><div class="sb-layer sb-lettuce"></div><div class="sb-layer sb-tomato"></div><div class="sb-layer sb-bun-top"></div></div><div id="pcSavingMsg" style="font-weight:1200;font-size:18px;color:#111">Saving...</div></div>`;
  document.body.appendChild(el); return el;
}
function showSaving(m) { const el=ensureSavingOverlay(); $("#pcSavingMsg").textContent=m; el.classList.remove("hidden"); }
function hideSaving() { $("#pcSavingOverlay")?.classList.add("hidden"); }

/* ---------- Shift Logic ---------- */
function shiftDoneLastKey(st, dk, sh) { return `pc_done_last_${st}_${dk}_${sh}`; }
function recordShiftDoneAndLast({ store, shift, staff, lastItemName }) {
  try { localStorage.setItem(shiftDoneLastKey(store, dayKeyNow(), shift), JSON.stringify({ done: true, store, shift, staff, lastItemName, at: new Date().toISOString() })); } catch {}
}
function readShiftDoneAndLast(st, sh) { try { return JSON.parse(localStorage.getItem(shiftDoneLastKey(st, dayKeyNow(), sh))); } catch { return null; } }

/* ---------- Popup & Reset ---------- */
function startMidnightWatcher() {
  setInterval(() => {
    const now = dayKeyNow();
    if (state.session.sessionDayKey && state.session.sessionDayKey !== now) {
      state.session.sessionDayKey = now; saveSession(); maybeShowExpiryPopup(true); render();
    }
  }, 30000);
}
function maybeShowExpiryPopup(force) {
  const k = dayKeyNow(), seenKey = `expiry_popup_seen_${k}`;
  if (!force && localStorage.getItem(seenKey) === "1") return;
  localStorage.setItem(seenKey, "1");
  const listHtml = POPUP_ITEMS.map(x => `<div class="popup-tag">${escapeHtml(x)}</div>`).join("");
  openModal("", `<div class="popup-content-center"><div class="popup-icon-large">⚠️</div><div class="popup-title-text">Double Check Required</div><div class="popup-sub-text">Please verify these items:</div><div class="popup-tags-grid">${listHtml}</div><button id="popupOk" class="btn btn-yellow btn-action">I've Checked Them</button></div>`, { noBackdropClose: true });
  $("#popupOk").addEventListener("click", closeModal);
}

/* ---------- Login Page ---------- */
function renderLoginPage() {
  const main = $("#main");
  const s = state.session;
  let pick = s.store || "PDD";
  
  main.innerHTML = `
    <div class="card" style="max-width:560px;margin:14px auto">
      <div style="font-weight:1200;font-size:20px;margin-bottom:10px">Start Session</div>
      <div style="font-weight:1200">Select Store</div>
      <div class="row" style="gap:12px;margin-top:10px">
        <button id="pickPDD" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">PDD</button>
        <button id="pickSKH" class="btn" style="flex:1;background:#fff;color:#111;border:1px solid var(--line)">SKH</button>
      </div>
      <div style="margin-top:14px;font-weight:1200">Shift</div>
      <select id="shiftSel" class="select"><option value="AM">AM</option><option value="PM">PM</option></select>
      <div style="margin-top:14px;font-weight:1200">Staff Name</div>
      <input id="staffInp" class="input" placeholder="e.g. Suri" value="${escapeHtml(s.staff || "")}">
      <button id="startBtn" class="btn btn-yellow" style="width:100%;margin-top:14px;padding:16px;font-size:18px;font-weight:1200">Start</button>
    </div>
  `;
  
  const updateBtns = () => {
    const p = $("#pickPDD"), s = $("#pickSKH");
    p.style.background = pick === "PDD" ? "var(--pdd)" : "#fff"; p.style.color = pick === "PDD" ? "#fff" : "#111";
    s.style.background = pick === "SKH" ? "var(--skh)" : "#fff"; s.style.color = pick === "SKH" ? "#fff" : "#111";
  };
  updateBtns();
  $("#pickPDD").onclick = () => { pick = "PDD"; updateBtns(); };
  $("#pickSKH").onclick = () => { pick = "SKH"; updateBtns(); };
  
  $("#startBtn").onclick = async () => {
    const staff = $("#staffInp").value.trim();
    if (!staff) return toast("Enter name");
    state.session = { store: pick, shift: $("#shiftSel").value, staff, isManager: false, managerToken: "", sessionDayKey: dayKeyNow() };
    saveSession();
    showSaving("Loading...");
    try { await loadAllForCurrentStore(); await refreshStockDot().catch(()=>{}); renderRolePill(); updateSessionLine(); state.navStack=[]; state.view={page:"home"}; render(); setTimeout(()=>maybeShowExpiryPopup(true),150); }
    catch { toast("Load failed"); } finally { hideSaving(); }
  };
}

/* ---------- Navigation ---------- */
function setView(n, push) { if (push) { state.navStack.push({ ...state.view }); safePushHistory(); } state.view = { ...state.view, ...n }; render(); }
function goBack() { const p = state.navStack.pop(); state.view = p ? p : { page: "home" }; render(); }
function goHome() { state.navStack = []; state.view = { page: "home" }; render(); }
let backGuardArmed = false;
function bindAppBackGuard() {
  try { history.replaceState({ pc: 1 }, ""); history.pushState({ pc: 1 }, ""); backGuardArmed = true; } catch {}
  window.onpopstate = () => {
    if (!backGuardArmed) return;
    if (!$("#modalBackdrop").classList.contains("hidden")) { closeModal(); safePushHistory(); return; }
    if (!state.session.store) { safePushHistory(); return; }
    if (state.navStack.length) { goBack(); safePushHistory(); return; }
    openModal("Exit?", `<div class="card"><div style="margin-bottom:10px">Exit app?</div><div class="row"><button id="eno" class="btn btn-yellow" style="flex:1">No</button><button id="eyes" class="btn btn-red" style="flex:1">Yes</button></div></div>`, {noBackdropClose:true});
    $("#eno").onclick = closeModal; $("#eyes").onclick = () => { closeModal(); backGuardArmed=false; history.back(); };
    safePushHistory();
  };
}
function safePushHistory() { try { history.pushState({ pc: 1 }, ""); } catch {} }

/* ---------- Drafts ---------- */
function draftsKey() { const s=state.session; return `drafts_${s.store}_${s.shift}_${s.sessionDayKey}`; }
function loadDrafts() { try { state.drafts = JSON.parse(localStorage.getItem(draftsKey())) || {}; } catch { state.drafts = {}; } }
function saveDrafts() { localStorage.setItem(draftsKey(), JSON.stringify(state.drafts)); }
if (state.session.store) loadDrafts();

/* ---------- Render Root ---------- */
function render() {
  updateSessionLine(); renderRolePill();
  if (!state.session.store) { renderLoginPage(); return; }
  if (!state.__draftsHydrated) { state.__draftsHydrated = true; loadDrafts(); }
  
  const p = state.view.page;
  if (p === "login") renderLoginPage();
  else if (p === "home") renderHome();
  else if (p === "category") renderCategory();
  else if (p === "stockAlerts") renderStockAlerts();
  else if (p === "summaryHome") renderSummaryHome();
  else if (p === "summaryList") renderSummaryList();
  else if (p === "wisr") renderWISR();
  else if (p === "manager") renderManagerHome();
  else if (p === "managerEditItems") renderManagerEditItems();
  else if (p === "managerCategories") renderManagerCategories();
}

/* ---------- Home ---------- */
function renderHome() {
  const main = $("#main");
  const cats = (state.data.categories || []).map(c => c.name);
  const counts = {}; state.data.items.forEach(i => counts[i.category] = (counts[i.category]||0)+1);
  const tiles = cats.map((n, i) => {
    const tone = tileToneFor(n);
    return `<button class="tile ${tone}" style="animation-delay:${i*40}ms" data-cat="${escapeHtml(n)}"><div class="emoji" style="font-size:54px">${CAT_EMOJI[n]||"✅"}</div><div class="title" style="font-size:20px;font-weight:1200">${escapeHtml(n)}</div><div class="sub">${counts[n]||0} items</div></button>`;
  }).join("");
  
  main.innerHTML = `<div class="col"><div style="position:relative;margin-bottom:10px"><input id="homeSearch" class="input" placeholder="🔍 Search item..." style="padding-left:44px;height:50px;border-radius:99px"><div style="position:absolute;left:16px;top:13px;font-size:20px">🔍</div></div><div id="homeSearchResults" class="hidden col"></div><div id="homeTiles" class="tiles-2col">${tiles}</div></div>`;
  
  $$(".tile", main).forEach(b => b.onclick = () => setView({ page: "category", category: b.dataset.cat }));
  
  $("#homeSearch").oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    const res = $("#homeSearchResults"), grid = $("#homeTiles");
    if (!q) { res.classList.add("hidden"); grid.classList.remove("hidden"); return; }
    grid.classList.add("hidden"); res.classList.remove("hidden");
    
    const matches = state.data.items.filter(i => i.name.toLowerCase().includes(q));
    if (!matches.length) { res.innerHTML = `<div class="card" style="text-align:center;padding:30px">No items found</div>`; return; }
    
    res.innerHTML = matches.map(it => `<button class="search-result-card jump-btn" data-cat="${escapeHtml(it.category)}" data-sub="${escapeHtml(it.sub_category||"")}"><div style="flex:1"><div style="font-weight:1200;font-size:17px">${escapeHtml(it.name)}</div><div style="font-size:13px;opacity:0.6">${escapeHtml(it.category)}</div></div><div class="search-pill">Go</div></button>`).join("");
    $$(".jump-btn", res).forEach(b => b.onclick = () => setView({ page: "category", category: b.dataset.cat, sauceSub: b.dataset.sub||null }, true));
  };
}
function tileToneFor(n) { const m={"Prepared items":"t-green","Unopened chiller":"t-blue","Thawing":"t-cyan","Vegetables":"t-green2","Backroom":"t-orange","Front counter":"t-red","Back counter chiller":"t-teal","Fountain Drinks":"t-green2","Sauce":"t-purple"}; return m[n]||"t-pink"; }

/* ---------- Category ---------- */
function renderCategory() {
  const main = $("#main"), cat = state.view.category;
  if (cat === "Sauce" && !state.view.sauceSub) {
    main.innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">Sauce</div></div><div class="tiles-2col">${SAUCE_SUBS.map((s,i)=>`<button class="tile ${s.tone==="teal"?"t-teal":s.tone==="purple"?"t-purple":"t-orange"}" style="animation-delay:${i*60}ms" data-sub="${s.name}"><div class="emoji" style="font-size:56px">${s.emoji}</div><div class="title">${s.name}</div></button>`).join("")}</div>`;
    $("#btnBack").onclick = goBack; $$(".tile", main).forEach(b => b.onclick = () => setView({ sauceSub: b.dataset.sub }, true));
    return;
  }
  
  const sub = state.view.sauceSub, title = cat==="Sauce"&&sub?`Sauce - ${sub}`:cat;
  let items = state.data.items.filter(x => x.category===cat);
  if (cat==="Sauce"&&sub) items = items.filter(x => normalizeSub(x.sub_category)===normalizeSub(sub));
  
  const prog = getCategoryProgress(items, cat);
  const list = items.map(it => renderItemEditor(it, cat)).join("");
  const empty = !items.length ? `<div style="text-align:center;padding:40px;opacity:0.6"><div style="font-size:48px">🥬</div><div>No items here</div></div>` : "";
  
  main.innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title" style="flex:1;display:flex;justify-content:space-between;align-items:center"><span>${escapeHtml(title)}</span>${prog.total?`<div style="display:flex;align-items:center"><span id="catProgText" style="font-size:12px;margin-right:8px">${prog.done}/${prog.total}</span><div class="prog-track"><div id="catProgBar" class="prog-fill" style="width:${prog.pct}%"></div></div></div>`:""}</div></div>${empty}<div class="edit-list" id="editList">${list}</div><div class="save-bar"><button id="saveBtn" class="btn" style="width:100%;background:var(--green);color:#fff;box-shadow:0 10px 20px rgba(0,0,0,0.15)">${prog.done===prog.total&&prog.total>0?"Done checking ✅ (Save)":"Save"}</button></div>`;
  
  $("#btnBack").onclick = goBack;
  bindItemEditors(items, cat);
  $("#saveBtn").onclick = () => saveCategory(items, cat);
}

function getCategoryProgress(items, cat) {
  let total=0, done=0;
  items.forEach(it => {
    const d = state.drafts[itemKey(it)] || {};
    if ((d.qty||0) <= 0) return;
    total++;
    const rule = shelfLifeModeFor(it, cat);
    if (rule.mode === "HOURLY") { if (d.expTimeShort) done++; }
    else if (rule.mode === "EOD_AUTO") { done++; }
    else if (d.expDateISO) done++;
  });
  return { total, done, pct: total ? Math.round((done/total)*100) : 0 };
}

function renderItemEditor(it, cat) {
  const k = itemKey(it);
  if (!state.drafts[k]) state.drafts[k] = { qty: 0 };
  const d = state.drafts[k], rule = shelfLifeModeFor(it, cat);
  
  let expiryUI = "";
  if (rule.mode === "HOURLY") {
    expiryUI = `<select class="select" data-exptime="${k}"><option value="">Select Time</option>${HOURLY_SHORT.map(o=>`<option value="${o.value}"${d.expTimeShort===o.value?" selected":""}>${o.label}</option>`).join("")}</select>`;
  } else if (rule.mode === "EOD_AUTO") {
    expiryUI = `<div class="muted">Expiry: End of Day (Auto)</div>`;
  } else {
    // PRESET or MANUAL
    const n = Math.min(7, Math.max(1, rule.life||1));
    const opts = Array.from({length:n}, (_,i) => { const iso=addDaysISO(todayISO(), i); return `<option value="${iso}"${d.expDateISO===iso?" selected":""}>${formatLongDMY(iso)}</option>`; }).join("");
    expiryUI = `<select class="select" data-exppreset="${k}"><option value="">Select Date</option>${opts}<option value="MANUAL"${d.expType==="MANUAL"?" selected":""}>Manual Picker</option></select>
    <div data-pickwrap="${k}" class="${d.expType==="MANUAL"?"":"hidden"}" style="margin-top:8px"><button class="btn btn-yellow" style="width:100%" data-pickdate="${k}">Pick Date</button><div class="muted" style="font-size:12px;margin-top:4px">${d.expDateISO?formatLongDMY(d.expDateISO):""}</div></div>`;
  }
  
  const addDateBtn = rule.mode==="HOURLY"?"":`<button class="btn btn-ghost" data-adddate="${k}" style="padding:8px 12px">＋</button>`;
  const extra = d.extraQty>0 ? `<div class="muted" style="margin-top:4px">2nd date: ${d.extraQty}</div>` : "";
  
  return `<div class="edit-card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center"><div class="edit-name">${escapeHtml(it.name)}</div>${addDateBtn}</div>${extra}<div class="edit-row" style="display:flex;gap:10px;margin-top:8px"><div class="qty-stepper"><button class="qty-btn" data-dec="${k}">−</button><input class="qty-inp" data-qty="${k}" type="number" value="${d.qty||0}"><button class="qty-btn" data-inc="${k}">+</button></div><div style="flex:1">${expiryUI}</div></div></div>`;
}

function bindItemEditors(items, cat) {
  const root = $("#editList");
  const refresh = () => {
    const p = getCategoryProgress(items, cat);
    $("#catProgText").textContent = `${p.done}/${p.total}`;
    $("#catProgBar").style.width = `${p.pct}%`;
    $("#saveBtn").textContent = (p.done===p.total && p.total>0) ? "Done checking ✅ (Save)" : "Save";
  };
  
  items.forEach(it => {
    const k = itemKey(it);
    const d = state.drafts[k];
    
    // Qty
    const qInp=$(`[data-qty="${k}"]`, root), inc=$(`[data-inc="${k}"]`, root), dec=$(`[data-dec="${k}"]`, root);
    const updateQ = () => { qInp.value = d.qty; dec.disabled = d.qty<=0; refresh(); saveDrafts(); };
    updateQ();
    inc.onclick = () => { d.qty++; updateQ(); };
    dec.onclick = () => { if(d.qty>0) d.qty--; updateQ(); };
    qInp.oninput = () => { d.qty = Math.max(0, Number(qInp.value)); saveDrafts(); refresh(); };
    
    // Expiry
    const timeSel = $(`[data-exptime="${k}"]`, root);
    if(timeSel) timeSel.onchange = () => { d.expTimeShort = timeSel.value; d.expType="HOURLY"; saveDrafts(); refresh(); };
    
    const preSel = $(`[data-exppreset="${k}"]`, root);
    const pickWrap = $(`[data-pickwrap="${k}"]`, root);
    if(preSel) preSel.onchange = () => {
      const v = preSel.value;
      if (v === "MANUAL") { d.expType="MANUAL"; pickWrap.classList.remove("hidden"); }
      else { d.expType="PRESET"; d.expDateISO=v; pickWrap.classList.add("hidden"); }
      saveDrafts(); refresh(); render(); // Re-render to show date text updates
    };
    
    const pickBtn = $(`[data-pickdate="${k}"]`, root);
    if(pickBtn) pickBtn.onclick = () => openDateWheelModal({ initialISO: d.expDateISO, onPick: (iso) => { d.expDateISO=iso; d.expType="MANUAL"; saveDrafts(); refresh(); render(); } });
    
    const addBtn = $(`[data-adddate="${k}"]`, root);
    if(addBtn) addBtn.onclick = () => openAddDateModal({ it, cat, key: k });
  });
}

function itemKey(it) { return it.id ? `id:${it.id}` : `name:${it.name}`; }
function shelfLifeModeFor(it, cat) {
  if (it.is_hourly) return { mode: "HOURLY" };
  if (isChickenBaconC(it.name)) return { mode: "EOD_AUTO" };
  const l = Number(it.shelf_life_days||0);
  if (FORCE_MANUAL_DATE_CATS.has(cat) || l<=0 || l>7) return { mode: "MANUAL", life: l };
  return { mode: "PRESET", life: l };
}

/* ---------- Save Category ---------- */
async function saveCategory(items, cat) {
  const rows = [];
  for (const it of items) {
    const k = itemKey(it), d = state.drafts[k];
    if (!d || d.qty <= 0) continue;
    const rule = shelfLifeModeFor(it, cat);
    let expiry = null, expiry_at = null;
    
    if (rule.mode === "HOURLY") {
      if (!d.expTimeShort) return toast(`Time missing: ${it.name}`);
      expiry = todayISO(); expiry_at = isoFromTodayAndTime(d.expTimeShort);
    } else if (rule.mode === "EOD_AUTO") {
      expiry = todayISO();
    } else {
      if (!d.expDateISO) return toast(`Date missing: ${it.name}`);
      expiry = d.expDateISO;
    }
    rows.push({ item_id: it.id, item_name: it.name, category: it.category, sub_category: it.sub_category, quantity: d.qty, expiry, expiry_at, shift: state.session.shift, is_extra: false });
    
    if (d.extraQty > 0) {
      if (!d.extraISO && rule.mode!=="EOD_AUTO") return toast("2nd date missing");
      rows.push({ item_id: it.id, item_name: it.name, category: it.category, sub_category: it.sub_category, quantity: d.extraQty, expiry: d.extraISO||todayISO(), shift: state.session.shift, is_extra: true, extra_tag: "SECOND" });
    }
  }
  
  if (!rows.length) return toast("Nothing to save");
  
  const hasBackdated = rows.some(r => r.expiry && r.expiry < todayISO());
  const proceed = async () => {
    showSaving("Saving...");
    try {
      await apiPost("/api/log/batch", { ...state.session, rows });
      recordShiftDoneAndLast({ ...state.session, lastItemName: rows[rows.length-1].item_name });
      toast("Saved ✅"); await refreshStockDot().catch(()=>{});
    } catch { toast("Save failed"); } finally { hideSaving(); }
  };
  
  if (hasBackdated) openBackdatedWarning({ onProceed: proceed });
  else await proceed();
}

/* ---------- Stock Alert ---------- */
async function refreshStockDot() {
  try {
    const r = await apiGet(`/api/stock/low?store=${state.session.store}`);
    state.stock.rows = Array.isArray(r) ? r.filter(x => !STOCK_ALERT_EXCLUDE_CATS.has(x.category)) : [];
    state.stock.hasDot = state.stock.rows.length > 0;
    updateDrawerAlertLabel(state.stock.hasDot);
  } catch { state.stock.hasDot=false; }
}
async function renderStockAlerts() {
  const main = $("#main");
  main.innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">Stock Alert</div></div><div id="saWrap" class="col"><div class="card skeleton skeleton-card"></div></div>`;
  $("#btnBack").onclick = goBack;
  await refreshStockDot();
  const wrap = $("#saWrap");
  if (!state.stock.rows.length) { wrap.innerHTML = `<div class="card"><div>No low stock ✅</div></div>`; return; }
  wrap.innerHTML = state.stock.rows.map(x => `<div class="card" style="margin-bottom:10px"><div style="font-weight:1200">${x.name}</div><div class="muted">Current: ${x.current_qty} / Min: ${x.min_qty}</div></div>`).join("");
}

/* ---------- Summary (Restored Original Logic) ---------- */
async function renderSummaryHome() {
  const main = $("#main");
  const isMgr = state.session.isManager;
  state.view.summaryMode = isMgr ? (state.view.summaryMode || "PDD") : state.session.store;
  
  main.innerHTML = `
    <div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">Summary</div></div>
    ${isMgr ? `<div class="card"><div class="row" style="gap:10px"><button id="mPDD" class="btn" style="flex:1">PDD</button><button id="mSKH" class="btn" style="flex:1">SKH</button></div></div>` : ""}
    <div class="card" style="margin-top:12px"><div style="font-weight:1200;margin-bottom:10px">Shift Completion</div><div id="shiftGrid">Loading...</div></div>
    <div class="card" style="margin-top:12px"><div style="font-weight:1200;margin-bottom:10px">Expiry Overview</div><div id="sumWrap">Loading...</div></div>
  `;
  $("#btnBack").onclick = goBack;
  
  if (isMgr) {
    const updateM = () => { $("#mPDD").style.background=state.view.summaryMode==="PDD"?"var(--pdd)":"#fff"; $("#mSKH").style.background=state.view.summaryMode==="SKH"?"var(--skh)":"#fff"; };
    updateM();
    $("#mPDD").onclick=()=>{ state.view.summaryMode="PDD"; updateM(); renderSummaryHome(); };
    $("#mSKH").onclick=()=>{ state.view.summaryMode="SKH"; updateM(); renderSummaryHome(); };
  }
  
  drawSummaryCards();
  drawShiftGrid();
}

async function drawShiftGrid() {
  const store = state.view.summaryMode;
  try {
    const s = await apiGet(`/api/status?store=${store}`);
    const am = s?.AM || {}, pm = s?.PM || {};
    $("#shiftGrid").innerHTML = `
      <div style="border:1px solid var(--line);padding:10px;border-radius:12px;margin-bottom:8px"><b>AM</b>: ${am.last_saved_by ? `Done by ${am.last_saved_by} (${am.total_rows} items)` : "Not done"}</div>
      <div style="border:1px solid var(--line);padding:10px;border-radius:12px"><b>PM</b>: ${pm.last_saved_by ? `Done by ${pm.last_saved_by} (${pm.total_rows} items)` : "Not done"}</div>
    `;
  } catch { $("#shiftGrid").textContent = "Failed to load status"; }
}

async function drawSummaryCards() {
  const store = state.view.summaryMode;
  try {
    const r = await apiGet(`/api/expiry?store=${store}`);
    const rows = Array.isArray(r) ? r : [];
    const t = todayISO(), tm = addDaysISO(t, 1);
    const cToday = rows.filter(x => datePartFromRow(x) === t).length;
    const cTom = rows.filter(x => datePartFromRow(x) === tm).length;
    const cSafe = rows.length - cToday - cTom;
    
    $("#sumWrap").innerHTML = `
      <button class="dash-card dash-red" id="bToday"><div class="dash-num">${cToday}</div><div>Expiring Today</div></button>
      <button class="dash-card dash-amber" id="bTom" style="margin-top:8px"><div class="dash-num">${cTom}</div><div>Expiring Tomorrow</div></button>
      <button class="dash-card dash-green" id="bSafe" style="margin-top:8px"><div class="dash-num">${cSafe}</div><div>All Safe</div></button>
    `;
    $("#bToday").onclick = () => setView({ page: "summaryList", bucket: "TODAY" }, true);
    $("#bTom").onclick = () => setView({ page: "summaryList", bucket: "TOMORROW" }, true);
    $("#bSafe").onclick = () => setView({ page: "summaryList", bucket: "SAFE" }, true);
  } catch { $("#sumWrap").textContent = "Failed to load"; }
}

async function renderSummaryList() {
  const main = $("#main"), bucket = state.view.bucket;
  main.innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">${bucket}</div></div><div id="sList">Loading...</div>`;
  $("#btnBack").onclick = goBack;
  
  try {
    const r = await apiGet(`/api/expiry?store=${state.view.summaryMode}`);
    let rows = Array.isArray(r) ? r : [];
    const t = todayISO(), tm = addDaysISO(t, 1);
    
    if (bucket === "TODAY") rows = rows.filter(x => datePartFromRow(x) === t);
    else if (bucket === "TOMORROW") rows = rows.filter(x => datePartFromRow(x) === tm);
    else rows = rows.filter(x => datePartFromRow(x) !== t && datePartFromRow(x) !== tm);
    
    $("#sList").innerHTML = rows.length ? rows.map(x => `
      <div class="card" style="margin-bottom:8px">
        <div style="font-weight:1200">${x.item_name}</div>
        <div class="muted">${formatLongDMY(datePartFromRow(x))} • Qty: ${x.quantity}</div>
      </div>
    `).join("") : `<div style="text-align:center;padding:20px;opacity:0.6">No items</div>`;
  } catch { $("#sList").textContent = "Failed"; }
}

/* ---------- WISR & Manager ---------- */
function renderWISR() { $("#main").innerHTML=`<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">WISR</div></div><div class="card">Coming Soon</div>`; $("#btnBack").onclick=goBack; }

function renderManagerHome() {
  if (!state.session.isManager) return openManagerLogin();
  $("#main").innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">Manager</div></div><div class="tiles-2col">
    <button class="tile t-blue" id="mAdd"><div class="emoji">➕</div><div class="title">Add Item</div></button>
    <button class="tile t-teal" id="mEdit"><div class="emoji">📝</div><div class="title">Edit Items</div></button>
    <button class="tile t-purple" id="mCats"><div class="emoji">🗂️</div><div class="title">Categories</div></button>
    <button class="tile t-orange" id="mLog"><div class="emoji">⬇️</div><div class="title">Download Log</div></button>
  </div>`;
  $("#btnBack").onclick=goBack; $("#mAdd").onclick=openAddItemModal; $("#mEdit").onclick=()=>setView({page:"managerEditItems"},true); $("#mCats").onclick=()=>setView({page:"managerCategories"},true); $("#mLog").onclick=openDownloadLogModal;
}

function openManagerLogin() {
  openModal("Manager Login", `<div class="card"><input id="pin" class="input" type="password" placeholder="PIN"><button id="go" class="btn btn-red" style="width:100%;margin-top:10px">Login</button><button id="cancel" class="btn btn-yellow" style="width:100%;margin-top:10px">Cancel</button></div>`, {noBackdropClose:true});
  $("#cancel").onclick = () => { closeModal(); goBack(); };
  $("#go").onclick = async () => {
    try { showSaving("Logging in..."); const r = await apiPost("/api/manager/login", { pin: $("#pin").value, store: state.session.store }); state.session.isManager=true; state.session.managerToken=r.token; saveSession(); closeModal(); renderRolePill(); toast("Manager ✅"); render(); }
    catch { toast("Wrong PIN"); } finally { hideSaving(); }
  };
}

async function renderManagerEditItems() {
  if (!state.session.isManager) return openManagerLogin();
  $("#main").innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">Edit Items</div></div><div class="card"><input id="mgrSearch" class="input" placeholder="Search..."></div><div id="mgrList"></div>`;
  $("#btnBack").onclick=goBack;
  showSaving("Loading...");
  let items=[];
  try { items = await apiGet(`/api/manager/items?store=${state.session.store}`, state.session.managerToken); } catch { toast("Load failed"); } finally { hideSaving(); }
  
  const renderList = (q) => {
    const list = q ? items.filter(x=>x.name.toLowerCase().includes(q)) : items;
    $("#mgrList").innerHTML = list.map(it => `
      <div class="card" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-weight:1200">${escapeHtml(it.name)}</div><div class="muted">${it.category}</div></div>
        <button class="btn btn-red" onclick="deleteItem(${it.id})">Delete</button>
      </div>
    `).join("");
  };
  $("#mgrSearch").oninput = (e) => renderList(e.target.value.toLowerCase());
  renderList("");
  
  window.deleteItem = async (id) => {
    if(!confirm("Delete?")) return;
    showSaving("Deleting...");
    try { await apiDel(`/api/manager/items/${id}?store=${state.session.store}`, state.session.managerToken); toast("Deleted"); items=items.filter(x=>x.id!=id); renderList($("#mgrSearch").value); } catch { toast("Failed"); } finally { hideSaving(); }
  };
}

async function renderManagerCategories() {
  if (!state.session.isManager) return openManagerLogin();
  $("#main").innerHTML = `<div class="page-head"><button id="btnBack" class="btn btn-yellow">← Back</button><div class="page-title">Categories</div></div><div id="catList" class="tiles-2col"></div><button id="addC" class="btn btn-blue" style="width:100%;margin-top:10px">Add</button>`;
  $("#btnBack").onclick=goBack;
  showSaving("Loading...");
  try {
    const cats = await apiGet(`/api/manager/categories?store=${state.session.store}`, state.session.managerToken);
    $("#catList").innerHTML = cats.map(c => `<button class="tile ${tileToneFor(c.name)}" onclick="editCat(${c.id}, '${c.name}')"><div class="title">${c.name}</div></button>`).join("");
  } catch { toast("Load failed"); } finally { hideSaving(); }
  
  $("#addC").onclick = () => {
    openModal("Add Category", `<div class="card"><input id="cn" class="input"><button id="cs" class="btn btn-yellow" style="width:100%;margin-top:10px">Save</button></div>`, {noBackdropClose:true});
    $("#cs").onclick = async () => {
      try { await apiPost("/api/manager/categories", {store:state.session.store, name:$("#cn").value, sort_order:100}, state.session.managerToken); toast("Saved"); closeModal(); renderManagerCategories(); } catch { toast("Failed"); }
    };
  };
  window.editCat = (id, name) => {
    if(!confirm(`Delete category ${name}?`)) return;
    showSaving("Deleting...");
    apiDel(`/api/manager/categories/${id}?store=${state.session.store}`, state.session.managerToken).then(()=>{toast("Deleted");renderManagerCategories()}).catch(()=>{toast("Failed");}).finally(hideSaving);
  };
}

function openAddItemModal() {
  const cats = state.data.categories.map(c=>c.name);
  openModal("Add Item", `<div class="card"><input id="in" class="input" placeholder="Name"><select id="ic" class="select">${cats.map(c=>`<option value="${c}">${c}</option>`).join("")}</select><input id="il" class="input" type="number" placeholder="Shelf Days"><button id="is" class="btn btn-yellow" style="width:100%;margin-top:10px">Save</button></div>`, {noBackdropClose:true});
  $("#is").onclick = async () => {
    try { showSaving("Saving..."); await apiPost("/api/manager/items", {store:state.session.store, name:$("#in").value, category:$("#ic").value, shelf_life_days:$("#il").value}, state.session.managerToken); toast("Saved"); closeModal(); await loadAllForCurrentStore(); } catch { toast("Failed"); } finally { hideSaving(); }
  };
}

function openDownloadLogModal() {
  openModal("Download Log", `<div class="card"><button id="dl" class="btn btn-blue" style="width:100%">Download CSV (Last 30 Days)</button></div>`, {noBackdropClose:true});
  $("#dl").onclick = async () => {
    const t = todayISO(), f = addDaysISO(t, -30);
    const u = `/api/manager/log/export.csv?store=${state.session.store}&from=${f}&to=${t}`;
    try { showSaving("Downloading..."); const r=await fetch(u,{headers:{Authorization:`Bearer ${state.session.managerToken}`}}); const b=await r.blob(); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="Log.csv"; a.click(); toast("Done"); closeModal(); } catch { toast("Failed"); } finally { hideSaving(); }
  };
}

/* ---------- Helpers ---------- */
function escapeHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function hideSplashScreen() { $("#splash")?.classList.add("fade-out"); setTimeout(()=>$("#splash")?.remove(),600); }
function openBackdatedWarning({onProceed}) { openModal("Warning", `<div class="card"><div>Backdated! Discard?</div><div class="row" style="margin-top:10px"><button id="no" class="btn btn-yellow" style="flex:1">Cancel</button><button id="yes" class="btn btn-red" style="flex:1">Yes</button></div></div>`, {noBackdropClose:true}); $("#no").onclick=closeModal; $("#yes").onclick=()=>{closeModal();onProceed();}; }
function openAddDateModal({ it, cat, key }) {
  const d = state.drafts[key]||(state.drafts[key]={});
  openModal("2nd Date", `<div class="card"><div>Add 2nd Expiry</div><button id="pk" class="btn btn-yellow" style="width:100%;margin-top:10px">Pick Date</button><input id="pq" class="input" type="number" placeholder="Qty" style="margin-top:10px"><button id="ok" class="btn btn-green" style="width:100%;margin-top:10px">Done</button></div>`, {noBackdropClose:true});
  $("#pk").onclick = () => openDateWheelModal({ initialISO: d.extraISO||todayISO(), onPick: (iso) => { d.extraISO=iso; toast("Date Set"); } });
  $("#pq").oninput = (e) => d.extraQty = Number(e.target.value);
  $("#ok").onclick = closeModal;
}

/* ---------- iOS Wheel Picker ---------- */
function ensurePCWheelStyles() {
  if (document.getElementById("pcWheelStyles")) return;
  const css = document.createElement("style");
  css.id = "pcWheelStyles";
  css.textContent = `
  .pc-ios-wheel{padding:12px 6px 6px;user-select:none;}
  .pc-ios-wheel .pc-wheel-title{font-weight:1200;font-size:16px;margin-bottom:10px;}
  .pc-ios-wheel .pc-wheel-frame{position:relative;border-radius:22px;background:#fff;border:1px solid var(--line);overflow:hidden;padding:10px 10px 12px;}
  .pc-ios-wheel .pc-wheel-cols{display:flex;gap:10px;}
  .pc-ios-wheel .pc-col{flex:1;min-width:0;}
  .pc-ios-wheel .pc-label{font-weight:1100;font-size:12px;color:#666;margin:0 4px 6px;}
  .pc-ios-wheel .pc-list{height:220px;overflow:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-radius:18px;background:rgba(0,0,0,0.02);position:relative;}
  .pc-ios-wheel .pc-list::-webkit-scrollbar{display:none;}
  .pc-ios-wheel .pc-item{height:44px;display:flex;align-items:center;justify-content:center;font-weight:1200;font-size:18px;color:#111;border:0;background:transparent;width:100%;}
  .pc-ios-wheel .pc-highlight{position:absolute;left:10px;right:10px;top:50%;transform:translateY(-50%);height:44px;border-radius:16px;background:rgba(0,153,84,0.10);border:1px solid rgba(0,153,84,0.18);pointer-events:none;}
  .pc-ios-wheel .pc-fadeTop{position:absolute;left:0;right:0;top:0;height:42px;pointer-events:none;z-index:3;background:linear-gradient(#fff,rgba(255,255,255,0));}
  .pc-ios-wheel .pc-fadeBot{position:absolute;left:0;right:0;bottom:0;height:42px;pointer-events:none;z-index:3;background:linear-gradient(rgba(255,255,255,0),#fff);}
  .pc-ios-wheel .pc-actions{display:flex;gap:12px;margin-top:12px;}
  .pc-ios-wheel .pc-btn{flex:1;padding:14px 14px;border-radius:999px;font-weight:1200;border:0;}
  .pc-ios-wheel .pc-btn.cancel{background:var(--yellow);color:#111;}
  .pc-ios-wheel .pc-btn.ok{background:var(--green);color:#fff;}
  `;
  document.head.appendChild(css);
}

function openDateWheelModal({ title, initialISO, minISO, maxISO, onPick }) {
  ensurePCWheelStyles();
  const today = todayISO();
  const threshold = String(minISO || today).slice(0, 10);
  const hardMin = "1900-01-01", hardMax = String(maxISO || "2100-12-31").slice(0, 10);
  const init = String(initialISO || today).slice(0, 10);

  function clampISO(iso) { let x = String(iso||"").slice(0,10); if(!x)x=today; if(x<hardMin)x=hardMin; if(x>hardMax)x=hardMax; return x; }
  function toYMD(iso) { const [yy,mm,dd]=String(iso).slice(0,10).split("-").map(n=>Number(n)); return {y:yy||2000,m:mm||1,d:dd||1}; }
  function daysInMonth(y,m) { return new Date(y,m,0).getDate(); }
  function monthName(mm) { return new Date(2000,mm-1,1).toLocaleString("en",{month:"long"}); }
  function toISO(y,m,d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

  let cur = toYMD(clampISO(init));
  let y=cur.y, m=cur.m, d=cur.d;

  openModal(title || "Pick date", `<div class="pc-ios-wheel"><div class="pc-wheel-title">${escapeHtml(title||"Pick date")}</div><div class="pc-wheel-frame"><div class="pc-wheel-cols"><div class="pc-col"><div class="pc-label">Day</div><div class="pc-list" id="wDay"></div></div><div class="pc-col"><div class="pc-label">Month</div><div class="pc-list" id="wMon"></div></div><div class="pc-col"><div class="pc-label">Year</div><div class="pc-list" id="wYear"></div></div></div><div class="pc-highlight"></div><div class="pc-fadeTop"></div><div class="pc-fadeBot"></div></div><div class="pc-actions"><button class="pc-btn cancel" id="wCancel">Cancel</button><button class="pc-btn ok" id="wOk">Set date</button></div></div>`, { noBackdropClose: true });

  const dayEl=$("#wDay"), monEl=$("#wMon"), yearEl=$("#wYear");
  $("#wCancel").addEventListener("click", closeModal);

  function renderList(el,arr,fmt) { el.innerHTML=arr.map(v=>`<div class="pc-item" data-v="${v}">${fmt(v)}</div>`).join(""); }
  function centerTo(el, val) { 
    const items=$$(".pc-item",el), idx=items.findIndex(x=>String(x.dataset.v)==String(val));
    if(idx>=0) el.scrollTo({top: items[idx].offsetTop - el.clientHeight/2 + 22}); 
  }

  const loop=3;
  function buildLists() {
    const days=[]; for(let c=0;c<loop;c++) for(let i=1;i<=daysInMonth(y,m);i++) days.push(i);
    const mons=[]; for(let c=0;c<loop;c++) for(let i=1;i<=12;i++) mons.push(i);
    const yrs=[]; for(let i=2000;i<=2100;i++) yrs.push(i);
    
    renderList(dayEl, days, v=>v);
    renderList(monEl, mons, v=>monthName(v));
    renderList(yearEl, yrs, v=>v);
  }
  
  buildLists();
  setTimeout(() => { centerTo(dayEl,d); centerTo(monEl,m); centerTo(yearEl,y); }, 0);

  const bindScroll = (el, setFn) => {
    let t;
    el.addEventListener("scroll", () => {
      clearTimeout(t);
      t=setTimeout(() => {
        const center = el.scrollTop + el.clientHeight/2;
        let best=null, dist=Infinity;
        $$(".pc-item", el).forEach(it => {
          const d = Math.abs((it.offsetTop + 22) - center);
          if(d<dist) { dist=d; best=it; }
        });
        if(best) { setFn(Number(best.dataset.v)); haptic(5); }
      }, 100);
    });
  };

  bindScroll(dayEl, v => d=v);
  bindScroll(monEl, v => { m=v; buildLists(); }); 
  bindScroll(yearEl, v => { y=v; buildLists(); });

  $("#wOk").addEventListener("click", () => {
    const picked = clampISO(toISO(y,m,d));
    closeModal();
    if(picked < today) openBackdatedWarning({pickedISO:picked, thresholdISO:threshold, onProceed:()=>onPick && onPick(picked)});
    else onPick && onPick(picked);
  });
}
function doLogout() {
  state.session.store = ""; state.session.staff = ""; state.session.shift = "AM"; state.session.isManager = false; state.session.managerToken = ""; state.session.sessionDayKey = dayKeyNow();
  saveSession();
  state.data = { categories: [], items: [] }; state.drafts = {}; state.navStack = [];
  state.view = { page: "login", category: null, sauceSub: null, summaryMode: null, bucket: null };
  renderRolePill(); render();
}
