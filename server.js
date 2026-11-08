const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Givora API" });
});

app.post("/api/requests", async (req, res) => {
  try {
    const { username, gift, giftId } = req.body;

    if (!gift || !giftId) {
      return res.status(400).json({
        error: "Gift name and ID are required"
      });
    }

    const result = await pool.query(
      `INSERT INTO requests (username, gift, gift_id)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [String(username || "unknown"), String(gift), String(giftId)]
    );

    res.status(201).json({
      success: true,
      request: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      gift TEXT NOT NULL,
      gift_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log("Givora API running on port " + port);
  });
}

start().catch(console.error);
