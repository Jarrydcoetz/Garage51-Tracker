import { NextResponse } from "next/server";
import { createZohoContact, createZohoInvoice, invoiceWebUrl } from "../../../../lib/zohoBooks";

type Body = {
  zoho_contact_id?: string | null;
  customer_name?: string;
  email?: string | null;
  phone?: string | null;
  line_item_name?: string;
  line_item_description?: string | null;
  amount?: number;
};

export async function POST(req: Request) {
  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload.customer_name || !payload.amount) {
    return NextResponse.json({ error: "Missing customer name or amount." }, { status: 400 });
  }

  try {
    // Reuse the stored contact if this customer already has one — only
    // create a new Zoho contact the first time we invoice them.
    let contactId = payload.zoho_contact_id || null;
    if (!contactId) {
      contactId = await createZohoContact({
        name: payload.customer_name,
        email: payload.email,
        phone: payload.phone,
      });
    }

    const { invoiceId, invoiceNumber } = await createZohoInvoice(contactId, [
      {
        name: payload.line_item_name || "Service",
        description: payload.line_item_description,
        rate: payload.amount,
      },
    ]);

    return NextResponse.json({
      zoho_contact_id: contactId,
      zoho_invoice_id: invoiceId,
      zoho_invoice_number: invoiceNumber,
      invoice_url: invoiceWebUrl(invoiceId),
    });
  } catch (err) {
    console.error("Zoho invoice creation failed:", err);
    const message = err instanceof Error ? err.message : "Could not create the Zoho invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
