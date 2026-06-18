"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

type Enquiry = {
  id: string;
  created_at: string;
  customer_name: string;
  phone: string;
  email: string | null;
  service_type: string;
  preferred_date: string | null;
  booking_at: string | null;
  status: string;
  estimated_value: number;
  notes: string;
  bike_details: string | null;
  work_required: string | null;
  selection: string | null;
  rider_category: string | null;
  own_gear: boolean | null;
  rider_count: number | null;
  bike_year: string | null;
  bike_hours: string | null;
  payment_link: string | null;
  payment_intent_id: string | null;
};

const RED = "#ED1C24";
const STATUSES = ["new", "contacted", "booked", "paid", "completed", "lost"];
const SOURCES = [
  { v: "whatsapp", label: "WhatsApp" },
  { v: "instagram", label: "Instagram" },
  { v: "phone", label: "Phone" },
  { v: "walk_in", label: "Walk-in" },
  { v: "form", label: "Web form" },
];
const STATUS_COLOR: Record<string, string> = {
  new: "#3B9EFF", contacted: "#FFB02E", booked: "#ED1C24",
  paid: "#FFC400", completed: "#2FBF71", lost: "#7A746E",
};
const aed = (n: number) => "AED " + (Number(n) || 0).toLocaleString();

const BLANK = {
  customer_name: "", phone: "", email: "", service_type: "academy",
  source: "whatsapp", status: "new", estimated_value: 0, booking_at: "", notes: "",
};

