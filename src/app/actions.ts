"use server";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export type EnquiryInput = {
  customer_name: string;
  whatsapp: string;
  country?: string | null;
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
  estimated_value?: number;
  notes?: string | null;
};

export async function submitEnquiry(
  data: EnquiryInput
): Promise<{ ok: boolean; error?: string }> {
  const name = data.customer_name?.trim();
  const whatsapp = data.whatsapp?.trim();
  if (!name || !whatsapp) {
    return { ok: false, error: "Name and WhatsApp number are required." };
  }
  const email = data.email?.trim() || null;
  const country = data.country?.trim() || null;

  // 1. Find or create the client by WhatsApp number (so returning
  //    customers attach to their existing record instead of duplicating).
  let clientId: string | null = null;
  const existing = await supabase
    .from("clients").select("id").eq("whatsapp", whatsapp).maybeSingle();

  if (existing.data) {
    clientId = existing.data.id;
  } else {
    const created = await supabase
      .from("clients")
      .insert({ name, whatsapp, country, email })
      .select("id").single();
    if (created.error) {
      // Another submission may have created it a moment ago — read it back.
      const retry = await supabase
        .from("clients").select("id").eq("whatsapp", whatsapp).maybeSingle();
      if (retry.data) clientId = retry.data.id;
      else return { ok: false, error: created.error.message };
    } else {
      clientId = created.data.id;
    }
  }

  // 2. Create the booking (enquiry), linked to that client.
  const { error } = await supabase.from("enquiries").insert({
    client_id: clientId,
    customer_name: name,
    phone: whatsapp,
    email,
    service_type: data.service_type,
    source: "form",
    status: "new",
    stage: "new",
    sessions_total: data.sessions_total ?? 1,
    rider_category: data.rider_category ?? null,
    own_gear: data.own_gear ?? null,
    selection: data.selection ?? null,
    rider_count: data.rider_count ?? null,
    preferred_date: data.preferred_date || null,
    bike_details: data.bike_details ?? null,
    bike_year: data.bike_year ?? null,
    bike_hours: data.bike_hours ?? null,
    work_required: data.work_required ?? null,
    estimated_value: data.estimated_value ?? 0,
    notes: data.notes ?? "",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}