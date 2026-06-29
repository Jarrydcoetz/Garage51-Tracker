// Shared hours-based maintenance checklist — single source of truth for
// both the Fleet Bikes page and the Storage Bikes page, so the two don't
// quietly drift into different checklists for the same kind of bike.
//
// This list draws on the original fleet checklist plus the fuller workshop
// inspection checklist from the job-card spec. Every interval here is a
// starting guess, not a real maintenance schedule — go through this with
// whoever actually knows these bikes before trusting the due flags.

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

export function hoursSince(currentHours: number, hoursAtLastDone: number): number {
  return Math.max(0, Number(currentHours) - Number(hoursAtLastDone));
}
export function isItemDue(currentHours: number, hoursAtLastDone: number, intervalHours: number): boolean {
  return hoursSince(currentHours, hoursAtLastDone) >= intervalHours;
}
