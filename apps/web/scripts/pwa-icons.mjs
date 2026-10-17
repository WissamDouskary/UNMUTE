import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}

function paint(x, y, size) {
  const nx = x / (size - 1);
  const ny = y / (size - 1);
  const zinc = [9, 9, 11, 255];
  const ink = [228, 228, 231, 255];
  const head = ellipse(nx, ny, 0.5, 0.4, 0.11, 0.15);
  const headHole = ellipse(nx, ny, 0.5, 0.4, 0.07, 0.105);
  const stem = nx > 0.485 && nx < 0.515 && ny > 0.53 && ny < 0.68;
  const cradle = ellipse(nx, ny, 0.5, 0.62, 0.2, 0.14);
  const cradleHole = ellipse(nx, ny, 0.5, 0.62, 0.155, 0.095);
  const base = nx > 0.4 && nx < 0.6 && ny > 0.7 && ny < 0.735;
  const mic =
    (head <= 1 && headHole > 1) ||
    stem ||
    (ny > 0.58 && cradle <= 1 && cradleHole > 1) ||
    base;
  return mic ? ink : zinc;
}

function png(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = y * stride + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'pwa-192x192.png'), png(192));
fs.writeFileSync(path.join(dir, 'pwa-512x512.png'), png(512));
