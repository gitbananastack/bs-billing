const express = require('express');
const session = require('cookie-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const STORAGE_KEYS = new Set(['transactions', 'bills', 'quotations', 'staff', 'inventory', 'sales', 'purchases', 'profile', 'vendors']);
const STORAGE_SCREENS = {transactions:{read:['dashboard','reports','sales','quick-sale'],edit:['dashboard','sales','quick-sale','purchases']},bills:{read:['dashboard','bills'],edit:['bills']},quotations:{read:['quotations'],edit:['quotations']},staff:{read:['dashboard','staff'],edit:['staff']},inventory:{read:['dashboard','inventory','bills','purchases','quick-sale'],edit:['inventory','bills','purchases','quick-sale']},sales:{read:['dashboard','sales','quick-sale'],edit:['sales','quick-sale']},purchases:{read:['purchases'],edit:['purchases']},profile:{read:['dashboard'],edit:['dashboard']},vendors:{read:['vendors'],edit:['vendors']}};
const SCREEN_NAMES = ['dashboard','bills','quotations','inventory','purchases','quick-sale','sales','staff','vendors','reports'];

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

function readUsers(){ return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function publicUser(user){
  const admin = user.username === 'bnadmin' || user.role === 'admin';
  return {username:user.username,role:admin?'admin':'user',permissions:admin?{}:(user.permissions||{})};
}
function currentUser(req){ return readUsers().find(user=>user.username===req.session?.user); }
function isAdmin(user){ return !!user && (user.username === 'bnadmin' || user.role === 'admin'); }
function normalizePermissions(value){
  const permissions={};
  SCREEN_NAMES.forEach(screen=>{
    const grant=value && value[screen] || {};
    const edit=grant.edit===true;
    permissions[screen]={read:edit||grant.read===true,edit};
  });
  return permissions;
}
function requireAdmin(req,res,next){
  if(isAdmin(currentUser(req))) return next();
  return res.status(403).json({error:'Administrator access required'});
}
function authorizeStorage(req,res,mode){
  const user=currentUser(req);
  if(isAdmin(user)) return true;
  const screens=STORAGE_SCREENS[req.params.key]?.[mode]||[];
  if(screens.some(screen=>user?.permissions?.[screen]?.[mode]===true)) return true;
  res.status(403).json({error:`${mode==='edit'?'Edit':'Read'} access denied for ${screens.join(', ')||'this data'}`});
  return false;
}

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = user.username;
    res.json({ success: true, account:publicUser(user) });
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
  const user=currentUser(req);
  if (user) {
    res.json({ user: user.username, account:publicUser(user) });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req,res)=>{
  res.json({users:readUsers().map(user=>({ ...publicUser(user), protected:user.username==='bnadmin' }))});
});

app.put('/api/admin/users/:username', requireAuth, requireAdmin, (req,res)=>{
  const username=String(req.params.username||'').trim();
  const password=String(req.body.password||'');
  if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return res.status(400).json({error:'Username must be 3-40 letters, numbers, dots, underscores, or hyphens'});
  const users=readUsers();
  const existing=users.find(user=>user.username===username);
  if(username==='bnadmin') return res.status(400).json({error:'The protected bnadmin account cannot be changed here'});
  if(!existing && password.length<8) return res.status(400).json({error:'New user password must be at least 8 characters'});
  if(password && password.length<8) return res.status(400).json({error:'Password must be at least 8 characters'});
  const updated={username,role:'user',permissions:normalizePermissions(req.body.permissions)};
  if(password) updated.password=password;
  if(existing){
    if(password) existing.password=password;
    existing.role='user';
    existing.permissions=updated.permissions;
  }else users.push({...updated,password});
  fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2));
  res.json({success:true,user:publicUser(existing||updated)});
});

app.delete('/api/admin/users/:username', requireAuth, requireAdmin, (req,res)=>{
  const username=String(req.params.username||'');
  if(username==='bnadmin') return res.status(400).json({error:'The protected bnadmin account cannot be deleted'});
  const users=readUsers();
  const filtered=users.filter(user=>user.username!==username);
  if(filtered.length===users.length) return res.status(404).json({error:'User not found'});
  fs.writeFileSync(USERS_FILE,JSON.stringify(filtered,null,2));
  res.json({success:true});
});

// Generic file-based storage endpoints
app.get('/api/storage/:key', requireAuth, (req, res) => {
  if (!STORAGE_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Invalid storage key' });
  if (!authorizeStorage(req,res,'read')) return;
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
  if (!authorizeStorage(req,res,'edit')) return;
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
