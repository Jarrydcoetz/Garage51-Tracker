"use server";

import { createClient } from "@supabase/supabase-js";

type Payload = {
  customer_name: string;
  phone: string;
  email: string | null;
  service_type: string;
  preferred_date: string | null;
  estimated_value: number;
  selection_summary: string;
  notes: string;
  bike_details: string | null;
  work_required: string | null;
};

export async function submitEnquiry(p: Payload) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
  const { error } = await supabase.from("enquiries").insert({
    customer_name: p.customer_name,
    phone: p.phone,
    email: p.email,
    service_type: p.service_type,
    preferred_date: p.preferred_date,
    estimated_value: p.estimated_value,
    selection_summary: p.selection_summary,
    notes: p.notes,
    bike_details: p.bike_details,
    work_required: p.work_required,
    source: "form",
    status: "new",
  });
  if (error) return { error: error.message };
  return { ok: true };
}