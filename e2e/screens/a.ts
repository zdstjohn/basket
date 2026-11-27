import type { Screen } from "./shared";

/** Stream A: the week, adding a meal and favorites. */
export const SCREENS_A: Screen[] = [
  { name: "week", path: "/week", contrastPending: true },
  { name: "add-meal", path: "/week/add?day=thu&slot=dinner", contrastPending: true },
  { name: "favorites", path: "/favorites", contrastPending: true },
];
