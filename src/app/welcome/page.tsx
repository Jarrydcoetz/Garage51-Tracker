"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

const RED = "#ED1C24";

export default function Welcome() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { settled = true; setReady(true); setChecked(true); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { settled = true; setReady(true); setChecked(true); }
    });
    const t = setTimeout(() => { if (!settled) setChecked(true); }, 2500);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function save() {
    if (password.length < 8) { setErr("Use at least 8 characters."); return; }
    if (password !== confirm) { setErr("The passwords don't match."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(() => router.replace("/admin"), 1200);
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />

        {!checked && !ready && <p style={s.muted}>Checking your invite…</p>}

        {checked && !ready && (
          <>
            <h1 style={s.h1}>Link expired</h1>
            <p style={s.muted}>This invite link is invalid or has already been used. Ask your admin to send a new one.</p>
            <button onClick={() => router.replace("/login")} style={s.btn}>Go to login</button>
          </>
        )}

        {ready && !done && (
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

        {done && (
          <>
            <h1 style={s.h1}>You're all set</h1>
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
