// server.js (FULL FILE — copy/paste top-to-bottom)
//
// What this includes:
// ✅ GET  /api/items                 -> loads from public.items
// ✅ POST /api/log                   -> saves to public.stock_logs
// ✅ GET  /api/expiry?store=...       -> expiry alerts for that store
// ✅ GET  /api/low_stock?store=...    -> low stock alerts for that store
// ✅ Serves /public and SPA catch-all
//
// REQUIRED ENV VARS on Render:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY   (recommended for server-side writes)
// (If you only have SUPABASE_ANON_KEY, it may fail depending on RLS.)

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// -------------------- Supabase --------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// -------------------- API routes (MUST stay above static catch-all) --------------------

// GET /api/items
// Returns: [{id,name,category,sub_category,shelf_life_days}, ...]
app.get("/api/items", async (req, res) => {
  try {
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
// Body expected from your app.js:
// {
//   item_id, item_name, category, sub_category,
//   store, shift, staff,
//   quantity (nullable), expiry (ISO string)
// }
app.post("/api/log", async (req, res) => {
  try {
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

    // Quantity rules: optional; allow null; allow 0; do not block save
    let qtyToSave = null;
    if (quantity === 0) qtyToSave = 0;
    else if (quantity === "" || quantity === null || quantity === undefined) qtyToSave = null;
    else {
      const n = Number(quantity);
      qtyToSave = Number.isFinite(n) ? n : null;
    }

    // Insert row into stock_logs
    // NOTE: This assumes your table has these columns.
    // If your column names differ, tell me and I’ll adjust once.
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

    const { data, error } = await supabase.from("stock_logs").insert(payload).select("*").single();
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to save log" });
  }
});

// GET /api/expiry?store=PDD|SKH
// Returns expiry alerts for items that are:
// - expired already, OR expiring within next 24 hours
//
// Assumptions:
// - stock_logs has: store, expiry (timestamp), created_at (timestamp)
// - expiry is stored as ISO string (timestamp) by the app
app.get("/api/expiry", async (req, res) => {
  try {
    const store = String(req.query.store || "").trim();
    if (!store) return res.status(400).json({ error: "store is required" });

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // We pull recent logs and filter in JS to avoid needing SQL/RPC.
    // If you have huge volume, we can optimize later.
    const { data: logs, error } = await supabase
      .from("stock_logs")
      .select("item_id,item_name,expiry,quantity,created_at")
      .eq("store", store)
      .not("expiry", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) return res.status(500).json({ error: error.message });

    // Take latest per item_id (so alerts reflect latest logged expiry)
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

    // Sort by soonest expiry first
    alerts.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

    return res.json(alerts);
  } catch (e) {
    return res.status(500).json({ error: e.message || "expiry failed" });
  }
});

// GET /api/low_stock?store=PDD|SKH
// Fastest working definition:
// - returns items whose LATEST logged quantity (for that store) is exactly 0
// - ignores items never logged
// - ignores logs where quantity is null
app.get("/api/low_stock", async (req, res) => {
  try {
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

    // newest first
    low.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json(low);
  } catch (e) {
    return res.status(500).json({ error: e.message || "low_stock failed" });
  }
});

// -------------------- Static + SPA catch-all --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve /public files (index.html, app.js, style.css, icons, manifest, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Always return index.html for the main app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
