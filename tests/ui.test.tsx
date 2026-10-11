import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BookingApp } from "@/components/BookingApp";
import { initialState, reducer } from "@/lib/bookingReducer";
import { toQuoteBody } from "@/lib/draft";

const start = () => initialState("key-0000000000000000");

describe("booking reducer", () => {
  it("changing the Family Pass day for one member moves everyone on that pass", () => {
    let s = reducer(start(), { type: "addGuest", id: "g1" });
    s = reducer(s, { type: "booker", patch: { pass: "family", familyGroup: 1 } });
    s = reducer(s, { type: "guest", id: "g1", patch: { pass: "family", familyGroup: 1 } });
    s = reducer(s, { type: "guest", id: "g1", patch: { familyDay: "2026-11-13" } });
    expect(s.booker.familyDay).toBe("2026-11-13");
  });
  it("switching to a pass that drops a day also drops dinner/workshop on that day", () => {
    let s = reducer(start(), { type: "booker", patch: { days: ["2026-11-11", "2026-11-12"], dinnerDays: ["2026-11-11", "2026-11-12"], workshopDays: ["2026-11-11"] } });
    s = reducer(s, { type: "booker", patch: { days: ["2026-11-12"] } });
    expect(s.booker.dinnerDays).toEqual(["2026-11-12"]);
    expect(s.booker.workshopDays).toEqual([]);
  });
  it("number of people in the request always equals the number of people on screen", () => {
    let s = start();
    s = reducer(s, { type: "addGuest", id: "a" });
    s = reducer(s, { type: "addGuest", id: "b" });
    s = reducer(s, { type: "removeGuest", id: "a" });
    expect(toQuoteBody(s).guests).toHaveLength(1);
  });
  it("nonsense in the age box is sent as nonsense (null), never silently fixed", () => {
    const s = reducer(start(), { type: "booker", patch: { ageText: "7.5" } });
    expect(JSON.parse(JSON.stringify(toQuoteBody(s))).booker.age).toBeNull();
  });
});

describe("page", () => {
  it("server-renders the first step", () => {
    const html = renderToString(<BookingApp />);
    expect(html).toContain("Sharad Utsav 2026");
    expect(html).toContain("Who is coming?");
  });
});
