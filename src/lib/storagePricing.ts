// Motorcycle storage pricing — the single source of truth, shared between
// the public booking form (app/page.tsx) and the admin dashboard
// (app/admin/page.tsx). Change rates or terms here only; both pages pick
// up the change automatically.

export type StorageCategory = "adult" | "junior";
export type StorageTermKey = "month_to_month" | "3_months" | "6_months" | "12_months";

// Month-to-month is billed at this rate per month, ongoing. Any fixed term
// gets the discounted "committed" monthly rate, charged as a single
// upfront total for the whole term (e.g. 3 months at the committed rate,
// paid as one lump sum at booking time).
export const STORAGE_MONTHLY_RATE: Record<StorageCategory, { month_to_month: number; committed: number }> = {
  adult: { month_to_month: 550, committed: 450 },
  junior: { month_to_month: 450, committed: 350 },
};

export const STORAGE_TERMS: { key: StorageTermKey; label: string; months: number }[] = [
  { key: "month_to_month", label: "Month-to-month", months: 1 },
  { key: "3_months", label: "3 months", months: 3 },
  { key: "6_months", label: "6 months", months: 6 },
  { key: "12_months", label: "12 months", months: 12 },
];

export function storageTermMonths(term: string): number {
  return STORAGE_TERMS.find(t => t.key === term)?.months ?? 1;
}

export function storageMonthlyRate(category: string, term: string): number {
  const rates = STORAGE_MONTHLY_RATE[category as StorageCategory];
  if (!rates) return 0;
  return term === "month_to_month" ? rates.month_to_month : rates.committed;
}

// The actual amount to charge: the monthly rate times the term length.
// For month-to-month this is just one month's rate; for a fixed term it's
// the full upfront total.
export function storageTotalPrice(category: string, term: string): number {
  return storageMonthlyRate(category, term) * storageTermMonths(term);
}

// Adds whole calendar months to a yyyy-mm-dd date string, returning the
// same format. Used to auto-suggest a pick-up/renewal date once a fixed
// term and a drop-off date are both known.
export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
