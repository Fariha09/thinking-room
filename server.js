const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const cloudinary = require('cloudinary').v2;
const { query, pool } = require('./db/database');

const app = express();

// Trust Render's reverse proxy so secure cookies work over HTTPS
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Cloudinary config ────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Multer (memory storage — no local disk) ──────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Images only'));
  }
});

// Upload buffer to Cloudinary, return secure URL
async function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'thinking-room', resource_type: 'image' },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

// ── Middleware ───────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'thinking-room-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

const requireAuth = (req, res, next) => req.session.admin ? next() : res.redirect('/admin/login');

// ── Helpers ──────────────────────────────────────────
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function readTime(content) {
  const words = (content || '').replace(/#|\*|`|>/g, '').trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
function buildPostCard(post) {
  const img = post.cover_image
    ? `<div class="card-img"><img src="${post.cover_image}" alt="${post.title}" loading="lazy"></div>`
    : `<div class="card-img card-img-placeholder"><div class="placeholder-icon">☁️</div></div>`;
  const cats = post.categories
    ? post.categories.split(',').map(c => `<span class="tag">${c.trim()}</span>`).join('')
    : '';
  return `<article class="post-card">${img}<div class="card-body">
    <div class="card-meta">
      <span class="card-date">${formatDate(post.created_at)}</span>
      <span class="card-readtime">🕐 ${readTime(post.content)}</span>
      <span class="card-views">👁 ${post.view_count || 0}</span>
      <div class="card-tags">${cats}</div>
    </div>
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
      html = html.split(`{{${k}}}`).join(String(replacements[k] !== undefined ? replacements[k] : ''));
    });
    res.send(html);
  });
}

// ══════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ══════════════════════════════════════════════════════

app.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const offset = (page - 1) * limit;
    const search = req.query.q || '';
    const category = req.query.cat || '';

    let postsResult, totalResult;
    if (search) {
      postsResult  = await query(`SELECT * FROM posts WHERE published=TRUE AND (title ILIKE $1 OR content ILIKE $1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [`%${search}%`, limit, offset]);
      totalResult  = await query(`SELECT COUNT(*) FROM posts WHERE published=TRUE AND (title ILIKE $1 OR content ILIKE $1)`, [`%${search}%`]);
    } else if (category) {
      postsResult  = await query(`SELECT * FROM posts WHERE published=TRUE AND categories ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [`%${category}%`, limit, offset]);
      totalResult  = await query(`SELECT COUNT(*) FROM posts WHERE published=TRUE AND categories ILIKE $1`, [`%${category}%`]);
    } else {
      postsResult  = await query(`SELECT * FROM posts WHERE published=TRUE ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
      totalResult  = await query(`SELECT COUNT(*) FROM posts WHERE published=TRUE`);
    }

    const posts = postsResult.rows;
    const total = parseInt(totalResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    const featuredResult = await query(`SELECT * FROM posts WHERE published=TRUE AND featured=TRUE ORDER BY created_at DESC LIMIT 1`);
    const featured = featuredResult.rows[0];

    const catsResult = await query(`SELECT DISTINCT categories FROM posts WHERE published=TRUE AND categories != ''`);
    const allCats = [...new Set(catsResult.rows.flatMap(r => r.categories.split(',').map(c => c.trim())))].filter(Boolean);

    const featuredHTML = featured ? `
      <section class="featured-post${!featured.cover_image ? ' featured-no-img' : ''}">
        ${featured.cover_image ? `<div class="featured-img"><img src="${featured.cover_image}" alt="${featured.title}" loading="lazy"></div>` : ''}
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
  } catch(e) {
    console.error(e);
    res.status(500).send('Something went wrong 😔');
  }
});

app.get('/post/:slug', async (req, res) => {
  try {
    const postResult = await query(`SELECT * FROM posts WHERE slug=$1 AND published=TRUE`, [req.params.slug]);
    const post = postResult.rows[0];
    if (!post) return res.redirect('/');

    await query(`UPDATE posts SET view_count = view_count + 1 WHERE id=$1`, [post.id]);

    const relatedResult = await query(`SELECT * FROM posts WHERE published=TRUE AND id != $1 ORDER BY RANDOM() LIMIT 3`, [post.id]);
    const commentsResult = await query(`SELECT * FROM comments WHERE post_id=$1 AND approved=TRUE ORDER BY created_at ASC`, [post.id]);
    const comments = commentsResult.rows;

    const commentsHTML = comments.length
      ? comments.map(c => `
          <div class="comment">
            <div class="comment-header">
              <span class="comment-avatar">${c.name.charAt(0).toUpperCase()}</span>
              <div>
                <span class="comment-name">${c.name}</span>
                <span class="comment-date">${formatDate(c.created_at)}</span>
              </div>
            </div>
            <p class="comment-body">${c.body.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>
          </div>`).join('')
      : '<p class="no-comments">No comments yet. Be the first to share your thoughts! 🌸</p>';

    renderFile(path.join(__dirname, 'views/post.html'), {
      title: post.title,
      date: formatDate(post.created_at),
      readtime: readTime(post.content),
      viewcount: (post.view_count || 0) + 1,
      categories: post.categories ? post.categories.split(',').map(c => `<span class="tag">${c.trim()}</span>`).join('') : '',
      cover: post.cover_image ? `<img src="${post.cover_image}" alt="${post.title}" class="post-cover">` : '',
      content: marked(post.content || ''),
      excerpt: post.excerpt || '',
      related: relatedResult.rows.map(buildPostCard).join(''),
      postid: post.id,
      comments: commentsHTML,
      commentcount: comments.length
    }, res);
  } catch(e) {
    console.error(e);
    res.status(500).send('Something went wrong 😔');
  }
});

// ══════════════════════════════════════════════════════
//  COMMENTS
// ══════════════════════════════════════════════════════

app.post('/post/:id/comment', async (req, res) => {
  const { name, body } = req.body;
  try {
    const postResult = await query(`SELECT slug FROM posts WHERE id=$1 AND published=TRUE`, [req.params.id]);
    const post = postResult.rows[0];
    if (!post || !name || !body) return res.redirect('back');
    await query(`INSERT INTO comments (post_id, name, body, approved) VALUES ($1,$2,$3,TRUE)`,
      [req.params.id, name.trim().substring(0,80), body.trim().substring(0,2000)]);
    res.redirect(`/post/${post.slug}#comments`);
  } catch(e) { console.error(e); res.redirect('back'); }
});

// ══════════════════════════════════════════════════════
//  NEWSLETTER
// ══════════════════════════════════════════════════════

app.post('/newsletter/subscribe', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !email.includes('@')) return res.redirect('back');
  try {
    await query(`INSERT INTO subscribers (email, name) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING`,
      [email.trim(), (name||'').trim()]);
  } catch(e) { console.error(e); }
  res.redirect('/?subscribed=1');
});

