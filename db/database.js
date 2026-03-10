const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'thinking-room.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    excerpt     TEXT,
    content     TEXT,
    categories  TEXT DEFAULT '',
    cover_image TEXT,
    published   INTEGER DEFAULT 0,
    featured    INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const existing = db.prepare(`SELECT value FROM settings WHERE key='admin_password'`).get();
if (!existing) {
  const hashed = bcrypt.hashSync('thinkingroom', 10);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('admin_password', ?)`).run(hashed);
  console.log('Default admin password set: thinkingroom');
}

const count = db.prepare(`SELECT COUNT(*) as c FROM posts`).get();
if (count.c === 0) {
  const insert = db.prepare(`INSERT INTO posts (title, slug, excerpt, content, categories, published, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);
  insert.run(
    'Welcome to The Thinking Room',
    'welcome-to-the-thinking-room',
    'This is where thoughts bloom, ideas wander, and stories find their home.',
    `# Welcome to The Thinking Room 🌸\n\nHello, dear reader. I'm so glad you found your way here.\n\n**The Thinking Room** is my personal space to share thoughts, stories, and little moments that feel worth keeping.\n\n## What to Expect\n\nHere you'll find reflections on everyday life, stories from travels near and far, and random musings that don't fit anywhere else but feel important.\n\nMake yourself comfortable. ☁️`,
    'Welcome',
    1, 1
  );
  insert.run(
    'The Art of Slowing Down',
    'the-art-of-slowing-down',
    'In a world that celebrates busyness, choosing to slow down might be the most radical thing you can do.',
    `# The Art of Slowing Down\n\nWe live in a culture that worships speed.\n\nFast food. Fast fashion. Fast replies. The idea that being busy equals being important has become so normalized that we forget we have a choice.\n\n## Small Acts of Slowness\n\n- **Morning pages** — writing three pages by hand before looking at your phone\n- **One-task mornings** — the first hour is for one thing only\n- **Evening walks** — no destination, no podcast, just walking\n\n> *"Nature does not hurry, yet everything is accomplished."* — Lao Tzu\n\nThere's something to that. ☁️`,
    'Lifestyle, Reflections',
    1, 0
  );
  insert.run(
    'Things I Learned From Rainy Days',
    'things-i-learned-from-rainy-days',
    'Rain has a way of making you stop. And sometimes stopping is exactly what you need.',
    `# Things I Learned From Rainy Days\n\nThere's a specific kind of permission that rain gives you.\n\nPermission to stay inside. To cancel plans without guilt. To make soup at 2pm and read in bed.\n\n## My Rainy Day Recipe\n\n- One good book\n- A hot drink in a mug that makes you happy\n- Blanket. Always a blanket.\n- The sound of rain on the window, unmuted\n\nThat's it. That's the whole recipe. ☁️🌧️`,
    'Reflections',
    1, 0
  );
  console.log('Sample posts seeded');
}

module.exports = db;
