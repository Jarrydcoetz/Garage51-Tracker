"use server";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

type EnquiryInput = {
  customer_name: string;
  whatsapp: string;
  country?: string;
  email?: string;
  service_type: string;
  sessions_total?: number;
  rider_category?: string | null;
  own_gear?: boolean | null;
  selection?: string | null;
  rider_count?: number | null;
  preferred_date?: string | null;
  bike_details?: string | null;
  bike_year?: string | null;
  bike_hours?: string | null;
  work_required?: string | null;
  bike_category?: string | null;
  storage_term?: string | null;
  storage_start_date?: string | null;
  storage_end_date?: string | null;
  estimated_value?: number;
  notes?: string;
  hp_field?: string;
  turnstile_token?: string;
};

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = await res.json();
    return data.success === true;
  } catch { return false; }
}

export async function submitEnquiry(input: EnquiryInput): Promise<{ ok: boolean; error?: string }> {
  // 1. Honeypot — return fake success so bots don't know they were blocked
  if (input.hp_field) return { ok: true };

  // 2. Turnstile verification
  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!input.turnstile_token) return { ok: false, error: "Please complete the security check." };
    const valid = await verifyTurnstile(input.turnstile_token);
    if (!valid) return { ok: false, error: "Security check failed. Please refresh and try again." };
  }

  // 3. Input validation
  const phone = (input.whatsapp || "").trim();
  const name = (input.customer_name || "").trim();
  if (!name || !phone) return { ok: false, error: "Name and WhatsApp number are required." };

  // 4. Rate limiting — max 3 submissions per phone per hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("enquiries").select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", hourAgo);
  if ((count ?? 0) >= 3) {
    return { ok: false, error: "Too many submissions. Please try again later or contact us directly on WhatsApp." };
  }

  // 5. Upsert client record
  const { data: existing } = await supabase.from("clients").select("id").eq("whatsapp", phone).maybeSingle();
  let clientId = existing?.id ?? null;
  if (!clientId) {
    const { data: nc } = await supabase.from("clients").insert({ name, whatsapp: phone, email: input.email || null }).select("id").single();
    clientId = nc?.id ?? null;
  }

  // 6. Insert enquiry
  const { error } = await supabase.from("enquiries").insert({
    customer_name: name, phone, email: input.email || null,
    service_type: input.service_type, source: "form", stage: "new",
    sessions_total: input.sessions_total || 1,
    rider_category: input.rider_category || null,
    own_gear: input.own_gear ?? null,
    selection: input.selection || null,
    rider_count: input.rider_count || null,
    preferred_date: input.preferred_date || null,
    bike_details: input.bike_details || null,
    bike_year: input.bike_year || null,
    bike_hours: input.bike_hours || null,
    work_required: input.work_required || null,
    bike_category: input.bike_category || null,
    storage_term: input.storage_term || null,
    storage_start_date: input.storage_start_date || null,
    storage_end_date: input.storage_end_date || null,
    estimated_value: input.estimated_value ?? 0,
    notes: input.notes || "",
  });

  if (error) {
    console.error("Enquiry insert failed:", error.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return { ok: true };
}
