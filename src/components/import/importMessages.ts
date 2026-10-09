import type { ImportError } from '../../services/fileValidation';
import { formatBytes } from '../../utils/format';
import { LIMITS } from '../../services/limits';

export interface ErrorCopy {
  title: string;
  /** Qué ha pasado. */
  what: string;
  /** Qué se ha podido recuperar. */
  recovered?: string;
  /** Cómo continuar. */
  steps: string[];
}

/** Mensajes de error comprensibles (sin trazas ni contenido privado). */
export function describeImportError(err: ImportError): ErrorCopy {
  const d = err.detail ?? {};
  switch (err.code) {
    case 'unsupported-type':
      return {
        title: 'Formato de archivo no compatible',
        what: 'Solo se pueden abrir archivos .txt o .zip exportados desde WhatsApp.',
        steps: ['Exporta el chat desde WhatsApp (Más → Exportar chat) y elige el archivo resultante.', 'Si recibiste un .zip, no hace falta descomprimirlo.'],
      };
    case 'empty-file':
      return { title: 'El archivo está vacío', what: 'El archivo seleccionado no contiene datos.', steps: ['Comprueba que la exportación terminó correctamente y vuelve a intentarlo.'] };
    case 'too-large':
      return {
        title: 'El archivo es demasiado grande',
        what: `Pesa ${typeof d.size === 'number' ? formatBytes(d.size) : 'más'} y el límite para el texto del chat es ${formatBytes(Number(d.limit ?? LIMITS.maxTxtBytes))}.`,
        steps: ['Exporta el chat sin multimedia: el texto ocupa muy poco.', 'O exporta un periodo más corto y abre cada parte por separado.'],
      };
    case 'zip-corrupt':
      return {
        title: 'El ZIP está dañado o incompleto',
        what: 'No se pudo leer la estructura del archivo ZIP.',
        recovered: 'No se ha podido recuperar nada de este archivo.',
        steps: ['Si lo descargaste o lo enviaste por mensajería, vuelve a copiarlo: puede haberse cortado.', 'Si tienes el .txt del chat suelto, puedes abrirlo directamente (sin adjuntos).'],
      };
    case 'zip-no-chat':
      return {
        title: 'No hay ninguna conversación en el ZIP',
        what: `El ZIP contiene ${Number(d.entries ?? 0).toLocaleString('es')} archivos, pero ninguno es un .txt de chat.`,
        steps: ['Comprueba que es la exportación de un chat y no una copia de seguridad.', 'Las copias de seguridad de WhatsApp (bases de datos cifradas) no se pueden abrir con esta herramienta.'],
      };
    case 'zip-encrypted':
      return { title: 'El ZIP está protegido con contraseña', what: 'Los ZIP exportados por WhatsApp no llevan contraseña; este sí.', steps: ['Descomprímelo en tu dispositivo con su contraseña y abre el .txt (y, si quieres, vuelve a comprimir la carpeta sin contraseña).'] };
    case 'txt-not-recognized':
      return {
        title: 'No se reconoce el formato del chat',
        what: 'El archivo no contiene mensajes con la fecha y hora habituales de una exportación de WhatsApp.',
        recovered: typeof d.lines === 'number' && d.lines > 0 ? `Se leyeron ${d.lines.toLocaleString('es')} líneas, pero ninguna encaja con un mensaje.` : undefined,
        steps: ['Comprueba que abriste el archivo del chat (suele llamarse «_chat.txt» o «Chat de WhatsApp con…»).', 'Si el chat está en un idioma o región poco habitual, el formato de fecha puede no estar soportado todavía.'],
      };
    case 'memory':
      return {
        title: 'Memoria insuficiente',
        what: 'El dispositivo se quedó sin memoria al leer el archivo.',
        steps: ['Cierra otras pestañas o aplicaciones y vuelve a intentarlo.', 'Exporta el chat sin multimedia o por periodos más cortos.'],
      };
    case 'cancelled':
      return { title: 'Importación cancelada', what: 'Has cancelado la importación.', steps: [] };
    default:
      return { title: 'No se pudo importar el archivo', what: 'Ocurrió un error inesperado al leer el archivo.', steps: ['Vuelve a intentarlo o elige otro archivo.'] };
  }
}

export const STAGE_LABEL: Record<string, string> = {
  validating: 'Comprobando el archivo…',
  'zip-index': 'Leyendo el contenido del ZIP…',
  'extract-chat': 'Extrayendo la conversación…',
  parse: 'Analizando mensajes e indexando…',
  done: 'Listo',
};
