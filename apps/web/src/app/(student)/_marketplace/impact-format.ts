// A footprint figure, shown the way the catalogue states it. Whole numbers
// stay whole; a published fraction keeps its places. The value is the
// server's. This only chooses how many digits to draw.
export function impactQuantity(value: number, digits: number): string {
  return value.toLocaleString("en-CA", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  });
}
