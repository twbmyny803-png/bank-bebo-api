const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors());
app.use(express.json());

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://bebo_kyj2_user:HbrInXu38r7BMKgH1ij3Cyv6kjiAHW3Y@dpg-d6j9qgpr0fns73bjutf0-a.oregon-postgres.render.com/bebo_kyj2";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.get("/", (req, res) => {
  res.send("bank-bebo-api running ✅");
});

/*
  1) افتح هذا الرابط مرة واحدة بعد الديبLOY:
     /init-db

  2) ثم افتح هذا الرابط مرة واحدة لإنشاء أول أدمن:
     /seed-admin

  بيانات الأدمن الافتراضية:
     username: admin
     password: 123456
*/
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins_demo (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    res.json({ ok: true, message: "DB ready ✅" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/seed-admin", async (req, res) => {
  try {
    const exists = await pool.query(
      `SELECT id, username FROM admins_demo WHERE username = $1 LIMIT 1`,
      ["admin"]
    );

    if (exists.rows.length > 0) {
      return res.json({
        ok: true,
        message: "Admin already exists ✅",
        admin: exists.rows[0],
      });
    }

    const passwordHash = await bcrypt.hash("123456", 10);

    const r = await pool.query(
      `INSERT INTO admins_demo (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at`,
      ["admin", passwordHash]
    );

    res.json({
      ok: true,
      message: "Admin created ✅",
      admin: r.rows[0],
      login: {
        username: "admin",
        password: "123456",
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "username and password required" });
  }

  try {
    const r = await pool.query(
      `SELECT id, username, password_hash, created_at
       FROM admins_demo
       WHERE username = $1
       LIMIT 1`,
      [username]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "invalid admin credentials" });
    }

    const admin = r.rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);

    if (!match) {
      return res.status(401).json({ ok: false, error: "invalid admin credentials" });
    }

    res.json({
      ok: true,
      message: "Admin login success ✅",
      admin: {
        id: admin.id,
        username: admin.username,
        created_at: admin.created_at,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "username and password required" });
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
      return res
        .status(500)
        .json({ ok: false, error: "failed to generate unique member number" });
    }

    res.json({ ok: true, user: createdUser });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/user/login", async (req, res) => {
  const { memberNumber, password } = req.body || {};

  if (!memberNumber || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "memberNumber and password required" });
  }

  try {
    const r = await pool.query(
      `SELECT id, member_number, username, password_hash, points, status, created_at
       FROM users_demo
       WHERE member_number = $1
       LIMIT 1`,
      [memberNumber]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ ok: false, error: "wrong password" });
    }

    if (user.status === "banned") {
      return res.status(403).json({ ok: false, error: "account is banned" });
    }

    if (user.status === "frozen") {
      return res.status(403).json({ ok: false, error: "account is frozen" });
    }

    res.json({
      ok: true,
      message: "User login success ✅",
      user: {
        id: user.id,
        member_number: user.member_number,
        username: user.username,
        points: user.points,
        status: user.status,
        created_at: user.created_at,
      },
    });
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

  const allowedStatuses = ["active", "banned", "frozen"];

  if (!status) {
    return res.status(400).json({ ok: false, error: "status required" });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      ok: false,
      error: "status must be one of: active, banned, frozen",
    });
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
