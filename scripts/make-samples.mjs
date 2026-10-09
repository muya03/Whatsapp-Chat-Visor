// Genera material de prueba SINTÉTICO (sin datos reales): un ZIP con multimedia y un TXT de grupo.
// Requiere ffmpeg para el vídeo y el audio (opcional: si no está, se omiten esos adjuntos).
// Uso: npm run samples
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'samples');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'wa-samples-'));
const LRM = '‎';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const svgImage = (w, h, label, c1, c2) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.72}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.12}" fill="rgba(255,255,255,.85)"/><path d="M0 ${h} L${w * 0.35} ${h * 0.55} L${w * 0.6} ${h * 0.8} L${w * 0.8} ${h * 0.62} L${w} ${h * 0.9} V${h} Z" fill="rgba(0,0,0,.28)"/><text x="${w * 0.06}" y="${h * 0.14}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.min(w, h) * 0.07}" fill="#fff">${label}</text></svg>`;

const files = {};
const img = async (name, w, h, label, c1, c2, fmt = 'jpeg') => {
  files[name] = new Uint8Array(await sharp(Buffer.from(svgImage(w, h, label, c1, c2)))[fmt]({ quality: 82 }).toBuffer());
};
await img('IMG-20230110-WA0001.jpg', 1200, 900, 'Foto de ejemplo 1 (4:3)', '#ff9a8b', '#6a82fb');
await img('IMG-20230110-WA0002.jpg', 900, 1200, 'Foto de ejemplo 2 (3:4)', '#43cea2', '#185a9d');
await img('IMG-20230111-WA0003.jpg', 1600, 900, 'Foto de ejemplo 3 (16:9)', '#f6d365', '#fda085');
await img('STK-20230110-WA0004.webp', 512, 512, 'Sticker', '#a18cd1', '#fbc2eb', 'webp');

// Documento PDF mínimo válido
const pdf = `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 52>>stream\nBT /F1 18 Tf 20 60 Td (Documento de ejemplo) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF\n`;
files['Presupuesto trimestral Ñandú.pdf'] = strToU8(pdf);
files['contacto-ejemplo.vcf'] = strToU8('BEGIN:VCARD\nVERSION:3.0\nFN:Carla Muestra\nTEL;TYPE=CELL:+34 600 000 000\nEND:VCARD\n');

if (hasFfmpeg) {
  const ff = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(tmp, 'v.mp4'));
  files['VID-20230111-WA0005.mp4'] = new Uint8Array(readFileSync(join(tmp, 'v.mp4')));
  ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-af', 'tremolo=f=4:d=0.7', '-c:a', 'libopus', join(tmp, 'a.opus'));
  files['PTT-20230110-WA0006.opus'] = new Uint8Array(readFileSync(join(tmp, 'a.opus')));
  ff('-f', 'lavfi', '-i', 'sine=frequency=520:duration=6', '-c:a', 'libmp3lame', '-b:a', '64k', join(tmp, 'a.mp3'));
  files['AUD-20230111-WA0007.mp3'] = new Uint8Array(readFileSync(join(tmp, 'a.mp3')));
} else console.warn('ffmpeg no encontrado: se omiten vídeo y audio');

