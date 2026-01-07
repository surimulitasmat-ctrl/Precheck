import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// -------------------- Health --------------------
app.get("/health", (req, res) => res.status(200).type("text/plain").send("ok"));
app.get("/api/health", (req, res) => res.status(200).json({ ok: true }));

// -------------------- Supabase --------------------
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
} else {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).");
}

async function loadItemsMap() {
  const { data, error } = await supabase
    .from("items")
    .select("id,name,category,sub_category,shelf_life_days");
  if (error) throw new Error(error.message);
  const map = new Map();
  for (const it of data || []) map.set(Number(it.id), it);
  return map;
}

// -------------------- API --------------------

// GET /api/items
app.get("/api/items", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const { data, error } = await supabase
      .from("items")
      .select("id,name,category,sub_category,shelf_life_days")
      .order("category", { ascending: true })
      .order("sub_category", { ascending: true })
      .order("name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to load items" });
  }
});

// POST /api/log
// IMPORTANT: insert ONLY columns that definitely exist in your stock_logs.
// Your error proves `category` does NOT exist, so we do minimal payload.
app.post("/api/log", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const { item_id, store, shift, staff, quantity, expiry } = req.body || {};

    if (!store || !shift || !staff) return res.status(400).json({ error: "store, shift, staff are required" });
    if (!item_id) return res.status(400).json({ error: "item_id is required" });
    if (!expiry) return res.status(400).json({ error: "expiry is required" });

    // Quantity optional, blank allowed, 0 allowed
    let qtyToSave = null;
    if (quantity === 0) qtyToSave = 0;
    else if (quantity === "" || quantity === null || quantity === undefined) qtyToSave = null;
    else {
      const n = Number(quantity);
      qtyToSave = Number.isFinite(n) ? n : null;
    }

    const payload = {
      item_id,
      store,
      shift,
      staff,
      quantity: qtyToSave,
      expiry, // ISO string
    };

    const { data, error } = await supabase
      .from("stock_logs")
      .insert(payload)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to save log" });
  }
});

// GET /api/expiry?store=...
// Uses latest log per item_id, and joins name from items table (so no need item_name column)
app.get("/api/expiry", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const store = String(req.query.store || "").trim();
    if (!store) return res.status(400).json({ error: "store is required" });

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const itemsMap = await loadItemsMap();

    const { data: logs, error } = await supabase
      .from("stock_logs")
      .select("item_id,expiry,quantity,created_at")
      .eq("store", store)
      .not("expiry", "is", null)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (error) return res.status(500).json({ error: error.message });

    const latestByItem = new Map();
    for (const row of logs || []) {
      const id = Number(row.item_id);
      if (!id) continue;
      if (!latestByItem.has(id)) latestByItem.set(id, row);
    }

    const alerts = [];
    for (const [id, row] of latestByItem.entries()) {
      const exp = new Date(row.expiry);
      if (isNaN(exp.getTime())) continue;

      if (exp <= in24h) {
        const item = itemsMap.get(id);
        alerts.push({
          item_id: id,
          name: item?.name || `Item ${id}`,
          expiry: row.expiry,
          quantity: row.quantity,
          created_at: row.created_at,
        });
      }
    }

    alerts.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    return res.json(alerts);
  } catch (e) {
    return res.status(500).json({ error: e.message || "expiry failed" });
  }
});

// GET /api/low_stock?store=...
app.get("/api/low_stock", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });
    const store = String(req.query.store || "").trim();
    if (!store) return res.status(400).json({ error: "store is required" });

    const itemsMap = await loadItemsMap();

    const { data: logs, error } = await supabase
      .from("stock_logs")
      .select("item_id,quantity,created_at")
      .eq("store", store)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (error) return res.status(500).json({ error: error.message });

    const latestByItem = new Map();
    for (const row of logs || []) {
      const id = Number(row.item_id);
      if (!id) continue;
      if (!latestByItem.has(id)) latestByItem.set(id, row);
    }

    const low = [];
    for (const [id, row] of latestByItem.entries()) {
      if (row.quantity === 0) {
        const item = itemsMap.get(id);
        low.push({
          item_id: id,
          name: item?.name || `Item ${id}`,
          quantity: row.quantity,
          created_at: row.created_at,
        });
      }
    }

    low.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json(low);
  } catch (e) {
    return res.status(500).json({ error: e.message || "low_stock failed" });
  }
});

// -------------------- Static + SPA catch-all --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// IMPORTANT: Catch-all should NOT steal /api/* or /health
app.get(/^\/(?!api\/|health$).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
