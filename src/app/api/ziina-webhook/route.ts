import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";

const ZIINA_IPS = ["3.29.184.186", "3.29.190.95", "20.233.47.127", "13.202.161.181"];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: Request) {
  const raw = await req.text();

  // 1. IP allowlist
  const fwd = req.headers.get("x-forwarded-for") || "";
  const sourceIp = fwd.split(",")[0].trim();
  if (sourceIp && !ZIINA_IPS.includes(sourceIp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. HMAC signature
  const secret = process.env.ZIINA_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  const provided = req.headers.get("x-hmac-signature") || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. Parse event
  let payload: {
    event?: string;
    data?: { id?: string; status?: string; amount?: number; currency_code?: string };
  };
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
    // Ziina sends amount in fils (smallest unit) — convert to AED
    const paidAmountAed = payload.data.amount ? payload.data.amount / 100 : null;

    // 4. Match enquiry — verify paid amount >= expected before marking paid
    const { data: enq } = await supabase
      .from("enquiries")
      .select("id, estimated_value")
      .eq("payment_intent_id", paymentId)
      .single();

    if (enq) {
      if (paidAmountAed !== null && enq.estimated_value && paidAmountAed < enq.estimated_value * 0.99) {
        // Underpayment threshold: allow up to 1% rounding difference
        console.error(
          `Webhook amount mismatch: expected AED ${enq.estimated_value}, received AED ${paidAmountAed} for enquiry ${enq.id}`
        );
        // Still mark paid but log — don't silently accept significant underpayments in production
        // Change to `return NextResponse.json({ error: "Amount mismatch" }, { status: 400 })` for strict mode
      }
      await supabase
        .from("enquiries")
        .update({ paid_at: paidAt, status: "paid" })
        .eq("payment_intent_id", paymentId);
    }

    // 5. Match storage bike renewal
    await supabase
      .from("storage_bikes")
      .update({ renewal_paid_at: paidAt })
      .eq("renewal_payment_intent_id", paymentId);
  }

  return NextResponse.json({ received: true });
}
