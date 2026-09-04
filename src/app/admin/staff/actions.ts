"use server";

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://garage51-tracker.vercel.app";

const ROLES = ["admin", "coach", "mechanic", "facilities"];

// Service-role client: full access, used for the privileged operations.
const admin = createClient(URL, SECRET);

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
    .from("profiles").select("role").eq("id", u.user.id).single();
  if (!prof || prof.role !== "admin") return null;
  return u.user.id;
}

export async function inviteStaff(
  accessToken: string,
  input: { name: string; email: string; role: string; whatsapp?: string }
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const role = ROLES.includes(input.role) ? input.role : "coach";
  const whatsapp = input.whatsapp?.trim() || null;
  if (!name || !email) return { ok: false, error: "Name and email are required." };

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role, whatsapp },
    redirectTo: `${SITE_URL}/welcome`,
  });
  if (error) return { ok: false, error: error.message };

  // The trigger that creates the profile row only copies name/role today, so
  // set the number directly here too rather than relying on it picking up
  // an extra metadata field it doesn't yet know about.
  if (whatsapp && data.user) {
    await admin.from("profiles").update({ whatsapp }).eq("id", data.user.id);
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

  const meta = (user.user_metadata || {}) as { name?: string; role?: string; whatsapp?: string };
  const name = meta.name || "";
  const role = ROLES.includes(meta.role || "") ? (meta.role as string) : "coach";
  const whatsapp = meta.whatsapp || null;

  const { error: delErr } = await admin.auth.admin.deleteUser(id);
  if (delErr) return { ok: false, error: delErr.message };
  // Clear out the orphaned profile row in case there's no cascading delete
  // set up on the profiles table — the fresh invite below creates a new one.
  await admin.from("profiles").delete().eq("id", id);

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role, whatsapp },
    redirectTo: `${SITE_URL}/welcome`,
  });
  if (error) return { ok: false, error: error.message };

  if (whatsapp && data.user) {
    await admin.from("profiles").update({ whatsapp }).eq("id", data.user.id);
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

export async function setStaffRole(
  accessToken: string,
  id: string,
  role: string
): Promise<{ ok: boolean; error?: string }> {
  const adminId = await requireAdmin(accessToken);
  if (!adminId) return { ok: false, error: "Not authorised." };
  if (id === adminId) return { ok: false, error: "You can't change your own role." };
  if (!ROLES.includes(role)) return { ok: false, error: "Invalid role." };

  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
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