// ══════════════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════════════

app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  renderFile(path.join(__dirname, 'views/admin/login.html'), { error: '' }, res);
});

app.post('/admin/login', async (req, res) => {
  try {
    const result = await query(`SELECT value FROM settings WHERE key='admin_password'`);
    const adminPass = result.rows[0];
    if (adminPass && bcrypt.compareSync(req.body.password, adminPass.value)) {
      req.session.admin = true;
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session error');
        }
        return res.redirect('/admin');
      });
      return;
    }
  } catch(e) { console.error(e); }
  renderFile(path.join(__dirname, 'views/admin/login.html'), {
    error: '<p class="error-msg">Incorrect password. Try again.</p>'
  }, res);
});

app.get('/admin/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const postsResult   = await query(`SELECT * FROM posts ORDER BY created_at DESC`);
    const posts         = postsResult.rows;
    const published     = posts.filter(p => p.published).length;
    const commentsCount = (await query(`SELECT COUNT(*) FROM comments`)).rows[0].count;
    const pendingCount  = (await query(`SELECT COUNT(*) FROM comments WHERE approved=FALSE`)).rows[0].count;
    const subsCount     = (await query(`SELECT COUNT(*) FROM subscribers`)).rows[0].count;
    const topPosts      = (await query(`SELECT title, slug, view_count FROM posts WHERE published=TRUE ORDER BY view_count DESC LIMIT 5`)).rows;

    const topPostsHTML = topPosts.map((p, i) => `
      <div style="display:flex;align-items:flex-start;gap:11px;padding:10px 0;border-bottom:1px solid rgba(174,214,241,0.15);">
        <span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--sky-deep),var(--lav-deep));color:white;font-size:0.63rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i+1}</span>
        <a href="/post/${p.slug}" target="_blank" style="flex:1;font-size:0.84rem;color:var(--ink);text-decoration:none;line-height:1.4">${p.title}</a>
        <span style="font-size:0.7rem;font-weight:700;color:var(--ink-faint);white-space:nowrap">👁 ${p.view_count || 0}</span>
      </div>`).join('') || '<p style="color:var(--ink-faint);font-size:0.84rem;padding:8px 0">No views yet.</p>';

    renderFile(path.join(__dirname, 'views/admin/dashboard.html'), {
      totalPosts: posts.length,
      published,
      drafts: posts.length - published,
      totalComments: commentsCount,
      pendingComments: pendingCount,
      totalSubs: subsCount,
      topPosts: topPostsHTML,
      rows: posts.map(p => `
        <tr>
          <td>${p.title}</td>
          <td><span class="badge ${p.published ? 'badge-pub' : 'badge-draft'}">${p.published ? 'Published' : 'Draft'}</span></td>
          <td>${formatDate(p.created_at)}</td>
          <td style="text-align:center">👁 ${p.view_count || 0}</td>
          <td class="actions">
            <a href="/admin/edit/${p.id}" class="btn-sm btn-edit">Edit</a>
            <a href="/post/${p.slug}" target="_blank" class="btn-sm btn-view">View</a>
            <form method="POST" action="/admin/delete/${p.id}" style="display:inline" onsubmit="return confirm('Delete this post?')">
              <button type="submit" class="btn-sm btn-del">Delete</button>
            </form>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-faint)">No posts yet! 🌸</td></tr>'
    }, res);
  } catch(e) { console.error(e); res.status(500).send('Error loading dashboard'); }
});

app.get('/admin/new', requireAuth, (req, res) => {
  renderFile(path.join(__dirname, 'views/admin/editor.html'), {
    pageTitle: 'New Post', action: '/admin/new',
    title: '', excerpt: '', content: '', categories: '',
    published_checked: '', featured_checked: '', current_image: ''
  }, res);
});

app.post('/admin/new', requireAuth, upload.single('cover_image'), async (req, res) => {
  try {
    const { title, excerpt, content, categories, published, featured } = req.body;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Date.now();
    let cover = null;
    if (req.file) cover = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    await query(
      `INSERT INTO posts (title,slug,excerpt,content,categories,cover_image,published,featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, slug, excerpt||'', content||'', categories||'', cover, !!published, !!featured]
    );
    res.redirect('/admin');
  } catch(e) { console.error(e); res.status(500).send('Error creating post'); }
});

