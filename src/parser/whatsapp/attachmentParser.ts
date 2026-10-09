import { attachmentKey, stripInvisible } from './text';
import type { AttachmentRef, MediaKind } from './types';

const EXT: Record<string, MediaKind> = {};
const register = (kind: MediaKind, list: string) => list.split(' ').forEach((e) => (EXT[e] = kind));
register('image', 'jpg jpeg jpe png webp gif bmp avif heic heif jfif');
register('video', 'mp4 mov m4v 3gp 3g2 webm mkv avi mpg mpeg ogv');
register('audio', 'opus ogg oga mp3 m4a aac wav amr 3ga caf flac mka');
register('contact', 'vcf');
register('archive', 'zip rar 7z tar gz tgz bz2 xz');
register('document', 'pdf doc docx xls xlsx ppt pptx odt ods odp txt csv rtf md html epub apk');

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

/** Deduce el tipo de adjunto por extensión y por los prefijos de nombre que usa WhatsApp. */
export function mediaKindFromName(name: string): MediaKind {
  const ext = extensionOf(name);
  const base = name.toUpperCase();
  const byExt = EXT[ext] ?? 'unknown';
  if (/(^|[^A-Z])STK-|STICKER/.test(base) && (ext === 'webp' || byExt === 'image')) return 'sticker';
  if (/(^|[^A-Z])PTT-/.test(base) && byExt === 'audio') return 'voice';
  if (ext === 'opus') return 'voice';
  if (byExt === 'video' && /(^|[^A-Z])GIF([^A-Z]|$)/.test(base)) return 'gif';
  return byExt;
}

// iOS: «<attached: NAME>» y equivalentes localizados («<adjunto: NAME>», «<anexado: …>»…).
const IOS_RE = /<[^<>:\n]{3,24}:\s*([^<>\n]+\.[A-Za-z0-9]{1,8})\s*>/g;
// Android: «NAME (file attached)» y equivalentes localizados.
const ATTACHED_WORDS =
  'file attached|attached file|archivo adjunto|datei angeh[äa]ngt|fichier joint|arquivo anexado|ficheiro anexado|file allegato|bijgevoegd bestand|bestand bijgevoegd|fil bifogad|plik za[łl][ąa]czony|прикреплённый файл|прикрепленный файл|ملف مرفق|附件|添付ファイル|첨부 파일';
const ANDROID_RE = new RegExp(`^([^\\n]+?\\.[A-Za-z0-9]{1,8})\\s+\\((?:${ATTACHED_WORDS})\\)\\s*$`, 'gim');
// Respaldo independiente del idioma: nombres de archivo característicos de WhatsApp.
const WA_NAME_RE = /^((?:IMG|VID|PTT|AUD|STK|DOC)-[\w\-]+\.[A-Za-z0-9]{2,5}|\d{8}-(?:PHOTO|VIDEO|AUDIO|STICKER|GIF|DOCUMENT)-[\w\-]+\.[A-Za-z0-9]{2,5})\s*\([^)\n]{2,40}\)\s*$/gim;

export interface ExtractedAttachments {
  attachments: AttachmentRef[];
  /** Texto restante (pie de foto u otro contenido) una vez retiradas las referencias. */
  text: string;
}

/** Extrae referencias a adjuntos del cuerpo de un mensaje. No toca nada que no reconozca. */
export function extractAttachments(body: string): ExtractedAttachments {
  const found = new Map<string, AttachmentRef>();
  const take = (rawName: string) => {
    const fileName = stripInvisible(rawName).trim();
    if (!fileName) return;
    const key = attachmentKey(fileName);
    if (!found.has(key)) found.set(key, { fileName, key, kind: mediaKindFromName(fileName), omitted: false });
  };

  let text = body;
  text = text.replace(IOS_RE, (_m, name: string) => (take(name), ''));
  text = text.replace(ANDROID_RE, (_m, name: string) => (take(name), ''));
  text = text.replace(WA_NAME_RE, (_m, name: string) => (take(name), ''));
  if (found.size === 0) return { attachments: [], text: body };

  // Deja el pie de foto limpio: sin líneas vacías sobrantes ni marcas invisibles de borde.
  text = text
    .split('\n')
    .map((l) => l.replace(/^[‎‏‪-‮⁦-⁩﻿]+/, ''))
    .join('\n')
    .replace(/^\s*\n+|\n+\s*$/g, '')
    .trim();
  return { attachments: [...found.values()], text };
}
