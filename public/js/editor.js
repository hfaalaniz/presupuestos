import { leadTxt, missTxt, money, pending, pendingNames, sub, totals, validezTxt, ivaTxt } from './calc.js';
import { api } from './api.js';
import { ask, dateTime, esc, fileBase, saveBlob } from './ui.js';
import { buildPdf } from './pdf.js';
import { openSend } from './send.js';

const fi = (k, v, ph, cls, extra) => `<input id="f-${esc(k)}" data-k="${esc(k)}" value="${esc(v)}"${ph ? ` placeholder="${esc(ph)}"` : ''}${cls ? ` class="${cls}"` : ''}${extra || ''}>`;
const ta = (k, v, ph, cls, label) => `<textarea id="f-${esc(k)}" rows="1" data-k="${esc(k)}"${ph ? ` placeholder="${esc(ph)}"` : ''}${cls ? ` class="${cls}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}>${esc(v)}</textarea>`;
const del = (list, i) => `<button type="button" class="x" data-del="${list}:${i}" aria-label="Quitar fila ${i + 1}" title="Quitar">×</button>`;

/** Editor de un presupuesto. onLeave lleva a la lista. */
export class Editor {
  constructor(root, { id, version, state, updatedAt, onLeave, onSaved }) {
    Object.assign(this, { root, id, version, state, updatedAt, onLeave, onSaved });
    this.dirty = !id;
    this.saving = false;
    this.handlers();
    this.render();
  }
  destroy() { this.root.removeEventListener('input', this._in); this.root.removeEventListener('click', this._cl); window.removeEventListener('resize', this._gr); }

