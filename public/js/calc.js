// Cálculos y textos del presupuesto. Lo usan el navegador y el Worker.
export const isNum = (v) => v !== '' && v != null && Number.isFinite(Number(v));
export const money = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const sub = (it) => (isNum(it.q) && isNum(it.p) ? Math.round(Number(it.q) * Number(it.p) * 100) / 100 : null);

export function totals(s) {
  let neto = 0;
  const miss = [];
  (s.items || []).forEach((it, i) => {
    const v = sub(it);
    if (v === null) miss.push(i + 1); else neto += v;
  });
  neto = Math.round(neto * 100) / 100;
  // Descuento en porcentaje sobre el subtotal; el IVA se calcula sobre lo que queda.
  const pct = Math.min(100, Math.max(0, Number(s.desc) || 0));
  const desc = Math.round(neto * pct) / 100;
  const base = Math.round((neto - desc) * 100) / 100;
  const rate = Number(s.iva) || 0;
  const iva = Math.round(base * rate) / 100;
  return { neto, pct, desc, base, iva, total: Math.round((base + iva) * 100) / 100, miss, rate };
}
export const pctTxt = (n) => `${String(n).replace('.', ',')} %`;
export const missTxt = (m) => (m.length === 0 ? '' : m.length === 1 ? `ítem ${m[0]}` : `ítems ${m.join(', ')}`);
export function leadTxt(s) {
  const t = totals(s);
  let out = `Total de la oferta: USD ${money(t.total)}${t.rate ? ' con IVA' : ''}`;
  if (t.miss.length) out += `, sin incluir ${t.miss.length === 1 ? 'el' : 'los'} ${missTxt(t.miss)}`;
  return `${out}.`;
}
export function dateObj(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
}
export const dateLong = (d) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
export function ivaTxt(s) {
  const r = totals(s).rate;
  return r ? `${String(r).replace('.', ',')} %, detallado en el cuadro de precios.` : 'No se discrimina. El precio indicado es final.';
}
export function validezTxt(s) {
  const n = Math.max(0, parseInt(s.validez, 10) || 0);
  const d = dateObj(s.fecha);
  if (!d) return `${n} días corridos.`;
  d.setDate(d.getDate() + n);
  return `${n} días corridos, hasta el ${dateLong(d)}.`;
}
export const condTxt = (s, c) => (c.auto === 'iva' ? ivaTxt(s) : c.auto === 'validez' ? validezTxt(s) : c.t);

export const PENDING_FIELDS = [
  ['numero', 'N.º de presupuesto'], ['contacto', 'contacto'], ['cuit', 'CUIT del emisor'],
  ['cliente', 'cliente'], ['clienteCuit', 'CUIT del cliente'], ['lugar', 'lugar de instalación'],
];
export function pending(s) {
  return { fields: PENDING_FIELDS.filter(([k]) => !String(s[k] || '').trim()), miss: totals(s).miss };
}
export function pendingNames(s) {
  const p = pending(s);
  const names = p.fields.map((f) => f[1]);
  if (p.miss.length) names.push(`${missTxt(p.miss)} a cotizar`);
  return names;
}

/** Número en formato internacional para wa.me. Sin prefijo, asume Argentina. */
export function normalizePhone(raw) {
  const txt = String(raw || '').trim();
  let d = txt.replace(/\D/g, '');
  if (!d) return '';
  const intl = txt.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54') && (intl || d.length >= 12)) {
    return d.startsWith('549') ? d : `549${d.slice(2)}`;
  }
  if (intl) return d;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    for (const a of [2, 3, 4]) {
      if (d.slice(a, a + 2) === '15') { d = d.slice(0, a) + d.slice(a + 2); break; }
    }
  }
  return d.length === 10 ? `549${d}` : d;
}

export function nextNumero(list, year) {
  const pre = `${year}-`;
  let max = 0;
  for (const b of list) {
    const n = String(b.numero || '');
    if (n.startsWith(pre) && /^\d+$/.test(n.slice(pre.length))) max = Math.max(max, Number(n.slice(pre.length)));
  }
  return pre + String(max + 1).padStart(4, '0');
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const defaultConds = () => [
  { l: 'Moneda', t: 'USD. Pago en dólares o en pesos, al tipo de cambio vendedor del Banco Nación del día anterior al pago.' },
  { l: 'IVA', auto: 'iva' },
  { l: 'Forma de pago', t: '50 % de anticipo con la orden de compra, 40 % con el ensayo en banco aprobado y 10 % al finalizar la puesta en marcha.' },
  { l: 'Plazo de entrega', t: '' },
  { l: 'Garantía', t: '12 meses desde la puesta en marcha, sobre los equipos suministrados.' },
  { l: 'Validez de la oferta', auto: 'validez' },
];

/** Presupuesto en blanco; conserva los datos del emisor y las condiciones del último. */
export function blankBudget(last) {
  const l = last || {};
  return {
    marca: l.marca || 'ElectroNet', emisor: l.emisor || '', contacto: l.contacto || '', cuit: l.cuit || '',
    numero: '', fecha: todayIso(), validez: l.validez ?? 15,
    cliente: '', clienteCuit: '', lugar: '', clienteTel: '', clienteEmail: '',
    titulo: '', subtitulo: '', intro: '', alcance: [],
    items: [{ d: '', q: '1', u: 'global', p: '' }], iva: l.iva ?? '21', desc: '',
    exclIntro: '', noIncl: [], cargo: [],
    cond: l.cond ? JSON.parse(JSON.stringify(l.cond)) : defaultConds(),
    acept: l.acept || 'La firma de este presupuesto o la orden de compra confirman la aceptación del alcance y de las condiciones.',
    firmante: l.firmante || '',
  };
}
