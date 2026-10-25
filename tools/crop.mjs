// Crop a rectangle out of a PNG and upscale it for close visual inspection. Pure pngjs, no ffmpeg.
//   node crop.mjs <in.png> <x> <y> <w> <h> <out.png> [scale=2]
//   node crop.mjs --cmp <ref.png> <test.png> <x> <y> <w> <h> <out.png> [scale]
//     (same region of both images, stacked side by side for direct comparison)
import fs from 'node:fs';
import { PNG } from 'pngjs';

function cropScale(img, x, y, w, h, scale) {
  const out = new PNG({ width: Math.round(w * scale), height: Math.round(h * scale) });
  for (let oy = 0; oy < out.height; oy++) for (let ox = 0; ox < out.width; ox++) {
    // bilinear sample
    const sx = x + (ox + 0.5) / scale - 0.5, sy = y + (oy + 0.5) / scale - 0.5;
    const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(sx)));
    const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(sy)));
    const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, sx - x0)), fy = Math.max(0, Math.min(1, sy - y0));
    const oi = (oy * out.width + ox) * 4;
    for (let c = 0; c < 4; c++) {
      const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
      const cc = img.data[(y1 * img.width + x0) * 4 + c], d = img.data[(y1 * img.width + x1) * 4 + c];
      out.data[oi + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
    }
  }
  return out;
}

function hstack(a, b) {
  const h = Math.max(a.height, b.height);
  const out = new PNG({ width: a.width + b.width, height: h, colorType: 2 });
  for (const [img, xoff] of [[a, 0], [b, a.width]]) {
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + x) * 4, di = (y * out.width + x + xoff) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = c === 3 ? 255 : img.data[si + c];
    }
  }
  return out;
}

const a = process.argv.slice(2);
if (a[0] === '--cmp') {
  const [, refP, testP, x, y, w, h, out, scale = 2] = a;
  if (!out) { console.error('usage: node crop.mjs --cmp <ref.png> <test.png> <x> <y> <w> <h> <out.png> [scale]'); process.exit(1); }
  const ref = PNG.sync.read(fs.readFileSync(refP)), test = PNG.sync.read(fs.readFileSync(testP));
  const s = +scale;
  const both = hstack(cropScale(ref, +x, +y, +w, +h, s), cropScale(test, +x, +y, +w, +h, s));
  fs.writeFileSync(out, PNG.sync.write(both));
  console.log('wrote', out, '(left=ref, right=test)');
} else {
  const [inp, x, y, w, h, out, scale = 2] = a;
  if (!out) { console.error('usage: node crop.mjs <in.png> <x> <y> <w> <h> <out.png> [scale=2]'); process.exit(1); }
  const img = PNG.sync.read(fs.readFileSync(inp));
  fs.writeFileSync(out, PNG.sync.write(cropScale(img, +x, +y, +w, +h, +scale)));
  console.log('wrote', out);
}
