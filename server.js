const express = require('express');
const session = require('cookie-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const STORAGE_KEYS = new Set(['transactions', 'bills', 'quotations', 'staff', 'inventory', 'sales', 'purchases', 'profile']);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Initialize default users
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([
    { username: 'bnadmin', password: 'bnadmin' }
  ], null, 2));
}

app.use(express.json());
app.use(session({
  name: 'bsession',
  keys: [process.env.SESSION_SECRET || 'banana-stack-local-session-2026'],
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = user.username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

// Check session
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// Generic file-based storage endpoints
app.get('/api/storage/:key', requireAuth, (req, res) => {
  if (!STORAGE_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Invalid storage key' });
  const filePath = path.join(DATA_DIR, `${req.params.key}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      res.json({ value: data });
    } else {
      res.json({ value: null });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to read data' });
  }
});

app.put('/api/storage/:key', requireAuth, (req, res) => {
  if (!STORAGE_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Invalid storage key' });
  const filePath = path.join(DATA_DIR, `${req.params.key}.json`);
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(req.body.value, null, 2));
    fs.renameSync(tempPath, filePath);
    res.json({ success: true });
  } catch (e) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    res.status(500).json({ error: 'Failed to write data' });
  }
});

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'bananastack-billing-app.html'));
});

// Serve static assets (logo, etc.)
app.use(express.static(__dirname, {
  index: false,
  dotfiles: 'ignore'
}));

app.listen(PORT, () => {
  console.log(`BananaStack Billing running at http://localhost:${PORT}`);
});
