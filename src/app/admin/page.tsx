"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";
import { AdminNav } from "../../components/AdminNav";
import { STORAGE_TERMS, storageTermMonths, storageTotalPrice, storageMonthlyRate, addMonths } from "../../lib/storagePricing";
import {
  type Part,
  type StockMovement,
  type ServiceProduct,
  type ServiceProductItem,
  type ServiceProductApplication,
  sellPrice as partSellPrice,
  stockFor,
  partsUsedFor,
  partsUsedTotal,
  labourCharge,
  LABOUR_RATE_PER_HOUR,
  applicationsFor,
  applicationsTotal,
  recipeUsageFor,
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
  vin: string | null;
  storage_start_date: string | null;
  storage_end_date: string | null;
  bike_category: string | null;
  storage_term: string | null;
  zoho_invoice_id: string | null;
  zoho_invoice_number: string | null;
  zoho_invoice_url: string | null;
  job_status: string | null;
  labour_hours: number | null;
  payment_link: string | null;
  payment_intent_id: string | null;
  payment_link_sent_at: string | null;
  sessions: Session[];
  client: ClientLite | null;
  assigned_to: string | null;
  whatsapp_ack_sent_at: string | null;
  whatsapp_ack_error: string | null;
  storage_bike_id: string | null;
  job_group_id: string | null;
  lesson_group_id: string | null;
  service_item_id: string | null;
};

type ClientLite = { id: string; name: string | null; whatsapp: string | null; zoho_contact_id: string | null };
type ClientBike = { id: string | null; engine_hours: number | null; label: string; make: string | null; model: string | null; year: string | null; vin: string | null };
// One bike within a multi-bike motorcycle-storage booking created from the
// "+ New booking" form — each becomes its own `enquiries` row on submit.
type StorageBikeEntry = { category: string; details: string; estimatedValue: number };
type LgClient = { name: string; phone: string; email: string; price: number };
type SessPatch = Partial<Pick<Session, "scheduled_at" | "duration_minutes" | "status">>;
type Profile = { id: string; name: string | null; roles: string[]; active: boolean; whatsapp: string | null };

const RED = "#ED1C24";
const STAGES = ["new", "contacted", "booked", "lost", "cancelled"];
const SESSION_STATUSES = ["scheduled", "completed", "no_show", "cancelled"];
// Shop-floor status for a workshop job — deliberately separate from STAGES,
// which tracks the sales pipeline. A mechanic cares whether they've started
// the work, not whether the customer's been contacted.
const JOB_STATUSES = [
  { key: "queued", label: "Queued" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_parts", label: "Waiting on parts" },
  { key: "completed", label: "Completed" },
];
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
  paid: "#FFC400", queued: "#3B9EFF", "in progress": "#FFB02E", "waiting parts": "#C77B6B",
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
const BUSINESS_UNIT_COLOR: Record<string, string> = {
  workshop: "#D85A30", academy: "#14B8A6", desert_tour: "#D4A017",
};
const dotColor = (k: string) =>
  STATE_COLOR[k] || BUSINESS_UNIT_COLOR[k] || (k === "needs_payment" ? PAID_COLOR : k === "sent" ? "#2FBF71" : k === "conflict" ? "#FF6B6B" : "#9A938D");

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
  // Business unit — storage isn't included here, it has its own dedicated page.
  { key: "workshop", label: "Workshop" },
  { key: "academy", label: "Academy" },
  { key: "desert_tour", label: "Desert Tour" },
];

const BLANK = {
  customer_name: "", phone: "", email: "", service_type: "academy",
  source: "whatsapp", stage: "new", estimated_value: 0, booking_at: "", notes: "",
  storage_start_date: "", storage_end_date: "", bike_category: "adult", storage_term: "month_to_month",
  preferred_date: "", sessions_total: 1, bike_details: "",
  // Multi-bike motorcycle-storage entries — one `enquiries` row is created
  // per entry on submit. Starts with a single blank bike.
  storageBikes: [{ category: "adult", details: "", estimatedValue: storageTotalPrice("adult", "month_to_month") }] as StorageBikeEntry[],
};

const blankLgClient = (): LgClient => ({ name: "", phone: "", email: "", price: 0 });
const newLg = () => ({ on: false, type: "single" as "single" | "package", sessions: 4, instructor: "", start: "", clients: [blankLgClient(), blankLgClient()] });

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
  // Payment confirmed — either via Ziina webhook (paid_at) or manual admin update (stage === "paid")
  if (r.paid_at || r.stage === "paid") return "paid";
  // If pushed to workshop queue, show workshop status regardless of service_type
  if (r.job_status === "completed") return "completed";
  if (r.job_status === "in_progress") return "in progress";
  if (r.job_status === "waiting_parts") return "waiting parts";
  if (r.job_status === "queued") return "queued";
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
    if (forRow.lesson_group_id && r.lesson_group_id === forRow.lesson_group_id) continue;
    for (const ss of r.sessions || []) {
      if (ss.id === forSession.id || !isActiveSession(ss)) continue;
      const oStart = new Date(ss.scheduled_at as string).getTime();
      const oEnd = oStart + (ss.duration_minutes ?? SESSION_DURATION_MINUTES) * 60000;
      if (start < oEnd && oStart < end) return r;
    }
  }
  return null;
}

function lessonGroupEligible(r: Enquiry): boolean {
  return r.service_type === "academy" && r.stage !== "cancelled" && r.stage !== "lost" && !r.lesson_group_id;
}

