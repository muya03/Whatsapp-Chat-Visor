// Genera fixtures sintéticos y anonimizados en src/tests/fixtures (nombres y textos inventados).
// Se ejecuta con: node scripts/make-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'tests', 'fixtures');
mkdirSync(out, { recursive: true });
const LRM = '‎';
const w = (name, text) => writeFileSync(join(out, name), text, 'utf8');

// Android, español, 24 h, grupo, multilínea, sistema, adjuntos, formato.
w(
  'android-es-group.txt',
  [
    `${LRM}14/12/22, 9:00 - Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos ni escucharlos.`,
    `14/12/22, 9:01 - Ana creó el grupo "Equipo Fantasma"`,
    `14/12/22, 9:01 - Ana añadió a Beto`,
    `14/12/22, 9:02 - Ana: Hola a todos 👋`,
    `14/12/22, 9:03 - Beto: Buenas!`,
    `Segunda línea del mensaje de Beto`,
    `14/12/22, 9:03 - Beto: *negrita* _cursiva_ ~tachado~ y \`mono\``,
    `14/12/22, 9:05 - +34 612 34 56 78: Mensaje desde un número sin agenda`,
    `${LRM}14/12/22, 9:10 - Ana: IMG-20221214-WA0001.jpg (archivo adjunto)`,
    `Mira qué foto`,
    `14/12/22, 9:11 - Beto: <Multimedia omitido>`,
    `14/12/22, 9:12 - Beto: Se eliminó este mensaje`,
    `14/12/22, 9:13 - Ana: https://example.com/página?x=1.`,
    `15/12/22, 0:05 - Beto: Ya es otro día`,
    `15/12/22, 0:06 - Beto salió del grupo`,
    `15/12/22, 0:07 - Ana cambió el asunto de "Equipo Fantasma: v1" a "Equipo Fantasma 2"`,
    `31/12/22, 23:59 - Ana: ¡Feliz año!`,
    `01/01/23, 0:00 - Ana: 🎉`,
    '',
  ].join('\n'),
);

// iOS, inglés, 12 h, corchetes, chat individual, adjuntos <attached:>, llamada.
w(
  'ios-en-pair.txt',
  [
    `${LRM}[12/14/22, 9:00:01 AM] Alice: ${LRM}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
    `${LRM}[12/14/22, 9:00:30 AM] Alice: Hi Bob!`,
    `[12/14/22, 9:01:02 AM] Bob: Hey, how are you?`,
    `${LRM}[12/14/22, 9:02:00 AM] Bob: ${LRM}<attached: 00000003-PHOTO-2022-12-14-09-02-00.jpg>`,
    `${LRM}[12/14/22, 9:02:10 AM] Alice: ${LRM}image omitted`,
    `${LRM}[12/14/22, 12:30:00 PM] Alice: ${LRM}Missed voice call`,
    `${LRM}[12/14/22, 12:31:00 PM] Bob: ${LRM}Voice call, 2 min`,
    `[12/14/22, 11:59:59 PM] Alice: Good night`,
    `[12/15/22, 12:00:00 AM] Bob: it's after midnight`,
    '',
  ].join('\n'),
);

// Fechas ambiguas: todos los días ≤ 12 y mes constante (DMY real).
w(
  'ambiguous-dates.txt',
  [
    '01/02/23, 10:00 - Ana: uno',
    '02/02/23, 10:00 - Beto: dos',
    '03/02/23, 10:00 - Ana: tres',
    '05/02/23, 10:00 - Beto: cuatro',
    '07/02/23, 10:00 - Ana: cinco',
    '',
  ].join('\n'),
);

// MDY decidible: 12/31 solo puede ser mes/día.
w(
  'us-mdy.txt',
  ['01/02/23, 10:00 AM - Ana: one', '12/31/23, 10:00 PM - Beto: two', ''].join('\n'),
);

// ISO / año primero.
w(
  'iso-dates.txt',
  ['2022-12-14, 09:00 - Ana: hola', '2022-12-14, 09:05 - Beto: qué tal', '2023-01-02, 18:30 - Ana: feliz año', ''].join('\n'),
);

// Árabe (RTL, dígitos arábigo-índicos y marcador م/ص).
w(
  'rtl-arabic.txt',
  ['١٤/١٢/٢٠٢٢، ٩:٠٠ ص - ليلى: مرحبا بالعالم', '١٤/١٢/٢٠٢٢، ٩:٠٥ م - عمر: كيف حالك؟', ''].join('\n'),
);

// Coreano (mejor esfuerzo).
w('korean.txt', ['2022. 12. 14. 오후 12:55, 민수 : 안녕하세요', '2022. 12. 14. 오후 12:56, 지은 : 네 안녕하세요', ''].join('\n'));

// Líneas que parecen cabeceras dentro de un mensaje, y texto basura al principio.
w(
  'tricky-continuations.txt',
  [
    'texto suelto antes del primer mensaje',
    '14/12/22, 9:00 - Ana: lista:',
    '14/12/22 es la fecha límite',
    '[14/12/22] tampoco es cabecera',
    '14/12/22, 9:01 - Beto: ok',
    '',
  ].join('\n'),
);

w('empty.txt', '');
w('garbage.txt', 'esto no es un chat de WhatsApp\nlínea dos\nlínea tres\n');
w(
  'media-android.txt',
  [
    '10/01/23, 18:00 - Ana: IMG-20230110-WA0001.jpg (file attached)',
    '10/01/23, 18:01 - Ana: PTT-20230110-WA0002.opus (file attached)',
    '10/01/23, 18:02 - Ana: STK-20230110-WA0003.webp (file attached)',
    '10/01/23, 18:03 - Ana: VID-20230110-WA0004.mp4 (file attached)',
    '10/01/23, 18:04 - Ana: Informe trimestral Ñandú.pdf (file attached)',
    '10/01/23, 18:05 - Ana: contacto.vcf (file attached)',
    '10/01/23, 18:06 - Ana: archivos.zip (file attached)',
    '10/01/23, 18:07 - Ana: location: https://maps.google.com/?q=39.986,-0.037',
    '10/01/23, 18:08 - Ana: IMG-20230110-WA0099.jpg (file attached)',
    '',
  ].join('\n'),
);
console.log('fixtures escritos en', out);
