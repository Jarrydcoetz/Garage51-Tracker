// Shared hours-based maintenance checklist — single source of truth for
// both the Fleet Bikes page and the Storage Bikes page.
//
// Intervals are starting guesses — adjust per bike on either page once you
// know better. DUE_SOON_THRESHOLD_HOURS controls how many hours before due
// an item gets flagged amber.

export const DUE_SOON_THRESHOLD_HOURS = 5;

export const SERVICE_ITEMS = [
  { key: "oil_change", label: "Oil change", defaultInterval: 10 },
  { key: "air_filter", label: "Air filter", defaultInterval: 10 },
  { key: "chain_sprockets", label: "Chain & sprockets", defaultInterval: 25 },
  { key: "brake_pads_front", label: "Brake pads — front", defaultInterval: 25 },
  { key: "brake_pads_rear", label: "Brake pads — rear", defaultInterval: 25 },
  { key: "brake_fluid", label: "Brake fluid", defaultInterval: 100 },
  { key: "top_end", label: "Top-end / piston", defaultInterval: 50 },
  { key: "coolant_radiator", label: "Coolant / radiator", defaultInterval: 50 },
  { key: "spark_plug", label: "Spark plug", defaultInterval: 25 },
  { key: "battery", label: "Battery / charge check", defaultInterval: 10 },
  { key: "tires", label: "Tires / tubes condition", defaultInterval: 25 },
  { key: "wheel_bearings", label: "Wheel bearings", defaultInterval: 100 },
  { key: "steering_bearings", label: "Steering-head bearings", defaultInterval: 100 },
  { key: "swingarm_bearings", label: "Swingarm / linkage bearings", defaultInterval: 100 },
  { key: "fork_shock_service", label: "Fork & shock service", defaultInterval: 50 },
  { key: "cables_controls", label: "Cables & controls", defaultInterval: 50 },
  { key: "fuel_system", label: "Fuel system / lines", defaultInterval: 50 },
  { key: "fasteners", label: "Fastener / torque check", defaultInterval: 25 },
  { key: "electrical", label: "Electrical / lighting", defaultInterval: 50 },
];

export const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICE_ITEMS.map(i => [i.key, i.label]));

// An immutable event in the service log — every "Log service" action
// creates one of these; nothing is ever overwritten or deleted.
export type ServiceLogEntry = {
  id: string;
  bike_id?: string;         // fleet_service_log
  storage_bike_id?: string; // storage_bikes_service_log
  item_key: string;
  hours_at_service: number;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
};

export function hoursSince(currentHours: number, hoursAtLastDone: number): number {
  return Math.max(0, Number(currentHours) - Number(hoursAtLastDone));
}

export function hoursRemaining(currentHours: number, hoursAtLastDone: number, intervalHours: number): number {
  return intervalHours - hoursSince(currentHours, hoursAtLastDone);
}

export function isItemDue(currentHours: number, hoursAtLastDone: number, intervalHours: number): boolean {
  return hoursSince(currentHours, hoursAtLastDone) >= intervalHours;
}

export function isItemDueSoon(currentHours: number, hoursAtLastDone: number, intervalHours: number): boolean {
  const remaining = hoursRemaining(currentHours, hoursAtLastDone, intervalHours);
  return remaining > 0 && remaining <= DUE_SOON_THRESHOLD_HOURS;
}

export type ItemStatus = "overdue" | "due_soon" | "ok";

export function itemStatus(currentHours: number, hoursAtLastDone: number, intervalHours: number): ItemStatus {
  if (isItemDue(currentHours, hoursAtLastDone, intervalHours)) return "overdue";
  if (isItemDueSoon(currentHours, hoursAtLastDone, intervalHours)) return "due_soon";
  return "ok";
}

// Given the service log for a bike, return the most recent hours_at_service
// for a specific item — or fall back to the fallback value (the initial
// hours_at_last_done baseline stored when the bike was first added).
export function lastServicedAt(
  bikeId: string,
  itemKey: string,
  log: ServiceLogEntry[],
  fallback: number,
  bikeIdField: "bike_id" | "storage_bike_id" = "bike_id"
): number {
  const entries = log
    .filter(e => e[bikeIdField] === bikeId && e.item_key === itemKey)
    .sort((a, b) => b.hours_at_service - a.hours_at_service);
  return entries.length > 0 ? entries[0].hours_at_service : fallback;
}

