// server.js (ESM)
import express from "express";
import path from "path";
import crypto from "crypto";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const app = express();
app.use(express.json());

// -------------------- Paths (ESM) --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- DB --------------------
if (!process.env.DATABASE_URL) console.error("Missing DATABASE_URL");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Cache table columns to support schema changes safely
let STOCK_LOGS_COLS = null;
async function getCols(tableName) {
  const r = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [tableName]
  );
  return new Set(r.rows.map((x) => x.column_name));
}
async function getStockLogsCols() {
  if (STOCK_LOGS_COLS) return STOCK_LOGS_COLS;
  STOCK_LOGS_COLS = await getCols("stock_logs");
  return STOCK_LOGS_COLS;
}

let ITEMS_COLS = null;
async function getItemsCols() {
  if (ITEMS_COLS) return ITEMS_COLS;
  ITEMS_COLS = await getCols("items");
  return ITEMS_COLS;
}

// -------------------- Manager Token (stateless HMAC) --------------------
function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function signToken(payloadObj) {
  const secret = process.env.MANAGER_TOKEN_SECRET || "dev_secret_change_me";
  const payload = base64url(JSON.stringify(payloadObj));
  const sig = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  try {
    const secret = process.env.MANAGER_TOKEN_SECRET || "dev_secret_change_me";
    const [payload, sig] = (token || "").split(".");
    if (!payload || !sig) return null;

    const expected = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
    if (expected !== sig) return null;

    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}
function requireManager(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const obj = verifyToken(token);
  if (!obj) return res.status(401).json({ error: "unauthorized" });
  req.manager = obj;
  next();
}

// -------------------- Health --------------------
app.get("/health", (req, res) => res.send("ok"));

// -------------------- PUBLIC APIs --------------------

// GET /api/categories
// Used by app home menu (if you later switch app.js to fetch categories)
app.get("/api/categories", async (req, res) => {
  try {
    const r = await query(
      `
      SELECT id, name, sort_order, active
      FROM public.categories
      WHERE (deleted_at IS NULL) AND active = true
      ORDER BY sort_order ASC, name ASC
      `,
      []
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "categories_failed" });
  }
});

// GET /api/items  (respect soft delete if columns exist)
app.get("/api/items", async (req, res) => {
  try {
    const cols = await getItemsCols();
    const where = [];
    if (cols.has("deleted_at")) where.push("deleted_at IS NULL");
    if (cols.has("active")) where.push("active = true");
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const r = await query(
      `
      SELECT id, name, category, sub_category, shelf_life_days
      FROM public.items
      ${whereSql}
      ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC
      `,
      []
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "items_failed" });
  }
});

// POST /api/log  (insert only columns that exist)
app.post("/api/log", async (req, res) => {
  try {
    const cols = await getStockLogsCols();
    const body = req.body || {};

    const row = {
      item_id: body.item_id ?? body.itemId ?? null,
      item_name: body.item_name ?? body.itemName ?? null,
      category: body.category ?? null,
      sub_category: body.sub_category ?? body.subCategory ?? null,
      store: body.store ?? null,
      staff: body.staff ?? null,
      shift: body.shift ?? null,
      qty: body.qty ?? body.quantity ?? null,
      quantity: body.quantity ?? body.qty ?? null,
      expiry_at: body.expiry_at ?? body.expiryAt ?? null,
      expiry: body.expiry ?? null,
      created_at: body.created_at ?? null,
    };

    const insertCols = [];
    const insertVals = [];
    const params = [];

    Object.entries(row).forEach(([k, v]) => {
      if (v === undefined) return;
      if (!cols.has(k)) return;
      insertCols.push(k);
      params.push(v);
      insertVals.push(`$${params.length}`);
    });

    if (!insertCols.length) return res.status(400).json({ error: "no_valid_columns_to_insert" });

    const sql = `INSERT INTO public.stock_logs (${insertCols.join(",")})
                 VALUES (${insertVals.join(",")})
                 RETURNING *`;
    const r = await query(sql, params);
    res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "log_failed", detail: String(e.message || e) });
  }
});

