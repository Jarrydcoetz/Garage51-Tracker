// Staff can hold more than one role (e.g. coach + mechanic), so profiles.roles
// is an array. Use these helpers instead of comparing a single string — they
// also cover the legacy shape ({ role: string } from before the migration to
// { roles: string[] }) so any code that hasn't been touched yet degrades
// gracefully instead of throwing.
export const ROLES = ["admin", "coach", "mechanic", "facilities"] as const;
export type Role = (typeof ROLES)[number];

export function hasRole(roles: string[] | null | undefined, role: string): boolean {
  return !!roles && roles.includes(role);
}

export function hasAnyRole(roles: string[] | null | undefined, wanted: string[]): boolean {
  return !!roles && roles.some(r => wanted.includes(r));
}
