// Vista pública del presupuesto que recibe el cliente. Solo lectura.
import { condTxt, dateLong, dateObj, isNum, leadTxt, missTxt, money, sub, totals } from './calc.js';
import { buildPdf } from './pdf.js';
import { esc, fileBase, saveBlob } from './ui.js';

const app = document.getElementById('app');
const token = location.pathname.split('/').pop();
const nl = (t) => esc(t).replace(/\n/g, '<br>');

function render(s) {
  const t = totals(s), f = dateObj(s.fecha);
  const suf = t.miss.length ? ` (sin ${missTxt(t.miss)})` : '';
  document.title = `Presupuesto${s.numero ? ` ${s.numero}` : ''}: ${s.titulo || s.marca || ''}`;
  const data = [['Emisor', s.emisor], ['Contacto', s.contacto], ['CUIT y condición fiscal', s.cuit], ['Cliente', s.cliente], ['CUIT del cliente', s.clienteCuit], ['Lugar de instalación', s.lugar]]
    .filter(([, v]) => String(v || '').trim()).map(([k, v]) => `<div class="pair ro"><div class="lbl">${esc(k)}</div><div>${nl(v)}</div></div>`).join('');
  const rows = s.items.map((it, i) => {
    const v = sub(it);
    return `<div class="r ro"><div class="n">${i + 1}</div><div class="d">${nl(it.d)}</div><div class="num" data-l="Cant.">${esc(it.q)}</div><div data-l="Unidad">${esc(it.u)}</div><div class="num" data-l="Precio unit. (USD)">${isNum(it.p) ? money(Number(it.p)) : 'A cotizar'}</div><div class="num sub${v === null ? ' pend' : ''}" data-l="Subtotal (USD)">${v === null ? 'A cotizar' : money(v)}</div></div>`;
  }).join('');
  const bullets = (arr) => arr.filter((x) => String(x || '').trim()).map((x) => `<div class="item ro"><div class="dot">•</div><div>${nl(x)}</div></div>`).join('');
  app.innerHTML = `<div class="wrap">
    <div class="ver-actions"><span class="small">Presupuesto de ${esc(s.marca || '')}</span><button type="button" class="btn primary" id="pdf">Descargar PDF</button></div>
    <p class="msg" id="msg" role="status"></p>
    <main class="sheet">
      <div class="head"><div class="brand">${esc(s.marca || '')}</div><div class="kind">Presupuesto${s.numero ? ` N.º ${esc(s.numero)}` : ''}</div></div>
      <div class="titles"><h1>${esc(s.titulo || 'Presupuesto')}</h1>${s.subtitulo ? `<p class="t-sub-ro">${nl(s.subtitulo)}</p>` : ''}${f ? `<p class="small">${esc(dateLong(f))}</p>` : ''}</div>
      <p class="lead">${esc(leadTxt(s))}</p>
      <section><h2>Datos del presupuesto</h2><div>${data}</div></section>
      ${s.intro || s.alcance.length ? `<section><h2>Objeto y alcance</h2>${s.intro ? `<p>${nl(s.intro)}</p>` : ''}<div>${s.alcance.map((a) => `<div class="pair ro"><div class="lbl">${nl(a.l)}</div><div>${nl(a.t)}</div></div>`).join('')}</div></section>` : ''}
      <section><h2>Detalle de precios</h2><p class="small">Precios en dólares estadounidenses (USD).</p><div class="rows"><div class="r ro hd"><div class="n">N.º</div><div>Descripción</div><div class="num">Cant.</div><div>Unidad</div><div class="num">Precio unit.</div><div class="num">Subtotal</div></div>${rows}</div>
        <div class="tot"><div><span>${t.rate ? 'Subtotal sin IVA' : 'Subtotal'}${esc(suf)}</span><span class="v">USD ${money(t.neto)}</span></div>${t.rate ? `<div><span>IVA ${String(t.rate).replace('.', ',')} %</span><span class="v">USD ${money(t.iva)}</span></div>` : ''}<div class="grand"><span>${t.rate ? 'Total con IVA' : 'Total'}${esc(suf)}</span><span class="v">USD ${money(t.total)}</span></div></div></section>
      ${s.exclIntro || s.noIncl.length || s.cargo.length ? `<section><h2>Exclusiones y requisitos</h2>${s.exclIntro ? `<p>${nl(s.exclIntro)}</p>` : ''}<div class="cols"><div><h3>No incluido</h3>${bullets(s.noIncl)}</div><div><h3>A cargo del cliente</h3>${bullets(s.cargo)}</div></div></section>` : ''}
      <section><h2>Condiciones comerciales</h2><div>${s.cond.map((c) => `<div class="pair ro"><div class="lbl">${nl(c.l)}</div><div>${nl(condTxt(s, c))}</div></div>`).join('')}</div></section>
      <section><h2>Aceptación</h2><p>${nl(s.acept)}</p></section>
    </main></div>`;
  document.getElementById('pdf').onclick = () => {
    try { saveBlob(buildPdf(s).output('blob'), `${fileBase(s)}.pdf`); } catch (e) { document.getElementById('msg').textContent = e.message; }
  };
}
(async () => {
  try {
    const res = await fetch(`/api/public/${encodeURIComponent(token)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Este enlace ya no está disponible.');
    render(body.data);
  } catch (e) {
    app.innerHTML = `<div class="wrap"><div class="empty list"><h2>Presupuesto no disponible</h2><p>${esc(e.message)} Pedile al emisor un enlace nuevo.</p></div></div>`;
  }
})();
