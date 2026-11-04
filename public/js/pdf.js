import { condTxt, dateLong, dateObj, isNum, leadTxt, missTxt, money, sub, totals } from './calc.js';

export function buildPdf(s) {
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J) throw new Error('No se pudo cargar el generador de PDF. Recargá la página.');
  const doc = new J({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, CW = W - 2 * M, t = totals(s), marca = s.marca || 'Presupuesto';
  let y = 18;
  const INK = [20, 35, 58], MUTED = [86, 100, 122], ACC = [31, 79, 163], LINE = [203, 211, 223], TINT = [234, 240, 250];
  const base = { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 1.5, right: 1.5 }, lineColor: LINE };
  const fecha = dateObj(s.fecha);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor(...ACC); doc.text(marca, M, y + 3);
  doc.setFontSize(10.5); doc.setTextColor(...MUTED); doc.text('PRESUPUESTO', W - M, y - 1, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text((s.numero ? `N.º ${s.numero}  ·  ` : '') + (fecha ? dateLong(fecha) : ''), W - M, y + 3.6, { align: 'right' });
  y += 7; doc.setDrawColor(...ACC); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); y += 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
  const tl = doc.splitTextToSize(s.titulo || 'Presupuesto', CW); doc.text(tl, M, y); y += tl.length * 6.2;
  if (s.subtitulo) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
    const sl = doc.splitTextToSize(s.subtitulo, CW); doc.text(sl, M, y - 1); y += sl.length * 4.2 + 1;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  const ll = doc.splitTextToSize(leadTxt(s), CW - 8);
  const lh = ll.length * 4.8 + 5;
  doc.setFillColor(...TINT); doc.rect(M, y, CW, lh, 'F'); doc.setTextColor(...INK); doc.text(ll, M + 4, y + 5.4); y += lh + 7;

  const space = (need) => { if (y + need > H - 20) { doc.addPage(); y = 18; } };
  const h2 = (txt) => { space(22); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ACC); doc.text(txt, M, y); y += 2.5; };
  const para = (txt) => {
    if (!String(txt || '').trim()) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
    const l = doc.splitTextToSize(txt, CW); space(l.length * 4.2 + 2); y += 2; doc.text(l, M, y + 1.5); y += l.length * 4.2 + 1;
  };
  const tbl = (o) => {
    doc.autoTable({ startY: y, margin: { left: M, right: M, top: 18, bottom: 20 }, theme: 'plain', styles: base, rowPageBreak: 'avoid', ...o });
    y = doc.lastAutoTable.finalY + 7;
  };
  const ruled = (d) => {
    if (d.section === 'body') { doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); }
  };

  h2('Datos del presupuesto');
  tbl({
    body: [['Emisor', s.emisor], ['Contacto', s.contacto], ['CUIT y condición fiscal', s.cuit], ['Cliente', s.cliente], ['CUIT del cliente', s.clienteCuit], ['Lugar de instalación', s.lugar]],
    columnStyles: { 0: { cellWidth: 48, textColor: MUTED } }, didDrawCell: ruled,
  });

  if (s.intro || s.alcance.length) {
    h2('Objeto y alcance'); para(s.intro);
    if (s.alcance.length) tbl({ body: s.alcance.map((a) => [a.l, a.t]), columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } }, didDrawCell: ruled });
    else y += 6;
  }

  h2('Detalle de precios'); y += 1;
  const suf = t.miss.length ? ` (sin ${missTxt(t.miss)})` : '';
  const foot = [[{ content: (t.rate ? 'Subtotal sin IVA' : 'Subtotal') + suf, colSpan: 5, styles: { halign: 'right' } }, money(t.neto)]];
  if (t.rate) foot.push([{ content: `IVA ${String(t.rate).replace('.', ',')} %`, colSpan: 5, styles: { halign: 'right' } }, money(t.iva)]);
  foot.push([{ content: `${t.rate ? 'Total con IVA' : 'Total'}${suf} (USD)`, colSpan: 5, styles: { halign: 'right', fontSize: 10.5 } }, { content: money(t.total), styles: { fontSize: 10.5 } }]);
  tbl({
    head: [['N.º', 'Descripción', 'Cant.', 'Unidad', 'Precio unit. (USD)', 'Subtotal (USD)']],
    body: s.items.map((it, i) => { const v = sub(it); return [i + 1, it.d, it.q, it.u, isNum(it.p) ? money(Number(it.p)) : 'A cotizar', v === null ? 'A cotizar' : money(v)]; }),
    foot, showFoot: 'lastPage', showHead: 'everyPage',
    headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, valign: 'middle' },
    footStyles: { fontStyle: 'bold', textColor: INK, fillColor: TINT, halign: 'right' },
    columnStyles: { 0: { cellWidth: 9, textColor: MUTED }, 2: { cellWidth: 13, halign: 'right' }, 3: { cellWidth: 16 }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 25, halign: 'right' } },
    didParseCell: (d) => { if (d.section === 'head' && (d.column.index === 2 || d.column.index >= 4)) d.cell.styles.halign = 'right'; },
    didDrawCell: ruled,
  });

  const bullets = (title, arr) => {
    const rows = arr.filter((x) => String(x || '').trim());
    if (!rows.length) return;
    space(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK); doc.text(title, M, y + 1); y += 2;
    tbl({ body: rows.map((x) => ['•', x]), columnStyles: { 0: { cellWidth: 5 } }, styles: { ...base, cellPadding: { top: 0.8, bottom: 0.8, left: 1, right: 1 } } });
    y -= 3;
  };
  if (s.exclIntro || s.noIncl.length || s.cargo.length) {
    h2('Exclusiones y requisitos'); para(s.exclIntro); y += 3;
    bullets('No incluido', s.noIncl); bullets('A cargo del cliente', s.cargo); y += 3;
  }

  h2('Condiciones comerciales');
  tbl({ body: s.cond.map((c) => [c.l, condTxt(s, c)]), columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } }, didDrawCell: ruled });

  space(52);
  h2('Aceptación'); para(s.acept); y += 15;
  const col = (CW - 12) / 2;
  [[M, 'Por el cliente', ''], [M + col + 12, `Por ${marca}`, s.firmante]].forEach(([x, who, name]) => {
    doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.line(x, y, x + col, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK); doc.text(who, x, y + 4.5);
    doc.setFont('helvetica', 'normal'); doc.text('Firma', x, y + 9.5); doc.text(`Aclaración: ${name || ''}`, x, y + 14.5); doc.text('Fecha:', x, y + 19.5);
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(marca + (s.numero ? `  ·  Presupuesto N.º ${s.numero}` : ''), M, H - 10);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 10, { align: 'right' });
  }
  return doc;
}
