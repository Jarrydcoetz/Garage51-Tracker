import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";

// Ziina only sends webhooks from these IPs
const ZIINA_IPS = ["3.29.184.186", "3.29.190.95", "20.233.47.127", "13.202.161.181"];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: Request) {
  // Read the raw body first — the signature is computed over these exact bytes
  const raw = await req.text();

  // 1) Source IP check (first hop in x-forwarded-for is the real sender on Vercel)
  const fwd = req.headers.get("x-forwarded-for") || "";
  const sourceIp = fwd.split(",")[0].trim();
  if (sourceIp && !ZIINA_IPS.includes(sourceIp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2) HMAC signature check
  const secret = process.env.ZIINA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const provided = req.headers.get("x-hmac-signature") || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3) Parse and handle the event
  let payload: { event?: string; data?: { id?: string; status?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  if (
    payload.event === "payment_intent.status.updated" &&
    payload.data?.status === "completed" &&
    payload.data.id
  ) {
    const paidAt = new Date().toISOString();
    const paymentId = payload.data.id;

    // Existing: match against bookings
    await supabase
      .from("enquiries")
      .update({ paid_at: paidAt, status: "paid" })
      .eq("payment_intent_id", paymentId);

    // New: match against storage bike renewal payment links.
    // The storage bikes page stores the Ziina payment ID in
    // renewal_payment_intent_id when the link is created.
    await supabase
      .from("storage_bikes")
      .update({ renewal_paid_at: paidAt })
      .eq("renewal_payment_intent_id", paymentId);
  }

  // Always acknowledge so Ziina doesn't keep retrying
  return NextResponse.json({ received: true });
}
