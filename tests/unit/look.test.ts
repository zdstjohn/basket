// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyLook, boot, LOOK_BOOT_SCRIPT, LOOK_KEY, parseLook, readLook, saveLook, THEME_COLOR } from "@/lib/look";

function addTags() {
  document.head.innerHTML =
    '<meta name="theme-color" content="#000" media="(prefers-color-scheme: light)">' +
    '<meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)">';
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-look");
});
afterEach(() => {
  document.head.innerHTML = "";
});

describe("look values", () => {
  it("parseLook keeps the three values and turns anything else into auto", () => {
    for (const v of ["light", "dark", "auto"]) expect(parseLook(v)).toBe(v);
    for (const v of [null, undefined, "DARK", 7, "", {}]) expect(parseLook(v)).toBe("auto");
  });

  it("readLook returns auto when storage throws or is missing", () => {
    expect(readLook({ getItem() { throw new Error("blocked"); } })).toBe("auto");
    expect(readLook(null)).toBe("auto");
  });

  it("readLook reads the stored value and treats junk as auto", () => {
    expect(readLook({ getItem: (k) => (k === LOOK_KEY ? "dark" : null) })).toBe("dark");
    expect(readLook({ getItem: () => "purple" })).toBe("auto");
  });

  it("saveLook writes under basket:look", () => {
    saveLook("light");
    expect(localStorage.getItem("basket:look")).toBe("light");
  });

  it("saveLook swallows a full or blocked storage", () => {
    expect(() => saveLook("dark", { setItem() { throw new Error("full"); } })).not.toThrow();
    expect(() => saveLook("dark", null)).not.toThrow();
  });
});

describe("boot", () => {
  it("with dark stored sets data-look and both theme-color tags to #191614", () => {
    const tags = addTags();
    localStorage.setItem(LOOK_KEY, "dark");
    boot(LOOK_KEY, THEME_COLOR);
    expect(document.documentElement.dataset.look).toBe("dark");
    for (const t of tags) expect(t.content).toBe("#191614");
  });

  it("with light stored sets both tags to #F5E6A6", () => {
    const tags = addTags();
    localStorage.setItem(LOOK_KEY, "light");
    boot(LOOK_KEY, THEME_COLOR);
    expect(document.documentElement.dataset.look).toBe("light");
    for (const t of tags) expect(t.content).toBe("#F5E6A6");
  });

  it("with auto gives the light tag #F5E6A6 and the dark tag #191614", () => {
    const [light, dark] = addTags();
    boot(LOOK_KEY, THEME_COLOR);
    expect(document.documentElement.dataset.look).toBe("auto");
    expect(light.content).toBe("#F5E6A6");
    expect(dark.content).toBe("#191614");
  });

  it("a junk stored value behaves as auto", () => {
    addTags();
    localStorage.setItem(LOOK_KEY, "purple");
    boot(LOOK_KEY, THEME_COLOR);
    expect(document.documentElement.dataset.look).toBe("auto");
  });

  it("applyLook runs the same boot against the real storage", () => {
    const tags = addTags();
    localStorage.setItem(LOOK_KEY, "dark");
    applyLook();
    expect(document.documentElement.dataset.look).toBe("dark");
    expect(tags[0].content).toBe("#191614");
  });

  it("the boot script sets data-look from storage and survives a throwing localStorage", () => {
    const tags = addTags();
    localStorage.setItem(LOOK_KEY, "dark");
    new Function(LOOK_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.look).toBe("dark");
    expect(tags[1].content).toBe("#191614");

    document.documentElement.removeAttribute("data-look");
    const real = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new Error("blocked"); },
    });
    try {
      expect(() => new Function(LOOK_BOOT_SCRIPT)()).not.toThrow();
      expect(document.documentElement.dataset.look).toBe("auto");
    } finally {
      Object.defineProperty(window, "localStorage", real);
    }
  });
});
