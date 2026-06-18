import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.ZIINA_API_KEY;
  const secret = process.env.ZIINA_WEBHOOK_SECRET;
  if (!apiKey || !secret) {
    return NextResponse.json(
      { error: "ZIINA_API_KEY or ZIINA_WEBHOOK_SECRET is missing in the environment." },
      { status: 500 }
    );
  }

  const origin = new URL(req.url).origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return NextResponse.json(
      { error: "Run this on your live site, not localhost — Ziina can't reach localhost." },
      { status: 400 }
    );
  }

  const webhookUrl = `${origin}/api/ziina-webhook`;

  try {
    const res = await fetch("https://api-v2.ziina.com/api/webhook", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Ziina rejected the webhook registration." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, url: webhookUrl });
  } catch {
    return NextResponse.json({ error: "Could not reach Ziina." }, { status: 502 });
  }
}