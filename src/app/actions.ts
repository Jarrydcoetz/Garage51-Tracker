"use server";

import { createClient } from "@supabase/supabase-js";
import { WAIVERS, waiverRef } from "../lib/waivers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

type WaiverAcceptanceInput = {
  waiverIds: string[];
  participantDob: string;
  guardianName?: string;
  guardianPhone?: string;
  juniorAcknowledged?: boolean;
  signature: string;
  checkboxesAccepted: Record<string, boolean[]>;
  mediaConsent: boolean | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
};

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
  waiver?: WaiverAcceptanceInput;
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
  // 1. Honeypot
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

  // 4. Waiver validation — if waivers are required, signature must be present
  if (input.waiver && input.waiver.waiverIds.length > 0) {
    if (!input.waiver.signature.trim()) {
      return { ok: false, error: "Please sign the participant agreement." };
    }
    if (!input.waiver.participantDob) {
      return { ok: false, error: "Date of birth is required." };
    }
    const isJunior = input.waiver.waiverIds.includes("COACH-02");
    if (isJunior && !input.waiver.guardianName?.trim()) {
      return { ok: false, error: "Guardian name is required for junior participants." };
    }
  }

  // 5. Rate limiting
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("enquiries").select("id", { count: "exact", head: true })
    .eq("phone", phone).gte("created_at", hourAgo);
  if ((count ?? 0) >= 3) {
    return { ok: false, error: "Too many submissions. Please try again later or contact us directly on WhatsApp." };
  }

  // 6. Upsert client record
  const { data: existing } = await supabase.from("clients").select("id").eq("whatsapp", phone).maybeSingle();
  let clientId = existing?.id ?? null;
  if (!clientId) {
    const { data: nc } = await supabase.from("clients")
      .insert({ name, whatsapp: phone, email: input.email || null })
      .select("id").single();
    clientId = nc?.id ?? null;
  }

  // 7. Insert enquiry
  const { data: enqData, error } = await supabase.from("enquiries").insert({
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
  }).select("id").single();

  if (error || !enqData) {
    console.error("Enquiry insert failed:", error?.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // 8. Store waiver acceptance records (one per waiver)
  if (input.waiver && input.waiver.waiverIds.length > 0) {
    const acceptedAt = new Date().toISOString();
    const records = input.waiver.waiverIds.map(waiverIdStr => {
      const def = WAIVERS[waiverIdStr];
      const ref = def ? waiverRef(def) : waiverIdStr;
      return {
        enquiry_id: enqData.id,
        waiver_id: waiverIdStr,
        waiver_version: def?.version || "1.0",
        document_hash: ref,
        participant_name: name,
        participant_dob: input.waiver!.participantDob || null,
        guardian_name: input.waiver!.guardianName || null,
        guardian_phone: input.waiver!.guardianPhone || null,
        signature: input.waiver!.signature,
        checkboxes_accepted: input.waiver!.checkboxesAccepted[waiverIdStr] || [],
        media_consent: input.waiver!.mediaConsent,
        emergency_contact_name: input.waiver!.emergencyContactName || null,
        emergency_contact_phone: input.waiver!.emergencyContactPhone || null,
        emergency_contact_relationship: input.waiver!.emergencyContactRelationship || null,
        service_type: input.service_type,
        activity_date: input.preferred_date || null,
        accepted_at: acceptedAt,
      };
    });

    await supabase.from("waiver_acceptances").insert(records);
  }

  return { ok: true };
}