app.get('/admin/edit/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM posts WHERE id=$1`, [req.params.id]);
    const post = result.rows[0];
    if (!post) return res.redirect('/admin');
    renderFile(path.join(__dirname, 'views/admin/editor.html'), {
      pageTitle: 'Edit Post', action: `/admin/edit/${post.id}`,
      title: post.title||'', excerpt: post.excerpt||'',
      content: (post.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
      categories: post.categories||'',
      published_checked: post.published ? 'checked' : '',
      featured_checked:  post.featured  ? 'checked' : '',
      current_image: post.cover_image
        ? `<div class="current-img"><img src="${post.cover_image}" alt="cover"><p>Current cover image</p></div>`
        : ''
    }, res);
  } catch(e) { console.error(e); res.redirect('/admin'); }
});

app.post('/admin/edit/:id', requireAuth, upload.single('cover_image'), async (req, res) => {
  try {
    const { title, excerpt, content, categories, published, featured } = req.body;
    let cover = (await query(`SELECT cover_image FROM posts WHERE id=$1`, [req.params.id])).rows[0]?.cover_image;
    if (req.file) cover = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    await query(
      `UPDATE posts SET title=$1,excerpt=$2,content=$3,categories=$4,cover_image=$5,published=$6,featured=$7,updated_at=NOW() WHERE id=$8`,
      [title, excerpt||'', content||'', categories||'', cover, !!published, !!featured, req.params.id]
    );
    res.redirect('/admin');
  } catch(e) { console.error(e); res.status(500).send('Error updating post'); }
});

