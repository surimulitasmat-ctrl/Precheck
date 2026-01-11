// =========================
// PreCheck — server.js (FULL)
// Store-separated items + categories
// Soft delete for items/categories
// Manager login via PIN -> JWT
// =========================

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

// ---------- Config ----------
const PORT = process.env.PORT || 10000;

// Supabase / Postgres connection string (Render should have this env)
const DATABASE_URL = process.env.DATABASE_URL;

// Manager PIN (set in Render env)
const MANAGER_PIN = process.env.MANAGER_PIN || "1234";

// JWT secret (set in Render env)
const JWT_SECRET = process.env.JWT_SECRET || "change-me";

// ---------- Postgres ----------
if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL env");
}
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ---------- Helpers ----------
function mustStore(x) {
  const s = String(x || "").trim();
  if (!s) throw new Error("missing_store");
  return s;
}

function requireManager(req, res, next) {
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== "manager") {
      return res.status(401).json({ error: "unauthorized" });
    }

    req.manager = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "unauthorized" });
  }
}

// ---------- Health ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// =========================
// PUBLIC APIs (STAFF)
// =========================

// GET categories for store (active only)
app.get("/api/categories", async (req, res) => {
  try {
    const store = mustStore(req.query.store);

    const r = await query(
      `
      SELECT id, store, name, sort_order
      FROM public.categories
      WHERE store = $1
        AND is_active = TRUE
        AND deleted_at IS NULL
      ORDER BY sort_order ASC NULLS LAST, name ASC
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// GET items for store (active only)
app.get("/api/items", async (req, res) => {
  try {
    const store = mustStore(req.query.store);

    const r = await query(
      `
      SELECT id, store, name, category, sub_category, shelf_life_days
      FROM public.items
      WHERE store = $1
        AND is_active = TRUE
        AND deleted_at IS NULL
      ORDER BY category ASC, name ASC
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// POST log
app.post("/api/log", async (req, res) => {
  try {
    const b = req.body || {};

    const store = mustStore(b.store);
    const staff = String(b.staff || "").trim();
    const shift = String(b.shift || "").trim();
    const item_id = Number(b.item_id);

    if (!staff) return res.status(400).json({ error: "missing_staff" });
    if (!shift) return res.status(400).json({ error: "missing_shift" });
    if (!Number.isFinite(item_id)) return res.status(400).json({ error: "bad_item_id" });

    const quantity =
      b.quantity === null || b.quantity === undefined || b.quantity === ""
        ? null
        : Number(b.quantity);

    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      return res.status(400).json({ error: "bad_quantity" });
    }

    const expiry = b.expiry ? String(b.expiry).trim() : null; // date string
    const expiry_at = b.expiry_at ? String(b.expiry_at).trim() : null; // ISO datetime

    const category = String(b.category || "").trim() || null;
    const sub_category = b.sub_category ? String(b.sub_category).trim() : null;

    const r = await query(
      `
      INSERT INTO public.logs
        (store, staff, shift, item_id, item_name, category, sub_category, quantity, expiry, expiry_at, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id
      `,
      [
        store,
        staff,
        shift,
        item_id,
        String(b.item_name || "").trim() || null,
        category,
        sub_category,
        quantity,
        expiry,
        expiry_at,
      ]
    );

    res.json({ ok: true, id: r.rows[0]?.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "log_failed" });
  }
});

// GET expiry list for store (latest per item)
app.get("/api/expiry", async (req, res) => {
  try {
    const store = mustStore(req.query.store);

    // Latest log per item_id
    const r = await query(
      `
      SELECT DISTINCT ON (l.item_id)
        l.item_id,
        COALESCE(l.item_name, i.name) AS name,
        COALESCE(l.category, i.category) AS category,
        COALESCE(l.sub_category, i.sub_category) AS sub_category,
        CASE
          WHEN l.expiry_at IS NOT NULL THEN to_char(l.expiry_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
          WHEN l.expiry IS NOT NULL THEN l.expiry
          ELSE NULL
        END AS expiry_value,
        l.created_at
      FROM public.logs l
      LEFT JOIN public.items i ON i.id = l.item_id
      WHERE l.store = $1
      ORDER BY l.item_id, l.created_at DESC
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// =========================
// MANAGER AUTH
// =========================

app.post("/api/manager/login", async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (!pin) return res.status(400).json({ error: "missing_pin" });
  if (pin !== MANAGER_PIN) return res.status(401).json({ error: "invalid_pin" });

  const token = jwt.sign({ role: "manager" }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ ok: true, token });
});

// =========================
// MANAGER ITEMS (Store-separated)
// =========================

// GET /api/manager/items?store=PDD
app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = mustStore(req.query.store);

    const r = await query(
      `
      SELECT id, store, name, category, sub_category, shelf_life_days, is_active, deleted_at
      FROM public.items
      WHERE store = $1
      ORDER BY (deleted_at IS NOT NULL) ASC, is_active DESC, category ASC, name ASC
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// POST /api/manager/items  {store, name, category, sub_category, shelf_life_days}
app.post("/api/manager/items", requireManager, async (req, res) => {
  try {
    const b = req.body || {};
    const store = mustStore(b.store);
    const name = String(b.name || "").trim();
    const category = String(b.category || "").trim();
    const sub_category = b.sub_category ? String(b.sub_category).trim() : null;
    const shelf_life_days = Number(b.shelf_life_days ?? 0);

    if (!name) return res.status(400).json({ error: "missing_name" });
    if (!category) return res.status(400).json({ error: "missing_category" });
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0)
      return res.status(400).json({ error: "bad_shelf_life_days" });

    // store-separated unique
    const r = await query(
      `
      INSERT INTO public.items (store, name, category, sub_category, shelf_life_days, is_active, deleted_at)
      VALUES ($1,$2,$3,$4,$5, TRUE, NULL)
      ON CONFLICT (store, name)
      DO UPDATE SET
        category = EXCLUDED.category,
        sub_category = EXCLUDED.sub_category,
        shelf_life_days = EXCLUDED.shelf_life_days,
        is_active = TRUE,
        deleted_at = NULL
      RETURNING *
      `,
      [store, name, category, sub_category, shelf_life_days]
    );

    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "manager_item_add_failed", detail: String(e.message || e) });
  }
});

// PATCH /api/manager/items/:id  {store, category, sub_category, shelf_life_days}
app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const store = mustStore(b.store);

    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const category = b.category != null ? String(b.category).trim() : null;
    const sub_category = b.sub_category != null ? String(b.sub_category).trim() || null : null;
    const shelf_life_days = b.shelf_life_days != null ? Number(b.shelf_life_days) : null;

    if (shelf_life_days != null && (!Number.isFinite(shelf_life_days) || shelf_life_days < 0)) {
      return res.status(400).json({ error: "bad_shelf_life_days" });
    }

    const r = await query(
      `
      UPDATE public.items
      SET category = COALESCE($3, category),
          sub_category = $4,
          shelf_life_days = COALESCE($5, shelf_life_days)
      WHERE id = $1 AND store = $2
      RETURNING *
      `,
      [id, store, category, sub_category, shelf_life_days]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "manager_item_update_failed", detail: String(e.message || e) });
  }
});

