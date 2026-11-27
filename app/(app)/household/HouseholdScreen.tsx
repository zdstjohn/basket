"use client";

import { useRef, useState } from "react";
import { AlwaysHaveSection } from "@/components/household/AlwaysHaveSection";
import { SignOutButton } from "@/components/household/SignOutButton";
import { StaplesSection } from "@/components/household/StaplesSection";
import { StoresSection } from "@/components/household/StoresSection";
import { PersonRow } from "@/components/PersonRow";
import { StorePicker, type StoreChoice } from "@/components/StorePicker";
import { createBrowserClient } from "@/lib/db/client";
import {
  createInviteLink,
  deletePerson,
  updateHousehold,
  upsertPerson,
} from "@/lib/db/queries/household";
import type { Household } from "@/lib/db/rows";
import { formatDollars, formatExtra, parseMoneyToCents } from "@/lib/domain/money-input";
import { householdServings } from "@/lib/domain/portions";
import type { Person } from "@/lib/domain/types";
import { focusRing, pillButton, textInput } from "@/lib/ui";
import { PersonEditor, type PersonDraft } from "./PersonEditor";

const NEW_PERSON: PersonDraft = { name: "", age: 0, diet: "none", appetite: 1, dislikes: [] };

const FM_NOTICES = {
  connected: "Fred Meyer is connected.",
  denied: "Fred Meyer wasn't connected.",
  failed: "That didn't work. Try connecting again.",
} as const;

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
  const sb = useRef(createBrowserClient()).current;
  const [people, setPeople] = useState(initialPeople);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [budget, setBudget] = useState(formatDollars(household.budget_cents));
  const [cushion, setCushion] = useState(formatExtra(household.cushion_cents));
  const saved = useRef({ budget: household.budget_cents, cushion: household.cushion_cents });
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<"idle" | "working" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const [fredMeyer, setFredMeyer] = useState(household.kroger_location_name);
  const [picking, setPicking] = useState(false);
  const [connected, setConnected] = useState(fredMeyerConnected);
  const [fmNotice, setFmNotice] = useState(fredMeyerNotice);
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnectFredMeyer() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/kroger/disconnect", { method: "POST" });
      if (res.status !== 204) throw new Error("disconnect failed");
      setConnected(false);
      setFmNotice(null);
    } catch {
      setFmNotice("failed");
    } finally {
      setDisconnecting(false);
    }
  }

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
    if (cents === null) {
      show(format(saved.current[field]));
      setBudgetError("Enter an amount like $200.");
      return;
    }
    setBudgetError(null);
    show(format(cents));
    if (cents === saved.current[field]) return;
    try {
      await updateHousehold(
        sb,
        household.id,
        field === "budget" ? { budget_cents: cents } : { cushion_cents: cents },
      );
      saved.current[field] = cents;
    } catch {
      show(format(saved.current[field]));
      setBudgetError("That didn't save. Try again.");
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
      linkInput.current?.select(); // clipboard blocked: leave it selected to copy by hand
    }
  }

  const servings = householdServings(people);
  const divider = "border-b border-[#F0F2EF] last:border-b-0";

  return (
    <div className="pb-6">
      <header className="px-5 pt-5 pb-2">
        <h1 className="text-[30px] font-bold tracking-tight text-ink">Household</h1>
      </header>

      <section aria-label="Who's eating" className="mx-5 mt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Who&apos;s eating · {servings} servings</h2>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className={`h-11 rounded-full px-3 text-sm font-semibold text-green ${focusRing}`}
          >
            + Add
          </button>
        </div>
        <ul className="mt-1 overflow-hidden rounded-2xl border border-line bg-white">
          {people.map((p) => (
            <li key={p.id} className={divider}>
              <PersonRow
                person={p}
                expanded={editing === p.id}
                onClick={() => setEditing(editing === p.id ? null : p.id)}
              />
              {editing === p.id && (
                <PersonEditor
                  key={p.id}
                  initial={p}
                  onSave={savePerson}
                  onDelete={() => removePerson(p.id)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </li>
          ))}
          {editing === "new" && (
            <li>
              <PersonEditor
                initial={NEW_PERSON}
                onSave={savePerson}
                onCancel={() => setEditing(null)}
              />
            </li>
          )}
        </ul>
      </section>

      <section aria-label="Budget" className="mx-5 mt-4">
        <h2 className="mb-1.5 text-[15px] font-semibold">Weekly budget</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="block rounded-[14px] border border-line bg-white px-3.5 py-2.5">
            <span className="block text-xs text-muted">Target</span>
            <input
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => saveBudget("budget")}
              className={`mt-0.5 h-8 w-full bg-transparent text-xl font-semibold text-ink ${focusRing}`}
            />
          </label>
          <label className="block rounded-[14px] border border-line bg-white px-3.5 py-2.5">
            <span className="block text-xs text-muted">Wiggle room</span>
            <input
              inputMode="decimal"
              value={cushion}
              onChange={(e) => setCushion(e.target.value)}
              onBlur={() => saveBudget("cushion")}
              className={`mt-0.5 h-8 w-full bg-transparent text-xl font-semibold text-ink ${focusRing}`}
            />
          </label>
        </div>
        {budgetError && (
          <p role="alert" className="mt-2 text-[13px] text-sale">
            {budgetError}
          </p>
        )}
      </section>

      <StoresSection household={household} />
      <StaplesSection household={household} />
      <AlwaysHaveSection household={household} />

      <section aria-label="Stores and settings" className="mx-5 mt-4">
        <h2 className="mb-1.5 text-[15px] font-semibold">Stores and sharing</h2>
        <ul className="overflow-hidden rounded-2xl border border-line bg-white">
          {STORES.map((s) => {
            const shelf = krogerEnabled && s.label === "Fred Meyer";
            return (
              <li key={s.label} className={divider}>
                <div className="flex min-h-12 items-center gap-3 py-1 pr-2 pl-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{shelf ? "Your Fred Meyer" : s.label}</span>
                    <span className="block text-xs text-muted">
                      {shelf ? (fredMeyer ?? "Pick your store for real shelf prices") : s.detail}
                    </span>
                  </span>
                  {shelf ? (
                    !picking && (
                      <button type="button" onClick={() => setPicking(true)} className={pillButton}>
                        {fredMeyer ? "Change" : "Choose store"}
                      </button>
                    )
                  ) : (
                    <button type="button" disabled className={pillButton}>
                      Coming soon
                    </button>
                  )}
                </div>
                {shelf && picking && (
                  <StorePicker onChoose={chooseFredMeyer} onCancel={() => setPicking(false)} />
                )}
              </li>
            );
          })}
          {cartEnabled && (
            <li className={divider}>
              <div className="flex min-h-12 items-center gap-3 py-1 pr-2 pl-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">Fred Meyer account</span>
                  <span className="block text-xs text-muted">
                    {connected
                      ? "Connected"
                      : "You'll sign in on Fred Meyer's own page. Basket never sees your password."}
                  </span>
                </span>
                {connected ? (
                  <button type="button" onClick={disconnectFredMeyer} disabled={disconnecting} className={pillButton}>
                    Disconnect
                  </button>
                ) : (
                  <a href="/api/kroger/connect?next=/household" className={pillButton}>
                    Connect
                  </a>
                )}
              </div>
              {fmNotice && (
                <p role="status" className="px-3.5 pb-3 text-[13px] text-ink">
                  {FM_NOTICES[fmNotice]}
                </p>
              )}
            </li>
          )}
          <li className={`${divider}`}>
            <div className="flex min-h-12 items-center gap-3 py-1 pr-2 pl-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Shared with</span>
                <span className="block text-xs text-muted">
                  {memberCount === 1 ? "Just you so far" : `${memberCount} people`}
                </span>
              </span>
              {isOwner && (
                <button
                  type="button"
                  onClick={invite}
                  disabled={inviteState === "working"}
                  className={pillButton}
                >
                  Invite
                </button>
              )}
            </div>
            {inviteState === "error" && (
              <p role="alert" className="px-3.5 pb-3 text-[13px] text-sale">
                We couldn&apos;t make an invite just now. Try again.
              </p>
            )}
            {inviteLink && (
              <div className="grid gap-2 px-3.5 pb-3">
                <label className="grid gap-1 text-xs text-muted">
                  Invite link
                  <input
                    ref={linkInput}
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className={textInput}
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={copyLink} className={pillButton}>
                    Copy
                  </button>
                  <span aria-live="polite" className="text-[13px] text-muted">
                    {copied ? "Copied. The link works once and lasts a week." : ""}
                  </span>
                </div>
              </div>
            )}
          </li>
        </ul>
      </section>

      <SignOutButton />
    </div>
  );
}
