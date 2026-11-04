import { api, setExpiredHandler } from './api.js';
import { blankBudget, money, nextNumero } from './calc.js';
import { Editor } from './editor.js';
import { trapezoide } from './trapezoide.js';
import { $, ask, dateTime, esc } from './ui.js';

const app = $('#app'), loginBox = $('#login');
let me = null, editor = null, cards = [], ignoreHash = false;

/* ---------- Inicio de sesión ---------- */
function showLogin(note) {
  return new Promise((resolve) => {
    app.hidden = true; loginBox.hidden = false;
    loginBox.innerHTML = `<div class="login-wrap"><form class="login" novalidate>
      <div class="logo">ElectroNet</div><h1>Iniciar sesión</h1>
      ${note ? `<p class="small">${esc(note)}</p>` : ''}
      <label class="field"><span>Correo</span><input id="l-email" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Contraseña</span><input id="l-pass" name="password" type="password" autocomplete="current-password" required></label>
      <p class="alert" id="l-err" role="alert"></p>
      <button class="btn primary" id="l-go">Ingresar</button></form></div>`;
    const form = $('form', loginBox), err = $('#l-err'), go = $('#l-go');
    $('#l-email').focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#l-email').value.trim(), password = $('#l-pass').value;
      if (!email || !password) { err.textContent = 'Completá el correo y la contraseña.'; return; }
      go.disabled = true; go.textContent = 'Ingresando…'; err.textContent = '';
      try {
        const r = await api('login', { method: 'POST', body: { email, password }, retry: false });
        me = r.user; loginBox.hidden = true; loginBox.innerHTML = ''; app.hidden = false;
        resolve();
      } catch (ex) {
        err.textContent = ex.message; go.disabled = false; go.textContent = 'Ingresar'; $('#l-pass').value = ''; $('#l-pass').focus();
      }
    };
  });
}
let relogin = null;
setExpiredHandler(() => {
  if (!relogin) relogin = showLogin('Tu sesión terminó. Ingresá de nuevo para seguir; lo que estabas editando se conserva.').finally(() => { relogin = null; });
  return relogin;
});

/* ---------- Navegación ---------- */
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
async function confirmLeave() {
  if (!editor || !editor.dirty) return true;
  const v = await ask('Cambios sin guardar', '¿Querés guardar este presupuesto antes de salir?', [
    { label: 'Seguir editando', value: 'stay' }, { label: 'Descartar', value: 'drop', cls: 'danger' }, { label: 'Guardar', value: 'save', cls: 'primary' },
  ]);
  if (v === 'save') return editor.save();
  return v === 'drop';
}
let currentHash = location.hash;
window.addEventListener('hashchange', async () => {
  if (ignoreHash) { ignoreHash = false; return; }
  const target = location.hash;
  if (!(await confirmLeave())) {
    ignoreHash = true; location.hash = currentHash;
    return;
  }
  route(target);
});
window.addEventListener('beforeunload', (e) => { if (editor && editor.dirty) e.preventDefault(); });

