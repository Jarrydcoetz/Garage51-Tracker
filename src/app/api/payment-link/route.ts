import { NextResponse } from "next/server";
import { verifyAdmin, unauthorised } from "../../../lib/api-auth";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Must be an authenticated user (any role — mechanics and admin both send payment links)
  const userId = await verifyAdmin(req, "any");
  if (!userId) return unauthorised();

  let body: { amount: number; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { amount, description } = body;
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }

  const apiKey = process.env.ZIINA_API_KEY;
  const isTest = process.env.ZIINA_TEST === "true";

  if (!apiKey) {
    return NextResponse.json({ error: "Payment gateway not configured." }, { status: 500 });
  }

  try {
    const res = await fetch("https://api-v2.ziina.com/api/payment_intent", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // fils
        currency_code: "AED",
        description: description || "Garage51 payment",
        test: isTest,
        transaction_source: "directlink",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Ziina payment intent error:", res.status);
      return NextResponse.json({ error: "Could not create payment link." }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id, url: data.payment_link_url ?? data.url });
  } catch (err) {
    console.error("Payment link error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Payment gateway error." }, { status: 500 });
  }
}
