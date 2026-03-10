const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'thinking-room-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => req.session.admin ? next() : res.redirect('/admin/login');

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildPostCard(post) {
  const img = post.cover_image
    ? `<div class="card-img"><img src="/uploads/${post.cover_image}" alt="${post.title}"></div>`
    : `<div class="card-img card-img-placeholder"><div class="placeholder-icon">☁️</div></div>`;
  const cats = post.categories
    ? post.categories.split(',').map(c => `<span class="tag">${c.trim()}</span>`).join('')
    : '';
  return `<article class="post-card">${img}<div class="card-body">
    <div class="card-meta"><span class="card-date">${formatDate(post.created_at)}</span><div class="card-tags">${cats}</div></div>
    <h2 class="card-title"><a href="/post/${post.slug}">${post.title}</a></h2>
    <p class="card-excerpt">${post.excerpt || ''}</p>
    <a href="/post/${post.slug}" class="read-more">Read more →</a>
  </div></article>`;
}

function renderFile(filePath, replacements, res) {
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) return res.status(500).send('Template error');
    let html = content;
    Object.keys(replacements).forEach(k => {
      html = html.split(`{{${k}}}`).join(replacements[k] !== undefined ? replacements[k] : '');
    });
    res.send(html);
  });
}

// ── PUBLIC ROUTES ──────────────────────────────────────

app.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 6;
  const offset = (page - 1) * limit;
  const search = req.query.q || '';
  const category = req.query.cat || '';

  let posts, total;
  if (search) {
    posts = db.prepare(`SELECT * FROM posts WHERE published=1 AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(`%${search}%`, `%${search}%`, limit, offset);
    total = db.prepare(`SELECT COUNT(*) as c FROM posts WHERE published=1 AND (title LIKE ? OR content LIKE ?)`).get(`%${search}%`, `%${search}%`).c;
  } else if (category) {
    posts = db.prepare(`SELECT * FROM posts WHERE published=1 AND categories LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(`%${category}%`, limit, offset);
    total = db.prepare(`SELECT COUNT(*) as c FROM posts WHERE published=1 AND categories LIKE ?`).get(`%${category}%`).c;
  } else {
    posts = db.prepare(`SELECT * FROM posts WHERE published=1 ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
    total = db.prepare(`SELECT COUNT(*) as c FROM posts WHERE published=1`).get().c;
  }

  const featured = db.prepare(`SELECT * FROM posts WHERE published=1 AND featured=1 ORDER BY created_at DESC LIMIT 1`).get();
  const totalPages = Math.ceil(total / limit);
  const categories = db.prepare(`SELECT DISTINCT categories FROM posts WHERE published=1 AND categories != ''`).all();
  const allCats = [...new Set(categories.flatMap(r => r.categories.split(',').map(c => c.trim())))].filter(Boolean);

  const featuredHTML = featured ? `
    <section class="featured-post${!featured.cover_image ? ' featured-no-img' : ''}">
      ${featured.cover_image ? `<div class="featured-img"><img src="/uploads/${featured.cover_image}" alt="${featured.title}"></div>` : ''}
      <div class="featured-body">
        <span class="featured-label">✨ Featured</span>
        <h1 class="featured-title"><a href="/post/${featured.slug}">${featured.title}</a></h1>
        <p class="featured-excerpt">${featured.excerpt || ''}</p>
        <div class="featured-meta">${formatDate(featured.created_at)}</div>
        <a href="/post/${featured.slug}" class="btn-primary">Read Story →</a>
      </div>
    </section>` : '';

  const paginationHTML = totalPages > 1 ? `
    <div class="pagination">
      ${page > 1 ? `<a href="/?page=${page-1}${search?'&q='+search:''}${category?'&cat='+encodeURIComponent(category):''}" class="page-btn">← Prev</a>` : ''}
      <span class="page-info">Page ${page} of ${totalPages}</span>
      ${page < totalPages ? `<a href="/?page=${page+1}${search?'&q='+search:''}${category?'&cat='+encodeURIComponent(category):''}" class="page-btn">Next →</a>` : ''}
    </div>` : '';

  renderFile(path.join(__dirname, 'views/index.html'), {
    featured: featuredHTML,
    posts: posts.map(buildPostCard).join('') || '<div class="no-posts">No posts yet. Check back soon! ☁️</div>',
    pagination: paginationHTML,
    categories: allCats.map(c => `<a href="/?cat=${encodeURIComponent(c)}" class="cat-link${category===c?' active':''}">${c}</a>`).join(''),
    search,
    total
  }, res);
});

app.get('/post/:slug', (req, res) => {
  const post = db.prepare(`SELECT * FROM posts WHERE slug=? AND published=1`).get(req.params.slug);
  if (!post) return res.redirect('/');
  const related = db.prepare(`SELECT * FROM posts WHERE published=1 AND id != ? ORDER BY RANDOM() LIMIT 3`).all(post.id);
  renderFile(path.join(__dirname, 'views/post.html'), {
    title: post.title,
    date: formatDate(post.created_at),
    categories: post.categories ? post.categories.split(',').map(c => `<span class="tag">${c.trim()}</span>`).join('') : '',
    cover: post.cover_image ? `<img src="/uploads/${post.cover_image}" alt="${post.title}" class="post-cover">` : '',
    content: marked(post.content || ''),
    excerpt: post.excerpt || '',
    related: related.map(buildPostCard).join('')
  }, res);
});

// ── ADMIN ROUTES ──────────────────────────────────────

app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  renderFile(path.join(__dirname, 'views/admin/login.html'), { error: '' }, res);
});

app.post('/admin/login', (req, res) => {
  const adminPass = db.prepare(`SELECT value FROM settings WHERE key='admin_password'`).get();
  if (adminPass && bcrypt.compareSync(req.body.password, adminPass.value)) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  renderFile(path.join(__dirname, 'views/admin/login.html'), {
    error: '<p class="error-msg">Incorrect password. Try again.</p>'
  }, res);
});

app.get('/admin/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

app.get('/admin', requireAuth, (req, res) => {
  const posts = db.prepare(`SELECT * FROM posts ORDER BY created_at DESC`).all();
  const published = posts.filter(p => p.published).length;
  renderFile(path.join(__dirname, 'views/admin/dashboard.html'), {
    totalPosts: posts.length,
    published,
    drafts: posts.length - published,
    rows: posts.map(p => `
      <tr>
        <td>${p.title}</td>
        <td><span class="badge ${p.published ? 'badge-pub' : 'badge-draft'}">${p.published ? 'Published' : 'Draft'}</span></td>
        <td>${formatDate(p.created_at)}</td>
        <td class="actions">
          <a href="/admin/edit/${p.id}" class="btn-sm btn-edit">Edit</a>
          <a href="/post/${p.slug}" target="_blank" class="btn-sm btn-view">View</a>
          <form method="POST" action="/admin/delete/${p.id}" style="display:inline" onsubmit="return confirm('Delete this post?')">
            <button type="submit" class="btn-sm btn-del">Delete</button>
          </form>
        </td>
      </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-faint)">No posts yet. Write your first one! 🌸</td></tr>'
  }, res);
});

