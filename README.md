# 🌸 The Thinking Room

A soothing personal blog website with a newspaper layout, pale blue watercolor aesthetic, and a full backend powered by Node.js + SQLite.

---

## ✨ Features

- **Beautiful frontend** — Pale blue watercolor clouds, Playfair Display typography, newspaper-style layout
- **Real database** — SQLite stores all your posts permanently
- **Admin panel** — Password-protected dashboard to write, edit, and publish posts
- **Image uploads** — Attach cover photos to each post
- **Markdown writing** — Write posts using Markdown (headings, bold, italics, quotes, lists)
- **Categories** — Organize posts into categories
- **Search** — Search across all your posts
- **Responsive** — Works beautifully on mobile too

---

## 🚀 Setup (5 minutes)

### 1. Make sure you have Node.js installed
Download from https://nodejs.org (version 16 or higher)

### 2. Install dependencies
Open your terminal in this folder and run:
```bash
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open your blog
Visit: **http://localhost:3000**

---

## 🔑 Admin Access

Go to **http://localhost:3000/admin** or click "Sign In" in the navigation.

| Username | Password |
|----------|----------|
| `admin`  | `thinkingroom2024` |

> ⚠️ **Change your password!** After logging in, open `server.js` and find this line:
> ```js
> const defaultPass = bcrypt.hashSync('thinkingroom2024', 10);
> ```
> Replace `thinkingroom2024` with your own password, then restart the server.

---

## 📝 Writing Posts

1. Go to `/admin` and log in
2. Click **"+ New Post"**
3. Fill in the title, excerpt, and content (Markdown is supported!)
4. Upload a cover image (optional)
5. Choose a category
6. Toggle **Published** to make it live, or leave as **Draft**
7. Click **Save**

### Markdown Quick Reference
```
## Heading
**Bold text**
*Italic text*
> A beautiful quote
- List item
```

---

## 📁 Project Structure

```
thinking-room/
├── server.js          ← Backend server (Node.js + Express)
├── thinking-room.db   ← Your database (created automatically)
├── uploads/           ← Your uploaded images
├── public/
│   ├── index.html     ← The app shell
│   ├── css/style.css  ← All the pretty styles
│   └── js/app.js      ← Frontend single-page app
└── package.json
```

---

## 🌐 Deploying Online (Optional)

To put your blog on the internet, you can deploy to:
- **Railway** (railway.app) — Free tier, easy Node.js deploy
- **Render** (render.com) — Free tier
- **Fly.io** — Free tier

For any of these, just push this folder and set the start command to `npm start`.

---

Made with ☁️ and slow mornings.
