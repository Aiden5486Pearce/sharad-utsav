import { bracketForAge } from "./age";
import { PRODUCT_IDS, PRODUCTS, type ProductId } from "./catalog";
import { formatCents } from "./money";
import { evaluatePromo } from "./promo";
import { entryProductFor } from "./ticket";
import type { Cart, PersonCore, PriceLine, PriceWarning, Quote } from "./types";

export type Demand = Partial<Record<ProductId, number>>;

/** Count how many units of each product the cart needs. The same numbers drive price AND stock. */
export function tallyDemand(cart: Cart): Demand {
  const demand: Demand = {};
  const add = (id: ProductId, qty: number) => {
    if (qty > 0) demand[id] = (demand[id] ?? 0) + qty;
  };
  const familyGroups = new Set<number>();

  for (const person of cart.people) {
    const bracket = bracketForAge(person.age);
    if (bracket === "toddler") continue; // free, no ticket
    const { ticket } = person;
    if (ticket.kind === "day") add(entryProductFor("day", bracket), ticket.days.length);
    else if (ticket.kind === "allDays") add(entryProductFor("allDays", bracket), 1);
    else familyGroups.add(ticket.group);
    add("dinner", person.dinnerDays.length);
    add("garba", person.workshopDays.length);
  }
  add("familyPass", familyGroups.size);
  add("dandiya", cart.dandiyaPairs);
  if (cart.toddlers > 0 && cart.toddlerDinnerDays.length > 0) {
    add("dinner", cart.toddlers * cart.toddlerDinnerDays.length);
  }
  return demand;
}

/** The products this cart needs, as [id, quantity] pairs (only quantities above zero). */
export function demandEntries(demand: Demand): [ProductId, number][] {
  return PRODUCT_IDS.flatMap((id): [ProductId, number][] => {
    const qty = demand[id] ?? 0;
    return qty > 0 ? [[id, qty]] : [];
  });
}

export function priceCart(cart: Cart, now: Date, livePromoUses?: number | null): Quote {
  const demand = tallyDemand(cart);
  const lines: PriceLine[] = PRODUCT_IDS.flatMap((id) => {
    const quantity = demand[id] ?? 0;
    if (quantity === 0) return [];
    const product = PRODUCTS[id];
    return [{ productId: id, label: product.label, quantity, unitCents: product.priceCents, totalCents: quantity * product.priceCents }];
  });

  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const childTicketCents = lines
    .filter((l) => PRODUCTS[l.productId].audience === "child")
    .reduce((sum, l) => sum + l.totalCents, 0);

  const promo = evaluatePromo(cart.promoCode, { subtotalCents, childTicketCents }, now, livePromoUses);
  const discountCents = promo.status === "applied" ? promo.discountCents : 0;

  return {
    lines,
    subtotalCents,
    promo,
    discountCents,
    totalCents: subtotalCents - discountCents,
    warnings: familyPassWarnings(cart),
  };
}

/** A Family Pass isn't always the cheapest option. We charge what they chose, but tell them. */
function familyPassWarnings(cart: Cart): PriceWarning[] {
  const groups = new Map<number, PersonCore[]>();
  for (const p of cart.people) {
    if (p.ticket.kind !== "family") continue;
    groups.set(p.ticket.group, [...(groups.get(p.ticket.group) ?? []), p]);
  }
  const warnings: PriceWarning[] = [];
  for (const [group, members] of groups) {
    const separate = members.reduce((sum, m) => {
      const bracket = bracketForAge(m.age);
      return bracket === "toddler" ? sum : sum + PRODUCTS[entryProductFor("day", bracket)].priceCents;
    }, 0);
    if (separate <= PRODUCTS.familyPass.priceCents) {
      warnings.push({
        code: "FAMILY_PASS_NOT_CHEAPER",
        message: `Family Pass ${group} costs ${formatCents(PRODUCTS.familyPass.priceCents)}, but separate day passes for these people would cost ${formatCents(separate)}.`,
      });
    }
  }
  return warnings;
}

