import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const key = process.env.ZIINA_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Payment service is not configured." }, { status: 500 });
  }

  let body: { amount?: number; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const aed = Number(body.amount);
  if (!aed || aed < 2) {
    return NextResponse.json({ error: "Amount must be at least AED 2." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;

  try {
    const res = await fetch("https://api-v2.ziina.com/api/payment_intent", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(aed * 100), // Ziina expects fils (AED x 100)
        currency_code: "AED",
        message: body.message || "Garage51 booking",
        success_url: `${origin}/payment-success`,
        cancel_url: `${origin}/`,
        test: process.env.ZIINA_TEST === "true",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Could not create payment link." },
        { status: 502 }
      );
    }
    return NextResponse.json({ url: data.redirect_url, id: data.id });
  } catch {
    return NextResponse.json({ error: "Could not reach the payment service." }, { status: 502 });
  }
}