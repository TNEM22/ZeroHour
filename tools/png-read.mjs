/**
 * Minimal PNG decoder - the counterpart to png.mjs. Handles 8-bit greyscale,
 * RGB and RGBA, non-interlaced, which covers everything Chrome writes.
 * Used to measure a pasted backdrop rather than eyeball it.
 */
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePNG(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ' is not a PNG');

  let off = 8;
  const idat = [];
  let width, height, depth, colour;

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      depth = buf[off + 16];
      colour = buf[off + 17];
      if (buf[off + 20] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    } else if (type === 'IEND') break;
    off += 12 + len;
  }

  const channels = CHANNELS[colour];
  if (depth !== 8 || !channels) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour})`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;       // left
      const b = prev ? prev[x] : 0;                          // up
      const c = prev && x >= channels ? prev[x - channels] : 0; // up-left
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('bad PNG filter ' + filter);
      cur[x] = v & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/** Mean relative luminance (0..1) over a fractional rectangle of the image. */
export function meanLuma(img, x0, y0, x1, y1) {
  const { width, height, channels, data } = img;
  const ax = Math.round(x0 * width), bx = Math.round(x1 * width);
  const ay = Math.round(y0 * height), by = Math.round(y1 * height);
  let sum = 0, n = 0;
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const i = y * width * channels + x * channels;
      const r = data[i], g = channels >= 3 ? data[i + 1] : r, b = channels >= 3 ? data[i + 2] : r;
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      n++;
    }
  }
  return n ? sum / n : 0;
}
