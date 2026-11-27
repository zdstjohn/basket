import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The style guard (premium pass). Every .ts and .tsx under app/ and components/, plus lib/ui.ts,
 * must follow the design values unless it is on one of the legacy lists in tests/unit/design-legacy.
 * A task that restyles a file removes it from its stream's list in the same commit; lists only shrink.
 */

const ROOT = process.cwd();
const LISTS = ["shared", "a", "b", "later"] as const;
const ROUND_OK = ["components/ui/Switch.tsx", "components/PersonRow.tsx"];

const SPACING_OK = new Set(["0", "0.5", "1", "2", "2.5", "3", "4", "6", "8", "12", "16", "px", "auto"]);
const BUTTON_LIKE = new Set(["button", "a", "input", "Link"]);
const TEXT_ATTRS = new Set(["label", "message", "sentence", "placeholder", "title", "aria-label"]);

/** Whole-string rules, run on the text of every string literal (and template part). */
const STRING_RULES: [string, RegExp][] = [
  ["hex color", /#[0-9a-fA-F]{3,8}\b/],
  ["white, black or grey utility", /\b(bg|text|border|outline|accent|decoration|fill|stroke)-(white|black|gray-|slate-|zinc-|neutral-|stone-)/],
  ["arbitrary text size", /\btext-\[\d/],
  ["stock text size", /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/],
  ["font weight outside 400/600/700", /\bfont-(thin|light|medium|extrabold|black)\b/],
  ["arbitrary radius", /\brounded-\[/],
  ["radius xl, 2xl or 3xl", /\brounded-(xl|2xl|3xl)\b/],
  ["inline-styled shadow", /\bshadow-(sm|md|lg|xl)\b/],
  ["retired color name", /\b(text|bg|border|outline|accent)-(green|green-tint|muted)\b/],
  ["raw safe-area inset", /env\(safe-area-inset/],
  ["html entity quote", /&apos;|&quot;/],
  ["arbitrary shadow", /\bshadow-\[/],
  ["dead font-heading class", /\bfont-heading\b/],
];

/** A bracketed spacing value built only from --bk- variables, numbers, px and calc() (a calc() needs at least one --bk- variable): `[var(--bk-safe-top)]`, `[calc(var(--bk-safe-bottom)+8px)]`. */
const TOKEN_BRACKET = /^\[(?:var\(--bk-[a-z0-9-]+\)|calc\((?=.*var\(--bk-)(?:var\(--bk-[a-z0-9-]+\)|\d+(?:\.\d+)?(?:px)?|[+\-*/()])+\))\]$/;

/** Spacing utilities, checked token by token. */
function badSpacing(token: string): string | null {
  const bare = token.slice(token.lastIndexOf(":") + 1).replace(/^[!-]+/, "");
  const m = /^(?:[pm][trblxyse]?|gap(?:-[xy])?)-(.+)$/.exec(bare);
  if (!m) return null;
  const value = m[1];
  const looksLikeStep = /^\d+(?:\.\d+)?$/.test(value) || value.startsWith("[");
  if (!looksLikeStep || SPACING_OK.has(value)) return null;
  return TOKEN_BRACKET.test(value) ? null : bare;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
}

function scanned(): string[] {
  const files: string[] = [];
  walk("app", files);
  walk("components", files);
  files.push("lib/ui.ts");
  return files.map((f) => f.split(sep).join("/")).sort();
}

/** String literals reachable from a JSX child or attribute value through plain choices (?:, &&, ||, ??, parentheses). */
function directStrings(node: ts.Node | undefined, out: ts.Node[]): void {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node);
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head);
    for (const span of node.templateSpans) out.push(span.literal);
  } else if (ts.isParenthesizedExpression(node)) directStrings(node.expression, out);
  else if (ts.isConditionalExpression(node)) {
    directStrings(node.whenTrue, out);
    directStrings(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) directStrings(node.right, out);
    else if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      directStrings(node.left, out);
      directStrings(node.right, out);
    }
  } else if (ts.isJsxExpression(node)) directStrings(node.expression, out);
}

const hasStraight = (s: string): boolean => /['"]/.test(s);

function violationsOf(file: string): string[] {
  return violationsOfText(file, readFileSync(join(ROOT, file), "utf8"));
}

function violationsOfText(file: string, text: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Set<string>();
  const roundOk = ROUND_OK.includes(file);
  const isUiLib = file === "lib/ui.ts";

  const checkString = (s: string, inButtonClass: boolean) => {
    for (const [name, re] of STRING_RULES) if (re.test(s)) found.add(name);
    if (/\brounded-full\b/.test(s) && !roundOk) found.add("rounded-full outside ROUND_OK");
    for (const token of s.split(/\s+/)) {
      if (!token) continue;
      const bad = badSpacing(token);
      if (bad) found.add(`spacing step ${bad}`);
    }
    if ((inButtonClass || isUiLib) && /(?<![\w-])(?:[\w-]+:)*(?:h|size)-(9|10|11|12|13)(?![\w.-])/.test(s)) {
      found.add("fixed h-/size-9..13 on a control (use min-h-)");
    }
  };

  const visit = (node: ts.Node, inButtonClass: boolean) => {
    if (ts.isStringLiteralLike(node)) checkString(node.text, inButtonClass);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) checkString(node.text, inButtonClass);

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag === "svg") found.add("inline <svg>");
      const classy = BUTTON_LIKE.has(tag);
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const name = attr.name.getText(sf);
          visit(attr, classy && name === "className");
        }
      }
      return;
    }

    if (ts.isJsxText(node) && kind === ts.ScriptKind.TSX) {
      const raw = node.getText(sf);
      if (raw.trim() !== "" && hasStraight(raw)) found.add("straight quote in JSX text");
      if (/&apos;|&quot;/.test(raw)) found.add("html entity quote");
    }

    if (kind === ts.ScriptKind.TSX) {
      if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        const strs: ts.Node[] = [];
        directStrings(node.expression, strs);
        for (const s of strs) if (hasStraight((s as ts.StringLiteral).text)) found.add("straight quote in a JSX child string");
      }
      if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf)) && node.initializer) {
        const strs: ts.Node[] = [];
        directStrings(node.initializer, strs);
        for (const s of strs) if (hasStraight((s as ts.StringLiteral).text)) found.add(`straight quote in ${node.name.getText(sf)}`);
      }
    }

    ts.forEachChild(node, (c) => visit(c, inButtonClass));
  };

  visit(sf, false);
  return [...found].sort();
}

