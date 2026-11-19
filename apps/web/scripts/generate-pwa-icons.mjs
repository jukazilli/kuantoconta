import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/icons");

fs.mkdirSync(outDir, { recursive: true });

// CRC32 table for valid PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Distance from point (px, py) to rounded segment (ax, ay)-(bx, by)
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.hypot(dx, dy);
}

// Signed distance for a rounded box centered at (0.5, 0.5) with half-size b and corner radius r
function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px - 0.5) - bx + r;
  const qy = Math.abs(py - 0.5) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Brand gradient matching .brand-mark: linear-gradient(155deg, #ffa123 0%, #ff6a0c 60%, #f14c10 100%)
function brandGradient(u, v) {
  const angle = (155 * Math.PI) / 180;
  const dirX = Math.sin(angle);
  const dirY = -Math.cos(angle);
  const t = clamp(0.5 + (u - 0.5) * dirX + (v - 0.5) * dirY, 0, 1);

  const c0 = [255, 161, 35];  // #ffa123
  const c1 = [255, 106, 12];  // #ff6a0c
  const c2 = [241, 76, 16];   // #f14c10

  if (t <= 0.6) {
    const k = t / 0.6;
    return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
  }
  const k = (t - 0.6) / 0.4;
  return [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
}

// Geometric bold lowercase "k" SDF in normalized icon coordinates [0, 1]
function sdLetterK(u, v, scale = 1) {
  const x = (u - 0.5) / scale + 0.5;
  const y = (v - 0.5) / scale + 0.5;
  const stroke = 0.068;

  // Vertical stem of 'k'
  const stem = sdSegment(x, y, 0.355, 0.245, 0.355, 0.755) - stroke;
  // Upper diagonal arm
  const upperArm = sdSegment(x, y, 0.385, 0.555, 0.645, 0.395) - stroke * 0.94;
  // Lower diagonal leg
  const lowerLeg = sdSegment(x, y, 0.465, 0.515, 0.665, 0.755) - stroke * 0.96;

  return Math.min(stem, upperArm, lowerLeg);
}

function renderIcon(size, { fullBleed = false, letterScale = 1 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  const invSamples = 1 / samples;
  const invTotal = 1 / (samples * samples);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (x + (sx + 0.5) * invSamples) / size;
          const v = (y + (sy + 0.5) * invSamples) / size;

          const bgAlpha = fullBleed
            ? 1
            : sdRoundedBox(u, v, 0.47, 0.47, 0.23) <= 0
              ? 1
              : 0;

          if (bgAlpha === 0) continue;

          const [gr, gg, gb] = brandGradient(u, v);
          // Subtle top inner highlight for depth
          const highlight = clamp(1 - Math.hypot(u - 0.35, v - 0.18) * 1.65, 0, 1) * 0.12;
          let pr = lerp(gr, 255, highlight);
          let pg = lerp(gg, 255, highlight);
          let pb = lerp(gb, 255, highlight);

          const kDist = sdLetterK(u, v, letterScale);
          if (kDist <= 0) {
            pr = 255;
            pg = 255;
            pb = 255;
          }

          rAcc += pr;
          gAcc += pg;
          bAcc += pb;
          aAcc += 255;
        }
      }

      const idx = (y * size + x) * 4;
      const a = Math.round(aAcc * invTotal);
      if (a > 0) {
        const covered = aAcc / 255;
        rgba[idx] = Math.round(clamp(rAcc / covered, 0, 255));
        rgba[idx + 1] = Math.round(clamp(gAcc / covered, 0, 255));
        rgba[idx + 2] = Math.round(clamp(bAcc / covered, 0, 255));
        rgba[idx + 3] = a;
      }
    }
  }

  return encodePng(size, size, rgba);
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="kuantoconta">
  <defs>
    <linearGradient id="kc-bg" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#ffa123"/>
      <stop offset="60%" stop-color="#ff6a0c"/>
      <stop offset="100%" stop-color="#f14c10"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#kc-bg)"/>
  <g stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <line x1="182" y1="126" x2="182" y2="386" stroke-width="68"/>
    <line x1="198" y1="284" x2="330" y2="202" stroke-width="64"/>
    <line x1="238" y1="264" x2="340" y2="386" stroke-width="66"/>
  </g>
</svg>
`;

const specs = [
  { file: "icon-192.png", size: 192, fullBleed: false, letterScale: 1.0 },
  { file: "icon-512.png", size: 512, fullBleed: false, letterScale: 1.0 },
  { file: "icon-maskable-192.png", size: 192, fullBleed: true, letterScale: 0.78 },
  { file: "icon-maskable-512.png", size: 512, fullBleed: true, letterScale: 0.78 },
  { file: "apple-touch-icon.png", size: 180, fullBleed: true, letterScale: 0.86 },
];

for (const spec of specs) {
  const png = renderIcon(spec.size, spec);
  fs.writeFileSync(path.join(outDir, spec.file), png);
  console.log(`Generated ${spec.file} (${png.length} bytes)`);
}

fs.writeFileSync(path.join(outDir, "icon.svg"), ICON_SVG, "utf8");
console.log("Generated icon.svg");
