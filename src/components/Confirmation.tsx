"use client";
import { formatCents } from "@/domain/money";
import type { ConfirmedBooking } from "@/lib/responseSchemas";
import { dayLabel } from "./ui";
import { attendanceDays } from "@/domain/ticket";

export function Confirmation({ booking, onNew }: { booking: ConfirmedBooking; onNew: () => void }) {
  return (
    <>
      <div className="banner success" role="status">
        <h2 style={{ color: "var(--success-text-on-dark)", margin: 0 }}>You're booked! 🙏</h2>
        <p style={{ margin: ".25rem 0 0" }}>Show this reference at the door: <strong style={{ fontSize: "1.3rem", letterSpacing: ".05em" }}>{booking.ref}</strong></p>
        <p className="muted" style={{ margin: ".25rem 0 0" }}>Please screenshot or print this page. Emailing confirmations isn't switched on in this demo.</p>
      </div>

      <div className="panel">
        <h3>Who's coming</h3>
        <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
          {booking.people.map((p, i) => (
            <li key={i}>
              <strong>{p.firstName} {p.lastName}</strong> ({p.age}) – {p.ticket.kind === "allDays" ? "All 5 days" : p.ticket.kind === "family" ? `Family Pass ${p.ticket.group}, ${dayLabel(p.ticket.day)}` : attendanceDays(p.ticket).map(dayLabel).join(", ")}
              {p.dinnerDays.length ? <> · dinner: {p.dinnerDays.map(dayLabel).join(", ")}</> : null}
              {p.workshopDays.length ? <> · Garba workshop: {p.workshopDays.map(dayLabel).join(", ")}</> : null}
            </li>
          ))}
        </ul>
        {booking.toddlers > 0 ? (
          <p>
            Plus {booking.toddlers} child{booking.toddlers === 1 ? "" : "ren"} under 5 (no ticket)
            {(booking.toddlerDinnerDays?.length ?? 0) > 0
              ? ` · dinner: ${booking.toddlerDinnerDays!.map(dayLabel).join(", ")}`
              : ""}
            .
          </p>
        ) : null}
        <table className="lines" style={{ marginTop: ".75rem" }}>
          <tbody>
            {booking.lines.map((l) => <tr key={l.productId}><td>{l.label} × {l.quantity}</td><td>{formatCents(l.totalCents)}</td></tr>)}
            {booking.discountCents > 0 ? <tr><td>Promo {booking.promoCode}</td><td>−{formatCents(booking.discountCents)}</td></tr> : null}
            <tr className="total"><td>Paid</td><td>{formatCents(booking.totalCents)}</td></tr>
          </tbody>
        </table>
        <p className="hint">Confirmation will refer to {booking.contact.email}.</p>
      </div>
      <div className="actions">
        <button className="btn ghost" type="button" onClick={() => window.print()}>Print</button>
        <button className="btn" type="button" onClick={onNew}>Make another booking</button>
      </div>
    </>
  );
}
