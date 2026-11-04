import { currentUser, login, logout, randomToken } from './auth.js';
import { totals } from '../public/js/calc.js';

const MAX_BODY = 256 * 1024;
const NO_CACHE = { 'cache-control': 'no-store' };
const PUBLIC_HEADERS = { 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', ...NO_CACHE };

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...NO_CACHE, ...headers },
});
const fail = (status, error) => json({ error }, status);

async function readJson(req) {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) throw new HttpError(413, 'El presupuesto es demasiado grande.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Los datos enviados no son válidos.'); }
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function checkData(d) {
  const ok = d && typeof d === 'object' && !Array.isArray(d)
    && ['items', 'alcance', 'noIncl', 'cargo', 'cond'].every((k) => Array.isArray(d[k]))
    && d.items.every((i) => i && typeof i === 'object')
    && d.alcance.every((i) => i && typeof i === 'object')
    && d.cond.every((i) => i && typeof i === 'object');
  if (!ok) throw new HttpError(400, 'El presupuesto tiene un formato inválido.');
  return d;
}
function summary(d) {
  const t = totals(d);
  return {
    numero: String(d.numero || '').slice(0, 100),
    cliente: String(d.cliente || '').slice(0, 300),
    titulo: String(d.titulo || '').slice(0, 300),
    total: t.total,
    sin_precio: t.miss.length,
  };
}
const META = 'id, numero, cliente, titulo, total, sin_precio, version, share_token, shared_at, created_at, updated_at';

async function budgets(req, env, user, id, action) {
  const m = req.method;
  if (!id) {
    if (m === 'GET') {
      const { results } = await env.DB.prepare(`SELECT ${META} FROM budgets WHERE user_id = ? ORDER BY updated_at DESC`).bind(user.id).all();
      return json({ budgets: results });
    }
    if (m === 'POST') {
      const { data } = await readJson(req);
      const d = checkData(data), s = summary(d), now = Date.now(), newId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO budgets (id, user_id, numero, cliente, titulo, total, sin_precio, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(newId, user.id, s.numero, s.cliente, s.titulo, s.total, s.sin_precio, JSON.stringify(d), now, now).run();
      return json({ id: newId, version: 1, updated_at: now }, 201);
    }
    return fail(405, 'Método no permitido.');
  }

  const row = await env.DB.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) return fail(404, 'No encontré ese presupuesto.');

  if (action === 'share') {
    if (m === 'POST') {
      const token = row.share_token || randomToken(), now = Date.now();
      await env.DB.prepare('UPDATE budgets SET share_token = ?, shared_data = data, shared_at = ? WHERE id = ?').bind(token, now, id).run();
      return json({ token, shared_at: now });
    }
    if (m === 'DELETE') {
      await env.DB.prepare('UPDATE budgets SET share_token = NULL, shared_data = NULL, shared_at = NULL WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    return fail(405, 'Método no permitido.');
  }
  if (action) return fail(404, 'Ruta inexistente.');

  if (m === 'GET') {
    const { user_id, shared_data, data, ...meta } = row;
    return json({ ...meta, data: JSON.parse(data) });
  }
  if (m === 'PUT') {
    const body = await readJson(req);
    const d = checkData(body.data), s = summary(d), now = Date.now();
    const r = await env.DB.prepare(
      `UPDATE budgets SET numero = ?, cliente = ?, titulo = ?, total = ?, sin_precio = ?, data = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND version = ?`
    ).bind(s.numero, s.cliente, s.titulo, s.total, s.sin_precio, JSON.stringify(d), now, id, user.id, Number(body.version)).run();
    if (!r.meta.changes) return fail(409, 'Este presupuesto cambió en otra ventana o dispositivo.');
    return json({ id, version: Number(body.version) + 1, updated_at: now });
  }
  if (m === 'DELETE') {
    await env.DB.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return json({ ok: true });
  }
  return fail(405, 'Método no permitido.');
}

async function publicBudget(env, token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Enlace inválido.' }, 404, PUBLIC_HEADERS);
  const row = await env.DB.prepare('SELECT shared_data, shared_at FROM budgets WHERE share_token = ?').bind(token).first();
  if (!row || !row.shared_data) return json({ error: 'Este enlace ya no está disponible.' }, 404, PUBLIC_HEADERS);
  const { clienteTel, clienteEmail, ...data } = JSON.parse(row.shared_data);
  return json({ data, shared_at: row.shared_at }, 200, PUBLIC_HEADERS);
}

async function api(req, env, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // sin "api"
  const m = req.method;

  // Protección CSRF: las escrituras deben venir de este mismo origen y en JSON.
  if (m !== 'GET' && m !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'Origen no permitido.');
    if (!origin && req.headers.get('sec-fetch-site') === 'cross-site') return fail(403, 'Origen no permitido.');
    if (!(req.headers.get('content-type') || '').startsWith('application/json')) return fail(415, 'Se esperaba JSON.');
  }

  if (parts[0] === 'public' && parts[1] && m === 'GET') return publicBudget(env, parts[1]);

  if (parts[0] === 'login' && m === 'POST') {
    const { email, password } = await readJson(req);
    const r = await login(req, env, email, password);
    if (r.error) return fail(r.status, r.error);
    return json({ user: { email: r.user.email, name: r.user.name } }, 200, { 'set-cookie': r.cookie });
  }
  if (parts[0] === 'logout' && m === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': await logout(req, env) });
  }

  const user = await currentUser(req, env);
  if (!user) return fail(401, 'Tu sesión terminó. Volvé a iniciar sesión.');
  if (parts[0] === 'me' && m === 'GET') return json({ user: { email: user.email, name: user.name } });
  if (parts[0] === 'budgets') return budgets(req, env, user, parts[1], parts[2]);
  return fail(404, 'Ruta inexistente.');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
      if (/^\/p\/[^/]+$/.test(url.pathname)) {
        const res = await env.ASSETS.fetch(new Request(new URL('/ver', url), req));
        const out = new Response(res.body, res);
        for (const [k, v] of Object.entries(PUBLIC_HEADERS)) out.headers.set(k, v);
        return out;
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      console.error(e);
      return fail(500, 'Ocurrió un error en el servidor. Probá de nuevo.');
    }
  },
};
