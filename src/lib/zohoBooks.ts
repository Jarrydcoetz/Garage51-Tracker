// Zoho Books integration. Server-side only — never import this from a
// client component, the refresh token and client secret must stay private.
//
// Design choices worth knowing:
// - Invoices are created as drafts (Zoho's default when you don't separately
//   call the "email invoice" endpoint). Nothing reaches the customer until a
//   staff member reviews and sends it from inside Zoho Books itself — that's
//   deliberate, not an oversight.
// - No tax/VAT field is set here. UAE VAT treatment is left to whatever
//   default your Zoho Books organization is already configured with, and to
//   that same staff review step before sending. Get this confirmed with
//   whoever does your books before relying on it.

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) {
    return cachedToken.accessToken;
  }
  const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com";
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN || "",
    client_id: process.env.ZOHO_CLIENT_ID || "",
    client_secret: process.env.ZOHO_CLIENT_SECRET || "",
    grant_type: "refresh_token",
  });
  const res = await fetch(`${accountsDomain}/oauth/v2/token?${params.toString()}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || "Could not refresh the Zoho access token");
  }
  cachedToken = {
    accessToken: data.access_token as string,
    expiresAt: Date.now() + ((data.expires_in as number) ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

function apiBase(): string {
  const domain = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com";
  return `${domain}/books/v3`;
}

async function zohoFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const orgId = process.env.ZOHO_ORGANIZATION_ID || "";
  const joiner = path.includes("?") ? "&" : "?";
  const url = `${apiBase()}${path}${joiner}organization_id=${orgId}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  if (!res.ok || (typeof data.code === "number" && data.code !== 0)) {
    throw new Error(data.message || `Zoho Books request failed (${res.status})`);
  }
  return data;
}

export type ZohoContactInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Creates a new Zoho contact and returns its ID. Sends the email/phone in
// both the shapes Zoho's contact object can plausibly expect (top-level and
// nested under contact_persons) — extra/unused fields are harmless, a
// missing one isn't. The email is only included if it actually looks like
// one; Zoho's own validation rejects the request outright otherwise.
export async function createZohoContact(input: ZohoContactInput): Promise<string> {
  const cleanEmail = input.email && isValidEmail(input.email) ? input.email.trim() : null;
  const data = await zohoFetch("/contacts", {
    method: "POST",
    body: JSON.stringify({
      contact_name: input.name,
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      contact_persons: [
        {
          first_name: input.name,
          is_primary_contact: true,
          ...(cleanEmail ? { email: cleanEmail } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
        },
      ],
    }),
  });
  return data.contact.contact_id as string;
}

export type ZohoInvoiceLineItem = {
  name: string;
  description?: string | null;
  rate: number;
  quantity?: number;
};

export type ZohoInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string;
};

export async function createZohoInvoice(
  contactId: string,
  lineItems: ZohoInvoiceLineItem[]
): Promise<ZohoInvoiceResult> {
  const data = await zohoFetch("/invoices", {
    method: "POST",
    body: JSON.stringify({
      customer_id: contactId,
      line_items: lineItems.map(li => ({
        name: li.name,
        ...(li.description ? { description: li.description } : {}),
        rate: li.rate,
        quantity: li.quantity ?? 1,
      })),
    }),
  });
  return {
    invoiceId: data.invoice.invoice_id as string,
    invoiceNumber: data.invoice.invoice_number as string,
  };
}

// Best-effort link to the invoice inside the Zoho Books web app. The exact
// URL shape isn't verified against a real account yet — if it doesn't land
// correctly, the invoice itself is still fine; just open Zoho Books directly.
export function invoiceWebUrl(invoiceId: string): string {
  const domain = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com";
  const webDomain = domain.replace("www.zohoapis", "books.zoho");
  const orgId = process.env.ZOHO_ORGANIZATION_ID || "";
  return `${webDomain}/app/${orgId}#/invoices/${invoiceId}`;
}
