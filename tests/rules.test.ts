import type { FestivalDay } from "@/domain/festival";
import { describe, expect, it } from "vitest";
import { validateCart } from "@/domain/validate";
import type { RuleCode } from "@/domain/types";
import { cart, D, dayPass, NOW, person } from "./helpers";

const codes = (c: ReturnType<typeof cart>, now = NOW): RuleCode[] => validateCart(c, now).map((i) => i.code);
const fam = (age: number, group = 1, day: FestivalDay = D.d12) => person(age, { kind: "family", group, day });

describe("family pass", () => {
  it("accepts 2 adults + 2 children", () => expect(codes(cart([fam(40), fam(38), fam(9), fam(6)]))).toEqual([]));
  it("rejects a 3rd adult (a 12-year-old counts as adult)", () => expect(codes(cart([fam(40), fam(38), fam(12)]))).toContain("FAMILY_TOO_MANY_ADULTS"));
  it("rejects a 3rd child", () => expect(codes(cart([fam(40), fam(9), fam(8), fam(7)]))).toContain("FAMILY_TOO_MANY_CHILDREN"));
  it("needs an adult — the booker is always an adult so this means a guest-only group", () =>
    expect(codes(cart([person(30, dayPass(D.d10)), fam(9, 2), fam(8, 2)]))).toContain("FAMILY_NEEDS_AN_ADULT"));
  it("everyone on one pass must share the single day", () =>
    expect(codes(cart([fam(40, 1, D.d12), fam(9, 1, D.d13)]))).toContain("FAMILY_GROUP_DAY_MISMATCH"));
});

describe("days", () => {
  it("day pass needs at least one day", () => expect(codes(cart([person(30, dayPass())]))).toContain("NO_DAYS_SELECTED"));
  it("duplicate days are refused", () => expect(codes(cart([person(30, dayPass(D.d10, D.d10))]))).toContain("DUPLICATE_DAY"));
  it("days already over can't be booked", () => {
    const during = new Date("2026-11-12T15:00:00Z");
    expect(codes(cart([person(30, dayPass(D.d10))]), during)).toContain("DAY_PASSED");
    expect(codes(cart([person(30, dayPass(D.d12))]), during)).toEqual([]);
  });
  it("All-Day pass isn't sold once the festival has started", () => {
    expect(codes(cart([person(30, { kind: "allDays" })]))).toEqual([]);
    expect(codes(cart([person(30, { kind: "allDays" })]), new Date("2026-11-11T15:00:00Z"))).toContain("ALL_DAY_PASS_CLOSED");
  });
  it("uses Texas time: 11pm on 9 Nov in Texas is still before the festival", () => {
    expect(codes(cart([person(30, { kind: "allDays" })]), new Date("2026-11-10T04:30:00Z"))).toEqual([]);
  });
});

describe("limits", () => {
  it("caps group size, toddlers and sticks", () => {
    const many = Array.from({ length: 21 }, () => person(30, dayPass(D.d10)));
    const c = codes(cart(many, { toddlers: 11, dandiyaPairs: 31 }));
    expect(c).toEqual(expect.arrayContaining(["TOO_MANY_PEOPLE", "TOO_MANY_TODDLERS", "TOO_MANY_STICKS"]));
  });
});
