"use server";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export type EnquiryInput = {
  customer_name: string;
  phone: string;
  email?: string;
  service_type: string;
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
  if (!data.customer_name?.trim() || !data.phone?.trim()) {
    return { ok: false, error: "Name and phone are required." };
  }

  const { error } = await supabase.from("enquiries").insert({
    customer_name: data.customer_name.trim(),
    phone: data.phone.trim(),
    email: data.email?.trim() || null,
    service_type: data.service_type,
    source: "form",
    status: "new",
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