import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Verify the request carries a valid session token from an admin user.
 * Pass (role) to require a specific role; omit to accept any authenticated user.
 * Returns the user ID on success, null on failure.
 */
export async function verifyAdmin(
  request: Request,
  role: "admin" | "any" = "admin"
): Promise<string | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;

  if (role === "any") return user.id;

  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return prof?.role === "admin" ? user.id : null;
}

/** Convenience: return a 401 JSON response */
export function unauthorised() {
  return Response.json({ error: "Unauthorised." }, { status: 401 });
}
