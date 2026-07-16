"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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

type StorageEnquiry = {
  id: string; customer_name: string; phone: string; email: string | null;
  bike_details: string | null; storage_start_date: string | null; storage_end_date: string | null;
};
type StorageBike = {
  id: string; name: string; enquiry_id: string | null;
  make: string | null; model: string | null; year: string | null;
  engine_hours: number; active: boolean;
  vin: string | null; bike_number: string | null; reference_number: string | null;
  storage_start_date: string | null; storage_end_date: string | null;
  client_name: string | null; client_phone: string | null; client_email: string | null;
  monthly_rate: number | null;
  renewal_payment_intent_id: string | null;
  renewal_paid_at: string | null;
  renewal_invoiced_at: string | null;
};
type ServiceDue = {
  id: string; storage_bike_id: string; item_key: string;
  interval_hours: number; hours_at_last_done: number;
};
type ClientGroup = {
  key: string; name: string; phone: string; email: string | null;
  bikes: StorageBike[]; worstStatus: RenewalStatus;
};

const BLANK_BIKE = {
  name: "", enquiry_id: "", make: "", model: "", year: "", engine_hours: 0,
  vin: "", bike_number: "", storage_start_date: "", storage_end_date: "",
  client_name: "", client_phone: "", client_email: "", monthly_rate: 0,
};
const RENEWAL_THRESHOLD_DAYS = 14;
const STORAGE_PACKAGES = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
];

const GOLD = "#F59E0B";

type RenewalStatus = "overdue" | "due_soon" | "active" | "no_date" | "paid";
const STATUS_PRIORITY: Record<RenewalStatus, number> = {
  overdue: 3, due_soon: 2, paid: 1.5, active: 1, no_date: 0,
};

