import { leadTxt, normalizePhone, pendingNames } from './calc.js';
import { api, ApiError } from './api.js';
import { esc, fileBase, openDialog } from './ui.js';
import { buildPdf } from './pdf.js';

const defaultMessage = (s, url) => {
  const n = s.numero ? ` N.º ${s.numero}` : '';
  const tema = s.titulo ? `: ${s.titulo}` : '';
  return `Hola${s.cliente ? ` ${s.cliente}` : ''}. Te envío el presupuesto${n}${tema}.\n\n${leadTxt(s)}\n\nPodés verlo y descargarlo en PDF desde este enlace:\n${url}\n\n${s.marca || ''}`.trim();
};

export function waHref(phone, text) {
  const p = normalizePhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
export function mailHref(to, subject, body) {
  const addr = String(to || '').trim().split('@').map(encodeURIComponent).join('@');
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;
}

/** Diálogo de envío. El presupuesto ya está guardado; el enlace muestra esta versión. */
export async function openSend(editor) {
  const s = editor.state;
  let share;
  try { share = await api(`budgets/${editor.id}/share`, { method: 'POST' }); } catch (e) {
    if (e instanceof ApiError) editor.message(e.message, true);
    return;
  }
  const url = `${location.origin}/p/${share.token}`;
  const pend = pendingNames(s);
  const subject = `Presupuesto${s.numero ? ` N.º ${s.numero}` : ''}${s.titulo ? `: ${s.titulo}` : ''}`;
  const canFile = (() => {
    try { return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] }); } catch { return false; }
  })();
  const html = `<div class="dlg">
    <h2>Enviar presupuesto</h2>
    ${pend.length ? `<p class="warnbox">Faltan datos: ${esc(pend.join(', '))}.</p>` : ''}
    <div class="two">
      <label class="field"><span>WhatsApp del cliente</span><input id="s-tel" type="tel" autocomplete="off" value="${esc(s.clienteTel)}" placeholder="351 1234567"><small id="s-telh"></small></label>
      <label class="field"><span>Correo del cliente</span><input id="s-mail" type="email" autocomplete="off" value="${esc(s.clienteEmail)}" placeholder="cliente@empresa.com"></label>
    </div>
    <label class="field"><span>Mensaje</span><textarea id="s-text" rows="8"></textarea></label>
    <label class="field"><span>Enlace para el cliente</span><div class="link-row"><input id="s-url" readonly value="${esc(url)}"><button type="button" class="btn" id="s-copy">Copiar</button></div>
      <small>Muestra esta versión guardada. Si cambiás el presupuesto, volvé a abrir Enviar para actualizarlo.</small></label>
    <div class="row-btns">
      <a class="btn wa" id="s-wa" target="_blank" rel="noopener">Enviar por WhatsApp</a>
      <a class="btn primary" id="s-mailto">Enviar por correo</a>
      ${canFile ? '<button type="button" class="btn" id="s-file">Compartir PDF</button>' : ''}
    </div>
    <div class="dlg-btns"><button type="button" class="btn" id="s-off">Desactivar enlace</button><span class="spacer"></span><button type="button" class="btn" id="s-close">Cerrar</button></div>
  </div>`;
  await openDialog(html, (dlg, close) => {
    const q = (id) => dlg.querySelector(id);
    q('#s-text').value = defaultMessage(s, url);
    const sync = () => {
      const text = q('#s-text').value, tel = q('#s-tel').value;
      const n = normalizePhone(tel);
      q('#s-telh').textContent = tel.trim() ? `Se abrirá con +${n}` : 'Sin número, WhatsApp te deja elegir el contacto.';
      q('#s-wa').href = waHref(tel, text);
      q('#s-mailto').href = mailHref(q('#s-mail').value, subject, text);
    };
    sync();
    dlg.querySelectorAll('input,textarea').forEach((el) => { el.oninput = sync; });
    q('#s-copy').onclick = async (e) => {
      try { await navigator.clipboard.writeText(url); e.target.textContent = 'Copiado'; } catch { q('#s-url').select(); }
    };
    if (q('#s-file')) {
      q('#s-file').onclick = async () => {
        try {
          const blob = buildPdf(s).output('blob');
          await navigator.share({ files: [new File([blob], `${fileBase(s)}.pdf`, { type: 'application/pdf' })], text: q('#s-text').value });
        } catch (err) { if (err.name !== 'AbortError') editor.message('No se pudo compartir el PDF.', true); }
      };
    }
    q('#s-off').onclick = async (e) => {
      const b = e.target;
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = 'Confirmar: el enlace dejará de funcionar'; b.classList.add('danger');
        return;
      }
      try { await api(`budgets/${editor.id}/share`, { method: 'DELETE' }); editor.message('Enlace desactivado.'); close(false); } catch (err) { editor.message(err.message, true); close(false); }
    };
    q('#s-close').onclick = () => close(true);
  });
  const tel = document.getElementById('s-tel')?.value ?? s.clienteTel;
  const mail = document.getElementById('s-mail')?.value ?? s.clienteEmail;
  if (tel !== (s.clienteTel || '') || mail !== (s.clienteEmail || '')) {
    s.clienteTel = tel; s.clienteEmail = mail;
    editor.sync();
    await editor.save();
  }
}
