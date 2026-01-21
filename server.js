// =========================
// PreCheck — server.js (FINAL / CLEAN) — PART 1 / 3
// (From top → end of /api/log/batch)
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
// Status (Manager Summary indicator)
// =========================

// GET /api/status?store=PDD  -> today's status (SG DAY)
app.get("/api/status", async (req, res) => {
  try {
    const store = normStore(req.query.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      select store, day_key, last_saved_at, last_saved_by
      from public.daily_status
      where store=$1 and day_key=(now() at time zone $2)::date
      limit 1
    `,
      [store, DAY_TZ]
    );

    res.json(r.rows[0] || null);
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
    await markDoneSG(store, staff);
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

    res.json(
      r.rows.map((x) => ({
        ...x,
        name: uiCategoryFromDb(x.name),
      }))
    );
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
      select id, store, name, category, sub_category, shelf_life_days, is_hourly
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
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) return err(res, 400, "Invalid quantity");
    if (quantity2 != null && (!Number.isFinite(quantity2) || quantity2 < 0)) return err(res, 400, "Invalid quantity2");

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

    // ✅ Mark store "done" today (SG DAY)
    await markDoneSG(store, staff);

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

    // ✅ Mark store "done" today (SG DAY)
    await markDoneSG(store, staff);

    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e?.message || "Failed");
  }
});
// =========================
// PreCheck — server.js (FINAL / CLEAN) — PART 2 / 3
// (From /api/expiry → manager login)
// =========================

// =========================
// Summary (TODAY ONLY, SG DAY)
// Latest entry per item_name+category+sub_category, but ONLY from today's logs (SG DAY).
// Returns:
//  - qty, expiry_value, expiry_at
//  - qty2, expiry2_value, expiry2_at
//  - earliest_expiry_value, latest_expiry_value
// ✅ Handles expiry columns stored as TEXT or DATE safely
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
// =========================
// PreCheck — server.js (FINAL / CLEAN) — PART 3 / 3
// (Manager routes → serve index.html → start server)
// =========================

// ----- Items -----
app.get("/api/manager/items", requireManager, async (req, res) => {
  try {
    const store = normStore(req.query.store || req.manager?.store);
    if (!store) return err(res, 400, "Invalid store");

    const r = await q(
      `
      select id, store, name, category, sub_category, shelf_life_days, is_active, is_hourly
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
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) return err(res, 400, "Invalid shelf life");

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

    if (!category) return err(res, 400, "Missing category");
    if (!Number.isFinite(shelf_life_days) || shelf_life_days < 0) return err(res, 400, "Invalid shelf life");

    await q(
      `
      update public.items
      set category=$1,
          sub_category=$2,
          shelf_life_days=$3,
          is_hourly=coalesce($4, is_hourly),
          updated_at=now()
      where id=$5 and store=$6 and deleted_at is null
    `,
      [category, sub_category, shelf_life_days, is_hourly, id, store]
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

    res.json(
      r.rows.map((x) => ({
        ...x,
        name: uiCategoryFromDb(x.name),
      }))
    );
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

// -------- Serve index.html for root --------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------- Start --------
app.listen(PORT, () => {
  console.log(`✅ PreCheck server running on :${PORT}`);
  console.log(`🕛 Daily reset timezone: ${DAY_TZ}`);
});
