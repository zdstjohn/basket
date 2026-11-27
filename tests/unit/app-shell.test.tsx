// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { noonLosAngeles } from "../../e2e/helpers/clock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/week";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let host: HTMLDivElement;
let root: Root;
const render = (el: ReactElement) => act(() => root.render(el));
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  pathname = "/week";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ScreenHeader", () => {
  it("owns the top inset and shows a display title", () => {
    render(<ScreenHeader title="This week" />);
    const header = q("header");
    expect(header.hasAttribute("data-bk-header")).toBe(true);
    expect(header.className).toContain("pt-[var(--bk-safe-top)]");
    expect(header.className).toContain("bk-gutter");
    const h1 = q("h1");
    expect(h1.textContent).toBe("This week");
    expect(h1.className).toContain("font-display");
    expect(h1.className).toContain("text-display");
  });

  it("uses the title size when asked", () => {
    render(<ScreenHeader title="Thursday dinner" size="title" />);
    expect(q("h1").className).toContain("text-title");
    expect(q("h1").className).not.toContain("text-display");
  });

  it("renders a back link, the action and the below row", () => {
    render(<ScreenHeader title="Add" back={{ href: "/week", label: "Back to this week" }} action={<button>Go</button>} below={<p>under</p>} />);
    const back = q<HTMLAnchorElement>('a[aria-label="Back to this week"]');
    expect(back.getAttribute("href")).toBe("/week");
    expect(q("header button").textContent).toBe("Go");
    expect(q("header p").textContent).toBe("under");
  });
});

describe("BottomNav", () => {
  it("lists This week, Favorites, List, Household in that order with Lucide icons", () => {
    render(<BottomNav />);
    const links = [...host.querySelectorAll<HTMLAnchorElement>("nav[aria-label='Main'] a")];
    expect(links.map((a) => a.textContent)).toEqual(["This week", "Favorites", "List", "Household"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/week", "/favorites", "/list", "/household"]);
    for (const a of links) {
      const svg = a.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("22");
      expect(svg.classList.contains("lucide")).toBe(true);
    }
    expect(host.querySelectorAll("nav svg:not(.lucide)").length).toBe(0);
  });

  it("marks the active tab with accent and aria-current", () => {
    pathname = "/list";
    render(<BottomNav />);
    const links = [...host.querySelectorAll<HTMLAnchorElement>("nav a")];
    const active = links.filter((a) => a.getAttribute("aria-current") === "page");
    expect(active.map((a) => a.textContent)).toEqual(["List"]);
    expect(active[0].className).toContain("text-accent");
    expect(active[0].className).toContain("font-bold");
    for (const a of links.filter((x) => x !== active[0])) {
      expect(a.className).toContain("text-ink-soft");
      expect(a.className).not.toContain("text-accent");
    }
  });

  it("has no top border, a hairline shadow and the nav padding", () => {
    render(<BottomNav />);
    const cls = q("nav").className;
    expect(cls).toContain("bg-surface");
    expect(cls).toContain("shadow-[inset_0_1px_0_var(--bk-line)]");
    expect(cls).not.toMatch(/\bborder-t\b/);
    expect(cls).toContain("pb-[var(--bk-safe-bottom)]");
  });

  it("is hidden on the add-meal screen", () => {
    pathname = "/week/add";
    render(<BottomNav />);
    expect(host.querySelector("nav")).toBeNull();
  });
});

describe("globals.css safe areas", () => {
  const css = readFileSync("app/globals.css", "utf8");
  it("leaves the top inset to each screen's header (and the loading shell)", () => {
    expect(css).not.toMatch(/body:not\(:has/);
    expect(readFileSync("app/(app)/loading.tsx", "utf8")).toContain("pt-[var(--bk-safe-top)]");
    const body = /^body\s*\{([\s\S]*?)\n\}/m.exec(css)![1];
    expect(body).toMatch(/padding:\s*0;/);
    expect(body).not.toMatch(/env\(safe-area-inset/);
  });
});

describe("noonLosAngeles", () => {
  it("is noon Pacific on both sides of the clock change", () => {
    expect(noonLosAngeles("2026-01-15").toISOString()).toBe("2026-01-15T20:00:00.000Z");
    expect(noonLosAngeles("2026-07-15").toISOString()).toBe("2026-07-15T19:00:00.000Z");
    expect(noonLosAngeles("2026-11-01").toISOString()).toBe("2026-11-01T20:00:00.000Z");
    expect(noonLosAngeles("2026-03-08").toISOString()).toBe("2026-03-08T19:00:00.000Z");
  });
});
