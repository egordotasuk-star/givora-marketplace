const express = require("express");
const crypto = require("node:crypto");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const { BOT_TOKEN, DATABASE_URL, FRONTEND_ORIGIN } = process.env;
// Givora owner Telegram ID supplied by the project owner. Can be overridden in Render.
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "5304264780";

if (!BOT_TOKEN || !/^\d+$/.test(String(ADMIN_TELEGRAM_ID || "")) || !DATABASE_URL) {
  console.error("Required env vars: BOT_TOKEN, numeric ADMIN_TELEGRAM_ID, DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 5
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = String(FRONTEND_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Setup-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "32kb" }));

const schema = `
CREATE TABLE IF NOT EXISTS users (
 telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT NOT NULL,
 balance BIGINT NOT NULL DEFAULT 0 CHECK(balance >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS moderator_roles (
 telegram_id TEXT PRIMARY KEY,
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 granted_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, gift_id TEXT NOT NULL, gift_url TEXT NOT NULL,
 image_url TEXT, price BIGINT NOT NULL CHECK(price > 0), seller_id TEXT REFERENCES users(telegram_id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','sold','hidden')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gift_requests (
 id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(telegram_id),
 gift_name TEXT NOT NULL, gift_url TEXT NOT NULL, price BIGINT NOT NULL CHECK(price > 0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS orders (
 id BIGSERIAL PRIMARY KEY, listing_id BIGINT NOT NULL REFERENCES listings(id),
 buyer_id TEXT NOT NULL REFERENCES users(telegram_id), seller_id TEXT REFERENCES users(telegram_id),
 amount BIGINT NOT NULL CHECK(amount > 0),
 status TEXT NOT NULL DEFAULT 'pending_delivery',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ledger (
 id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(telegram_id),
 amount BIGINT NOT NULL, kind TEXT NOT NULL, order_id BIGINT REFERENCES orders(id),
 note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inventory (
 id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(telegram_id),
 order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id), listing_id BIGINT NOT NULL REFERENCES listings(id),
 gift_name TEXT NOT NULL, gift_url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'awaiting_delivery' CHECK(status IN ('awaiting_delivery','delivered','refunded')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_id TEXT REFERENCES users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_requests_user ON gift_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id, created_at DESC);
`;

function verifyInitData(initData) {
  if (typeof initData !== "string" || !initData || initData.length > 8192) throw new Error("Telegram initData missing");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Telegram initData hash missing");
  params.delete("hash");
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  const provided = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (!provided.length || provided.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(provided, expectedBuffer)) throw new Error("Telegram signature invalid");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate > Date.now() / 1000 + 60 ||
      Date.now() / 1000 - authDate > 86400) throw new Error("Telegram session expired");
  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user missing");
  const user = JSON.parse(rawUser);
  if (!user.id) throw new Error("Telegram user ID missing");
  return { id: String(user.id), username: user.username || null, firstName: user.first_name || "Telegram user" };
}

async function auth(req, res, next) {
  try {
    const header = req.get("Authorization") || "";
    if (!header.startsWith("tma ")) throw new Error("Open Givora inside Telegram");
    req.user = verifyInitData(header.slice(4));
    await pool.query(
      `INSERT INTO users(telegram_id,username,first_name) VALUES($1,$2,$3)
       ON CONFLICT(telegram_id) DO UPDATE SET username=EXCLUDED.username,
       first_name=EXCLUDED.first_name, updated_at=NOW()`,
      [req.user.id, req.user.username, req.user.firstName]
    );
    next();
  } catch (err) {
    res.status(401).json({ error: "telegram_auth_failed", message: err.message });
  }
}
function adminOnly(req, res, next) {
  if (req.user.id !== String(ADMIN_TELEGRAM_ID)) return res.status(403).json({ error: "admin_only" });
  next();
}
async function moderatorOrAdmin(req, res, next) {
  if (req.user.id === String(ADMIN_TELEGRAM_ID)) return next();
  try {
    const r = await pool.query("SELECT 1 FROM moderator_roles WHERE telegram_id=$1 AND expires_at>NOW()", [req.user.id]);
    if (!r.rowCount) return res.status(403).json({ error: "moderator_only" });
    next();
  } catch (e) { next(e); }
}
function validAmount(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100000000;
}
function giftUrlValid(url) {
  return typeof url === "string" && /^https:\/\/t\.me\/nft\/[A-Za-z0-9_-]+$/.test(url);
}
async function notifyAdmin(message) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ADMIN_TELEGRAM_ID, text: message, disable_web_page_preview: true })
    });
    if (!r.ok) console.warn("Telegram admin notification failed:", r.status);
  } catch (e) { console.warn("Telegram admin notification unavailable:", e.message); }
}

