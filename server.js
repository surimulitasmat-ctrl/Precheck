// server.js (ESM) — PreCheck (Store-separated PDD/SKH) + Manager + Soft Delete
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

// -------------------- Column cache (schema-safe) --------------------
const COL_CACHE = new Map(); // tableName -> Set(columns)

async function getCols(tableName) {
  if (COL_CACHE.has(tableName)) return COL_CACHE.get(tableName);

  const r = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [tableName]
  );

  const set = new Set(r.rows.map((x) => x.column_name));
  COL_CACHE.set(tableName, set);
  return set;
}

// -------------------- Helpers --------------------
function normalizeStore(s) {
  const v = String(s || "").trim().toUpperCase();
  if (v !== "PDD" && v !== "SKH") return "";
  return v;
}

// -------------------- Manager Token (stateless HMAC) --------------------
function base64url(input) {
  return Buffer.from(input)
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
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;

    const expected = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
    if (expected !== sig) return null;

    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const obj = JSON.parse(json);

    if (obj.exp && Date.now() > obj.exp) return null;
    if (obj.role !== "manager") return null;

    const store = normalizeStore(obj.store);
    if (!store) return null;

    return { ...obj, store };
  } catch {
    return null;
  }
}

function requireManager(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const obj = verifyToken(token);
  if (!obj) return res.status(401).json({ error: "unauthorized" });
  req.manager = obj;
  next();
}

// -------------------- Health --------------------
app.get("/health", (req, res) => res.send("ok"));

// =====================================================================
// PUBLIC APIs (STAFF)
// =====================================================================

// GET /api/categories?store=PDD
// Returns categories for store if categories table has store column, else returns global categories.
app.get("/api/categories", async (req, res) => {
  try {
    const store = normalizeStore(req.query.store);
    if (!store) return res.status(400).json({ error: "invalid_store" });

    const cols = await getCols("categories");
    const where = [];
    const params = [];

    if (cols.has("store")) {
      params.push(store);
      where.push(`store = $${params.length}`);
    }
    if (cols.has("deleted_at")) where.push("deleted_at IS NULL");
    if (cols.has("active")) where.push("active = true");

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const r = await query(
      `
      SELECT id, name, sort_order, active
      FROM public.categories
      ${whereSql}
      ORDER BY sort_order ASC NULLS LAST, name ASC
      `,
      params
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "categories_failed" });
  }
});

