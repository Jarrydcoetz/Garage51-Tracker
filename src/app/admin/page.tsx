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
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const aed = (n: number) => "AED " + (Number(n) || 0).toLocaleString();
const dotColor = (k: string) => STATUS_COLOR[k] || (k === "sent" ? "#2FBF71" : "#6F6862");

const FILTER_OPTS = [
  { key: "all", label: "All enquiries" },
  ...STATUSES.map(st => ({ key: st, label: cap(st) })),
  { key: "sent", label: "Payment link sent" },
];

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

const CSS = `
.g51-row{transition:background .15s ease;}
.g51-row:hover{background:#2A2624;}
.g51-card{transition:border-color .15s ease;}
.g51-card:hover{border-color:#403A35;}
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-item:hover{background:#322D29;}
.g51-input{transition:border-color .15s ease;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-expand{animation:g51fade .18s ease;}
.g51-btn:disabled{opacity:.55;cursor:default;}
@keyframes g51fade{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
`;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", flexShrink: 0, opacity: 0.7 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, sub, value, color }: { label: string; sub: string; value: string; color: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statSub}>{sub}</div>
    </div>
  );
}

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
    if (amount < 2) { alert("Set an estimated value of at least AED 2 before creating a payment link."); return; }
    setLinkBusy(row.id);
    try {
      const res = await fetch("/api/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, message: `Garage51 - ${row.customer_name}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) { alert(data.error || "Could not create the payment link."); return; }
      await supabase.from("enquiries").update({ payment_link: data.url, payment_intent_id: data.id }).eq("id", row.id);
      edit(row.id, { payment_link: data.url, payment_intent_id: data.id });
    } catch {
      alert("Could not reach the payment service. Check your connection and try again.");
    } finally {
      setLinkBusy(null);
    }
  }

  function copyLink(url: string) {
    if (navigator.clipboard) { navigator.clipboard.writeText(url); alert("Payment link copied."); }
    else { window.prompt("Copy this payment link:", url); }
  }

  function whatsappLink(phone: string, name: string, link: string) {
    let n = (phone || "").replace(/\D/g, "");
    if (n.startsWith("00")) n = n.slice(2);
    if (n.startsWith("0")) n = "971" + n.slice(1);
    const msg = `Hi ${name}, here is your Garage51 booking payment link: ${link}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }

  async function connectWebhook() {
    try {
      const res = await fetch("/api/setup-webhook", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.error || "Could not connect the webhook."); return; }
      alert("Payment webhook connected. Paid enquiries will now update automatically.");
    } catch { alert("Could not reach the server to connect the webhook."); }
  }

  async function createEnquiry() {
    if (!form.customer_name.trim() || !form.phone.trim()) { setAddError("Name and phone are required."); return; }
    setCreating(true); setAddError("");
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
    if (data) { setRows(prev => [data as Enquiry, ...prev]); setForm({ ...BLANK }); setAdding(false); }
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

  const counts: Record<string, number> = { all: rows.length, sent: rows.filter(r => r.payment_link).length };
  STATUSES.forEach(st => { counts[st] = rows.filter(r => r.status === st).length; });

  const q = query.trim().toLowerCase();
  let visible = filter === "all" ? rows
    : filter === "sent" ? rows.filter(r => r.payment_link)
    : rows.filter(r => r.status === filter);
  if (q) visible = visible.filter(r =>
    r.customer_name.toLowerCase().includes(q) ||
    (r.phone || "").toLowerCase().includes(q) ||
    (r.selection || "").toLowerCase().includes(q) ||
    r.service_type.toLowerCase().includes(q)
  );

  const currentLabel = FILTER_OPTS.find(o => o.key === filter)?.label ?? "All";
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <div style={s.headerActions}>
          <button onClick={() => { setAdding(a => !a); setAddError(""); }} className="g51-btn g51-primary" style={s.primaryBtn}>+ New enquiry</button>
          <button onClick={exportCsv} className="g51-btn g51-ghost" style={s.ghostBtn}>Export</button>
          <button onClick={logout} className="g51-btn g51-ghost" style={s.ghostBtn}>Log out</button>
        </div>
      </header>

      <div style={s.bodyWrap}>
        <div style={s.stats}>
          <Stat label="In pipeline" sub="New + contacted" value={aed(pipeline)} color="#5BB0FF" />
          <Stat label="Booked" sub="Awaiting payment" value={aed(booked)} color={RED} />
          <Stat label="Earned" sub="Paid + completed" value={aed(earned)} color="#2FBF71" />
        </div>

        {adding && (
          <div style={s.addPanel}>
            <div style={s.addTitle}>New enquiry</div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Name *</span>
                <input className="g51-input" value={form.customer_name} onChange={e => set("customer_name", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Phone *</span>
                <input className="g51-input" value={form.phone} onChange={e => set("phone", e.target.value)} style={s.input} /></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Email</span>
                <input className="g51-input" value={form.email} onChange={e => set("email", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Service</span>
                <select className="g51-input" value={form.service_type} onChange={e => set("service_type", e.target.value)} style={s.input}>
                  <option value="academy">academy</option>
                  <option value="rental">rental</option>
                  <option value="desert_tour">desert_tour</option>
                  <option value="workshop">workshop</option>
                </select></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Source</span>
                <select className="g51-input" value={form.source} onChange={e => set("source", e.target.value)} style={s.input}>
                  {SOURCES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Status</span>
                <select className="g51-input" value={form.status} onChange={e => set("status", e.target.value)} style={s.input}>
                  {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                </select></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Est. value (AED)</span>
                <input className="g51-input" type="number" value={form.estimated_value} onChange={e => set("estimated_value", Number(e.target.value))} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Booking date &amp; time</span>
                <input className="g51-input" type="datetime-local" value={form.booking_at} onChange={e => set("booking_at", e.target.value)} style={s.input} /></label>
            </div>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Notes</span>
              <textarea className="g51-input" value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>
            {addError && <p style={s.addError}>{addError}</p>}
            <div style={s.actions}>
              <button onClick={createEnquiry} disabled={creating} className="g51-btn g51-primary" style={s.save}>{creating ? "Adding…" : "Create enquiry"}</button>
              <button onClick={() => { setAdding(false); setAddError(""); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
            </div>
          </div>
        )}

        <div style={s.toolbar}>
          <div style={s.searchWrap}>
            <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.5 }}><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input className="g51-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, phone, or service" style={s.search} />
          </div>
          <div style={s.filterWrap}>
            <button onClick={() => setFilterOpen(o => !o)} className="g51-btn g51-ghost" style={s.filterBtn}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(filter), flexShrink: 0 }} />
              <span>{currentLabel}</span>
              <span style={s.pillCount}>{counts[filter] ?? 0}</span>
              <Chevron open={filterOpen} />
            </button>
            {filterOpen && (
              <>
                <div style={s.overlay} onClick={() => setFilterOpen(false)} />
                <div style={s.menu}>
                  {FILTER_OPTS.map(opt => (
                    <button key={opt.key} className="g51-item" onClick={() => { setFilter(opt.key); setFilterOpen(false); }}
                      style={{ ...s.menuItem, ...(filter === opt.key ? { color: "#F4F2EF", background: "#2C2723" } : {}) }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(opt.key), flexShrink: 0 }} />
                      <span style={{ flex: 1, textAlign: "left" }}>{opt.label}</span>
                      <span style={s.menuCount}>{counts[opt.key] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <p style={s.muted}>Loading enquiries…</p>
        ) : rows.length === 0 ? (
          <div style={s.empty}>No enquiries yet. New web submissions appear here automatically.</div>
        ) : visible.length === 0 ? (
          <div style={s.empty}>Nothing matches this view.</div>
        ) : (
          <div style={s.list}>
            {visible.map(r => {
              const open = expanded.has(r.id);
              const sc = STATUS_COLOR[r.status];
              return (
                <div key={r.id} className="g51-card" style={s.card}>
                  <div className="g51-row" style={s.cardHead} onClick={() => toggleExpand(r.id)}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: sc, flexShrink: 0 }} />
                    <div style={s.headMain}>
                      <div style={s.name}>{r.customer_name}</div>
                      <div style={s.sub}>
                        {cap(r.service_type.replace("_", " "))}
                        <span style={s.dotSep}>·</span>
                        {new Date(r.created_at).toLocaleDateString()}
                        {r.selection && <><span style={s.dotSep}>·</span>{r.selection}</>}
                      </div>
                    </div>
                    <div style={s.headRight}>
                      {r.estimated_value > 0 && <span style={s.amount}>{aed(r.estimated_value)}</span>}
                      <span style={{ ...s.pill, color: sc, borderColor: sc + "66", background: sc + "1c" }}>{r.status}</span>
                      <Chevron open={open} />
                    </div>
                  </div>

                  {open && (
                    <div className="g51-expand" style={s.cardBody}>
                      <div style={s.contact}>
                        <a href={`tel:${r.phone}`} style={s.link}>{r.phone}</a>
                        {r.email && <span style={s.muted2}>{r.email}</span>}
                        {r.preferred_date && <span style={s.muted2}>Prefers {r.preferred_date}</span>}
                      </div>

                      {r.selection && (
                        <div style={s.selBox}>
                          <span style={s.selLabel}>Requested</span>
                          <span style={s.selText}>{r.selection}</span>
                        </div>
                      )}

                      <div style={s.controls}>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Status</span>
                          <select className="g51-input" value={r.status} onChange={e => edit(r.id, { status: e.target.value })} style={s.input}>
                            {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                          </select></label>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Est. value (AED)</span>
                          <input className="g51-input" type="number" value={r.estimated_value} onChange={e => edit(r.id, { estimated_value: Number(e.target.value) })} style={s.input} /></label>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Booking date &amp; time</span>
                          <input className="g51-input" type="datetime-local" value={r.booking_at || ""} onChange={e => edit(r.id, { booking_at: e.target.value })} style={s.input} /></label>
                      </div>

                      {r.service_type === "workshop" && (
                        <>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Bike (make / model)</span>
                              <input className="g51-input" value={r.bike_details || ""} onChange={e => edit(r.id, { bike_details: e.target.value })} style={s.input} /></label>
                          </div>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Year</span>
                              <input className="g51-input" value={r.bike_year || ""} onChange={e => edit(r.id, { bike_year: e.target.value })} style={s.input} /></label>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Hours / mileage</span>
                              <input className="g51-input" value={r.bike_hours || ""} onChange={e => edit(r.id, { bike_hours: e.target.value })} style={s.input} /></label>
                          </div>
                          <label style={s.ctrl}><span style={s.ctrlLabel}>Work required</span>
                            <textarea className="g51-input" value={r.work_required || ""} onChange={e => edit(r.id, { work_required: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>
                        </>
                      )}

                      <label style={s.ctrl}><span style={s.ctrlLabel}>Notes</span>
                        <textarea className="g51-input" value={r.notes || ""} onChange={e => edit(r.id, { notes: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>

                      <div style={s.actions}>
                        <button onClick={() => save(r)} className="g51-btn g51-primary" style={s.save}>Save</button>
                        {savedId === r.id && <span style={s.saved}>Saved ✓</span>}
                        {r.service_type === "workshop" && (
                          <button onClick={() => printJobCard(r)} className="g51-btn g51-ghost" style={s.ghostBtn}>Job card</button>
                        )}
                        {r.status === "booked" && !r.payment_link && (
                          <button onClick={() => createPaymentLink(r)} disabled={linkBusy === r.id} className="g51-btn" style={s.payBtn}>
                            {linkBusy === r.id ? "Creating…" : "Create payment link"}
                          </button>
                        )}
                        {r.payment_link && (
                          <>
                            <a href={whatsappLink(r.phone, r.customer_name, r.payment_link)} target="_blank" rel="noreferrer" className="g51-btn" style={s.waBtn}>Send on WhatsApp</a>
                            <a href={r.payment_link} target="_blank" rel="noreferrer" className="g51-btn g51-ghost" style={s.ghostBtn}>Open link</a>
                            <button onClick={() => copyLink(r.payment_link!)} className="g51-btn g51-ghost" style={s.ghostBtn}>Copy link</button>
                            <button onClick={() => createPaymentLink(r)} disabled={linkBusy === r.id} className="g51-btn g51-ghost" style={s.ghostBtn}>{linkBusy === r.id ? "…" : "New link"}</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer style={s.footer}>
        <button onClick={connectWebhook} className="g51-btn g51-ghost" style={s.ghostBtn}>Connect payment webhook</button>
        <span style={s.footerNote}>One-time setup · run on the live site</span>
      </footer>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50 },
  header: { position: "sticky", top: 0, zIndex: 30, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 20px", background: "rgba(24,22,21,0.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: "1px solid #2A2623" },
  logo: { height: 30, width: "auto" },
  headerActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  primaryBtn: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "9px 15px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 },
  bodyWrap: { maxWidth: 860, margin: "0 auto", padding: "24px 20px 0" },
  stats: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
  stat: { flex: "1 1 160px", background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, padding: "15px 17px" },
  statLabel: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  statValue: { fontSize: 23, fontWeight: 800, margin: "7px 0 3px", letterSpacing: "-0.01em" },
  statSub: { fontSize: 11.5, color: "#6F6862" },
  addPanel: { background: "#221F1D", border: "1px solid #3A2E2C", borderRadius: 14, padding: 18, marginBottom: 20 },
  addTitle: { fontWeight: 700, marginBottom: 14, fontSize: 15 },
  toolbar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  searchWrap: { flex: "1 1 240px", display: "flex", alignItems: "center", gap: 9, background: "#141211", border: "1px solid #322E2A", borderRadius: 10, padding: "0 12px", height: 42, color: "#9A938D" },
  search: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#F4F2EF", fontSize: 14.5, fontFamily: "inherit" },
  filterWrap: { position: "relative" },
  filterBtn: { height: 42, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13.5 },
  pillCount: { fontSize: 12, color: "#9A938D", background: "#2C2824", borderRadius: 20, padding: "1px 8px", fontWeight: 600 },
  overlay: { position: "fixed", inset: 0, zIndex: 40 },
  menu: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50, minWidth: 234, background: "#26221F", border: "1px solid #38332E", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" },
  menuItem: { width: "100%", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", borderRadius: 8, padding: "9px 11px", cursor: "pointer", color: "#C9C2BC", fontSize: 13.5, fontFamily: "inherit" },
  menuCount: { fontSize: 12, color: "#8C857F" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, overflow: "hidden" },
  cardHead: { display: "flex", alignItems: "center", gap: 13, padding: "14px 17px", cursor: "pointer" },
  headMain: { flex: 1, minWidth: 0 },
  name: { fontWeight: 600, fontSize: 15.5 },
  sub: { fontSize: 12.5, color: "#9A938D", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  dotSep: { margin: "0 7px", opacity: 0.5 },
  headRight: { display: "flex", alignItems: "center", gap: 11, flexShrink: 0 },
  amount: { fontWeight: 700, fontSize: 14.5 },
  pill: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" },
  cardBody: { padding: "2px 17px 17px", borderTop: "1px solid #2A2623" },
  contact: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", margin: "14px 0" },
  link: { color: "#F4F2EF", textDecoration: "none", fontWeight: 500, fontSize: 14 },
  muted2: { color: "#8C857F", fontSize: 13 },
  controls: { display: "flex", gap: 12, flexWrap: "wrap" },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px", marginBottom: 13 },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  selBox: { display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", background: "#1B1816", border: "1px solid " + RED + "33", borderRadius: 9, padding: "9px 12px", marginBottom: 13 },
  selLabel: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D", flexShrink: 0 },
  selText: { fontSize: 13.5, color: "#F4F2EF", fontWeight: 500 },
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 },
  save: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  saved: { color: "#2FBF71", fontSize: 13, fontWeight: 600 },
  payBtn: { background: "#FFC400", color: "#1A1817", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  waBtn: { background: "#25D366", color: "#0B2E13", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textDecoration: "none" },
  muted: { color: "#9A938D", textAlign: "center", padding: "30px 0" },
  empty: { color: "#8C857F", textAlign: "center", padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  addError: { color: "#FF6B6B", fontSize: 13, margin: "0 0 10px" },
  footer: { maxWidth: 860, margin: "30px auto 0", padding: "18px 20px", borderTop: "1px solid #2A2623", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  footerNote: { fontSize: 12, color: "#6F6862" },
};
