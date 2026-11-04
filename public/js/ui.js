export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

/** Muestra el diálogo con contenido propio. Se cierra con close(valor). */
export function openDialog(html, setup) {
  const dlg = $('#dlg');
  dlg.innerHTML = html;
  return new Promise((resolve) => {
    const close = (v) => { dlg.close(); resolve(v); };
    dlg.oncancel = (e) => { e.preventDefault(); close(undefined); };
    if (setup) setup(dlg, close);
    dlg.showModal();
  });
}
/** buttons: [{label, value, cls}] */
export function ask(title, text, buttons) {
  const btns = buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('');
  return openDialog(`<div class="dlg"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="dlg-btns">${btns}</div></div>`, (dlg, close) => {
    dlg.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => close(buttons[+b.dataset.i].value); });
  });
}
export function fileBase(s) {
  const parts = ['Presupuesto', s.numero, s.cliente].filter((x) => String(x || '').trim()).join('_');
  return parts.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 90);
}
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const dateTime = (ms) => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
