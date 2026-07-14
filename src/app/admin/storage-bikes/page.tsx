"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import {
  SERVICE_ITEMS, SERVICE_LABEL, DUE_SOON_THRESHOLD_HOURS,
  type ServiceLogEntry, hoursSince, hoursRemaining, itemStatus,
  lastServicedAt,
} from "../../../lib/bikeServiceShared";

const RED = "#ED1C24";
const AMBER = "#FFB02E";
const GREEN = "#2FBF71";

type StorageEnquiry = { id: string; customer_name: string; phone: string; email: string | null; bike_details: string | null; storage_start_date: string | null; storage_end_date: string | null };
type StorageBike = {
  id: string; name: string; enquiry_id: string | null;
  make: string | null; model: string | null; year: string | null;
  engine_hours: number; active: boolean;
  vin: string | null;
  storage_start_date: string | null; storage_end_date: string | null;
  client_name: string | null; client_phone: string | null; client_email: string | null;
  monthly_rate: number | null;
};
type ServiceDue = { id: string; storage_bike_id: string; item_key: string; interval_hours: number; hours_at_last_done: number };

const BLANK_BIKE = {
  name: "", enquiry_id: "", make: "", model: "", year: "", engine_hours: 0,
  vin: "", storage_start_date: "", storage_end_date: "",
  client_name: "", client_phone: "", client_email: "", monthly_rate: 0,
};
const RENEWAL_THRESHOLD_DAYS = 14;

const STORAGE_PACKAGES = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
];

