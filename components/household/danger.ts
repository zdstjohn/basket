import { ghostButton } from "@/lib/ui";

/** A ghost button whose words are in the error color: a destructive step. (The class is swapped, not added, so the two colors never compete.) */
export const dangerGhost = ghostButton.replace("text-ink", "text-error");
