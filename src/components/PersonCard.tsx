"use client";
import { bracketForAge } from "@/domain/age";
import { entryProductFor } from "@/domain/ticket";
import { formatCents } from "@/domain/money";
import { ageFromText, toggle, type BookerDraft, type PassKind, type PersonDraft } from "@/lib/draft";
import type { Catalog } from "@/lib/responseSchemas";
import type { ProductId } from "@/domain/catalog";
import { Choice, DayChoices, Field } from "./ui";

type Issue = { path: string; message: string };

interface Props {
  person: PersonDraft | BookerDraft;
  base: string; // "booker" or "guests.2" – matches API error paths
  title: string;
  isBooker: boolean;
  catalog: Catalog | null;
  issues: Issue[];
  localErrors: Record<string, string>;
  onChange: (patch: Partial<BookerDraft>) => void;
  onRemove?: () => void;
}

function isBookerDraft(p: PersonDraft | BookerDraft): p is BookerDraft {
  return "email" in p;
}

export function PersonCard({ person, base, title, isBooker, catalog, issues, localErrors, onChange, onRemove }: Props) {
  const msg = (suffix: string): string | undefined => localErrors[`${base}.${suffix}`] ?? issues.find((i) => i.path === `${base}.${suffix}`)?.message;
  const age = ageFromText(person.ageText);
  const bracket = age !== undefined && Number.isInteger(age) ? bracketForAge(age) : null;
  const payingBracket = bracket === "adult" || bracket === "child" ? bracket : "adult";

  const product = (id: ProductId) => catalog?.products.find((p) => p.id === id);
  const dayProduct = product(entryProductFor("day", payingBracket));
  const allProduct = product(entryProductFor("allDays", payingBracket));
  const familyProduct = product("familyPass");
  const price = (p: ReturnType<typeof product>, suffix: string) => (p ? ` – ${p.soldOut ? "sold out" : `${formatCents(p.priceCents)}${suffix}`}` : "");
  const kind = bracket === "child" ? "child" : "adult";

  return (
    <section className="card" aria-labelledby={`${person.id}-h`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem" }}>
        <h3 id={`${person.id}-h`}>{title}</h3>
        {onRemove ? <button type="button" className="btn ghost small" onClick={onRemove}>Remove</button> : null}
      </div>

      <div className="row two">
        <Field id={`${person.id}-fn`} label="First name" error={msg("firstName")}>
          {(a) => <input {...a} type="text" autoComplete={isBooker ? "given-name" : "off"} value={person.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />}
        </Field>
        <Field id={`${person.id}-ln`} label="Last name" error={msg("lastName")}>
          {(a) => <input {...a} type="text" autoComplete={isBooker ? "family-name" : "off"} value={person.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />}
        </Field>
      </div>
      <div className="row two" style={{ marginTop: ".75rem" }}>
        <Field id={`${person.id}-age`} label="Age on 10 Nov 2026" error={msg("age")} hint={isBooker ? "The person booking must be 18 or older." : "Under 5s are free – use the 'under 5' box instead."}>
          {(a) => <input {...a} type="text" inputMode="numeric" autoComplete="off" value={person.ageText} onChange={(e) => onChange({ ageText: e.target.value })} />}
        </Field>
        {isBooker && isBookerDraft(person) ? (
          <div />
        ) : null}
      </div>
      {isBooker && isBookerDraft(person) ? (
        <div className="row two" style={{ marginTop: ".75rem" }}>
          <Field id="booker-email" label="Email (for your confirmation)" error={msg("email")}>
            {(a) => <input {...a} type="email" autoComplete="email" value={person.email} onChange={(e) => onChange({ email: e.target.value })} />}
          </Field>
          <Field id="booker-phone" label="Phone" error={msg("phone")}>
            {(a) => <input {...a} type="tel" autoComplete="tel" value={person.phone} onChange={(e) => onChange({ phone: e.target.value })} />}
          </Field>
        </div>
      ) : null}

      <fieldset>
        <legend>Ticket {bracket ? <span className="muted">({kind === "child" ? "child, 5–11" : "adult, 12+"})</span> : null}</legend>
        <div className="choices">
          <Choice name={`${person.id}-pass`} checked={person.pass === "day"} disabled={dayProduct?.soldOut} onChange={() => onChange({ pass: "day" as PassKind })}>Day pass{price(dayProduct, "/day")}</Choice>
          <Choice name={`${person.id}-pass`} checked={person.pass === "allDays"} disabled={allProduct?.soldOut} onChange={() => onChange({ pass: "allDays" })}>All-Day pass{price(allProduct, "")}</Choice>
          <Choice name={`${person.id}-pass`} checked={person.pass === "family"} disabled={familyProduct?.soldOut} onChange={() => onChange({ pass: "family" })}>Family pass{price(familyProduct, " per family")}</Choice>
        </div>
        {msg("ticket") ? <p className="err" role="alert">{msg("ticket")}</p> : null}
        {allProduct?.soldOut && person.pass !== "allDays" ? (
          <p className="hint">All-Day pass for {kind}s is sold out.</p>
        ) : null}
      </fieldset>

      {person.pass === "day" ? (
        <DayChoices legend="Which days?" name={`${person.id}-days`} selected={person.days} onToggle={(d) => onChange({ days: toggle(person.days, d) })} error={msg("ticket.days")} />
      ) : null}
      {person.pass === "allDays" ? <p className="hint">All 5 days (10–14 Nov). This can't be changed.</p> : null}
      {person.pass === "family" ? (
        <>
          <div className="row two" style={{ marginTop: ".75rem" }}>
            <Field id={`${person.id}-fg`} label="Which family pass?" hint="Everyone sharing a pass picks the same number.">
              {(a) => (
                <select {...a} value={person.familyGroup} onChange={(e) => onChange({ familyGroup: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((g) => <option key={g} value={g}>Family pass {g}</option>)}
                </select>
              )}
            </Field>
          </div>
          <DayChoices legend="Which day? (one day only)" name={`${person.id}-fday`} single selected={[person.familyDay]} onToggle={(d) => onChange({ familyDay: d })} error={msg("ticket.day")} />
          <p className="hint">A Family Pass covers up to 2 adults (12+) and 2 children (5–11) on a single day.</p>
        </>
      ) : null}
    </section>
  );
}