// GET /api/items?store=PDD  (STORE separated)
app.get("/api/items", async (req, res) => {
  try {
    const store = normalizeStore(req.query.store);
    if (!store) return res.status(400).json({ error: "invalid_store" });

    const cols = await getCols("items");
    const where = [];
    const params = [];

    // store separation
    if (cols.has("store")) {
      params.push(store);
      where.push(`store = $${params.length}`);
    } else {
      // store column missing => cannot separate
      return res.status(500).json({ error: "items_table_missing_store_column" });
    }

    // soft delete (support either active OR is_active)
    if (cols.has("deleted_at")) where.push("deleted_at IS NULL");
    if (cols.has("is_active")) where.push("is_active = true");
    else if (cols.has("active")) where.push("active = true");

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const r = await query(
      `
      SELECT id, name, category, sub_category, shelf_life_days
      FROM public.items
      ${whereSql}
      ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC
      `,
      params
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
    const cols = await getCols("stock_logs");
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
    const store = normalizeStore(req.query.store);
    if (!store) return res.status(400).json({ error: "invalid_store" });

    const itemsCols = await getCols("items");
    if (!itemsCols.has("store")) return res.status(500).json({ error: "items_table_missing_store_column" });

    // Only show items for this store AND not deleted
    const itemWhere = [`i.store = $1`];
    if (itemsCols.has("deleted_at")) itemWhere.push("i.deleted_at IS NULL");
    if (itemsCols.has("is_active")) itemWhere.push("i.is_active = true");
    else if (itemsCols.has("active")) itemWhere.push("i.active = true");

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
      WHERE ${itemWhere.join(" AND ")}
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

// =====================================================================
// MANAGER APIs (STORE-BINDED)
// =====================================================================

// POST /api/manager/login  { pin: "8686", store: "PDD" | "SKH" }
app.post("/api/manager/login", (req, res) => {
  const pin = String(req.body?.pin || "");
  const store = normalizeStore(req.body?.store);

  const expected = String(process.env.MANAGER_PIN || "");
  if (!expected) return res.status(500).json({ error: "MANAGER_PIN_not_set" });
  if (!store) return res.status(400).json({ error: "invalid_store" });
  if (pin !== expected) return res.status(401).json({ error: "invalid_pin" });

  const token = signToken({
    role: "manager",
    store, // ✅ lock token to store
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  });

  res.json({ ok: true, token });
});

// -------------------- Manager: Categories (soft delete) --------------------
// NOTE: store separation for categories needs categories.store column.
// If categories has no store, categories are global.

app.get("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const cols = await getCols("categories");

    const where = [];
    const params = [];

    if (cols.has("store")) {
      params.push(store);
      where.push(`store = $${params.length}`);
    }
    // Manager should see active ones (not deleted). Keep it clean.
    if (cols.has("deleted_at")) where.push("deleted_at IS NULL");

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const r = await query(
      `
      SELECT id, name, sort_order, active, deleted_at
      FROM public.categories
      ${whereSql}
      ORDER BY sort_order ASC NULLS LAST, name ASC
      `,
      params
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_categories_failed" });
  }
});

app.post("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const cols = await getCols("categories");

    const name = String(req.body?.name || "").trim();
    const sort_order = Number(req.body?.sort_order ?? 0);

    if (!name) return res.status(400).json({ error: "name_required" });
    if (!Number.isFinite(sort_order)) return res.status(400).json({ error: "bad_sort_order" });

    if (cols.has("store")) {
      // store-separated categories
      const r = await query(
        `
        INSERT INTO public.categories (name, sort_order, active, deleted_at, store)
        VALUES ($1, $2, true, NULL, $3)
        RETURNING *
        `,
        [name, sort_order, store]
      );
      return res.json({ ok: true, category: r.rows[0] });
    }

    // global categories fallback
    const r = await query(
      `
      INSERT INTO public.categories (name, sort_order, active, deleted_at)
      VALUES ($1, $2, true, NULL)
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

app.delete("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const cols = await getCols("categories");

    if (cols.has("store")) {
      // soft delete + store guard
      const r = await query(
        `
        UPDATE public.categories
        SET deleted_at = NOW(), active = false
        WHERE id = $1 AND store = $2
        RETURNING *
        `,
        [id, store]
      );
      if (!r.rows.length) return res.status(404).json({ error: "not_found" });
      return res.json({ ok: true, category: r.rows[0], soft_deleted: true });
    }

    // global fallback (no store)
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

// -------------------- Manager: Items (store-separated + soft delete) --------------------

app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const cols = await getCols("items");

    if (!cols.has("store")) return res.status(500).json({ error: "items_table_missing_store_column" });

    const where = [`store = $1`];
    if (cols.has("deleted_at")) where.push("deleted_at IS NULL");
    if (cols.has("is_active")) where.push("is_active = true");
    else if (cols.has("active")) where.push("active = true");

    const r = await query(
      `
      SELECT id, name, category, sub_category, shelf_life_days, store
      FROM public.items
      WHERE ${where.join(" AND ")}
      ORDER BY category ASC, sub_category ASC NULLS FIRST, name ASC
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_failed" });
  }
});

app.post("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const cols = await getCols("items");

    if (!cols.has("store")) return res.status(500).json({ error: "items_table_missing_store_column" });

    const name = String(req.body?.name || "").trim();
    const category = String(req.body?.category || "").trim();
    const sub_category =
      req.body?.sub_category === null || req.body?.sub_category === undefined
        ? null
        : String(req.body.sub_category).trim();
    const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);

    if (!name) return res.status(400).json({ error: "name_required" });
    if (!category) return res.status(400).json({ error: "category_required" });
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) {
      return res.status(400).json({ error: "bad_shelf_life_days" });
    }

    // enforce: if category != Sauce => sub_category null
    const finalSub = category.toLowerCase() === "sauce" ? (sub_category || null) : null;

    // soft-delete columns supported: deleted_at + is_active/active
    const hasDeletedAt = cols.has("deleted_at");
    const hasIsActive = cols.has("is_active");
    const hasActive = cols.has("active");

    const fields = ["name", "category", "sub_category", "shelf_life_days", "store"];
    const values = [name, category, finalSub, shelf_life_days, store];
    const ph = values.map((_, i) => `$${i + 1}`);

    if (hasIsActive) {
      fields.push("is_active");
      values.push(true);
      ph.push(`$${values.length}`);
    } else if (hasActive) {
      fields.push("active");
      values.push(true);
      ph.push(`$${values.length}`);
    }

    if (hasDeletedAt) {
      fields.push("deleted_at");
      values.push(null);
      ph.push(`$${values.length}`);
    }

    const r = await query(
      `
      INSERT INTO public.items (${fields.join(", ")})
      VALUES (${ph.join(", ")})
      RETURNING *
      `,
      values
    );

    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_items_create_failed" });
  }
});

app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const cols = await getCols("items");
    if (!cols.has("store")) return res.status(500).json({ error: "items_table_missing_store_column" });

    const category = req.body?.category != null ? String(req.body.category).trim() : null;
    const sub_category = req.body?.sub_category != null ? String(req.body.sub_category).trim() : null;
    const shelf_life_days = req.body?.shelf_life_days != null ? Number(req.body.shelf_life_days) : null;

    if (shelf_life_days != null && (!Number.isFinite(shelf_life_days) || shelf_life_days < 0)) {
      return res.status(400).json({ error: "bad_shelf_life_days" });
    }

    const finalSub = category && category.toLowerCase() === "sauce" ? (sub_category || null) : null;

    const r = await query(
      `
      UPDATE public.items
      SET category = COALESCE($3, category),
          sub_category = $4,
          shelf_life_days = COALESCE($5, shelf_life_days)
      WHERE id = $1 AND store = $2
      RETURNING *
      `,
      [id, store, category, finalSub, shelf_life_days]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_update_failed" });
  }
});

// SOFT delete item for THIS store
app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = req.manager.store;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const cols = await getCols("items");
    if (!cols.has("store")) return res.status(500).json({ error: "items_table_missing_store_column" });

    const sets = [];
    const params = [id, store];

    if (cols.has("deleted_at")) sets.push("deleted_at = NOW()");
    if (cols.has("is_active")) sets.push("is_active = false");
    else if (cols.has("active")) sets.push("active = false");

    if (!sets.length) {
      // no soft delete columns -> hard delete (but still store-safe)
      await query(`DELETE FROM public.items WHERE id = $1 AND store = $2`, [id, store]);
      return res.json({ ok: true, hard_deleted: true });
    }

    const r = await query(
      `
      UPDATE public.items
      SET ${sets.join(", ")}
      WHERE id = $1 AND store = $2
      RETURNING *
      `,
      params
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0], soft_deleted: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "manager_delete_failed" });
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
