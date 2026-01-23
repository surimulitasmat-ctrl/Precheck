// =========================
// PreCheck — server.js (FULL / CLEAN)
// =========================

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import jwt from "jsonwebtoken";

const { Pool } = pg;

const app = express();
app.use(express.json());

// -------- Config --------
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-now";
const MANAGER_PIN = process.env.MANAGER_PIN || "1234";

// ✅ Day boundary timezone (Singapore)
const DAY_TZ = process.env.DAY_TZ || "Asia/Singapore";

if (!DATABASE_URL) console.error("❌ Missing DATABASE_URL env var");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function q(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

function normStore(s) {
  const t = String(s || "").trim().toUpperCase();
  return t === "PDD" || t === "SKH" ? t : "";
}

function err(res, code, message) {
  res.status(code).json({ error: message });
}

function requireManager(req, res, next) {
  try {
    const h = String(req.headers.authorization || "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return err(res, 401, "Unauthorized");
    const decoded = jwt.verify(token, JWT_SECRET);
    req.manager = decoded;
    next();
  } catch {
    return err(res, 401, "Unauthorized");
  }
}

// -------- Static files (public/) --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// -------- Category mapping (DB vs UI) --------
// DB keeps "Back counter", UI shows "Fountain Drinks"
function uiCategoryFromDb(cat) {
  const c = String(cat || "").trim();
  if (c.toLowerCase() === "back counter") return "Fountain Drinks";
  return c;
}
function dbCategoryFromUi(cat) {
  const c = String(cat || "").trim();
  if (c.toLowerCase() === "fountain drinks") return "Back counter";
  return c;
}

// -------- Daily "done" marker (SG day) --------
async function markDoneSG(store, staff, shift) {
  if (!store) return;
  const who = String(staff || "").trim() || null;
  const sh = String(shift || "").trim().toUpperCase() === "PM" ? "PM" : "AM";

  await q(
    `
    insert into public.daily_status (store, day_key, shift, last_saved_at, last_saved_by)
    values ($1, (now() at time zone $4)::date, $3, now(), $2)
    on conflict (store, day_key, shift)
    do update set last_saved_at=excluded.last_saved_at, last_saved_by=excluded.last_saved_by
    `,
    [store, who, sh, DAY_TZ]
  );
}

// =========================
// Health
// =========================
app.get("/api/health", async (req, res) => {
  try {
    await q("select 1 as ok", []);
    res.json({ ok: true, day_tz: DAY_TZ });
  } catch (e) {
    err(res, 500, e?.message || "db error");
  }
});

// =========================
// Status (Summary indicator) — CROSS DEVICE ✅
// Returns: { AM: {...}, PM: {...} }
// includes last_item_name + total_rows for today SG day ✅
// =========================
app.get("/api/status", async (req, res) => {
  try {
    const store = normStore(req.query.store);
    if (!store) return err(res, 400, "Invalid store");

    // daily_status base
    const base = await q(
      `
      select store, day_key, shift, last_saved_at, last_saved_by
      from public.daily_status
      where store=$1 and day_key=(now() at time zone $2)::date
      order by shift asc
      `,
      [store, DAY_TZ]
    );

    // logs summary for today (per shift): count + last item
    const logs = await q(
      `
      with today_logs as (
        select *
        from public.logs
        where store=$1
          and (created_at at time zone $2)::date = (now() at time zone $2)::date
      ),
      per_shift as (
        select
          shift,
          count(*)::int as total_rows
        from today_logs
        group by shift
      ),
      last_item as (
        select distinct on (shift)
          shift,
          item_name as last_item_name
        from today_logs
        order by shift, created_at desc
      )
      select
        coalesce(p.shift, l.shift) as shift,
        coalesce(p.total_rows, 0) as total_rows,
        coalesce(l.last_item_name, '') as last_item_name
      from per_shift p
      full join last_item l on l.shift = p.shift
      `,
      [store, DAY_TZ]
    );

    const shiftExtra = new Map();
    for (const r of logs.rows) {
      const sh = String(r.shift || "").toUpperCase();
      if (!sh) continue;
      shiftExtra.set(sh, {
        total_rows: Number(r.total_rows || 0),
        last_item_name: String(r.last_item_name || ""),
      });
    }

    const out = { AM: null, PM: null };
    for (const row of base.rows) {
      const sh = String(row.shift || "").toUpperCase();
      const extra = shiftExtra.get(sh) || { total_rows: 0, last_item_name: "" };
      const merged = { ...row, ...extra };
      if (sh === "AM") out.AM = merged;
      if (sh === "PM") out.PM = merged;
    }

    // If no daily_status yet, still return logs-based info (so cross device works even if you didn’t markDone)
    // But your /api/log already calls markDoneSG, so usually daily_status exists.
    if (!out.AM && shiftExtra.has("AM")) {
      out.AM = {
        store,
        day_key: null,
        shift: "AM",
        last_saved_at: null,
        last_saved_by: null,
        ...shiftExtra.get("AM"),
      };
    }
    if (!out.PM && shiftExtra.has("PM")) {
      out.PM = {
        store,
        day_key: null,
        shift: "PM",
        last_saved_at: null,
        last_saved_by: null,
        ...shiftExtra.get("PM"),
      };
    }

    res.json(out);
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// Optional: allow frontend to mark done explicitly if you want
app.post("/api/status/mark-done", async (req, res) => {
  try {
    const store = normStore(req.body?.store);
    if (!store) return err(res, 400, "Invalid store");
    const staff = String(req.body?.staff || "").trim();
    const shift = String(req.body?.shift || "AM").trim();
    await markDoneSG(store, staff, shift);
    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// =========================
// Public APIs (Staff)
// =========================

// List categories for store (active)
app.get("/api/categories", async (req, res) => {
  try {
    const store = normStore(req.query.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      select id, store, name, sort_order
      from public.categories
      where store=$1 and deleted_at is null and is_active=true
      order by sort_order asc, name asc
      `,
      [store]
    );

    res.json(r.rows.map((x) => ({ ...x, name: uiCategoryFromDb(x.name) })));
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// List items for store (active)
app.get("/api/items", async (req, res) => {
  try {
    const store = normStore(req.query.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      select
        id, store, name, category, sub_category,
        shelf_life_days, is_hourly,
        stock_alert_enabled, stock_min
      from public.items
      where store=$1 and deleted_at is null and is_active=true
      order by category asc, name asc
      `,
      [store]
    );

    res.json(
      r.rows.map((x) => ({
        ...x,
        category: uiCategoryFromDb(x.category),
        sub_category: x.sub_category,
        is_hourly: !!x.is_hourly,
        stock_alert_enabled: !!x.stock_alert_enabled,
        stock_min: x.stock_min == null ? null : Number(x.stock_min),
      }))
    );
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// ---------- Single log save: /api/log ----------
app.post("/api/log", async (req, res) => {
  try {
    const r = req.body || {};
    const store = normStore(r.store);
    if (!store) return err(res, 400, "Invalid store");

    const staff = String(r.staff || "").trim();
    const shift = String(r.shift || "").trim();

    const item_id = r.item_id ?? null;
    const item_name = String(r.item_name || r.item || "").trim();
    const category = dbCategoryFromUi(String(r.category || "").trim());
    const sub_category = r.sub_category ? String(r.sub_category) : null;

    const quantity = r.quantity == null ? null : Number(r.quantity);
    const expiry = r.expiry ? String(r.expiry).slice(0, 10) : null;
    const expiry_at = r.expiry_at ? String(r.expiry_at) : null;

    // ✅ Add Date (2nd batch)
    const quantity2 = r.quantity2 == null ? null : Number(r.quantity2);
    const expiry2 = r.expiry2 ? String(r.expiry2).slice(0, 10) : null;
    const expiry2_at = r.expiry2_at ? String(r.expiry2_at) : null;

    if (!staff || !shift) return err(res, 400, "Missing staff/shift");
    if (!item_name || !category) return err(res, 400, "Missing item/category");
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0))
      return err(res, 400, "Invalid quantity");
    if (quantity2 != null && (!Number.isFinite(quantity2) || quantity2 < 0))
      return err(res, 400, "Invalid quantity2");

    await q(
      `
      insert into public.logs
      (store, staff, shift, item_id, item_name, category, sub_category,
       quantity, expiry, expiry_at,
       quantity2, expiry2, expiry2_at,
       created_at)
      values
      ($1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,
       $11,$12,$13,
       now())
      `,
      [
        store,
        staff,
        shift,
        item_id,
        item_name,
        category,
        sub_category,
        quantity,
        expiry,
        expiry_at,
        quantity2,
        expiry2,
        expiry2_at,
      ]
    );

    await markDoneSG(store, staff, shift);

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// ---------- Batch log save: /api/log/batch ----------
app.post("/api/log/batch", async (req, res) => {
  try {
    const body = req.body || {};
    const store = normStore(body.store);
    if (!store) return err(res, 400, "Invalid store");

    const staff = String(body.staff || "").trim();
    const shift = String(body.shift || "").trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!staff || !shift) return err(res, 400, "Missing staff/shift");
    if (!rows.length) return err(res, 400, "No rows");

    for (const r of rows) {
      const item_id = r.item_id ?? null;
      const item_name = String(r.item_name || r.item || "").trim();
      const category = dbCategoryFromUi(String(r.category || "").trim());
      const sub_category = r.sub_category ? String(r.sub_category) : null;

      const quantity = r.quantity == null ? null : Number(r.quantity);
      const expiry = r.expiry ? String(r.expiry).slice(0, 10) : null;
      const expiry_at = r.expiry_at ? String(r.expiry_at) : null;

      // ✅ Add Date (2nd batch)
      const quantity2 = r.quantity2 == null ? null : Number(r.quantity2);
      const expiry2 = r.expiry2 ? String(r.expiry2).slice(0, 10) : null;
      const expiry2_at = r.expiry2_at ? String(r.expiry2_at) : null;

      if (!item_name || !category) continue;
      if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) continue;
      if (quantity2 != null && (!Number.isFinite(quantity2) || quantity2 < 0)) continue;

      await q(
        `
        insert into public.logs
        (store, staff, shift, item_id, item_name, category, sub_category,
         quantity, expiry, expiry_at,
         quantity2, expiry2, expiry2_at,
         created_at)
        values
        ($1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,
         $11,$12,$13,
         now())
        `,
        [
          store,
          staff,
          shift,
          item_id,
          item_name,
          category,
          sub_category,
          quantity,
          expiry,
          expiry_at,
          quantity2,
          expiry2,
          expiry2_at,
        ]
      );
    }

    await markDoneSG(store, staff, shift);

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// =========================
// Summary Expiry (TODAY ONLY, SG DAY)
// =========================
app.get("/api/expiry", async (req, res) => {
  try {
    const store = normStore(req.query.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      with today_logs as (
        select *
        from public.logs
        where store=$1
          and (created_at at time zone $2)::date = (now() at time zone $2)::date
      ),
      ranked as (
        select
          item_name,
          category,
          sub_category,
          quantity,
          expiry,
          expiry_at,
          quantity2,
          expiry2,
          expiry2_at,
          created_at,
          row_number() over (
            partition by item_name, category, coalesce(sub_category,'')
            order by created_at desc
          ) as rn
        from today_logs
      ),
      picked as (
        select
          item_name as name,
          category,
          sub_category,

          quantity as qty,
          expiry_at,

          coalesce(
            nullif(expiry::text, '')::date,
            (expiry_at at time zone 'utc')::date
          ) as exp_date_1,

          quantity2 as qty2,
          expiry2_at,

          coalesce(
            nullif(expiry2::text, '')::date,
            (expiry2_at at time zone 'utc')::date
          ) as exp_date_2

        from ranked
        where rn=1
      )
      select
        name,
        category,
        sub_category,

        qty,
        expiry_at,
        exp_date_1::text as expiry_value,

        qty2,
        expiry2_at,
        exp_date_2::text as expiry2_value,

        (case
          when exp_date_1 is null then exp_date_2
          when exp_date_2 is null then exp_date_1
          else least(exp_date_1, exp_date_2)
        end)::text as earliest_expiry_value,

        (case
          when exp_date_1 is null then exp_date_2
          when exp_date_2 is null then exp_date_1
          else greatest(exp_date_1, exp_date_2)
        end)::text as latest_expiry_value

      from picked
      where (exp_date_1 is not null or exp_date_2 is not null)
      order by name asc
      `,
      [store, DAY_TZ]
    );

    res.json(
      r.rows.map((x) => ({
        ...x,
        category: uiCategoryFromDb(x.category),
      }))
    );
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// =========================
// Stock Alert — LOW STOCK ✅
// Uses latest log quantity per item as "current_qty"
// Compares to items.stock_min where stock_alert_enabled=true
// =========================
app.get("/api/stock/low", async (req, res) => {
  try {
    const store = normStore(req.query.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      with latest as (
        select distinct on (coalesce(item_id, 0), item_name, category, coalesce(sub_category,''))
          item_id,
          item_name,
          category,
          sub_category,
          quantity,
          created_at
        from public.logs
        where store=$1
        order by coalesce(item_id, 0), item_name, category, coalesce(sub_category,''), created_at desc
      )
      select
        i.id as item_id,
        i.name,
        i.category,
        i.sub_category,
        i.stock_min as min_qty,
        coalesce(l.quantity, 0) as current_qty
      from public.items i
      left join latest l
        on (l.item_id = i.id)
      where i.store=$1
        and i.deleted_at is null
        and i.is_active=true
        and coalesce(i.stock_alert_enabled,false)=true
        and i.stock_min is not null
        and coalesce(l.quantity, 0) <= i.stock_min
      order by i.category asc, i.name asc
      `,
      [store]
    );

    res.json(
      r.rows.map((x) => ({
        ...x,
        category: uiCategoryFromDb(x.category),
      }))
    );
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// =========================
// Manager APIs
// =========================
app.post("/api/manager/login", async (req, res) => {
  try {
    const pin = String(req.body?.pin || "").trim();
    const store = normStore(req.body?.store);

    if (!store) return err(res, 400, "Invalid store");
    if (!pin) return err(res, 400, "PIN required");
    if (pin !== String(MANAGER_PIN)) return err(res, 401, "Wrong PIN");

    const token = jwt.sign({ role: "manager", store }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// ----- Items -----
app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = normStore(req.query.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      select
        id, store, name, category, sub_category,
        shelf_life_days, is_active, is_hourly,
        stock_alert_enabled, stock_min
      from public.items
      where store=$1 and deleted_at is null
      order by category asc, name asc
      `,
      [store]
    );

    res.json(
      r.rows.map((x) => ({
        ...x,
        category: uiCategoryFromDb(x.category),
        is_hourly: !!x.is_hourly,
        stock_alert_enabled: !!x.stock_alert_enabled,
        stock_min: x.stock_min == null ? null : Number(x.stock_min),
      }))
    );
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

app.post("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = normStore(req.body?.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const name = String(req.body?.name || "").trim();
    const category = dbCategoryFromUi(String(req.body?.category || "").trim());
    const sub_category = req.body?.sub_category ? String(req.body.sub_category) : null;
    const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);
    const is_hourly = !!req.body?.is_hourly;

    if (!name || !category) return err(res, 400, "Missing name/category");
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0)
      return err(res, 400, "Invalid shelf life");

    const r = await q(
      `
      insert into public.items (store, name, category, sub_category, shelf_life_days, is_hourly, is_active)
      values ($1,$2,$3,$4,$5,$6,true)
      returning id
      `,
      [store, name, category, sub_category, shelf_life_days, is_hourly]
    );

    res.json({ ok: true, id: r.rows[0]?.id });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

app.patch("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = normStore(req.body?.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

    const category = dbCategoryFromUi(String(req.body?.category || "").trim());
    const sub_category = req.body?.sub_category ? String(req.body.sub_category) : null;
    const shelf_life_days = Number(req.body?.shelf_life_days ?? 0);
    const is_hourly = req.body?.is_hourly == null ? null : !!req.body.is_hourly;

    // Optional stock fields (if you later add UI)
    const stock_alert_enabled =
      req.body?.stock_alert_enabled == null ? null : !!req.body.stock_alert_enabled;
    const stock_min = req.body?.stock_min == null ? null : Number(req.body.stock_min);

    if (!category) return err(res, 400, "Missing category");
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0)
      return err(res, 400, "Invalid shelf life");
    if (stock_min != null && (!Number.isFinite(stock_min) || stock_min < 0))
      return err(res, 400, "Invalid stock_min");

    await q(
      `
      update public.items
      set category=$1,
          sub_category=$2,
          shelf_life_days=$3,
          is_hourly=coalesce($4, is_hourly),
          stock_alert_enabled=coalesce($5, stock_alert_enabled),
          stock_min=coalesce($6, stock_min),
          updated_at=now()
      where id=$7 and store=$8 and deleted_at is null
      `,
      [category, sub_category, shelf_life_days, is_hourly, stock_alert_enabled, stock_min, id, store]
    );

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

app.delete("/api/manager/items/:id", requireManager, async (req, res) => {
  try {
    const store = normStore(req.query.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

    await q(
      `
      update public.items
      set deleted_at=now(), is_active=false
      where id=$1 and store=$2 and deleted_at is null
      `,
      [id, store]
    );

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// ----- Categories -----
app.get("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const store = normStore(req.query.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      select id, store, name, sort_order, is_active
      from public.categories
      where store=$1 and deleted_at is null
      order by sort_order asc, name asc
      `,
      [store]
    );

    res.json(r.rows.map((x) => ({ ...x, name: uiCategoryFromDb(x.name) })));
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

app.post("/api/manager/categories", requireManager, async (req, res) => {
  try {
    const store = normStore(req.body?.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const nameUI = String(req.body?.name || "").trim();
    const name = dbCategoryFromUi(nameUI);
    const sort_order = Number(req.body?.sort_order ?? 100);

    if (!name) return err(res, 400, "Name required");

    await q(
      `
      insert into public.categories(store, name, sort_order, is_active)
      values($1,$2,$3,true)
      `,
      [store, name, Number.isFinite(sort_order) ? sort_order : 100]
    );

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

app.patch("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const store = normStore(req.body?.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

    const nameUI = String(req.body?.name || "").trim();
    const name = dbCategoryFromUi(nameUI);
    const sort_order = Number(req.body?.sort_order ?? 100);
    const is_active = req.body?.is_active === false ? false : true;

    if (!name) return err(res, 400, "Name required");

    await q(
      `
      update public.categories
      set name=$1, sort_order=$2, is_active=$3, updated_at=now()
      where id=$4 and store=$5 and deleted_at is null
      `,
      [name, Number.isFinite(sort_order) ? sort_order : 100, is_active, id, store]
    );

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

app.delete("/api/manager/categories/:id", requireManager, async (req, res) => {
  try {
    const store = normStore(req.query.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return err(res, 400, "Invalid id");

    await q(
      `
      update public.categories
      set deleted_at=now(), is_active=false
      where id=$1 and store=$2 and deleted_at is null
      `,
      [id, store]
    );

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// =========================
// Manager: Export logs CSV ✅
// GET /api/manager/log/export.csv?store=PDD&from=YYYY-MM-DD&to=YYYY-MM-DD
// =========================
app.get("/api/manager/log/export.csv", requireManager, async (req, res) => {
  try {
    const store = normStore(req.query.store || req.manager?.store);
    const from = String(req.query.from || "").slice(0, 10);
    const to = String(req.query.to || "").slice(0, 10);

    if (!store) return err(res, 400, "Invalid store");
    if (!from || !to) return err(res, 400, "Missing from/to");
    if (from > to) return err(res, 400, "from > to");

    const r = await q(
      `
      select
        created_at,
        store,
        staff,
        shift,
        item_id,
        item_name,
        category,
        sub_category,
        quantity,
        expiry,
        expiry_at,
        quantity2,
        expiry2,
        expiry2_at
      from public.logs
      where store=$1
        and (created_at at time zone $4)::date between $2::date and $3::date
      order by created_at asc
      `,
      [store, from, to, DAY_TZ]
    );

    const headers = [
      "created_at",
      "store",
      "staff",
      "shift",
      "item_id",
      "item_name",
      "category",
      "sub_category",
      "quantity",
      "expiry",
      "expiry_at",
      "quantity2",
      "expiry2",
      "expiry2_at",
    ];

    function csvEscape(v) {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    }

    const lines = [];
    lines.push(headers.join(","));
    for (const row of r.rows) {
      const out = {
        ...row,
        category: uiCategoryFromDb(row.category),
      };
      lines.push(headers.map((h) => csvEscape(out[h])).join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="PreCheck_${store}_${from}_to_${to}.csv"`);
    res.send(lines.join("\n"));
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});

// -------- Serve index.html for root --------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------- Start --------
app.listen(PORT, () => {
  console.log(`✅ PreCheck server running on :${PORT}`);
  console.log(`🕛 Daily reset timezone: ${DAY_TZ}`);
});
