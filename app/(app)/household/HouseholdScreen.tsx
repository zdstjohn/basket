"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { AlwaysHaveSection } from "@/components/household/AlwaysHaveSection";
import { SignOutButton } from "@/components/household/SignOutButton";
import { StaplesSection } from "@/components/household/StaplesSection";
import { StoresSection } from "@/components/household/StoresSection";
import { personLabel } from "@/lib/domain/flags";
import { LookPicker } from "@/components/LookPicker";
import { PersonRow } from "@/components/PersonRow";
import { StorePicker, type StoreChoice } from "@/components/StorePicker";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorBanner } from "@/components/ui/states";
import { createBrowserClient } from "@/lib/db/client";
import {
  createInviteLink,
  deletePerson,
  listPeople,
  updateHousehold,
  upsertPerson,
} from "@/lib/db/queries/household";
import type { Household } from "@/lib/db/rows";
import { formatDollars, formatExtra, parseMoneyToCents } from "@/lib/domain/money-input";
import { householdServings } from "@/lib/domain/portions";
import type { Person } from "@/lib/domain/types";
import { FM_NOTICES } from "@/lib/list/fm-notices";
import { subscribeHousehold } from "@/lib/realtime";
import { curly, servingsText } from "@/lib/text/typography";
import { ghostButton } from "@/lib/ui";
import { PersonEditor, type PersonDraft } from "./PersonEditor";

const NEW_PERSON: PersonDraft = { name: "", age: 0, diet: "none", appetite: 1, dislikes: [], allergies: [] };

const STORES = [
  { label: "Fred Meyer", detail: "Pickup and delivery" },
  { label: "Amazon", detail: "Saved items" },
  { label: "Costco", detail: "Checklist only" },
];

