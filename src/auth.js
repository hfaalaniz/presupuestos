// Autenticación: contraseñas con PBKDF2-SHA256 y sesiones en cookie HttpOnly.
export const ITERATIONS = 100000; // Máximo que admite WebCrypto en Workers.
const SESSION_MS = 30 * 864e5;
const WINDOW_MS = 15 * 60e3;
const LIMITS = { ue: 5, ip: 30, e: 50 };
const enc = new TextEncoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
// Se usa con correos inexistentes para que el tiempo de respuesta no los delate.
const DUMMY_SALT = new Uint8Array(16);

function cookieName(url) { return url.protocol === 'https:' ? '__Host-sid' : 'sid'; }
function sessionCookie(url, value, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(url)}=${value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export async function currentUser(req, env) {
  const url = new URL(req.url);
  const token = readCookie(req, cookieName(url));
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256(token), Date.now()).first();
  return row || null;
}

async function isLocked(env, keys, now) {
  for (const [kind, key] of keys) {
    const row = await env.DB.prepare('SELECT fails, first_at FROM login_attempts WHERE key = ?').bind(key).first();
    if (row && now - row.first_at < WINDOW_MS && row.fails >= LIMITS[kind]) return true;
  }
  return false;
}
async function recordFailure(env, keys, now) {
  await env.DB.batch(keys.map(([, key]) => env.DB.prepare(
    `INSERT INTO login_attempts (key, fails, first_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       fails = CASE WHEN ?2 - first_at >= ?3 THEN 1 ELSE fails + 1 END,
       first_at = CASE WHEN ?2 - first_at >= ?3 THEN ?2 ELSE first_at END`
  ).bind(key, now, WINDOW_MS)));
}

/** Devuelve {user, cookie} o {status, error}. */
export async function login(req, env, email, password) {
  const now = Date.now();
  const url = new URL(req.url);
  const norm = String(email || '').trim().toLowerCase();
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const keys = [['ue', `ue:${norm}|${ip}`], ['ip', `ip:${ip}`], ['e', `e:${norm}`]];
  if (await isLocked(env, keys, now)) {
    return { status: 429, error: 'Demasiados intentos fallidos. Esperá 15 minutos y volvé a probar.' };
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(norm).first();
  const salt = user ? unb64(user.pass_salt) : DUMMY_SALT;
  const derived = new Uint8Array(await pbkdf2(String(password || ''), salt, user ? user.iterations : ITERATIONS));
  if (!user || !sameBytes(derived, unb64(user.pass_hash))) {
    await recordFailure(env, keys, now);
    return { status: 401, error: 'Correo o contraseña incorrectos.' };
  }
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(keys[0][1]),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), user.id, now, now + SESSION_MS),
  ]);
  return {
    user: { id: user.id, email: user.email, name: user.name },
    cookie: sessionCookie(url, token, SESSION_MS / 1000),
  };
}

export async function logout(req, env) {
  const url = new URL(req.url);
  const token = readCookie(req, cookieName(url));
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return sessionCookie(url, '', 0);
}

export { b64 };
