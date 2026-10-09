import { LIMITS } from './limits';

export type ImportErrorCode =
  | 'unsupported-type'
  | 'empty-file'
  | 'too-large'
  | 'zip-corrupt'
  | 'zip-no-chat'
  | 'zip-encrypted'
  | 'txt-not-recognized'
  | 'memory'
  | 'cancelled'
  | 'unknown';

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  /** Datos no sensibles para explicar al usuario qué se recuperó (nunca contenido de mensajes). */
  readonly detail?: Record<string, number | string>;
  constructor(code: ImportErrorCode, detail?: Record<string, number | string>) {
    super(code);
    this.name = 'ImportError';
    this.code = code;
    if (detail) this.detail = detail;
  }
}

export type SourceKind = 'txt' | 'zip';

export interface ValidatedFile {
  kind: SourceKind;
  /** true si el tamaño es lo bastante grande como para avisar al usuario. */
  large: boolean;
}

async function startsWithZipMagic(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  // PK\x03\x04 (normal) · PK\x05\x06 (vacío) · PK\x07\x08 (dividido)
  return head[0] === 0x50 && head[1] === 0x4b && [3, 5, 7].includes(head[2] ?? -1);
}

/**
 * Valida y clasifica un archivo seleccionado. No confía en la extensión ni en el MIME:
 * la cabecera «PK» decide si es ZIP. Un TXT se acepta si parece texto (sin NUL en el arranque).
 */
export async function validateFile(file: File): Promise<ValidatedFile> {
  if (file.size === 0) throw new ImportError('empty-file');
  if (await startsWithZipMagic(file)) {
    return { kind: 'zip', large: file.size > LIMITS.warnZipBytes };
  }
  const lowerName = file.name.toLowerCase();
  const textLike = file.type.startsWith('text/') || /\.(txt|text|log)$/.test(lowerName) || file.type === '';
  if (!textLike) throw new ImportError('unsupported-type', { name: file.name });
  if (file.size > LIMITS.maxTxtBytes) throw new ImportError('too-large', { size: file.size, limit: LIMITS.maxTxtBytes });
  const sample = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const isUtf16 = (sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff);
  if (!isUtf16 && sample.includes(0)) throw new ImportError('unsupported-type', { name: file.name });
  return { kind: 'txt', large: false };
}

/** Ruta interna del ZIP segura de interpretar: sin traversal, rutas absolutas ni bytes nulos. */
export function isSafeEntryPath(path: string): boolean {
  if (path.includes('\0')) return false;
  const norm = path.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) return false;
  return !norm.split('/').some((seg) => seg === '..');
}
