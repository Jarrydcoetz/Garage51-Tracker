"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";
import { STORAGE_TERMS, storageTermMonths, storageTotalPrice, addMonths } from "../../lib/storagePricing";
import {
  type Part,
  type StockMovement,
  sellPrice as partSellPrice,
  stockFor,
  partsUsedFor,
  partsUsedTotal,
} from "../../lib/partsShared";

type Session = {
  id: string;
  enquiry_id: string;
  seq: number;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  google_event_id: string | null;
  notes: string | null;
};

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
  stage: string;
  paid_at: string | null;
  sessions_total: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  refund_due: boolean;
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
  storage_start_date: string | null;
  storage_end_date: string | null;
  bike_category: string | null;
  storage_term: string | null;
  zoho_invoice_id: string | null;
  zoho_invoice_number: string | null;
  zoho_invoice_url: string | null;
  payment_link: string | null;
  payment_intent_id: string | null;
  payment_link_sent_at: string | null;
  sessions: Session[];
  client: ClientLite | null;
  assigned_to: string | null;
};

type ClientLite = { id: string; name: string | null; whatsapp: string | null; zoho_contact_id: string | null };
type Profile = { id: string; name: string | null; role: string; active: boolean; whatsapp: string | null };

const RED = "#ED1C24";
const STAGES = ["new", "contacted", "booked", "lost", "cancelled"];
const SESSION_STATUSES = ["scheduled", "completed", "no_show", "cancelled"];
const SOURCES = [
  { v: "whatsapp", label: "WhatsApp" },
  { v: "instagram", label: "Instagram" },
  { v: "phone", label: "Phone" },
  { v: "walk_in", label: "Walk-in" },
  { v: "form", label: "Web form" },
];
const STATE_COLOR: Record<string, string> = {
  new: "#3B9EFF", contacted: "#FFB02E", booked: "#A78BFA",
  completed: "#2FBF71", cancelled: "#C77B6B", lost: "#6E6862",
};
const PAID_COLOR = "#FFC400";
// Sessions now carry their own real duration_minutes (auto-populated by a DB
// trigger, editable per booking). This is only a fallback for the rare
// session that somehow still has none set.
const SESSION_DURATION_MINUTES = 120;
// How close to (or past) a storage booking's end date before it gets
// flagged as needing attention — adjust if 7 days feels too tight or loose.
const STORAGE_RENEWAL_WINDOW_DAYS = 7;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const aed = (n: number) => "AED " + (Number(n) || 0).toLocaleString();
const dotColor = (k: string) =>
  STATE_COLOR[k] || (k === "needs_payment" ? PAID_COLOR : k === "sent" ? "#2FBF71" : k === "conflict" ? "#FF6B6B" : "#9A938D");

const FILTER_OPTS = [
  { key: "all", label: "All bookings" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "booked", label: "Booked" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "lost", label: "Lost" },
  { key: "needs_payment", label: "Needs payment" },
  { key: "sent", label: "Payment link sent" },
  { key: "conflict", label: "Has conflict" },
  { key: "storage_due", label: "Storage renewal/removal due" },
];

const BLANK = {
  customer_name: "", phone: "", email: "", service_type: "academy",
  source: "whatsapp", stage: "new", estimated_value: 0, booking_at: "", notes: "",
  storage_start_date: "", storage_end_date: "", bike_category: "adult", storage_term: "month_to_month",
};

// ---- session / state helpers ----------------------------------------------
function sessionDone(ss: Session): boolean {
  if (ss.status === "completed") return true;
  return ss.status === "scheduled" && !!ss.scheduled_at && new Date(ss.scheduled_at) < new Date();
}
function sessionLabel(ss: Session): string {
  if (ss.status === "no_show") return "No-show";
  if (ss.status === "cancelled") return "Cancelled";
  if (sessionDone(ss)) return "Completed";
  if (ss.scheduled_at) return "Scheduled";
  return "Unscheduled";
}
function completedCount(r: Enquiry): number {
  return (r.sessions || []).filter(sessionDone).length;
}
function bookingState(r: Enquiry): string {
  if (r.stage === "cancelled") return "cancelled";
  if (r.stage === "lost") return "lost";
  if (r.stage === "new") return "new";
  if (r.stage === "contacted") return "contacted";
  if (r.service_type === "motorcycle_storage") {
    return r.storage_end_date && new Date(r.storage_end_date) < new Date() ? "completed" : "booked";
  }
  if (r.sessions_total > 0 && completedCount(r) >= r.sessions_total) return "completed";
  return "booked";
}
function nextLabel(r: Enquiry): string {
  if (r.service_type === "motorcycle_storage") {
    if (r.storage_start_date && r.storage_end_date) {
      return `${new Date(r.storage_start_date).toLocaleDateString()} – ${new Date(r.storage_end_date).toLocaleDateString()}`;
    }
    if (r.storage_start_date) return `From ${new Date(r.storage_start_date).toLocaleDateString()}`;
    return new Date(r.created_at).toLocaleDateString();
  }
  const dated = (r.sessions || []).filter(ss => ss.scheduled_at);
  if (dated.length) {
    const now = Date.now();
    const upcoming = dated
      .map(ss => new Date(ss.scheduled_at as string))
      .filter(d => d.getTime() >= now)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const d = upcoming || new Date(Math.max(...dated.map(ss => new Date(ss.scheduled_at as string).getTime())));
    return d.toLocaleDateString();
  }
  if (r.preferred_date) return new Date(r.preferred_date).toLocaleDateString();
  return new Date(r.created_at).toLocaleDateString();
}

function isActiveSession(ss: Session): boolean {
  return !!ss.scheduled_at && ss.status !== "cancelled" && ss.status !== "no_show";
}

// Finds the first other active session assigned to the same staff member whose
// time range overlaps this one. Returns the conflicting booking, or null.
// Uses each session's own duration_minutes now that it's a real, editable
// field — SESSION_DURATION_MINUTES is only a fallback for the rare session
// that somehow still has none set.
function findConflict(allRows: Enquiry[], forRow: Enquiry, forSession: Session): Enquiry | null {
  if (!forRow.assigned_to || !isActiveSession(forSession)) return null;
  const start = new Date(forSession.scheduled_at as string).getTime();
  const end = start + (forSession.duration_minutes ?? SESSION_DURATION_MINUTES) * 60000;

  for (const r of allRows) {
    if (r.assigned_to !== forRow.assigned_to) continue;
    for (const ss of r.sessions || []) {
      if (ss.id === forSession.id || !isActiveSession(ss)) continue;
      const oStart = new Date(ss.scheduled_at as string).getTime();
      const oEnd = oStart + (ss.duration_minutes ?? SESSION_DURATION_MINUTES) * 60000;
      if (start < oEnd && oStart < end) return r;
    }
  }
  return null;
}

function bookingHasConflict(allRows: Enquiry[], row: Enquiry): boolean {
  return (row.sessions || []).some(ss => !!findConflict(allRows, row, ss));
}

