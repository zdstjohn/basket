import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { STATES } from "./states";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "proof-out");
const BEFORE = path.join(ROOT, "docs", "design", "before");
const DEVICES = [
  { id: "iphone-17", label: "iPhone 17 (WebKit)" },
  { id: "pixel-7", label: "Pixel 7 (Chromium)" },
] as const;

/** A "before" shot that has another name than its state. */
const BEFORE_ALIAS: Record<string, string> = { "list-products": "fred-meyer-prices" };

/** Which screen a clip belongs under. */
const CLIP_SCREEN: Record<string, string> = {
  "week-open": "week",
  "meal-settle": "week",
  "photo-sheet": "week",
  "sheet-drag": "list",
  "budget-roll": "week",
  "list-strike": "list",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Turns every raw .webm into proof-out/motion/{name}.mp4 and a quarter-speed {name}-slow.mp4. Returns the clip names. */
function convertClips(): string[] {
  const raw = path.join(OUT, "motion", "raw");
  if (!existsSync(raw)) return [];
  const names: string[] = [];
  for (const file of readdirSync(raw).filter((f) => f.endsWith(".webm"))) {
    const name = file.replace(/\.webm$/, "");
    const input = path.join(raw, file);
    const even = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
    const base = ["-y", "-loglevel", "error", "-i", input, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
    if (!ffmpegPath) {
      console.log(`[proof] no ffmpeg binary (ffmpeg-static did not install); left ${file} as .webm`);
      return names;
    }
    const normal = spawnSync(ffmpegPath, [...base, "-vf", even, path.join(OUT, "motion", `${name}.mp4`)], { encoding: "utf8" });
    const slow = spawnSync(ffmpegPath, [...base, "-vf", `setpts=4*PTS,${even}`, path.join(OUT, "motion", `${name}-slow.mp4`)], { encoding: "utf8" });
    if (normal.status !== 0 || slow.status !== 0) console.log(`[proof] ffmpeg failed on ${file}: ${normal.stderr || slow.stderr}`);
    else names.push(name);
  }
  return names;
}

function copyBefore(): void {
  for (const d of DEVICES) {
    const from = path.join(BEFORE, d.id);
    if (!existsSync(from)) continue;
    const to = path.join(OUT, "before", d.id);
    mkdirSync(to, { recursive: true });
    for (const f of readdirSync(from).filter((f) => f.endsWith(".png"))) copyFileSync(path.join(from, f), path.join(to, f));
  }
}

const has = (rel: string) => existsSync(path.join(OUT, rel));

function figure(rel: string | null, caption: string): string {
  if (rel && has(rel)) return `<figure><a href="${rel}"><img loading="lazy" src="${rel}" alt="${esc(caption)}"></a><figcaption>${esc(caption)}</figcaption></figure>`;
  return `<figure class="none"><div>${rel === null ? "no before: the old app did not have this screen" : "not shot (skipped or not built yet)"}</div><figcaption>${esc(caption)}</figcaption></figure>`;
}

function build(clips: string[]): string {
  const tokensPath = path.join(ROOT, "docs", "design", "tokens.css");
  const tokens = existsSync(tokensPath) ? readFileSync(tokensPath, "utf8") : "";
  // One section per screen; its states go under it.
  const screens = new Map<string, typeof STATES>();
  for (const s of STATES) screens.set(s.screens[0], [...(screens.get(s.screens[0]) ?? []), s]);

  const sections = [...screens].map(([screen, states]) => {
    const blocks = states.map((state) => {
      const before = BEFORE_ALIAS[state.name] ?? state.name;
      const rows = DEVICES.map((d) => {
        const beforeRel = existsSync(path.join(BEFORE, d.id, `${before}.png`)) ? `before/${d.id}/${before}.png` : null;
        return `<div class="row"><h4>${d.label}</h4><div class="shots">
          ${figure(beforeRel, "before (light only)")}
          ${figure(`after/${state.name}-${d.id}-light.png`, "after, light")}
          ${figure(`after/${state.name}-${d.id}-dark.png`, "after, dark")}
        </div></div>`;
      }).join("");
      return `<article><h3>${esc(state.name)}</h3>${rows}</article>`;
    });
    const mine = clips.filter((c) => CLIP_SCREEN[c.replace(/-(iphone-17|pixel-7)$/, "").replace(/-reduced$/, "")] === screen);
    const motion = mine.length
      ? `<article><h3>Motion</h3><div class="clips">${mine
          .map((c) => `<figure><video controls muted loop playsinline src="motion/${c}.mp4"></video><figcaption>${esc(c)} · <a href="motion/${c}-slow.mp4">quarter speed</a></figcaption></figure>`)
          .join("")}</div></article>`
      : "";
    return `<section id="${esc(screen)}"><h2>${esc(screen)}</h2>${blocks.join("")}${motion}</section>`;
  });

  return `<!doctype html>
<html lang="en" data-look="auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Basket proof</title>
<style>
${tokens}
body{margin:0;background:var(--bk-ground);color:var(--bk-ink);font:16px/1.4 var(--bk-font-sans)}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font:400 34px/1.1 var(--bk-font-display);margin:0 0 8px}
h2{font:400 24px/1.2 var(--bk-font-display);margin:48px 0 16px;padding-top:16px;border-top:1px solid var(--bk-line)}
h3{font-size:18px;margin:24px 0 8px}h4{font-size:14px;margin:12px 0 8px;color:var(--bk-ink-soft)}
nav a{color:var(--bk-ink);font-weight:600;margin-right:12px;font-size:14px}
.shots,.clips{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}
.clips{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
figure{margin:0}img,video{width:100%;height:auto;display:block;border-radius:12px;background:var(--bk-sunk);box-shadow:var(--bk-shadow-1)}
figcaption{font-size:12px;color:var(--bk-ink-soft);margin-top:8px}figcaption a{color:var(--bk-ink)}
.none div{border:2px dashed var(--bk-line-strong);border-radius:12px;padding:32px 16px;font-size:14px;color:var(--bk-ink-soft);text-align:center}
</style></head><body><main>
<h1>Basket: before and after</h1>
<p>Generated ${new Date().toISOString()}. Before is the old app (light only; it had no dark mode). After is light and dark. iPhone 17 above Pixel 7.</p>
<nav>${[...screens.keys()].map((s) => `<a href="#${esc(s)}">${esc(s)}</a>`).join("")}</nav>
${sections.join("\n")}
</main></body></html>`;
}

/** Runs once after the whole proof run (Playwright's global teardown), even when every test was skipped. */
export default async function writeProofPage(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const clips = convertClips();
  copyBefore();
  writeFileSync(path.join(OUT, "index.html"), build(clips));
  rmSync(path.join(OUT, "motion", ".rec"), { recursive: true, force: true });
  console.log(`[proof] wrote ${path.join(OUT, "index.html")} (${clips.length} clip(s))`);
}
