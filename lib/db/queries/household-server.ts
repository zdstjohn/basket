import "server-only";
import { cache } from "react";
import { createServerClient } from "@/lib/db/server";
import { getMyHousehold } from "@/lib/db/queries/household";

/**
 * The signed-in person's household, read once per request: the layout and the page both ask for it, and the
 * second ask reuses the first answer instead of making another round trip. (getUser is deliberately not cached.)
 */
export const getMyHouseholdOnce = cache(async () => getMyHousehold(await createServerClient()));
