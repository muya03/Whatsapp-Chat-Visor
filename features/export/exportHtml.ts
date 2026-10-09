import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { Session } from '../../app/state/store';
import { parseRichText, type RichNode } from '../../parser/whatsapp/richText';
import { isMissedCall } from '../../parser/whatsapp/systemMessages';
import type { ChatMessage } from '../../parser/whatsapp/types';
import { formatBytes, formatDateLong, formatTime, senderColorIndex, type TimeFormat } from '../../utils/format';
import baseCss from '../../styles/base.css?inline';
import chatCss from '../../styles/chat.css?inline';
import layoutCss from '../../styles/layout.css?inline';
import themesCss from '../../styles/themes.css?inline';
import tokensCss from '../../styles/tokens.css?inline';
import doodleSvg from '../../styles/doodle.svg?raw';

export type ExportMode = 'html' | 'zip';

export interface ExportOptions {
  mode: ExportMode;
  title: string;
  theme: 'light' | 'dark';
  skin: 'web' | 'android' | 'ios';
  timeFormat: TimeFormat;
  signal?: AbortSignal;
  onProgress?: (ratio: number, label: string) => void;
}

export interface ExportSummary {
  attachmentsTotal: number;
  available: number;
  omitted: number;
  missing: number;
  availableBytes: number;
}

