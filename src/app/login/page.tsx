"use client";
import { useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";
const RED = "#ED1C24";
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); setError(error.message); return; }
    // Role-based landing: admins go to the overview, a mechanic-only account
    // goes straight to the workshop queue. Everyone else (coaches,
    // facilities, and anyone holding more than one role) lands on the
    // general bookings page — it already scopes to what's assigned to them
    // across every service type, which is more useful than picking just one
    // role's dedicated view when someone holds several.
    const { data: prof } = await supabase.from("profiles").select("roles").eq("id", data.user.id).single();
    const roles = (prof as { roles: string[] } | null)?.roles || [];
    if (roles.includes("admin")) router.push("/admin/overview");
    else if (roles.length === 1 && roles[0] === "mechanic") router.push("/admin/workshop");
    else router.push("/admin");
  }
  return (
    <div style={styles.page}>
      <style>{`
        .g51-input::placeholder { color: #6E6862; }
        .g51-input:focus { outline: none; border-color: ${RED}; box-shadow: 0 0 0 3px rgba(237,28,36,0.18); }
        .g51-button:hover { background: #cf1820; }
      `}</style>
      <form onSubmit={handleLogin} style={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={styles.logo} />
        <div style={styles.tagline}>Staff Login</div>
        <label style={styles.field}>
          <span style={styles.label}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={styles.input} className="g51-input" />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={styles.input} className="g51-input" />
        </label>
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.button} className="g51-button">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#1A1817", display: "grid", placeItems: "center", padding: 20, fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark" },
  card: { width: "100%", maxWidth: 380, background: "#242120", border: "1px solid #39342F", borderRadius: 16, padding: "32px 28px", display: "grid", gap: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" },
  logo: { width: 180, maxWidth: "70%", height: "auto", margin: "0 auto 4px", display: "block" },
  tagline: { textAlign: "center", fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9A938D", marginBottom: 4 },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D", fontWeight: 600 },
  input: { width: "100%", boxSizing: "border-box", background: "#151311", border: "1px solid #3A332E", borderRadius: 9, color: "#F4F2EF", fontSize: 15, padding: "11px 13px", fontFamily: "inherit" },
  error: { color: "#FF6B6B", fontSize: 13, margin: 0 },
  button: { background: RED, color: "#FFFFFF", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
};
