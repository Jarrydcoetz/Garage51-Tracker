import type { SupabaseClient } from "@supabase/supabase-js";

// Permanently deletes one enquiry (a booking OR a workshop job — both are
// enquiries rows) and every child row that references it with no DB cascade,
// in dependency order so Postgres never rejects the final delete. Deleting the
// "used" stock_movements restores inventory automatically (stock is the sum of
// movements). Returns an error string naming the step that failed, or null.
export async function deleteEnquiryFully(
  supabase: SupabaseClient,
  enquiryId: string,
): Promise<string | null> {
  let r;
  r = await supabase.from("stock_movements").delete().eq("enquiry_id", enquiryId);
  if (r.error) return `Could not delete the parts usage: ${r.error.message}`;
  r = await supabase.from("service_product_applications").delete().eq("enquiry_id", enquiryId);
  if (r.error) return `Could not delete the service products: ${r.error.message}`;
  r = await supabase.from("sessions").delete().eq("enquiry_id", enquiryId);
  if (r.error) return `Could not delete the sessions: ${r.error.message}`;
  r = await supabase.from("waiver_acceptances").delete().eq("enquiry_id", enquiryId);
  if (r.error) return `Could not delete the waivers: ${r.error.message}`;
  r = await supabase.from("tasks").delete().eq("linked_enquiry_id", enquiryId);
  if (r.error) return `Could not delete the linked tasks: ${r.error.message}`;
  r = await supabase.from("sb_service_log").delete().eq("enquiry_id", enquiryId);
  if (r.error) return `Could not delete the service log: ${r.error.message}`;
  // A storage bike may point at this enquiry as its active service job — clear it.
  r = await supabase.from("storage_bikes").update({ service_enquiry_id: null, service_completed_at: null }).eq("service_enquiry_id", enquiryId);
  if (r.error) return `Could not clear the storage-bike link: ${r.error.message}`;
  r = await supabase.from("enquiries").delete().eq("id", enquiryId);
  if (r.error) return `Could not delete the booking: ${r.error.message}`;
  return null;
}
