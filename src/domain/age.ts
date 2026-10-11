/** Age rules from the brief. Age is measured on the first festival day. */
export const AGE = {
  childMin: 5,
  adultMin: 12,
  bookerMin: 18,
  max: 120,
} as const;

export type AgeBracket = "toddler" | "child" | "adult";
export type PayingBracket = Exclude<AgeBracket, "toddler">;

export function isValidAge(age: number): boolean {
  return Number.isInteger(age) && age >= 0 && age <= AGE.max;
}

export function bracketForAge(age: number): AgeBracket {
  if (age < AGE.childMin) return "toddler";
  if (age < AGE.adultMin) return "child";
  return "adult";
}
