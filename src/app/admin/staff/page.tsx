"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import { inviteStaff, setStaffActive, setStaffRole } from "./actions";

const RED = "#ED1C24";
const ROLES = ["admin", "coach", "mechanic"];
const ROLE_COLOR: Record<string, string> = { admin: "#ED1C24", coach: "#3B9EFF", mechanic: "#FFB02E" };

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  active: boolean;
  created_at: string;
};

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
`;

export default function StaffScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [meId, setMeId] = useState("");
  const [staff, setStaff] = useState<Profile[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "coach" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const me = await supabase
        .from("profiles").select("role").eq("id", data.session.user.id).single();
      if (!me.data || me.data.role !== "admin") { router.replace("/admin"); return; }
      setToken(data.session.access_token);
      setMeId(data.session.user.id);
      await load();
      setReady(true);
    });
  }, [router]);

  async function load() {
    const { data } = await supabase
      .from("profiles").select("*").order("created_at", { ascending: true });
    setStaff((data as Profile[]) || []);
  }

  async function invite() {
    setErr(""); setMsg("");
    if (!form.name.trim() || !form.email.trim()) { setErr("Name and email are required."); return; }
    setBusy(true);
    const res = await inviteStaff(token, form);
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Could not send the invite."); return; }
    setMsg(`Invite sent to ${form.email.trim()}.`);
    setForm({ name: "", email: "", role: "coach" });
    await load();
  }

  async function changeRole(p: Profile, role: string) {
    setStaff(prev => prev.map(x => (x.id === p.id ? { ...x, role } : x)));
    const res = await setStaffRole(token, p.id, role);
    if (!res.ok) { setErr(res.error || "Could not change role."); await load(); }
  }

  async function toggleActive(p: Profile) {
    const next = !p.active;
    setStaff(prev => prev.map(x => (x.id === p.id ? { ...x, active: next } : x)));
    const res = await setStaffActive(token, p.id, next);
    if (!res.ok) { setErr(res.error || "Could not update."); await load(); }
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={() => router.push("/admin")} className="g51-btn g51-ghost" style={s.ghostBtn}>← Dashboard</button>
      </header>

      <div style={s.wrap}>
        <h1 style={s.h1}>Staff</h1>
        <p style={s.sub}>Invite coaches and mechanics, and manage their access. Invited staff set their own password from the email link.</p>

        <div style={s.card}>
          <div style={s.cardTitle}>Invite a staff member</div>
          <div style={s.controls}>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Name</span>
              <input className="g51-input" value={form.name} onChange={e => set("name", e.target.value)} style={s.input} /></label>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Email</span>
              <input className="g51-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} style={s.input} /></label>
            <label style={{ ...s.ctrl, flex: "0 0 150px" }}><span style={s.ctrlLabel}>Role</span>
              <select className="g51-input" value={form.role} onChange={e => set("role", e.target.value)} style={s.input}>
                <option value="coach">coach</option>
                <option value="mechanic">mechanic</option>
                <option value="admin">admin</option>
              </select></label>
          </div>
          <div style={s.actions}>
            <button onClick={invite} disabled={busy} className="g51-btn g51-primary" style={s.primaryBtn}>{busy ? "Sending…" : "Send invite"}</button>
            {msg && <span style={s.ok}>{msg}</span>}
            {err && <span style={s.err}>{err}</span>}
          </div>
        </div>

        <div style={s.listTitle}>Team ({staff.length})</div>
        <div style={s.list}>
          {staff.map(p => {
            const isMe = p.id === meId;
            return (
              <div key={p.id} style={s.row}>
                <div style={s.rowMain}>
                  <div style={s.name}>{p.name || "(no name)"}{isMe && <span style={s.youTag}>you</span>}</div>
                  <div style={s.email}>{p.email}</div>
                </div>
                <div style={s.rowRight}>
                  {!p.active && <span style={s.inactive}>inactive</span>}
                  <select value={p.role} onChange={e => changeRole(p, e.target.value)} disabled={isMe}
                    className="g51-input" style={{ ...s.roleSelect, color: ROLE_COLOR[p.role] || "#F4F2EF" }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={() => toggleActive(p)} disabled={isMe}
                    className="g51-btn g51-ghost" style={s.ghostSmall}>
                    {p.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623" },
  logo: { height: 30, width: "auto" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  wrap: { maxWidth: 760, margin: "0 auto", padding: "26px 20px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 22px", lineHeight: 1.5 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, padding: 18, marginBottom: 26 },
  cardTitle: { fontWeight: 700, fontSize: 15, marginBottom: 14 },
  controls: { display: "flex", gap: 12, flexWrap: "wrap" },
  ctrl: { display: "grid", gap: 5, flex: "1 1 180px", marginBottom: 14 },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  actions: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  primaryBtn: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  ok: { color: "#2FBF71", fontSize: 13, fontWeight: 600 },
  err: { color: "#FF6B6B", fontSize: 13, fontWeight: 600 },
  listTitle: { fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D", margin: "0 0 12px" },
  list: { display: "flex", flexDirection: "column", gap: 9 },
  row: { display: "flex", alignItems: "center", gap: 12, background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 12, padding: "13px 16px", flexWrap: "wrap" },
  rowMain: { flex: "1 1 200px", minWidth: 0 },
  name: { fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 },
  youTag: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9A938D", background: "#2C2824", borderRadius: 20, padding: "2px 8px" },
  email: { fontSize: 13, color: "#9A938D", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowRight: { display: "flex", alignItems: "center", gap: 9, flexShrink: 0 },
  inactive: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#9A938D", border: "1px solid #4A443E", borderRadius: 20, padding: "3px 9px" },
  roleSelect: { background: "#141211", border: "1px solid #322E2A", borderRadius: 9, fontSize: 13, fontWeight: 700, padding: "8px 10px", fontFamily: "inherit" },
  ghostSmall: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
};