function closeEditor() { if (editor) { editor.destroy(); editor = null; } }
async function route() {
  currentHash = location.hash;
  closeEditor();
  const h = location.hash;
  const m = h.match(/^#\/b\/([\w-]+)$/);
  try {
    if (h === '#/nuevo' || h === '#/trapezoide') await openNew(h === '#/trapezoide');
    else if (m) await openExisting(m[1]);
    else await showList();
  } catch (e) {
    app.innerHTML = `<div class="wrap"><div class="empty list"><h2>No se pudo abrir</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Volver a la lista</a></div></div>`;
  }
}
function startEditor(opts) {
  editor = new Editor(app, {
    ...opts,
    onLeave: () => { go('#/'); },
    onSaved: (id) => { ignoreHash = true; currentHash = `#/b/${id}`; location.hash = currentHash; },
  });
}
async function freshBudget(useTrapezoide) {
  const { budgets } = await api('budgets');
  let last = null;
  if (budgets[0]) last = (await api(`budgets/${budgets[0].id}`)).data;
  const s = useTrapezoide ? trapezoide() : blankBudget(last);
  if (useTrapezoide && last) Object.assign(s, { contacto: last.contacto, cuit: last.cuit });
  s.numero = nextNumero(budgets, new Date().getFullYear());
  return s;
}
async function openNew(useTrapezoide) { startEditor({ state: await freshBudget(useTrapezoide) }); }
async function openExisting(id) {
  const r = await api(`budgets/${id}`);
  startEditor({ id: r.id, version: r.version, updatedAt: r.updated_at, state: r.data });
}

/* ---------- Lista ---------- */
function rowHtml(b) {
  const tags = [];
  if (b.sin_precio) tags.push(`<span class="tag w">${b.sin_precio} sin precio</span>`);
  if (b.share_token) tags.push(`<span class="tag" title="Enlace creado el ${esc(dateTime(b.shared_at))}">Enlace activo</span>`);
  return `<tr data-id="${esc(b.id)}">
    <td><a class="open" href="#/b/${esc(b.id)}">${esc(b.titulo || 'Sin título')}</a><span class="sec">${esc(b.numero || 'Sin número')}</span></td>
    <td>${esc(b.cliente || '—')}</td>
    <td class="r-al">USD ${money(b.total)}</td>
    <td>${tags.join(' ')}</td>
    <td class="r-al"><span class="sec">${esc(dateTime(b.updated_at))}</span></td>
    <td><div class="acts"><button type="button" class="btn" data-act="dup">Duplicar</button><button type="button" class="btn" data-act="del">Eliminar</button></div></td></tr>`;
}
function paintRows(q) {
  const t = String(q || '').toLowerCase();
  const rows = cards.filter((b) => !t || `${b.titulo} ${b.cliente} ${b.numero}`.toLowerCase().includes(t));
  $('#tbody').innerHTML = rows.map(rowHtml).join('') || '<tr><td colspan="6">No hay presupuestos que coincidan.</td></tr>';
}
async function showList() {
  const { budgets } = await api('budgets');
  cards = budgets;
  const top = `<div class="bar"><div class="bar-in"><span class="logo">ElectroNet</span><span class="spacer"></span><span class="who">${esc(me.name || me.email)}</span><button type="button" class="btn" id="out">Cerrar sesión</button><p class="msg" id="msg" role="status" aria-live="polite"></p></div></div>`;
  const body = budgets.length
    ? `<div class="list-head"><h1>Presupuestos</h1><div class="row-btns"><input class="search" id="q" type="search" placeholder="Buscar por título, cliente o número" aria-label="Buscar"><a class="btn primary" href="#/nuevo">Nuevo presupuesto</a></div></div>
       <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Presupuesto</th><th>Cliente</th><th class="r-al">Total</th><th>Estado</th><th class="r-al">Modificado</th><th></th></tr></thead><tbody id="tbody"></tbody></table></div>`
    : `<div class="empty"><h2>Todavía no hay presupuestos guardados</h2><p>Creá uno en blanco o empezá con el de Trapezoide y la consola para 9 ejes, con todos sus ítems y condiciones cargados.</p><div class="row-btns"><a class="btn primary" href="#/trapezoide">Cargar presupuesto de Trapezoide</a><a class="btn" href="#/nuevo">Nuevo en blanco</a></div></div>`;
  app.innerHTML = `${top}<div class="wrap"><div class="list">${body}</div></div>`;
  if (budgets.length) { paintRows(''); $('#q').oninput = (e) => paintRows(e.target.value); }
  $('#out').onclick = async () => {
    await api('logout', { method: 'POST', retry: false }).catch(() => {});
    me = null; app.innerHTML = '';
    await showLogin(); location.hash = '#/'; route();
  };
  app.querySelector('.list').onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('tr').dataset.id, card = cards.find((c) => c.id === id);
    const say = (t, err) => { const m = $('#msg'); m.textContent = t; m.classList.toggle('err', !!err); };
    try {
      if (b.dataset.act === 'del') {
        const extra = card.share_token ? ' El enlace enviado al cliente dejará de funcionar.' : '';
        const ok = await ask('Eliminar presupuesto', `Se borrará "${card.titulo || card.numero || 'Sin título'}" y no se puede recuperar.${extra}`, [{ label: 'Cancelar', value: false }, { label: 'Eliminar', value: true, cls: 'danger' }]);
        if (!ok) return;
        await api(`budgets/${id}`, { method: 'DELETE' });
        await showList();
      } else {
        const r = await api(`budgets/${id}`);
        const s = r.data;
        s.numero = nextNumero(cards, new Date().getFullYear());
        const c = await api('budgets', { method: 'POST', body: { data: s } });
        location.hash = `#/b/${c.id}`;
      }
    } catch (ex) { say(ex.message, true); }
  };
}

/* ---------- Arranque ---------- */
(async () => {
  try {
    const r = await api('me', { retry: false });
    me = r.user;
    app.hidden = false;
  } catch (e) {
    if (e.status === 401) await showLogin();
    else { document.body.insertAdjacentHTML('afterbegin', `<p class="alert">${esc(e.message)}</p>`); return; }
  }
  route();
})();
