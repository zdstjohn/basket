/** The Look setting: Light (Butter), Dark (Cast Iron) or Match my phone. Stored per device, never per person. */
export type Look = "light" | "dark" | "auto";

export const LOOK_KEY = "basket:look";

/** The status-bar colors. The only place these two values are written outside globals.css. */
export const THEME_COLOR = { light: "#F5E6A6", dark: "#191614" } as const;

export function parseLook(v: unknown): Look {
  return v === "light" || v === "dark" ? v : "auto";
}

/** The look chosen this session when the device would not store it (private mode, full storage). Lasts until the page closes. */
let sessionLook: Look | null = null;

export function readLook(storage?: Pick<Storage, "getItem"> | null): Look {
  if (storage === undefined && sessionLook) return sessionLook;
  try {
    const s = storage === undefined ? window.localStorage : storage;
    return s ? parseLook(s.getItem(LOOK_KEY)) : "auto";
  } catch {
    return "auto";
  }
}

export function saveLook(look: Look, storage?: Pick<Storage, "setItem"> | null): void {
  try {
    const s = storage === undefined ? window.localStorage : storage;
    s?.setItem(LOOK_KEY, look);
    if (storage === undefined) sessionLook = null;
  } catch {
    // A full or blocked storage: the choice is kept in memory, so it still applies (through applyLook) until the page closes.
    if (storage === undefined) sessionLook = look;
  }
}

/**
 * Sets <html data-look> and every theme-color tag from the stored look.
 * It is serialized into an inline script, so it must stay self-contained: no imports, no closures, no helpers.
 */
export function boot(key: string, colors: { light: string; dark: string }, forced?: "light" | "dark" | "auto" | null): void {
  let look: "light" | "dark" | "auto" = "auto";
  try {
    const v = window.localStorage.getItem(key);
    if (v === "light" || v === "dark") look = v;
  } catch {
    look = "auto";
  }
  if (forced) look = forced;
  const root = document.documentElement;
  if (root.getAttribute("data-look") !== look) root.setAttribute("data-look", look);
  const tags = document.querySelectorAll('meta[name="theme-color"]');
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const media = tag.getAttribute("media") || "";
    const color = look === "auto" ? (media.indexOf("dark") !== -1 ? colors.dark : colors.light) : colors[look];
    if (tag.getAttribute("content") !== color) tag.setAttribute("content", color);
  }
}

export const LOOK_BOOT_SCRIPT = `(${boot})(${JSON.stringify(LOOK_KEY)}, ${JSON.stringify(THEME_COLOR)})`;

/** Re-applies the stored look (or, when the device would not store it, this session's choice) to the page. */
export function applyLook(): void {
  boot(LOOK_KEY, THEME_COLOR, sessionLook);
}