app.post('/admin/delete/:id', requireAuth, async (req, res) => {
  await query(`DELETE FROM posts WHERE id=$1`, [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/change-password', requireAuth, async (req, res) => {
  const { new_password } = req.body;
  if (new_password && new_password.length >= 6) {
    await query(`UPDATE settings SET value=$1 WHERE key='admin_password'`, [bcrypt.hashSync(new_password, 10)]);
  }
  res.redirect('/admin');
});

// Admin: comments
app.get('/admin/comments', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*, p.title as post_title, p.slug as post_slug
      FROM comments c JOIN posts p ON c.post_id = p.id
      ORDER BY c.created_at DESC`);
    const comments = result.rows;
    renderFile(path.join(__dirname, 'views/admin/comments.html'), {
      total: comments.length,
      pending: comments.filter(c => !c.approved).length,
      rows: comments.map(c => `
        <tr>
          <td>${c.name}</td>
          <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.body}</td>
          <td><a href="/post/${c.post_slug}" target="_blank" style="color:var(--accent)">${c.post_title}</a></td>
          <td><span class="badge ${c.approved ? 'badge-pub' : 'badge-draft'}">${c.approved ? 'Approved' : 'Pending'}</span></td>
          <td>${formatDate(c.created_at)}</td>
          <td class="actions">
            ${!c.approved ? `<form method="POST" action="/admin/comments/${c.id}/approve" style="display:inline"><button class="btn-sm btn-edit" type="submit">Approve</button></form>` : ''}
            <form method="POST" action="/admin/comments/${c.id}/delete" style="display:inline" onsubmit="return confirm('Delete?')">
              <button class="btn-sm btn-del" type="submit">Delete</button>
            </form>
          </td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-faint)">No comments yet.</td></tr>'
    }, res);
  } catch(e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/admin/comments/:id/approve', requireAuth, async (req, res) => {
  await query(`UPDATE comments SET approved=TRUE WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/comments');
});
app.post('/admin/comments/:id/delete', requireAuth, async (req, res) => {
  await query(`DELETE FROM comments WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/comments');
});

// Admin: subscribers
app.get('/admin/subscribers', requireAuth, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM subscribers ORDER BY created_at DESC`);
    const subs = result.rows;
    renderFile(path.join(__dirname, 'views/admin/subscribers.html'), {
      total: subs.length,
      emails: subs.map(s => s.email).join(', '),
      rows: subs.map(s => `
        <tr>
          <td>${s.name||'—'}</td>
          <td>${s.email}</td>
          <td>${formatDate(s.created_at)}</td>
          <td class="actions">
            <form method="POST" action="/admin/subscribers/${s.id}/delete" style="display:inline" onsubmit="return confirm('Remove?')">
              <button class="btn-sm btn-del" type="submit">Remove</button>
            </form>
          </td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-faint)">No subscribers yet.</td></tr>'
    }, res);
  } catch(e) { console.error(e); res.status(500).send('Error'); }
});
app.post('/admin/subscribers/:id/delete', requireAuth, async (req, res) => {
  await query(`DELETE FROM subscribers WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/subscribers');
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🌸 The Thinking Room is running!       ║
║   → http://localhost:${PORT}               ║
╚══════════════════════════════════════════╝`);
});
