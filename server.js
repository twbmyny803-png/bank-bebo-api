const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

// استبدل هذا الرابط برابط قاعدة البيانات عندك
const DATABASE_URL = "PUT_DATABASE_URL_HERE";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get("/", (req, res) => {
  res.send("demo-user-api running ✅");
});

app.get("/init-db", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users_demo (
        id SERIAL PRIMARY KEY,
        member_number BIGINT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        points NUMERIC(12,2) NOT NULL DEFAULT 2000,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    res.json({ ok: true, message: "DB ready ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username and password required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    let createdUser = null;

    for (let i = 0; i < 10; i++) {
      const memberNumber = Math.floor(1000000 + Math.random() * 9000000);

      try {
        const r = await pool.query(
          `INSERT INTO users_demo (member_number, username, password_hash, points)
           VALUES ($1, $2, $3, $4)
           RETURNING id, member_number, username, points, status, created_at`,
          [memberNumber, username, passwordHash, 2000]
        );
        createdUser = r.rows[0];
        break;
      } catch (err) {
        if (err.code !== "23505") throw err;
      }
    }

    if (!createdUser) {
      return res.status(500).json({ ok: false, error: "failed to generate unique member number" });
    }

    res.json({ ok: true, user: createdUser });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, member_number, username, points, status, created_at
      FROM users_demo
      ORDER BY id DESC
    `);

    res.json({ ok: true, users: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/user/:memberNumber", async (req, res) => {
  const { memberNumber } = req.params;

  try {
    const r = await pool.query(
      `SELECT id, member_number, username, points, status, created_at
       FROM users_demo
       WHERE member_number = $1
       LIMIT 1`,
      [memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/user/:memberNumber/username", async (req, res) => {
  const { memberNumber } = req.params;
  const { username } = req.body || {};

  if (!username) {
    return res.status(400).json({ ok: false, error: "username required" });
  }

  try {
    const r = await pool.query(
      `UPDATE users_demo
       SET username = $1
       WHERE member_number = $2
       RETURNING id, member_number, username, points, status, created_at`,
      [username, memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/user/:memberNumber/points", async (req, res) => {
  const { memberNumber } = req.params;
  const { amount } = req.body || {};

  if (typeof amount !== "number") {
    return res.status(400).json({ ok: false, error: "amount must be a number" });
  }

  try {
    const r = await pool.query(
      `UPDATE users_demo
       SET points = points + $1
       WHERE member_number = $2
       RETURNING id, member_number, username, points, status, created_at`,
      [amount, memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/user/:memberNumber/password", async (req, res) => {
  const { memberNumber } = req.params;
  const { newPassword } = req.body || {};

  if (!newPassword) {
    return res.status(400).json({ ok: false, error: "newPassword required" });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);

    const r = await pool.query(
      `UPDATE users_demo
       SET password_hash = $1
       WHERE member_number = $2
       RETURNING id`,
      [hash, memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    res.json({ ok: true, message: "Password updated ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/user/:memberNumber/status", async (req, res) => {
  const { memberNumber } = req.params;
  const { status } = req.body || {};

  if (!status) {
    return res.status(400).json({ ok: false, error: "status required" });
  }

  try {
    const r = await pool.query(
      `UPDATE users_demo
       SET status = $1
       WHERE member_number = $2
       RETURNING id, member_number, username, points, status, created_at`,
      [status, memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/user/:memberNumber", async (req, res) => {
  const { memberNumber } = req.params;

  try {
    const r = await pool.query(
      `DELETE FROM users_demo
       WHERE member_number = $1
       RETURNING id`,
      [memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    res.json({ ok: true, message: "User deleted ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