app.get("/api/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, service: "givora-api" }); }
  catch { res.status(503).json({ ok: false }); }
});
app.use("/api", auth);

app.get("/api/me", async (req, res) => {
  const r = await pool.query("SELECT telegram_id,username,first_name,balance FROM users WHERE telegram_id=$1", [req.user.id]);
  const u = r.rows[0];
  const role = await pool.query("SELECT expires_at FROM moderator_roles WHERE telegram_id=$1 AND expires_at>NOW()", [req.user.id]);
  res.json({ user: { id: u.telegram_id, username: u.username, firstName: u.first_name,
    balance: Number(u.balance), isAdmin: req.user.id === String(ADMIN_TELEGRAM_ID),
    isModerator: role.rowCount > 0 || req.user.id === String(ADMIN_TELEGRAM_ID),
    moderatorExpiresAt: role.rows[0]?.expires_at || null } });
});
app.get("/api/listings", async (_req, res) => {
  const r = await pool.query(
    `SELECT id,name,gift_id,gift_url,image_url,price,seller_id
     FROM listings WHERE status='active' ORDER BY created_at DESC LIMIT 300`
  );
  res.json({ listings: r.rows.map(x => ({ ...x, id: Number(x.id), price: Number(x.price) })) });
});
app.get("/api/inventory", async (req, res) => {
  const r = await pool.query(
    `SELECT id,order_id,gift_name,gift_url,status,created_at
     FROM inventory WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]
  );
  res.json({ inventory: r.rows });
});
app.get("/api/history", async (req, res) => {
  const [orders, ledger, requests] = await Promise.all([
    pool.query("SELECT id,listing_id,amount,status,created_at FROM orders WHERE buyer_id=$1 OR seller_id=$1 OR recipient_id=$1 ORDER BY created_at DESC LIMIT 100", [req.user.id]),
    pool.query("SELECT id,amount,kind,note,created_at FROM ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [req.user.id]),
    pool.query("SELECT id,gift_name,gift_url,price,status,created_at FROM gift_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [req.user.id])
  ]);
  res.json({ orders: orders.rows, ledger: ledger.rows, requests: requests.rows });
});
app.post("/api/requests", async (req, res) => {
  const { giftName, giftUrl, price } = req.body || {};
  const n = Number(price);
  if (typeof giftName !== "string" || giftName.trim().length < 2 || giftName.length > 100 ||
      !giftUrlValid(giftUrl) || !validAmount(n)) return res.status(400).json({ error: "invalid_request" });
  const r = await pool.query(
    "INSERT INTO gift_requests(user_id,gift_name,gift_url,price) VALUES($1,$2,$3,$4) RETURNING id,status",
    [req.user.id, giftName.trim(), giftUrl, n]
  );
  await notifyAdmin(`Новая заявка Givora #${r.rows[0].id}\nПользователь: @${req.user.username || req.user.id}\nПодарок: ${giftName.trim()}\nЦена: ${n} Givora Stars\n${giftUrl}`);
  res.status(201).json({ request: r.rows[0] });
});

app.get("/api/admin/requests", moderatorOrAdmin, async (_req, res) => {
  const r = await pool.query(
    `SELECT r.*,u.username,u.first_name FROM gift_requests r
     JOIN users u ON u.telegram_id=r.user_id ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({ requests: r.rows });
});
app.post("/api/admin/requests/:id/review", moderatorOrAdmin, async (req, res) => {
  const decision = req.body?.decision;
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "invalid_decision" });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const q = await c.query("SELECT * FROM gift_requests WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!q.rowCount || q.rows[0].status !== "pending") throw new Error("request_not_pending");
    const r = q.rows[0];
    await c.query("UPDATE gift_requests SET status=$1,reviewed_at=NOW() WHERE id=$2",
      [decision === "approve" ? "approved" : "rejected", r.id]);
    if (decision === "approve") {
      await c.query("INSERT INTO listings(name,gift_id,gift_url,price,seller_id) VALUES($1,$2,$3,$4,$5)",
        [r.gift_name, r.gift_url.split("/").pop(), r.gift_url, r.price, r.user_id]);
    }
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(409).json({ error: e.message });
  } finally { c.release(); }
});

app.post("/api/admin/listings", adminOnly, async (req, res) => {
  const { name, giftUrl, imageUrl, price } = req.body || {};
  const n = Number(price);
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 100 ||
      !giftUrlValid(giftUrl) || (imageUrl && (typeof imageUrl !== "string" || !/^https:\/\//.test(imageUrl))) ||
      !validAmount(n)) return res.status(400).json({ error: "invalid_listing" });
  const r = await pool.query(
    "INSERT INTO listings(name,gift_id,gift_url,image_url,price) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [name.trim(), giftUrl.split("/").pop(), giftUrl, imageUrl || null, n]
  );
  res.status(201).json({ id: Number(r.rows[0].id) });
});
app.delete("/api/admin/listings/:id", moderatorOrAdmin, async (req, res) => {
  const r = await pool.query("UPDATE listings SET status='hidden' WHERE id=$1 AND status='active'", [req.params.id]);
  res.json({ ok: r.rowCount === 1 });
});
app.get("/api/admin/users", adminOnly, async (req, res) => {
  const term = String(req.query.q || "").replace(/^@/, "").slice(0, 64);
  const r = await pool.query(
    `SELECT telegram_id,username,first_name,balance FROM users
     WHERE ($1='' OR username ILIKE $2 OR telegram_id=$3)
     ORDER BY updated_at DESC LIMIT 50`, [term, `%${term}%`, term]
  );
  res.json({ users: r.rows.map(u => ({ ...u, balance: Number(u.balance) })) });
});
app.post("/api/admin/users/:id/credit", adminOnly, async (req, res) => {
  const n = Number(req.body?.amount);
  if (!validAmount(n)) return res.status(400).json({ error: "invalid_amount" });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const u = await c.query("SELECT telegram_id FROM users WHERE telegram_id=$1 FOR UPDATE", [req.params.id]);
    if (!u.rowCount) throw new Error("user_not_found");
    await c.query("UPDATE users SET balance=balance+$1,updated_at=NOW() WHERE telegram_id=$2", [n, req.params.id]);
    await c.query("INSERT INTO ledger(user_id,amount,kind,note) VALUES($1,$2,'admin_credit','Admin Givora Stars grant')",
      [req.params.id, n]);
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(404).json({ error: e.message });
  } finally { c.release(); }
});

app.get("/api/admin/orders", adminOnly, async (_req, res) => {
  const r = await pool.query(
    `SELECT o.id,o.listing_id,o.buyer_id,o.seller_id,o.recipient_id,o.amount,o.status,o.created_at,
      b.username AS buyer_username, r.username AS recipient_username FROM orders o
      JOIN users b ON b.telegram_id=o.buyer_id
      LEFT JOIN users r ON r.telegram_id=o.recipient_id ORDER BY o.created_at DESC LIMIT 200`
  );
  res.json({ orders: r.rows });
});
app.post("/api/admin/orders/:id/delivered", adminOnly, async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const q = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!q.rowCount || q.rows[0].status !== "pending_delivery") throw new Error("order_not_pending_delivery");
    const o = q.rows[0];
    await c.query("UPDATE orders SET status='delivered',updated_at=NOW() WHERE id=$1", [o.id]);
    await c.query("UPDATE inventory SET status='delivered',updated_at=NOW() WHERE order_id=$1", [o.id]);
    if (o.seller_id) {
      await c.query("UPDATE users SET balance=balance+$1,updated_at=NOW() WHERE telegram_id=$2", [o.amount, o.seller_id]);
      await c.query("INSERT INTO ledger(user_id,amount,kind,order_id,note) VALUES($1,$2,'sale_credit',$3,'Givora Stars credited after delivery')",
        [o.seller_id, o.amount, o.id]);
    }
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(409).json({ error: e.message });
  } finally { c.release(); }
});
app.post("/api/admin/orders/:id/refund", adminOnly, async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const q = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!q.rowCount || q.rows[0].status !== "pending_delivery") throw new Error("order_not_pending_delivery");
    const o = q.rows[0];
    await c.query("UPDATE users SET balance=balance+$1,updated_at=NOW() WHERE telegram_id=$2", [o.amount, o.buyer_id]);
    await c.query("INSERT INTO ledger(user_id,amount,kind,order_id,note) VALUES($1,$2,'purchase_refund',$3,'Givora Stars refund')",
      [o.buyer_id, o.amount, o.id]);
    await c.query("UPDATE orders SET status='refunded',updated_at=NOW() WHERE id=$1", [o.id]);
    await c.query("UPDATE inventory SET status='refunded',updated_at=NOW() WHERE order_id=$1", [o.id]);
    await c.query("UPDATE listings SET status='hidden' WHERE id=$1", [o.listing_id]);
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(409).json({ error: e.message });
  } finally { c.release(); }
});

app.post("/api/purchase/:id", async (req, res) => {
  const recipientUsername = typeof req.body?.recipientUsername === "string"
    ? req.body.recipientUsername.trim().replace(/^@/, "").slice(0, 64) : "";
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const q = await c.query("SELECT * FROM listings WHERE id=$1 AND status='active' FOR UPDATE", [req.params.id]);
    if (!q.rowCount) throw new Error("listing_unavailable");
    const g = q.rows[0];
    if (g.seller_id === req.user.id) throw new Error("cannot_buy_own_listing");

    let recipientId = req.user.id;
    if (recipientUsername) {
      const r = await c.query("SELECT telegram_id FROM users WHERE LOWER(username)=LOWER($1)", [recipientUsername]);
      if (!r.rowCount) throw new Error("recipient_not_found");
      recipientId = r.rows[0].telegram_id;
    }
    const buyer = await c.query("SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE", [req.user.id]);
    if (Number(buyer.rows[0].balance) < Number(g.price)) throw new Error("insufficient_balance");
    await c.query("UPDATE users SET balance=balance-$1,updated_at=NOW() WHERE telegram_id=$2", [g.price, req.user.id]);
    const order = await c.query(
      "INSERT INTO orders(listing_id,buyer_id,seller_id,recipient_id,amount,status) VALUES($1,$2,$3,$4,$5,'pending_delivery') RETURNING id",
      [g.id, req.user.id, g.seller_id, recipientId, g.price]
    );
    await c.query(
      "INSERT INTO inventory(user_id,order_id,listing_id,gift_name,gift_url) VALUES($1,$2,$3,$4,$5)",
      [recipientId, order.rows[0].id, g.id, g.name, g.gift_url]
    );
    await c.query("INSERT INTO ledger(user_id,amount,kind,order_id,note) VALUES($1,$2,'purchase_debit',$3,'Givora Stars purchase')",
      [req.user.id, -Number(g.price), order.rows[0].id]);
    await c.query("UPDATE listings SET status='sold' WHERE id=$1", [g.id]);
    await c.query("COMMIT");
    res.json({ ok: true, orderId: Number(order.rows[0].id), status: "pending_delivery", recipientId });
  } catch (e) {
    await c.query("ROLLBACK");
    res.status(409).json({ error: e.message });
  } finally { c.release(); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});
pool.query(schema)
  .then(async () => {
    // The configured account owner receives a one-year moderator record once.
    // ON CONFLICT DO NOTHING prevents restarts from silently extending the term.
    await pool.query(
      `INSERT INTO moderator_roles(telegram_id,expires_at,granted_by)
       VALUES($1,NOW()+INTERVAL '1 year',$1) ON CONFLICT(telegram_id) DO NOTHING`,
      [String(ADMIN_TELEGRAM_ID)]
    );
  })
  .then(() => app.listen(PORT, () => console.log(`Givora API listening on ${PORT}`)))
  .catch(err => { console.error("Database migration failed:", err); process.exit(1); });
