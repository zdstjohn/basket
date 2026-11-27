"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { BudgetSentence } from "@/components/BudgetSentence";
import { FlagLines } from "@/components/flags/FlagLines";
import { MealSheet } from "@/components/MealSheet";
import { MealTile } from "@/components/MealTile";
import { Sheet } from "@/components/Sheet";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorBanner, Loading, SkeletonTile } from "@/components/ui/states";
import { OpenDay } from "@/components/week/OpenDay";
import { TonightHero } from "@/components/week/TonightHero";
import { useWeekData } from "@/components/useWeekData";
import { VerdictCard } from "@/components/verdicts/VerdictCard";
import { useDinnerToAsk, useOffline, type Ask } from "@/components/verdicts/useDinnerToAsk";
import { useWeekList } from "@/lib/useWeekList";
import { copyWeek } from "@/lib/db/queries/weeks";
import { toMeal, updateMeal } from "@/lib/db/queries/meals";
import type { Household, MealRow } from "@/lib/db/rows";
import { findFlags, ingredientNames } from "@/lib/domain/flags";
import { householdServings } from "@/lib/domain/portions";
import { dinnerDate, daysOfWeek, todayIn, type Day } from "@/lib/domain/weeks";
import { useFlipList } from "@/lib/motion/flip";
import { photoVerdict } from "@/lib/photos/verdict";
import { barAboveNav, quietLink } from "@/lib/ui";
import { dayShort, formatWeekRange } from "@/lib/week/format";
import { dayNote } from "@/lib/week/note";

const weekdayOf = (ymd: string): string =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

