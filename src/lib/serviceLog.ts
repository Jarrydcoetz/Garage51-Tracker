import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordServiceInput = {
  enquiryId: string;
  bikeId: string;
  itemName: string;
  itemId?: string | null;
  doneAt?: string;
  doneAtHours?: number | null;
  performedBy?: string | null;
  amountCharged?: number | null;
  invoiceRef?: string | null;
  notes?: string | null;
};

// Writes (or updates) the one service-log row for a workshop job on a storage
// bike. Idempotent on (enquiry_id, bike_id) so workshop completion and the
// storage page's invoice step can both call it without duplicating the log.
// Only fields that are actually provided overwrite an existing row.
export async function recordServiceForJob(
  supabase: SupabaseClient,
  input: RecordServiceInput,
): Promise<{ error?: string; logId?: string }> {
  const { data: existing, error: lookupError } = await supabase
    .from("sb_service_log")
    .select("id")
    .eq("enquiry_id", input.enquiryId)
    .eq("bike_id", input.bikeId)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

  const hours = input.doneAtHours != null && input.doneAtHours > 0 ? input.doneAtHours : null;
  let logId = existing?.id as string | undefined;

  if (logId) {
    const patch: Record<string, unknown> = {};
    if (input.amountCharged != null) patch.amount_charged = input.amountCharged;
    if (input.invoiceRef) patch.invoice_ref = input.invoiceRef;
    if (input.notes) patch.notes = input.notes;
    if (hours != null) patch.done_at_hours = hours;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("sb_service_log").update(patch).eq("id", logId);
      if (error) return { error: error.message };
    }
  } else {
    const { data, error } = await supabase.from("sb_service_log").insert({
      bike_id: input.bikeId,
      item_id: input.itemId ?? null,
      item_name: input.itemName,
      done_at: input.doneAt || new Date().toISOString().slice(0, 10),
      done_at_hours: hours,
      performed_by: input.performedBy ?? null,
      notes: input.notes ?? null,
      enquiry_id: input.enquiryId,
      invoice_ref: input.invoiceRef ?? null,
      amount_charged: input.amountCharged ?? null,
    }).select("id").single();
    if (error) return { error: error.message };
    logId = data?.id;
  }

  if (hours != null) {
    const { error: bikeError } = await supabase.from("storage_bikes").update({ engine_hours: hours }).eq("id", input.bikeId);
    if (bikeError) return { error: bikeError.message, logId };
    if (input.itemId) {
      await supabase.from("sb_service_items").update({ last_done_hours: hours }).eq("id", input.itemId);
    }
  }

  return { logId };
}
