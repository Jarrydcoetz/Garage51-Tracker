// Shared parts/inventory types and math — single source of truth for both
// the Parts catalog page (app/admin/parts/page.tsx) and the booking
// dashboard (app/admin/page.tsx), so the two never drift apart the way the
// storage pricing logic almost did.

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
export function partsUsedFor(enquiryId: string, movements: StockMovement[]): PartsUsedLine[] {
  const used = movements.filter(m => m.enquiry_id === enquiryId && m.reason === "used");
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