// GET /api/expiry?store=PDD
app.get("/api/expiry", async (req, res) => {
  try {
    const store = String(req.query.store || "");
    if (!store) return res.status(400).json({ error: "missing_store" });

    const r = await query(
      `
      WITH latest AS (
        SELECT DISTINCT ON (item_id)
          item_id, expiry_at, expiry, created_at, store
        FROM public.stock_logs
        WHERE store = $1
        ORDER BY item_id, created_at DESC NULLS LAST
      )
      SELECT i.id, i.name, i.category, i.sub_category,
             COALESCE(l.expiry_at::text, l.expiry::text) AS expiry_value
      FROM public.items i
      JOIN latest l ON l.item_id = i.id
      ORDER BY i.category, i.sub_category NULLS FIRST, i.name
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "expiry_failed" });
  }
});

// -------------------- MANAGER APIs --------------------

// POST /api/manager/login  { pin: "8686", store: "PDD" | "SKH" }
app.post("/api/manager/login", (req, res) => {
  const pin = String((req.body && req.body.pin) || "");
  const store = String((req.body && req.body.store) || "").toUpperCase();

  const expected = String(process.env.MANAGER_PIN || "");
  if (!expected) return res.status(500).json({ error: "MANAGER_PIN_not_set" });

  if (pin !== expected) return res.status(401).json({ error: "invalid_pin" });

  if (store !== "PDD" && store !== "SKH") {
    return res.status(400).json({ error: "invalid_store" });
  }

  const token = signToken({
    role: "manager",
    store, // ✅ bind manager to ONE store
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  });

  res.json({ ok: true, token });
});

// POST manager item (create) — store comes from token
app.post("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const { name, category, sub_category, shelf_life_days } = req.body || {};

    const cleanName = String(name || "").trim();
    const cleanCategory = String(category || "").trim();
    const cleanSub = sub_category === null || sub_category === undefined ? null : String(sub_category).trim();
    const sl = Number(shelf_life_days);

    if (!cleanName) return res.status(400).json({ error: "name_required" });
    if (!cleanCategory) return res.status(400).json({ error: "category_required" });
    if (!Number.isFinite(sl) || sl < 0) return res.status(400).json({ error: "invalid_shelf_life" });

    // Rule: if category != Sauce => sub_category must be null
    const finalSub = cleanCategory.toLowerCase() === "sauce" ? cleanSub : null;

    const r = await query(
      `
      INSERT INTO public.items (name, category, sub_category, shelf_life_days, store, is_active, deleted_at)
      VALUES ($1, $2, $3, $4, $5, true, NULL)
      RETURNING *
      `,
      [cleanName, cleanCategory, finalSub, sl, store]
    );

    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_create_failed" });
  }
});

// DELETE manager item (SOFT DELETE) — store comes from token
app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    const r = await query(
      `
      UPDATE public.items
      SET is_active = false,
          deleted_at = now()
      WHERE id = $1
        AND store = $2
        AND is_active = true
      RETURNING *
      `,
      [id, store]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });

    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_delete_failed" });
  }
});

// ----- Manager: Categories -----

// GET /api/manager/categories
app.get("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const r = await query(
      `
      SELECT id, name, sort_order, active, deleted_at
      FROM public.categories
      ORDER BY sort_order ASC, name ASC
      `,
      []
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_categories_failed" });
  }
});

// POST /api/manager/categories
app.post("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const sort_order = Number(req.body?.sort_order ?? 0);

    if (!name) return res.status(400).json({ error: "name_required" });
    if (!Number.isFinite(sort_order)) return res.status(400).json({ error: "bad_sort_order" });

    const r = await query(
      `
      INSERT INTO public.categories (name, sort_order, active)
      VALUES ($1, $2, true)
      ON CONFLICT (name)
      DO UPDATE SET deleted_at = NULL, active = true
      RETURNING *
      `,
      [name, sort_order]
    );

    res.json({ ok: true, category: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_categories_create_failed" });
  }
});

// PATCH /api/manager/categories/:id
app.patch("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    const sort_order = req.body?.sort_order != null ? Number(req.body.sort_order) : null;
    const active = req.body?.active != null ? !!req.body.active : null;

    const r = await query(
      `
      UPDATE public.categories
      SET name = COALESCE($2, name),
          sort_order = COALESCE($3, sort_order),
          active = COALESCE($4, active)
      WHERE id = $1
      RETURNING *
      `,
      [id, name, Number.isFinite(sort_order) ? sort_order : null, active]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, category: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_categories_update_failed" });
  }
});

// DELETE /api/manager/categories/:id
// default = SOFT delete (sets deleted_at, active=false)
// hard = true -> actually DELETE row
app.delete("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const hard = String(req.query.hard || "") === "1";

    if (hard) {
      await query(`DELETE FROM public.categories WHERE id = $1`, [id]);
      return res.json({ ok: true, hard_deleted: true });
    }

    const r = await query(
      `
      UPDATE public.categories
      SET deleted_at = NOW(), active = false
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, category: r.rows[0], soft_deleted: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_categories_delete_failed" });
  }
});

// ----- Manager: Items -----

// GET manager items (ONLY this manager's store, ONLY active)
app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;

    const r = await query(
      `SELECT id, name, category, sub_category, shelf_life_days, store, is_active, deleted_at
       FROM public.items
       WHERE store = $1
         AND is_active = true
         AND deleted_at IS NULL
       ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC`,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_failed" });
  }
});


