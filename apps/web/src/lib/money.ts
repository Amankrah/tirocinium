// Money crosses the seam as integer cents and is only ever divided here, at the
// last possible moment before it is read (decision 0062). Nothing in the
// interface does arithmetic on these values; the server already did it, and a
// total the client recomputed would be a second opinion the student cannot
// defend.

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const KILOS = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });

export function money(cents: number): string {
  return CAD.format(cents / 100);
}

export function mass(grams: number): string {
  if (grams === 0) return "0 kg";
  return grams < 1000 ? `${grams} g` : `${KILOS.format(grams / 1000)} kg`;
}

// Lead time in the terms a supplier quotes it: working days, never a date. The
// catalogue has no calendar, and inventing one would turn an estimate into a
// promise.
export function lead(days: number): string {
  if (days <= 0) return "Same day";
  return days === 1 ? "1 working day" : `${days} working days`;
}
