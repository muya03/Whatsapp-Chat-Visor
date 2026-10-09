// Genera los iconos PNG de la PWA a partir de public/icons/icon.svg.
// Uso: npm run icons   (requiere "sharp", incluido en devDependencies)
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = await readFile(join(dir, 'icon.svg'));

// Variante "maskable": fondo a sangre y logotipo dentro de la zona segura (80 %).
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#00a884"/>
  <g transform="translate(51.2 51.2) scale(0.8)">
    <path d="M142 124h228a34 34 0 0 1 34 34v152a34 34 0 0 1-34 34H250l-72 62v-62h-36a34 34 0 0 1-34-34V158a34 34 0 0 1 34-34z" fill="#fff"/>
    <rect x="178" y="188" width="156" height="20" rx="10" fill="#00a884"/>
    <rect x="178" y="236" width="104" height="20" rx="10" fill="#00a884" opacity=".6"/>
    <rect x="178" y="284" width="130" height="20" rx="10" fill="#00a884" opacity=".35"/>
  </g></svg>`);

const jobs = [
  [svg, 'icon-192.png', 192],
  [svg, 'icon-512.png', 512],
  [maskableSvg, 'icon-maskable-512.png', 512],
  [maskableSvg, 'apple-touch-icon.png', 180], // iOS aplica su propia máscara; fondo opaco.
  [svg, 'favicon-32.png', 32],
];
for (const [src, name, size] of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(join(dir, name));
  console.log('✔', name);
}
