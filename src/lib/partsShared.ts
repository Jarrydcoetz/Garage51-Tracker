// Shared parts/inventory AND labour types and math — single source of
// truth for both the Parts catalog page (app/admin/parts/page.tsx) and the
// booking dashboard (app/admin/page.tsx), so the two never drift apart the
// way the storage pricing logic almost did.

// PLACEHOLDER — this is not your real labour rate, it's a guess so the
// feature has something to compute with. Find this line and change it to
// your actual shop rate before any customer price relies on it.
export const LABOUR_RATE_PER_HOUR = 210;

export function labourCharge(hours: number | null): number {
  return Math.round((Number(hours) || 0) * LABOUR_RATE_PER_HOUR * 100) / 100;
}

export type Part = {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  markup_pct: number;
  reorder_threshold: number;
  location: string | null;
  supplier_id: string | null;
  active: boolean;
};

export type StockMovement = {
  id: string;
  part_id: string;
  quantity: number; // positive = received/adjusted in, negative = used/adjusted out
  reason: string; // "received" | "used" | "adjustment"
  enquiry_id: string | null; // set when reason === "used" — links the movement to a booking
  service_product_application_id: string | null; // set when this movement came from a recipe, not a direct add
  cost_price_snapshot: number | null;
  sell_price_snapshot: number | null;
  created_at: string;
};

export function sellPrice(p: Part): number {
  return Math.round(p.cost_price * (1 + p.markup_pct / 100) * 100) / 100;
}

export function stockFor(partId: string, movements: StockMovement[]): number {
  return movements.filter(m => m.part_id === partId).reduce((sum, m) => sum + Number(m.quantity), 0);
}

export function isLowStock(part: Part, stock: number): boolean {
  return stock <= part.reorder_threshold;
}

export type PartsUsedLine = {
  part_id: string;
  qty: number;
  sellSnapshot: number;
};

// Every "used" movement for a given booking, grouped by part and summed —
// so adding the same part twice to one job shows as one line, not two.
// Excludes movements that came from a service product's recipe — those are
// bundled into the product's own price, not itemized separately.
export function partsUsedFor(enquiryId: string, movements: StockMovement[]): PartsUsedLine[] {
  const used = movements.filter(m => m.enquiry_id === enquiryId && m.reason === "used" && !m.service_product_application_id);
  const byPart = new Map<string, { qty: number; sell: number }>();
  for (const m of used) {
    const existing = byPart.get(m.part_id) || { qty: 0, sell: m.sell_price_snapshot ?? 0 };
    existing.qty += -m.quantity; // stored negative; flip sign for display
    existing.sell = m.sell_price_snapshot ?? existing.sell;
    byPart.set(m.part_id, existing);
  }
  return Array.from(byPart.entries())
    .filter(([, v]) => v.qty > 0)
    .map(([part_id, v]) => ({ part_id, qty: v.qty, sellSnapshot: v.sell }));
}

export function partsUsedTotal(lines: PartsUsedLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.qty * l.sellSnapshot, 0) * 100) / 100;
}

export type ServiceProduct = {
  id: string;
  name: string;
  price: number;
  active: boolean;
};

// The recipe — which parts, and how many, a service product consumes
// internally whenever it's applied to a job.
export type ServiceProductItem = {
  id: string;
  service_product_id: string;
  part_id: string;
  quantity: number;
};

// One "this product was applied to this job" event, with the name and
// price snapshotted — a later price change on the product never reaches
// back and rewrites what an already-applied job actually charged.
export type ServiceProductApplication = {
  id: string;
  service_product_id: string;
  enquiry_id: string;
  name_snapshot: string;
  price_snapshot: number;
  created_at: string;
};

export function applicationsFor(enquiryId: string, applications: ServiceProductApplication[]): ServiceProductApplication[] {
  return applications.filter(a => a.enquiry_id === enquiryId);
}

export function applicationsTotal(applications: ServiceProductApplication[]): number {
  return Math.round(applications.reduce((sum, a) => sum + a.price_snapshot, 0) * 100) / 100;
}

export type RecipeUsageLine = {
  applicationId: string;
  productName: string;
  partId: string;
  qty: number;
};

// For internal use only (the job card) — every part a job's applied
// products actually consumed under the hood, broken out by which product
// triggered it. Customer-facing pricing never shows this, only the bundled
// product line and its fixed price.
export function recipeUsageFor(
  enquiryId: string,
  movements: StockMovement[],
  applications: ServiceProductApplication[]
): RecipeUsageLine[] {
  const apps = applicationsFor(enquiryId, applications);
  const lines: RecipeUsageLine[] = [];
  for (const app of apps) {
    for (const m of movements.filter(mv => mv.service_product_application_id === app.id)) {
      lines.push({ applicationId: app.id, productName: app.name_snapshot, partId: m.part_id, qty: -m.quantity });
    }
  }
  return lines;
}
