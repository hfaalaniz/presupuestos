import test from 'node:test';
import assert from 'node:assert/strict';
import { leadTxt, nextNumero, normalizePhone, totals, validezTxt } from '../public/js/calc.js';

test('totales con IVA e ítem sin precio', () => {
  const s = { iva: '21', items: [{ q: '1', p: '' }, { q: '2', p: '280' }, { q: '60', p: '30' }] };
  const t = totals(s);
  assert.deepEqual([t.neto, t.iva, t.total, t.miss], [2360, 495.6, 2855.6, [1]]);
  assert.match(leadTxt(s), /con IVA, sin incluir el ítem 1\.$/);
});
test('descuento en porcentaje antes del IVA', () => {
  const t = totals({ iva: '21', desc: '10', items: [{ q: '1', p: '' }, { q: '2', p: '500' }] });
  assert.deepEqual([t.neto, t.pct, t.desc, t.base, t.iva, t.total], [1000, 10, 100, 900, 189, 1089]);
});
test('descuento sin IVA discriminado y con decimales', () => {
  const t = totals({ iva: '0', desc: '12.5', items: [{ q: '3', p: '33.33' }] });
  assert.deepEqual([t.neto, t.desc, t.base, t.iva, t.total], [99.99, 12.5, 87.49, 0, 87.49]);
});
test('descuento vacío, negativo o mayor que 100', () => {
  const it = [{ q: '1', p: '200' }];
  assert.equal(totals({ iva: '0', items: it }).total, 200);
  assert.equal(totals({ iva: '0', desc: '-5', items: it }).total, 200);
  assert.equal(totals({ iva: '21', desc: '150', items: it }).total, 0);
});
test('sin IVA discriminado', () => {
  assert.equal(totals({ iva: '0', items: [{ q: '1', p: '100' }] }).total, 100);
});
test('validez cruza de mes', () => {
  assert.match(validezTxt({ validez: 30, fecha: '2026-11-04' }), /4 de diciembre de 2026/);
});
for (const [input, want] of [
  ['+54 9 351 123-4567', '5493511234567'], ['351 1234567', '5493511234567'],
  ['0351 15 123 4567', '5493511234567'], ['11 15 1234 5678', '5491112345678'],
  ['5493511234567', '5493511234567'], ['543511234567', '5493511234567'],
  ['+34 612 345 678', '34612345678'], ['0034612345678', '34612345678'], ['', ''],
]) test(`teléfono ${input || '(vacío)'}`, () => assert.equal(normalizePhone(input), want));
test('numeración correlativa', () => {
  assert.equal(nextNumero([{ numero: '2026-0007' }, { numero: 'X' }, { numero: '2025-0100' }], 2026), '2026-0008');
  assert.equal(nextNumero([], 2026), '2026-0001');
});