function readList(name: string): string[] {
  const path = join(ROOT, "tests/unit/design-legacy", `${name}.txt`);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

const files = scanned();
const lists = Object.fromEntries(LISTS.map((n) => [n, readList(n)])) as Record<(typeof LISTS)[number], string[]>;
const legacy = new Set(LISTS.flatMap((n) => lists[n]));
const violations = new Map(files.map((f) => [f, violationsOf(f)]));

describe("spacing rule", () => {
  it("lets token paddings through", () => {
    expect(badSpacing("pt-[var(--bk-safe-top)]")).toBeNull();
    expect(badSpacing("pb-[calc(var(--bk-safe-bottom)+8px)]")).toBeNull();
    expect(badSpacing("md:px-4")).toBeNull();
  });
  it("flags off-scale steps and raw brackets", () => {
    expect(badSpacing("p-[13px]")).not.toBeNull();
    expect(badSpacing("pt-[env(safe-area-inset-top)]")).not.toBeNull();
    expect(badSpacing("pt-[calc(env(safe-area-inset-top)+8px)]")).not.toBeNull();
    expect(badSpacing("gap-5")).not.toBeNull();
  });
  it("needs a --bk- variable inside calc()", () => {
    expect(badSpacing("p-[calc(13px)]")).not.toBeNull();
    expect(badSpacing("pb-[calc(var(--bk-safe-bottom)+8px)]")).toBeNull();
  });
});

describe("class flags", () => {
  const flags = (src: string, file = "components/Probe.tsx") => violationsOfText(file, src);
  const FIXED = "fixed h-/size-9..13 on a control (use min-h-)";

  it.each(["size-9", "size-10", "size-11", "size-12", "size-13"])("flags %s on a button-like element", (c) => {
    expect(flags(`export const A = () => <button className="${c} p-4" />;`)).toContain(FIXED);
  });
  it("flags h-11 behind a variant, and allows min-h-11 and size-8", () => {
    expect(flags(`export const A = () => <a className="md:h-11" />;`)).toContain(FIXED);
    expect(flags(`export const A = () => <button className="min-h-11 size-8" />;`)).not.toContain(FIXED);
  });
  it("does not flag size-9 on a non-control element", () => {
    expect(flags(`export const A = () => <div className="size-9" />;`)).not.toContain(FIXED);
  });
  it("flags size-9..13 anywhere in lib/ui.ts", () => {
    expect(flags(`export const x = "size-10";`, "lib/ui.ts")).toContain(FIXED);
  });

  it("flags an arbitrary shadow", () => {
    expect(flags(`export const A = () => <div className="shadow-[0_1px_2px_#000]" />;`)).toContain("arbitrary shadow");
    expect(flags(`export const A = () => <div className="shadow-2" />;`)).not.toContain("arbitrary shadow");
  });

  it("flags the dead font-heading class", () => {
    expect(flags(`export const A = () => <h1 className="font-heading text-title" />;`)).toContain("dead font-heading class");
    expect(flags(`export const A = () => <h1 className="font-display text-title" />;`)).not.toContain("dead font-heading class");
  });
});

describe("design guard", () => {
  it("every file not on a legacy list follows the design values", () => {
    const failures = files
      .filter((f) => !legacy.has(f))
      .filter((f) => violations.get(f)!.length > 0)
      .map((f) => `${f}: ${violations.get(f)!.join("; ")}`);
    expect(failures).toEqual([]);
  });

  it("a legacy list entry still exists and still fails (lists only shrink)", () => {
    const stale: string[] = [];
    for (const name of LISTS) {
      for (const f of lists[name]) {
        if (!files.includes(f)) stale.push(`${name}.txt: ${f} is not a scanned file any more`);
        else if (violations.get(f)!.length === 0) stale.push(`${name}.txt: ${f} passes now; remove it`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("no path is on two lists, or twice on one", () => {
    const seen = new Map<string, string>();
    const doubles: string[] = [];
    for (const name of LISTS) {
      for (const f of lists[name]) {
        if (seen.has(f)) doubles.push(`${f} is on ${seen.get(f)}.txt and ${name}.txt`);
        else seen.set(f, name);
      }
    }
    expect(doubles).toEqual([]);
  });

  it("lists are sorted, so merges stay small", () => {
    for (const name of LISTS) expect(lists[name], `${name}.txt`).toEqual([...lists[name]].sort());
  });
});
