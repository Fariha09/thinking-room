const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper: run a query
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Create tables and seed on first run
async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      slug        TEXT UNIQUE NOT NULL,
      excerpt     TEXT DEFAULT '',
      content     TEXT DEFAULT '',
      categories  TEXT DEFAULT '',
      cover_image TEXT,
      published   BOOLEAN DEFAULT FALSE,
      featured    BOOLEAN DEFAULT FALSE,
      view_count  INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS comments (
      id         SERIAL PRIMARY KEY,
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      body       TEXT NOT NULL,
      approved   BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS subscribers (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      name       TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed admin password if missing
  const existing = await query(`SELECT value FROM settings WHERE key='admin_password'`);
  if (existing.rows.length === 0) {
    const hashed = bcrypt.hashSync('thinkingroom', 10);
    await query(`INSERT INTO settings (key, value) VALUES ('admin_password', $1)`, [hashed]);
    console.log('✅ Default admin password set: thinkingroom');
  }

  // Seed sample posts if empty
  const count = await query(`SELECT COUNT(*) as c FROM posts`);
  if (parseInt(count.rows[0].c) === 0) {
    await query(`
      INSERT INTO posts (title, slug, excerpt, content, categories, published, featured)
      VALUES
        ($1,$2,$3,$4,$5,TRUE,TRUE),
        ($6,$7,$8,$9,$10,TRUE,FALSE),
        ($11,$12,$13,$14,$15,TRUE,FALSE)
    `, [
      'Welcome to The Thinking Room',
      'welcome-to-the-thinking-room',
      'This is where thoughts bloom, ideas wander, and stories find their home.',
      `# Welcome to The Thinking Room 🌸\n\nHello, dear reader. I'm so glad you found your way here.\n\n**The Thinking Room** is my personal space to share thoughts, stories, and little moments that feel worth keeping.\n\n## What to Expect\n\nHere you'll find reflections on everyday life, stories from travels near and far, and random musings that don't fit anywhere else but feel important.\n\nMake yourself comfortable. ☁️`,
      'Welcome',
      'The Art of Slowing Down',
      'the-art-of-slowing-down',
      'In a world that celebrates busyness, choosing to slow down might be the most radical thing you can do.',
      `# The Art of Slowing Down\n\nWe live in a culture that worships speed.\n\n## Small Acts of Slowness\n\n- **Morning pages** — writing three pages by hand before looking at your phone\n- **One-task mornings** — the first hour is for one thing only\n- **Evening walks** — no destination, no podcast, just walking\n\n> *"Nature does not hurry, yet everything is accomplished."* — Lao Tzu\n\nThere's something to that. ☁️`,
      'Lifestyle, Reflections',
      'Things I Learned From Rainy Days',
      'things-i-learned-from-rainy-days',
      'Rain has a way of making you stop. And sometimes stopping is exactly what you need.',
      `# Things I Learned From Rainy Days\n\nThere's a specific kind of permission that rain gives you.\n\nPermission to stay inside. To cancel plans without guilt. To make soup at 2pm and read in bed.\n\n## My Rainy Day Recipe\n\n- One good book\n- A hot drink in a mug that makes you happy\n- Blanket. Always a blanket.\n- The sound of rain on the window, unmuted\n\nThat's it. That's the whole recipe. ☁️🌧️`,
      'Reflections'
    ]);
    console.log('✅ Sample posts seeded');
  }

  console.log('✅ Database ready');
}

init().catch(err => {
  console.error('❌ Database init error:', err.message);
});

module.exports = { query, pool };