function nextLessonLabel(members: Enquiry[]): string | null {
  const now = Date.now();
  const next = members.flatMap(r => r.sessions || []).filter(isActiveSession)
    .map(x => new Date(x.scheduled_at as string).getTime()).filter(x => x >= now).sort((a, b) => a - b)[0];
  return next === undefined ? null : new Date(next).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
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

function printJobCard(
  r: Enquiry,
  partsLines: { name: string; qty: number; lineTotal: number }[] = [],
  appliedProducts: { name: string; price: number; recipe: { name: string; qty: number }[] }[] = []
) {
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
  const productsTotal = appliedProducts.reduce((sum, p) => sum + p.price, 0);
  const productsSection = appliedProducts.length === 0 ? "" : `
  <div class="label" style="margin:18px 0 6px;">Service products applied (fixed price — parts shown for reference only)</div>
  <table class="parts">
    <tr><th>Product</th><th></th><th>Price</th></tr>
    ${appliedProducts.map(p => `<tr><td>${esc(p.name)}</td><td></td><td>AED ${p.price.toLocaleString()}</td></tr>` +
      p.recipe.map(item => `<tr><td colspan="2" style="padding-left:18px;color:#888;font-size:12px;">↳ ${esc(item.name)} ×${item.qty}</td><td></td></tr>`).join("")
    ).join("")}
    <tr><td colspan="2"><strong>Total</strong></td><td><strong>AED ${productsTotal.toLocaleString()}</strong></td></tr>
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
    <div class="row"><div class="label">Preferred / booking date</div><div class="val">${esc(r.booking_at) || esc(r.preferred_date) || "—"}</div></div>
    <div class="row"><div class="label">Bike (make / model)</div><div class="val">${esc(r.bike_details) || "—"}</div></div>
    <div class="row"><div class="label">Year</div><div class="val">${esc(r.bike_year) || "—"}</div></div>
    <div class="row"><div class="label">Hours / mileage</div><div class="val">${esc(r.bike_hours) || "—"}</div></div>
  </div>
  <div class="label" style="margin-bottom:6px;">Work required</div>
  <div class="box">${esc(r.work_required)}</div>${partsSection}${productsSection}
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
  const [clientSearch, setClientSearch] = useState("");
  const [clientList, setClientList] = useState<{ name: string; phone: string; email: string | null; bikes: ClientBike[] }[]>([]);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [lg, setLg] = useState(newLg);
  const [selectMode, setSelectMode] = useState(false);
  const [groupPkgConfirmed, setGroupPkgConfirmed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [groupInstructor, setGroupInstructor] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [clientBikes, setClientBikes] = useState<ClientBike[]>([]);
  // Workshop intake form
  const [wsOpen, setWsOpen] = useState(false);
  const [wsClientSearch, setWsClientSearch] = useState("");
  const [wsShowDrop, setWsShowDrop] = useState(false);
  const [wsClientBikes, setWsClientBikes] = useState<ClientBike[]>([]);
  // Multi-bike workshop intake: ticked storage_bikes ids, "other bike" toggle, and per-bike work/estimate overrides (key = bike id or "__other").
  const [wsPicked, setWsPicked] = useState<string[]>([]);
  const [wsOther, setWsOther] = useState(false);
  const [wsOverrides, setWsOverrides] = useState<Record<string, { work?: string; amount?: string }>>({});
  // Set when intake is opened from the Storage Bikes page for a tracked service item, so the job links back to that item.
  const [wsItem, setWsItem] = useState<{ bikeId: string; itemId: string } | null>(null);
  const wsDeepLink = useRef<{ bike: string; item: string | null; work: string; amount: string } | null>(null);
  const [wsForm, setWsForm] = useState({ client: "", phone: "", email: "", make: "", model: "", year: "", vin: "", work: "", assignedTo: "", amount: "", date: "" });
  const [creatingWs, setCreatingWs] = useState(false);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [zohoBusy, setZohoBusy] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [serviceProducts, setServiceProducts] = useState<ServiceProduct[]>([]);
  const [productItems, setProductItems] = useState<ServiceProductItem[]>([]);
  const [applications, setApplications] = useState<ServiceProductApplication[]>([]);
  const [addPartRowId, setAddPartRowId] = useState<string | null>(null);
  const [addPartSelection, setAddPartSelection] = useState("");
  const [addPartQty, setAddPartQty] = useState("1");
  const [applyProductRowId, setApplyProductRowId] = useState<string | null>(null);
  const [applyProductSelection, setApplyProductSelection] = useState("");
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
        supabase.from("profiles").select("id, name, roles, active, whatsapp").eq("id", data.session.user.id).single(),
        supabase.from("profiles").select("id, name, roles, active, whatsapp").eq("active", true).order("name"),
      ]);
      // Only redirect away for an exclusively mechanic account — the workshop
      // queue is genuinely a better fit for them. Everyone else (including
      // facilities-only and any multi-role combination) stays here; this page
      // already scopes to what's assigned to the signed-in user for non-admins.
      const meRoles = (prof as Profile | null)?.roles || [];
      if (meRoles.length === 1 && meRoles[0] === "mechanic") { router.replace("/admin/workshop"); return; }
      setMe((prof as Profile) || null);
      setStaff((people as Profile[]) || []);
      setReady(true);
      const { data: rowsData } = await supabase
        .from("enquiries")
        .select("*, sessions(*), client:clients(id, name, whatsapp, zoho_contact_id)")
        .order("created_at", { ascending: false });
      setRows((rowsData as Enquiry[]) || []);

      // Build client memory: merge clients table + unique phones from enquiries + storage bikes
      const [{ data: cliData }, { data: enqContacts }, { data: sbContacts }] = await Promise.all([
        supabase.from("clients").select("name, whatsapp, email"),
        supabase.from("enquiries").select("customer_name, phone, email").order("created_at", { ascending: false }),
        supabase.from("storage_bikes").select("id, engine_hours, client_name, client_phone, client_email, make, model, year, vin, reference_number").eq("active", true),
      ]);
      const seen = new Set<string>();
      const merged: { name: string; phone: string; email: string | null; bikes: ClientBike[] }[] = [];
      // Clients table first (canonical)
      for (const c of (cliData || []) as { name: string | null; whatsapp: string | null; email: string | null }[]) {
        const phone = (c.whatsapp || "").trim();
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        merged.push({ name: c.name || "", phone, email: c.email, bikes: [] });
      }
      // Storage bike owners — attach full bike records (not just a label) per
      // phone, so callers can auto-fill make/model/year/VIN individually
      // instead of re-parsing a joined string.
      const sbList = (sbContacts || []) as { id: string; engine_hours: number | null; client_name: string | null; client_phone: string | null; client_email: string | null; make: string | null; model: string | null; year: string | null; vin: string | null; reference_number: string | null }[];
      for (const b of sbList) {
        const phone = (b.client_phone || "").trim();
        if (!phone) continue;
        const bikeLabel = [b.make, b.model, b.year].filter(Boolean).join(" ");
        if (!bikeLabel) continue;
        const bike: ClientBike = { id: b.id, engine_hours: b.engine_hours, label: bikeLabel, make: b.make, model: b.model, year: b.year, vin: b.vin };
        const existing = merged.find(m => m.phone === phone);
        if (existing) {
          if (!existing.bikes.some(bk => bk.id === b.id)) existing.bikes.push(bike);
        } else {
          seen.add(phone);
          merged.push({ name: b.client_name || "", phone, email: b.client_email, bikes: [bike] });
        }
      }
      // Enquiry history (deduplicated)
      for (const e of (enqContacts || []) as { customer_name: string; phone: string; email: string | null }[]) {
        const phone = (e.phone || "").trim();
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        merged.push({ name: e.customer_name, phone, email: e.email, bikes: [] });
      }
      setClientList(merged);
      const [{ data: partsData }, { data: movementsData }, { data: spData }, { data: spiData }, { data: appData }] = await Promise.all([
        supabase.from("parts").select("*").eq("active", true).order("name"),
        supabase.from("stock_movements").select("id, part_id, quantity, reason, enquiry_id, service_product_application_id, cost_price_snapshot, sell_price_snapshot, created_at"),
        supabase.from("service_products").select("*").eq("active", true).order("name"),
        supabase.from("service_product_items").select("*"),
        supabase.from("service_product_applications").select("*"),
      ]);
      setParts((partsData as Part[]) || []);
      setMovements((movementsData as StockMovement[]) || []);
      setServiceProducts((spData as ServiceProduct[]) || []);
      setProductItems((spiData as ServiceProductItem[]) || []);
      setApplications((appData as ServiceProductApplication[]) || []);
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
      vin: row.vin || null,
      storage_start_date: row.storage_start_date || null,
      storage_end_date: row.storage_end_date || null,
      bike_category: row.bike_category || null,
      storage_term: row.storage_term || null,
      preferred_date: row.preferred_date || null,
      job_status: row.job_status || null,
      labour_hours: row.labour_hours ?? null,
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
      if (row.lesson_group_id) {
        const members = rows.map(r => (r.id === row.id ? row : r)).filter(r => r.lesson_group_id === row.lesson_group_id);
        for (const seq of new Set((row.sessions || []).map(x => x.seq))) syncGroupLesson(members, seq);
      } else for (const ss of row.sessions || []) {
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
    if (row.lesson_group_id) {
      const members = rows.filter(r => r.lesson_group_id === row.lesson_group_id).map(r => ({ ...r, assigned_to: assigned }));
      await supabase.from("enquiries").update({ assigned_to: assigned }).in("id", members.map(m => m.id));
      members.forEach(m => edit(m.id, { assigned_to: assigned }));
      for (const seq of new Set(members.flatMap(m => (m.sessions || []).map(x => x.seq)))) syncGroupLesson(members, seq);
    } else {
      await supabase.from("enquiries").update({ assigned_to: assigned }).eq("id", row.id);
      edit(row.id, { assigned_to: assigned });
      // Re-sync this booking's sessions so the calendar's "Assigned to" reflects
      // the new staff member right away. Other bookings are untouched — each
      // one is assigned independently now, even for the same customer.
      for (const ss of row.sessions || []) {
        syncSessionToCalendar({ ...row, assigned_to: assigned }, ss);
      }
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
  async function callCalendar(row: Enquiry, ss: Session, group?: { name: string; phone: string }[]): Promise<{ ok: boolean; id: string | null }> {
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
            ...(group && group.length > 1 ? { group } : {}),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Could not sync this session to the calendar.", "err"); return { ok: false, id: null }; }
      return { ok: true, id: (data.google_event_id ?? null) as string | null };
    } catch {
      showToast("Could not reach the calendar service.", "err");
      return { ok: false, id: null };
    }
  }

  async function saveEventId(row: Enquiry, ss: Session, id: string | null) {
    if (id === ss.google_event_id) return;
    editSessionLocal(row.id, ss.id, { google_event_id: id });
    await supabase.from("sessions").update({ google_event_id: id }).eq("id", ss.id);
  }

  async function syncSessionToCalendar(row: Enquiry, ss: Session) {
    const res = await callCalendar(row, ss);
    if (res.ok) await saveEventId(row, ss, res.id);
  }

  // One shared calendar event per lesson (seq) of a lesson group: built from the
  // members whose session at that seq is active; deleted once when none are.
  async function syncGroupLesson(members: Enquiry[], seq: number) {
    const entries = members
      .map(m => ({ m, ss: (m.sessions || []).find(x => x.seq === seq) }))
      .filter((e): e is { m: Enquiry; ss: Session } => !!e.ss);
    if (entries.length === 0) return;
    const active = entries.filter(e => isActiveSession(e.ss) && e.m.stage !== "cancelled" && e.m.stage !== "lost");
    const holder = active.find(e => e.ss.google_event_id) || entries.find(e => e.ss.google_event_id);
    if (active.length === 0) {
      if (!holder) return;
      const res = await callCalendar(holder.m, { ...holder.ss, scheduled_at: null });
      if (res.ok) for (const e of entries) await saveEventId(e.m, e.ss, null);
      return;
    }
    const lead = active.find(e => e.ss.google_event_id) || active[0];
    const group = active.map(e => ({ name: e.m.customer_name, phone: e.m.phone }));
    const res = await callCalendar(lead.m, { ...lead.ss, google_event_id: holder?.ss.google_event_id ?? null }, group);
    if (res.ok) for (const e of entries) await saveEventId(e.m, e.ss, res.id);
  }

  function addSessionLocal(enqId: string, session: Session) {
    setRows(prev => prev.map(r => (r.id === enqId ? { ...r, sessions: [...(r.sessions || []), session] } : r)));
  }

  // Applies a patch to the same-seq session of a group member, creating it if missing.
  async function mirrorToRow(target: Enquiry, seq: number, patch: SessPatch): Promise<Enquiry> {
    const cur = (target.sessions || []).find(x => x.seq === seq);
    if (cur) {
      if (Object.keys(patch).length === 0) return target;
      await persistSession(cur.id, patch);
      editSessionLocal(target.id, cur.id, patch);
      return { ...target, sessions: target.sessions.map(x => (x.id === cur.id ? { ...x, ...patch } : x)) };
    }
    if ((target.sessions || []).length >= target.sessions_total) return target;
    const { data, error } = await supabase.from("sessions").insert({
      enquiry_id: target.id,
      seq,
      status: patch.status ?? "scheduled",
      scheduled_at: patch.scheduled_at ?? null,
      ...(patch.duration_minutes != null ? { duration_minutes: patch.duration_minutes } : {}),
    }).select().single();
    if (error || !data) { showToast(error?.message || `Could not add lesson ${seq} for ${target.customer_name}.`, "err"); return target; }
    addSessionLocal(target.id, data as Session);
    return { ...target, sessions: [...(target.sessions || []), data as Session] };
  }

  // Mirrors a session edit on a grouped row to the other members, then syncs the lesson's event once.
  async function mirrorGroupSessions(row: Enquiry, ss: Session, patch: SessPatch) {
    const gid = row.lesson_group_id;
    if (!gid) return;
    const src = { ...row, sessions: (row.sessions || []).map(x => (x.id === ss.id ? { ...x, ...patch } : x)) };
    const updated: Enquiry[] = [];
    for (const o of rows.filter(r => r.lesson_group_id === gid && r.id !== row.id)) {
      updated.push(await mirrorToRow(o, ss.seq, patch));
    }
    await syncGroupLesson([src, ...updated], ss.seq);
  }

  // After the shared id is cleared: one member keeps each lesson's event, the rest get their own.
  async function splitLessonEvents(members: Enquiry[]) {
    const seqs = new Set(members.flatMap(m => (m.sessions || []).map(x => x.seq)));
    for (const seq of seqs) {
      let kept = false;
      for (const m of members) {
        const ss = (m.sessions || []).find(x => x.seq === seq);
        if (!ss) continue;
        if (isActiveSession(ss) && m.stage !== "cancelled" && m.stage !== "lost") {
          const res = await callCalendar(m, kept ? { ...ss, google_event_id: null } : ss);
          kept = true;
          if (res.ok) await saveEventId(m, ss, res.id);
        } else if (ss.google_event_id) {
          await saveEventId(m, ss, null);
        }
      }
    }
  }

  async function ungroupLesson(gid: string) {
    const members = rows.filter(r => r.lesson_group_id === gid);
    if (members.length === 0) return;
    const { error } = await supabase.from("enquiries").update({ lesson_group_id: null }).in("id", members.map(m => m.id));
    if (error) { showToast(error.message || "Could not ungroup.", "err"); return; }
    members.forEach(m => edit(m.id, { lesson_group_id: null }));
    await splitLessonEvents(members.map(m => ({ ...m, lesson_group_id: null })));
    showToast("Group lesson ungrouped.");
  }

  async function removeFromGroup(row: Enquiry) {
    const gid = row.lesson_group_id;
    if (!gid) return;
    const others = rows.filter(r => r.lesson_group_id === gid && r.id !== row.id);
    if (others.length <= 1) { await ungroupLesson(gid); return; }
    const { error } = await supabase.from("enquiries").update({ lesson_group_id: null }).eq("id", row.id);
    if (error) { showToast(error.message || "Could not remove from group.", "err"); return; }
    edit(row.id, { lesson_group_id: null });
    const solo = { ...row, lesson_group_id: null };
    for (const ss of row.sessions || []) {
      const othersHave = others.some(o => (o.sessions || []).some(x => x.seq === ss.seq));
      if (othersHave) await syncGroupLesson(others, ss.seq);
      if (isActiveSession(ss) && row.stage !== "cancelled" && row.stage !== "lost") {
        const res = await callCalendar(solo, othersHave ? { ...ss, google_event_id: null } : ss);
        if (res.ok) await saveEventId(solo, ss, res.id);
      } else if (othersHave && ss.google_event_id) {
        await saveEventId(solo, ss, null);
      }
    }
    showToast(`${row.customer_name} removed from the group lesson.`);
  }

  async function applyLessonGrouping() {
    const picked = selectedIds.map(id => rows.find(r => r.id === id)).filter((r): r is Enquiry => !!r);
    if (picked.length < 2) return;
    setGroupBusy(true);
    const gid = crypto.randomUUID();
    const assigned = groupInstructor || null;
    const { error } = await supabase.from("enquiries").update({ lesson_group_id: gid, assigned_to: assigned }).in("id", picked.map(r => r.id));
    if (error) { showToast(error.message || "Could not group these bookings.", "err"); setGroupBusy(false); return; }
    picked.forEach(r => edit(r.id, { lesson_group_id: gid, assigned_to: assigned }));
    const work: Enquiry[] = picked.map(r => ({ ...r, lesson_group_id: gid, assigned_to: assigned }));
    // Followers' old individual events are removed; the shared event replaces them.
    for (let i = 1; i < work.length; i++) {
      for (const ss of work[i].sessions || []) {
        if (!ss.google_event_id) continue;
        await callCalendar(work[i], { ...ss, scheduled_at: null });
        await saveEventId(work[i], ss, null);
      }
      work[i] = { ...work[i], sessions: (work[i].sessions || []).map(x => ({ ...x, google_event_id: null })) };
    }
    for (const ls of work[0].sessions || []) {
      const patch: SessPatch = { scheduled_at: ls.scheduled_at, status: ls.status, ...(ls.duration_minutes != null ? { duration_minutes: ls.duration_minutes } : {}) };
      for (let i = 1; i < work.length; i++) work[i] = await mirrorToRow(work[i], ls.seq, patch);
    }
    for (const seq of new Set(work.flatMap(m => (m.sessions || []).map(x => x.seq)))) await syncGroupLesson(work, seq);
    setSelectMode(false); setSelectedIds([]); setGroupPanelOpen(false); setGroupBusy(false); setGroupPkgConfirmed(false);
    showToast(`${work.length} bookings grouped into one lesson.`);
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
    if (row.service_type === "motorcycle_storage" || row.service_type === "workshop") return; // neither uses sessions anymore
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
    if (row.lesson_group_id) {
      mirrorGroupSessions({ ...row, sessions: [...(row.sessions || []), newSession] }, newSession, newSession.scheduled_at ? { scheduled_at: newSession.scheduled_at } : {});
    } else syncSessionToCalendar(row, newSession);
    if (newSession.scheduled_at) {
      sendStaffWhatsApp(row.assigned_to, name =>
        `Hi ${name}, your ${row.service_type.replace("_", " ")} booking with ${row.customer_name} is set for ${formatSessionTime(newSession.scheduled_at as string)}.`);
    }
  }

  // Recomputes parts + products + labour for a workshop job and writes the
  // total straight to estimated_value — the field Create invoice reads —
  // so the parts/product pickers and the labour hours adjuster always keep
  // the estimate current instead of relying on a separate manual roll-up.
  async function syncWorkshopEstimate(
    row: Enquiry,
    opts?: { movements?: StockMovement[]; applications?: ServiceProductApplication[]; labourHours?: number | null }
  ) {
    const mv = opts?.movements ?? movements;
    const apps = opts?.applications ?? applications;
    const hasHours = !!opts && "labourHours" in opts;
    const hours = hasHours ? opts!.labourHours ?? null : row.labour_hours;
    const partsSubtotal = partsUsedTotal(partsUsedFor(row.id, mv));
    const productsSubtotal = applicationsTotal(applicationsFor(row.id, apps));
    const labour = labourCharge(hours);
    const total = Math.round((partsSubtotal + productsSubtotal + labour) * 100) / 100;
    const patch: Record<string, unknown> = { estimated_value: total };
    if (hasHours) patch.labour_hours = hours;
    await supabase.from("enquiries").update(patch).eq("id", row.id);
    edit(row.id, hasHours ? { estimated_value: total, labour_hours: hours } : { estimated_value: total });
  }

  function setWorkshopLabourHours(row: Enquiry, hours: number | null) {
    syncWorkshopEstimate(row, { labourHours: hours });
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
    const newMovements = [...movements, data as StockMovement];
    setMovements(newMovements);
    await syncWorkshopEstimate(row, { movements: newMovements });
    setAddPartRowId(null);
    setAddPartSelection("");
    setAddPartQty("1");
    showToast(`Added ${qty} × ${part.name}.`);
  }

  // Applies a fixed-price product to a job: one application record at the
  // product's current price, then one stock movement per recipe part,
  // tagged with that application — so it shows as a single bundled line to
  // the customer, while the parts it actually used still come off the shelf.
  async function applyServiceProductToBooking(row: Enquiry) {
    const product = serviceProducts.find(sp => sp.id === applyProductSelection);
    if (!product) { showToast("Choose a service product first.", "err"); return; }

    const { data: appRow, error: appError } = await supabase.from("service_product_applications").insert({
      service_product_id: product.id,
      enquiry_id: row.id,
      name_snapshot: product.name,
      price_snapshot: product.price,
    }).select().single();
    if (appError || !appRow) { showToast(appError?.message || "Could not apply the product.", "err"); return; }
    const application = appRow as ServiceProductApplication;
    const newApplications = [...applications, application];
    setApplications(newApplications);

    const recipe = productItems.filter(i => i.service_product_id === product.id);
    let newMovements = movements;
    for (const item of recipe) {
      const part = parts.find(p => p.id === item.part_id);
      if (!part) continue;
      const { data: movRow } = await supabase.from("stock_movements").insert({
        part_id: part.id,
        quantity: -item.quantity,
        reason: "used",
        enquiry_id: row.id,
        service_product_application_id: application.id,
        cost_price_snapshot: part.cost_price,
        sell_price_snapshot: partSellPrice(part),
      }).select().single();
      if (movRow) newMovements = [...newMovements, movRow as StockMovement];
    }
    if (newMovements !== movements) setMovements(newMovements);
    await syncWorkshopEstimate(row, { movements: newMovements, applications: newApplications });

    setApplyProductRowId(null);
    setApplyProductSelection("");
    showToast(`Applied "${product.name}" — ${aed(product.price)}.`);
  }

  async function removePartFromBooking(row: Enquiry, partId: string, partName: string) {
    if (!window.confirm(`Remove "${partName}" from this job? The stock used will be returned to inventory.`)) return;
    const { error } = await supabase.from("stock_movements").delete()
      .eq("enquiry_id", row.id).eq("part_id", partId).eq("reason", "used").is("service_product_application_id", null);
    if (error) { showToast(error.message || "Could not remove the part.", "err"); return; }
    const newMovements = movements.filter(m => !(m.enquiry_id === row.id && m.part_id === partId && m.reason === "used" && !m.service_product_application_id));
    setMovements(newMovements);
    await syncWorkshopEstimate(row, { movements: newMovements });
    showToast(`"${partName}" removed.`);
  }

  async function removeServiceProduct(app: ServiceProductApplication) {
    if (!window.confirm(`Remove "${app.name_snapshot}" from this job? This will also restore any stock decremented by the product recipe.`)) return;
    const row = rows.find(r => r.id === app.enquiry_id);
    // Delete the stock movements that belong to this application (restores inventory)
    await supabase.from("stock_movements").delete().eq("service_product_application_id", app.id);
    const newMovements = movements.filter(m => m.service_product_application_id !== app.id);
    setMovements(newMovements);
    // Delete the application itself
    await supabase.from("service_product_applications").delete().eq("id", app.id);
    const newApplications = applications.filter(a => a.id !== app.id);
    setApplications(newApplications);
    if (row) await syncWorkshopEstimate(row, { movements: newMovements, applications: newApplications });
    showToast(`"${app.name_snapshot}" removed.`);
  }

  // Marks a workshop job ready for the mechanic's dedicated queue. Requires
  // an assignment first — there's no point pushing a job nobody's been told
  // is theirs. Also pings them directly, reusing the existing WhatsApp flow.
  async function pushToWorkshop(row: Enquiry) {
    if (!row.assigned_to) { showToast("Assign a mechanic before pushing to the workshop.", "err"); return; }
    await supabase.from("enquiries").update({ job_status: "queued" }).eq("id", row.id);
    edit(row.id, { job_status: "queued" });
    showToast("Pushed to the workshop queue.");
    sendStaffWhatsApp(row.assigned_to, name =>
      `Hi ${name}, a new workshop job is ready for you: ${row.customer_name}'s ${row.bike_details || "bike"}.`);
  }

  async function createPaymentLink(row: Enquiry) {
    const amount = Number(row.estimated_value) || 0;
    if (amount < 2) { showToast("Set an estimated value of at least AED 2 before creating a payment link.", "err"); return; }
    setLinkBusy(row.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch("/api/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
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

  // Combined actions for a multi-bike storage batch or workshop job
  // (see displayGroups below) — mirror the single-row versions above but
  // apply to every member row at once.
  async function markGroupPaid(groupRows: Enquiry[]) {
    const paid_at = new Date().toISOString();
    for (const row of groupRows) {
      if (row.paid_at) continue;
      await supabase.from("enquiries").update({ paid_at }).eq("id", row.id);
      edit(row.id, { paid_at });
    }
  }

  function buildGroupMessage(groupRows: Enquiry[]): string {
    const first = groupRows[0];
    const total = groupRows.reduce((sum, r) => sum + (Number(r.estimated_value) || 0), 0);
    const isWorkshop = first.service_type === "workshop";
    const lines = groupRows.map(r => `- ${r.bike_details || "Bike"}${isWorkshop && r.work_required ? ` (${r.work_required})` : ""}: ${aed(r.estimated_value)}`).join("\n");
    const linkLine = first.payment_link ? `\n\nPay securely: ${first.payment_link}` : "";
    return `Hi ${first.customer_name}, here's your Garage51 ${isWorkshop ? "workshop job" : "storage booking"} summary:\n\n${lines}\n\nTotal: ${aed(total)}${linkLine}`;
  }

  function messageGroup(groupRows: Enquiry[]) {
    const first = groupRows[0];
    if (!first?.phone) return;
    window.open(`https://wa.me/${waNumber(first.phone)}?text=${encodeURIComponent(buildGroupMessage(groupRows))}`, "_blank");
  }

  // Used inside the payment-link submenu, once a combined link exists —
  // mirrors whatsappLink(row) above, but for the group as a whole.
  function groupWhatsappLink(groupRows: Enquiry[]): string {
    const first = groupRows[0];
    return `https://wa.me/${waNumber(first?.phone || "")}?text=${encodeURIComponent(buildGroupMessage(groupRows))}`;
  }

  async function markGroupLinkSent(groupRows: Enquiry[]) {
    const now = new Date().toISOString();
    for (const row of groupRows) {
      await supabase.from("enquiries").update({ payment_link_sent_at: now }).eq("id", row.id);
      edit(row.id, { payment_link_sent_at: now });
    }
  }

  async function createCombinedPaymentLink(groupRows: Enquiry[]) {
    const first = groupRows[0];
    if (!first) return;
    const total = groupRows.reduce((sum, r) => sum + (Number(r.estimated_value) || 0), 0);
    if (total < 2) { showToast("Set an estimated value of at least AED 2 before creating a payment link.", "err"); return; }
    setLinkBusy(first.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch("/api/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ amount: total, message: `Garage51 - ${first.customer_name} (${groupRows.length} bikes)` }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) { showToast(data.error || "Could not create the payment link.", "err"); return; }
      for (const row of groupRows) {
        await supabase.from("enquiries").update({ payment_link: data.url, payment_intent_id: data.id, payment_link_sent_at: null }).eq("id", row.id);
        edit(row.id, { payment_link: data.url, payment_intent_id: data.id, payment_link_sent_at: null });
      }
      copyLink(data.url);
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
  // A storage-bike job's service log row is written when the workshop completes
  // it; once it's invoiced, stamp the invoice on that log (no-op if none yet).
  async function stampInvoiceOnServiceLog(row: Enquiry, invoiceNumber: string) {
    if (!row.storage_bike_id) return;
    await supabase.from("sb_service_log")
      .update({ invoice_ref: invoiceNumber, amount_charged: Number(row.estimated_value) || null })
      .eq("enquiry_id", row.id);
  }

  async function createZohoInvoiceForBooking(row: Enquiry) {
    setZohoBusy(row.id);
    try {
      const { data: { session: zohoSession } } = await supabase.auth.getSession();
      const zohoAuthHeader: Record<string, string> = zohoSession?.access_token
        ? { Authorization: `Bearer ${zohoSession.access_token}` } : {};
      const res = await fetch("/api/zoho/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...zohoAuthHeader },
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

      await stampInvoiceOnServiceLog(row, data.zoho_invoice_number);

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

  // One invoice covering every bike in a grouped multi-bike storage batch,
  // instead of a separate invoice per bike — mirrors createCombinedRenewalInvoice
  // in storage-bikes/page.tsx, which the /api/zoho/create-invoice route's
  // line_items form was originally built for.
  async function createCombinedInvoiceForGroup(groupRows: Enquiry[]) {
    const first = groupRows[0];
    if (!first) return;
    setZohoBusy(first.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {};
      const isWorkshop = first.service_type === "workshop";
      const lineItems = groupRows.map(r => ({
        name: isWorkshop ? "Workshop Service" : "Motorcycle Storage",
        description: isWorkshop
          ? [r.bike_details || "Bike", r.work_required].filter(Boolean).join(" — ")
          : r.bike_details || "Bike",
        rate: Number(r.estimated_value) || 0,
      }));
      const res = await fetch("/api/zoho/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          zoho_contact_id: first.client?.zoho_contact_id || null,
          customer_name: first.customer_name,
          email: first.email,
          phone: first.phone,
          line_items: lineItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Could not create the Zoho invoice.", "err"); return; }

      for (const row of groupRows) {
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
        await stampInvoiceOnServiceLog(row, data.zoho_invoice_number);
      }

      if (first.client?.id && data.zoho_contact_id && first.client.zoho_contact_id !== data.zoho_contact_id) {
        await supabase.from("clients").update({ zoho_contact_id: data.zoho_contact_id }).eq("id", first.client.id);
        const clientId = first.client.id;
        setRows(prev => prev.map(r =>
          r.client?.id === clientId ? { ...r, client: { ...(r.client as ClientLite), zoho_contact_id: data.zoho_contact_id } } : r));
      }

      showToast(`Invoice ${data.zoho_invoice_number} created for ${groupRows.length} bikes in Zoho Books.`);
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
  function whatsappLink(row: Enquiry) {
    const service = cap(row.service_type.replace("_", " "));
    const msg = `Hi ${row.customer_name}, here's your Garage51 ${service} booking payment link for ${aed(row.estimated_value)}: ${row.payment_link}`;
    return `https://wa.me/${waNumber(row.phone)}?text=${encodeURIComponent(msg)}`;
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

  async function createLessonGroup() {
    const clients = lg.clients.map(c => ({ ...c, name: c.name.trim(), phone: c.phone.trim() }));
    if (clients.length < 2 || clients.some(c => !c.name || !c.phone)) { setAddError("Add at least 2 clients, each with a name and phone."); return; }
    setCreating(true); setAddError("");
    const total = lg.type === "single" ? 1 : Math.max(1, Number(lg.sessions) || 4);
    const gid = crypto.randomUUID();
    const startIso = localInputToIso(lg.start);
    const instructor = lg.instructor || (!me?.roles?.includes("admin") ? me?.id || null : null);
    const created: Enquiry[] = [];
    let failure = "";
    // Sequential (not Promise.all) so a partial failure is easy to report.
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const { data, error } = await supabase.from("enquiries").insert({
        customer_name: c.name,
        phone: c.phone,
        email: c.email.trim() || null,
        service_type: "academy",
        source: form.source,
        stage: form.stage,
        estimated_value: Number(c.price) || 0,
        sessions_total: total,
        booking_at: startIso,
        preferred_date: null,
        selection: lg.type === "single" ? "Group lesson" : "Group package",
        notes: form.notes || "",
        assigned_to: instructor,
        lesson_group_id: gid,
      }).select("*, sessions(*)").single();
      if (error || !data) {
        failure = error?.message ? `Client ${i + 1} of ${clients.length}: ${error.message}` : `Could not create booking for client ${i + 1} of ${clients.length}.`;
        break;
      }
      created.push(data as Enquiry);
    }
    let members = created;
    if (startIso && created.length > 0) {
      members = [];
      for (const enq of created) {
        const { data: ses } = await supabase.from("sessions")
          .insert({ enquiry_id: enq.id, seq: 1, status: "scheduled", scheduled_at: startIso })
          .select().single();
        members.push(ses ? { ...enq, sessions: [...(enq.sessions || []), ses as Session] } : enq);
      }
    }
    if (members.length > 0) setRows(prev => [...members, ...prev]);
    if (startIso && members.length > 0) await syncGroupLesson(members, 1);
    setCreating(false);
    if (failure) {
      setAddError(created.length > 0 ? `${failure} (${created.length} already created — remove them from the list before retrying)` : failure);
      return;
    }
    setForm({ ...BLANK });
    setLg(newLg());
    setClientSearch("");
    setClientBikes([]);
    setAdding(false);
    showToast(`Group lesson created for ${created.length} clients.`);
  }

  async function createEnquiry() {
    if (form.service_type === "academy" && lg.on) { await createLessonGroup(); return; }
    if (!form.customer_name.trim() || !form.phone.trim()) { setAddError("Name and phone are required."); return; }
    setCreating(true); setAddError("");
    const isStorage = form.service_type === "motorcycle_storage";
    const isWorkshop = form.service_type === "workshop";
    const sessionsTotal = Math.max(1, Number(form.sessions_total) || 1);
    if (isStorage) {
      // One or more bikes for the same client/term/dates — insert sequentially
      // (not Promise.all) so a partial failure is easy to reason about and report.
      const created: Enquiry[] = [];
      for (let i = 0; i < form.storageBikes.length; i++) {
        const bike = form.storageBikes[i];
        const { data, error } = await supabase.from("enquiries").insert({
          customer_name: form.customer_name,
          phone: form.phone,
          email: form.email || null,
          service_type: form.service_type,
          source: form.source,
          stage: form.stage,
          estimated_value: Number(bike.estimatedValue) || 0,
          sessions_total: sessionsTotal,
          booking_at: null,
          preferred_date: null,
          storage_start_date: form.storage_start_date || null,
          storage_end_date: form.storage_end_date || null,
          bike_category: bike.category,
          storage_term: form.storage_term,
          bike_details: bike.details || null,
          notes: form.notes || "",
          assigned_to: !me?.roles?.includes("admin") ? me?.id || null : null,
        }).select("*, sessions(*)").single();
        if (error || !data) {
          setCreating(false);
          if (created.length > 0) setRows(prev => [...created, ...prev]);
          setAddError(error?.message
            ? `Bike ${i + 1} of ${form.storageBikes.length}: ${error.message}`
            : `Could not create booking for bike ${i + 1} of ${form.storageBikes.length}.`);
          return;
        }
        created.push(data as Enquiry);
      }

      // A storage booking only puts the client in the sales pipeline as an
      // enquiry — the storage-bikes page tracks physical bikes separately,
      // from its own storage_bikes table. Without this, a bike booked here
      // never shows up there at all. Best-effort: the booking above already
      // succeeded, so a failure here is reported but doesn't roll it back.
      const bikeSyncFailures: string[] = [];
      for (let i = 0; i < created.length; i++) {
        const enq = created[i];
        const bike = form.storageBikes[i];
        const { error: sbError } = await supabase.from("storage_bikes").insert({
          name: `${form.customer_name} — ${bike?.details || "bike"}`,
          enquiry_id: enq.id,
          storage_start_date: form.storage_start_date || null,
          storage_end_date: form.storage_end_date || null,
          client_name: form.customer_name,
          client_phone: form.phone,
          client_email: form.email || null,
          monthly_rate: storageMonthlyRate(bike?.category || "adult", form.storage_term),
        });
        if (sbError) bikeSyncFailures.push(bike?.details || `bike ${i + 1}`);
      }

      setCreating(false);
      setRows(prev => [...created, ...prev]);
      setForm({ ...BLANK });
      setClientSearch("");
      setClientBikes([]);
      setAdding(false);
      if (bikeSyncFailures.length > 0) {
        showToast(`Booking created, but couldn't add ${bikeSyncFailures.join(", ")} to the storage-bikes list — add manually there.`, "err");
      } else {
        showToast(created.length > 1
          ? `${created.length} bookings created for ${form.customer_name}.`
          : `Booking created for ${form.customer_name}.`);
      }
      return;
    }
    const { data, error } = await supabase.from("enquiries").insert({
      customer_name: form.customer_name,
      phone: form.phone,
      email: form.email || null,
      service_type: form.service_type,
      source: form.source,
      stage: form.stage,
      estimated_value: Number(form.estimated_value) || 0,
      sessions_total: sessionsTotal,
      booking_at: (isStorage || isWorkshop) ? null : (form.booking_at || null),
      preferred_date: isWorkshop ? (form.preferred_date || null) : null,
      storage_start_date: isStorage ? (form.storage_start_date || null) : null,
      storage_end_date: isStorage ? (form.storage_end_date || null) : null,
      bike_category: isStorage ? form.bike_category : null,
      storage_term: isStorage ? form.storage_term : null,
      notes: form.notes || "",
      // Non-admins are auto-assigned to themselves so the booking immediately
      // appears in their filtered view — a coach creating a booking for their
      // own student shouldn't have to manually assign it to themselves.
      assigned_to: !me?.roles?.includes("admin") ? me?.id || null : null,
    }).select("*, sessions(*)").single();
    if (error || !data) { setCreating(false); setAddError(error?.message || "Could not create booking."); return; }
    const enq = data as Enquiry;
    if (!isStorage && !isWorkshop && form.booking_at) {
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
    setClientSearch("");
    setClientBikes([]);
    setAdding(false);
    showToast(`Booking created for ${form.customer_name}.`);
  }

  function exportCsv() {
    const data = me?.roles?.includes("admin") ? rows : rows.filter(r => r.assigned_to === me?.id);
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

  // Storage Bikes hands off here (?ws_bike=…&ws_item=…&ws_work=…&ws_amount=…) to start a workshop job for a bike.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const bike = q.get("ws_bike");
    if (bike && !wsDeepLink.current) {
      wsDeepLink.current = { bike, item: q.get("ws_item"), work: q.get("ws_work") || "", amount: q.get("ws_amount") || "" };
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  useEffect(() => {
    const link = wsDeepLink.current;
    if (!link || clientList.length === 0) return;
    const client = clientList.find(c => c.bikes.some(b => b.id === link.bike));
    wsDeepLink.current = null;
    if (!client) { showToast("Couldn't find that bike's client — start the intake manually.", "err"); return; }
    setWsForm(f => ({ ...f, client: client.name, phone: client.phone, email: client.email || "", make: "", model: "", year: "", vin: "", work: link.work, amount: link.amount }));
    setWsClientSearch(client.name);
    setWsClientBikes(client.bikes);
    setWsPicked([link.bike]);
    setWsOther(false);
    setWsOverrides({});
    setWsItem(link.item ? { bikeId: link.bike, itemId: link.item } : null);
    setWsOpen(true);
  }, [clientList]);

  if (!ready) return <main style={s.loading}>Loading…</main>;

  // One entry per ticked on-file bike, plus the manual "other" bike (or the only bike when none are on file).
  type WsEntry = { key: string; bikeId: string | null; make: string; model: string; year: string; vin: string; work: string; amount: string };
  function wsEntries(): WsEntry[] {
    const entries: WsEntry[] = [];
    for (const bike of wsClientBikes) {
      if (!bike.id || !wsPicked.includes(bike.id)) continue;
      const o = wsOverrides[bike.id] || {};
      entries.push({ key: bike.id, bikeId: bike.id, make: bike.make || "", model: bike.model || "", year: bike.year || "", vin: bike.vin || "", work: o.work ?? wsForm.work, amount: o.amount ?? wsForm.amount });
    }
    if (wsClientBikes.length === 0 || wsOther) {
      const o = wsOverrides["__other"] || {};
      entries.push({ key: "__other", bikeId: null, make: wsForm.make, model: wsForm.model, year: wsForm.year, vin: wsForm.vin, work: o.work ?? wsForm.work, amount: o.amount ?? wsForm.amount });
    }
    return entries;
  }

  async function createWorkshopIntake() {
    if (!wsForm.client.trim() || !wsForm.phone.trim()) { showToast("Client name and phone are required.", "err"); return; }
    const entries = wsEntries();
    if (entries.length === 0) { showToast("Tick at least one bike.", "err"); return; }
    if (entries.some(en => !en.work.trim())) { showToast("Work required field is empty.", "err"); return; }
    setCreatingWs(true);
    const jobGroupId = entries.length > 1 ? crypto.randomUUID() : null;
    // Sequential (not Promise.all) so a partial failure is easy to report.
    const created: Enquiry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const en = entries[i];
      const bikeDetails = [en.make, en.model, en.year].filter(Boolean).join(" ");
      const { data, error } = await supabase.from("enquiries").insert({
        service_type: "workshop",
        customer_name: wsForm.client.trim(),
        phone: wsForm.phone.trim(),
        email: wsForm.email.trim() || null,
        bike_details: bikeDetails || null,
        vin: en.vin.trim() || null,
        work_required: en.work.trim(),
        assigned_to: wsForm.assignedTo || null,
        estimated_value: Number(en.amount) || 0,
        preferred_date: wsForm.date || null,
        stage: "booked",
        job_status: "queued",
        source: "internal",
        notes: "",
        sessions_total: 0,
        storage_bike_id: en.bikeId,
        job_group_id: jobGroupId,
        service_item_id: en.bikeId && wsItem?.bikeId === en.bikeId ? wsItem.itemId : null,
      }).select("*, sessions(*), client:clients(id,name,whatsapp,zoho_contact_id)").single();
      if (error || !data) {
        setCreatingWs(false);
        if (created.length > 0) {
          setRows(prev => [...created, ...prev]);
          // Untick what was created so a retry only submits the remainder.
          const done = entries.slice(0, created.length);
          setWsPicked(prev => prev.filter(id => !done.some(d => d.bikeId === id)));
          if (done.some(d => d.bikeId === null)) setWsOther(false);
        }
        showToast(error?.message
          ? `Bike ${i + 1} of ${entries.length}: ${error.message}${created.length > 0 ? ` (${created.length} already created)` : ""}`
          : `Could not create workshop job for bike ${i + 1} of ${entries.length}.`, "err");
        return;
      }
      created.push(data as Enquiry);
      // Point the storage bike at its active job so the Storage Bikes page shows it (only if the bike has no job in flight).
      if (en.bikeId) {
        await supabase.from("storage_bikes")
          .update({ service_enquiry_id: (data as Enquiry).id, service_completed_at: null })
          .eq("id", en.bikeId)
          .or("service_enquiry_id.is.null,service_completed_at.not.is.null");
      }
    }
    setRows(prev => [...created, ...prev]);
    setWsItem(null);
    setWsForm({ client: "", phone: "", email: "", make: "", model: "", year: "", vin: "", work: "", assignedTo: "", amount: "", date: "" });
    setWsClientSearch("");
    setWsClientBikes([]);
    setWsPicked([]);
    setWsOther(false);
    setWsOverrides({});
    setWsOpen(false);
    setCreatingWs(false);
    showToast(created.length > 1
      ? `${created.length} workshop jobs created — ${wsForm.client.trim()} added to queue.`
      : `Workshop job created — ${wsForm.client.trim()} added to queue.`);
  }

  const scoped = me?.roles?.includes("admin") ? rows : rows.filter(r => r.assigned_to === me?.id);

  const pipeline = scoped.filter(r => ["new", "contacted"].includes(r.stage)).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const booked = scoped.filter(r => r.stage === "booked" && !r.paid_at).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const earned = scoped.filter(r => !!r.paid_at).reduce((a, r) => a + (r.estimated_value || 0), 0);

  const matches = (r: Enquiry, f: string) => {
    if (f === "all") return true;
    if (f === "needs_payment") return r.stage === "booked" && !r.paid_at;
    if (f === "sent") return !!r.payment_link;
    if (f === "conflict") return bookingHasConflict(rows, r);
    if (f === "storage_due") return storageRenewalStatus(r) !== null;
    if (f === "workshop" || f === "academy" || f === "desert_tour") return r.service_type === f;
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

  // Cluster rows created together as one multi-bike storage batch (shared
  // phone + identical storage dates) so they render as one card with
  // combined actions instead of N identical-looking cards. Anything else —
  // every other service type, and storage bookings that don't share this
  // signature — renders exactly as before, one row per entry.
  // Workshop rows created together in one multi-bike intake share a job_group_id.
  const storageGroupKey = (r: Enquiry): string | null =>
    r.service_type === "academy" && r.lesson_group_id
      ? `lesson:${r.lesson_group_id}`
      : r.service_type === "motorcycle_storage" && r.storage_start_date && r.storage_end_date
      ? `${r.phone}|${r.storage_start_date}|${r.storage_end_date}`
      : r.service_type === "workshop" && r.job_group_id
        ? `job:${r.job_group_id}`
        : null;
  const groupBuckets = new Map<string, Enquiry[]>();
  for (const r of visible) {
    const key = storageGroupKey(r);
    if (!key) continue;
    if (!groupBuckets.has(key)) groupBuckets.set(key, []);
    groupBuckets.get(key)!.push(r);
  }
  const emittedGroups = new Set<string>();
  type DisplayGroup = { key: string; kind: "single"; row: Enquiry } | { key: string; kind: "group"; rows: Enquiry[] };
  const displayGroups: DisplayGroup[] = [];
  for (const r of visible) {
    const key = storageGroupKey(r);
    const bucket = key ? groupBuckets.get(key) : undefined;
    if (!key || !bucket || bucket.length < 2) {
      displayGroups.push({ key: r.id, kind: "single", row: r });
      continue;
    }
    if (emittedGroups.has(key)) continue;
    emittedGroups.add(key);
    displayGroups.push({ key, kind: "group", rows: bucket });
  }

  const selectedRows = selectedIds.map(id => rows.find(r => r.id === id)).filter((r): r is Enquiry => !!r);
  const sameSize = selectedRows.length > 0 && selectedRows.every(r => r.sessions_total === selectedRows[0].sessions_total);
  const toggleSelected = (id: string) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const lgOn = form.service_type === "academy" && lg.on;
  const setLgClient = (i: number, patch: Partial<LgClient>) =>
    setLg(prev => ({ ...prev, clients: prev.clients.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));

  const currentLabel = FILTER_OPTS.find(o => o.key === filter)?.label ?? "All";
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));
  // Switching the create form's Service select needs special handling only
  // when landing on motorcycle storage: give it a fresh single-bike list
  // (rather than whatever was left over from a previous visit to this
  // service type — "switching away and back" should start clean).
  const setServiceType = (service_type: string) =>
    setForm(prev => prev.service_type === service_type ? prev : service_type === "motorcycle_storage"
      ? { ...prev, service_type, storageBikes: [{ category: "adult", details: "", estimatedValue: storageTotalPrice("adult", prev.storage_term) }] }
      : { ...prev, service_type });
  const setStorageTerm = (term: string) =>
    setForm(prev => {
      const storage_end_date = term !== "month_to_month" && prev.storage_start_date
        ? addMonths(prev.storage_start_date, storageTermMonths(term))
        : prev.storage_end_date;
      // The shared term drives every bike's price, not just one scalar.
      const storageBikes = prev.storageBikes.map(b => ({ ...b, estimatedValue: storageTotalPrice(b.category, term) }));
      return { ...prev, storage_term: term, storage_end_date, storageBikes };
    });
  const setStorageStartDate = (value: string) =>
    setForm(prev => {
      const storage_end_date = value && prev.storage_term !== "month_to_month"
        ? addMonths(value, storageTermMonths(prev.storage_term))
        : prev.storage_end_date;
      return { ...prev, storage_start_date: value, storage_end_date };
    });
  const setStorageBikeCategory = (i: number, category: string) =>
    setForm(prev => ({
      ...prev,
      storageBikes: prev.storageBikes.map((b, idx) => idx === i ? { ...b, category, estimatedValue: storageTotalPrice(category, prev.storage_term) } : b),
    }));
  const setStorageBikeDetails = (i: number, details: string) =>
    setForm(prev => ({ ...prev, storageBikes: prev.storageBikes.map((b, idx) => idx === i ? { ...b, details } : b) }));
  const setStorageBikeValue = (i: number, estimatedValue: number) =>
    setForm(prev => ({ ...prev, storageBikes: prev.storageBikes.map((b, idx) => idx === i ? { ...b, estimatedValue } : b) }));
  const addStorageBike = () =>
    setForm(prev => ({
      ...prev,
      storageBikes: [...prev.storageBikes, { category: "adult", details: "", estimatedValue: storageTotalPrice("adult", prev.storage_term) }],
    }));
  const removeStorageBike = (i: number) =>
    setForm(prev => ({
      ...prev,
      storageBikes: prev.storageBikes.length > 1 ? prev.storageBikes.filter((_, idx) => idx !== i) : prev.storageBikes,
    }));
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
  // Display-only priority when someone holds several roles — has no bearing
  // on access control, which always checks the full array.
  const roleColor = (roles?: string[]) =>
    (roles || []).includes("admin") ? RED : (roles || []).includes("mechanic") ? "#FFB02E" : "#3B9EFF";
  const initials = ((me?.name || myEmail || "?").trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("") || "?").toUpperCase();

  // Header for a grouped multi-bike storage batch (2+ rows sharing phone +
  // storage dates) — badge shows the least-settled state across the group
  // so a single unpaid bike still surfaces as needing attention.
  const renderGroupHeader = (groupKey: string, groupRows: Enquiry[]) => {
    const first = groupRows[0];
    const total = groupRows.reduce((sum, r) => sum + (Number(r.estimated_value) || 0), 0);
    const allPaid = groupRows.every(r => r.paid_at || r.stage === "paid");
    const statePriority = ["cancelled", "lost", "new", "contacted", "queued", "waiting parts", "in progress", "booked", "completed", "paid"];
    const worst = groupRows.map(bookingState).reduce((a, b) =>
      statePriority.indexOf(b) < statePriority.indexOf(a) ? b : a);
    const badgeLabel = allPaid ? "paid" : worst;
    const badgeColor = allPaid ? PAID_COLOR : (STATE_COLOR[worst] || "#9A938D");
    const isWorkshop = first.service_type === "workshop";
    const dateRange = !isWorkshop && first.storage_start_date && first.storage_end_date
      ? `${new Date(first.storage_start_date).toLocaleDateString()} – ${new Date(first.storage_end_date).toLocaleDateString()}`
      : "";
    const busy = linkBusy === first.id;
    if (groupKey.startsWith("lesson:")) {
      const members = rows.filter(r => r.lesson_group_id === first.lesson_group_id);
      const paidN = members.filter(r => r.paid_at || r.stage === "paid").length;
      const instructor = staff.find(p => p.id === first.assigned_to)?.name || "Unassigned";
      const next = nextLessonLabel(members);
      return (
        <div style={s.groupHeaderInner}>
          <div style={s.nameRow}>
            <span style={s.name}>Group lesson</span>
            <span style={{ ...s.pill, color: badgeColor, borderColor: badgeColor + "66", background: badgeColor + "1c" }}>{badgeLabel}</span>
          </div>
          <div style={s.sub}>
            {members.length} clients<span style={s.dotSep}>·</span>Instructor: {instructor}
            {next && <><span style={s.dotSep}>·</span>Next: {next}</>}
            <span style={s.dotSep}>·</span>{paidN}/{members.length} paid
          </div>
          <div style={s.quick}>
            <button onClick={() => ungroupLesson(first.lesson_group_id as string)} className="g51-btn" style={s.quickBtn}>Ungroup</button>
          </div>
        </div>
      );
    }
    return (
      <div style={s.groupHeaderInner}>
        <div style={s.nameRow}>
          <span style={s.name}>{first.customer_name}</span>
          <span style={{ ...s.pill, color: badgeColor, borderColor: badgeColor + "66", background: badgeColor + "1c" }}>{badgeLabel}</span>
          <span style={{ fontSize: 12, color: "#9A938D" }}>{groupRows.length} bikes</span>
        </div>
        <div style={s.sub}>
          {isWorkshop ? "Workshop job" : "Motorcycle storage"}
          {dateRange && <><span style={s.dotSep}>·</span>{dateRange}</>}
          <span style={s.dotSep}>·</span>Total {aed(total)}
        </div>
        <div style={s.quick}>
          <button onClick={() => markGroupPaid(groupRows)} className="g51-btn" style={s.quickBtn}>Mark all paid</button>
          <button onClick={() => messageGroup(groupRows)} className="g51-btn" style={s.quickBtn}>Message all</button>
          <div style={s.payWrap}>
            {!first.payment_link ? (
              <button onClick={() => createCombinedPaymentLink(groupRows)} disabled={busy} className="g51-btn" style={s.quickBtn}>
                {busy ? "Creating…" : "Combined payment link"}
              </button>
            ) : (
              <button onClick={() => setPayMenuId(payMenuId === groupKey ? null : groupKey)} className="g51-btn" style={s.quickBtn}>
                Combined payment link{first.payment_link_sent_at && <span style={s.sentTick}>✓</span>}
                <Chevron open={payMenuId === groupKey} />
              </button>
            )}
            {payMenuId === groupKey && first.payment_link && (
              <>
                <div style={s.overlay} onClick={() => setPayMenuId(null)} />
                <div className="g51-sheet" style={s.payMenu}>
                  {!first.payment_link_sent_at ? (
                    <a href={groupWhatsappLink(groupRows)} target="_blank" rel="noreferrer"
                      onClick={() => { markGroupLinkSent(groupRows); setPayMenuId(null); }}
                      className="g51-item" style={s.payItemWa}>Send link on WhatsApp</a>
                  ) : (
                    <div style={s.paySent}>Link sent {new Date(first.payment_link_sent_at).toLocaleDateString()}</div>
                  )}
                  <a href={first.payment_link} target="_blank" rel="noreferrer" onClick={() => setPayMenuId(null)} className="g51-item" style={s.payItem}>Open link</a>
                  <button onClick={() => { copyLink(first.payment_link!); setPayMenuId(null); }} className="g51-item" style={s.payItem}>Copy link</button>
                  <button onClick={() => { createCombinedPaymentLink(groupRows); setPayMenuId(null); }} disabled={busy} className="g51-item" style={s.payItem}>{busy ? "Generating…" : "Generate new link"}</button>
                </div>
              </>
            )}
          </div>
          {first.zoho_invoice_id ? (
            <a href={first.zoho_invoice_url || "#"} target="_blank" rel="noreferrer" className="g51-btn" style={s.quickBtn}>
              Invoice {first.zoho_invoice_number}<span style={s.sentTick}>✓</span>
            </a>
          ) : (
            <button onClick={() => createCombinedInvoiceForGroup(groupRows)} disabled={zohoBusy === first.id} className="g51-btn" style={s.quickBtn}>
              {zohoBusy === first.id ? "Creating…" : "Combined invoice"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        <div style={s.headerBar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
          <div style={s.profileWrap}>
            <button onClick={() => setProfileOpen(o => !o)} className="g51-btn g51-ghost" style={s.profileBtn} aria-label="Account">
              <span style={{ ...s.avatar, background: roleColor(me?.roles) }}>{initials}</span>
              <Chevron open={profileOpen} />
            </button>
            {profileOpen && (
              <>
                <div style={s.overlay} onClick={() => { setProfileOpen(false); setPwOpen(false); }} />
                <div className="g51-sheet" style={s.profileMenu}>
                  <div style={s.pmHead}>
                    <span style={{ ...s.avatarLg, background: roleColor(me?.roles) }}>{initials}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={s.pmName}>{me?.name || "Account"}</div>
                      <div style={s.pmEmail}>{myEmail}</div>
                      <span style={{ ...s.pmRole, color: roleColor(me?.roles), borderColor: roleColor(me?.roles) + "66", background: roleColor(me?.roles) + "1c" }}>{(me?.roles || []).join(" · ")}</span>
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
          <button onClick={() => { setAdding(a => !a); setAddError(""); if (wsOpen) setWsOpen(false); }} className="g61-btn g51-primary" style={s.primaryBtn}>+ New booking</button>
          <button onClick={() => { setWsOpen(o => !o); if (adding) { setAdding(false); } }}
            style={{ ...s.primaryBtn, background: "#993C1D22", border: "1px solid #993C1D66", color: "#D85A30" }}>
            + Workshop intake
          </button>
          <button onClick={exportCsv} className="g51-btn g51-ghost" style={s.ghostBtn}>Export</button>
          <AdminNav page="bookings" isAdmin={me?.roles?.includes("admin")} />
        </div>
      </header>

      <div style={s.bodyWrap}>
        <div style={s.stats}>
          <Stat label="In pipeline" sub="New + contacted" value={aed(pipeline)} color="#5BB0FF" />
          <Stat label="Booked" sub="Awaiting payment" value={aed(booked)} color="#A78BFA" />
          <Stat label="Earned" sub="Paid" value={aed(earned)} color="#2FBF71" />
        </div>

        {/* Workshop intake inline panel */}
        {wsOpen && (
          <div style={{ ...s.addPanel, borderColor: "#993C1D55", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ ...s.addTitle, color: "#D85A30", margin: 0 }}>Workshop intake</span>
              <button onClick={() => setWsOpen(false)} style={{ background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            {/* Client search */}
            <div style={{ marginBottom: 10, position: "relative" }}>
              <label style={s.ctrl}>
                <span style={s.ctrlLabel}>Search existing client</span>
                <input className="g51-input"
                  placeholder="Type name or phone…"
                  value={wsClientSearch}
                  onChange={e => { setWsClientSearch(e.target.value); setWsShowDrop(true); }}
                  onFocus={() => setWsShowDrop(true)}
                  onBlur={() => setTimeout(() => setWsShowDrop(false), 150)}
                  style={s.input} />
              </label>
              {wsShowDrop && wsClientSearch.trim().length > 0 && (() => {
                const q = wsClientSearch.toLowerCase();
                const matches = clientList.filter(c =>
                  c.name.toLowerCase().includes(q) || c.phone.includes(q)
                ).slice(0, 6);
                if (!matches.length) return null;
                return (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.5)", marginTop: 2 }}>
                    {matches.map(c => (
                      <button key={c.phone} onMouseDown={() => {
                        // Bikes on file are ticked in the picker below; a lone bike is pre-ticked.
                        setWsForm(f => ({
                          ...f, client: c.name, phone: c.phone, email: c.email || "",
                          ...(c.bikes.length > 0 ? { make: "", model: "", year: "", vin: "" } : {}),
                        }));
                        setWsClientBikes(c.bikes);
                        setWsPicked(c.bikes.length === 1 && c.bikes[0].id ? [c.bikes[0].id] : []);
                        setWsOther(false);
                        setWsOverrides({});
                        setWsClientSearch(c.name); setWsShowDrop(false);
                      }}
                        style={{ display: "flex", flexDirection: "column", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid #2A2623", padding: "9px 14px", cursor: "pointer", color: "#F4F2EF", fontFamily: "inherit" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name || "(no name)"}</span>
                        <span style={{ fontSize: 12, color: "#9A938D" }}>{c.phone}{c.bikes.length > 0 ? ` · ${c.bikes.map(b => b.label).join(", ")}` : ""}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Client details */}
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Client name *</span>
                <input className="g51-input" value={wsForm.client} onChange={e => setWsForm(f => ({ ...f, client: e.target.value }))} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Phone *</span>
                <input className="g51-input" value={wsForm.phone} onChange={e => setWsForm(f => ({ ...f, phone: e.target.value }))} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Email</span>
                <input className="g51-input" value={wsForm.email} onChange={e => setWsForm(f => ({ ...f, email: e.target.value }))} style={s.input} /></label>
            </div>

            {/* Multi-bike picker: tick one, some or all of the client's bikes on file */}
            {wsClientBikes.length > 0 && (
              <div style={{ marginBottom: 10, background: "#1B1816", border: "1px solid #D85A3044", borderRadius: 9, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: "#D85A30", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
                  Which bikes is this job for?
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {wsClientBikes.map(bike => {
                    const isSel = !!bike.id && wsPicked.includes(bike.id);
                    return (
                      <label key={bike.id || bike.label}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: isSel ? "#D85A3022" : "transparent", border: `1px solid ${isSel ? "#D85A30" : "#3A352F"}`, borderRadius: 8, color: isSel ? "#D85A30" : "#B5AEA8", fontSize: 13, padding: "6px 12px", cursor: "pointer", fontWeight: isSel ? 700 : 400 }}>
                        <input type="checkbox" checked={isSel} disabled={!bike.id}
                          onChange={() => { const id = bike.id; if (id) setWsPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }} />
                        {bike.label}
                      </label>
                    );
                  })}
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6, background: wsOther ? "#D85A3022" : "transparent", border: `1px solid ${wsOther ? "#D85A30" : "#3A352F"}`, borderRadius: 8, color: wsOther ? "#D85A30" : "#B5AEA8", fontSize: 13, padding: "6px 12px", cursor: "pointer", fontWeight: wsOther ? 700 : 400 }}>
                    <input type="checkbox" checked={wsOther} onChange={() => setWsOther(v => !v)} />
                    Other / not on file
                  </label>
                </div>
              </div>
            )}

            {/* Bike details (manual entry: no bikes on file, or "Other" ticked) */}
            {(wsClientBikes.length === 0 || wsOther) && <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Make</span>
                <input className="g51-input" value={wsForm.make} onChange={e => setWsForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Yamaha" style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Model</span>
                <input className="g51-input" value={wsForm.model} onChange={e => setWsForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. YZ450F" style={s.input} /></label>
              <label style={{ ...s.ctrl, flex: "0 0 90px" }}><span style={s.ctrlLabel}>Year</span>
                <input className="g51-input" value={wsForm.year} onChange={e => setWsForm(f => ({ ...f, year: e.target.value }))} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>VIN (optional)</span>
                <input className="g51-input" value={wsForm.vin} onChange={e => setWsForm(f => ({ ...f, vin: e.target.value }))} style={s.input} /></label>
            </div>}

            {/* Job details */}
            <label style={{ ...s.ctrl, display: "grid", marginBottom: 10 }}><span style={s.ctrlLabel}>Work required *</span>
              <textarea className="g51-input" value={wsForm.work} onChange={e => setWsForm(f => ({ ...f, work: e.target.value }))}
                placeholder="Describe the work to be done…" rows={2} style={{ ...s.input, resize: "vertical" }} /></label>
            {(() => {
              const entries = wsEntries();
              if (entries.length < 2) return null;
              return (
                <div style={{ marginBottom: 10, display: "grid", gap: 8 }}>
                  {entries.map(en => (
                    <div key={en.key} style={{ background: "#1B1816", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#F4F2EF", marginBottom: 6 }}>
                        {[en.make, en.model, en.year].filter(Boolean).join(" ") || "Other bike"}
                      </div>
                      <div style={s.controls}>
                        <label style={{ ...s.ctrl, flex: "2 1 220px" }}><span style={s.ctrlLabel}>Work required</span>
                          <textarea className="g51-input" value={en.work} rows={2} style={{ ...s.input, resize: "vertical" }}
                            onChange={e => setWsOverrides(o => ({ ...o, [en.key]: { ...o[en.key], work: e.target.value } }))} /></label>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Estimate (AED)</span>
                          <input className="g51-input" type="number" value={en.amount} style={s.input}
                            onChange={e => setWsOverrides(o => ({ ...o, [en.key]: { ...o[en.key], amount: e.target.value } }))} /></label>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Assign to</span>
                <select className="g51-input" value={wsForm.assignedTo} onChange={e => setWsForm(f => ({ ...f, assignedTo: e.target.value }))} style={s.input}>
                  <option value="">Unassigned</option>
                  {staff.filter(p => p.roles?.includes("mechanic") || p.roles?.includes("admin")).map(p => (
                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                  ))}
                </select></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Estimated (AED)</span>
                <input className="g51-input" type="number" value={wsForm.amount} onChange={e => setWsForm(f => ({ ...f, amount: e.target.value }))} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Preferred date</span>
                <input className="g51-input" type="date" value={wsForm.date} onChange={e => setWsForm(f => ({ ...f, date: e.target.value }))} style={s.input} /></label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={createWorkshopIntake} disabled={creatingWs}
                style={{ background: "#ED1C24", color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: creatingWs ? 0.6 : 1 }}>
                {creatingWs ? "Creating…" : "Push to workshop queue"}
              </button>
              <button onClick={() => setWsOpen(false)} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
            </div>
          </div>
        )}

        {adding && (
          <div style={s.addPanel}>
            <div style={s.addTitle}>New booking</div>

            {/* Client search — select existing to auto-fill, or skip to type manually */}
            {!lgOn && <div style={{ marginBottom: 12, position: "relative" }}>
              <label style={s.ctrl}>
                <span style={s.ctrlLabel}>Search existing client</span>
                <div style={{ position: "relative" }}>
                  <input className="g51-input"
                    placeholder="Type name or phone to find an existing client…"
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setShowClientDrop(true); }}
                    onFocus={() => setShowClientDrop(true)}
                    onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                    style={{ ...s.input, paddingRight: clientSearch ? 28 : s.input.padding }} />
                  {clientSearch && (
                    <button onClick={() => { setClientSearch(""); setShowClientDrop(false); }}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                  )}
                </div>
              </label>
              {showClientDrop && clientSearch.trim().length > 0 && (() => {
                const q = clientSearch.toLowerCase();
                const matches = clientList.filter(c =>
                  c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email || "").toLowerCase().includes(q)
                ).slice(0, 8);
                if (matches.length === 0) return null;
                return (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.5)", marginTop: 2 }}>
                    {matches.map(c => (
                      <button key={c.phone} onMouseDown={() => {
                        setForm(prev => ({
                          ...prev,
                          customer_name: c.name,
                          phone: c.phone,
                          email: c.email || "",
                          // Auto-fill bike details if exactly one storage bike on record
                          ...(c.bikes.length === 1 ? { bike_details: c.bikes[0].label } : {}),
                        }));
                        setClientBikes(c.bikes.length > 1 ? c.bikes : []);
                        setClientSearch(c.name);
                        setShowClientDrop(false);
                      }}
                        style={{ display: "flex", flexDirection: "column", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid #2A2623", padding: "10px 14px", cursor: "pointer", color: "#F4F2EF", fontFamily: "inherit" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name || "(no name)"}</span>
                        <span style={{ fontSize: 12, color: "#9A938D", marginTop: 2 }}>{c.phone}{c.email ? ` · ${c.email}` : ""}</span>
                        {c.bikes.length > 0 && (
                          <span style={{ fontSize: 11.5, color: "#3B9EFF", marginTop: 3 }}>🏍 {c.bikes.map(b => b.label).join(" · ")}</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>}

            {!lgOn && <div style={s.controls}>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Name *</span>
                <input className="g51-input" value={form.customer_name} onChange={e => set("customer_name", e.target.value)} style={s.input} /></label>
              <label style={s.ctrl}><span style={s.ctrlLabel}>Phone *</span>
                <input className="g51-input" value={form.phone} onChange={e => set("phone", e.target.value)} style={s.input} /></label>
            </div>}
            {/* Multi-bike picker: shown when a client has more than one storage bike on record */}
            {clientBikes.length > 1 && (
              <div style={{ marginBottom: 10, background: "#1B1816", border: "1px solid #3B9EFF44", borderRadius: 9, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: "#3B9EFF", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
                  Multiple bikes on record — select one
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {clientBikes.map(bike => (
                    <button key={bike.label} onClick={() => set("bike_details", bike.label)}
                      style={{ background: form.bike_details === bike.label ? "#3B9EFF22" : "transparent", border: `1px solid ${form.bike_details === bike.label ? "#3B9EFF" : "#3A352F"}`, borderRadius: 8, color: form.bike_details === bike.label ? "#3B9EFF" : "#B5AEA8", fontSize: 13, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: form.bike_details === bike.label ? 700 : 400 }}>
                      {bike.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={s.controls}>
              {!lgOn && <label style={s.ctrl}><span style={s.ctrlLabel}>Email</span>
                <input className="g51-input" value={form.email} onChange={e => set("email", e.target.value)} style={s.input} /></label>}
              <label style={s.ctrl}><span style={s.ctrlLabel}>Service</span>
                <select className="g51-input" value={form.service_type} onChange={e => setServiceType(e.target.value)} style={s.input}>
                  <option value="academy">academy</option>
                  <option value="rental">rental</option>
                  <option value="desert_tour">desert tour</option>
                  <option value="motorcycle_storage">motorcycle storage</option>
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
                <label style={s.ctrl}><span style={s.ctrlLabel}>Term</span>
                  <select className="g51-input" value={form.storage_term} onChange={e => setStorageTerm(e.target.value)} style={s.input}>
                    {STORAGE_TERMS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select></label>
              </div>
            )}
            {form.service_type === "motorcycle_storage" && (
              <div style={{ marginBottom: 13 }}>
                {form.storageBikes.map((bike, i) => (
                  <div key={i} style={{ ...s.controls, alignItems: "flex-end", marginBottom: 8 }}>
                    <label style={s.ctrl}><span style={s.ctrlLabel}>Bike category</span>
                      <select className="g51-input" value={bike.category} onChange={e => setStorageBikeCategory(i, e.target.value)} style={s.input}>
                        <option value="adult">Adult (≥85cc)</option>
                        <option value="junior">Junior (≤65cc)</option>
                      </select></label>
                    <label style={s.ctrl}><span style={s.ctrlLabel}>Bike (make / model)</span>
                      <input className="g51-input" value={bike.details} onChange={e => setStorageBikeDetails(i, e.target.value)} style={s.input} /></label>
                    <label style={{ ...s.ctrl, flex: "0 1 140px" }}><span style={s.ctrlLabel}>{form.storage_term === "month_to_month" ? "Monthly (AED)" : "Total (AED)"}</span>
                      <input className="g51-input" type="number" value={bike.estimatedValue} onChange={e => setStorageBikeValue(i, Number(e.target.value))} style={s.input} /></label>
                    {form.storageBikes.length > 1 && (
                      <button type="button" onClick={() => removeStorageBike(i)} title="Remove this bike"
                        style={{ background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 13, padding: "0 2px 13px", flexShrink: 0 }}>× Remove</button>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button type="button" onClick={addStorageBike} className="g51-btn g51-ghost" style={s.addSes}>+ Add another bike</button>
                  <span style={{ fontSize: 12.5, color: "#9A938D" }}>
                    Total: {aed(form.storageBikes.reduce((sum, b) => sum + (Number(b.estimatedValue) || 0), 0))}
                  </span>
                </div>
              </div>
            )}
            {form.service_type === "academy" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13, fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" checked={lg.on} onChange={e => setLg(prev => ({ ...prev, on: e.target.checked }))} />
                Group lesson (2+ clients, one instructor)
              </label>
            )}
            {lgOn && (
              <div style={{ marginBottom: 13 }}>
                <div style={s.controls}>
                  <label style={s.ctrl}><span style={s.ctrlLabel}>Type</span>
                    <select className="g51-input" value={lg.type} onChange={e => setLg(prev => ({ ...prev, type: e.target.value as "single" | "package" }))} style={s.input}>
                      <option value="single">Single lesson</option>
                      <option value="package">Group package</option>
                    </select></label>
                  {lg.type === "package" && (
                    <label style={s.ctrl}><span style={s.ctrlLabel}>Number of sessions</span>
                      <input className="g51-input" type="number" min={1} value={lg.sessions} onChange={e => setLg(prev => ({ ...prev, sessions: Math.max(1, Number(e.target.value) || 1) }))} style={s.input} /></label>
                  )}
                  <label style={s.ctrl}><span style={s.ctrlLabel}>Instructor</span>
                    <select className="g51-input" value={lg.instructor} onChange={e => setLg(prev => ({ ...prev, instructor: e.target.value }))} style={s.input}>
                      <option value="">Unassigned</option>
                      {staff.map(p => <option key={p.id} value={p.id}>{p.name || "(no name)"} · {(p.roles || []).join(", ")}</option>)}
                    </select></label>
                  <label style={s.ctrl}><span style={s.ctrlLabel}>First lesson date &amp; time</span>
                    <input className="g51-input" type="datetime-local" value={lg.start} onChange={e => setLg(prev => ({ ...prev, start: e.target.value }))} style={s.input} /></label>
                </div>
                {lg.clients.map((c, i) => (
                  <div key={i} style={{ ...s.controls, alignItems: "flex-end", marginBottom: 8 }}>
                    <label style={s.ctrl}><span style={s.ctrlLabel}>Name *</span>
                      <input className="g51-input" value={c.name} onChange={e => setLgClient(i, { name: e.target.value })} style={s.input} /></label>
                    <label style={s.ctrl}><span style={s.ctrlLabel}>Phone *</span>
                      <input className="g51-input" value={c.phone} onChange={e => setLgClient(i, { phone: e.target.value })} style={s.input} /></label>
                    <label style={s.ctrl}><span style={s.ctrlLabel}>Email</span>
                      <input className="g51-input" value={c.email} onChange={e => setLgClient(i, { email: e.target.value })} style={s.input} /></label>
                    <label style={{ ...s.ctrl, flex: "0 1 120px" }}><span style={s.ctrlLabel}>Price (AED)</span>
                      <input className="g51-input" type="number" value={c.price} onChange={e => setLgClient(i, { price: Number(e.target.value) })} style={s.input} /></label>
                    {lg.clients.length > 2 && (
                      <button type="button" onClick={() => setLg(prev => ({ ...prev, clients: prev.clients.filter((_, idx) => idx !== i) }))} title="Remove this client"
                        style={{ background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 13, padding: "0 2px 13px", flexShrink: 0 }}>× Remove</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setLg(prev => ({ ...prev, clients: [...prev.clients, blankLgClient()] }))} className="g51-btn g51-ghost" style={s.addSes}>+ Add client</button>
              </div>
            )}
            {!lgOn && <div style={s.controls}>
              {form.service_type !== "motorcycle_storage" && (
                <label style={s.ctrl}><span style={s.ctrlLabel}>Est. value (AED)</span>
                  <input className="g51-input" type="number" value={form.estimated_value} onChange={e => set("estimated_value", Number(e.target.value))} style={s.input} /></label>
              )}
              {!["motorcycle_storage", "workshop"].includes(form.service_type) && (
                <label style={s.ctrl}><span style={s.ctrlLabel}>Package size (sessions)</span>
                  <input className="g51-input" type="number" min={1} value={form.sessions_total} onChange={e => set("sessions_total", Math.max(1, Number(e.target.value) || 1))} style={s.input} /></label>
              )}
              {form.service_type === "motorcycle_storage" ? (
                <>
                  <label style={s.ctrl}><span style={s.ctrlLabel}>Drop-off date</span>
                    <input className="g51-input" type="date" value={form.storage_start_date} onChange={e => setStorageStartDate(e.target.value)} style={s.input} /></label>
                  <label style={s.ctrl}><span style={s.ctrlLabel}>Pick-up / renewal date</span>
                    <input className="g51-input" type="date" value={form.storage_end_date} onChange={e => set("storage_end_date", e.target.value)} style={s.input} /></label>
                </>
              ) : form.service_type === "workshop" ? (
                <label style={s.ctrl}><span style={s.ctrlLabel}>Preferred date</span>
                  <input className="g51-input" type="date" value={form.preferred_date} onChange={e => set("preferred_date", e.target.value)} style={s.input} /></label>
              ) : (
                <label style={s.ctrl}><span style={s.ctrlLabel}>Booking date &amp; time</span>
                  <input className="g51-input" type="datetime-local" value={form.booking_at} onChange={e => set("booking_at", e.target.value)} style={s.input} /></label>
              )}
            </div>}
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
          <button onClick={() => { setSelectMode(m => !m); setSelectedIds([]); setGroupPanelOpen(false); setGroupPkgConfirmed(false); }} className="g51-btn g51-ghost"
            style={{ ...s.ghostBtn, height: 42, ...(selectMode ? { color: BUSINESS_UNIT_COLOR.academy, borderColor: BUSINESS_UNIT_COLOR.academy + "66" } : {}) }}>
            Group lessons
          </button>
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

        {selectMode && (
          <div style={s.groupBar}>
            {selectedRows.length >= 2 && sameSize ? (
              !groupPanelOpen ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button onClick={() => { setGroupInstructor(selectedRows[0].assigned_to || ""); setGroupPanelOpen(true); }} className="g51-btn g51-primary" style={s.save}>
                    Group {selectedRows.length} selected
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ ...s.ctrl, marginBottom: 0 }}><span style={s.ctrlLabel}>Instructor</span>
                    <select className="g51-input" value={groupInstructor} onChange={e => setGroupInstructor(e.target.value)} style={s.input}>
                      <option value="">Unassigned</option>
                      {staff.map(p => <option key={p.id} value={p.id}>{p.name || "(no name)"} · {(p.roles || []).join(", ")}</option>)}
                    </select></label>
                  {selectedRows[0].sessions_total > 1 && (
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#D7D0CA", cursor: "pointer" }}>
                      <input type="checkbox" checked={groupPkgConfirmed} onChange={e => setGroupPkgConfirmed(e.target.checked)} />
                      These are a predetermined group package ({selectedRows[0].sessions_total} lessons shared), not individual packages
                    </label>
                  )}
                  <div style={{ fontSize: 12.5, color: "#FFB02E" }}>
                    {selectedRows[0].customer_name}&apos;s lesson times will overwrite the other bookings&apos; lesson times, and their individual calendar events will be replaced by one shared event.
                  </div>
                  <div style={s.actions}>
                    <button onClick={applyLessonGrouping} disabled={groupBusy || (selectedRows[0].sessions_total > 1 && !groupPkgConfirmed)} className="g51-btn g51-primary" style={s.save}>{groupBusy ? "Grouping…" : "Confirm group"}</button>
                    <button onClick={() => setGroupPanelOpen(false)} disabled={groupBusy} className="g51-btn g51-ghost" style={s.ghostBtn}>Back</button>
                  </div>
                </div>
              )
            ) : (
              <span style={{ fontSize: 13, color: "#9A938D" }}>
                {selectedRows.length >= 2
                  ? "These bookings have different package sizes — tick bookings with the same number of lessons."
                  : "Tick 2 or more academy bookings to group them into one lesson (single lessons, or clients sharing a group package — never individual packages)."}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <p style={s.muted}>Loading bookings…</p>
        ) : scoped.length === 0 ? (
          <div style={s.empty}>No bookings yet. New web submissions appear here automatically.</div>
        ) : visible.length === 0 ? (
          <div style={s.empty}>Nothing matches this view.</div>
        ) : (
          <div style={s.list}>
            {displayGroups.map(dg => (
              <div key={dg.key} style={dg.kind === "group" ? s.groupWrap : undefined}>
                {dg.kind === "group" && renderGroupHeader(dg.key, dg.rows)}
                {(dg.kind === "group" ? dg.rows : [dg.row]).map(r => {
              const open = expanded.has(r.id);
              const st = bookingState(r);
              const sc = STATE_COLOR[st] || "#9A938D";
              const done = completedCount(r);
              const isPkg = r.sessions_total > 1;
              const isAcademy = r.service_type === "academy";
              const isPaid = !!(r.paid_at || r.stage === "paid");
              const hasRemainingSessions = isPkg && done < r.sessions_total && !["cancelled", "lost", "completed"].includes(st);
              const conflicted = bookingHasConflict(rows, r);
              const renewal = storageRenewalStatus(r);
              const sortedSessions = [...(r.sessions || [])].sort((a, b) => {
                if (!a.scheduled_at && !b.scheduled_at) return (a.seq ?? 0) - (b.seq ?? 0);
                if (!a.scheduled_at) return 1;
                if (!b.scheduled_at) return -1;
                return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
              });
              return (
                <div key={r.id} className="g51-card" style={s.card}>
                  <div className="g51-row g51-card-head" style={s.cardHead} onClick={() => toggleExpand(r.id)}>
                    {selectMode && lessonGroupEligible(r) && (
                      <input type="checkbox" checked={selectedIds.includes(r.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelected(r.id)} style={{ flexShrink: 0 }} />
                    )}
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: isPaid ? PAID_COLOR : sc, flexShrink: 0 }} />
                    <div style={s.headMain}>
                      <div style={s.nameRow}>
                        <span style={s.name}>{r.customer_name}</span>
                        {/* Paid badge — always gold when payment received */}
                        {isPaid && (
                          <span style={{ ...s.pill, color: PAID_COLOR, borderColor: PAID_COLOR + "66", background: PAID_COLOR + "1c" }}>paid</span>
                        )}
                        {/* Show "booked" alongside "paid" if there are still sessions to run */}
                        {isPaid && hasRemainingSessions && (
                          <span style={{ ...s.pill, color: "#A78BFA", borderColor: "#A78BFA66", background: "#A78BFA1c" }}>booked</span>
                        )}
                        {/* Normal single state badge when not paid */}
                        {!isPaid && (
                          <span style={{ ...s.pill, color: sc, borderColor: sc + "66", background: sc + "1c" }}>{st}</span>
                        )}
                        {conflicted && <span style={s.conflictBadge} title="One of this booking's sessions overlaps another booking for the same staff member">⚠ Conflict</span>}
                        {renewal === "overdue" && <span style={s.conflictBadge} title="This storage term has ended — confirm renewal payment or arrange bike pick-up">⚠ Pick-up overdue</span>}
                        {renewal === "due_soon" && <span style={s.renewalDueBadge} title="This storage term ends soon — confirm renewal or pick-up">⏰ Renewal due</span>}
                        {r.whatsapp_ack_error && (
                          <span style={s.conflictBadge} title={`Automatic WhatsApp acknowledgement failed: ${r.whatsapp_ack_error} — message this customer manually`}>⚠ WhatsApp not sent</span>
                        )}
                        {dirty.has(r.id) && <span style={s.unsaved}>unsaved</span>}
                      </div>
                      <div style={s.sub}>
                        {cap(r.service_type.replace("_", " "))}
                        <span style={s.dotSep}>·</span>
                        {nextLabel(r)}
                        {r.selection && <><span style={s.dotSep}>·</span>{r.selection}</>}
                        {/* Session progress — visible on the card without expanding */}
                        {isPkg && isAcademy && (
                          <><span style={s.dotSep}>·</span>
                          <span style={{ color: done >= r.sessions_total ? "#2FBF71" : "#C9C2BC", fontWeight: done > 0 ? 600 : 400 }}>
                            {done}/{r.sessions_total} sessions{done >= r.sessions_total ? " ✓" : " completed"}
                          </span></>
                        )}
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
                    {lessonGroupEligible(r) && (
                      <button onClick={() => { setSelectMode(true); setSelectedIds([r.id]); setGroupPanelOpen(false); setGroupPkgConfirmed(false); window.scrollTo({ top: 0, behavior: "smooth" }); showToast(`${r.customer_name} selected — tick the other bookings to group with.`); }} className="g51-btn" style={s.quickBtn}>Group lesson</button>
                    )}
                    {isAcademy && r.lesson_group_id && (
                      <button onClick={() => removeFromGroup(r)} className="g51-btn" style={s.quickBtn}>Remove from group</button>
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
                                <a href={whatsappLink(r)} target="_blank" rel="noreferrer"
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
                    {r.zoho_invoice_id ? (
                      <a href={r.zoho_invoice_url || "#"} target="_blank" rel="noreferrer" className="g51-btn" style={s.quickBtn}>
                        Invoice {r.zoho_invoice_number}<span style={s.sentTick}>✓</span>
                      </a>
                    ) : (
                      <button onClick={() => createZohoInvoiceForBooking(r)} disabled={zohoBusy === r.id} className="g51-btn" style={s.quickBtn}>
                        {zohoBusy === r.id ? "Creating…" : "Create invoice"}
                      </button>
                    )}
                  </div>

                  {open && (
                    <div className="g51-expand" style={s.cardBody}>
                      <div style={s.contact}>
                        <a href={`tel:${r.phone}`} style={s.link}>{r.phone}</a>
                        {r.email && <span style={s.muted2}>{r.email}</span>}
                        {/* Quick task link for this booking */}
                        <button
                          onClick={() => {
                            const p = new URLSearchParams({
                              create: "1", category: "admin",
                              linked_label: `${r.customer_name} — ${r.service_type}`,
                              linked_enquiry_id: r.id,
                              ...(r.phone ? { linked_client_phone: r.phone } : {}),
                            });
                            window.open(`/admin/tasks?${p.toString()}`, "_blank");
                          }}
                          style={{ background: "transparent", border: "none", color: "#A78BFA", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>
                          + Create task
                        </button>
                        {r.refund_due && (
                          <span style={s.refund}>Refund due
                            <button onClick={() => clearRefund(r)} className="g51-btn" style={s.refundClear}>Mark refunded</button>
                          </span>
                        )}
                      </div>

                      {r.service_type !== "motorcycle_storage" && (me?.roles?.includes("admin") || r.assigned_to) && (
                        <div style={s.assignRow}>
                          <span style={s.assignLabel}>Assigned to</span>
                          {me?.roles?.includes("admin") ? (
                            <select className="g51-input" value={r.assigned_to || ""}
                              onChange={e => assignBooking(r, e.target.value)} style={s.assignSelect}>
                              <option value="">Unassigned</option>
                              {staff.map(p => (
                                <option key={p.id} value={p.id}>{p.name || "(no name)"} · {(p.roles || []).join(", ")}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={s.assignVal}>{staff.find(p => p.id === r.assigned_to)?.name || "—"}</span>
                          )}
                        </div>
                      )}

                      {r.service_type === "workshop" ? (
                        <div style={s.prefRow}>
                          <span style={s.prefLabel}>Preferred date</span>
                          <input className="g51-input" type="date" value={r.preferred_date || ""}
                            onChange={e => editStaged(r.id, { preferred_date: e.target.value || null })}
                            style={{ ...s.input, width: "auto", flex: "0 0 180px" }} />
                        </div>
                      ) : r.preferred_date && (
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

                      {r.service_type !== "motorcycle_storage" && r.service_type !== "workshop" && (
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
                        {sortedSessions.map((ss, idx) => {
                          const conflict = findConflict(rows, r, ss);
                          return (
                          <div key={ss.id} style={s.sesRow}>
                            <span style={s.sesSeq}>#{idx + 1}</span>
                            <input className="g51-input" type="datetime-local"
                              value={isoToLocalInput(ss.scheduled_at)}
                              onChange={e => {
                                const iso = localInputToIso(e.target.value);
                                // Update scheduled_at in state — sortedSessions sorts by date
                                // so the display reorders immediately without any seq juggling
                                editSessionLocal(r.id, ss.id, { scheduled_at: iso });
                                persistSession(ss.id, { scheduled_at: iso });
                                if (r.lesson_group_id) mirrorGroupSessions(r, ss, { scheduled_at: iso });
                                else syncSessionToCalendar(r, { ...ss, scheduled_at: iso });
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
                                  if (r.lesson_group_id) mirrorGroupSessions(r, ss, { duration_minutes: minutes });
                                  else syncSessionToCalendar(r, { ...ss, duration_minutes: minutes });
                                }}
                                style={{ ...s.input, width: 64, padding: "8px 6px", textAlign: "center" }} />
                              <span style={s.durationUnit}>min</span>
                            </span>
                            <select className="g51-input" value={ss.status}
                              onChange={e => {
                                const v = e.target.value;
                                editSessionLocal(r.id, ss.id, { status: v });
                                persistSession(ss.id, { status: v });
                                if (r.lesson_group_id) mirrorGroupSessions(r, ss, { status: v });
                                else syncSessionToCalendar(r, { ...ss, status: v });
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
                            <label style={s.ctrl}><span style={s.ctrlLabel}>VIN</span>
                              <input className="g51-input" value={r.vin || ""} onChange={e => editStaged(r.id, { vin: e.target.value })} style={s.input} /></label>
                          </div>
                          <label style={s.ctrl}><span style={s.ctrlLabel}>Work required</span>
                            <textarea className="g51-input" value={r.work_required || ""} onChange={e => editStaged(r.id, { work_required: e.target.value })} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>

                          {!r.job_status ? (
                            <button onClick={() => pushToWorkshop(r)} className="g51-btn g51-primary" style={{ ...s.addSes, background: RED, color: "#fff", border: "none", fontWeight: 700, marginBottom: 13 }}>
                              Push to workshop
                            </button>
                          ) : (
                            <div style={s.controls}>
                              <label style={s.ctrl}><span style={s.ctrlLabel}>Shop status</span>
                                <select className="g51-input" value={r.job_status} onChange={e => editStaged(r.id, { job_status: e.target.value })} style={s.input}>
                                  {JOB_STATUSES.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
                                </select></label>
                              <label style={s.ctrl}><span style={s.ctrlLabel}>Labour hours</span>
                                <input className="g51-input" type="number" step="0.25" min={0} value={r.labour_hours ?? ""}
                                  onChange={e => setWorkshopLabourHours(r, e.target.value === "" ? null : Number(e.target.value))} style={s.input} /></label>
                            </div>
                          )}

                          {(() => {
                            const usedLines = partsUsedFor(r.id, movements);
                            const partsSubtotal = partsUsedTotal(usedLines);
                            const appliedProducts = applicationsFor(r.id, applications);
                            const productsSubtotal = applicationsTotal(appliedProducts);
                            const labour = labourCharge(r.labour_hours);
                            const combinedTotal = Math.round((partsSubtotal + productsSubtotal + labour) * 100) / 100;
                            return (
                              <div style={s.sesWrap}>
                                <div style={s.sesHead}>
                                  <span style={s.sesTitle}>
                                    Parts, products &amp; labour{combinedTotal > 0 ? ` · ${aed(combinedTotal)}` : ""}
                                  </span>
                                </div>
                                {labour > 0 && (
                                  <div style={s.sesRow}>
                                    <span style={{ flex: "1 1 auto" }}>Labour — {r.labour_hours}h × {aed(LABOUR_RATE_PER_HOUR)}/h</span>
                                    <span style={{ fontWeight: 700 }}>{aed(labour)}</span>
                                  </div>
                                )}
                                {appliedProducts.map(app => (
                                  <div key={app.id} style={{ ...s.sesRow, alignItems: "center" }}>
                                    <span style={{ flex: "1 1 auto" }}>{app.name_snapshot} <span style={{ opacity: 0.6 }}>(fixed price)</span></span>
                                    <span style={{ fontWeight: 700 }}>{aed(app.price_snapshot)}</span>
                                    <button onClick={() => removeServiceProduct(app)}
                                      title="Remove this product"
                                      style={{ background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
                                  </div>
                                ))}
                                {usedLines.map(line => {
                                  const part = parts.find(pp => pp.id === line.part_id);
                                  return (
                                    <div key={line.part_id} style={s.sesRow}>
                                      <span style={{ flex: "1 1 auto" }}>{part?.name || "Unknown part"} × {line.qty}</span>
                                      <span style={{ fontWeight: 700 }}>{aed(line.qty * line.sellSnapshot)}</span>
                                      <button onClick={() => removePartFromBooking(r, line.part_id, part?.name || "this part")}
                                        title="Remove this part"
                                        style={{ background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
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
                                ) : applyProductRowId === r.id ? (
                                  <div style={s.sesRow}>
                                    <select className="g51-input" value={applyProductSelection} onChange={e => setApplyProductSelection(e.target.value)} style={{ ...s.input, flex: "1 1 200px" }}>
                                      <option value="">Choose a product…</option>
                                      {serviceProducts.map(sp => (
                                        <option key={sp.id} value={sp.id}>{sp.name} ({aed(sp.price)})</option>
                                      ))}
                                    </select>
                                    <button onClick={() => applyServiceProductToBooking(r)} className="g51-btn g51-primary" style={{ ...s.addSes, background: RED, color: "#fff", border: "none", fontWeight: 700 }}>Apply</button>
                                    <button onClick={() => setApplyProductRowId(null)} className="g51-btn g51-ghost" style={s.addSes}>Cancel</button>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button onClick={() => { setAddPartRowId(r.id); setAddPartSelection(""); setAddPartQty("1"); }} className="g51-btn g51-ghost" style={s.addSes}>+ Add part</button>
                                    {serviceProducts.length > 0 && (
                                      <button onClick={() => { setApplyProductRowId(r.id); setApplyProductSelection(""); }} className="g51-btn g51-ghost" style={s.addSes}>+ Apply product</button>
                                    )}
                                  </div>
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
                          <button onClick={() => printJobCard(
                            r,
                            partsUsedFor(r.id, movements).map(l => {
                              const part = parts.find(pp => pp.id === l.part_id);
                              return { name: part?.name || "Unknown part", qty: l.qty, lineTotal: Math.round(l.qty * l.sellSnapshot * 100) / 100 };
                            }),
                            applicationsFor(r.id, applications).map(app => ({
                              name: app.name_snapshot,
                              price: app.price_snapshot,
                              recipe: recipeUsageFor(r.id, movements, applications)
                                .filter(line => line.applicationId === app.id)
                                .map(line => ({ name: parts.find(p => p.id === line.partId)?.name || "Unknown part", qty: line.qty })),
                            }))
                          )} className="g51-btn g51-ghost" style={s.ghostBtn}>Job card</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
                })}
              </div>
            ))}
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
  groupWrap: { background: "#1C1A18", border: "1px dashed #3A342E", borderRadius: 14, padding: "14px 17px 4px", display: "flex", flexDirection: "column", gap: 10 },
  groupBar: { background: "#221F1D", border: "1px solid #14B8A655", borderRadius: 14, padding: "12px 14px", marginBottom: 16 },
  groupHeaderInner: { display: "flex", flexDirection: "column", gap: 6, paddingBottom: 10, borderBottom: "1px solid #2F2B27" },
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