  handlers() {
    this._in = (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      const ks = k.split('.');
      let o = this.state;
      for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      o[ks[ks.length - 1]] = e.target.value;
      this.grow(e.target);
      this.markDirty();
      this.compute();
    };
    this._cl = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.del) { const [n, i] = b.dataset.del.split(':'); this.state[n].splice(+i, 1); this.markDirty(); this.render(); return; }
      if (b.dataset.add) { this.addRow(b.dataset.add); return; }
      const fn = { back: () => this.onLeave(), save: () => this.save(), pdf: () => this.pdf(), send: () => this.send(), chip: () => this.focusPending() }[b.id];
      if (fn) fn();
    };
    this._gr = () => this.growAll();
    this.root.addEventListener('input', this._in);
    this.root.addEventListener('click', this._cl);
    window.addEventListener('resize', this._gr);
  }
  addRow(n) {
    const arr = this.state[n];
    arr.push(n === 'items' ? { d: '', q: '1', u: 'global', p: '' } : n === 'alcance' || n === 'cond' ? { l: '', t: '' } : '');
    if (n === 'cond') { const v = arr.findIndex((c) => c.auto === 'validez'); if (v >= 0) arr.push(arr.splice(v, 1)[0]); }
    this.markDirty(); this.render();
    const idx = n === 'cond' ? arr.length - 2 : arr.length - 1;
    const el = document.getElementById(n === 'items' ? `f-items.${idx}.d` : n === 'alcance' || n === 'cond' ? `f-${n}.${idx}.l` : `f-${n}.${idx}`);
    if (el) el.focus();
  }
  view() {
    const s = this.state;
    const alcance = s.alcance.map((a, i) => `<div class="pair">${ta(`alcance.${i}.l`, a.l, 'Título', 'lbl', `Título del punto ${i + 1}`)}${ta(`alcance.${i}.t`, a.t, 'Detalle', '', `Detalle del punto ${i + 1}`)}${del('alcance', i)}</div>`).join('');
    const rows = s.items.map((it, i) => `<div class="r"><div class="n">${i + 1}</div><div class="d">${ta(`items.${i}.d`, it.d, 'Descripción', '', `Descripción del ítem ${i + 1}`)}</div>
      <div class="num" data-l="Cant.">${fi(`items.${i}.q`, it.q, '', '', ` type="number" min="0" step="any" aria-label="Cantidad del ítem ${i + 1}"`)}</div>
      <div data-l="Unidad">${fi(`items.${i}.u`, it.u, '', '', ` aria-label="Unidad del ítem ${i + 1}"`)}</div>
      <div class="num" data-l="Precio unit. (USD)">${fi(`items.${i}.p`, it.p, 'Precio', '', ` type="number" min="0" step="any" aria-label="Precio unitario del ítem ${i + 1}"`)}</div>
      <div class="num sub" data-l="Subtotal (USD)" id="sub-${i}"></div>${del('items', i)}</div>`).join('');
    const list = (name) => s[name].map((t, i) => `<div class="item"><div class="dot">•</div>${ta(`${name}.${i}`, t, 'Texto', '', `Punto ${i + 1}`)}${del(name, i)}</div>`).join('') + `<button type="button" class="add" data-add="${name}">Agregar punto</button>`;
    const cond = s.cond.map((c, i) => `<div class="pair">${ta(`cond.${i}.l`, c.l, 'Condición', 'lbl', `Nombre de la condición ${i + 1}`)}${c.auto ? `<div class="auto" data-auto="${c.auto}"></div><span></span>` : ta(`cond.${i}.t`, c.t, 'Detalle', '', `Detalle de la condición ${i + 1}`) + del('cond', i)}</div>`).join('');
    return `<div class="bar"><div class="bar-in">
      <button type="button" class="btn" id="back">← Presupuestos</button>
      <span class="state" id="state"></span><button type="button" class="chip" id="chip"></button><span class="spacer"></span>
      <button type="button" class="btn" id="pdf">Descargar PDF</button>
      <button type="button" class="btn" id="send">Enviar</button>
      <button type="button" class="btn primary" id="save">Guardar</button>
      <p class="msg" id="msg" role="status" aria-live="polite"></p></div></div>
    <div class="wrap"><main class="sheet">
      <div class="head">${fi('marca', s.marca, 'Tu marca', 'brand', ' aria-label="Marca"')}<div class="kind">Presupuesto</div></div>
      <div class="titles">${ta('titulo', s.titulo, 'Título del presupuesto', 't-title', 'Título')}${ta('subtitulo', s.subtitulo, '', 't-sub', 'Subtítulo')}</div>
      <p class="lead" id="lead"></p>
      <section><h2>Datos del presupuesto</h2><div class="kv">
        <label><span>Presupuesto N.º</span>${fi('numero', s.numero, 'Completar')}</label>
        <label><span>Fecha</span>${fi('fecha', s.fecha, '', '', ' type="date"')}</label>
        <label class="wide"><span>Emisor</span>${fi('emisor', s.emisor, 'Completar')}</label>
        <label><span>Contacto del emisor</span>${fi('contacto', s.contacto, 'Teléfono y correo')}</label>
        <label><span>CUIT y condición fiscal del emisor</span>${fi('cuit', s.cuit, 'Completar')}</label>
        <label class="wide"><span>Cliente</span>${fi('cliente', s.cliente, 'Razón social')}</label>
        <label><span>CUIT del cliente</span>${fi('clienteCuit', s.clienteCuit, 'Completar')}</label>
        <label><span>Lugar de instalación</span>${fi('lugar', s.lugar, 'Completar')}</label>
        <label><span>WhatsApp del cliente (no se imprime)</span>${fi('clienteTel', s.clienteTel, 'Opcional', 'opt', ' type="tel"')}</label>
        <label><span>Correo del cliente (no se imprime)</span>${fi('clienteEmail', s.clienteEmail, 'Opcional', 'opt', ' type="email"')}</label>
        <label><span>Validez de la oferta (días corridos)</span>${fi('validez', s.validez, '', '', ' type="number" min="0" step="1"')}</label>
      </div></section>
      <section><h2>Objeto y alcance</h2>${ta('intro', s.intro, 'Descripción general', '', 'Descripción general')}<div>${alcance}</div><button type="button" class="add" data-add="alcance">Agregar punto</button></section>
      <section><h2>Detalle de precios</h2><p class="small">Precios en dólares estadounidenses (USD). Un ítem sin precio queda “A cotizar” y no suma al total.</p><div class="rows">
        <div class="r hd"><div class="n">N.º</div><div>Descripción</div><div class="num">Cant.</div><div>Unidad</div><div class="num">Precio unit.</div><div class="num">Subtotal</div><span></span></div>${rows}</div>
        <button type="button" class="add" data-add="items">Agregar ítem</button>
        <div class="tot"><div><span id="t-neto-l"></span><span class="v" id="t-neto"></span></div>
        <div><label for="f-desc">Descuento ${fi('desc', s.desc, '0', 'opt pct', ' type="number" min="0" max="100" step="0.5"')} %</label><span class="v" id="t-desc"></span></div>
        <div id="t-base-r"><span id="t-base-l"></span><span class="v" id="t-base"></span></div>
        <div><label for="iva">IVA <select id="iva" data-k="iva"><option value="21">21 %</option><option value="10.5">10,5 %</option><option value="0">No discriminar (monotributo)</option></select></label><span class="v" id="t-iva"></span></div>
        <div class="grand"><span id="t-total-l"></span><span class="v" id="t-total"></span></div></div></section>
      <section><h2>Exclusiones y requisitos</h2>${ta('exclIntro', s.exclIntro, 'Texto', '', 'Introducción de exclusiones')}<div class="cols"><div><h3>No incluido</h3>${list('noIncl')}</div><div><h3>A cargo del cliente</h3>${list('cargo')}</div></div></section>
      <section><h2>Condiciones comerciales</h2><div>${cond}</div><button type="button" class="add" data-add="cond">Agregar condición</button></section>
      <section><h2>Aceptación</h2>${ta('acept', s.acept, 'Texto', '', 'Texto de aceptación')}<div class="signs"><div><strong>Por el cliente</strong><span>Firma:</span><span>Aclaración:</span><span>Fecha:</span></div><div><strong>Por <span id="sign-brand"></span></strong><span>Firma:</span><label>Aclaración: ${fi('firmante', s.firmante, 'Nombre', 'opt')}</label><span>Fecha:</span></div></div></section>
    </main></div>`;
  }
  grow(el) { if (el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  growAll() { this.root.querySelectorAll('textarea').forEach((t) => this.grow(t)); }
  render() {
    const y = window.scrollY;
    this.root.innerHTML = this.view();
    this.root.querySelector('#iva').value = String(this.state.iva);
    this.growAll(); this.compute(); this.paintState(); window.scrollTo(0, y);
  }
  /** Vuelve a pintar luego de cambiar el estado desde afuera del formulario. */
  sync() { this.markDirty(); this.render(); }
  compute() {
    const s = this.state, t = totals(s), q = (id) => this.root.querySelector(id);
    s.items.forEach((it, i) => { const e = q(`#sub-${i}`), v = sub(it); if (!e) return; e.textContent = v === null ? 'A cotizar' : money(v); e.classList.toggle('pend', v === null); });
    const suf = t.miss.length ? ` (sin ${missTxt(t.miss)})` : '';
    q('#lead').textContent = leadTxt(s);
    q('#t-neto-l').textContent = (t.rate ? 'Subtotal sin IVA' : 'Subtotal') + suf;
    q('#t-neto').textContent = `USD ${money(t.neto)}`;
    q('#t-desc').textContent = t.pct ? `− USD ${money(t.desc)}` : '—';
    q('#t-base-r').hidden = !t.pct;
    q('#t-base-l').textContent = `Subtotal con descuento${suf}`;
    q('#t-base').textContent = `USD ${money(t.base)}`;
    q('#t-iva').textContent = t.rate ? `USD ${money(t.iva)}` : '—';
    q('#t-total-l').textContent = (t.rate ? 'Total con IVA' : 'Total') + suf;
    q('#t-total').textContent = `USD ${money(t.total)}`;
    q('#sign-brand').textContent = s.marca || 'el emisor';
    this.root.querySelectorAll('[data-auto]').forEach((e) => { e.textContent = e.dataset.auto === 'iva' ? ivaTxt(s) : validezTxt(s); });
    const p = pending(s), n = p.fields.length + p.miss.length, chip = q('#chip');
    chip.textContent = n ? `${n} ${n === 1 ? 'dato por completar' : 'datos por completar'}` : 'Datos completos';
    chip.classList.toggle('ok', !n);
  }
  markDirty() { this.dirty = true; this.paintState(); }
  paintState() {
    const e = this.root.querySelector('#state'); if (!e) return;
    e.textContent = this.saving ? 'Guardando…' : this.dirty ? 'Cambios sin guardar' : this.updatedAt ? `Guardado ${dateTime(this.updatedAt)}` : '';
    e.classList.toggle('dirty', this.dirty && !this.saving);
    const b = this.root.querySelector('#save'); if (b) b.disabled = this.saving;
  }
  message(t, err) { const m = this.root.querySelector('#msg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } }
  focusPending() {
    const p = pending(this.state);
    let el = null;
    if (p.fields.length) el = document.getElementById(`f-${p.fields[0][0]}`);
    else if (p.miss.length) el = document.getElementById(`f-items.${p.miss[0] - 1}.p`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  }
  async save() {
    if (this.saving) return false;
    this.saving = true; this.paintState(); this.message('');
    const before = JSON.stringify(this.state);
    try {
      const r = this.id
        ? await api(`budgets/${this.id}`, { method: 'PUT', body: { data: this.state, version: this.version } })
        : await api('budgets', { method: 'POST', body: { data: this.state } });
      const wasNew = !this.id;
      this.id = r.id; this.version = r.version; this.updatedAt = r.updated_at;
      this.dirty = JSON.stringify(this.state) !== before;
      this.saving = false; this.paintState();
      if (wasNew && this.onSaved) this.onSaved(this.id);
      return true;
    } catch (e) {
      this.saving = false; this.paintState();
      if (e.status === 409) return this.conflict();
      this.message(e.message, true);
      return false;
    }
  }
  async conflict() {
    const v = await ask('Este presupuesto cambió', 'Se guardó otra versión desde otra ventana o dispositivo. Podés guardar lo tuyo como un presupuesto nuevo o cargar la otra versión.', [
      { label: 'Cancelar', value: 'x' }, { label: 'Cargar la otra versión', value: 'reload', cls: 'danger' }, { label: 'Guardar como nuevo', value: 'copy', cls: 'primary' },
    ]);
    if (v === 'reload') {
      const r = await api(`budgets/${this.id}`);
      this.state = r.data; this.version = r.version; this.updatedAt = r.updated_at; this.dirty = false; this.render();
      this.message('Cargué la última versión guardada.');
      return true;
    }
    if (v === 'copy') { this.id = null; this.version = null; return this.save(); }
    return false;
  }
  pdf() {
    try {
      saveBlob(buildPdf(this.state).output('blob'), `${fileBase(this.state)}.pdf`);
      const names = pendingNames(this.state);
      this.message(names.length ? `PDF descargado. Quedaron sin completar: ${names.join(', ')}.` : 'PDF descargado.');
    } catch (e) { this.message(e.message || 'No se pudo generar el PDF.', true); }
  }
  async send() {
    if ((this.dirty || !this.id) && !(await this.save())) return;
    await openSend(this);
  }
}