function waNumber(phone: string): string {
  const raw = (phone || "").trim();
  let n = raw.replace(/\D/g, "");
  if (!raw.startsWith("+")) {
    if (n.startsWith("00")) n = n.slice(2);
    if (n.startsWith("0")) n = "971" + n.slice(1);
  }
  return n;
}
function daysUntil(endDate: string | null): number {
  if (!endDate) return Infinity;
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}
function renewalStatus(endDate: string | null, paidAt?: string | null): RenewalStatus {
  // Payment received takes full priority — card should never stay red once paid
  if (paidAt) return "paid";
  if (!endDate) return "no_date";
  const d = daysUntil(endDate);
  if (d < 0) return "overdue";
  if (d <= RENEWAL_THRESHOLD_DAYS) return "due_soon";
  return "active";
}
function addMonths(fromDate: string | null, months: number): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function bikePrimaryLabel(bike: StorageBike): string {
  return [bike.make, bike.model, bike.year].filter(Boolean).join(" ") || bike.name;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", opacity: 0.6, flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CSS = `
.g51-btn{transition:background .15s,border-color .15s,opacity .15s;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
nav button:hover{background:#2A2624 !important;}
.g51-pkg:hover{border-color:#FFB02E !important;color:#FFB02E !important;}
`;

export default function StorageBikesScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "renewal_overdue" | "renewal_due" | "service_due" | "attention">("all");
  const [myName, setMyName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bikes, setBikes] = useState<StorageBike[]>([]);
  const [serviceDue, setServiceDue] = useState<ServiceDue[]>([]);
  const [serviceLog, setServiceLog] = useState<ServiceLogEntry[]>([]);
  const [enquiries, setEnquiries] = useState<StorageEnquiry[]>([]);
  const [expandedBikes, setExpandedBikes] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [okExpanded, setOkExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ ...BLANK_BIKE });
  const [selectedPkg, setSelectedPkg] = useState<Record<string, number>>({});
  const [waSent, setWaSent] = useState<Set<string>>(new Set());
  const [pendingClient, setPendingClient] = useState<Record<string, { name: string; phone: string; email: string }>>({});
  const [savingClient, setSavingClient] = useState<Record<string, boolean>>({});
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
        supabase.from("storage_bikes").select("*").eq("active", true).order("reference_number"),
        supabase.from("storage_bikes_service_due").select("*"),
        supabase.from("storage_bikes_service_log").select("*").order("created_at", { ascending: false }),
        supabase.from("enquiries").select("id,customer_name,phone,email,bike_details,storage_start_date,storage_end_date").eq("service_type", "motorcycle_storage"),
      ]);
      const bikeList = (b as StorageBike[]) || [];
      setBikes(bikeList);
      setServiceDue((sd as ServiceDue[]) || []);
      setServiceLog((sl as ServiceLogEntry[]) || []);
      setEnquiries((enq as StorageEnquiry[]) || []);
      // Start with all groups expanded but bikes collapsed
      const groupKeys = new Set<string>();
      for (const bk of bikeList) {
        groupKeys.add(bk.client_phone || `name:${bk.client_name || bk.id}`);
      }
      setExpandedGroups(groupKeys);
      setReady(true);

      // Realtime: when the webhook sets renewal_paid_at on a bike, update the
      // card immediately without requiring a page reload.
      const channel = supabase
        .channel("storage_bikes_renewal")
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "storage_bikes",
        }, (payload) => {
          const updated = payload.new as StorageBike;
          setBikes(prev => prev.map(b => b.id === updated.id ? { ...b, renewal_paid_at: updated.renewal_paid_at, renewal_payment_intent_id: updated.renewal_payment_intent_id, renewal_invoiced_at: updated.renewal_invoiced_at } : b));
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    });
  }, [router]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));
  function toggleBike(id: string) { setExpandedBikes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleGroup(key: string) { setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }); }
  function toggleOk(id: string) { setOkExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  // Group bikes by client phone (or name fallback)
  const clientGroups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const bike of bikes) {
      const key = bike.client_phone || `name:${bike.client_name || bike.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key, name: bike.client_name || bike.name,
          phone: bike.client_phone || "", email: bike.client_email,
          bikes: [], worstStatus: "no_date",
        });
      }
      const g = map.get(key)!;
      g.bikes.push(bike);
      const rs = renewalStatus(bike.storage_end_date, bike.renewal_paid_at);
      if (STATUS_PRIORITY[rs] > STATUS_PRIORITY[g.worstStatus]) g.worstStatus = rs;
    }
    // Sort groups: overdue first, then due_soon, then alphabetical
    return Array.from(map.values()).sort((a, b) =>
      STATUS_PRIORITY[b.worstStatus] - STATUS_PRIORITY[a.worstStatus] || a.name.localeCompare(b.name)
    );
  }, [bikes]);

  // ---- service tracking helpers ----
  function getLastDoneHours(bikeId: string, due: ServiceDue): number {
    return lastServicedAt(bikeId, due.item_key, serviceLog, due.hours_at_last_done, "storage_bike_id");
  }
  function getStatus(bike: StorageBike, due: ServiceDue) {
    return itemStatus(bike.engine_hours, getLastDoneHours(bike.id, due), due.interval_hours);
  }

  // Per-bike filter predicate — evaluated after getStatus is defined
  function bikeHasServiceDue(bike: StorageBike): boolean {
    return serviceDue.filter(d => d.storage_bike_id === bike.id).some(d => getStatus(bike, d) !== "ok");
  }
  function bikeMatchesFilter(bike: StorageBike): boolean {
    const rs = renewalStatus(bike.storage_end_date, bike.renewal_paid_at);
    const hasSvc = bikeHasServiceDue(bike);
    switch (filterMode) {
      case "renewal_overdue": return rs === "overdue";
      case "renewal_due":     return rs === "due_soon";
      case "service_due":     return hasSvc;
      case "attention":       return rs === "overdue" || rs === "due_soon" || rs === "paid" || hasSvc;
      default:                return true;
    }
  }

  // Per-category counts for the filter bar
  const filterCounts = useMemo(() => ({
    all: bikes.length,
    renewal_overdue: bikes.filter(b => renewalStatus(b.storage_end_date, b.renewal_paid_at) === "overdue").length,
    renewal_due: bikes.filter(b => renewalStatus(b.storage_end_date, b.renewal_paid_at) === "due_soon").length,
    service_due: bikes.filter(b => serviceDue.filter(d => d.storage_bike_id === b.id).some(d => itemStatus(b.engine_hours, lastServicedAt(b.id, d.item_key, serviceLog, d.hours_at_last_done, "storage_bike_id"), d.interval_hours) !== "ok")).length,
    attention: bikes.filter(b => {
      const rs = renewalStatus(b.storage_end_date, b.renewal_paid_at);
      return rs === "overdue" || rs === "due_soon" || serviceDue.filter(d => d.storage_bike_id === b.id).some(d => itemStatus(b.engine_hours, lastServicedAt(b.id, d.item_key, serviceLog, d.hours_at_last_done, "storage_bike_id"), d.interval_hours) !== "ok");
    }).length,
  }), [bikes, serviceDue, serviceLog]);

  // Client groups after applying the bike-level filter
  const filteredGroups = useMemo(() => {
    if (filterMode === "all") return clientGroups;
    return clientGroups
      .map(group => ({ ...group, bikes: group.bikes.filter(bikeMatchesFilter) }))
      .filter(group => group.bikes.length > 0);
  // bikeMatchesFilter is stable as long as filterMode + serviceDue don't change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientGroups, filterMode, serviceDue, serviceLog]);
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
    setLogFormOpen(null); setLoggingItem(false);
    showToast(`${SERVICE_LABEL[due.item_key] || due.item_key} logged.`);
  }

  // ---- bike field helpers ----
  function editBikeLocal(id: string, patch: Partial<StorageBike>) {
    setBikes(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  async function saveBikeField(id: string, field: string, value: string | number | null) {
    editBikeLocal(id, { [field]: value } as Partial<StorageBike>);
    const { error } = await supabase.from("storage_bikes").update({ [field]: value }).eq("id", id);
    if (error) showToast(error.message || "Could not save.", "err");
  }
  async function removeBike(bike: StorageBike) {
    await supabase.from("storage_bikes").update({ active: false }).eq("id", bike.id);
    setBikes(prev => prev.filter(b => b.id !== bike.id));
    showToast(`Removed ${bikePrimaryLabel(bike)}.`);
  }

  // ---- client info (group-level) ----
  function setPending(groupKey: string, field: "name" | "phone" | "email", value: string, group: ClientGroup) {
    setPendingClient(prev => ({
      ...prev,
      [groupKey]: {
        name: prev[groupKey]?.name ?? group.name,
        phone: prev[groupKey]?.phone ?? group.phone,
        email: prev[groupKey]?.email ?? (group.email || ""),
        [field]: value,
      },
    }));
  }
  async function saveClientInfo(group: ClientGroup) {
    const pending = pendingClient[group.key];
    if (!pending) return;
    setSavingClient(prev => ({ ...prev, [group.key]: true }));
    // Update all bikes in this group
    for (const bike of group.bikes) {
      await supabase.from("storage_bikes").update({
        client_name: pending.name.trim() || null,
        client_phone: pending.phone.trim() || null,
        client_email: pending.email.trim() || null,
      }).eq("id", bike.id);
      editBikeLocal(bike.id, {
        client_name: pending.name.trim() || null,
        client_phone: pending.phone.trim() || null,
        client_email: pending.email.trim() || null,
      });
    }
    setPendingClient(prev => { const n = { ...prev }; delete n[group.key]; return n; });
    setSavingClient(prev => ({ ...prev, [group.key]: false }));
    showToast("Client info saved.");
  }

  // ---- renewal helpers ----
  function selectPackage(bike: StorageBike, months: number) {
    // Only record which package is selected — nothing is written to the database
    // until sendRenewalWhatsApp confirms the action. This keeps the flow clean:
    // the admin can change their mind, check the draft, and restart without any
    // lingering state from a previous selection.
    setSelectedPkg(prev => ({ ...prev, [bike.id]: months }));
    // Reset the sent indicator so the flow can start fresh with the new package
    setWaSent(prev => { const n = new Set(prev); n.delete(bike.id); return n; });
  }

  function resetBikePackage(bikeId: string) {
    setSelectedPkg(prev => { const n = { ...prev }; delete n[bikeId]; return n; });
    setWaSent(prev => { const n = new Set(prev); n.delete(bikeId); return n; });
  }
  function buildRenewalMsg(group: ClientGroup, bikes: StorageBike[]) {
    const name = pendingClient[group.key]?.name || group.name || "there";
    let msg = `Hi ${name}, here's a renewal update for your bike${bikes.length > 1 ? "s" : ""} in storage at Garage51 🏍️\n\n`;
    let grandTotal = 0;
    bikes.forEach((bike, i) => {
      const months = selectedPkg[bike.id];
      const rate = bike.monthly_rate || 0;
      const total = months ? rate * months : rate;
      grandTotal += total;
      // Compute the new end date fresh from the CURRENT end date + selected package.
      // This is the source of truth — never rely on state which may lag a render.
      const newEnd = months
        ? addMonths(bike.storage_end_date || bike.storage_start_date, months)
        : null;
      msg += `${i + 1}. ${bikePrimaryLabel(bike)}`;
      if (bike.reference_number) msg += ` (${bike.reference_number})`;
      msg += `\n`;
      if (months) msg += `   Package: ${months} month${months > 1 ? "s" : ""} · AED ${total.toLocaleString()}\n`;
      if (newEnd) msg += `   New end date: ${fmtDate(newEnd)}\n`;
      else msg += `   Current end date: ${fmtDate(bike.storage_end_date)}\n`;
      msg += `\n`;
    });
    if (bikes.length > 1 && grandTotal > 0) msg += `Total: AED ${grandTotal.toLocaleString()}\n\n`;
    msg += `Reply YES to confirm and we'll send your payment link${bikes.length > 1 ? "s" : ""}.`;
    return msg;
  }

  function sendRenewalWhatsApp(group: ClientGroup, targetBikes: StorageBike[]) {
    const phone = pendingClient[group.key]?.phone || group.phone;
    if (!phone) { showToast("No phone number for this client.", "err"); return; }
    const msg = buildRenewalMsg(group, targetBikes);
    window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
    // Only mark as sent — do NOT update the end date here.
    // The card stays in its overdue/due-soon state until the admin explicitly
    // clicks "Mark as renewed" after payment is confirmed.
    setWaSent(prev => {
      const next = new Set(prev);
      targetBikes.forEach(b => next.add(b.id));
      return next;
    });
  }

  async function createRenewalInvoice(bike: StorageBike) {
    const months = selectedPkg[bike.id];
    if (!months) { showToast("Select a package first.", "err"); return; }
    const newEnd = addMonths(bike.storage_end_date || bike.storage_start_date, months);
    const amount = (bike.monthly_rate || 0) * months;
    const now = new Date().toISOString();

    // Update the end date and stamp the invoice date — moves card from gold to green
    await supabase.from("storage_bikes").update({
      storage_end_date: newEnd,
      renewal_invoiced_at: now,
      renewal_paid_at: null,
      renewal_payment_intent_id: null,
    }).eq("id", bike.id);
    editBikeLocal(bike.id, {
      storage_end_date: newEnd,
      renewal_invoiced_at: now,
      renewal_paid_at: null,
      renewal_payment_intent_id: null,
    });
    resetBikePackage(bike.id);

    // Create a Zoho draft invoice directly from the bike's client data.
    // The route accepts raw fields — no linked booking required.
    if (amount > 0) {
      try {
        const res = await fetch("/api/zoho/create-invoice", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: bike.client_name || bike.name,
            phone: bike.client_phone || null,
            email: bike.client_email || null,
            line_item_name: "Motorcycle Storage",
            line_item_description: `${months} month renewal — ${bikePrimaryLabel(bike)}${bike.reference_number ? ` (${bike.reference_number})` : ""}`,
            amount,
          }),
        });
        const json = await res.json();
        if (json.zoho_invoice_number) {
          showToast(`Invoice ${json.zoho_invoice_number} created · renewed to ${fmtDate(newEnd)} ✓`);
        } else {
          showToast(`Renewed to ${fmtDate(newEnd)} ✓ — Zoho: ${json.error || "could not create invoice"}`);
        }
      } catch {
        showToast(`Renewed to ${fmtDate(newEnd)} ✓ (Zoho unavailable)`);
      }
    } else {
      showToast(`Renewed to ${fmtDate(newEnd)} ✓`);
    }
  }
  async function createRenewalPaymentLink(bike: StorageBike) {
    const months = selectedPkg[bike.id] || 1;
    const amount = (bike.monthly_rate || 0) * months;
    if (amount < 2) { showToast("Set a monthly rate first.", "err"); return; }
    try {
      const res = await fetch("/api/payment-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, description: `Storage renewal ${months}m — ${bikePrimaryLabel(bike)} (${bike.reference_number || bike.id.slice(0, 8)})` }),
      });
      const json = await res.json();
      if (json.url) {
        await navigator.clipboard.writeText(json.url);
        // Store the Ziina payment ID on the bike so the webhook can match it
        // when the client pays — this is what triggers the "payment received"
        // indicator on the card automatically, without any manual action.
        if (json.id) {
          await supabase.from("storage_bikes").update({
            renewal_payment_intent_id: json.id,
            renewal_paid_at: null, // clear any previous paid status for this new link
          }).eq("id", bike.id);
          editBikeLocal(bike.id, { renewal_payment_intent_id: json.id, renewal_paid_at: null });
        }
        showToast("Payment link copied — waiting for client to pay.");
      } else {
        showToast(json.error || "Could not create payment link.", "err");
      }
    } catch { showToast("Could not reach payment service.", "err"); }
  }
  function requestFromClient(group: ClientGroup, dueItems: ServiceDue[], bike: StorageBike) {
    const phone = pendingClient[group.key]?.phone || group.phone;
    if (!phone) { showToast("No phone number for this client.", "err"); return; }
    const list = dueItems.map(d => SERVICE_LABEL[d.item_key] || d.item_key).join(", ");
    const msg = `Hi ${group.name}, your ${bikePrimaryLabel(bike)} is due for: ${list}. This isn't included in the storage plan and would be invoiced separately — let us know if you'd like us to proceed.`;
    window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // ---- add bike ----
  async function createBike() {
    if (!form.client_name.trim()) { setAddError("Client name is required."); return; }
    setCreating(true); setAddError("");
    const startingHours = Number(form.engine_hours) || 0;
    const { data, error } = await supabase.from("storage_bikes").insert({
      name: `${form.client_name.trim()} — ${[form.make, form.model].filter(Boolean).join(" ") || "bike"}`,
      enquiry_id: form.enquiry_id || null,
      make: form.make.trim() || null, model: form.model.trim() || null,
      year: form.year.trim() || null, engine_hours: startingHours,
      vin: form.vin.trim() || null, bike_number: form.bike_number.trim() || null,
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
    setBikes(prev => [...prev, bike].sort((a, b) => (a.reference_number || "").localeCompare(b.reference_number || "")));
    setServiceDue(prev => [...prev, ...dueRows]);
    setCreating(false); setForm({ ...BLANK_BIKE }); setAdding(false);
    showToast(`Added ${bikePrimaryLabel(bike)} — ref ${bike.reference_number || "pending"}`);
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const totalAttention = bikes.filter(b => {
    const rs = renewalStatus(b.storage_end_date, b.renewal_paid_at);
    return rs === "overdue" || rs === "due_soon";
  }).length;

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={() => setMenuOpen(m => !m)} className="g51-btn g51-ghost" style={s.menuBtn} aria-label="Menu">
          {menuOpen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          }
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
        <p style={s.sub}>Grouped by client. Bikes sorted by renewal urgency.</p>

        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => setAdding(a => !a)} className="g51-btn g51-ghost" style={s.ghostBtn}>{adding ? "Cancel" : "+ Add bike"}</button>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {([
            { key: "all",             label: "All bikes",        color: "#9A938D" },
            { key: "attention",       label: "Needs attention",  color: AMBER },
            { key: "renewal_overdue", label: "Renewal overdue",  color: RED },
            { key: "renewal_due",     label: "Renewal due soon", color: AMBER },
            { key: "service_due",     label: "Service due",      color: "#3B9EFF" },
          ] as const).map(({ key, label, color }) => {
            const count = filterCounts[key];
            const isActive = filterMode === key;
            return (
              <button key={key} onClick={() => setFilterMode(key)}
                style={{
                  background: isActive ? color + "22" : "transparent",
                  border: `1px solid ${isActive ? color : "#2F2B27"}`,
                  borderRadius: 20, color: isActive ? color : "#9A938D",
                  fontSize: 12.5, fontWeight: isActive ? 700 : 500,
                  padding: "6px 13px", cursor: "pointer", fontFamily: "inherit",
                  transition: "all .15s",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                {label}
                <span style={{ background: isActive ? color + "33" : "#2A2623", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700, color: isActive ? color : "#6F6862" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {totalAttention > 0 && filterMode === "all" && (
          <div style={{ background: "#FFB02E18", border: "1px solid #FFB02E55", color: AMBER, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 18 }}>
            ⚠ {totalAttention} bike{totalAttention > 1 ? "s" : ""} need renewal attention
          </div>
        )}

        {/* Add bike form */}
        {adding && (
          <div style={{ ...s.groupCard, marginBottom: 18 }}>
            <div style={s.sectionHead}>New storage bike</div>
            <div style={s.section}>
              <div style={s.sectionLabel}>CLIENT INFO</div>
              <div style={s.fieldRow}>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Client name *</span>
                  <input className="g51-input" value={form.client_name} onChange={e => set("client_name", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Client phone</span>
                  <input className="g51-input" value={form.client_phone} onChange={e => set("client_phone", e.target.value)} placeholder="+971…" style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Client email</span>
                  <input className="g51-input" value={form.client_email} onChange={e => set("client_email", e.target.value)} style={s.input} /></label>
              </div>
            </div>
            <div style={s.section}>
              <div style={s.sectionLabel}>BIKE DETAILS</div>
              <div style={s.fieldRow}>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Make</span>
                  <input className="g51-input" value={form.make} onChange={e => set("make", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Model</span>
                  <input className="g51-input" value={form.model} onChange={e => set("model", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Year</span>
                  <input className="g51-input" value={form.year} onChange={e => set("year", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Bike number</span>
                  <input className="g51-input" value={form.bike_number} onChange={e => set("bike_number", e.target.value)} placeholder="e.g. Bike 1" style={s.input} /></label>
              </div>
              <div style={s.fieldRow}>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>VIN</span>
                  <input className="g51-input" value={form.vin} onChange={e => set("vin", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Engine hours</span>
                  <input className="g51-input" type="number" value={form.engine_hours} onChange={e => set("engine_hours", Number(e.target.value))} style={s.input} /></label>
              </div>
            </div>
            <div style={s.section}>
              <div style={s.sectionLabel}>STORAGE TERM</div>
              <div style={s.fieldRow}>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Start date</span>
                  <input className="g51-input" type="date" value={form.storage_start_date} onChange={e => set("storage_start_date", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>End / renewal date</span>
                  <input className="g51-input" type="date" value={form.storage_end_date} onChange={e => set("storage_end_date", e.target.value)} style={s.input} /></label>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Monthly rate (AED)</span>
                  <input className="g51-input" type="number" value={form.monthly_rate} onChange={e => set("monthly_rate", Number(e.target.value))} style={s.input} /></label>
              </div>
              <div style={s.fieldRow}>
                <label style={s.fieldCtrl}><span style={s.fieldLabel}>Linked booking (optional)</span>
                  <select className="g51-input" value={form.enquiry_id} onChange={e => set("enquiry_id", e.target.value)} style={s.input}>
                    <option value="">No linked booking</option>
                    {enquiries.map(e => <option key={e.id} value={e.id}>{e.customer_name} — {e.bike_details || "bike"}</option>)}
                  </select></label>
              </div>
            </div>
            {addError && <p style={{ color: "#FF6B6B", fontSize: 13, margin: "4px 17px 0" }}>{addError}</p>}
            <div style={{ display: "flex", gap: 10, padding: "0 17px 17px" }}>
              <button onClick={createBike} disabled={creating} style={s.primaryBtn}>{creating ? "Adding…" : "Add bike"}</button>
              <button onClick={() => { setAdding(false); setAddError(""); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
            </div>
          </div>
        )}

        {/* Client groups */}
        {filteredGroups.length === 0 ? (
          <div style={s.empty}>
            {filterMode === "all" ? "No storage bikes yet." : `No bikes in the "${filterMode.replace(/_/g, " ")}" category.`}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filteredGroups.map(group => {
              const isGroupOpen = expandedGroups.has(group.key);
              const groupDueCount = group.bikes.filter(b => ["overdue", "due_soon"].includes(renewalStatus(b.storage_end_date, b.renewal_paid_at))).length;
              const pendingG = pendingClient[group.key];
              const displayName = pendingG?.name ?? group.name;
              const displayPhone = pendingG?.phone ?? group.phone;
              const displayEmail = pendingG?.email ?? (group.email || "");

              return (
                <div key={group.key} style={s.groupCard}>
                  {/* Client group header */}
                  <div style={s.groupHead} onClick={() => toggleGroup(group.key)}>
                    <div style={s.groupAvatar}>
                      {(group.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={s.groupName}>{displayName}</span>
                        <span style={s.groupCount}>{group.bikes.length} bike{group.bikes.length !== 1 ? "s" : ""}</span>
                        {groupDueCount > 0 && (
                          <span style={{ ...s.badge, color: group.worstStatus === "overdue" ? RED : AMBER, borderColor: (group.worstStatus === "overdue" ? RED : AMBER) + "55", background: (group.worstStatus === "overdue" ? RED : AMBER) + "18" }}>
                            {group.worstStatus === "overdue" ? "⚠" : "⏰"} {groupDueCount} renewal{groupDueCount > 1 ? "s" : ""} {group.worstStatus === "overdue" ? "overdue" : "due soon"}
                          </span>
                        )}
                      </div>
                      {displayPhone && <div style={{ fontSize: 12, color: "#6F6862", marginTop: 2 }}>{displayPhone}{displayEmail ? ` · ${displayEmail}` : ""}</div>}
                    </div>
                    {/* Renew all button for clients with multiple due bikes */}
                    {groupDueCount > 0 && displayPhone && (
                      <button onClick={e => { e.stopPropagation(); sendRenewalWhatsApp(group, group.bikes.filter(b => ["overdue", "due_soon"].includes(renewalStatus(b.storage_end_date, b.renewal_paid_at)))); }}
                        className="g51-btn g51-ghost"
                        style={{ ...s.actionBtn, color: GREEN, borderColor: GREEN + "55", flexShrink: 0 }}>
                        {group.bikes.filter(b => ["overdue", "due_soon"].includes(renewalStatus(b.storage_end_date, b.renewal_paid_at))).every(b => waSent.has(b.id))
                          ? "✓ Sent"
                          : group.bikes.length > 1 ? "WhatsApp all" : "WhatsApp"}
                      </button>
                    )}
                    <Chevron open={isGroupOpen} />
                  </div>

                  {isGroupOpen && (
                    <div style={{ borderTop: "1px solid #2A2623" }}>
                      {/* Client info section (group-level) */}
                      <div style={{ ...s.section, borderBottom: "1px solid #2A2623" }}>
                        <div style={s.sectionLabel}>CLIENT INFO</div>
                        <div style={s.fieldRow}>
                          <label style={s.fieldCtrl}><span style={s.fieldLabel}>Name</span>
                            <input className="g51-input" value={displayName} onChange={e => setPending(group.key, "name", e.target.value, group)} style={s.input} /></label>
                          <label style={s.fieldCtrl}><span style={s.fieldLabel}>Phone</span>
                            <input className="g51-input" value={displayPhone} onChange={e => setPending(group.key, "phone", e.target.value, group)} placeholder="+971…" style={s.input} /></label>
                          <label style={s.fieldCtrl}><span style={s.fieldLabel}>Email</span>
                            <input className="g51-input" value={displayEmail} onChange={e => setPending(group.key, "email", e.target.value, group)} style={s.input} /></label>
                        </div>
                        {pendingG && (
                          <button onClick={() => saveClientInfo(group)} disabled={savingClient[group.key]}
                            style={{ ...s.primaryBtn, background: GREEN, marginTop: 8 }}>
                            {savingClient[group.key] ? "Saving…" : "Save client info"}
                          </button>
                        )}
                      </div>

                      {/* Bike cards within the group */}
                      {group.bikes.map((bike, bikeIdx) => {
                        const dues = serviceDue.filter(d => d.storage_bike_id === bike.id);
                        const overdueItems = dues.filter(d => getStatus(bike, d) === "overdue");
                        const dueSoonItems = dues.filter(d => getStatus(bike, d) === "due_soon");
                        const okItems = dues.filter(d => getStatus(bike, d) === "ok");
                        const isBikeOpen = expandedBikes.has(bike.id);
                        const isOkOpen = okExpanded.has(bike.id);
                        const rs = renewalStatus(bike.storage_end_date, bike.renewal_paid_at);
                        const daysLeft = daysUntil(bike.storage_end_date);
                        const bikeLog = serviceLog.filter(e => e.storage_bike_id === bike.id).slice(0, 6);
                        const total = dues.length;
                        const overdueW = total > 0 ? (overdueItems.length / total) * 100 : 0;
                        const dueSoonW = total > 0 ? (dueSoonItems.length / total) * 100 : 0;
                        const isLast = bikeIdx === group.bikes.length - 1;

                        return (
                          <div key={bike.id} style={{ borderBottom: isLast ? "none" : "1px solid #2A2623" }}>
                            {/* Bike header */}
                            <div style={s.bikeHead} onClick={() => toggleBike(bike.id)}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  {bike.reference_number && (
                                    <span style={s.refTag}>{bike.reference_number}</span>
                                  )}
                                  <span style={s.bikePrimary}>{bikePrimaryLabel(bike)}</span>
                                  {bike.bike_number && <span style={s.bikeNumTag}>{bike.bike_number}</span>}
                                  {rs === "paid" && <span style={{ ...s.badge, color: GOLD, borderColor: GOLD + "66", background: GOLD + "22" }}>💳 Payment received</span>}
                                  {rs === "overdue" && <span style={{ ...s.badge, color: RED, borderColor: RED + "55", background: RED + "18" }}>🔴 Overdue</span>}
                                  {rs === "due_soon" && <span style={{ ...s.badge, color: AMBER, borderColor: AMBER + "55", background: AMBER + "18" }}>⏰ {daysLeft}d</span>}
                                </div>
                                {bike.vin && <div style={{ fontSize: 11, color: "#6F6862", marginTop: 2 }}>VIN: {bike.vin}</div>}
                                {(bike.storage_start_date || bike.storage_end_date) && (
                                  <div style={{ fontSize: 11.5, color: rs === "paid" ? GOLD : rs === "overdue" ? RED : rs === "due_soon" ? AMBER : "#6F6862", marginTop: 3 }}>
                                    📅 {fmtDate(bike.storage_start_date)} → {fmtDate(bike.storage_end_date)}
                                    {bike.monthly_rate ? ` · AED ${bike.monthly_rate}/mo` : ""}
                                  </div>
                                )}
                                {/* Health bar */}
                                <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden", marginTop: 6, background: "#2A2623", gap: 1, maxWidth: 300 }}>
                                  {overdueW > 0 && <div style={{ width: `${overdueW}%`, background: RED }} />}
                                  {dueSoonW > 0 && <div style={{ width: `${dueSoonW}%`, background: AMBER }} />}
                                  <div style={{ width: `${100 - overdueW - dueSoonW}%`, background: GREEN + "55" }} />
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                  <input className="g51-input" type="number" value={bike.engine_hours}
                                    onChange={e => editBikeLocal(bike.id, { engine_hours: Number(e.target.value) })}
                                    onBlur={e => saveBikeField(bike.id, "engine_hours", Number(e.target.value))}
                                    style={{ ...s.input, width: 58, padding: "4px 7px", fontSize: 12 }} />
                                  <span style={{ fontSize: 11.5, color: "#6F6862" }}>h</span>
                                </label>
                                <Chevron open={isBikeOpen} />
                              </div>
                            </div>

                            {/* Renewal package strip */}
                            {(rs === "overdue" || rs === "due_soon" || rs === "paid") && (
                              <div style={{ margin: "0 14px 10px", background: rs === "paid" ? GOLD + "15" : rs === "overdue" ? RED + "0e" : AMBER + "0e", border: `1px solid ${rs === "paid" ? GOLD : rs === "overdue" ? RED : AMBER}33`, borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: rs === "paid" ? GOLD : rs === "overdue" ? RED : AMBER, marginBottom: 8 }}>
                                  {rs === "paid"
                                    ? "💳 Payment received — select a package and mark as renewed"
                                    : rs === "overdue"
                                    ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} overdue`
                                    : `Due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                  {STORAGE_PACKAGES.map(pkg => {
                                    const isSel = selectedPkg[bike.id] === pkg.months;
                                    const tot = bike.monthly_rate ? bike.monthly_rate * pkg.months : null;
                                    return (
                                      <button key={pkg.months} className="g51-pkg"
                                        onClick={() => selectPackage(bike, pkg.months)}
                                        style={{ background: isSel ? AMBER + "33" : "transparent", border: `1px solid ${isSel ? AMBER : "#3A352F"}`, borderRadius: 8, color: isSel ? AMBER : "#B5AEA8", fontSize: 12, fontWeight: isSel ? 700 : 400, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                                        {pkg.label}{tot ? ` · AED ${tot.toLocaleString()}` : ""}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                                  <button onClick={() => sendRenewalWhatsApp(group, [bike])} className="g51-btn g51-ghost"
                                    style={{ ...s.actionBtn, color: GREEN, borderColor: GREEN + "55", background: waSent.has(bike.id) ? GREEN + "22" : "transparent" }}>
                                    {waSent.has(bike.id)
                                      ? `✓ Sent${selectedPkg[bike.id] ? ` — ${selectedPkg[bike.id]}m` : ""}`
                                      : selectedPkg[bike.id] ? `WhatsApp — ${selectedPkg[bike.id]}m` : "WhatsApp"}
                                  </button>
                                  {bike.monthly_rate && selectedPkg[bike.id] && (
                                    <button onClick={() => createRenewalPaymentLink(bike)} className="g51-btn g51-ghost"
                                      style={{ ...s.actionBtn, color: "#A78BFA", borderColor: "#A78BFA55" }}>
                                      Payment link · AED {(bike.monthly_rate * selectedPkg[bike.id]).toLocaleString()}
                                    </button>
                                  )}
                                  {/* Payment received — set automatically by the Ziina webhook
                                      when the client pays. No manual action needed. */}
                                  {bike.renewal_paid_at && (
                                    <span style={{ background: GOLD + "22", border: `1px solid ${GOLD}66`, borderRadius: 8, color: GOLD, fontSize: 12.5, fontWeight: 700, padding: "6px 13px" }}>
                                      💳 Payment received
                                    </span>
                                  )}
                                  {/* Create invoice — the final step that closes the billing cycle.
                                      Available once WhatsApp is sent OR payment is received.
                                      Clicking it: updates the end date, stamps renewal_invoiced_at,
                                      clears payment fields, optionally creates a Zoho invoice.
                                      Card naturally moves to green since new end date is in the future. */}
                                  {bike.renewal_paid_at && selectedPkg[bike.id] && (
                                    <button onClick={() => createRenewalInvoice(bike)}
                                      style={{ background: bike.renewal_paid_at ? GOLD + "33" : "#10301C", border: `1px solid ${GOLD}${bike.renewal_paid_at ? "88" : "55"}`, borderRadius: 8, color: GOLD, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", cursor: "pointer", fontFamily: "inherit" }}>
                                      🧾 Create invoice
                                    </button>
                                  )}
                                  {(selectedPkg[bike.id] || waSent.has(bike.id)) && (
                                    <button onClick={() => resetBikePackage(bike.id)}
                                      style={{ background: "transparent", border: "none", color: "#6F6862", fontSize: 12, cursor: "pointer", padding: "4px 6px", fontFamily: "inherit" }}>
                                      ↺ Reset
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Expanded bike details */}
                            {isBikeOpen && (
                              <div style={{ padding: "0 14px 14px" }}>
                                {/* Storage details */}
                                <div style={s.section}>
                                  <div style={s.sectionLabel}>STORAGE DETAILS</div>
                                  <div style={s.fieldRow}>
                                    <label style={s.fieldCtrl}><span style={s.fieldLabel}>Storage start</span>
                                      <input className="g51-input" type="date" value={bike.storage_start_date || ""}
                                        onChange={e => editBikeLocal(bike.id, { storage_start_date: e.target.value || null })}
                                        onBlur={e => saveBikeField(bike.id, "storage_start_date", e.target.value || null)}
                                        style={s.input} /></label>
                                    <label style={s.fieldCtrl}><span style={s.fieldLabel}>Renewal date</span>
                                      <input className="g51-input" type="date" value={bike.storage_end_date || ""}
                                        onChange={e => editBikeLocal(bike.id, { storage_end_date: e.target.value || null })}
                                        onBlur={e => saveBikeField(bike.id, "storage_end_date", e.target.value || null)}
                                        style={s.input} /></label>
                                    <label style={s.fieldCtrl}><span style={s.fieldLabel}>Monthly rate (AED)</span>
                                      <input className="g51-input" type="number" value={bike.monthly_rate || ""}
                                        onChange={e => editBikeLocal(bike.id, { monthly_rate: Number(e.target.value) || null })}
                                        onBlur={e => saveBikeField(bike.id, "monthly_rate", Number(e.target.value) || null)}
                                        style={s.input} /></label>
                                  </div>
                                  <div style={s.fieldRow}>
                                    <label style={s.fieldCtrl}><span style={s.fieldLabel}>Bike number</span>
                                      <input className="g51-input" value={bike.bike_number || ""}
                                        onChange={e => editBikeLocal(bike.id, { bike_number: e.target.value })}
                                        onBlur={e => saveBikeField(bike.id, "bike_number", e.target.value || null)}
                                        placeholder="e.g. Bike 1"
                                        style={s.input} /></label>
                                    <label style={s.fieldCtrl}><span style={s.fieldLabel}>VIN</span>
                                      <input className="g51-input" value={bike.vin || ""}
                                        onChange={e => editBikeLocal(bike.id, { vin: e.target.value })}
                                        onBlur={e => saveBikeField(bike.id, "vin", e.target.value || null)}
                                        style={s.input} /></label>
                                    <label style={s.fieldCtrl}><span style={s.fieldLabel}>Ref. number</span>
                                      <input className="g51-input" value={bike.reference_number || "Assigning…"} readOnly
                                        style={{ ...s.input, color: "#6F6862", cursor: "default" }} /></label>
                                  </div>
                                </div>

                                {/* Service items */}
                                {overdueItems.length > 0 && (
                                  <div style={{ background: RED + "0e", border: `1px solid ${RED}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: RED, marginBottom: 8 }}>SERVICE OVERDUE</div>
                                    {overdueItems.map(due => {
                                      const lastAt = getLastDoneHours(bike.id, due);
                                      const overBy = hoursSince(bike.engine_hours, lastAt) - due.interval_hours;
                                      const isThisOpen = logFormOpen?.bikeId === bike.id && logFormOpen?.itemKey === due.item_key;
                                      return (
                                        <div key={due.item_key} style={{ marginBottom: 10 }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                            <span style={{ flex: "1 1 auto", fontSize: 14, fontWeight: 600 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                            <span style={{ fontSize: 12.5, color: RED, fontWeight: 700 }}>{overBy.toFixed(0)}h overdue</span>
                                            {!isThisOpen && <button onClick={() => openLogForm(bike.id, due.item_key)} className="g51-btn g51-ghost" style={s.actionBtn}>Log service</button>}
                                          </div>
                                          {isThisOpen && <LogForm hrs={logHours} by={logBy} notes={logNotes} setHrs={setLogHours} setBy={setLogBy} setNotes={setLogNotes} loading={loggingItem} onSave={() => submitLog(bike, due)} onCancel={() => setLogFormOpen(null)} />}
                                        </div>
                                      );
                                    })}
                                    <button onClick={() => requestFromClient(group, overdueItems, bike)} className="g51-btn g51-ghost"
                                      style={{ ...s.actionBtn, color: AMBER, borderColor: AMBER + "55" }}>Request from client</button>
                                  </div>
                                )}
                                {dueSoonItems.length > 0 && (
                                  <div style={{ background: AMBER + "0e", border: `1px solid ${AMBER}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: AMBER, marginBottom: 8 }}>SERVICE DUE WITHIN {DUE_SOON_THRESHOLD_HOURS}H</div>
                                    {dueSoonItems.map(due => {
                                      const lastAt = getLastDoneHours(bike.id, due);
                                      const remaining = hoursRemaining(bike.engine_hours, lastAt, due.interval_hours);
                                      const isThisOpen = logFormOpen?.bikeId === bike.id && logFormOpen?.itemKey === due.item_key;
                                      return (
                                        <div key={due.item_key} style={{ marginBottom: 10 }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                            <span style={{ flex: "1 1 auto", fontSize: 14, fontWeight: 600 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                            <span style={{ fontSize: 12.5, color: AMBER, fontWeight: 700 }}>{remaining.toFixed(1)}h left</span>
                                            {!isThisOpen && <button onClick={() => openLogForm(bike.id, due.item_key)} className="g51-btn g51-ghost" style={s.actionBtn}>Log service</button>}
                                          </div>
                                          {isThisOpen && <LogForm hrs={logHours} by={logBy} notes={logNotes} setHrs={setLogHours} setBy={setLogBy} setNotes={setLogNotes} loading={loggingItem} onSave={() => submitLog(bike, due)} onCancel={() => setLogFormOpen(null)} />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {okItems.length > 0 && (
                                  <div style={{ background: "#1B1816", border: "1px solid #2A2623", borderRadius: 10, marginBottom: 10 }}>
                                    <button onClick={() => toggleOk(bike.id)} className="g51-btn"
                                      style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 13px", background: "transparent", border: "none", color: "#9A938D", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
                                      <span>{okItems.length} service items in good standing</span>
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
                                                <span style={{ flex: "1 1 auto", fontSize: 13 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                                <span style={{ fontSize: 11.5, color: GREEN, fontWeight: 600 }}>{remaining.toFixed(0)}h left</span>
                                                {!isThisOpen && <button onClick={() => openLogForm(bike.id, due.item_key)} className="g51-btn g51-ghost" style={{ ...s.actionBtn, fontSize: 11.5 }}>Log</button>}
                                              </div>
                                              {isThisOpen && <LogForm hrs={logHours} by={logBy} notes={logNotes} setHrs={setLogHours} setBy={setLogBy} setNotes={setLogNotes} loading={loggingItem} onSave={() => submitLog(bike, due)} onCancel={() => setLogFormOpen(null)} />}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Service history */}
                                {bikeLog.length > 0 && (
                                  <div style={s.section}>
                                    <div style={s.sectionLabel}>RECENT SERVICE</div>
                                    {bikeLog.map(entry => (
                                      <div key={entry.id} style={{ display: "flex", gap: 10, fontSize: 12, color: "#9A938D", marginBottom: 5, flexWrap: "wrap" }}>
                                        <span style={{ color: "#C9C2BC", fontWeight: 500 }}>{SERVICE_LABEL[entry.item_key] || entry.item_key}</span>
                                        <span>{entry.hours_at_service}h</span>
                                        {entry.performed_by && <span>by {entry.performed_by}</span>}
                                        <span style={{ color: "#6F6862" }}>{new Date(entry.created_at).toLocaleDateString()}</span>
                                        {entry.notes && <span style={{ fontStyle: "italic" }}>{entry.notes}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Edit intervals / remove */}
                                <details style={{ marginTop: 4 }}>
                                  <summary style={{ cursor: "pointer", fontSize: 11.5, color: "#6F6862", fontWeight: 600 }}>Edit service intervals / remove bike</summary>
                                  <div style={{ marginTop: 8 }}>
                                    {dues.map(due => (
                                      <div key={due.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                                        <span style={{ flex: "1 1 140px", fontSize: 12.5 }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                                        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                                          Interval
                                          <input className="g51-input" type="number" value={due.interval_hours}
                                            onChange={e => setServiceDue(prev => prev.map(d => d.id === due.id ? { ...d, interval_hours: Number(e.target.value) } : d))}
                                            onBlur={async e => { await supabase.from("storage_bikes_service_due").update({ interval_hours: Number(e.target.value) }).eq("id", due.id); }}
                                            style={{ ...s.input, width: 56, padding: "4px 7px" }} />h
                                        </label>
                                      </div>
                                    ))}
                                    <button onClick={() => removeBike(bike)} className="g51-btn g51-ghost"
                                      style={{ ...s.actionBtn, color: "#FF7A7A", marginTop: 8 }}>
                                      Remove {bikePrimaryLabel(bike)}
                                    </button>
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. oil brand, parts used" style={{ background: "#221F1D", border: "1px solid #322E2A", borderRadius: 7, color: "#F4F2EF", fontSize: 14, padding: "7px 9px", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />
      </label>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-end", paddingBottom: 1 }}>
        <button disabled={loading} onClick={onSave} style={{ background: "#2FBF71", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", cursor: "pointer" }}>{loading ? "Saving…" : "Save"}</button>
        <button onClick={onCancel} style={{ background: "transparent", border: "1px solid #3A352F", borderRadius: 7, color: "#9A938D", fontSize: 13, padding: "8px 10px", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 60, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623", position: "sticky", top: 0, background: "#181615", zIndex: 50 },
  logo: { height: 30, width: "auto" },
  menuBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  menuOverlay: { position: "fixed", inset: 0, zIndex: 48 } as CSSProperties,
  menuDropdown: { position: "absolute", top: 57, right: 16, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 13, padding: "6px", zIndex: 49, minWidth: 200, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" } as CSSProperties,
  menuItem: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#F4F2EF", fontSize: 15, fontWeight: 500, padding: "12px 14px", cursor: "pointer", borderRadius: 9, fontFamily: "inherit" } as CSSProperties,
  menuDivider: { height: 1, background: "#2A2623", margin: "4px 0" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  primaryBtn: { background: "#ED1C24", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  actionBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 },
  wrap: { maxWidth: 900, margin: "0 auto", padding: "24px 16px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 18px" },
  empty: { color: "#8C857F", textAlign: "center" as const, padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  // Group card
  groupCard: { background: "#1E1B19", border: "1px solid #2F2B27", borderRadius: 14, overflow: "hidden" },
  groupHead: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  groupAvatar: { width: 38, height: 38, borderRadius: "50%", background: "#3B9EFF22", color: "#3B9EFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 },
  groupName: { fontWeight: 700, fontSize: 16 },
  groupCount: { fontSize: 11, color: "#6F6862", background: "#2A2623", borderRadius: 20, padding: "2px 8px" },
  badge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" as const },
  // Bike card within group
  bikeHead: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", background: "#221F1D" },
  bikePrimary: { fontWeight: 600, fontSize: 14.5 },
  refTag: { fontFamily: "monospace", fontSize: 11, fontWeight: 700, background: "#2A2623", color: "#9A938D", borderRadius: 6, padding: "2px 7px", letterSpacing: "0.04em" },
  bikeNumTag: { fontSize: 11, color: "#6F6862", background: "#2A2623", borderRadius: 6, padding: "2px 7px" },
  // Sections within expanded view
  section: { padding: "12px 16px" },
  sectionHead: { fontWeight: 700, fontSize: 15, padding: "14px 17px 10px" },
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#6F6862", marginBottom: 8 },
  fieldRow: { display: "flex", gap: 10, flexWrap: "wrap" as const },
  fieldCtrl: { display: "grid", gap: 5, flex: "1 1 160px" },
  fieldLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box" as const, background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "9px 12px", fontFamily: "inherit" },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" as const },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};
