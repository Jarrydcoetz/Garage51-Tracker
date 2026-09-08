"use server";

import { createClient } from "@supabase/supabase-js";
import { ROLES, hasRole } from "../../../lib/roles";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://garage51-tracker.vercel.app";

// Service-role client: full access, used for the privileged operations.
const admin = createClient(URL, SECRET);

// Keeps only recognised, deduplicated roles — falls back to ["coach"] if
// nothing valid was passed, so a staff member is never left with zero roles.
function cleanRoles(input: string[] | undefined | null): string[] {
  const clean = Array.from(new Set((input || []).filter(r => (ROLES as readonly string[]).includes(r))));
  return clean.length > 0 ? clean : ["coach"];
}

// Verify the caller is a signed-in admin by validating their access token
// and checking their profile role. Returns the admin's id, or null.
async function requireAdmin(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: u } = await asUser.auth.getUser();
  if (!u.user) return null;
  const { data: prof } = await asUser
    .from("profiles").select("roles").eq("id", u.user.id).single();
  if (!prof || !hasRole(prof.roles, "admin")) return null;
  return u.user.id;
}

export async function inviteStaff(
  accessToken: string,
  input: { name: string; email: string; roles: string[]; whatsapp?: string }
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const roles = cleanRoles(input.roles);
  const whatsapp = input.whatsapp?.trim() || null;
  if (!name || !email) return { ok: false, error: "Name and email are required." };

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    // role (singular) is kept alongside roles for the DB trigger that
    // creates the profile row — it only knows about a single `role` field
    // today, and if that column turns out to be NOT NULL without a
    // default, an insert missing it would fail the whole invite. Cheap
    // insurance either way; the app itself only ever reads `roles`.
    data: { name, role: roles[0], roles, whatsapp },
    redirectTo: `${SITE_URL}/welcome`,
  });
  if (error) return { ok: false, error: error.message };

  // The trigger only copies name/role from metadata today, so set roles
  // (and the number) directly here too rather than relying on it picking up
  // fields it doesn't yet know about.
  if (data.user) {
    await admin.from("profiles").update({ roles, ...(whatsapp ? { whatsapp } : {}) }).eq("id", data.user.id);
  }

  return { ok: true };
}

// Supabase's invite endpoint refuses to resend to an email that's already
// registered — even if that account never confirmed and its invite link
// expired (a known Supabase Auth limitation, see supabase/auth#2180). The
// only reliable way to get a fresh, working link out is to remove the
// stale, never-confirmed invite and recreate it from scratch.
export async function resendInvite(
  accessToken: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };

  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !userRes.user) return { ok: false, error: getErr?.message || "Could not find that account." };
  const user = userRes.user;
  // No safety check on prior sign-ins here: opening an invite link now
  // establishes a session via verifyOtp (see /welcome) before the staff
  // member ever sets a password, so last_sign_in_at is set well before
  // their account actually works — it can't be used to detect "already has
  // a working account." The confirm() prompt in the staff UI is the guard.
  const email = user.email;
  if (!email) return { ok: false, error: "That account has no email on file." };

  // Metadata may still carry the old single `role` string for an invite
  // created before the move to multi-role — fold it into the array form.
  const meta = (user.user_metadata || {}) as { name?: string; roles?: string[]; role?: string; whatsapp?: string };
  const name = meta.name || "";
  const roles = cleanRoles(meta.roles && meta.roles.length > 0 ? meta.roles : meta.role ? [meta.role] : []);
  const whatsapp = meta.whatsapp || null;

  const { error: delErr } = await admin.auth.admin.deleteUser(id);
  if (delErr) return { ok: false, error: delErr.message };
  // Clear out the orphaned profile row in case there's no cascading delete
  // set up on the profiles table — the fresh invite below creates a new one.
  await admin.from("profiles").delete().eq("id", id);

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role: roles[0], roles, whatsapp },
    redirectTo: `${SITE_URL}/welcome`,
  });
  if (error) return { ok: false, error: error.message };

  if (data.user) {
    await admin.from("profiles").update({ roles, ...(whatsapp ? { whatsapp } : {}) }).eq("id", data.user.id);
  }

  return { ok: true };
}

export async function setStaffActive(
  accessToken: string,
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };
  if (id === adminId) return { ok: false, error: "You can't deactivate your own account." };

  const { error } = await admin.from("profiles").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setStaffRoles(
  accessToken: string,
  id: string,
  roles: string[]
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };
  if (id === adminId) return { ok: false, error: "You can't change your own roles." };
  const valid = roles.filter(r => (ROLES as readonly string[]).includes(r));
  if (valid.length === 0) return { ok: false, error: "Select at least one role." };

  const { error } = await admin.from("profiles").update({ roles: valid }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setStaffWhatsapp(
  accessToken: string,
  id: string,
  whatsapp: string | null
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };
  // No self-edit restriction here — unlike role/active, there's no safety
  // reason an admin shouldn't be able to set their own number too.

  const { error } = await admin.from("profiles").update({ whatsapp }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
