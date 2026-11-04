// Cliente de la API. Si la sesión venció, pide iniciar sesión y reintenta sin perder lo editado.
let onExpired = null;
export function setExpiredHandler(fn) { onExpired = fn; }

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function api(path, { method = 'GET', body, retry = true } = {}) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined || method !== 'GET' ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisá internet y probá de nuevo.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && retry && onExpired && path !== 'login' && path !== 'me') {
    await onExpired();
    return api(path, { method, body, retry: false });
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Ocurrió un error. Probá de nuevo.');
  return data;
}
