import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// -------------------- Supabase --------------------
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).");
}

// Only create client if env is present (prevents crash loops)
const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

// -------------------- API routes (MUST stay ABOVE the static catch-all) --------------------

// Health check (IMPORTANT)
// If /health shows your home page, it means this route is missing or below the "*" catch-all.
app.get("/health", (req, res) => {
  if (!SUPABASE_URL) return res.status(500).send("missing SUPABASE_URL");
  if (!SUPABASE_KEY) return res.status(500).send("missing SUPABASE_SERVICE_ROLE_KEY");
  return res.status(200).send("ok");
});

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
app.post("/api/log", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const {
      item_id,
      item_name,
      category,
      sub_category,
      store,
      shift,
      staff,
      quantity,
      expiry,
    } = req.body || {};

    if (!store || !shift || !staff) {
      return res.status(400).json({ error: "store, shift, staff are required" });
    }
    if (!item_id) {
      return res.status(400).json({ error: "item_id is required" });
    }
    if (!expiry) {
      return res.status(400).json({ error: "expiry is required" });
    }

    // Quantity: optional, blank allowed, 0 allowed
    let qtyToSave = null;
    if (quantity === 0) qtyToSave = 0;
    else if (quantity === "" || quantity === null || quantity === undefined) qtyToSave = null;
    else {
      const n = Number(quantity);
      qtyToSave = Number.isFinite(n) ? n : null;
    }

    const payload = {
      item_id,
      item_name: item_name || null,
      category: category || null,
      sub_category: sub_category || null,
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
app.get("/api/expiry", async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

    const store = String(req.query.store || "").trim();
    if (!store) return res.status(400).json({ error: "store is required" });

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: logs, error } = await supabase
      .from("stock_logs")
      .select("item_id,item_name,expiry,quantity,created_at")
      .eq("store", store)
      .not("expiry", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) return res.status(500).json({ error: error.message });

    const latestByItem = new Map();
    for (const row of logs || []) {
      if (!row.item_id) continue;
      if (!latestByItem.has(row.item_id)) latestByItem.set(row.item_id, row);
    }

    const alerts = [];
    for (const row of latestByItem.values()) {
      const exp = new Date(row.expiry);
      if (isNaN(exp.getTime())) continue;
      if (exp <= in24h) {
        alerts.push({
          item_id: row.item_id,
          name: row.item_name || "Item",
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

    const { data: logs, error } = await supabase
      .from("stock_logs")
      .select("item_id,item_name,quantity,created_at")
      .eq("store", store)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) return res.status(500).json({ error: error.message });

    const latestByItem = new Map();
    for (const row of logs || []) {
      if (!row.item_id) continue;
      if (!latestByItem.has(row.item_id)) latestByItem.set(row.item_id, row);
    }

    const low = [];
    for (const row of latestByItem.values()) {
      if (row.quantity === 0) {
        low.push({
          item_id: row.item_id,
          name: row.item_name || "Item",
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