// PATCH manager item
app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, category, sub_category, shelf_life_days } = req.body || {};

    const r = await query(
      `
      UPDATE public.items
      SET name = COALESCE($2, name),
          category = COALESCE($3, category),
          sub_category = $4,
          shelf_life_days = COALESCE($5, shelf_life_days)
      WHERE id = $1
      RETURNING *
      `,
      [id, name ?? null, category ?? null, sub_category ?? null, shelf_life_days ?? null]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_update_failed" });
  }
});

// POST manager item (Manager-only Add Item)
app.post("/api/manager/items", requireManager, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const category = String(req.body?.category || "").trim();
    const sub_category = req.body?.sub_category != null ? String(req.body.sub_category).trim() : null;
    const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);

    if (!name) return res.status(400).json({ error: "name_required" });
    if (!category) return res.status(400).json({ error: "category_required" });
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
      return res.status(400).json({ error: "bad_shelf_life_days" });
    }

    const r = await query(
      `
      INSERT INTO public.items (name, category, sub_category, shelf_life_days)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [name, category, sub_category || null, shelf_life_days]
    );

    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_create_failed" });
  }
});

// DELETE manager item
// default = SOFT delete if columns exist (active/deleted_at), else HARD delete
// hard=1 forces hard delete
app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const hard = String(req.query.hard || "") === "1";
    const cols = await getItemsCols();
    const canSoft = cols.has("deleted_at") && cols.has("active");

    if (!hard && canSoft) {
      const r = await query(
        `UPDATE public.items SET deleted_at = NOW(), active = false WHERE id = $1 RETURNING *`,
        [id]
      );
      if (!r.rows.length) return res.status(404).json({ error: "not_found" });
      return res.json({ ok: true, item: r.rows[0], soft_deleted: true });
    }

    await query(`DELETE FROM public.items WHERE id = $1`, [id]);
    res.json({ ok: true, hard_deleted: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_delete_failed" });
  }
});

// -------------------- Static hosting --------------------
app.use(express.static(path.join(__dirname, "public")));

// Always return index.html for SPA routes (keep last)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("PreCheck running on port", PORT));
