// Coverage check of a same-run parity capture (SPEC-0535): for each pixel that differs between
// frames i and i+1 (above DIFF), is its color present in the other frame within RADIUS pixels?
// "coverage" = same colors, shifted edge; "shade" = a color the other side never has nearby.
// Usage: node coverage-diff.mjs <framesDir>   (prints one line)
import fs from 'node:fs';
import path from 'node:path';

const DIFF = 2;
const RADIUS = 1;
const MATCH = 2;
const RGBA = 4;
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.rgba')).sort();
const [w, h] = files[0].match(/_(\d+)x(\d+)\.rgba$/).slice(1).map(Number);
const a = fs.readFileSync(path.join(dir, files[0]));
const b = fs.readFileSync(path.join(dir, files[1]));
const near = (src, x, y, other, i) => {
  for (let dy = -RADIUS; dy <= RADIUS; dy++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const xx = x + dx; const yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const j = (yy * w + xx) * RGBA;
    if (Math.abs(other[j] - src[i]) <= MATCH && Math.abs(other[j + 1] - src[i + 1]) <= MATCH && Math.abs(other[j + 2] - src[i + 2]) <= MATCH) return true;
  }
  return false;
};
let diff = 0; let coverage = 0; let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * RGBA;
  if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) <= DIFF) continue;
  diff++;
  if (near(a, x, y, b, i) && near(b, x, y, a, i)) coverage++;
  else { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
}
const shade = diff - coverage;
console.log(`coverage-diff: ${diff} px diferentes (${(100 * diff / (w * h)).toFixed(4)}%), cobertura ${coverage}, cor ${shade}${shade ? ` (bbox ${x0}-${x1} x ${y0}-${y1})` : ''}`);
