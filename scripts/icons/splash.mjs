// Renders the iPhone launch images (plain B on the ground color, light and dark) and app/favicon.ico from app/icon.svg.
// Run: node scripts/icons/splash.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const svg = readFileSync(join(root, "app", "icon.svg"), "utf8");
const letter = svg.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
if (!letter) throw new Error("no letter path in app/icon.svg");

// The B spans x 139.81-384.19, y 109-399 in the 512 icon.
const BOX = { x: 139.81, y: 109, w: 244.38, h: 290 };
const HEIGHT = 192;
const LOOKS = {
  light: { ground: "#F5E6A6", ink: "#4C1D3A" },
  dark: { ground: "#191614", ink: "#E9B030" },
};
export const SIZES = [
  [1206, 2622],
  [1320, 2868],
  [1179, 2556],
  [1290, 2796],
  [1170, 2532],
];

function splash(w, h, { ground, ink }) {
  const s = HEIGHT / BOX.h;
  const tx = w / 2 - (BOX.x + BOX.w / 2) * s;
  const ty = h / 2 - (BOX.y + BOX.h / 2) * s;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${ground}"/><path fill="${ink}" transform="translate(${tx} ${ty}) scale(${s})" d="${letter}"/></svg>`,
  );
}

mkdirSync(join(root, "public", "splash"), { recursive: true });
for (const [look, colors] of Object.entries(LOOKS)) {
  for (const [w, h] of SIZES) {
    await sharp(splash(w, h, colors)).png({ compressionLevel: 9 }).toFile(join(root, "public", "splash", `${look}-${w}x${h}.png`));
  }
}

// favicon.ico: PNG-compressed 16, 32 and 48 px images from the full icon.
const dims = [16, 32, 48];
const pngs = await Promise.all(dims.map((d) => sharp(Buffer.from(svg), { density: 384 }).resize(d, d).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * dims.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(dims.length, 4);
let offset = head.length;
dims.forEach((d, i) => {
  const o = 6 + 16 * i;
  head.writeUInt8(d, o);
  head.writeUInt8(d, o + 1);
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(pngs[i].length, o + 8);
  head.writeUInt32LE(offset, o + 12);
  offset += pngs[i].length;
});
writeFileSync(join(root, "app", "favicon.ico"), Buffer.concat([head, ...pngs]));
console.log("splash images and favicon written");
