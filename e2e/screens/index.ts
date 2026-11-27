import { SCREENS_A } from "./a";
import { SCREENS_B } from "./b";
import { SCREENS_LATER } from "./later";

export type { Screen } from "./shared";

/** Every screen the layout and contrast checks visit. */
export const SCREENS = [...SCREENS_A, ...SCREENS_B, ...SCREENS_LATER];