app.get('/admin/new', requireAuth, (req, res) => {
  renderFile(path.join(__dirname, 'views/admin/editor.html'), {
    pageTitle: 'New Post', action: '/admin/new',
    title: '', excerpt: '', content: '', categories: '',
    published_checked: '', featured_checked: '', current_image: ''
  }, res);
});

app.post('/admin/new', requireAuth, upload.single('cover_image'), (req, res) => {
  const { title, excerpt, content, categories, published, featured } = req.body;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
  db.prepare(`INSERT INTO posts (title, slug, excerpt, content, categories, cover_image, published, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
    .run(title, slug, excerpt || '', content || '', categories || '', req.file ? req.file.filename : null, published ? 1 : 0, featured ? 1 : 0);
  res.redirect('/admin');
});

app.get('/admin/edit/:id', requireAuth, (req, res) => {
  const post = db.prepare(`SELECT * FROM posts WHERE id=?`).get(req.params.id);
  if (!post) return res.redirect('/admin');
  renderFile(path.join(__dirname, 'views/admin/editor.html'), {
    pageTitle: 'Edit Post', action: `/admin/edit/${post.id}`,
    title: post.title || '', excerpt: post.excerpt || '',
    content: (post.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    categories: post.categories || '',
    published_checked: post.published ? 'checked' : '',
    featured_checked: post.featured ? 'checked' : '',
    current_image: post.cover_image ? `<div class="current-img"><img src="/uploads/${post.cover_image}" alt="cover"><p>Current cover image</p></div>` : ''
  }, res);
});

app.post('/admin/edit/:id', requireAuth, upload.single('cover_image'), (req, res) => {
  const { title, excerpt, content, categories, published, featured } = req.body;
  const existing = db.prepare(`SELECT cover_image FROM posts WHERE id=?`).get(req.params.id);
  db.prepare(`UPDATE posts SET title=?, excerpt=?, content=?, categories=?, cover_image=?, published=?, featured=?, updated_at=datetime('now') WHERE id=?`)
    .run(title, excerpt || '', content || '', categories || '', req.file ? req.file.filename : existing.cover_image, published ? 1 : 0, featured ? 1 : 0, req.params.id);
  res.redirect('/admin');
});

app.post('/admin/delete/:id', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM posts WHERE id=?`).run(req.params.id);
  res.redirect('/admin');
});

app.post('/admin/change-password', requireAuth, (req, res) => {
  const { new_password } = req.body;
  if (new_password && new_password.length >= 6) {
    db.prepare(`UPDATE settings SET value=? WHERE key='admin_password'`).run(bcrypt.hashSync('morecoffeeplease', 10));
  }
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🌸 The Thinking Room is running!       ║
║   → http://localhost:${PORT}               ║
║                                          ║
║   Admin: http://localhost:${PORT}/admin    ║
║   Default password: thinkingroom         ║
╚══════════════════════════════════════════╝`);
});