export function HouseholdScreen({
  household,
  initialPeople,
  memberCount,
  isOwner,
  krogerEnabled,
  cartEnabled,
  fredMeyerConnected,
  fredMeyerNotice,
}: {
  household: Household;
  initialPeople: Person[];
  memberCount: number;
  isOwner: boolean;
  /** Whether Fred Meyer shelf prices can be looked up on this server. */
  krogerEnabled: boolean;
  /** Whether people can connect their own Fred Meyer account here. */
  cartEnabled: boolean;
  fredMeyerConnected: boolean;
  /** How the last connect attempt ended, from the `fm` address parameter. */
  fredMeyerNotice: "connected" | "denied" | "failed" | null;
}) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [people, setPeople] = useState(initialPeople);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [budget, setBudget] = useState(formatDollars(household.budget_cents));
  const [cushion, setCushion] = useState(formatExtra(household.cushion_cents));
  const saved = useRef({ budget: household.budget_cents, cushion: household.cushion_cents });
  const [fieldError, setFieldError] = useState<{ field: "budget" | "cushion"; message: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<"idle" | "working" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const linkField = useRef<HTMLDivElement>(null);
  const [fredMeyer, setFredMeyer] = useState(household.kroger_location_name);
  const [picking, setPicking] = useState(false);
  const [connected, setConnected] = useState(fredMeyerConnected);
  const [fmNotice, setFmNotice] = useState<keyof typeof FM_NOTICES | null>(fredMeyerNotice);
  useEffect(() => {
    // The notice is shown once: take ?fm= out of the address so a reload or a shared link does not repeat it.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("fm")) return;
    url.searchParams.delete("fm");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const [disconnecting, setDisconnecting] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  async function disconnectFredMeyer() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/kroger/disconnect", { method: "POST" });
      if (res.status !== 204) throw new Error("disconnect failed");
      setConnected(false);
      setFmNotice(null);
    } catch {
      setFmNotice("disconnectFailed");
    } finally {
      setDisconnecting(false);
    }
  }

  // Another phone may change a person (an allergy added, say): reload so this one never saves over it.
  useEffect(() => {
    let current = true;
    const stop = subscribeHousehold(household.id, ["people"], () => {
      listPeople(sb, household.id)
        .then((fresh) => {
          if (current) setPeople(fresh);
        })
        .catch(() => {}); // keep what is on screen; the next change or foreground tries again
    });
    return () => {
      current = false;
      stop();
    };
  }, [sb, household.id]);

  async function chooseFredMeyer(s: StoreChoice) {
    await updateHousehold(sb, household.id, { kroger_location_id: s.id, kroger_location_name: s.name });
    setFredMeyer(s.name);
    setPicking(false);
  }

  async function savePerson(draft: PersonDraft) {
    const person = await upsertPerson(sb, household.id, draft, draft.id ? undefined : people.length);
    setPeople((list) =>
      draft.id ? list.map((p) => (p.id === person.id ? person : p)) : [...list, person],
    );
    setEditing(null);
  }

  async function removePerson(id: string) {
    await deletePerson(sb, id);
    setPeople((list) => list.filter((p) => p.id !== id));
    setEditing(null);
  }

  async function saveBudget(field: "budget" | "cushion") {
    const text = field === "budget" ? budget : cushion;
    const cents = parseMoneyToCents(text);
    const show = field === "budget" ? setBudget : setCushion;
    const format = field === "budget" ? formatDollars : formatExtra;
    setSaveFailed(false);
    setJustSaved(false);
    if (cents === null) {
      show(format(saved.current[field]));
      setFieldError({ field, message: "Enter an amount like $200." });
      return;
    }
    setFieldError(null);
    show(format(cents));
    if (cents === saved.current[field]) return;
    try {
      await updateHousehold(
        sb,
        household.id,
        field === "budget" ? { budget_cents: cents } : { cushion_cents: cents },
      );
      saved.current[field] = cents;
      setJustSaved(true);
    } catch {
      show(format(saved.current[field]));
      setSaveFailed(true);
    }
  }

  async function invite() {
    setInviteState("working");
    setCopied(false);
    try {
      setInviteLink(await createInviteLink(sb));
      setInviteState("idle");
    } catch {
      setInviteState("error");
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      linkField.current?.querySelector("input")?.select(); // clipboard blocked: leave it selected to copy by hand
    }
  }

  const servings = householdServings(people);
  const rowBase = "flex min-h-13 items-center gap-3 py-2";
  const title = "text-heading text-ink";
  const failure = fmNotice === "failed" || fmNotice === "disconnectFailed";

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Household" />
      <div className="bk-gutter flex flex-col gap-8 pt-4 pb-8">
        <section aria-label="Who’s eating" className="flex flex-col gap-2">
          <h2 className={title}>Who’s eating · {servingsText(servings)}</h2>
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.id}>
                <PersonRow
                  person={p}
                  label={personLabel(p, people)}
                  expanded={editing === p.id}
                  onClick={() => setEditing(editing === p.id ? null : p.id)}
                />
                {editing === p.id && (
                  <div className="pb-3">
                    <PersonEditor
                      key={p.id}
                      initial={p}
                      onSave={savePerson}
                      onDelete={() => removePerson(p.id)}
                      deleteLabel={personLabel(p, people)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )}
              </li>
            ))}
            {editing === "new" && (
              <li className="py-3">
                <PersonEditor initial={NEW_PERSON} onSave={savePerson} onCancel={() => setEditing(null)} />
              </li>
            )}
          </ul>
          <p className="text-small text-ink-soft">
            Tap a person to change what they won’t eat or are allergic to.
          </p>
          <Button variant="ghost" className="self-start" onClick={() => setEditing("new")}>
            + Add person
          </Button>
        </section>

        <section aria-label="Budget" className="flex flex-col gap-2">
          <div className="grid grid-cols-2 items-start gap-3">
            <TextField
              className="[&_input]:tabular-nums"
              label="Weekly budget"
              aria-label="Weekly budget target"
              inputMode="decimal"
              value={budget}
              error={fieldError?.field === "budget" ? fieldError.message : undefined}
              onChange={(e) => {
                setBudget(e.target.value);
                setFieldError(null);
              }}
              onBlur={() => void saveBudget("budget")}
            />
            <TextField
              className="[&_input]:tabular-nums"
              label="Wiggle room"
              inputMode="decimal"
              value={cushion}
              error={fieldError?.field === "cushion" ? fieldError.message : undefined}
              onChange={(e) => {
                setCushion(e.target.value);
                setFieldError(null);
              }}
              onBlur={() => void saveBudget("cushion")}
            />
          </div>
          {saveFailed && <ErrorBanner message="That didn’t save. Try again." />}
          <div role="status">{justSaved && <Banner role={null}>Saved.</Banner>}</div>
        </section>

        <StoresSection household={household} />
        <StaplesSection household={household} />
        <AlwaysHaveSection household={household} />

        <section aria-label="Stores and settings" className="flex flex-col gap-2">
          <h2 className={title}>Stores and sharing</h2>
          <ul className="divide-y divide-line">
            {STORES.map((s) => {
              const shelf = krogerEnabled && s.label === "Fred Meyer";
              return (
                <li key={s.label}>
                  <Row
                    title={shelf ? "Your Fred Meyer" : s.label}
                    detail={shelf ? (fredMeyer ?? "Pick your store for real shelf prices") : s.detail}
                    base={rowBase}
                  >
                    {shelf ? (
                      !picking && (
                        <Button variant="ghost" onClick={() => setPicking(true)}>
                          {fredMeyer ? "Change" : "Choose store"}
                        </Button>
                      )
                    ) : (
                      <Button variant="ghost" disabled className="disabled:border-transparent disabled:text-ink-soft">
                        Coming soon
                      </Button>
                    )}
                  </Row>
                  {shelf && picking && <StorePicker onChoose={chooseFredMeyer} onCancel={() => setPicking(false)} />}
                </li>
              );
            })}
            {(cartEnabled || connected) && (
              <li>
                <Row
                  title="Fred Meyer account"
                  base={rowBase}
                  detail={
                    connected ? (
                      <span className="flex items-center gap-1 text-ink">
                        <Icon icon={Check} size={18} />
                        Connected
                      </span>
                    ) : (
                      "You’ll sign in on Fred Meyer’s own page. Basket never sees your password."
                    )
                  }
                >
                  {connected ? (
                    <Button variant="ghost" onClick={disconnectFredMeyer} busy={disconnecting}>
                      Disconnect
                    </Button>
                  ) : cartEnabled ? (
                    <a href="/api/kroger/connect?next=/household" className={ghostButton}>
                      Connect
                    </a>
                  ) : null}
                </Row>
                {fmNotice && (
                  <div className="pb-3">
                    {failure ? <ErrorBanner message={FM_NOTICES[fmNotice]} /> : <Banner>{curly(FM_NOTICES[fmNotice])}</Banner>}
                  </div>
                )}
              </li>
            )}
            <li>
              <Row
                title="Shared with"
                detail={memberCount === 1 ? "Just you so far" : `${memberCount} people`}
                base={rowBase}
              >
                {isOwner && (
                  <Button variant="ghost" onClick={invite} busy={inviteState === "working"}>
                    Invite
                  </Button>
                )}
              </Row>
              {inviteState === "error" && (
                <div className="pb-3">
                  <ErrorBanner message="We couldn’t make an invite just now. Try again." />
                </div>
              )}
              {inviteLink && (
                <div className="grid gap-2 pb-3">
                  <div ref={linkField}>
                    <TextField label="Invite link" readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={copyLink}>
                      Copy
                    </Button>
                    <span aria-live="polite" className="text-small text-ink-soft">
                      {copied ? "Copied. The link works once and lasts a week." : ""}
                    </span>
                  </div>
                </div>
              )}
            </li>
          </ul>
        </section>

        <section aria-labelledby="household-look" className="flex flex-col gap-2">
          <h2 id="household-look" className={title}>
            Look
          </h2>
          <LookPicker labelledBy="household-look" />
        </section>

        <SignOutButton />
      </div>
    </div>
  );
}

/** A 52 px row: the name and a line of detail on the left, an action on the right. */
function Row({ title, detail, base, children }: { title: string; detail: ReactNode; base: string; children?: ReactNode }) {
  return (
    <div className={base}>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-ink">{title}</span>
        <span className="block text-small text-ink-soft">{detail}</span>
      </span>
      {children}
    </div>
  );
}