// Flags a storage booking whose committed term has ended ("overdue" — the
// bike may still need picking up or the term renewing) or is about to end
// within STORAGE_RENEWAL_WINDOW_DAYS ("due_soon"). Applies to any storage
// booking with a known end date, however that date was set — auto-computed
// from a fixed term, or manually entered for a month-to-month customer.
function storageRenewalStatus(r: Enquiry): "overdue" | "due_soon" | null {
  if (r.service_type !== "motorcycle_storage" || !r.storage_end_date) return null;
  if (r.stage === "cancelled" || r.stage === "lost") return null;
  const days = Math.ceil((new Date(r.storage_end_date).getTime() - Date.now()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= STORAGE_RENEWAL_WINDOW_DAYS) return "due_soon";
  return null;
}
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function printJobCard(r: Enquiry, partsLines: { name: string; qty: number; lineTotal: number }[] = []) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  if (!w) { frame.remove(); return; }
  const esc = (v: string | null) => (v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const partsTotal = partsLines.reduce((sum, l) => sum + l.lineTotal, 0);
  const partsSection = partsLines.length === 0 ? "" : `
  <div class="label" style="margin:18px 0 6px;">Parts used</div>
  <table class="parts">
    <tr><th>Part</th><th>Qty</th><th>Price</th></tr>
    ${partsLines.map(l => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>AED ${l.lineTotal.toLocaleString()}</td></tr>`).join("")}
    <tr><td colspan="2"><strong>Total</strong></td><td><strong>AED ${partsTotal.toLocaleString()}</strong></td></tr>
  </table>`;
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
  .parts{width:100%;border-collapse:collapse;font-size:14px;}
  .parts th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#999;padding:6px 0;border-bottom:1px solid #ccc;}
  .parts td{padding:6px 0;border-bottom:1px solid #eee;}
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
  <div class="box">${esc(r.work_required)}</div>${partsSection}
  <div class="label" style="margin:18px 0 6px;">Notes</div>
  <div class="box">${esc(r.notes)}</div>
  <div class="sign"><div>Mechanic signature</div><div>Date completed</div></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onafterprint = () => { try { frame.remove(); } catch {} };
  setTimeout(() => { try { frame.remove(); } catch {} }, 60000);
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
@media (max-width: 640px) {
  .g51-card-head { flex-wrap: wrap; }
  .g51-head-right { flex-basis: 100%; justify-content: flex-end; margin-top: 8px; }
  .g51-stat { flex: 1 1 100% !important; }
  .g51-sheet {
    position: fixed !important; left: 0 !important; right: 0 !important;
    bottom: 0 !important; top: auto !important; width: auto !important;
    min-width: 0 !important; border-radius: 16px 16px 0 0 !important;
    max-height: 78vh; overflow-y: auto;
  }
  .g51-sheet .g51-item, .g51-sheet .g51-menu-item { padding-top: 13px; padding-bottom: 13px; }
}
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
    <div className="g51-stat" style={s.stat}>
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
  const [zohoBusy, setZohoBusy] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [addPartRowId, setAddPartRowId] = useState<string | null>(null);
  const [addPartSelection, setAddPartSelection] = useState("");
  const [addPartQty, setAddPartQty] = useState("1");
  const [me, setMe] = useState<Profile | null>(null);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [myEmail, setMyEmail] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [payMenuId, setPayMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setMyEmail(data.session.user.email || "");
      const [{ data: prof }, { data: people }] = await Promise.all([
        supabase.from("profiles").select("id, name, role, active, whatsapp").eq("id", data.session.user.id).single(),
        supabase.from("profiles").select("id, name, role, active, whatsapp").eq("active", true).order("name"),
      ]);
      setMe((prof as Profile) || null);
      setStaff((people as Profile[]) || []);
      setReady(true);
      const { data: rowsData } = await supabase
        .from("enquiries")
        .select("*, sessions(*), client:clients(id, name, whatsapp, zoho_contact_id)")
        .order("created_at", { ascending: false });
      setRows((rowsData as Enquiry[]) || []);
      const [{ data: partsData }, { data: movementsData }] = await Promise.all([
        supabase.from("parts").select("*").eq("active", true).order("name"),
        supabase.from("stock_movements").select("id, part_id, quantity, reason, enquiry_id, cost_price_snapshot, sell_price_snapshot, created_at"),
      ]);
      setParts((partsData as Part[]) || []);
      setMovements((movementsData as StockMovement[]) || []);
      setLoading(false);
    });
  }, [router]);

  function edit(id: string, patch: Partial<Enquiry>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }
  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }
  function editStaged(id: string, patch: Partial<Enquiry>) {
    edit(id, patch);
    setDirty(prev => { const n = new Set(prev); n.add(id); return n; });
  }
  function clearDirty(id: string) {
    setDirty(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
  function editSessionLocal(enqId: string, sessId: string, patch: Partial<Session>) {
    setRows(prev => prev.map(r =>
      r.id === enqId ? { ...r, sessions: r.sessions.map(ss => (ss.id === sessId ? { ...ss, ...patch } : ss)) } : r));
  }
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save(row: Enquiry) {
    const patch: Record<string, unknown> = {
      stage: row.stage,
      estimated_value: row.estimated_value,
      notes: row.notes,
      sessions_total: Number(row.sessions_total) || 1,
      bike_details: row.bike_details || null,
      work_required: row.work_required || null,
      bike_year: row.bike_year || null,
      bike_hours: row.bike_hours || null,
      storage_start_date: row.storage_start_date || null,
      storage_end_date: row.storage_end_date || null,
      bike_category: row.bike_category || null,
      storage_term: row.storage_term || null,
    };
    if (row.stage === "cancelled") {
      patch.cancelled_at = row.cancelled_at || new Date().toISOString();
      patch.refund_due = !!row.paid_at;
    } else {
      patch.cancelled_at = null;
      patch.refund_due = false;
    }
    const { error } = await supabase.from("enquiries").update(patch).eq("id", row.id);
    if (error) { showToast(error.message || "Could not save the booking.", "err"); return; }
    edit(row.id, {
      cancelled_at: patch.cancelled_at as string | null,
      refund_due: patch.refund_due as boolean,
    });
    clearDirty(row.id);
    setSavedId(row.id);
    setTimeout(() => setSavedId(null), 1500);
    showToast("Booking saved.");
    if (row.stage === "cancelled") {
      for (const ss of row.sessions || []) {
        if (ss.google_event_id) syncSessionToCalendar(row, { ...ss, scheduled_at: null });
      }
      sendStaffWhatsApp(row.assigned_to, name =>
        `Hi ${name}, the ${row.service_type.replace("_", " ")} booking with ${row.customer_name} has been cancelled.`);
    }
  }

  async function togglePaid(row: Enquiry) {
    const paid_at = row.paid_at ? null : new Date().toISOString();
    await supabase.from("enquiries").update({ paid_at }).eq("id", row.id);
    edit(row.id, { paid_at });
  }

  async function clearRefund(row: Enquiry) {
    await supabase.from("enquiries").update({ refund_due: false }).eq("id", row.id);
    edit(row.id, { refund_due: false });
  }

  async function assignBooking(row: Enquiry, profileId: string) {
    const assigned = profileId || null;
    await supabase.from("enquiries").update({ assigned_to: assigned }).eq("id", row.id);
    edit(row.id, { assigned_to: assigned });
    // Re-sync this booking's sessions so the calendar's "Assigned to" reflects
    // the new staff member right away. Other bookings are untouched — each
    // one is assigned independently now, even for the same customer.
    for (const ss of row.sessions || []) {
      syncSessionToCalendar({ ...row, assigned_to: assigned }, ss);
    }
    if (assigned) {
      const nextSession = (row.sessions || []).find(isActiveSession);
      const timeNote = nextSession?.scheduled_at
        ? ` It's set for ${formatSessionTime(nextSession.scheduled_at)}.`
        : " No time has been set yet.";
      sendStaffWhatsApp(assigned, name =>
        `Hi ${name}, you've been assigned a new ${row.service_type.replace("_", " ")} booking with ${row.customer_name}.${timeNote}`);
    }
  }

  async function persistSession(sessId: string, patch: Partial<Session>) {
    await supabase.from("sessions").update(patch).eq("id", sessId);
  }

  // Pushes a session's current schedule/status to Google Calendar (create, update,
  // or remove the event as appropriate), then saves the returned event ID. Failures
  // are surfaced as a toast but never block the Supabase save that already happened.
  async function syncSessionToCalendar(row: Enquiry, ss: Session) {
    try {
      const staffName = staff.find(p => p.id === row.assigned_to)?.name || null;
      const res = await fetch("/api/calendar/sync-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            id: ss.id,
            scheduled_at: ss.scheduled_at,
            duration_minutes: ss.duration_minutes,
            status: ss.status,
            google_event_id: ss.google_event_id,
          },
          enquiry: {
            id: row.id,
            customer_name: row.customer_name,
            phone: row.phone,
            service_type: row.service_type,
            notes: row.notes,
            work_required: row.work_required,
            bike_details: row.bike_details,
            bike_year: row.bike_year,
            bike_hours: row.bike_hours,
            selection: row.selection,
            estimated_value: row.estimated_value,
            assigned_staff_id: row.assigned_to,
            assigned_staff_name: staffName,
            rider_category: row.rider_category,
            rider_count: row.rider_count,
            own_gear: row.own_gear,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Could not sync this session to the calendar.", "err"); return; }
      const googleEventId = (data.google_event_id ?? null) as string | null;
      if (googleEventId !== ss.google_event_id) {
        editSessionLocal(row.id, ss.id, { google_event_id: googleEventId });
        await supabase.from("sessions").update({ google_event_id: googleEventId }).eq("id", ss.id);
      }
    } catch {
      showToast("Could not reach the calendar service.", "err");
    }
  }

  // Sends a WhatsApp message to whichever staff member holds staffId, if they
  // have a number on file. buildMessage receives that person's name (or a
  // generic fallback) so every message is personalized without repeating the
  // lookup at each call site. Silently does nothing if unassigned or no number
  // is set — this is a supplementary nice-to-have, not something that should
  // ever block the booking flow itself.
  async function sendStaffWhatsApp(staffId: string | null, buildMessage: (name: string) => string) {
    if (!staffId) return;
    const person = staff.find(p => p.id === staffId);
    if (!person?.whatsapp) return;
    const message = buildMessage(person.name || "there");
    try {
      const res = await fetch("/api/whatsapp/notify-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: person.whatsapp, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || `Could not WhatsApp ${person.name || "staff"}.`, "err");
        return;
      }
      showToast(`WhatsApp sent to ${person.name || "staff"}.`);
    } catch {
      showToast("Could not reach the WhatsApp service.", "err");
    }
  }

  function formatSessionTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });
  }

  async function addSession(row: Enquiry) {
    if (row.service_type === "motorcycle_storage") return; // storage uses a date range, not sessions
    const nextSeq = (row.sessions || []).reduce((m, ss) => Math.max(m, ss.seq), 0) + 1;
    const scheduled_at =
      (row.sessions || []).length === 0 && row.preferred_date
        ? localInputToIso(`${row.preferred_date}T09:00`)
        : null;
    const { data, error } = await supabase.from("sessions")
      .insert({ enquiry_id: row.id, seq: nextSeq, status: "scheduled", scheduled_at })
      .select().single();
    if (error || !data) { showToast(error?.message || "Could not add session.", "err"); return; }
    const newSession = data as Session;
    edit(row.id, { sessions: [...(row.sessions || []), newSession] });
    syncSessionToCalendar(row, newSession);
    if (newSession.scheduled_at) {
      sendStaffWhatsApp(row.assigned_to, name =>
        `Hi ${name}, your ${row.service_type.replace("_", " ")} booking with ${row.customer_name} is set for ${formatSessionTime(newSession.scheduled_at as string)}.`);
    }
  }

  // Records a part as used on this booking — a negative "used" movement in
  // the same stock ledger the Parts page writes to, with cost and sell price
  // snapshotted at this exact moment. Later price changes on the catalog
  // never reach back and rewrite what this job actually cost.
  async function addPartToBooking(row: Enquiry) {
    const part = parts.find(p => p.id === addPartSelection);
    const qty = Number(addPartQty);
    if (!part) { showToast("Choose a part first.", "err"); return; }
    if (!qty || qty <= 0) { showToast("Enter a quantity greater than zero.", "err"); return; }
    const { data, error } = await supabase.from("stock_movements").insert({
      part_id: part.id,
      quantity: -qty,
      reason: "used",
      enquiry_id: row.id,
      cost_price_snapshot: part.cost_price,
      sell_price_snapshot: partSellPrice(part),
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not add the part.", "err"); return; }
    setMovements(prev => [...prev, data as StockMovement]);
    setAddPartRowId(null);
    setAddPartSelection("");
    setAddPartQty("1");
    showToast(`Added ${qty} × ${part.name}.`);
  }

  // One-time, staff-triggered roll-up — adding parts never silently changes
  // the price on its own. Same "stay in the loop" pattern as the rest of
  // this app's money-touching actions.
  function addPartsSubtotalToEstimate(row: Enquiry) {
    const lines = partsUsedFor(row.id, movements);
    const subtotal = partsUsedTotal(lines);
    if (subtotal <= 0) return;
    editStaged(row.id, { estimated_value: (Number(row.estimated_value) || 0) + subtotal });
    showToast(`Added ${aed(subtotal)} in parts to the estimate — hit Save to keep it.`);
  }

  async function createPaymentLink(row: Enquiry) {
    const amount = Number(row.estimated_value) || 0;
    if (amount < 2) { showToast("Set an estimated value of at least AED 2 before creating a payment link.", "err"); return; }
    setLinkBusy(row.id);
    try {
      const res = await fetch("/api/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, message: `Garage51 - ${row.customer_name}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) { showToast(data.error || "Could not create the payment link.", "err"); return; }
      await supabase.from("enquiries").update({ payment_link: data.url, payment_intent_id: data.id, payment_link_sent_at: null }).eq("id", row.id);
      edit(row.id, { payment_link: data.url, payment_intent_id: data.id, payment_link_sent_at: null });
    } catch {
      showToast("Could not reach the payment service. Check your connection and try again.", "err");
    } finally {
      setLinkBusy(null);
    }
  }

  // Creates a draft invoice in Zoho Books for a booking that's already been
  // paid via Ziina. Reuses the customer's stored Zoho contact if they have
  // one; otherwise creates one and saves it back to their client record so
  // future invoices for the same person don't create duplicate contacts.
  async function createZohoInvoiceForBooking(row: Enquiry) {
    setZohoBusy(row.id);
    try {
      const res = await fetch("/api/zoho/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoho_contact_id: row.client?.zoho_contact_id || null,
          customer_name: row.customer_name,
          email: row.email,
          phone: row.phone,
          line_item_name: cap(row.service_type.replace("_", " ")),
          line_item_description: row.selection || row.bike_details || null,
          amount: row.estimated_value,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Could not create the Zoho invoice.", "err"); return; }

      await supabase.from("enquiries").update({
        zoho_invoice_id: data.zoho_invoice_id,
        zoho_invoice_number: data.zoho_invoice_number,
        zoho_invoice_url: data.invoice_url,
      }).eq("id", row.id);
      edit(row.id, {
        zoho_invoice_id: data.zoho_invoice_id,
        zoho_invoice_number: data.zoho_invoice_number,
        zoho_invoice_url: data.invoice_url,
      });

      if (row.client?.id && data.zoho_contact_id && row.client.zoho_contact_id !== data.zoho_contact_id) {
        await supabase.from("clients").update({ zoho_contact_id: data.zoho_contact_id }).eq("id", row.client.id);
        const clientId = row.client.id;
        setRows(prev => prev.map(r =>
          r.client?.id === clientId ? { ...r, client: { ...(r.client as ClientLite), zoho_contact_id: data.zoho_contact_id } } : r));
      }

      showToast(`Invoice ${data.zoho_invoice_number} created in Zoho Books.`);
    } catch {
      showToast("Could not reach the invoicing service.", "err");
    } finally {
      setZohoBusy(null);
    }
  }

  function copyLink(url: string) {
    if (navigator.clipboard) { navigator.clipboard.writeText(url); showToast("Payment link copied."); }
    else { window.prompt("Copy this payment link:", url); }
  }

  function waNumber(phone: string) {
    const raw = (phone || "").trim();
    let n = raw.replace(/\D/g, "");
    if (!raw.startsWith("+")) {
      if (n.startsWith("00")) n = n.slice(2);
      if (n.startsWith("0")) n = "971" + n.slice(1);
    }
    return n;
  }
  function whatsappLink(phone: string, name: string, link: string) {
    const msg = `Hi ${name}, here is your Garage51 booking payment link: ${link}`;
    return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`;
  }
  function waChat(phone: string) {
    return `https://wa.me/${waNumber(phone)}`;
  }
  async function markLinkSent(row: Enquiry) {
    const now = new Date().toISOString();
    await supabase.from("enquiries").update({ payment_link_sent_at: now }).eq("id", row.id);
    edit(row.id, { payment_link_sent_at: now });
  }

  async function connectWebhook() {
    try {
      const res = await fetch("/api/setup-webhook", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) { showToast(data.error || "Could not connect the webhook.", "err"); return; }
      showToast("Payment webhook connected. Paid bookings will now update automatically.");
    } catch { showToast("Could not reach the server to connect the webhook.", "err"); }
  }

  async function createEnquiry() {
    if (!form.customer_name.trim() || !form.phone.trim()) { setAddError("Name and phone are required."); return; }
    setCreating(true); setAddError("");
    const isStorage = form.service_type === "motorcycle_storage";
    const { data, error } = await supabase.from("enquiries").insert({
      customer_name: form.customer_name,
      phone: form.phone,
      email: form.email || null,
      service_type: form.service_type,
      source: form.source,
      stage: form.stage,
      estimated_value: Number(form.estimated_value) || 0,
      booking_at: isStorage ? null : (form.booking_at || null),
      storage_start_date: isStorage ? (form.storage_start_date || null) : null,
      storage_end_date: isStorage ? (form.storage_end_date || null) : null,
      bike_category: isStorage ? form.bike_category : null,
      storage_term: isStorage ? form.storage_term : null,
      notes: form.notes || "",
    }).select("*, sessions(*)").single();
    if (error || !data) { setCreating(false); setAddError(error?.message || "Could not create booking."); return; }
    const enq = data as Enquiry;
    if (!isStorage && form.booking_at) {
      const { data: ses } = await supabase.from("sessions")
        .insert({ enquiry_id: enq.id, seq: 1, scheduled_at: localInputToIso(form.booking_at) })
        .select().single();
      if (ses) {
        enq.sessions = [...(enq.sessions || []), ses as Session];
        syncSessionToCalendar(enq, ses as Session);
      }
    }
    setCreating(false);
    setRows(prev => [enq, ...prev]);
    setForm({ ...BLANK });
    setAdding(false);
  }

  function exportCsv() {
    const data = me?.role === "admin" ? rows : rows.filter(r => r.assigned_to === me?.id);
    const headers = ["Created", "Name", "Phone", "Email", "Service", "Requested", "Stage", "Paid", "Sessions done", "Sessions total", "Est. value (AED)", "Bike", "Year", "Hours", "Work required", "Bike category", "Storage term", "Storage start", "Storage end", "Zoho invoice", "Notes"];
    const esc = (v: unknown) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...data.map(r => [
        new Date(r.created_at).toLocaleDateString(), r.customer_name, r.phone,
        r.email || "", r.service_type, r.selection || "", r.stage, r.paid_at ? "yes" : "no",
        completedCount(r), r.sessions_total, r.estimated_value,
        r.bike_details || "", r.bike_year || "", r.bike_hours || "", r.work_required || "",
        r.bike_category || "", r.storage_term || "", r.storage_start_date || "", r.storage_end_date || "",
        r.zoho_invoice_number || "", r.notes || "",
      ].map(esc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `garage51-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const scoped = me?.role === "admin" ? rows : rows.filter(r => r.assigned_to === me?.id);

  const pipeline = scoped.filter(r => ["new", "contacted"].includes(r.stage)).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const booked = scoped.filter(r => r.stage === "booked" && !r.paid_at).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const earned = scoped.filter(r => !!r.paid_at).reduce((a, r) => a + (r.estimated_value || 0), 0);

  const matches = (r: Enquiry, f: string) => {
    if (f === "all") return true;
    if (f === "needs_payment") return r.stage === "booked" && !r.paid_at;
    if (f === "sent") return !!r.payment_link;
    if (f === "conflict") return bookingHasConflict(rows, r);
    if (f === "storage_due") return storageRenewalStatus(r) !== null;
    return bookingState(r) === f;
  };

  const counts: Record<string, number> = {};
  FILTER_OPTS.forEach(o => { counts[o.key] = scoped.filter(r => matches(r, o.key)).length; });

  const q = query.trim().toLowerCase();
  let visible = scoped.filter(r => matches(r, filter));
  if (q) visible = visible.filter(r =>
    r.customer_name.toLowerCase().includes(q) ||
    (r.phone || "").toLowerCase().includes(q) ||
    (r.selection || "").toLowerCase().includes(q) ||
    r.service_type.toLowerCase().includes(q)
  );

  const currentLabel = FILTER_OPTS.find(o => o.key === filter)?.label ?? "All";
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));
  const setStorageCategory = (category: string) =>
    setForm(prev => ({ ...prev, bike_category: category, estimated_value: storageTotalPrice(category, prev.storage_term) }));
  const setStorageTerm = (term: string) =>
    setForm(prev => {
      const estimated_value = storageTotalPrice(prev.bike_category, term);
      const storage_end_date = term !== "month_to_month" && prev.storage_start_date
        ? addMonths(prev.storage_start_date, storageTermMonths(term))
        : prev.storage_end_date;
      return { ...prev, storage_term: term, estimated_value, storage_end_date };
    });
  const setStorageStartDate = (value: string) =>
    setForm(prev => {
      const storage_end_date = value && prev.storage_term !== "month_to_month"
        ? addMonths(value, storageTermMonths(prev.storage_term))
        : prev.storage_end_date;
      return { ...prev, storage_start_date: value, storage_end_date };
    });
  const setRowStorageCategory = (r: Enquiry, category: string) =>
    editStaged(r.id, { bike_category: category, estimated_value: storageTotalPrice(category, r.storage_term || "month_to_month") });
  const setRowStorageTerm = (r: Enquiry, term: string) => {
    const category = r.bike_category || "adult";
    const patch: Partial<Enquiry> = { storage_term: term, estimated_value: storageTotalPrice(category, term) };
    if (term !== "month_to_month" && r.storage_start_date) {
      patch.storage_end_date = addMonths(r.storage_start_date, storageTermMonths(term));
    }
    editStaged(r.id, patch);
  };
  const setRowStorageStartDate = (r: Enquiry, value: string) => {
    const patch: Partial<Enquiry> = { storage_start_date: value || null };
    if (value && r.storage_term && r.storage_term !== "month_to_month") {
      patch.storage_end_date = addMonths(value, storageTermMonths(r.storage_term));
    }
    editStaged(r.id, patch);
  };
  const roleColor = (r?: string) => (r === "admin" ? RED : r === "mechanic" ? "#FFB02E" : "#3B9EFF");
  const initials = ((me?.name || myEmail || "?").trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("") || "?").toUpperCase();

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        <div style={s.headerBar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
          <div style={s.profileWrap}>
            <button onClick={() => setProfileOpen(o => !o)} className="g51-btn g51-ghost" style={s.profileBtn} aria-label="Account">
              <span style={{ ...s.avatar, background: roleColor(me?.role) }}>{initials}</span>
              <Chevron open={profileOpen} />
            </button>
            {profileOpen && (
              <>
                <div style={s.overlay} onClick={() => { setProfileOpen(false); setPwOpen(false); }} />
                <div className="g51-sheet" style={s.profileMenu}>
                  <div style={s.pmHead}>
                    <span style={{ ...s.avatarLg, background: roleColor(me?.role) }}>{initials}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={s.pmName}>{me?.name || "Account"}</div>
                      <div style={s.pmEmail}>{myEmail}</div>
                      <span style={{ ...s.pmRole, color: roleColor(me?.role), borderColor: roleColor(me?.role) + "66", background: roleColor(me?.role) + "1c" }}>{me?.role}</span>
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
        <div style={s.headerActions}>
          <button onClick={() => { setAdding(a => !a); setAddError(""); }} className="g51-btn g51-primary" style={s.primaryBtn}>+ New booking</button>
          <button onClick={() => router.push("/admin/parts")} className="g51-btn g51-ghost" style={s.ghostBtn}>Parts</button>
          {me?.role === "admin" && (
            <button onClick={() => router.push("/admin/staff")} className="g51-btn g51-ghost" style={s.ghostBtn}>Staff</button>
          )}
          <button onClick={exportCsv} className="g51-btn g51-ghost" style={s.ghostBtn}>Export</button>
        </div>
      </header>

      <div style={s.bodyWrap}>
        <div style={s.stats}>
          <Stat label="In pipeline" sub="New + contacted" value={aed(pipeline)} color="#5BB0FF" />
          <Stat label="Booked" sub="Awaiting payment" value={aed(booked)} color="#A78BFA" />
          <Stat label="Earned" sub="Paid" value={aed(earned)} color="#2FBF71" />
        </div>

        {adding && (
          <div style={s.addPanel}>
            <div style={s.addTitle}>New booking</div>
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
                  <option value="motorcycle_storage">motorcycle_storage</option>
                </select></label>
            </div>
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Source</span>
                <select className="g51-input" value={form.source} onChange={e => set("source", e.target.value)} style={s.input}>
                  {SOURCES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Stage</span>
                <select className="g51-input" value={form.stage} onChange={e => set("stage", e.target.value)} style={s.input}>
                  {STAGES.map(st => <option key={st} value={st}>{st}</option>)}
                </select></label>
            </div>
            {form.service_type === "motorcycle_storage" && (
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Bike category</span>
                  <select className="g51-input" value={form.bike_category} onChange={e => setStorageCategory(e.target.value)} style={s.input}>
                    <option value="adult">Adult (≥85cc)</option>
                    <option value="junior">Junior (≤65cc)</option>
                  </select></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Term</span>
                  <select className="g51-input" value={form.storage_term} onChange={e => setStorageTerm(e.target.value)} style={s.input}>
                    {STORAGE_TERMS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select></label>
              </div>
            )}
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>{form.service_type === "motorcycle_storage" ? (form.storage_term === "month_to_month" ? "Monthly rate (AED)" : "Total for term (AED)") : "Est. value (AED)"}</span>
                <input className="g51-input" type="number" value={form.estimated_value} onChange={e => set("estimated_value", Number(e.target.value))} style={s.input} /></label>
              {form.service_type === "motorcycle_storage" ? (
                <>
                  <label style={s.ctrl}><span style={s.ctrlLabel}>Drop-off date</span>
                    <input className="g51-input" type="date" value={form.storage_start_date} onChange={e => setStorageStartDate(e.target.value)} style={s.input} /></label>
                  <label style={s.ctrl}><span style={s.ctrlLabel}>Pick-up / renewal date</span>
                    <input className="g51-input" type="date" value={form.storage_end_date} onChange={e => set("storage_end_date", e.target.value)} style={s.input} /></label>
                </>
              ) : (
                <label style={s.ctrl}><span style={s.ctrlLabel}>Booking date &amp; time</span>
                  <input className="g51-input" type="datetime-local" value={form.booking_at} onChange={e => set("booking_at", e.target.value)} style={s.input} /></label>
              )}
            </div>
            <label style={s.ctrl}><span style={s.ctrlLabel}>Notes</span>
              <textarea className="g51-input" value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>
            {addError && <p style={s.addError}>{addError}</p>}
            <div style={s.actions}>
              <button onClick={createEnquiry} disabled={creating} className="g51-btn g51-primary" style={s.save}>{creating ? "Adding…" : "Create booking"}</button>
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
                <div className="g51-sheet" style={s.menu}>
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
          <p style={s.muted}>Loading bookings…</p>
        ) : scoped.length === 0 ? (
          <div style={s.empty}>No bookings yet. New web submissions appear here automatically.</div>
        ) : visible.length === 0 ? (
          <div style={s.empty}>Nothing matches this view.</div>
        ) : (
          <div style={s.list}>
            {visible.map(r => {
              const open = expanded.has(r.id);
              const st = bookingState(r);
              const sc = STATE_COLOR[st] || "#9A938D";
              const done = completedCount(r);
              const isPkg = r.sessions_total > 1;
              const conflicted = bookingHasConflict(rows, r);
              const renewal = storageRenewalStatus(r);
              const sortedSessions = [...(r.sessions || [])].sort((a, b) => a.seq - b.seq);
              return (
                <div key={r.id} className="g51-card" style={s.card}>
                  <div className="g51-row g51-card-head" style={s.cardHead} onClick={() => toggleExpand(r.id)}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: sc, flexShrink: 0 }} />
                    <div style={s.headMain}>
                      <div style={s.nameRow}>
                        <span style={s.name}>{r.customer_name}</span>
                        <span style={{ ...s.pill, color: sc, borderColor: sc + "66", background: sc + "1c" }}>{st}</span>
                        {conflicted && <span style={s.conflictBadge} title="One of this booking's sessions overlaps another booking for the same staff member">⚠ Conflict</span>}
                        {renewal === "overdue" && <span style={s.conflictBadge} title="This storage term has ended — confirm renewal payment or arrange bike pick-up">⚠ Pick-up overdue</span>}
                        {renewal === "due_soon" && <span style={s.renewalDueBadge} title="This storage term ends soon — confirm renewal or pick-up">⏰ Renewal due</span>}
                        {dirty.has(r.id) && <span style={s.unsaved}>unsaved</span>}
                      </div>
                      <div style={s.sub}>
                        {cap(r.service_type.replace("_", " "))}
                        <span style={s.dotSep}>·</span>
                        {nextLabel(r)}
                        {r.selection && <><span style={s.dotSep}>·</span>{r.selection}</>}
                        {isPkg && <><span style={s.dotSep}>·</span>session {done}/{r.sessions_total}</>}
                      </div>
                    </div>
                    <div className="g51-head-right" style={s.headRight}>
                      {r.estimated_value > 0 && <span style={s.amount}>{aed(r.estimated_value)}</span>}
                      <Chevron open={open} />
                    </div>
                  </div>

                  <div style={s.quick}>
                    {(r.paid_at || !["cancelled", "lost"].includes(r.stage)) && (
                      <button onClick={() => togglePaid(r)} className="g51-btn" style={r.paid_at ? s.quickPaid : s.quickBtn}>
                        {r.paid_at ? "Paid ✓" : "Mark paid"}
                      </button>
                    )}
                    {r.phone && (
                      <a href={waChat(r.phone)} target="_blank" rel="noreferrer" className="g51-btn" style={s.quickBtn}>Message</a>
                    )}
                    {(r.stage === "booked" || r.payment_link) && (
                      <div style={s.payWrap}>
                        {!r.payment_link ? (
                          <button onClick={() => createPaymentLink(r)} disabled={linkBusy === r.id} className="g51-btn" style={s.quickBtn}>
                            {linkBusy === r.id ? "Creating…" : "Payment link"}
                          </button>
                        ) : (
                          <button onClick={() => setPayMenuId(payMenuId === r.id ? null : r.id)} className="g51-btn" style={s.quickBtn}>
                            Payment link{r.payment_link_sent_at && <span style={s.sentTick}>✓</span>}
                            <Chevron open={payMenuId === r.id} />
                          </button>
                        )}
                        {payMenuId === r.id && r.payment_link && (
                          <>
                            <div style={s.overlay} onClick={() => setPayMenuId(null)} />
                            <div className="g51-sheet" style={s.payMenu}>
                              {!r.payment_link_sent_at ? (
                                <a href={whatsappLink(r.phone, r.customer_name, r.payment_link)} target="_blank" rel="noreferrer"
                                  onClick={() => { markLinkSent(r); setPayMenuId(null); }}
                                  className="g51-item" style={s.payItemWa}>Send link on WhatsApp</a>
                              ) : (
                                <div style={s.paySent}>Link sent {new Date(r.payment_link_sent_at).toLocaleDateString()}</div>
                              )}
                              <a href={r.payment_link} target="_blank" rel="noreferrer" onClick={() => setPayMenuId(null)} className="g51-item" style={s.payItem}>Open link</a>
                              <button onClick={() => { copyLink(r.payment_link!); setPayMenuId(null); }} className="g51-item" style={s.payItem}>Copy link</button>
                              <button onClick={() => { createPaymentLink(r); setPayMenuId(null); }} disabled={linkBusy === r.id} className="g51-item" style={s.payItem}>{linkBusy === r.id ? "Generating…" : "Generate new link"}</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {r.paid_at && (
                      r.zoho_invoice_id ? (
                        <a href={r.zoho_invoice_url || "#"} target="_blank" rel="noreferrer" className="g51-btn" style={s.quickBtn}>
                          Invoice {r.zoho_invoice_number}<span style={s.sentTick}>✓</span>
                        </a>
                      ) : (
                        <button onClick={() => createZohoInvoiceForBooking(r)} disabled={zohoBusy === r.id} className="g51-btn" style={s.quickBtn}>
                          {zohoBusy === r.id ? "Creating…" : "Create invoice"}
                        </button>
                      )
                    )}
                  </div>

                  {open && (
                    <div className="g51-expand" style={s.cardBody}>
                      <div style={s.contact}>
                        <a href={`tel:${r.phone}`} style={s.link}>{r.phone}</a>
                        {r.email && <span style={s.muted2}>{r.email}</span>}
                        {r.refund_due && (
                          <span style={s.refund}>Refund due
                            <button onClick={() => clearRefund(r)} className="g51-btn" style={s.refundClear}>Mark refunded</button>
                          </span>
                        )}
                      </div>

                      {r.service_type !== "motorcycle_storage" && (me?.role === "admin" || r.assigned_to) && (
                        <div style={s.assignRow}>
                          <span style={s.assignLabel}>Assigned to</span>
                          {me?.role === "admin" ? (
                            <select className="g51-input" value={r.assigned_to || ""}
                              onChange={e => assignBooking(r, e.target.value)} style={s.assignSelect}>
                              <option value="">Unassigned</option>
                              {staff.map(p => (
                                <option key={p.id} value={p.id}>{p.name || "(no name)"} · {p.role}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={s.assignVal}>{staff.find(p => p.id === r.assigned_to)?.name || "—"}</span>
                          )}
                        </div>
                      )}

                      {r.preferred_date && (
                        <div style={s.prefRow}>
                          <span style={s.prefLabel}>Preferred date</span>
                          <span style={s.prefVal}>{new Date(r.preferred_date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                        </div>
                      )}

                      {r.selection && (
                        <div style={s.selBox}>
                          <span style={s.selLabel}>Requested</span>
                          <span style={s.selText}>{r.selection}</span>
                        </div>
                      )}

                      <div style={s.controls}>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Stage</span>
                          <select className="g51-input" value={r.stage} onChange={e => editStaged(r.id, { stage: e.target.value })} style={s.input}>
                            {STAGES.map(stg => <option key={stg} value={stg}>{stg}</option>)}
                          </select></label>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>{r.service_type === "motorcycle_storage" ? (r.storage_term === "month_to_month" || !r.storage_term ? "Monthly rate (AED)" : "Total for term (AED)") : "Est. value (AED)"}</span>
                          <input className="g51-input" type="number" value={r.estimated_value} onChange={e => editStaged(r.id, { estimated_value: Number(e.target.value) })} style={s.input} /></label>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Payment</span>
                          <button onClick={() => togglePaid(r)} className="g51-btn g51-ghost" style={{ ...s.input, cursor: "pointer", textAlign: "left", color: r.paid_at ? PAID_COLOR : "#B5AEA8" }}>
                            {r.paid_at ? "Paid ✓ · tap to undo" : "Mark as paid"}
                          </button></label>
                      </div>

                      {r.service_type !== "motorcycle_storage" && (
                      <div style={s.sesWrap}>
                        <div style={s.sesHead}>
                          <span style={s.sesTitle}>Sessions · {done} of {r.sessions_total} done</span>
                          <label style={s.sesTotal}>
                            <span style={s.ctrlLabel}>Package size</span>
                            <input className="g51-input" type="number" min={1} value={r.sessions_total}
                              onChange={e => editStaged(r.id, { sessions_total: Math.max(1, Number(e.target.value) || 1) })}
                              style={{ ...s.input, width: 70, padding: "6px 8px" }} />
                          </label>
                        </div>
                        {sortedSessions.map(ss => {
                          const conflict = findConflict(rows, r, ss);
                          return (
                          <div key={ss.id} style={s.sesRow}>
                            <span style={s.sesSeq}>#{ss.seq}</span>
                            <input className="g51-input" type="datetime-local"
                              value={isoToLocalInput(ss.scheduled_at)}
                              onChange={e => {
                                const iso = localInputToIso(e.target.value);
                                editSessionLocal(r.id, ss.id, { scheduled_at: iso });
                                persistSession(ss.id, { scheduled_at: iso });
                                syncSessionToCalendar(r, { ...ss, scheduled_at: iso });
                                if (iso) {
                                  sendStaffWhatsApp(r.assigned_to, name =>
                                    `Hi ${name}, your ${r.service_type.replace("_", " ")} booking with ${r.customer_name} is now set for ${formatSessionTime(iso)}.`);
                                }
                              }}
                              style={{ ...s.input, flex: "1 1 180px" }} />
                            <span style={s.durationWrap}>
                              <input className="g51-input" type="number" min={60} max={240} step={15}
                                value={ss.duration_minutes ?? SESSION_DURATION_MINUTES}
                                title="Duration in minutes (1–4 hours)"
                                onChange={e => {
                                  const minutes = Math.max(60, Math.min(240, Number(e.target.value) || SESSION_DURATION_MINUTES));
                                  editSessionLocal(r.id, ss.id, { duration_minutes: minutes });
                                  persistSession(ss.id, { duration_minutes: minutes });
                                  syncSessionToCalendar(r, { ...ss, duration_minutes: minutes });
                                }}
                                style={{ ...s.input, width: 64, padding: "8px 6px", textAlign: "center" }} />
                              <span style={s.durationUnit}>min</span>
                            </span>
                            <select className="g51-input" value={ss.status}
                              onChange={e => {
                                const v = e.target.value;
                                editSessionLocal(r.id, ss.id, { status: v });
                                persistSession(ss.id, { status: v });
                                syncSessionToCalendar(r, { ...ss, status: v });
                                if (v === "cancelled") {
                                  sendStaffWhatsApp(r.assigned_to, name =>
                                    `Hi ${name}, your ${r.service_type.replace("_", " ")} booking with ${r.customer_name} has been cancelled.`);
                                }
                              }}
                              style={{ ...s.input, flex: "0 0 130px" }}>
                              {SESSION_STATUSES.map(v => <option key={v} value={v}>{v.replace("_", " ")}</option>)}
                            </select>
                            <span style={{ ...s.sesState, color: sessionDone(ss) ? "#2FBF71" : "#9A938D" }}>{sessionLabel(ss)}</span>
                            {conflict && (
                              <span style={s.conflictBadge} title={`Overlaps with ${conflict.customer_name}'s ${conflict.service_type.replace("_", " ")} booking`}>
                                ⚠ Conflicts with {conflict.customer_name}
                              </span>
                            )}
                          </div>
                          );
                        })}
                        {sortedSessions.length < r.sessions_total && (
                          <button onClick={() => addSession(r)} className="g51-btn g51-ghost" style={s.addSes}>+ Add session</button>
                        )}
                      </div>
                      )}

                      {r.service_type === "motorcycle_storage" && (
                        <>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Bike (make / model)</span>
                              <input className="g51-input" value={r.bike_details || ""} onChange={e => editStaged(r.id, { bike_details: e.target.value })} style={s.input} /></label>
                          </div>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Bike category</span>
                              <select className="g51-input" value={r.bike_category || "adult"} onChange={e => setRowStorageCategory(r, e.target.value)} style={s.input}>
                                <option value="adult">Adult (≥85cc)</option>
                                <option value="junior">Junior (≤65cc)</option>
                              </select></label>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Term</span>
                              <select className="g51-input" value={r.storage_term || "month_to_month"} onChange={e => setRowStorageTerm(r, e.target.value)} style={s.input}>
                                {STORAGE_TERMS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                              </select></label>
                          </div>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Drop-off date</span>
                              <input className="g51-input" type="date" value={r.storage_start_date || ""} onChange={e => setRowStorageStartDate(r, e.target.value)} style={s.input} /></label>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Pick-up / renewal date</span>
                              <input className="g51-input" type="date" value={r.storage_end_date || ""} onChange={e => editStaged(r.id, { storage_end_date: e.target.value || null })} style={s.input} /></label>
                          </div>
                        </>
                      )}

                      {r.service_type === "workshop" && (
                        <>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Bike (make / model)</span>
                              <input className="g51-input" value={r.bike_details || ""} onChange={e => editStaged(r.id, { bike_details: e.target.value })} style={s.input} /></label>
                          </div>
                          <div style={s.controls}>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Year</span>
                              <input className="g51-input" value={r.bike_year || ""} onChange={e => editStaged(r.id, { bike_year: e.target.value })} style={s.input} /></label>
                            <label style={s.ctrl}><span style={s.ctrlLabel}>Hours / mileage</span>
                              <input className="g51-input" value={r.bike_hours || ""} onChange={e => editStaged(r.id, { bike_hours: e.target.value })} style={s.input} /></label>
                          </div>
                          <label style={s.ctrl}><span style={s.ctrlLabel}>Work required</span>
                            <textarea className="g51-input" value={r.work_required || ""} onChange={e => editStaged(r.id, { work_required: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>

                          {(() => {
                            const usedLines = partsUsedFor(r.id, movements);
                            const usedTotal = partsUsedTotal(usedLines);
                            return (
                              <div style={s.sesWrap}>
                                <div style={s.sesHead}>
                                  <span style={s.sesTitle}>Parts used{usedTotal > 0 ? ` · ${aed(usedTotal)}` : ""}</span>
                                  {usedTotal > 0 && (
                                    <button onClick={() => addPartsSubtotalToEstimate(r)} className="g51-btn g51-ghost" style={s.addSes}>
                                      Add to estimate
                                    </button>
                                  )}
                                </div>
                                {usedLines.map(line => {
                                  const part = parts.find(pp => pp.id === line.part_id);
                                  return (
                                    <div key={line.part_id} style={s.sesRow}>
                                      <span style={{ flex: "1 1 auto" }}>{part?.name || "Unknown part"} × {line.qty}</span>
                                      <span style={{ fontWeight: 700 }}>{aed(line.qty * line.sellSnapshot)}</span>
                                    </div>
                                  );
                                })}
                                {addPartRowId === r.id ? (
                                  <div style={s.sesRow}>
                                    <select className="g51-input" value={addPartSelection} onChange={e => setAddPartSelection(e.target.value)} style={{ ...s.input, flex: "1 1 200px" }}>
                                      <option value="">Choose a part…</option>
                                      {parts.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({stockFor(p.id, movements)} in stock)</option>
                                      ))}
                                    </select>
                                    <input className="g51-input" type="number" min={1} value={addPartQty} onChange={e => setAddPartQty(e.target.value)} style={{ ...s.input, width: 70, flex: "0 0 70px" }} />
                                    <button onClick={() => addPartToBooking(r)} className="g51-btn g51-primary" style={{ ...s.addSes, background: RED, color: "#fff", border: "none", fontWeight: 700 }}>Add</button>
                                    <button onClick={() => setAddPartRowId(null)} className="g51-btn g51-ghost" style={s.addSes}>Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setAddPartRowId(r.id); setAddPartSelection(""); setAddPartQty("1"); }} className="g51-btn g51-ghost" style={s.addSes}>+ Add part</button>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}

                      <label style={s.ctrl}><span style={s.ctrlLabel}>Notes</span>
                        <textarea className="g51-input" value={r.notes || ""} onChange={e => editStaged(r.id, { notes: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>

                      <div style={s.actions}>
                        <button onClick={() => save(r)} className="g51-btn g51-primary" style={s.save}>Save</button>
                        {dirty.has(r.id) && <span style={s.unsavedText}>Unsaved changes</span>}
                        {savedId === r.id && <span style={s.saved}>Saved ✓</span>}
                        {r.service_type === "workshop" && (
                          <button onClick={() => printJobCard(r, partsUsedFor(r.id, movements).map(l => {
                            const part = parts.find(pp => pp.id === l.part_id);
                            return { name: part?.name || "Unknown part", qty: l.qty, lineTotal: Math.round(l.qty * l.sellSnapshot * 100) / 100 };
                          }))} className="g51-btn g51-ghost" style={s.ghostBtn}>Job card</button>
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

      {toast && (
        <div style={{ ...s.toast, ...(toast.kind === "err" ? s.toastErr : s.toastOk) }}>{toast.msg}</div>
      )}
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50 },
  header: { position: "sticky", top: 0, zIndex: 30, display: "flex", flexDirection: "column", gap: 11, padding: "12px 18px", background: "#1A1817", borderBottom: "1px solid #2A2623" },
  headerBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
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
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14 },
  cardHead: { display: "flex", alignItems: "center", gap: 13, padding: "14px 17px", cursor: "pointer", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  headMain: { flex: 1, minWidth: 0 },
  name: { fontWeight: 600, fontSize: 15.5 },
  sub: { fontSize: 12.5, color: "#9A938D", marginTop: 3, lineHeight: 1.45, wordBreak: "break-word" },
  dotSep: { margin: "0 7px", opacity: 0.5 },
  headRight: { display: "flex", alignItems: "center", gap: 11, flexShrink: 0 },
  progress: { fontSize: 11.5, fontWeight: 700, color: "#C9C2BC", background: "#2C2824", borderRadius: 20, padding: "2px 9px" },
  amount: { fontWeight: 700, fontSize: 14.5 },
  pill: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  unsaved: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFB02E", border: "1px solid #FFB02E55", background: "#FFB02E18", borderRadius: 20, padding: "2px 8px" },
  unsavedText: { fontSize: 12.5, fontWeight: 600, color: "#FFB02E" },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
  quick: { display: "flex", gap: 8, flexWrap: "wrap", padding: "0 17px 14px" },
  quickBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#2A2624", color: "#D7D0CA", border: "1px solid #38332E", borderRadius: 9, padding: "11px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" },
  quickPaid: { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "#2FBF71", border: "1px solid #2FBF7140", borderRadius: 9, padding: "11px 15px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  sentTick: { display: "inline-grid", placeItems: "center", width: 15, height: 15, borderRadius: "50%", background: "#25D366", color: "#06270F", fontSize: 10, fontWeight: 900 },
  cardBody: { padding: "2px 17px 17px", borderTop: "1px solid #2A2623" },
  contact: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", margin: "14px 0" },
  link: { color: "#F4F2EF", textDecoration: "none", fontWeight: 500, fontSize: 14 },
  muted2: { color: "#8C857F", fontSize: 13 },
  prefRow: { display: "flex", alignItems: "center", gap: 10, margin: "0 0 13px" },
  prefLabel: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D" },
  prefVal: { fontSize: 13.5, fontWeight: 600, color: "#FFB02E" },
  assignRow: { display: "flex", alignItems: "center", gap: 10, margin: "0 0 13px", flexWrap: "wrap" },
  assignLabel: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D" },
  assignSelect: { background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 13.5, fontWeight: 600, padding: "8px 10px", fontFamily: "inherit", maxWidth: 260 },
  assignVal: { fontSize: 13.5, fontWeight: 600, color: "#5BB0FF" },
  conflictBadge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FF6B6B", border: "1px solid #FF6B6B55", background: "#FF6B6B18", borderRadius: 20, padding: "2px 8px" },
  renewalDueBadge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFB02E", border: "1px solid #FFB02E55", background: "#FFB02E18", borderRadius: 20, padding: "2px 8px" },
  refund: { display: "inline-flex", alignItems: "center", gap: 9, fontSize: 12, fontWeight: 700, color: "#FFB02E", border: "1px solid #FFB02E55", background: "#FFB02E14", borderRadius: 20, padding: "3px 6px 3px 12px" },
  refundClear: { background: "#2C2824", color: "#C9C2BC", border: "none", borderRadius: 16, padding: "3px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  controls: { display: "flex", gap: 12, flexWrap: "wrap" },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px", marginBottom: 13 },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  selBox: { display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", background: "#1B1816", border: "1px solid " + RED + "33", borderRadius: 9, padding: "9px 12px", marginBottom: 13 },
  selLabel: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D", flexShrink: 0 },
  selText: { fontSize: 13.5, color: "#F4F2EF", fontWeight: 500 },
  sesWrap: { background: "#1B1816", border: "1px solid #2F2B27", borderRadius: 11, padding: "12px 13px", marginBottom: 13 },
  sesHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 10, flexWrap: "wrap" },
  sesTitle: { fontSize: 12.5, fontWeight: 700, color: "#C9C2BC", letterSpacing: "0.03em" },
  sesTotal: { display: "grid", gap: 4, justifyItems: "start" },
  sesRow: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 8 },
  sesSeq: { fontSize: 12, fontWeight: 700, color: "#8C857F", width: 26, flexShrink: 0 },
  durationWrap: { display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto" },
  durationUnit: { fontSize: 12, color: "#9A938D" },
  sesState: { fontSize: 12, fontWeight: 600, flex: "0 0 auto" },
  addSes: { marginTop: 2, fontSize: 12.5, padding: "7px 12px" },
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 },
  save: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  saved: { color: "#2FBF71", fontSize: 13, fontWeight: 600 },
  payBtn: { background: "#FFC400", color: "#1A1817", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  waBtn: { background: "#25D366", color: "#0B2E13", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textDecoration: "none" },
  payWrap: { position: "relative" },
  payMenu: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50, minWidth: 212, background: "#26221F", border: "1px solid #38332E", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" },
  payItem: { width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "10px 11px", cursor: "pointer", color: "#C9C2BC", fontSize: 13.5, fontFamily: "inherit", textDecoration: "none", display: "block" },
  payItemWa: { width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "10px 11px", cursor: "pointer", color: "#25D366", fontWeight: 700, fontSize: 13.5, fontFamily: "inherit", textDecoration: "none", display: "block" },
  paySent: { padding: "9px 11px", fontSize: 12, color: "#9A938D", borderBottom: "1px solid #322E2A", marginBottom: 4 },
  muted: { color: "#9A938D", textAlign: "center", padding: "30px 0" },
  empty: { color: "#8C857F", textAlign: "center", padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  addError: { color: "#FF6B6B", fontSize: 13, margin: "0 0 10px" },
  footer: { maxWidth: 860, margin: "30px auto 0", padding: "18px 20px", borderTop: "1px solid #2A2623", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  footerNote: { fontSize: 12, color: "#6F6862" },
  profileWrap: { position: "relative" },
  profileBtn: { display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 9px 5px 6px" },
  avatar: { width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 800 },
  avatarLg: { width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontSize: 15, fontWeight: 800, flexShrink: 0 },
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