export function WeekScreen({ household }: { household: Household }) {
  const { sb, data, error, live, changes, reload } = useWeekData(household);
  // The dinner card loads on its own and fails quietly: it is never part of the week's load.
  const { ask, reload: reloadAsk } = useDinnerToAsk(household, sb, changes);
  // The card the family just answered stays up while "Saved." shows, though the dinner no longer needs asking.
  const [held, setHeld] = useState<Ask | null>(null);
  const offline = useOffline();
  const card = held ?? ask;
  const list = useWeekList(household, data?.week.id ?? null);
  const [openDay, setOpenDay] = useState<Day | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // Meals whose photo turned out too small for a hero this session, and the widths already written back.
  const [demoted, setDemoted] = useState<ReadonlySet<string>>(new Set());
  const boardRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => ({
    wrote: new Set<string>(),
    meals: new Map<string, MealRow>(),
    refs: new Map<string, (img: HTMLImageElement | null) => void>(),
    loaded: new Map<string, { img: HTMLImageElement; onLoad: () => void }>(),
  }));
  const meals = data?.meals;
  useEffect(() => {
    store.meals.clear();
    meals?.forEach((m, id) => store.meals.set(id, m));
  }, [meals, store]);

  /** A ref for a meal's photo that writes the photo's width back once, so the next load knows it and nothing jumps. */
  const widthRef = useCallback(
    (mealId: string) => {
      let ref = store.refs.get(mealId);
      if (!ref) {
        ref = (img) => {
          const old = store.loaded.get(mealId);
          if (old) {
            old.img.removeEventListener("load", old.onLoad);
            store.loaded.delete(mealId);
          }
          if (!img) return;
          const report = () => {
            const w = img.naturalWidth;
            if (w <= 0 || store.wrote.has(mealId)) return;
            const known = store.meals.get(mealId)?.photo_width;
            if (known !== null && known !== undefined) return;
            store.wrote.add(mealId);
            updateMeal(sb, mealId, { photo_width: w }).catch(() => store.wrote.delete(mealId));
          };
          img.addEventListener("load", report);
          store.loaded.set(mealId, { img, onLoad: report });
          if (img.complete) report();
        };
        store.refs.set(mealId, ref);
      }
      return ref;
    },
    [sb, store],
  );

  const slot = household.slots[0] ?? "dinner";
  const days = daysOfWeek(household.week_start as Day);
  const servings = data ? householdServings(data.people) : null;
  const forDay = (d: Day) => data?.weekMeals.find((m) => m.day === d && m.slot === slot) ?? null;
  const open = openDay && data ? forDay(openDay) : null;
  const openMeal = open && data ? (data.meals.get(open.meal_id) ?? null) : null;

  const today = todayIn(household.time_zone);
  const tonight = data ? (days.find((d) => dinnerDate(data.week.week_start, d) === today) ?? null) : null;

  /** What a day shows: its meal, the allergy lines to keep in view, the note and the photo. */
  const dayInfo = (d: Day) => {
    const wm = forDay(d);
    const meal = wm && data ? data.meals.get(wm.meal_id) : null;
    if (!wm || !meal || !data) return null;
    const domain = toMeal(meal);
    const flags = data.people.length > 0 ? findFlags(ingredientNames(domain), data.people).filter((f) => f.kind === "allergy") : [];
    return {
      meal,
      photo: data.photos[meal.id] ?? null,
      note: dayNote(domain, data.people, wm.servings_override === null ? null : Number(wm.servings_override)),
      lines: flags.length > 0 ? <FlagLines flags={flags} people={data.people} onPhoto={false} /> : null,
      flags,
    };
  };
  const tonightInfo = tonight ? dayInfo(tonight) : null;
  // A hero needs a photo whose width is known and big enough: with an unknown width the dinner starts as a tile.
  const heroOk =
    !!tonightInfo &&
    !!tonightInfo.photo &&
    tonightInfo.meal.photo_width !== null &&
    photoVerdict("hero", tonightInfo.meal.photo_width) === "ok" &&
    !demoted.has(tonightInfo.meal.id);
  const heroDay = heroOk ? tonight : null;
  const cells = data ? [...(tonight && !heroDay ? [tonight] : []), ...days.filter((d) => d !== tonight)] : [];
  const flipKey = data ? `${heroDay ?? "-"}|${cells.map((d) => `${d}${forDay(d)?.meal_id ?? ""}`).join(",")}` : "";
  useFlipList(boardRef, flipKey);

  const demote = (id: string) => setDemoted((prev) => new Set(prev).add(id));

  const tile = (d: Day) => {
    const info = dayInfo(d);
    if (!info || !data) return <OpenDay day={d} slot={slot} tonight={d === tonight} wide={d === tonight} />;
    const { meal } = info;
    const isTonight = d === tonight;
    return (
      <MealTile
        name={meal.name}
        photo={info.photo}
        preview={meal.photo_preview}
        width={meal.photo_width}
        stamp={isTonight ? "Tonight" : dayShort(d)}
        stampTone={isTonight ? "tonight" : "day"}
        note={info.note}
        lines={info.lines}
        favorite={meal.is_favorite}
        onOpen={() => setOpenDay(d)}
        imgRef={widthRef(meal.id)}
      />
    );
  };

  async function repeat() {
    if (!data?.lastWeek) return;
    setCopying(true);
    setCopyError(false);
    try {
      await copyWeek(sb, data.lastWeek.id, data.week.id);
      setConfirming(false);
      await reload();
    } catch {
      setCopyError(true);
    } finally {
      setCopying(false);
    }
  }

  return (
    <section data-live={live ? "on" : undefined} className="flex flex-1 flex-col">
      <ScreenHeader
        title="This week"
        action={
          <Button variant="ghost" className="disabled:opacity-60" aria-label="Repeat last week" disabled={!data?.lastWeek || data.lastWeek.count === 0} onClick={() => setConfirming(true)}>
            <Icon icon={History} size={18} />
            Repeat
          </Button>
        }
      />

      <div ref={boardRef}>
        {data && heroDay && tonightInfo && (
          <TonightHero
            day={heroDay}
            name={tonightInfo.meal.name}
            photo={tonightInfo.photo}
            preview={tonightInfo.meal.photo_preview}
            width={tonightInfo.meal.photo_width}
            credit={tonightInfo.meal.photo_credit}
            note={tonightInfo.note}
            lines={tonightInfo.flags.length > 0 ? <FlagLines flags={tonightInfo.flags} people={data.people} onPhoto /> : null}
            favorite={tonightInfo.meal.is_favorite}
            onOpen={() => setOpenDay(heroDay)}
            onDemote={() => demote(tonightInfo.meal.id)}
            imgRef={widthRef(tonightInfo.meal.id)}
          />
        )}
        {!data && !error && <SkeletonTile crop="hero" />}

        <div className="bk-gutter flex items-center justify-between gap-2 text-small">
          <p className="min-h-5 min-w-0">
            <span data-testid="week-range">{data ? formatWeekRange(data.week.week_start) : ""}</span>
            {servings !== null && <span className="text-ink-soft"> · feeds about {servings}</span>}
          </p>
          <Link href="/household" className={`${quietLink} -mr-1 shrink-0`}>
            Who’s eating
            <Icon icon={ChevronRight} size={18} />
          </Link>
        </div>

        {data && card && data.people.length > 0 && (
          <VerdictCard
            key={`${card.dinner.mealId}|${card.dinner.date}`}
            ask={card}
            dayName={weekdayOf(card.dinner.date)}
            people={data.people}
            offline={offline}
            sb={sb}
            householdId={household.id}
            onHold={setHeld}
            onDone={reloadAsk}
          />
        )}

        <section aria-label="Dinners" className="bk-gutter mt-2">
          {error && !data ? (
            <ErrorBanner message="Couldn’t load this week." actionLabel="Try again" onAction={() => void reload()} />
          ) : !data ? (
            <div className="grid grid-cols-2 items-start gap-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonTile key={i} crop="tile" />
              ))}
              <Loading label="Loading this week" />
            </div>
          ) : (
            <div className="grid grid-cols-2 items-start gap-2">
              {cells.map((d) => (
                <div key={d} data-testid={`day-row-${d}`} data-flip-key={d} className={d === tonight && !forDay(d) ? "col-span-2" : undefined}>
                  {tile(d)}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-auto" />
      <div className={`${barAboveNav} flex flex-col gap-2`}>
        <BudgetSentence
          totalCents={list.totals.totalCents}
          targetCents={household.budget_cents}
          cushionCents={household.cushion_cents}
          exact={!!household.kroger_location_id}
          totalTestId="week-total"
        />
        <ButtonLink variant="main" href="/list">
          Build shopping list
        </ButtonLink>
      </div>

      {data && openDay && open && openMeal && (
        <MealSheet
          sb={sb}
          householdId={household.id}
          meal={openMeal}
          weekMeal={open}
          day={openDay}
          photo={data.photos[openMeal.id] ?? null}
          people={data.people}
          onClose={() => setOpenDay(null)}
          onChanged={reload}
        />
      )}

      {confirming && (
        <Sheet label="Repeat last week" title="Repeat last week" onClose={() => setConfirming(false)}>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <p className="text-body font-semibold">Copy last week’s dinners into this week? This replaces what’s planned.</p>
            {copyError && (
              <p role="alert" className="text-small font-semibold text-error">
                We couldn’t copy last week. Try again.
              </p>
            )}
            <Button variant="main" busy={copying} busyLabel="Copying…" onClick={() => void repeat()}>
              Copy dinners
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