/** Cuenta qué adjuntos se podrían exportar y cuáles no (para informar antes de generar nada). */
export function summarizeExport(session: Session): ExportSummary {
  let attachmentsTotal = 0;
  let available = 0;
  let omitted = 0;
  let missing = 0;
  let availableBytes = 0;
  for (const m of session.chat.messages) {
    for (const a of m.attachments) {
      attachmentsTotal++;
      if (a.omitted) omitted++;
      else {
        const f = session.imported.media.resolve(a.fileName);
        if (f) {
          available++;
          availableBytes += f.size;
        } else missing++;
      }
    }
  }
  return { attachmentsTotal, available, omitted, missing, availableBytes };
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function nodesToHtml(nodes: RichNode[]): string {
  let out = '';
  for (const n of nodes) {
    switch (n.t) {
      case 'text': out += esc(n.v); break;
      case 'bold': out += `<strong>${nodesToHtml(n.c)}</strong>`; break;
      case 'italic': out += `<em>${nodesToHtml(n.c)}</em>`; break;
      case 'strike': out += `<s>${nodesToHtml(n.c)}</s>`; break;
      case 'mono': out += `<code>${esc(n.v)}</code>`; break;
      case 'code': out += `<pre class="code">${esc(n.v)}</pre>`; break;
      case 'quote': out += `<blockquote>${nodesToHtml(n.c)}</blockquote>`; break;
      case 'link': out += `<a href="${esc(n.href)}" target="_blank" rel="noopener noreferrer nofollow">${esc(n.v)}</a>`; break;
    }
  }
  return out;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'chat';

function attachmentHtml(
  m: ChatMessage,
  session: Session,
  mode: ExportMode,
  mediaPaths: Map<string, string>,
): { html: string; visual: boolean } {
  let html = '';
  let visual = m.attachments.length > 0;
  for (const a of m.attachments) {
    if (a.omitted) {
      html += `<div class="card"><span class="card__text"><span class="card__name">Contenido multimedia omitido</span><span class="card__sub">No incluido al exportar el chat</span></span></div>`;
      visual = false;
      continue;
    }
    const file = session.imported.media.resolve(a.fileName);
    const name = esc(a.fileName ?? 'archivo');
    if (!file || mode !== 'zip') {
      const why = !file ? 'Archivo no incluido en la exportación original' : 'Adjunto no incluido en esta copia';
      html += `<div class="card"><span class="card__text"><span class="card__name" dir="auto">${name}</span><span class="card__sub">${why}</span></span></div>`;
      visual = false;
      continue;
    }
    const href = esc(mediaPaths.get(file.key) ?? '');
    if (a.kind === 'image' || a.kind === 'sticker') html += `<a class="media media--button${a.kind === 'sticker' ? ' media--sticker' : ''}" href="${href}" target="_blank" rel="noopener"><img class="media__img" src="${href}" alt="${name}" loading="lazy"></a>`;
    else if (a.kind === 'video' || a.kind === 'gif') html += `<div class="media"><video controls preload="metadata" src="${href}"></video></div>`;
    else if (a.kind === 'audio' || a.kind === 'voice') html += `<div class="card"><audio controls preload="none" src="${href}" style="width:100%"></audio></div>`;
    else {
      html += `<a class="card" href="${href}" download><span class="card__text"><span class="card__name" dir="auto">${name}</span><span class="card__sub">${formatBytes(file.size)}</span></span></a>`;
      visual = false;
    }
    if (!(a.kind === 'image' || a.kind === 'sticker' || a.kind === 'video' || a.kind === 'gif')) visual = false;
  }
  return { html, visual };
}

function messageHtml(m: ChatMessage, first: boolean, side: 'in' | 'out', showName: boolean, o: ExportOptions, session: Session, mediaPaths: Map<string, string>): string {
  const time = esc(formatTime(m.ts, m.rawTime, o.timeFormat, session.chat.sourceHour12));
  const att = attachmentHtml(m, session, o.mode, mediaPaths);
  const hasText = m.text.length > 0 && m.kind !== 'location';
  const mediaOnly = att.visual && !hasText;
  const cls = ['bubble', `bubble--${side}`, first ? 'bubble--tail' : '', mediaOnly ? 'bubble--media-only' : att.visual ? 'bubble--captioned' : ''].filter(Boolean).join(' ');
  const name = showName && m.sender ? `<div class="bubble__sender truncate" dir="auto" style="--sender-color:var(--sender-${senderColorIndex(m.sender)})">${esc(m.sender)}</div>` : '';
  let body = '';
  if (m.kind === 'call') body = `<div class="bubble__text" dir="auto" style="${isMissedCall(m.text) ? 'color:var(--c-danger)' : ''}">${esc(m.text)}<span class="bubble__spacer"></span></div>`;
  else if (m.kind === 'deleted') body = `<div class="bubble__text" dir="auto" style="font-style:italic;color:var(--c-text-2)">${esc(m.text)}<span class="bubble__spacer"></span></div>`;
  else if (m.kind === 'location' && m.locationUrl) body = `<div class="card"><span class="card__text"><span class="card__name">Ubicación compartida</span><a class="card__sub" href="${esc(m.locationUrl)}" target="_blank" rel="noopener noreferrer nofollow">Ver en el mapa</a></span></div><div style="height:15px"></div>`;
  else if (hasText) body = `<div class="bubble__text" dir="auto">${nodesToHtml(parseRichText(m.text))}<span class="bubble__spacer"></span></div>`;
  else if (!att.visual && m.attachments.length > 0) body = '<div style="height:15px"></div>';
  return `<div class="row row--${side} ${first ? 'row--first' : 'row--cont'}"><div class="${cls}">${name}${att.html}${body}<span class="bubble__meta"><time>${time}</time></span></div></div>`;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Genera la copia visual. Todo ocurre en el navegador; nada se envía a ningún servidor. */
export async function buildExport(session: Session, o: ExportOptions): Promise<{ blob: Blob; fileName: string }> {
  const { rows } = session.rows;
  const messages = session.chat.messages;
  const me = session.me;
  const neutral = me === null;
  const mediaPaths = new Map<string, string>();
  const mediaToWrite: { key: string; path: string; file: NonNullable<ReturnType<Session['imported']['media']['resolve']>> }[] = [];

  if (o.mode === 'zip') {
    const used = new Set<string>();
    for (const m of messages)
      for (const a of m.attachments) {
        const file = a.omitted ? null : session.imported.media.resolve(a.fileName);
        if (!file || mediaPaths.has(file.key)) continue;
        let name = safeName(file.name);
        while (used.has(name.toLowerCase())) name = `${mediaToWrite.length}-${name}`;
        used.add(name.toLowerCase());
        const path = `media/${name}`;
        mediaPaths.set(file.key, encodeURI(path).replace(/#/g, '%23'));
        mediaToWrite.push({ key: file.key, path, file });
      }
  }

  const parts: string[] = [];
  const css = [tokensCss, themesCss, baseCss, layoutCss, chatCss]
    .join('\n')
    .replace(/url\('\.\/doodle\.svg'\)/g, `url("data:image/svg+xml,${encodeURIComponent(doodleSvg)}")`)
    .replace(/body \{[^}]*overflow: hidden;[^}]*\}/, 'body { font-family: var(--font-ui); background: var(--c-app-bg); color: var(--c-text); margin: 0; }')
    .replace(/html, body, #root \{[^}]*\}/, 'html, body { margin: 0; }');

  const subtitle = `${session.chat.participants.length} participantes · ${messages.filter((m) => m.kind !== 'system').length.toLocaleString('es')} mensajes`;
  parts.push(
    `<!doctype html><html lang="es" data-resolved-theme="${o.theme}" data-skin="${o.skin}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(o.title)}</title><style>${css}\n.export-wrap{max-width:980px;margin:0 auto;background:var(--c-chat-bg);min-height:100vh;position:relative}.export-list{position:relative;padding:8px var(--chat-gutter) 28px}.export-foot{position:relative;text-align:center;padding:14px;font-size:12.5px;color:var(--c-text-2)}.hdr{position:sticky;top:0;z-index:3}.hdr__sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bubble--media-only a.media{display:block}</style></head><body><div class="export-wrap"><header class="hdr hdr--chat"><div class="hdr__main"><span class="hdr__text"><span class="hdr__title">${esc(o.title)}</span><span class="hdr__sub" dir="auto">${esc(subtitle)}</span></span></div></header><main class="chat" style="min-height:60vh"><div class="export-list">`,
  );

  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i++) {
    if (o.signal?.aborted) throw new DOMException('cancelled', 'AbortError');
    const row = rows[i]!;
    if (row.t === 'date') parts.push(`<div class="row row--center row--chip"><span class="chip chip--date">${esc(formatDateLong(row.dayKey))}</span></div>`);
    else {
      const m = messages[row.msg]!;
      if (row.t === 'sys') parts.push(`<div class="row row--center row--chip"><span class="chip${m.system === 'encryption' ? ' chip--notice' : ''}" dir="auto">${esc(m.text)}</span></div>`);
      else {
        const side = !neutral && m.sender === me ? 'out' : 'in';
        const showName = row.first && side === 'in' && (neutral || session.chat.isGroup);
        parts.push(messageHtml(m, row.first, side, showName, o, session, mediaPaths));
      }
    }
    if (i % CHUNK === 0) {
      o.onProgress?.((i / rows.length) * (o.mode === 'zip' ? 0.3 : 0.9), 'Generando la conversación…');
      await tick();
    }
  }
  parts.push(`</div></main><div class="export-foot">Copia estática de una exportación de chat generada con Visor de chat. No está conectada a ninguna cuenta.</div></div></body></html>`);
  const html = parts.join('');
  const fileBase = safeName(o.title);

  if (o.mode === 'html') {
    o.onProgress?.(1, 'Listo');
    return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), fileName: `${fileBase}.html` };
  }

  // HTML + adjuntos: ZIP. Los adjuntos ya vienen comprimidos (nivel 0 = solo almacenar).
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, { signal: o.signal } as never);
  await zip.add(`${fileBase}/index.html`, new TextReader(html), { level: 6 });
  for (let i = 0; i < mediaToWrite.length; i++) {
    if (o.signal?.aborted) throw new DOMException('cancelled', 'AbortError');
    const item = mediaToWrite[i]!;
    o.onProgress?.(0.3 + (i / Math.max(1, mediaToWrite.length)) * 0.65, `Añadiendo adjuntos (${i + 1}/${mediaToWrite.length})…`);
    const blob = await session.imported.mediaStore.getBlob(item.file);
    await zip.add(`${fileBase}/${item.path}`, new BlobReader(blob), { level: 0 });
  }
  const blob = await zip.close();
  o.onProgress?.(1, 'Listo');
  return { blob, fileName: `${fileBase}.zip` };
}
