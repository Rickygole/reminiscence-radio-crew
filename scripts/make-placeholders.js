import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeWav } from '../src/wav.js'
import { encodeGrayPng } from '../src/png.js'

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/demo-inbox/media')
mkdirSync(out, { recursive: true })

const RATE = 44100
const SECONDS = 5.2
const samples = new Float32Array(Math.round(RATE * SECONDS))
const bell = (start, freq, gain) => {
  for (let i = Math.round(start * RATE); i < samples.length; i++) {
    const t = i / RATE - start
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 1.6)
    if (env < 0.0005) break
    samples[i] += gain * env * (Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2.76 * t) * Math.exp(-t * 3) + 0.15 * Math.sin(2 * Math.PI * freq * 5.4 * t) * Math.exp(-t * 6))
  }
}
bell(0.2, 523.25, 0.22)
bell(0.9, 659.25, 0.2)
bell(1.6, 783.99, 0.2)
bell(2.5, 1046.5, 0.14)
const wav = join(out, 'leo.wav')
writeFileSync(wav, encodeWav(samples, RATE))
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '4', join(out, 'leo.mp3')])
rmSync(wav)

const bunting = Array.from({ length: 9 }, (_, i) => {
  const x = 60 + i * 85
  const y = 70 + Math.sin(i * 0.7) * 6 + (i % 2) * 4
  const colors = ['#D9A441', '#3E7C7B', '#C8553D', '#F3E9D2']
  return `<polygon points="${x},${y} ${x + 34},${y} ${x + 17},${y + 38}" fill="${colors[i % 4]}" opacity="0.92"/>`
}).join('')
const lights = Array.from({ length: 14 }, (_, i) => `<circle cx="${40 + i * 55}" cy="${120 + Math.sin(i * 0.9) * 10}" r="7" fill="#FFD98A" opacity="0.9"/><circle cx="${40 + i * 55}" cy="${120 + Math.sin(i * 0.9) * 10}" r="16" fill="#FFD98A" opacity="0.18"/>`).join('')
const flies = Array.from({ length: 12 }, (_, i) => `<circle cx="${70 + ((i * 137) % 680)}" cy="${300 + ((i * 71) % 200)}" r="3" fill="#FFF3C4" opacity="0.8"/>`).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FA6A3"/><stop offset="0.45" stop-color="#F2C98B"/><stop offset="1" stop-color="#F08F5A"/></linearGradient>
<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFF3C4"/><stop offset="0.35" stop-color="#FFD98A" stop-opacity="0.8"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient>
<linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4B2E1A"/><stop offset="0.5" stop-color="#6B4529"/><stop offset="1" stop-color="#4B2E1A"/></linearGradient>
</defs>
<rect width="800" height="600" fill="url(#sky)"/>
<circle cx="560" cy="330" r="190" fill="url(#sun)"/>
<circle cx="560" cy="330" r="62" fill="#FFF0B8"/>
<path d="M0 380 Q140 300 280 360 T560 350 T800 340 V600 H0Z" fill="#5F8F7C"/>
<path d="M0 430 Q180 360 360 420 T800 410 V600 H0Z" fill="#3E7C7B"/>
<path d="M0 500 Q200 450 420 490 T800 480 V600 H0Z" fill="#2F5E5C"/>
<rect x="0" y="530" width="800" height="70" fill="url(#wood)"/>
<g stroke="#2E1B0E" stroke-opacity="0.35" stroke-width="2"><line x1="0" y1="552" x2="800" y2="552"/><line x1="0" y1="574" x2="800" y2="574"/></g>
<rect x="20" y="0" width="34" height="540" fill="url(#wood)"/>
<rect x="746" y="0" width="34" height="540" fill="url(#wood)"/>
<rect x="0" y="24" width="800" height="30" fill="url(#wood)"/>
${bunting}
${lights}
<g>
<line x1="330" y1="54" x2="330" y2="380" stroke="#3B2514" stroke-width="5"/>
<line x1="470" y1="54" x2="470" y2="380" stroke="#3B2514" stroke-width="5"/>
<rect x="312" y="380" width="176" height="20" rx="8" fill="url(#wood)"/>
<rect x="312" y="326" width="176" height="52" rx="10" fill="#C8553D" opacity="0.9"/>
<rect x="312" y="300" width="176" height="14" rx="7" fill="url(#wood)"/>
</g>
${flies}
<rect x="0" y="0" width="800" height="600" fill="none" stroke="#2E1B0E" stroke-opacity="0.25" stroke-width="10"/>
</svg>
`
writeFileSync(join(out, 'leo.svg'), svg)

writeFileSync(
  join(out, 'leo-depth.png'),
  encodeGrayPng(400, 300, (x, y) => {
    const r = Math.hypot(x - 0.5, (y - 0.55) * 0.9)
    return 0.55 * Math.max(0, 1 - r * 1.6) + 0.45 * y
  })
)
console.log('placeholders written to', out)