const has = (n) => Object.keys(files).includes(n);
const L = [];
const a = (t) => L.push(t);
a(`${LRM}10/01/23, 18:00 - Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos ni escucharlos.`);
a('10/01/23, 18:01 - Ana Ejemplo: ¡Hola Beto! 👋 Esto es un chat de ejemplo totalmente sintético.');
a('10/01/23, 18:01 - Beto Prueba: Hola Ana, ¿qué tal?');
a('10/01/23, 18:02 - Beto Prueba: Te paso *negrita*, _cursiva_, ~tachado~ y `monoespaciado`.');
a('10/01/23, 18:02 - Ana Ejemplo: Perfecto 😂😂');
a('10/01/23, 18:03 - Ana Ejemplo: Mensaje de varias líneas:');
a('primera línea');
a('segunda línea con enlace https://example.com/ruta?x=1&y=2.');
a('tercera línea');
a(`${LRM}10/01/23, 18:05 - Ana Ejemplo: IMG-20230110-WA0001.jpg (archivo adjunto)`);
a('Mirad qué paisaje');
a(`${LRM}10/01/23, 18:05 - Ana Ejemplo: IMG-20230110-WA0002.jpg (archivo adjunto)`);
a('10/01/23, 18:06 - Beto Prueba: 🔥');
if (has('STK-20230110-WA0004.webp')) a(`${LRM}10/01/23, 18:06 - Beto Prueba: STK-20230110-WA0004.webp (archivo adjunto)`);
if (has('PTT-20230110-WA0006.opus')) a(`${LRM}10/01/23, 18:08 - Ana Ejemplo: PTT-20230110-WA0006.opus (archivo adjunto)`);
a(`${LRM}10/01/23, 18:09 - Beto Prueba: Presupuesto trimestral Ñandú.pdf (archivo adjunto)`);
a('10/01/23, 18:09 - Beto Prueba: Te dejo el documento');
a(`${LRM}10/01/23, 18:10 - Beto Prueba: contacto-ejemplo.vcf (archivo adjunto)`);
a('10/01/23, 18:11 - Ana Ejemplo: ubicación: https://maps.google.com/?q=39.9864,-0.0376');
a(`${LRM}10/01/23, 18:12 - Beto Prueba: IMG-20230110-WA0099.jpg (archivo adjunto)`);
a('10/01/23, 18:12 - Beto Prueba: (esta foto no está en el ZIP: se ve como adjunto no incluido)');
a('10/01/23, 18:14 - Ana Ejemplo: <Multimedia omitido>');
a('10/01/23, 18:15 - Beto Prueba: Se eliminó este mensaje');
a(`${LRM}10/01/23, 18:20 - Ana Ejemplo: Llamada perdida`);
a('10/01/23, 23:59 - Beto Prueba: Buenas noches 🌙');
a('11/01/23, 8:00 - Ana Ejemplo: Buenos días ☀️');
a(`${LRM}11/01/23, 8:01 - Ana Ejemplo: IMG-20230111-WA0003.jpg (archivo adjunto)`);
if (has('VID-20230111-WA0005.mp4')) a(`${LRM}11/01/23, 8:02 - Beto Prueba: VID-20230111-WA0005.mp4 (archivo adjunto)`);
if (has('AUD-20230111-WA0007.mp3')) a(`${LRM}11/01/23, 8:03 - Beto Prueba: AUD-20230111-WA0007.mp3 (archivo adjunto)`);
a('11/01/23, 8:10 - Ana Ejemplo: ' + 'Este es un mensaje muy largo para comprobar el ajuste de línea y que no desborde la pantalla en móvil. '.repeat(6).trim());
a('11/01/23, 8:11 - Ana Ejemplo: Supercalifragilisticoespialidosoparaprobarpalabraslargassinespaciosquedebenpartirseenmovil_y_noscrollhorizontal_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
for (let i = 0; i < 24; i++) {
  const who = i % 3 === 0 ? 'Ana Ejemplo' : 'Beto Prueba';
  a(`11/01/23, 9:${String(i).padStart(2, '0')} - ${who}: Mensaje de relleno número ${i + 1} para tener historial y probar el desplazamiento y la búsqueda de la palabra paella.`);
}
a('12/01/23, 0:05 - Ana Ejemplo: Ya es otro día 🎉');
a('15/01/23, 20:30 - Beto Prueba: Último mensaje del ejemplo');
const chat = L.join('\n') + '\n';

const zip = zipSync({ '_chat.txt': strToU8(chat), ...files }, { level: 1 });
writeFileSync(join(out, 'Chat de WhatsApp con Ana Ejemplo.zip'), zip);
writeFileSync(join(out, 'chat-solo-texto.txt'), chat);
console.log('✔ samples/Chat de WhatsApp con Ana Ejemplo.zip', (zip.length / 1024).toFixed(0), 'KB;', Object.keys(files).length, 'adjuntos');

// Grupo (solo texto, formato iOS) con avisos del sistema.
const g = [
  `${LRM}[01/03/23, 10:00:00] Carla Muestra: ${LRM}Los mensajes y las llamadas están cifrados de extremo a extremo.`,
  `[01/03/23, 10:00:10] Carla Muestra: ${LRM}creó el grupo «Excursión Fantasma»`,
  `[01/03/23, 10:00:11] Carla Muestra: ${LRM}añadió a Dani Demo`,
];
g.length = 0;
g.push(
  '[01/03/23, 10:00:00] Carla Muestra creó el grupo "Excursión Fantasma"',
  '[01/03/23, 10:00:05] Carla Muestra añadió a Dani Demo',
  '[01/03/23, 10:00:06] Carla Muestra añadió a Eli Ejemplo',
  `[01/03/23, 10:01:00] Dani Demo: ${LRM}¡Hola equipo!`,
  `[01/03/23, 10:01:30] Eli Ejemplo: Buenas 👋`,
  `[01/03/23, 10:02:00] Carla Muestra: ¿Quedamos el sábado a las 9?`,
  `[01/03/23, 10:02:20] Dani Demo: Por mí perfecto`,
  `[02/03/23, 18:40:00] Eli Ejemplo: ${LRM}image omitted`,
  '[02/03/23, 18:41:00] Dani Demo salió del grupo',
  '[03/03/23, 9:00:00] Carla Muestra: Recordad llevar agua 💧',
);
writeFileSync(join(out, 'grupo-ios.txt'), g.join('\n') + '\n');
rmSync(tmp, { recursive: true, force: true });
