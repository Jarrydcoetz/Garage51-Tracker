import { NextResponse } from "next/server";
import { verifyAdmin, unauthorised } from "../../../../lib/api-auth";
import { findOrCreateZohoContact, createZohoInvoice, invoiceWebUrl } from "../../../../lib/zohoBooks";

type LineItemInput = { name: string; description?: string | null; rate: number; quantity?: number };

type Body = {
  zoho_contact_id?: string | null;
  customer_name?: string;
  email?: string | null;
  phone?: string | null;
  line_item_name?: string;
  line_item_description?: string | null;
  amount?: number;
  // Multi-line-item form — one invoice covering several things at once
  // (e.g. one invoice for two bikes' storage renewals for the same client).
  // When present this takes priority over the single line_item_*/amount
  // fields above.
  line_items?: LineItemInput[];
};

export async function POST(req: Request) {
  // Must be an authenticated admin
  const adminId = await verifyAdmin(req);
  if (!adminId) return unauthorised();

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const lineItems: LineItemInput[] = Array.isArray(payload.line_items) && payload.line_items.length > 0
    ? payload.line_items
    : payload.amount
    ? [{ name: payload.line_item_name || "Service", description: payload.line_item_description, rate: payload.amount }]
    : [];

  if (!payload.customer_name || lineItems.length === 0) {
    return NextResponse.json({ error: "Missing customer name or amount." }, { status: 400 });
  }

  try {
    let contactId = payload.zoho_contact_id || null;
    if (!contactId) {
      contactId = await findOrCreateZohoContact({
        name: payload.customer_name,
        email: payload.email,
        phone: payload.phone,
      });
    }

    const { invoiceId, invoiceNumber } = await createZohoInvoice(contactId, lineItems);

    return NextResponse.json({
      zoho_contact_id: contactId,
      zoho_invoice_id: invoiceId,
      zoho_invoice_number: invoiceNumber,
      invoice_url: invoiceWebUrl(invoiceId),
    });
  } catch (err) {
    // Trim PII — log the error message only, never the full payload
    const message = err instanceof Error ? err.message : "Could not create the Zoho invoice.";
    console.error("Zoho invoice creation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
