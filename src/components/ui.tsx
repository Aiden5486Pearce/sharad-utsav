"use client";
import type { ReactNode } from "react";
import { FESTIVAL_DAYS, type FestivalDay } from "@/domain/festival";

export const dayLabel = (d: FestivalDay): string =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function Field(props: { id: string; label: string; error?: string | undefined; hint?: string; children: (a: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode }) {
  const msgId = `${props.id}-msg`;
  return (
    <div>
      <label htmlFor={props.id}>{props.label}</label>
      {props.children({ id: props.id, "aria-invalid": Boolean(props.error), "aria-describedby": props.error || props.hint ? msgId : undefined })}
      {props.error ? <p className="err" id={msgId} role="alert">{props.error}</p> : props.hint ? <p className="hint" id={msgId}>{props.hint}</p> : null}
    </div>
  );
}

export function DayChoices(props: { legend: string; name: string; selected: readonly FestivalDay[]; onToggle: (d: FestivalDay) => void; days?: readonly FestivalDay[]; enabled?: readonly FestivalDay[]; error?: string | undefined; single?: boolean }) {
  return (
    <fieldset>
      <legend>{props.legend}</legend>
      <div className="choices">
        {(props.days ?? FESTIVAL_DAYS).map((d) => (
          <label className="choice" key={d} style={{ fontWeight: 400 }}>
            <input type={props.single ? "radio" : "checkbox"} name={props.name} checked={props.selected.includes(d)} disabled={props.enabled ? !props.enabled.includes(d) : false} onChange={() => props.onToggle(d)} />
            <span>{dayLabel(d)}</span>
          </label>
        ))}
      </div>
      {props.error ? <p className="err" role="alert">{props.error}</p> : null}
    </fieldset>
  );
}

export function Choice(props: { name: string; checked: boolean; disabled?: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="choice" style={{ fontWeight: 400 }}>
      <input type="radio" name={props.name} checked={props.checked} disabled={props.disabled} onChange={props.onChange} />
      <span>{props.children}</span>
    </label>
  );
}