// Add N calendar months to a date string (YYYY-MM-DD) or today
function addMonths(fromDate: string | null, months: number): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
}

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
.g51-bike-card{border-bottom:1px solid #2A2623;}
.g51-bike-card:last-child{border-bottom:none;}
`;

function waNumber(phone: string): string {
  const raw = (phone || "").trim();
  let n = raw.replace(/\D/g, "");
  if (!raw.startsWith("+")) {
    if (n.startsWith("00")) n = n.slice(2);
    if (n.startsWith("0")) n = "971" + n.slice(1);
  }
  return n;
}

function daysUntilRenewal(endDate: string | null): number {
  if (!endDate) return Infinity;
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}
type RenewalStatus = "overdue" | "due_soon" | "active" | "no_date";
function renewalStatus(endDate: string | null): RenewalStatus {
  if (!endDate) return "no_date";
  const days = daysUntilRenewal(endDate);
  if (days < 0) return "overdue";
  if (days <= RENEWAL_THRESHOLD_DAYS) return "due_soon";
  return "active";
}
function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", opacity: 0.6, flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StorageBikesScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<Record<string, number>>({}); // bikeId → package months
  const [savingClient, setSavingClient] = useState<Record<string, boolean>>({});
  const [pendingClient, setPendingClient] = useState<Record<string, { name: string; phone: string; email: string }>>({});
  const [myName, setMyName] = useState<string | null>(null);
  const [bikes, setBikes] = useState<StorageBike[]>([]);
  const [serviceDue, setServiceDue] = useState<ServiceDue[]>([]);
  const [serviceLog, setServiceLog] = useState<ServiceLogEntry[]>([]);
  const [enquiries, setEnquiries] = useState<StorageEnquiry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [okExpanded, setOkExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ ...BLANK_BIKE });
  const [logFormOpen, setLogFormOpen] = useState<{ bikeId: string; itemKey: string } | null>(null);
  const [logHours, setLogHours] = useState("");
  const [logBy, setLogBy] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [loggingItem, setLoggingItem] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("id, name").eq("id", data.session.user.id).single();
      if (prof) setMyName((prof as { name: string | null }).name);
      const [{ data: b }, { data: sd }, { data: sl }, { data: enq }] = await Promise.all([
        supabase.from("storage_bikes").select("*").eq("active", true).order("name"),
        supabase.from("storage_bikes_service_due").select("*"),
        supabase.from("storage_bikes_service_log").select("*").order("created_at", { ascending: false }),
        supabase.from("enquiries").select("id, customer_name, phone, email, bike_details, storage_start_date, storage_end_date").eq("service_type", "motorcycle_storage"),
      ]);
      const bikeList = (b as StorageBike[]) || [];
      setBikes(bikeList);
      setServiceDue((sd as ServiceDue[]) || []);
      setServiceLog((sl as ServiceLogEntry[]) || []);
      setEnquiries((enq as StorageEnquiry[]) || []);
      setExpanded(new Set(bikeList.map(bk => bk.id)));
      setReady(true);
    });
  }, [router]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));
  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleOk(id: string) {
    setOkExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function pickEnquiry(enquiryId: string) {
    const enq = enquiries.find(e => e.id === enquiryId);
    setForm(prev => ({
      ...prev, enquiry_id: enquiryId,
      name: enq ? `${enq.customer_name} — ${enq.bike_details || "bike"}` : prev.name,
      client_name: enq ? enq.customer_name : prev.client_name,
      client_phone: enq ? (enq.phone || "") : prev.client_phone,
      client_email: enq ? (enq.email || "") : prev.client_email,
      storage_start_date: enq?.storage_start_date || prev.storage_start_date,
      storage_end_date: enq?.storage_end_date || prev.storage_end_date,
    }));
  }

  function getLastDoneHours(bikeId: string, due: ServiceDue): number {
    return lastServicedAt(bikeId, due.item_key, serviceLog, due.hours_at_last_done, "storage_bike_id");
  }
  function getStatus(bike: StorageBike, due: ServiceDue) {
    return itemStatus(bike.engine_hours, getLastDoneHours(bike.id, due), due.interval_hours);
  }

  function openLogForm(bikeId: string, itemKey: string) {
    const bike = bikes.find(b => b.id === bikeId);
    setLogHours(String(bike?.engine_hours ?? ""));
    setLogBy(myName || "");
    setLogNotes("");
    setLogFormOpen({ bikeId, itemKey });
  }

  async function submitLog(bike: StorageBike, due: ServiceDue) {
    const hrs = Number(logHours);
    if (!hrs || hrs <= 0) { showToast("Enter valid hours.", "err"); return; }
    setLoggingItem(true);
    const { data, error } = await supabase.from("storage_bikes_service_log").insert({
      storage_bike_id: bike.id, item_key: due.item_key, hours_at_service: hrs,
      performed_by: logBy.trim() || null, notes: logNotes.trim() || null,
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not log service.", "err"); setLoggingItem(false); return; }
    await supabase.from("storage_bikes_service_due").update({ hours_at_last_done: hrs }).eq("id", due.id);
    setServiceDue(prev => prev.map(d => d.id === due.id ? { ...d, hours_at_last_done: hrs } : d));
    setServiceLog(prev => [data as ServiceLogEntry, ...prev]);
    setLogFormOpen(null);
    setLoggingItem(false);
    showToast(`${SERVICE_LABEL[due.item_key] || due.item_key} logged at ${hrs}h.`);
  }

  function editBikeLocal(id: string, patch: Partial<StorageBike>) {
    setBikes(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  async function saveBikeHours(id: string, hours: number) {
    await supabase.from("storage_bikes").update({ engine_hours: hours }).eq("id", id);
  }
  async function saveBikeField(id: string, field: string, value: string | number | null) {
    editBikeLocal(id, { [field]: value } as Partial<StorageBike>);
    await supabase.from("storage_bikes").update({ [field]: value }).eq("id", id);
  }

  function selectPackage(bike: StorageBike, months: number) {
    // Calculate the new end date from the current start date (or today)
    const newEnd = addMonths(bike.storage_start_date, months);
    setSelectedPkg(prev => ({ ...prev, [bike.id]: months }));
    editBikeLocal(bike.id, { storage_end_date: newEnd });
    saveBikeField(bike.id, "storage_end_date", newEnd);
    showToast(`Package set to ${months} month${months > 1 ? "s" : ""} — end date updated to ${formatDate(newEnd)}.`);
  }

  function sendRenewalWhatsApp(bike: StorageBike, enq: StorageEnquiry | undefined) {
    const phone = bike.client_phone || enq?.phone;
    const name = bike.client_name || enq?.customer_name || "there";
    if (!phone) { showToast("No client phone number on file for this bike.", "err"); return; }
    const months = selectedPkg[bike.id];
    const rate = bike.monthly_rate || 0;
    const total = months ? rate * months : rate;
    const endDate = formatDate(bike.storage_end_date);
    const bikeName = [bike.make, bike.model, bike.year].filter(Boolean).join(" ") || bike.name;
    let msg = `Hi ${name}, your motorcycle storage at Garage51 is due for renewal. 🏍️\n\n`;
    msg += `Bike: ${bikeName}\n`;
    if (months) {
      msg += `Package: ${months} month${months > 1 ? "s" : ""}\n`;
      if (rate) msg += `Total: AED ${total.toLocaleString()}\n`;
    } else {
      if (rate) msg += `Monthly rate: AED ${rate.toLocaleString()}\n`;
    }
    msg += `New end date: ${endDate}\n\n`;
    msg += `Reply YES to confirm and we'll send over your payment link.`;
    window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function createRenewalPaymentLink(bike: StorageBike) {
    const months = selectedPkg[bike.id] || 1;
    const amount = (bike.monthly_rate || 0) * months;
    if (amount < 2) { showToast("Set a monthly rate first so we know the amount.", "err"); return; }
    try {
      const res = await fetch("/api/payment-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, description: `Storage renewal — ${months} month${months > 1 ? "s" : ""} — ${bike.name}` }),
      });
      const json = await res.json();
      if (json.url) {
        await navigator.clipboard.writeText(json.url);
        showToast("Payment link copied to clipboard.");
      } else {
        showToast(json.error || "Could not create payment link.", "err");
      }
    } catch { showToast("Could not reach payment service.", "err"); }
  }

  async function createRenewalInvoice(bike: StorageBike) {
    if (!bike.enquiry_id) { showToast("No linked booking — Zoho invoice requires a linked storage booking.", "err"); return; }
    try {
      const res = await fetch("/api/zoho/create-invoice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enquiryId: bike.enquiry_id }),
      });
      const json = await res.json();
      if (json.invoiceNumber) showToast(`Invoice ${json.invoiceNumber} created in Zoho Books.`);
      else showToast(json.error || "Could not create invoice.", "err");
    } catch { showToast("Could not reach Zoho.", "err"); }
  }

  async function saveClientInfo(bike: StorageBike) {
    const pending = pendingClient[bike.id];
    if (!pending) { showToast("No changes to save."); return; }
    setSavingClient(prev => ({ ...prev, [bike.id]: true }));
    const { error } = await supabase.from("storage_bikes").update({
      client_name: pending.name.trim() || null,
      client_phone: pending.phone.trim() || null,
      client_email: pending.email.trim() || null,
    }).eq("id", bike.id);
    if (error) { showToast(error.message || "Could not save.", "err"); }
    else {
      editBikeLocal(bike.id, {
        client_name: pending.name.trim() || null,
        client_phone: pending.phone.trim() || null,
        client_email: pending.email.trim() || null,
      });
      setPendingClient(prev => { const n = { ...prev }; delete n[bike.id]; return n; });
      showToast("Client info saved.");
    }
    setSavingClient(prev => ({ ...prev, [bike.id]: false }));
  }

  function setPending(bikeId: string, field: "name" | "phone" | "email", value: string, bike: StorageBike) {
    setPendingClient(prev => ({
      ...prev,
      [bikeId]: {
        name: prev[bikeId]?.name ?? (bike.client_name || ""),
        phone: prev[bikeId]?.phone ?? (bike.client_phone || ""),
        email: prev[bikeId]?.email ?? (bike.client_email || ""),
        [field]: value,
      },
    }));
  }
  async function removeBike(bike: StorageBike) {
    await supabase.from("storage_bikes").update({ active: false }).eq("id", bike.id);
    setBikes(prev => prev.filter(b => b.id !== bike.id));
    showToast(`Removed "${bike.name}".`);
  }

  async function createBike() {
    if (!form.name.trim()) { setAddError("Name is required."); return; }
    setCreating(true); setAddError("");
    const startingHours = Number(form.engine_hours) || 0;
    const { data, error } = await supabase.from("storage_bikes").insert({
      name: form.name.trim(), enquiry_id: form.enquiry_id || null,
      make: form.make.trim() || null, model: form.model.trim() || null,
      year: form.year.trim() || null, engine_hours: startingHours,
      vin: form.vin.trim() || null,
      storage_start_date: form.storage_start_date || null,
      storage_end_date: form.storage_end_date || null,
      client_name: form.client_name.trim() || null,
      client_phone: form.client_phone.trim() || null,
      client_email: form.client_email.trim() || null,
      monthly_rate: Number(form.monthly_rate) || null,
    }).select().single();
    if (error || !data) { setCreating(false); setAddError(error?.message || "Could not add bike."); return; }
    const bike = data as StorageBike;
    const dueRows: ServiceDue[] = [];
    for (const item of SERVICE_ITEMS) {
      const { data: d } = await supabase.from("storage_bikes_service_due").insert({
        storage_bike_id: bike.id, item_key: item.key, interval_hours: item.defaultInterval, hours_at_last_done: startingHours,
      }).select().single();
      if (d) dueRows.push(d as ServiceDue);
    }
    setBikes(prev => [...prev, bike].sort((a, b) => a.name.localeCompare(b.name)));
    setServiceDue(prev => [...prev, ...dueRows]);
    setExpanded(prev => new Set([...prev, bike.id]));
    setCreating(false); setForm({ ...BLANK_BIKE }); setAdding(false);
    showToast(`Added "${bike.name}".`);
  }

  function requestFromClient(bike: StorageBike, dueItems: ServiceDue[]) {
    const enq = enquiries.find(e => e.id === bike.enquiry_id);
    if (!enq?.phone) { showToast("No linked customer phone for this bike.", "err"); return; }
    const list = dueItems.map(d => SERVICE_LABEL[d.item_key] || d.item_key).join(", ");
    const msg = `Hi ${enq.customer_name}, while your ${enq.bike_details || "bike"} is in storage, our records show it's due for: ${list}. This isn't included in your storage plan and would be invoiced separately — let us know if you'd like us to go ahead.`;
    window.open(`https://wa.me/${waNumber(enq.phone)}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const totalAttention = bikes.reduce((acc, bike) => {
    const dues = serviceDue.filter(d => d.storage_bike_id === bike.id);
    return acc + dues.filter(d => ["overdue", "due_soon"].includes(getStatus(bike, d))).length;
  }, 0);

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={() => setMenuOpen(m => !m)} className="g51-btn g51-ghost" style={s.menuBtn} aria-label="Menu">
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </header>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={s.menuOverlay} />
          <nav style={s.menuDropdown}>
            <button onClick={() => { router.push("/admin/parts"); setMenuOpen(false); }} style={s.menuItem}>Parts & Inventory</button>
            <button onClick={() => { router.push("/admin/fleet"); setMenuOpen(false); }} style={s.menuItem}>Fleet Bikes</button>
            <button onClick={() => { router.push("/admin"); setMenuOpen(false); }} style={s.menuItem}>Bookings</button>
            <div style={s.menuDivider} />
            <button onClick={() => { router.push("/admin/overview"); setMenuOpen(false); }} style={s.menuItem}>← Overview</button>
          </nav>
        </>
      )}

      <div style={s.wrap}>
        <h1 style={s.h1}>Storage bikes</h1>
        <p style={s.sub}>Customer bikes in storage — service items sorted by urgency. Log service to build the history record. Request approval from the customer for anything beyond the storage plan.</p>

        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => setAdding(a => !a)} className="g51-btn g51-ghost" style={s.ghostBtn}>{adding ? "Cancel" : "+ Add bike"}</button>
        </div>

        {totalAttention > 0 && (
          <div style={s.attentionBanner}>⚠ {totalAttention} item{totalAttention > 1 ? "s" : ""} need attention across storage bikes</div>
        )}

        {adding && (
          <div style={{ ...s.card, marginBottom: 18 }}>
            <div style={s.cardTitle}>Add a bike</div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Linked storage booking</span>
                <select className="g51-input" value={form.enquiry_id} onChange={e => pickEnquiry(e.target.value)} style={s.input}>
                  <option value="">No linked booking</option>
                  {enquiries.map(e => <option key={e.id} value={e.id}>{e.customer_name} — {e.bike_details || "bike"}</option>)}
                </select></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Name *</span>
                <input className="g51-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Jay — YZ450F" style={s.input} /></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Make</span><input className="g51-input" value={form.make} onChange={e => set("make", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Model</span><input className="g51-input" value={form.model} onChange={e => set("model", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Year</span><input className="g51-input" value={form.year} onChange={e => set("year", e.target.value)} style={s.input} /></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>VIN</span><input className="g51-input" value={form.vin} onChange={e => set("vin", e.target.value)} placeholder="Chassis / VIN number" style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Current engine hours</span>
                <input className="g51-input" type="number" value={form.engine_hours} onChange={e => set("engine_hours", Number(e.target.value))} style={s.input} /></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Storage start date</span>
                <input className="g51-input" type="date" value={form.storage_start_date} onChange={e => set("storage_start_date", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Storage end / renewal date</span>
                <input className="g51-input" type="date" value={form.storage_end_date} onChange={e => set("storage_end_date", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Monthly rate (AED)</span>
                <input className="g51-input" type="number" value={form.monthly_rate} onChange={e => set("monthly_rate", Number(e.target.value))} style={s.input} /></label>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", margin: "12px 0 6px" }}>CLIENT INFO (auto-filled if linked to a booking)</div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Client name</span><input className="g51-input" value={form.client_name} onChange={e => set("client_name", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Client phone</span><input className="g51-input" value={form.client_phone} onChange={e => set("client_phone", e.target.value)} placeholder="+971…" style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Client email</span><input className="g51-input" value={form.client_email} onChange={e => set("client_email", e.target.value)} style={s.input} /></label>
            </div>
            {addError && <p style={{ color: "#FF6B6B", fontSize: 13, margin: "10px 0 0" }}>{addError}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={createBike} disabled={creating} className="g51-btn g51-primary" style={s.primaryBtn}>{creating ? "Adding…" : "Add bike"}</button>
              <button onClick={() => { setAdding(false); setAddError(""); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
            </div>
          </div>
        )}

        {bikes.length === 0 ? (
          <div style={s.empty}>No storage bikes tracked yet.</div>
        ) : (
          <div style={s.card}>
            {bikes.map((bike, idx) => {
              const dues = serviceDue.filter(d => d.storage_bike_id === bike.id);
              const overdueItems = dues.filter(d => getStatus(bike, d) === "overdue");
              const dueSoonItems = dues.filter(d => getStatus(bike, d) === "due_soon");
              const okItems = dues.filter(d => getStatus(bike, d) === "ok");
              const isOpen = expanded.has(bike.id);
              const isOkOpen = okExpanded.has(bike.id);
              const enq = enquiries.find(e => e.id === bike.enquiry_id);
              const total = dues.length;
              const overdueWidth = total > 0 ? (overdueItems.length / total) * 100 : 0;
              const dueSoonWidth = total > 0 ? (dueSoonItems.length / total) * 100 : 0;
              const okWidth = 100 - overdueWidth - dueSoonWidth;
              const bikeLog = serviceLog.filter(e => e.storage_bike_id === bike.id).slice(0, 8);
              const isLast = idx === bikes.length - 1;
              const hasDue = overdueItems.length > 0 || dueSoonItems.length > 0;
              const renewStatus = renewalStatus(bike.storage_end_date);
              const daysLeft = daysUntilRenewal(bike.storage_end_date);
              const clientPhone = bike.client_phone || enq?.phone;
              const clientName = bike.client_name || enq?.customer_name;

              return (
                <div key={bike.id} className="g51-bike-card" style={{ ...(isLast ? { borderBottom: "none" } : {}) }}>
                  <div style={s.bikeHead} onClick={() => toggleExpand(bike.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={s.bikeName}>{bike.name}</span>
                        {renewStatus === "overdue" && <span style={{ ...s.badge, color: RED, borderColor: RED + "55", background: RED + "18" }}>🔴 Renewal overdue</span>}
                        {renewStatus === "due_soon" && <span style={{ ...s.badge, color: AMBER, borderColor: AMBER + "55", background: AMBER + "18" }}>⏰ Renewal in {daysLeft}d</span>}
                        {overdueItems.length > 0 && <span style={{ ...s.badge, color: RED, borderColor: RED + "55", background: RED + "18" }}>⚠ {overdueItems.length} service overdue</span>}
                        {hasDue && clientPhone && (
                          <button onClick={e => { e.stopPropagation(); requestFromClient(bike, [...overdueItems, ...dueSoonItems]); }} className="g51-btn g51-ghost" style={{ ...s.logBtn, color: AMBER, borderColor: AMBER + "55" }}>Request service</button>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                        <span style={s.bikeSub}>{clientName ? `${clientName}` : (enq ? `${enq.customer_name}` : "No client info")}</span>
                        {(bike.make || bike.model) && <><span style={s.dotSep}>·</span><span style={s.bikeSub}>{[bike.make, bike.model, bike.year].filter(Boolean).join(" ")}</span></>}
                        {bike.vin && <><span style={s.dotSep}>·</span><span style={s.bikeSub}>VIN: {bike.vin}</span></>}
                        <span style={s.dotSep}>·</span>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={e => e.stopPropagation()}>
                          <input className="g51-input" type="number" value={bike.engine_hours}
                            onChange={e => editBikeLocal(bike.id, { engine_hours: Number(e.target.value) })}
                            onBlur={e => saveBikeHours(bike.id, Number(e.target.value))}
                            style={{ ...s.input, width: 64, padding: "4px 8px", display: "inline-block" }} />
                          <span style={s.bikeSub}>h</span>
                        </label>
                      </div>
                      {/* Storage period */}
                      {(bike.storage_start_date || bike.storage_end_date) && (
                        <div style={{ fontSize: 11.5, color: renewStatus === "overdue" ? RED : renewStatus === "due_soon" ? AMBER : "#6F6862", marginTop: 4 }}>
                          📅 {formatDate(bike.storage_start_date)} → {formatDate(bike.storage_end_date)}
                          {bike.monthly_rate ? ` · AED ${bike.monthly_rate}/mo` : ""}
                        </div>
                      )}
                      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 8, background: "#2A2623", gap: 1 }}>
                        {overdueWidth > 0 && <div style={{ width: `${overdueWidth}%`, background: RED }} />}
                        {dueSoonWidth > 0 && <div style={{ width: `${dueSoonWidth}%`, background: AMBER }} />}
                        {okWidth > 0 && <div style={{ width: `${okWidth}%`, background: GREEN + "55" }} />}
                      </div>
                    </div>
                    <Chevron open={isOpen} />
                  </div>

                  {/* Renewal action strip — package selector + actions */}
                  {(renewStatus === "overdue" || renewStatus === "due_soon") && (
                    <div style={{ margin: "0 17px 12px", background: renewStatus === "overdue" ? RED + "0e" : AMBER + "0e", border: `1px solid ${renewStatus === "overdue" ? RED : AMBER}33`, borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: renewStatus === "overdue" ? RED : AMBER, marginBottom: 10 }}>
                        {renewStatus === "overdue" ? `Renewal ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} overdue` : `Renewal due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 7 }}>SELECT PACKAGE</div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                        {STORAGE_PACKAGES.map(pkg => {
                          const isSelected = selectedPkg[bike.id] === pkg.months;
                          const total = bike.monthly_rate ? bike.monthly_rate * pkg.months : null;
                          return (
                            <button key={pkg.months} onClick={() => selectPackage(bike, pkg.months)}
                              style={{ background: isSelected ? AMBER + "33" : "transparent", border: `1px solid ${isSelected ? AMBER : "#3A352F"}`, borderRadius: 9, color: isSelected ? AMBER : "#B5AEA8", fontSize: 12.5, fontWeight: isSelected ? 700 : 500, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                              {pkg.label}{total ? ` · AED ${total.toLocaleString()}` : ""}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {clientPhone && (
                          <button onClick={() => sendRenewalWhatsApp(bike, enq)} className="g51-btn g51-ghost" style={{ ...s.logBtn, color: GREEN, borderColor: GREEN + "55" }}>
                            {selectedPkg[bike.id] ? `WhatsApp — ${selectedPkg[bike.id]}m package` : "WhatsApp renewal"}
                          </button>
                        )}
                        {bike.monthly_rate && selectedPkg[bike.id] && (
                          <button onClick={() => createRenewalPaymentLink(bike)} className="g51-btn g51-ghost" style={{ ...s.logBtn, color: "#A78BFA", borderColor: "#A78BFA55" }}>
                            Payment link · AED {(bike.monthly_rate * selectedPkg[bike.id]).toLocaleString()}
                          </button>
                        )}
                        {bike.enquiry_id && (
                          <button onClick={() => createRenewalInvoice(bike)} className="g51-btn g51-ghost" style={{ ...s.logBtn, color: "#6B7280", borderColor: "#3A352F" }}>
                            Zoho invoice
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isOpen && (
                    <div style={{ padding: "0 17px 16px" }}>
                      {/* Editable storage fields */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 8 }}>STORAGE & CLIENT DETAILS</div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 140px" }}>
                            <span style={s.ctrlLabel}>Storage start</span>
                            <input className="g51-input" type="date" value={bike.storage_start_date || ""}
                              onChange={e => editBikeLocal(bike.id, { storage_start_date: e.target.value || null })}
                              onBlur={e => saveBikeField(bike.id, "storage_start_date", e.target.value || null)}
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 140px" }}>
                            <span style={s.ctrlLabel}>Renewal date</span>
                            <input className="g51-input" type="date" value={bike.storage_end_date || ""}
                              onChange={e => editBikeLocal(bike.id, { storage_end_date: e.target.value || null })}
                              onBlur={e => saveBikeField(bike.id, "storage_end_date", e.target.value || null)}
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 120px" }}>
                            <span style={s.ctrlLabel}>Monthly rate (AED)</span>
                            <input className="g51-input" type="number" value={bike.monthly_rate || ""}
                              onChange={e => editBikeLocal(bike.id, { monthly_rate: Number(e.target.value) || null })}
                              onBlur={e => saveBikeField(bike.id, "monthly_rate", Number(e.target.value) || null)}
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 160px" }}>
                            <span style={s.ctrlLabel}>VIN</span>
                            <input className="g51-input" value={bike.vin || ""}
                              onChange={e => editBikeLocal(bike.id, { vin: e.target.value })}
                              onBlur={e => saveBikeField(bike.id, "vin", e.target.value || null)}
                              placeholder="Chassis / VIN"
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 140px" }}>
                            <span style={s.ctrlLabel}>Client name</span>
                            <input className="g51-input"
                              value={pendingClient[bike.id]?.name ?? (bike.client_name || "")}
                              onChange={e => setPending(bike.id, "name", e.target.value, bike)}
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 140px" }}>
                            <span style={s.ctrlLabel}>Client phone</span>
                            <input className="g51-input"
                              value={pendingClient[bike.id]?.phone ?? (bike.client_phone || "")}
                              onChange={e => setPending(bike.id, "phone", e.target.value, bike)}
                              placeholder="+971…"
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                          <label style={{ display: "grid", gap: 4, flex: "1 1 160px" }}>
                            <span style={s.ctrlLabel}>Client email</span>
                            <input className="g51-input"
                              value={pendingClient[bike.id]?.email ?? (bike.client_email || "")}
                              onChange={e => setPending(bike.id, "email", e.target.value, bike)}
                              style={{ ...s.input, padding: "6px 10px" }} />
                          </label>
                        </div>
                        {pendingClient[bike.id] && (
                          <button onClick={() => saveClientInfo(bike)} disabled={savingClient[bike.id]}
                            style={{ marginTop: 10, background: GREEN, border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 18px", cursor: "pointer", opacity: savingClient[bike.id] ? 0.6 : 1 }}>
                            {savingClient[bike.id] ? "Saving…" : "Save client info"}
                          </button>
                        )}
                      </div>
                      {overdueItems.length > 0 && (
                        <div style={{ background: RED + "0e", border: `1px solid ${RED}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: RED, marginBottom: 8 }}>OVERDUE — CLIENT APPROVAL MAY BE NEEDED</div>
                          {overdueItems.map(due => {
                            const lastAt = getLastDoneHours(bike.id, due);
                            const overBy = hoursSince(bike.engine_hours, lastAt) - due.interval_hours;
                            const isThisOpen = logFormOpen?.bikeId === bike.id && logFormOpen?.itemKey === due.item_key;
                            return (
                              <div key={due.item_key} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ flex: "1 1 auto", fontSize: 14, fontWeight: 600 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                  <span style={{ fontSize: 12.5, color: RED, fontWeight: 700 }}>{overBy.toFixed(0)}h overdue</span>
                                  <span style={{ fontSize: 11.5, color: "#6F6862" }}>last at {lastAt}h</span>
                                  {!isThisOpen && <button onClick={() => openLogForm(bike.id, due.item_key)} className="g51-btn g51-ghost" style={s.logBtn}>Log service</button>}
                                </div>
                                {isThisOpen && <LogForm hrs={logHours} by={logBy} notes={logNotes} setHrs={setLogHours} setBy={setLogBy} setNotes={setLogNotes} loading={loggingItem} onSave={() => submitLog(bike, due)} onCancel={() => setLogFormOpen(null)} />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {dueSoonItems.length > 0 && (
                        <div style={{ background: AMBER + "0e", border: `1px solid ${AMBER}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: AMBER, marginBottom: 8 }}>DUE WITHIN {DUE_SOON_THRESHOLD_HOURS}H</div>
                          {dueSoonItems.map(due => {
                            const lastAt = getLastDoneHours(bike.id, due);
                            const remaining = hoursRemaining(bike.engine_hours, lastAt, due.interval_hours);
                            const isThisOpen = logFormOpen?.bikeId === bike.id && logFormOpen?.itemKey === due.item_key;
                            return (
                              <div key={due.item_key} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ flex: "1 1 auto", fontSize: 14, fontWeight: 600 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                  <span style={{ fontSize: 12.5, color: AMBER, fontWeight: 700 }}>{remaining.toFixed(1)}h remaining</span>
                                  <span style={{ fontSize: 11.5, color: "#6F6862" }}>last at {lastAt}h</span>
                                  {!isThisOpen && <button onClick={() => openLogForm(bike.id, due.item_key)} className="g51-btn g51-ghost" style={s.logBtn}>Log service</button>}
                                </div>
                                {isThisOpen && <LogForm hrs={logHours} by={logBy} notes={logNotes} setHrs={setLogHours} setBy={setLogBy} setNotes={setLogNotes} loading={loggingItem} onSave={() => submitLog(bike, due)} onCancel={() => setLogFormOpen(null)} />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {okItems.length > 0 && (
                        <div style={{ background: "#1B1816", border: "1px solid #2A2623", borderRadius: 10, marginBottom: 10 }}>
                          <button onClick={() => toggleOk(bike.id)} className="g51-btn" style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 13px", background: "transparent", border: "none", color: "#9A938D", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
                            <span>{okItems.length} items in good standing</span>
                            <Chevron open={isOkOpen} />
                          </button>
                          {isOkOpen && (
                            <div style={{ padding: "0 13px 10px" }}>
                              {okItems.map(due => {
                                const lastAt = getLastDoneHours(bike.id, due);
                                const remaining = hoursRemaining(bike.engine_hours, lastAt, due.interval_hours);
                                const isThisOpen = logFormOpen?.bikeId === bike.id && logFormOpen?.itemKey === due.item_key;
                                return (
                                  <div key={due.item_key} style={{ marginBottom: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                      <span style={{ flex: "1 1 auto", fontSize: 13.5 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                      <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>{remaining.toFixed(0)}h left</span>
                                      <span style={{ fontSize: 11, color: "#6F6862" }}>/ {due.interval_hours}h</span>
                                      {!isThisOpen && <button onClick={() => openLogForm(bike.id, due.item_key)} className="g51-btn g51-ghost" style={{ ...s.logBtn, fontSize: 11.5 }}>Log</button>}
                                    </div>
                                    {isThisOpen && <LogForm hrs={logHours} by={logBy} notes={logNotes} setHrs={setLogHours} setBy={setLogBy} setNotes={setLogNotes} loading={loggingItem} onSave={() => submitLog(bike, due)} onCancel={() => setLogFormOpen(null)} />}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {bikeLog.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 8 }}>RECENT SERVICE</div>
                          {bikeLog.map(entry => (
                            <div key={entry.id} style={{ display: "flex", gap: 10, fontSize: 12, color: "#9A938D", marginBottom: 5, flexWrap: "wrap" }}>
                              <span style={{ color: "#C9C2BC", fontWeight: 500 }}>{SERVICE_LABEL[entry.item_key] || entry.item_key}</span>
                              <span>{entry.hours_at_service}h</span>
                              {entry.performed_by && <span>by {entry.performed_by}</span>}
                              <span style={{ color: "#6F6862" }}>{new Date(entry.created_at).toLocaleDateString()}</span>
                              {entry.notes && <span style={{ color: "#6F6862", fontStyle: "italic" }}>{entry.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      <details style={{ marginTop: 12, borderTop: "1px solid #2A2623", paddingTop: 8 }}>
                        <summary style={{ cursor: "pointer", fontSize: 11.5, color: "#6F6862", fontWeight: 600 }}>Edit intervals / remove bike</summary>
                        <div style={{ marginTop: 10 }}>
                          {serviceDue.filter(d => d.storage_bike_id === bike.id).map(due => (
                            <div key={due.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
                              <span style={{ flex: "1 1 140px", fontSize: 12.5 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                                <span style={s.ctrlLabel}>Interval</span>
                                <input className="g51-input" type="number" value={due.interval_hours}
                                  onChange={e => setServiceDue(prev => prev.map(d => d.id === due.id ? { ...d, interval_hours: Number(e.target.value) } : d))}
                                  onBlur={async e => { await supabase.from("storage_bikes_service_due").update({ interval_hours: Number(e.target.value) }).eq("id", due.id); }}
                                  style={{ ...s.input, width: 60, padding: "4px 7px" }} />
                                <span style={{ color: "#6F6862" }}>h</span>
                              </label>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => removeBike(bike)} className="g51-btn g51-ghost" style={{ ...s.ghostBtn, color: "#FF7A7A", marginTop: 8 }}>
                          Remove "{bike.name}"
                        </button>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <div style={{ ...s.toast, ...(toast.kind === "err" ? s.toastErr : s.toastOk) }}>{toast.msg}</div>}
    </main>
  );
}

function LogForm({ hrs, by, notes, setHrs, setBy, setNotes, loading, onSave, onCancel }: {
  hrs: string; by: string; notes: string;
  setHrs: (v: string) => void; setBy: (v: string) => void; setNotes: (v: string) => void;
  loading: boolean; onSave: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ background: "#141211", border: "1px solid #2A2623", borderRadius: 9, padding: "10px 12px", marginTop: 8, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6F6862" }}>Hours at service</span>
        <input type="number" value={hrs} onChange={e => setHrs(e.target.value)} style={{ width: 72, background: "#221F1D", border: "1px solid #322E2A", borderRadius: 7, color: "#F4F2EF", fontSize: 14, padding: "7px 9px", fontFamily: "inherit" }} />
      </label>
      <label style={{ display: "grid", gap: 4, flex: "1 1 120px" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6F6862" }}>Performed by</span>
        <input type="text" value={by} onChange={e => setBy(e.target.value)} placeholder="Name" style={{ background: "#221F1D", border: "1px solid #322E2A", borderRadius: 7, color: "#F4F2EF", fontSize: 14, padding: "7px 9px", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />
      </label>
      <label style={{ display: "grid", gap: 4, flex: "2 1 180px" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6F6862" }}>Notes (optional)</span>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. used Shell Helix 10W-40" style={{ background: "#221F1D", border: "1px solid #322E2A", borderRadius: 7, color: "#F4F2EF", fontSize: 14, padding: "7px 9px", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />
      </label>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-end", paddingBottom: 1 }}>
        <button disabled={loading} onClick={onSave} style={{ background: GREEN, border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", cursor: "pointer" }}>{loading ? "Saving…" : "Save"}</button>
        <button onClick={onCancel} style={{ background: "transparent", border: "1px solid #3A352F", borderRadius: 7, color: "#9A938D", fontSize: 13, padding: "8px 10px", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623", position: "sticky", top: 0, background: "#181615", zIndex: 50 },
  logo: { height: 30, width: "auto" },
  menuBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  menuOverlay: { position: "fixed", inset: 0, zIndex: 48 } as CSSProperties,
  menuDropdown: { position: "absolute", top: 57, right: 16, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 13, padding: "6px", zIndex: 49, minWidth: 200, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" } as CSSProperties,
  menuItem: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#F4F2EF", fontSize: 15, fontWeight: 500, padding: "12px 14px", cursor: "pointer", borderRadius: 9, fontFamily: "inherit" } as CSSProperties,
  menuDivider: { height: 1, background: "#2A2623", margin: "4px 0" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  primaryBtn: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  logBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 },
  wrap: { maxWidth: 860, margin: "0 auto", padding: "26px 20px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 },
  attentionBanner: { background: "#FFB02E18", border: "1px solid #FFB02E55", color: AMBER, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 18 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, overflow: "hidden" },
  cardTitle: { fontWeight: 700, fontSize: 15, marginBottom: 14 },
  controls: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px" },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" } as CSSProperties,
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  empty: { color: "#8C857F", textAlign: "center", padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  bikeHead: { display: "flex", alignItems: "flex-start", gap: 12, padding: "15px 17px", cursor: "pointer" },
  bikeName: { fontWeight: 700, fontSize: 16 },
  bikeSub: { fontSize: 12.5, color: "#9A938D" },
  badge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" },
  dotSep: { margin: "0 4px", opacity: 0.4 },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};