function printJobCard(r: Enquiry) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) { alert("Allow pop-ups to print the job card."); return; }
  const esc = (v: string | null) => (v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Job Card - ${esc(r.customer_name)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;color:#1A1817;padding:40px;max-width:720px;margin:0 auto;}
  .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ED1C24;padding-bottom:16px;margin-bottom:26px;}
  .head img{height:46px;width:auto;}
  h1{font-size:18px;letter-spacing:.12em;margin:0;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;margin-bottom:24px;}
  .row{border-bottom:1px solid #e2e2e2;padding:8px 0;}
  .full{grid-column:1 / -1;}
  .label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#999;}
  .val{font-size:15px;margin-top:3px;}
  .box{border:1px solid #ccc;border-radius:8px;padding:14px;min-height:70px;white-space:pre-wrap;font-size:14px;}
  .sign{display:flex;gap:48px;margin-top:54px;}
  .sign div{flex:1;border-top:1px solid #888;padding-top:6px;font-size:12px;color:#666;}
  @media print{body{padding:0;}}
</style></head><body>
  <div class="head"><img src="/garage51-logo-black.png" alt="Garage51"/><h1>WORKSHOP JOB CARD</h1></div>
  <div class="grid">
    <div class="row"><div class="label">Client</div><div class="val">${esc(r.customer_name)}</div></div>
    <div class="row"><div class="label">Phone</div><div class="val">${esc(r.phone)}</div></div>
    <div class="row"><div class="label">Email</div><div class="val">${esc(r.email) || "—"}</div></div>
    <div class="row"><div class="label">Booking date / time</div><div class="val">${esc(r.booking_at) || "—"}</div></div>
    <div class="row"><div class="label">Bike (make / model)</div><div class="val">${esc(r.bike_details) || "—"}</div></div>
    <div class="row"><div class="label">Year</div><div class="val">${esc(r.bike_year) || "—"}</div></div>
    <div class="row"><div class="label">Hours / mileage</div><div class="val">${esc(r.bike_hours) || "—"}</div></div>
  </div>
  <div class="label" style="margin-bottom:6px;">Work required</div>
  <div class="box">${esc(r.work_required)}</div>
  <div class="label" style="margin:18px 0 6px;">Notes</div>
  <div class="box">${esc(r.notes)}</div>
  <div class="sign"><div>Mechanic signature</div><div>Date completed</div></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ ...BLANK });
  const [linkBusy, setLinkBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setReady(true);
      const { data: rowsData } = await supabase
        .from("enquiries").select("*").order("created_at", { ascending: false });
      setRows((rowsData as Enquiry[]) || []);
      setLoading(false);
    });
  }, [router]);

  function edit(id: string, patch: Partial<Enquiry>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(row: Enquiry) {
    await supabase.from("enquiries").update({
      status: row.status,
      estimated_value: row.estimated_value,
      notes: row.notes,
      booking_at: row.booking_at || null,
      bike_details: row.bike_details || null,
      work_required: row.work_required || null,
      bike_year: row.bike_year || null,
      bike_hours: row.bike_hours || null,
    }).eq("id", row.id);
    setSavedId(row.id);
    setTimeout(() => setSavedId(null), 1500);
  }

  async function createPaymentLink(row: Enquiry) {
    const amount = Number(row.estimated_value) || 0;
    if (amount < 2) {
      alert("Set an estimated value of at least AED 2 before creating a payment link.");
      return;
    }
    setLinkBusy(row.id);
    try {
      const res = await fetch("/api/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, message: `Garage51 - ${row.customer_name}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        alert(data.error || "Could not create the payment link.");
        return;
      }
      await supabase.from("enquiries").update({ payment_link: data.url, payment_intent_id: data.id }).eq("id", row.id);
      edit(row.id, { payment_link: data.url, payment_intent_id: data.id });
    } catch {
      alert("Could not reach the payment service. Check your connection and try again.");
    } finally {
      setLinkBusy(null);
    }
  }

  function copyLink(url: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      alert("Payment link copied.");
    } else {
      window.prompt("Copy this payment link:", url);
    }
  }

  function whatsappLink(phone: string, name: string, link: string) {
    let n = (phone || "").replace(/\D/g, "");
    if (n.startsWith("00")) n = n.slice(2);
    if (n.startsWith("0")) n = "971" + n.slice(1); // UAE local 05x -> 9715x
    const msg = `Hi ${name}, here is your Garage51 booking payment link: ${link}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }

  async function connectWebhook() {
    try {
      const res = await fetch("/api/setup-webhook", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "Could not connect the webhook.");
        return;
      }
      alert("Payment webhook connected. Paid enquiries will now update automatically.");
    } catch {
      alert("Could not reach the server to connect the webhook.");
    }
  }

  async function createEnquiry() {
    if (!form.customer_name.trim() || !form.phone.trim()) {
      setAddError("Name and phone are required.");
      return;
    }
    setCreating(true);
    setAddError("");
    const { data, error } = await supabase.from("enquiries").insert({
      customer_name: form.customer_name,
      phone: form.phone,
      email: form.email || null,
      service_type: form.service_type,
      source: form.source,
      status: form.status,
      estimated_value: Number(form.estimated_value) || 0,
      booking_at: form.booking_at || null,
      notes: form.notes || "",
    }).select().single();
    setCreating(false);
    if (error) { setAddError(error.message); return; }
    if (data) {
      setRows(prev => [data as Enquiry, ...prev]);
      setForm({ ...BLANK });
      setAdding(false);
    }
  }

  function exportCsv() {
    const headers = ["Created", "Name", "Phone", "Email", "Service", "Requested", "Preferred date", "Booking date/time", "Status", "Est. value (AED)", "Bike", "Year", "Hours", "Work required", "Notes"];
    const esc = (v: unknown) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map(r => [
        new Date(r.created_at).toLocaleDateString(), r.customer_name, r.phone,
        r.email || "", r.service_type, r.selection || "", r.preferred_date || "", r.booking_at || "",
        r.status, r.estimated_value, r.bike_details || "", r.bike_year || "", r.bike_hours || "", r.work_required || "", r.notes || "",
      ].map(esc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `garage51-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const pipeline = rows.filter(r => ["new", "contacted"].includes(r.status)).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const booked = rows.filter(r => r.status === "booked").reduce((a, r) => a + (r.estimated_value || 0), 0);
  const earned = rows.filter(r => ["paid", "completed"].includes(r.status)).reduce((a, r) => a + (r.estimated_value || 0), 0);

  const counts: Record<string, number> = { all: rows.length };
  STATUSES.forEach(st => { counts[st] = rows.filter(r => r.status === st).length; });
  counts["sent"] = rows.filter(r => r.payment_link).length;
  const visible =
    filter === "all" ? rows
    : filter === "sent" ? rows.filter(r => r.payment_link)
    : rows.filter(r => r.status === filter);

  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <main style={s.page}>
      <div style={s.bar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => { setAdding(a => !a); setAddError(""); }} style={s.add}>+ Add enquiry</button>
          <button onClick={exportCsv} style={s.logout}>Export CSV</button>
          <button onClick={connectWebhook} style={s.logout}>Connect payment webhook</button>
          <button onClick={logout} style={s.logout}>Log out</button>
        </div>
      </div>

      <div style={s.stats}>
        <Stat label="In pipeline" value={aed(pipeline)} color="#3B9EFF" />
        <Stat label="Booked" value={aed(booked)} color={RED} />
        <Stat label="Earned" value={aed(earned)} color="#2FBF71" />
      </div>

      {adding && (
        <div style={{ ...s.card, borderColor: RED + "77", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>New enquiry</div>
          <div style={s.controls}>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Name *</span>
              <input value={form.customer_name} onChange={e => set("customer_name", e.target.value)} style={s.input} /></label>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Phone *</span>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} style={s.input} /></label>
          </div>
          <div style={s.controls}>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Email</span>
              <input value={form.email} onChange={e => set("email", e.target.value)} style={s.input} /></label>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Service</span>
              <select value={form.service_type} onChange={e => set("service_type", e.target.value)} style={s.input}>
                <option value="academy">academy</option>
                <option value="rental">rental</option>
                <option value="desert_tour">desert_tour</option>
                <option value="workshop">workshop</option>
              </select></label>
          </div>
          <div style={s.controls}>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Source</span>
              <select value={form.source} onChange={e => set("source", e.target.value)} style={s.input}>
                {SOURCES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select></label>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Status</span>
              <select value={form.status} onChange={e => set("status", e.target.value)} style={s.input}>
                {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
              </select></label>
          </div>
          <div style={s.controls}>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Est. value (AED)</span>
              <input type="number" value={form.estimated_value} onChange={e => set("estimated_value", Number(e.target.value))} style={s.input} /></label>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Booking date &amp; time</span>
              <input type="datetime-local" value={form.booking_at} onChange={e => set("booking_at", e.target.value)} style={s.input} /></label>
          </div>
          <label style={s.ctrl}><span style={s.ctrlLabel}>Notes</span>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>
          {addError && <p style={{ color: "#FF6B6B", fontSize: 13, margin: "0 0 10px" }}>{addError}</p>}
          <div style={s.cardBottom}>
            <button onClick={createEnquiry} disabled={creating} style={s.save}>{creating ? "Adding…" : "Create enquiry"}</button>
            <button onClick={() => { setAdding(false); setAddError(""); }} style={s.logout}>Cancel</button>
          </div>
        </div>
      )}

      <div style={s.chips}>
        {["all", ...STATUSES, "sent"].map(f => {
          const active = filter === f;
          const label = f === "sent" ? "links sent" : f;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...s.chip, ...(active ? { borderColor: RED, color: "#F4F2EF", background: RED + "1c" } : {}) }}>
              {label} <span style={{ opacity: 0.6 }}>{counts[f] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={s.muted}>Loading enquiries…</p>
      ) : rows.length === 0 ? (
        <p style={s.muted}>No enquiries yet. Use &quot;Add enquiry&quot; or wait for the form to be submitted.</p>
      ) : visible.length === 0 ? (
        <p style={s.muted}>Nothing in this status.</p>
      ) : (
        <div style={s.list}>
          {visible.map(r => (
            <div key={r.id} style={s.card}>
              <div style={s.cardTop}>
                <div>
                  <div style={s.name}>{r.customer_name}</div>
                  <div style={s.metaRow}>
                    <span style={s.tag}>{r.service_type}</span>
                    <span style={s.muted2}>{new Date(r.created_at).toLocaleDateString()}</span>
                    {r.preferred_date && <span style={s.muted2}>· prefers {r.preferred_date}</span>}
                  </div>
                </div>
                <span style={{ ...s.badge, color: STATUS_COLOR[r.status], borderColor: STATUS_COLOR[r.status] + "66", background: STATUS_COLOR[r.status] + "1c" }}>
                  {r.status}
                </span>
              </div>

              <div style={s.contact}>
                <a href={`tel:${r.phone}`} style={s.link}>{r.phone}</a>
                {r.email && <span style={s.muted2}>{r.email}</span>}
              </div>

              {r.selection && (
                <div style={s.selBox}>
                  <span style={s.selLabel}>Requested</span>
                  <span style={s.selText}>{r.selection}</span>
                </div>
              )}

              <div style={s.controls}>
                <label style={s.ctrl}>
                  <span style={s.ctrlLabel}>Status</span>
                  <select value={r.status} onChange={e => edit(r.id, { status: e.target.value })} style={s.input}>
                    {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </label>
                <label style={s.ctrl}>
                  <span style={s.ctrlLabel}>Est. value (AED)</span>
                  <input type="number" value={r.estimated_value} onChange={e => edit(r.id, { estimated_value: Number(e.target.value) })} style={s.input} />
                </label>
                <label style={s.ctrl}>
                  <span style={s.ctrlLabel}>Booking date &amp; time</span>
                  <input type="datetime-local" value={r.booking_at || ""} onChange={e => edit(r.id, { booking_at: e.target.value })} style={s.input} />
                </label>
              </div>

              {r.service_type === "workshop" && (
                <>
                  <div style={s.controls}>
                    <label style={s.ctrl}>
                      <span style={s.ctrlLabel}>Bike (make / model)</span>
                      <input value={r.bike_details || ""} onChange={e => edit(r.id, { bike_details: e.target.value })} style={s.input} />
                    </label>
                  </div>
                  <div style={s.controls}>
                    <label style={s.ctrl}>
                      <span style={s.ctrlLabel}>Year</span>
                      <input value={r.bike_year || ""} onChange={e => edit(r.id, { bike_year: e.target.value })} style={s.input} />
                    </label>
                    <label style={s.ctrl}>
                      <span style={s.ctrlLabel}>Hours / mileage</span>
                      <input value={r.bike_hours || ""} onChange={e => edit(r.id, { bike_hours: e.target.value })} style={s.input} />
                    </label>
                  </div>
                  <label style={s.ctrl}>
                    <span style={s.ctrlLabel}>Work required</span>
                    <textarea value={r.work_required || ""} onChange={e => edit(r.id, { work_required: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} />
                  </label>
                </>
              )}

              <label style={s.ctrl}>
                <span style={s.ctrlLabel}>Notes</span>
                <textarea value={r.notes || ""} onChange={e => edit(r.id, { notes: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} />
              </label>

              <div style={s.cardBottom}>
                <button onClick={() => save(r)} style={s.save}>Save</button>
                {savedId === r.id && <span style={s.saved}>Saved ✓</span>}
                {r.service_type === "workshop" && (
                  <button onClick={() => printJobCard(r)} style={s.logout}>Job card</button>
                )}
                {r.status === "booked" && !r.payment_link && (
                  <button onClick={() => createPaymentLink(r)} disabled={linkBusy === r.id} style={s.payBtn}>
                    {linkBusy === r.id ? "Creating…" : "Create payment link"}
                  </button>
                )}
                {r.payment_link && (
                  <>
                    <a href={whatsappLink(r.phone, r.customer_name, r.payment_link)} target="_blank" rel="noreferrer" style={s.waBtn}>Send on WhatsApp</a>
                    <a href={r.payment_link} target="_blank" rel="noreferrer" style={s.logout}>Open link</a>
                    <button onClick={() => copyLink(r.payment_link!)} style={s.logout}>Copy link</button>
                    <button onClick={() => createPaymentLink(r)} disabled={linkBusy === r.id} style={s.logout}>
                      {linkBusy === r.id ? "Creating…" : "New link"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color }}>{value}</div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#1A1817", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#1A1817", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", padding: "24px 20px 60px", maxWidth: 820, margin: "0 auto", colorScheme: "dark" },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 },
  logo: { height: 40, width: "auto" },
  add: { background: RED, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  logout: { background: "transparent", color: "#9A938D", border: "1px solid #3A332E", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  stats: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 },
  stat: { flex: "1 1 140px", background: "#242120", border: "1px solid #39342F", borderRadius: 12, padding: "14px 16px" },
  statLabel: { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D" },
  statValue: { fontSize: 22, fontWeight: 700, marginTop: 6 },
  chips: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 },
  chip: { fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 20, border: "1px solid #39342F", background: "transparent", color: "#9A938D", cursor: "pointer", textTransform: "capitalize" },
  muted: { color: "#9A938D" },
  muted2: { color: "#8C857F", fontSize: 12.5 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "#242120", border: "1px solid #39342F", borderRadius: 13, padding: "16px 18px" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  name: { fontWeight: 600, fontSize: 16 },
  metaRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" },
  tag: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#D8D2CC", border: "1px solid #4A443E", borderRadius: 5, padding: "2px 7px" },
  badge: { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", border: "1px solid", borderRadius: 20, padding: "3px 11px", whiteSpace: "nowrap" },
  contact: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", margin: "12px 0" },
  selBox: { display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", background: "#1B1816", border: "1px solid " + RED + "44", borderRadius: 9, padding: "9px 12px", marginBottom: 12 },
  selLabel: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D", flexShrink: 0 },
  selText: { fontSize: 13.5, color: "#F4F2EF", fontWeight: 500 },
  link: { color: "#F4F2EF", textDecoration: "none", fontWeight: 500, fontSize: 14 },
  controls: { display: "flex", gap: 12, flexWrap: "wrap" },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px", marginBottom: 12 },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#151311", border: "1px solid #3A332E", borderRadius: 8, color: "#F4F2EF", fontSize: 14, padding: "9px 11px", fontFamily: "inherit" },
  cardBottom: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  save: { background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  payBtn: { background: "#FFC400", color: "#1A1817", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  waBtn: { background: "#25D366", color: "#0B2E13", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textDecoration: "none" },
  saved: { color: "#2FBF71", fontSize: 13, fontWeight: 600 },
};
