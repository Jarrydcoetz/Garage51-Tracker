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

type ZohoContactRecord = { contact_id: string; contact_name?: string; email?: string; phone?: string };

function normalizePhoneDigits(p: string): string {
  return (p || "").replace(/\D/g, "");
}
// Compares normalized digit strings, tolerant of a country-code prefix
// mismatch (e.g. "0501234567" vs "971501234567") by also checking whether
// one ends with the other's last 9 digits — the local-number length for UAE
// mobiles regardless of which prefix form got stored where.
function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tailLen = 9;
  return da.length >= tailLen && db.length >= tailLen && da.slice(-tailLen) === db.slice(-tailLen);
}

// Looks for an existing Zoho contact before creating one — Zoho's contact
// list only supports "_contains" (substring) filters, so every candidate is
// re-checked here for a real exact match before being accepted. Tried in
// order of reliability: email, then phone, then exact name as a last
// resort (names alone can collide, so only used when nothing else matched).
async function findZohoContact(input: ZohoContactInput): Promise<string | null> {
  const cleanEmail = input.email && isValidEmail(input.email) ? input.email.trim() : null;
  if (cleanEmail) {
    const data = await zohoFetch(`/contacts?email_contains=${encodeURIComponent(cleanEmail)}`);
    const match = ((data.contacts || []) as ZohoContactRecord[])
      .find(c => (c.email || "").trim().toLowerCase() === cleanEmail.toLowerCase());
    if (match) return match.contact_id;
  }
  if (input.phone?.trim()) {
    const digits = normalizePhoneDigits(input.phone);
    if (digits) {
      const data = await zohoFetch(`/contacts?phone_contains=${encodeURIComponent(digits.slice(-9))}`);
      const match = ((data.contacts || []) as ZohoContactRecord[])
        .find(c => phonesMatch(c.phone || "", input.phone || ""));
      if (match) return match.contact_id;
    }
  }
  if (input.name?.trim()) {
    const data = await zohoFetch(`/contacts?contact_name_contains=${encodeURIComponent(input.name.trim())}`);
    const match = ((data.contacts || []) as ZohoContactRecord[])
      .find(c => (c.contact_name || "").trim().toLowerCase() === input.name.trim().toLowerCase());
    if (match) return match.contact_id;
  }
  return null;
}

// Reuses an existing Zoho contact when one genuinely matches (by email,
// then phone, then exact name), only creating a new one when nothing does.
// Use this instead of createZohoContact directly for anything reachable
// more than once for the same person — it's what stops every invoice run
// from spawning a fresh duplicate contact in Zoho.
export async function findOrCreateZohoContact(input: ZohoContactInput): Promise<string> {
  const existing = await findZohoContact(input);
  if (existing) return existing;
  return createZohoContact(input);
}

// Creates a new Zoho contact and returns its ID. Sends the email/phone in
// both the shapes Zoho's contact object can plausibly expect (top-level and
// nested under contact_persons) — extra/unused fields are harmless, a
// missing one isn't. The email is only included if it actually looks like
// one; Zoho's own validation rejects the request outright otherwise.
//
// vat_treatment defaults to "vat_not_registered" — this org's UAE Zoho
// Books setup requires every contact to have a VAT treatment before an
// invoice can be raised for them, and contacts created via this API (unlike
// ones created through Zoho's own UI) never got one set, which silently
// broke invoice creation for any brand-new customer. Confirmed with the
// business this default is correct for Garage51's typical customer.
export async function createZohoContact(input: ZohoContactInput): Promise<string> {
  const cleanEmail = input.email && isValidEmail(input.email) ? input.email.trim() : null;
  const data = await zohoFetch("/contacts", {
    method: "POST",
    body: JSON.stringify({
      contact_name: input.name,
      vat_treatment: "vat_not_registered",
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

// A contact found by findOrCreateZohoContact may have been archived directly
// in Zoho Books (independently of this app) at some point after it was
// created — Zoho refuses to invoice an inactive contact outright.
export async function reactivateZohoContact(contactId: string): Promise<void> {
  await zohoFetch(`/contacts/${contactId}/active`, { method: "POST" });
}

export async function createZohoInvoice(
  contactId: string,
  lineItems: ZohoInvoiceLineItem[]
): Promise<ZohoInvoiceResult> {
  const body = JSON.stringify({
    customer_id: contactId,
    line_items: lineItems.map(li => ({
      name: li.name,
      ...(li.description ? { description: li.description } : {}),
      rate: li.rate,
      quantity: li.quantity ?? 1,
    })),
  });
  let data;
  try {
    data = await zohoFetch("/invoices", { method: "POST", body });
  } catch (err) {
    // Reactivate once and retry, rather than failing the whole invoice over
    // a contact-status flag this app doesn't otherwise manage.
    const message = err instanceof Error ? err.message : "";
    if (!/inactive/i.test(message)) throw err;
    await reactivateZohoContact(contactId);
    data = await zohoFetch("/invoices", { method: "POST", body });
  }
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
