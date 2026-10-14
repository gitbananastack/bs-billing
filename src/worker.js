const STORAGE_KEYS = new Set(['transactions', 'bills', 'quotations', 'staff', 'inventory', 'sales', 'purchases', 'profile', 'vendors']);
const STORAGE_SCREENS = {transactions:{read:['dashboard','reports','sales','quick-sale'],edit:['dashboard','sales','quick-sale','purchases']},bills:{read:['dashboard','bills'],edit:['bills']},quotations:{read:['quotations'],edit:['quotations']},staff:{read:['dashboard','staff'],edit:['staff']},inventory:{read:['dashboard','inventory','bills','purchases','quick-sale'],edit:['inventory','bills','purchases','quick-sale']},sales:{read:['dashboard','sales','quick-sale'],edit:['sales','quick-sale']},purchases:{read:['purchases'],edit:['purchases']},profile:{read:['dashboard'],edit:['dashboard']},vendors:{read:['vendors'],edit:['vendors']}};
const SCREEN_NAMES = ['dashboard','bills','quotations','inventory','purchases','quick-sale','sales','staff','vendors','reports'];
const USERS_KEY = 'users';
const SESSION_COOKIE = 'bsession';
const SESSION_MAX_AGE = 24 * 60 * 60; // seconds

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookieHeader(name, value, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  parts.push(maxAge > 0 ? `Max-Age=${maxAge}` : 'Max-Age=0');
  return parts.join('; ');
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Session state lives entirely in a signed cookie since Workers have no server-side session store.
async function createSessionCookie(username, secret) {
  const payload = JSON.stringify({ user: username, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  const encoded = btoa(payload);
  const sig = await hmacSign(encoded, secret);
  return `${encoded}.${sig}`;
}

async function verifySessionCookie(cookieValue, secret) {
  if (!cookieValue) return null;
  const [encoded, sig] = cookieValue.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = await hmacSign(encoded, secret);
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(atob(encoded));
    if (payload.exp < Date.now()) return null;
    return payload.user;
  } catch {
    return null;
  }
}

async function requireAuth(request, env) {
  const secret = env.SESSION_SECRET || 'banana-stack-local-session-2026';
  return verifySessionCookie(getCookie(request, SESSION_COOKIE), secret);
}

async function getUsers(env) {
  const raw = await env.BS_KV.get(USERS_KEY);
  if (raw) return JSON.parse(raw);
  const defaultUsers = [{ username: 'bnadmin', password: 'bnadmin', role:'admin' }];
  await env.BS_KV.put(USERS_KEY, JSON.stringify(defaultUsers));
  return defaultUsers;
}

function publicUser(user){
  const admin=user.username==='bnadmin'||user.role==='admin';
  return {username:user.username,role:admin?'admin':'user',permissions:admin?{}:(user.permissions||{})};
}
function isAdmin(user){ return !!user&&(user.username==='bnadmin'||user.role==='admin'); }
function normalizePermissions(value){
  const permissions={};
  SCREEN_NAMES.forEach(screen=>{
    const grant=value&&value[screen]||{},edit=grant.edit===true;
    permissions[screen]={read:edit||grant.read===true,edit};
  });
  return permissions;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const secret = env.SESSION_SECRET || 'banana-stack-local-session-2026';

    if (pathname === '/api/login' && request.method === 'POST') {
      const { username, password } = await request.json();
      const users = await getUsers(env);
      const user = users.find(u => u.username === username && u.password === password);
      if (!user) return json({ error: 'Invalid credentials' }, { status: 401 });
      const cookieValue = await createSessionCookie(user.username, secret);
      return json({ success: true, account:publicUser(user) }, { headers: { 'Set-Cookie': setCookieHeader(SESSION_COOKIE, cookieValue, SESSION_MAX_AGE) } });
    }

    if (pathname === '/api/logout' && request.method === 'POST') {
      return json({ success: true }, { headers: { 'Set-Cookie': setCookieHeader(SESSION_COOKIE, '', 0) } });
    }

    if (pathname === '/api/me' && request.method === 'GET') {
      const user = await requireAuth(request, env);
      if (!user) return json({ error: 'Not logged in' }, { status: 401 });
      const users=await getUsers(env),account=users.find(item=>item.username===user);
      if(!account) return json({ error:'User account no longer exists' }, { status:401 });
      return json({ user, account:publicUser(account) });
    }

    if(pathname==='/api/admin/users' && request.method==='GET'){
      const username=await requireAuth(request,env);
      if(!username)return json({error:'Unauthorized'},{status:401});
      const users=await getUsers(env),account=users.find(item=>item.username===username);
      if(!isAdmin(account))return json({error:'Administrator access required'},{status:403});
      return json({users:users.map(user=>({...publicUser(user),protected:user.username==='bnadmin'}))});
    }

    const adminUserMatch=pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(adminUserMatch && ['PUT','DELETE'].includes(request.method)){
      const username=await requireAuth(request,env);
      if(!username)return json({error:'Unauthorized'},{status:401});
      let users=await getUsers(env);
      const actor=users.find(item=>item.username===username);
      if(!isAdmin(actor))return json({error:'Administrator access required'},{status:403});
      const target=decodeURIComponent(adminUserMatch[1]);
      if(target==='bnadmin')return json({error:'The protected bnadmin account cannot be changed here'},{status:400});
      const index=users.findIndex(item=>item.username===target);
      if(request.method==='DELETE'){
        if(index<0)return json({error:'User not found'},{status:404});
        users=users.filter(item=>item.username!==target);
        await env.BS_KV.put(USERS_KEY,JSON.stringify(users));
        return json({success:true});
      }
      const body=await request.json(),newUsername=String(body.username||target).trim(),password=String(body.password||'');
      if(!/^[a-zA-Z0-9._-]{3,40}$/.test(newUsername))return json({error:'Username must be 3-40 letters, numbers, dots, underscores, or hyphens'},{status:400});
      if(newUsername==='bnadmin')return json({error:'The protected bnadmin account cannot be changed here'},{status:400});
      const duplicate=users.some((item,i)=>i!==index&&item.username===newUsername);
      if(duplicate)return json({error:'Username already exists'},{status:409});
      if(index<0&&password.length<8)return json({error:'New user password must be at least 8 characters'},{status:400});
      if(password&&password.length<8)return json({error:'Password must be at least 8 characters'},{status:400});
      const updated={username:newUsername,role:'user',permissions:normalizePermissions(body.permissions)};
      if(password)updated.password=password;
      if(index>=0){if(password)users[index].password=password;users[index]={...users[index],...updated};}
      else users.push({...updated,password});
      await env.BS_KV.put(USERS_KEY,JSON.stringify(users));
      return json({success:true,user:publicUser(updated)});
    }

    const storageMatch = pathname.match(/^\/api\/storage\/([^/]+)$/);
    if (storageMatch) {
      const key = storageMatch[1];
      if (!STORAGE_KEYS.has(key)) return json({ error: 'Invalid storage key' }, { status: 400 });
      const user = await requireAuth(request, env);
      if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

      const users=await getUsers(env),account=users.find(item=>item.username===user);
      if(!account)return json({error:'User account no longer exists'},{status:401});
      if(!isAdmin(account)){
        const mode=request.method==='GET'?'read':request.method==='PUT'?'edit':null;
        const screens=mode?STORAGE_SCREENS[key]?.[mode]||[]:[];
        const allowed=screens.some(screen=>account.permissions?.[screen]?.[mode]===true);
        if(!allowed)return json({error:`${mode==='edit'?'Edit':'Read'} access denied for ${screens.join(', ')||'this data'}`},{status:403});
      }

      if (request.method === 'GET') {
        const raw = await env.BS_KV.get(key);
        return json({ value: raw ? JSON.parse(raw) : null });
      }
      if (request.method === 'PUT') {
        const body = await request.json();
        await env.BS_KV.put(key, JSON.stringify(body.value));
        return json({ success: true });
      }
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Fall through to static assets (index.html, logo images, etc.)
    return env.ASSETS.fetch(request);
  }
};
