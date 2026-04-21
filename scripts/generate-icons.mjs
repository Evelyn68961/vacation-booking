// scripts/generate-icons.mjs
//
// Reads public/favicon.svg and public/favicon-maskable.svg, writes all the
// PNG sizes needed by the PWA manifest, iOS, and legacy browsers.
//
// Run: npm run generate-icons
// Requires: sharp (installed as a devDependency)
//
// You only need to run this when the source SVG changes. The generated PNGs
// are committed to the repo so Vercel builds don't need sharp.

import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')

// Which files to generate, and from which source SVG
const targets = [
  { src: 'favicon.svg',          size: 32,  out: 'favicon-32.png'           },
  { src: 'favicon.svg',          size: 180, out: 'apple-touch-icon.png'     },
  { src: 'favicon.svg',          size: 192, out: 'pwa-192.png'              },
  { src: 'favicon.svg',          size: 512, out: 'pwa-512.png'              },
  { src: 'favicon-maskable.svg', size: 512, out: 'pwa-maskable-512.png'     },
]

for (const { src, size, out } of targets) {
  const svgBuffer = await readFile(resolve(publicDir, src))
  const pngBuffer = await sharp(svgBuffer, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(resolve(publicDir, out), pngBuffer)
  console.log(`  ✓ ${out}  (${size}×${size})`)
}

console.log('\nDone. Remember to commit public/*.png to git.')
