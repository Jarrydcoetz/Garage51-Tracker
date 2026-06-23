"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import { inviteStaff, setStaffActive, setStaffRole, setStaffWhatsapp } from "./actions";

const RED = "#ED1C24";
const ROLES = ["admin", "coach", "mechanic"];
const ROLE_COLOR: Record<string, string> = { admin: "#ED1C24", coach: "#3B9EFF", mechanic: "#FFB02E" };

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  active: boolean;
  whatsapp: string | null;
  created_at: string;
};

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
.g51-item:hover{background:#322D29;}
`;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", opacity: 0.7 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StaffScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [meId, setMeId] = useState("");
  const [staff, setStaff] = useState<Profile[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "coach", whatsapp: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const me = await supabase
        .from("profiles").select("role").eq("id", data.session.user.id).single();
      if (!me.data || me.data.role !== "admin") { router.replace("/admin"); return; }
      setToken(data.session.access_token);
      setMeId(data.session.user.id);
      setMyEmail(data.session.user.email || "");
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
    setForm({ name: "", email: "", role: "coach", whatsapp: "" });
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

  function editWhatsappLocal(p: Profile, value: string) {
    setStaff(prev => prev.map(x => (x.id === p.id ? { ...x, whatsapp: value } : x)));
  }

  async function saveWhatsapp(p: Profile, value: string) {
    const cleaned = value.trim() || null;
    const res = await setStaffWhatsapp(token, p.id, cleaned);
    if (!res.ok) { setErr(res.error || "Could not save the WhatsApp number."); await load(); }
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const me = staff.find(p => p.id === meId) || null;
  const initials = ((me?.name || myEmail || "?").trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  const myColor = ROLE_COLOR[me?.role || ""] || "#3B9EFF";

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function changePassword() {
    if (newPw.length < 8) { setPwErr("Use at least 8 characters."); setPwMsg(""); return; }
    if (newPw !== confirmPw) { setPwErr("The passwords don't match."); setPwMsg(""); return; }
    setPwBusy(true); setPwErr("");
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (error) { setPwErr(error.message); return; }
    setPwMsg("Password updated."); setNewPw(""); setConfirmPw("");
  }

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <div style={s.headRight}>
          <button onClick={() => router.push("/admin")} className="g51-btn g51-ghost" style={s.ghostBtn}>← Dashboard</button>
          <div style={s.profileWrap}>
            <button onClick={() => setProfileOpen(o => !o)} className="g51-btn g51-ghost" style={s.profileBtn} aria-label="Account">
              <span style={{ ...s.avatar, background: myColor }}>{initials}</span>
              <Chevron open={profileOpen} />
            </button>
            {profileOpen && (
              <>
                <div style={s.overlay} onClick={() => { setProfileOpen(false); setPwOpen(false); }} />
                <div style={s.profileMenu}>
                  <div style={s.pmHead}>
                    <span style={{ ...s.avatarLg, background: myColor }}>{initials}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={s.pmName}>{me?.name || "Account"}</div>
                      <div style={s.pmEmail}>{myEmail}</div>
                      <span style={{ ...s.pmRole, color: myColor, borderColor: myColor + "66", background: myColor + "1c" }}>{me?.role}</span>
                    </div>
                  </div>
                  {!pwOpen ? (
                    <button onClick={() => { setPwOpen(true); setPwMsg(""); setPwErr(""); }} className="g51-item" style={s.pmItem}>Change password</button>
                  ) : (
                    <div style={s.pmForm}>
                      <input className="g51-input" type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} style={s.pmInput} />
                      <input className="g51-input" type="password" placeholder="Confirm password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={s.pmInput} />
                      {pwErr && <div style={s.pmErr}>{pwErr}</div>}
                      {pwMsg && <div style={s.pmOk}>{pwMsg}</div>}
                      <div style={s.pmFormBtns}>
                        <button onClick={changePassword} disabled={pwBusy} className="g51-btn g51-primary" style={s.pmSave}>{pwBusy ? "Saving…" : "Save"}</button>
                        <button onClick={() => { setPwOpen(false); setNewPw(""); setConfirmPw(""); }} className="g51-btn g51-ghost" style={s.pmCancel}>Cancel</button>
                      </div>
                    </div>
                  )}
                  <button onClick={logout} className="g51-item" style={{ ...s.pmItem, color: "#FF7A7A" }}>Log out</button>
                </div>
              </>
            )}
          </div>
        </div>
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
            <label style={s.ctrl}><span style={s.ctrlLabel}>WhatsApp</span>
              <input className="g51-input" value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} placeholder="+9715XXXXXXX" style={s.input} /></label>
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
                  <input
                    className="g51-input"
                    value={p.whatsapp || ""}
                    onChange={e => editWhatsappLocal(p, e.target.value)}
                    onBlur={e => saveWhatsapp(p, e.target.value)}
                    placeholder="WhatsApp: +9715XXXXXXX"
                    style={s.whatsappInput}
                  />
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
  whatsappInput: { width: "100%", maxWidth: 220, boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 7, color: "#F4F2EF", fontSize: 12.5, padding: "6px 9px", fontFamily: "inherit", marginTop: 7 },
  rowRight: { display: "flex", alignItems: "center", gap: 9, flexShrink: 0 },
  inactive: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#9A938D", border: "1px solid #4A443E", borderRadius: 20, padding: "3px 9px" },
  roleSelect: { background: "#141211", border: "1px solid #322E2A", borderRadius: 9, fontSize: 13, fontWeight: 700, padding: "8px 10px", fontFamily: "inherit" },
  ghostSmall: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  headRight: { display: "flex", alignItems: "center", gap: 9 },
  profileWrap: { position: "relative" },
  profileBtn: { display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 9px 5px 6px" },
  avatar: { width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 800 },
  avatarLg: { width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontSize: 15, fontWeight: 800, flexShrink: 0 },
  overlay: { position: "fixed", inset: 0, zIndex: 40 },
  profileMenu: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50, width: 262, background: "#26221F", border: "1px solid #38332E", borderRadius: 12, padding: 8, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" },
  pmHead: { display: "flex", gap: 11, alignItems: "center", padding: "8px 9px 12px", borderBottom: "1px solid #322E2A", marginBottom: 6 },
  pmName: { fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  pmEmail: { fontSize: 12, color: "#9A938D", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 },
  pmRole: { display: "inline-block", marginTop: 6, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: "1px solid", borderRadius: 20, padding: "2px 9px" },
  pmItem: { width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "10px 11px", cursor: "pointer", color: "#C9C2BC", fontSize: 13.5, fontFamily: "inherit" },
  pmForm: { padding: "6px 9px 9px", display: "grid", gap: 8 },
  pmInput: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "9px 11px", fontFamily: "inherit" },
  pmFormBtns: { display: "flex", gap: 8 },
  pmSave: { flex: 1, background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  pmCancel: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, cursor: "pointer" },
  pmErr: { color: "#FF6B6B", fontSize: 12.5 },
  pmOk: { color: "#2FBF71", fontSize: 12.5 },
};
