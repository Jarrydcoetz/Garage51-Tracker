// WhatsApp enquiry acknowledgement via Meta's WhatsApp Cloud API directly
// (Graph API). Server-side only — the access token must stay private.
//
// Design choices worth knowing:
// - This is a no-op until WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID /
//   WHATSAPP_TEMPLATE_NAME / WHATSAPP_TEMPLATE_LANG are all set. Until then
//   it just logs that it skipped, so local dev and any environment without
//   WhatsApp configured behaves exactly as it did before this file existed.
// - Sends a pre-approved WhatsApp template, not free-form text — Meta
//   requires an approved template for any business-initiated message outside
//   of a customer-opened 24h conversation window, which an enquiry
//   acknowledgement always is.
// - The Graph API wants the recipient number as digits only (no leading
//   "+"), unlike how it's stored in our own DB (e.g. "+971501234567").
// - Callers should treat a thrown error here as "log it, don't block the
//   customer" — see submitEnquiry() in src/app/actions.ts.

const SERVICE_LABELS: Record<string, string> = {
  academy: "Academy",
  rental: "Bike Rental",
  desert_tour: "Desert Tour",
  membership: "Membership",
  workshop: "Workshop",
  motorcycle_storage: "Motorcycle Storage",
};

export function serviceLabelFor(serviceType: string): string {
  return SERVICE_LABELS[serviceType] || serviceType;
}

function isConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_TEMPLATE_NAME &&
    process.env.WHATSAPP_TEMPLATE_LANG
  );
}

// customerName: full name as captured on the form — we only send the first
// word as the greeting, there's no separate first/last name field.
export async function sendEnquiryAck(whatsappNumber: string, customerName: string, serviceType: string): Promise<void> {
  if (!isConfigured()) {
    console.log("WhatsApp not configured, skipping enquiry acknowledgement.");
    return;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
  const firstName = customerName.trim().split(/\s+/)[0] || customerName.trim();
  const serviceLabel = serviceLabelFor(serviceType);
  const to = whatsappNumber.replace(/[^0-9]/g, "");

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: firstName },
              { type: "text", text: serviceLabel },
            ],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Meta WhatsApp send failed (${res.status}): ${detail}`);
  }
}