// DELETE /api/manager/items/:id?store=PDD  (soft delete)
app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const store = mustStore(req.query.store);

    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const r = await query(
      `
      UPDATE public.items
      SET is_active = FALSE,
          deleted_at = NOW()
      WHERE id = $1 AND store = $2
      RETURNING *
      `,
      [id, store]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "manager_item_delete_failed", detail: String(e.message || e) });
  }
});

// =========================
// MANAGER CATEGORIES (Store-separated)
// =========================

// GET /api/manager/categories?store=PDD
app.get("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const store = mustStore(req.query.store);

    const r = await query(
      `
      SELECT id, store, name, sort_order, is_active, deleted_at
      FROM public.categories
      WHERE store = $1
      ORDER BY (deleted_at IS NOT NULL) ASC, is_active DESC, sort_order ASC NULLS LAST, name ASC
      `,
      [store]
    );

    res.json(r.rows);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// POST /api/manager/categories  {store, name, sort_order}
app.post("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const b = req.body || {};
    const store = mustStore(b.store);
    const name = String(b.name || "").trim();
    const sort_order = Number(b.sort_order ?? 100);

    if (!name) return res.status(400).json({ error: "missing_name" });
    if (!Number.isFinite(sort_order)) return res.status(400).json({ error: "bad_sort_order" });

    const r = await query(
      `
      INSERT INTO public.categories (store, name, sort_order, is_active, deleted_at)
      VALUES ($1,$2,$3, TRUE, NULL)
      ON CONFLICT (store, name)
      DO UPDATE SET
        sort_order = EXCLUDED.sort_order,
        is_active = TRUE,
        deleted_at = NULL
      RETURNING *
      `,
      [store, name, sort_order]
    );

    res.json({ ok: true, category: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "manager_category_add_failed", detail: String(e.message || e) });
  }
});

// PATCH /api/manager/categories/:id  {store, name, sort_order}
app.patch("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const store = mustStore(b.store);

    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const name = b.name != null ? String(b.name).trim() : null;
    const sort_order = b.sort_order != null ? Number(b.sort_order) : null;

    if (sort_order != null && !Number.isFinite(sort_order))
      return res.status(400).json({ error: "bad_sort_order" });

    const r = await query(
      `
      UPDATE public.categories
      SET name = COALESCE($3, name),
          sort_order = COALESCE($4, sort_order)
      WHERE id = $1 AND store = $2
      RETURNING *
      `,
      [id, store, name, sort_order]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, category: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "manager_category_update_failed", detail: String(e.message || e) });
  }
});

// DELETE /api/manager/categories/:id?store=PDD (soft delete)
app.delete("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const store = mustStore(req.query.store);

    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

    const r = await query(
      `
      UPDATE public.categories
      SET is_active = FALSE,
          deleted_at = NOW()
      WHERE id = $1 AND store = $2
      RETURNING *
      `,
      [id, store]
    );

    if (!r.rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, category: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: "manager_category_delete_failed", detail: String(e.message || e) });
  }
});

// =========================
// STATIC FILES
// =========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("✅ Server running on", PORT));
