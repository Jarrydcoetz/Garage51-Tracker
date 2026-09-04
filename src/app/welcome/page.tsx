"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

const RED = "#ED1C24";

// Modern Supabase invite links arrive as ?token_hash=...&type=invite (or a
// PKCE ?code=), not a ready-made session — they must be explicitly exchanged
// via verifyOtp/exchangeCodeForSession. That exchange is gated behind a
// manual "Continue" tap rather than firing on page load: some email
// security scanners (Microsoft Defender Safe Links, Mimecast, etc.)
// prefetch links in transit and would otherwise burn the one-time token
// before the actual person ever sees this page.
const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];
function isEmailOtpType(v: string | null): v is EmailOtpType {
  return !!v && (EMAIL_OTP_TYPES as readonly string[]).includes(v);
}
function readParam(name: string): string | null {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get(name);
  if (fromQuery) return fromQuery;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get(name);
}
function hasInviteToken(): boolean {
  return (!!readParam("token_hash") && isEmailOtpType(readParam("type"))) || !!readParam("code");
}
function readHashParams(): URLSearchParams {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash);
}

type Stage = "checking" | "confirm" | "verifying" | "ready" | "expired" | "done";

export default function Welcome() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { settled = true; setStage("ready"); }
    });

    async function init() {
      // Supabase's own hosted /verify redirect (still what {{ .ConfirmationURL }}
      // sends) hands the browser real, already-issued session tokens directly
      // in the hash fragment — there's no token left to gate behind a tap,
      // just a session to pick up before it's lost. Handled explicitly here
      // rather than relying on the SDK's automatic detection, since that
      // races against this same check and can lose.
      const hashParams = readHashParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!error) { settled = true; setStage("ready"); return; }
      }

      const { data } = await supabase.auth.getSession();
      if (settled) return;
      if (data.session) { settled = true; setStage("ready"); return; }
      // No session yet — if there's an invite token in the URL, wait for the
      // person to tap Continue; otherwise there's genuinely nothing to try.
      setStage(hasInviteToken() ? "confirm" : "expired");
    }
    init();

    const t = setTimeout(() => {
      if (!settled) setStage(prev => (prev === "checking" ? "expired" : prev));
    }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function confirmInvite() {
    setStage("verifying");
    const tokenHash = readParam("token_hash");
    const type = readParam("type");
    const code = readParam("code");

    if (tokenHash && isEmailOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) { console.error("verifyOtp failed:", error.message); setStage("expired"); return; }
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) { console.error("exchangeCodeForSession failed:", error.message); setStage("expired"); return; }
    } else {
      setStage("expired");
      return;
    }
    setStage("ready");
  }

  async function save() {
    if (password.length < 8) { setErr("Use at least 8 characters."); return; }
    if (password !== confirm) { setErr("The passwords don't match."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStage("done");
    setTimeout(() => router.replace("/admin"), 1200);
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />

        {stage === "checking" && <p style={s.muted}>Checking your invite…</p>}

        {stage === "confirm" && (
          <>
            <h1 style={s.h1}>You&apos;re invited</h1>
            <p style={s.muted}>Tap below to confirm it&apos;s you and set up your Garage51 account.</p>
            <button onClick={confirmInvite} style={s.btn}>Continue</button>
          </>
        )}

        {stage === "verifying" && <p style={s.muted}>Confirming your invite…</p>}

        {stage === "expired" && (
          <>
            <h1 style={s.h1}>Link expired</h1>
            <p style={s.muted}>This invite link is invalid or has already been used. Ask your admin to send a new one.</p>
            <button onClick={() => router.replace("/login")} style={s.btn}>Go to login</button>
          </>
        )}

        {stage === "ready" && (
          <>
            <h1 style={s.h1}>Set your password</h1>
            <p style={s.muted}>Choose a password to finish setting up your Garage51 account.</p>
            <label style={s.field}><span style={s.label}>New password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={s.input} /></label>
            <label style={s.field}><span style={s.label}>Confirm password</span>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={s.input} /></label>
            {err && <p style={s.err}>{err}</p>}
            <button onClick={save} disabled={busy} style={s.btn}>{busy ? "Saving…" : "Save & continue"}</button>
          </>
        )}

        {stage === "done" && (
          <>
            <h1 style={s.h1}>You&apos;re all set</h1>
            <p style={s.muted}>Taking you to your dashboard…</p>
          </>
        )}
      </div>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", display: "grid", placeItems: "center", padding: "24px 18px" },
  card: { width: "100%", maxWidth: 380, background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 16, padding: "30px 26px", textAlign: "center" },
  logo: { height: 40, width: "auto", display: "block", margin: "0 auto 20px" },
  h1: { fontSize: 21, fontWeight: 800, margin: "0 0 8px" },
  muted: { color: "#9A938D", fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 },
  field: { display: "grid", gap: 6, marginBottom: 14, textAlign: "left" },
  label: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 15, padding: "11px 13px", fontFamily: "inherit" },
  err: { color: "#FF6B6B", fontSize: 13, margin: "0 0 12px" },
  btn: { width: "100%", background: RED, color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4 },
};
