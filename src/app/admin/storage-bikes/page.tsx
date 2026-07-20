x"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
// bikeServiceShared no longer used — service tracking is now fully custom per bike

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
  service_request_text: string | null;
  service_request_cost: number | null;
  service_request_sent_at: string | null;
  service_enquiry_id: string | null;
  service_completed_at: string | null;
};
type ServiceEnquiry = {
  id: string; job_status: string | null; stage: string;
  estimated_value: number; paid_at: string | null;
  payment_intent_id: string | null; work_required: string | null;
  assigned_to: string | null;
};
type StaffProfile = { id: string; name: string | null; role: string };
type SbServiceItem = {
  id: string; bike_id: string; name: string;
  interval_hours: number | null; last_done_hours: number | null;
  active: boolean;
};
type SbServiceLog = {
  id: string; bike_id: string; item_id: string | null; item_name: string;
  done_at: string; done_at_hours: number | null; performed_by: string | null; notes: string | null;
  created_at: string;
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
  const [search, setSearch] = useState("");
  const [myName, setMyName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bikes, setBikes] = useState<StorageBike[]>([]);
  const [svcItems, setSvcItems] = useState<SbServiceItem[]>([]);
  const [svcLogs, setSvcLogs] = useState<SbServiceLog[]>([]);
  const [enquiries, setEnquiries] = useState<StorageEnquiry[]>([]);
  const [expandedBikes, setExpandedBikes] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ ...BLANK_BIKE });
  const [selectedPkg, setSelectedPkg] = useState<Record<string, number>>({});
  const [waSent, setWaSent] = useState<Set<string>>(new Set());
  const [pendingClient, setPendingClient] = useState<Record<string, { name: string; phone: string; email: string }>>({});
  const [savingClient, setSavingClient] = useState<Record<string, boolean>>({});
  // Custom service log state
  const [newItemPanel, setNewItemPanel] = useState<string | null>(null); // bikeId
  const [newItemForm, setNewItemForm] = useState({ name: "", intervalHours: "" });
  const [logPanel, setLogPanel] = useState<string | null>(null); // itemId
  const [logForm, setLogForm] = useState({ doneAt: new Date().toISOString().slice(0, 10), doneHours: "", by: "", notes: "" });
  const [savingLog, setSavingLog] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  // Service request flow state
  const [servicePanel, setServicePanel] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<Record<string, { text: string; cost: string }>>({});
  const [jobCardPanel, setJobCardPanel] = useState<string | null>(null);
  const [jobCardForm, setJobCardForm] = useState({ work: "", assignedTo: "", amount: "", date: "" });
  const [creatingJob, setCreatingJob] = useState(false);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [serviceEnquiries, setServiceEnquiries] = useState<Record<string, ServiceEnquiry>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("id, name").eq("id", data.session.user.id).single();
      if (prof) setMyName((prof as { name: string | null }).name);
      const [{ data: b }, { data: sd }, { data: sl }, { data: enq }, { data: profData }] = await Promise.all([
        supabase.from("storage_bikes").select("*").eq("active", true).order("reference_number"),
        supabase.from("sb_service_items").select("*").eq("active", true).order("created_at"),
        supabase.from("sb_service_log").select("*").order("created_at", { ascending: false }),
        supabase.from("enquiries").select("id,customer_name,phone,email,bike_details,storage_start_date,storage_end_date").eq("service_type", "motorcycle_storage"),
        supabase.from("profiles").select("id,name,role").eq("active", true),
      ]);
      const bikeList = (b as StorageBike[]) || [];
      setBikes(bikeList);
      setSvcItems((sd as SbServiceItem[]) || []);
      setSvcLogs((sl as SbServiceLog[]) || []);
      setEnquiries((enq as StorageEnquiry[]) || []);
      setProfiles((profData as StaffProfile[]) || []);

      // Load linked service enquiries for bikes that have one
      const svcIds = bikeList.map(bk => bk.service_enquiry_id).filter(Boolean) as string[];
      if (svcIds.length > 0) {
        const { data: svcEnqData } = await supabase
          .from("enquiries")
          .select("id,job_status,stage,estimated_value,paid_at,payment_intent_id,work_required,assigned_to")
          .in("id", svcIds);
        const enqMap: Record<string, ServiceEnquiry> = {};
        for (const e of (svcEnqData || [])) { enqMap[(e as ServiceEnquiry).id] = e as ServiceEnquiry; }
        setServiceEnquiries(enqMap);
      }

      const groupKeys = new Set<string>();
      for (const bk of bikeList) {
        groupKeys.add(bk.client_phone || `name:${bk.client_name || bk.id}`);
      }
      setExpandedGroups(groupKeys);
      setReady(true);

      // Realtime: storage bike field updates (renewal + service fields)
      const bikesChannel = supabase
        .channel("storage_bikes_changes")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "storage_bikes" }, (payload) => {
          const updated = payload.new as StorageBike;
          setBikes(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
        })
        .subscribe();

      // Realtime: enquiry payment updates (service job paid_at)
      const enqChannel = supabase
        .channel("service_enquiries_changes")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "enquiries" }, (payload) => {
          const updated = payload.new as ServiceEnquiry;
          setServiceEnquiries(prev => prev[updated.id] ? { ...prev, [updated.id]: { ...prev[updated.id], ...updated } } : prev);
        })
        .subscribe();

      return () => { supabase.removeChannel(bikesChannel); supabase.removeChannel(enqChannel); };
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

  // ---- custom service item helpers ----
  function itemDueStatus(item: SbServiceItem, bikeHours: number): "due" | "due_soon" | "ok" | "manual" {
    if (!item.interval_hours) return "manual";
    const since = bikeHours - (item.last_done_hours ?? 0);
    if (since >= item.interval_hours) return "due";
    if (since >= item.interval_hours - 5) return "due_soon";
    return "ok";
  }
  function bikeHasServiceDue(bike: StorageBike): boolean {
    return svcItems.filter(i => i.bike_id === bike.id).some(i => {
      const s = itemDueStatus(i, bike.engine_hours);
      return s === "due" || s === "due_soon";
    });
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

  const filterCounts = useMemo(() => ({
    all: bikes.length,
    renewal_overdue: bikes.filter(b => renewalStatus(b.storage_end_date, b.renewal_paid_at) === "overdue").length,
    renewal_due: bikes.filter(b => renewalStatus(b.storage_end_date, b.renewal_paid_at) === "due_soon").length,
    service_due: bikes.filter(b => bikeHasServiceDue(b)).length,
    attention: bikes.filter(b => {
      const rs = renewalStatus(b.storage_end_date, b.renewal_paid_at);
      return rs === "overdue" || rs === "due_soon" || rs === "paid" || bikeHasServiceDue(b);
    }).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [bikes, svcItems]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    let groups = filterMode === "all"
      ? clientGroups
      : clientGroups.map(group => ({ ...group, bikes: group.bikes.filter(bikeMatchesFilter) })).filter(g => g.bikes.length > 0);
    if (q) {
      groups = groups.map(group => {
        const clientMatch = group.name.toLowerCase().includes(q) || group.phone.includes(q) || (group.email || "").toLowerCase().includes(q);
        if (clientMatch) return group;
        return { ...group, bikes: group.bikes.filter(b => bikePrimaryLabel(b).toLowerCase().includes(q) || (b.reference_number || "").toLowerCase().includes(q) || (b.vin || "").toLowerCase().includes(q) || (b.bike_number || "").toLowerCase().includes(q)) };
      }).filter(g => g.bikes.length > 0);
    }
    return groups;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientGroups, filterMode, svcItems, search]);

  async function addServiceItem(bikeId: string, bike: StorageBike) {
    if (!newItemForm.name.trim()) { showToast("Enter an item name.", "err"); return; }
    const { data, error } = await supabase.from("sb_service_items").insert({
      bike_id: bikeId,
      name: newItemForm.name.trim(),
      interval_hours: newItemForm.intervalHours ? Number(newItemForm.intervalHours) : null,
      last_done_hours: newItemForm.intervalHours ? bike.engine_hours : null,
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not add item.", "err"); return; }
    setSvcItems(prev => [...prev, data as SbServiceItem]);
    setNewItemPanel(null);
    setNewItemForm({ name: "", intervalHours: "" });
    showToast(`"${(data as SbServiceItem).name}" added.`);
  }

  async function removeServiceItem(item: SbServiceItem) {
    await supabase.from("sb_service_items").update({ active: false }).eq("id", item.id);
    setSvcItems(prev => prev.filter(i => i.id !== item.id));
  }

  async function logServiceDone(item: SbServiceItem, bike: StorageBike) {
    setSavingLog(true);
    const doneHours = logForm.doneHours ? Number(logForm.doneHours) : null;
    const { data, error } = await supabase.from("sb_service_log").insert({
      bike_id: bike.id, item_id: item.id, item_name: item.name,
      done_at: logForm.doneAt || new Date().toISOString().slice(0, 10),
      done_at_hours: doneHours, performed_by: logForm.by.trim() || null, notes: logForm.notes.trim() || null,
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not log.", "err"); setSavingLog(false); return; }
    // Update last_done_hours on the item so status recalculates
    if (doneHours) {
      await supabase.from("sb_service_items").update({ last_done_hours: doneHours }).eq("id", item.id);
      setSvcItems(prev => prev.map(i => i.id === item.id ? { ...i, last_done_hours: doneHours } : i));
    }
    setSvcLogs(prev => [data as SbServiceLog, ...prev]);
    setLogPanel(null);
    setLogForm({ doneAt: new Date().toISOString().slice(0, 10), doneHours: "", by: "", notes: "" });
    setSavingLog(false);
    showToast(`${item.name} logged.`);
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
  function buildRenewalMsg(group: ClientGroup, bikes: StorageBike[], paymentLinks: Record<string, string> = {}) {
    const name = pendingClient[group.key]?.name || group.name || "there";
    let msg = `Hi ${name}, your motorcycle storage at Garage51 is due for renewal 🏍️\n\n`;
    let grandTotal = 0;

    // Detect combined payment: all bikes share the same link URL
    const uniqueLinks = new Set(Object.values(paymentLinks));
    const isCombined = uniqueLinks.size === 1 && bikes.length > 1;
    const combinedLink = isCombined ? [...uniqueLinks][0] : null;

    bikes.forEach((bike, i) => {
      const months = selectedPkg[bike.id];
      const rate = bike.monthly_rate || 0;
      const total = months ? rate * months : rate;
      grandTotal += total;
      const newEnd = months
        ? addMonths(bike.storage_end_date || bike.storage_start_date, months)
        : null;
      if (bikes.length > 1) msg += `${i + 1}. `;
      msg += `${bikePrimaryLabel(bike)}`;
      if (bike.reference_number) msg += ` (${bike.reference_number})`;
      msg += `\n`;
      if (months) msg += `   Package: ${months} month${months > 1 ? "s" : ""} · AED ${total.toLocaleString()}\n`;
      if (newEnd) msg += `   New end date: ${fmtDate(newEnd)}\n`;
      // Only show per-bike link when NOT using a combined link
      if (!isCombined && paymentLinks[bike.id]) msg += `   Pay securely: ${paymentLinks[bike.id]}\n`;
      msg += `\n`;
    });

    if (grandTotal > 0) msg += `Total: AED ${grandTotal.toLocaleString()}\n`;
    // Combined link shown once after the total — clean and unambiguous
    if (combinedLink) msg += `Pay securely: ${combinedLink}\n`;
    msg += `\n`;
    msg += `To cancel your storage, simply reply *"cancel renewal"* and we'll arrange your motorcycle collection and settle any outstanding pro-rata storage fees. 🙏`;
    return msg;
  }

  async function sendRenewalWhatsApp(group: ClientGroup, targetBikes: StorageBike[]) {
    const phone = pendingClient[group.key]?.phone || group.phone;
    if (!phone) { showToast("No phone number for this client.", "err"); return; }

    const billableBikes = targetBikes.filter(b => selectedPkg[b.id] && (b.monthly_rate || 0) > 0);
    const grandTotal = billableBikes.reduce((sum, b) => sum + (b.monthly_rate! * selectedPkg[b.id]), 0);
    const paymentLinks: Record<string, string> = {};

    if (billableBikes.length > 1 && grandTotal > 0) {
      // COMBINED: one payment link for all bikes — stored on every bike so the
      // webhook's .eq("renewal_payment_intent_id", id) updates all of them at once.
      try {
        const bikeNames = billableBikes.map(b =>
          `${bikePrimaryLabel(b)}${b.reference_number ? ` (${b.reference_number})` : ""}`
        ).join(", ");
        const res = await fetch("/api/payment-link", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: grandTotal, description: `Storage renewal — ${bikeNames}` }),
        });
        const json = await res.json();
        if (json.url && json.id) {
          for (const bike of billableBikes) {
            await supabase.from("storage_bikes").update({
              renewal_payment_intent_id: json.id, renewal_paid_at: null,
            }).eq("id", bike.id);
            editBikeLocal(bike.id, { renewal_payment_intent_id: json.id, renewal_paid_at: null });
            paymentLinks[bike.id] = json.url; // same URL on all → buildRenewalMsg detects combined
          }
        }
      } catch { /* message still opens without link */ }

    } else if (billableBikes.length === 1) {
      // SINGLE: individual payment link for that one bike
      const bike = billableBikes[0];
      const months = selectedPkg[bike.id];
      try {
        const res = await fetch("/api/payment-link", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: (bike.monthly_rate || 0) * months,
            description: `Storage renewal ${months}m — ${bikePrimaryLabel(bike)}${bike.reference_number ? ` (${bike.reference_number})` : ""}`,
          }),
        });
        const json = await res.json();
        if (json.url && json.id) {
          paymentLinks[bike.id] = json.url;
          await supabase.from("storage_bikes").update({
            renewal_payment_intent_id: json.id, renewal_paid_at: null,
          }).eq("id", bike.id);
          editBikeLocal(bike.id, { renewal_payment_intent_id: json.id, renewal_paid_at: null });
        }
      } catch { /* proceed without link */ }
    }

    const msg = buildRenewalMsg(group, targetBikes, paymentLinks);
    window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
    setWaSent(prev => {
      const next = new Set(prev);
      targetBikes.forEach(b => next.add(b.id));
      return next;
    });
    const linkCount = Object.keys(paymentLinks).length;
    if (linkCount > 0) {
      const isCombined = new Set(Object.values(paymentLinks)).size === 1 && billableBikes.length > 1;
      showToast(isCombined
        ? `WhatsApp opened with combined payment link · AED ${grandTotal.toLocaleString()}`
        : "WhatsApp opened with payment link included."
      );
    }
  }

  // ---- service request functions ----

  async function sendServiceRequest(bike: StorageBike, group: ClientGroup) {
    const phone = pendingClient[group.key]?.phone || group.phone;
    if (!phone) { showToast("No client phone number.", "err"); return; }
    const draft = serviceDraft[bike.id] || { text: bike.service_request_text || "", cost: String(bike.service_request_cost || "") };
    if (!draft.text.trim()) { showToast("Describe the service first.", "err"); return; }
    const name = group.name || bike.client_name || "there";
    const costLine = draft.cost && Number(draft.cost) > 0
      ? `\nEstimated cost: AED ${Number(draft.cost).toLocaleString()}`
      : "";
    const msg =
      `Hi ${name}, we're checking in on your ${bikePrimaryLabel(bike)} in storage at Garage51 🔧\n\n` +
      `Service required:\n${draft.text}${costLine}\n\n` +
      `This work isn't included in your storage plan and will be invoiced separately. ` +
      `Please reply *YES* to confirm you'd like us to proceed, or let us know if you have any questions.`;
    window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
    const now = new Date().toISOString();
    const cost = draft.cost && Number(draft.cost) > 0 ? Number(draft.cost) : null;
    await supabase.from("storage_bikes").update({
      service_request_text: draft.text.trim(),
      service_request_cost: cost,
      service_request_sent_at: now,
    }).eq("id", bike.id);
    editBikeLocal(bike.id, { service_request_text: draft.text.trim(), service_request_cost: cost, service_request_sent_at: now });
    setServicePanel(null);
    showToast("Service request sent via WhatsApp.");
  }

  async function createJobCard(bike: StorageBike, group: ClientGroup) {
    if (!jobCardForm.work.trim()) { showToast("Describe the work required.", "err"); return; }
    if (!jobCardForm.amount || Number(jobCardForm.amount) < 1) { showToast("Enter an estimated amount.", "err"); return; }
    setCreatingJob(true);
    const { data, error } = await supabase.from("enquiries").insert({
      service_type: "workshop",
      customer_name: bike.client_name || group.name || bike.name,
      phone: bike.client_phone || group.phone || null,
      email: bike.client_email || group.email || null,
      stage: "booked",
      job_status: "queued",
      bike_details: bikePrimaryLabel(bike),
      bike_year: bike.year || null,
      vin: bike.vin || null,
      work_required: jobCardForm.work.trim(),
      assigned_to: jobCardForm.assignedTo || null,
      estimated_value: Number(jobCardForm.amount),
      preferred_date: jobCardForm.date || null,
      notes: `Storage bike ${bike.reference_number || bike.id.slice(0, 8)} — service confirmed by client`,
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not create job.", "err"); setCreatingJob(false); return; }
    const enqId = (data as { id: string }).id;
    await supabase.from("storage_bikes").update({ service_enquiry_id: enqId }).eq("id", bike.id);
    editBikeLocal(bike.id, { service_enquiry_id: enqId });
    setServiceEnquiries(prev => ({ ...prev, [enqId]: { ...data as ServiceEnquiry } }));
    setJobCardPanel(null);
    setJobCardForm({ work: "", assignedTo: "", amount: "", date: "" });
    setCreatingJob(false);
    showToast("Job card created — now in the workshop queue.");
  }

  async function sendServicePaymentWhatsApp(bike: StorageBike, group: ClientGroup, enq: ServiceEnquiry) {
    const phone = pendingClient[group.key]?.phone || group.phone;
    if (!phone) { showToast("No client phone number.", "err"); return; }
    const amount = enq.estimated_value;
    const name = group.name || bike.client_name || "there";
    let paymentUrl = "";
    if (amount > 0) {
      try {
        const res = await fetch("/api/payment-link", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            description: `Service — ${bikePrimaryLabel(bike)}${bike.reference_number ? ` (${bike.reference_number})` : ""}`,
          }),
        });
        const json = await res.json();
        if (json.url && json.id) {
          paymentUrl = json.url;
          await supabase.from("enquiries").update({ payment_intent_id: json.id }).eq("id", enq.id);
          setServiceEnquiries(prev => ({ ...prev, [enq.id]: { ...prev[enq.id], payment_intent_id: json.id } }));
        }
      } catch { /* proceed without link */ }
    }
    const msg = `Hi ${name}, we've scheduled the service for your ${bikePrimaryLabel(bike)} at Garage51! 🔧\n\n` +
      `Work: ${enq.work_required || jobCardForm.work}\n` +
      `Amount: AED ${amount.toLocaleString()}\n\n` +
      (paymentUrl ? `Pay securely here:\n${paymentUrl}\n\n` : "") +
      `Let us know if you have any questions. Thank you! 🙏`;
    window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
    showToast("WhatsApp opened with payment link.");
  }

  async function createServiceInvoice(bike: StorageBike, enq: ServiceEnquiry) {
    const amount = enq.estimated_value;
    const now = new Date().toISOString();
    // Create Zoho invoice
    if (amount > 0) {
      try {
        const res = await fetch("/api/zoho/create-invoice", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: bike.client_name || bike.name,
            phone: bike.client_phone || null,
            email: bike.client_email || null,
            line_item_name: "Motorcycle Service",
            line_item_description: enq.work_required || `Service — ${bikePrimaryLabel(bike)}`,
            amount,
          }),
        });
        const json = await res.json();
        if (json.zoho_invoice_number) {
          showToast(`Invoice ${json.zoho_invoice_number} created ✓`);
        } else {
          showToast(`Invoice created ✓ (Zoho: ${json.error || "unavailable"})`);
        }
      } catch { showToast("Invoice marked — Zoho unavailable."); }
    }
    // Mark service cycle complete on the bike
    await supabase.from("storage_bikes").update({ service_completed_at: now }).eq("id", bike.id);
    editBikeLocal(bike.id, { service_completed_at: now });
    // Mark enquiry as paid/complete
    await supabase.from("enquiries").update({ stage: "paid", job_status: "completed" }).eq("id", enq.id);
    setServiceEnquiries(prev => ({ ...prev, [enq.id]: { ...prev[enq.id], stage: "paid", job_status: "completed" } }));
  }

  async function resetServiceRequest(bike: StorageBike) {
    await supabase.from("storage_bikes").update({
      service_request_text: null, service_request_cost: null,
      service_request_sent_at: null, service_enquiry_id: null, service_completed_at: null,
    }).eq("id", bike.id);
    editBikeLocal(bike.id, { service_request_text: null, service_request_cost: null, service_request_sent_at: null, service_enquiry_id: null, service_completed_at: null });
    showToast("Service request cleared.");
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
    setBikes(prev => [...prev, bike].sort((a, b) => (a.reference_number || "").localeCompare(b.reference_number || "")));
    setCreating(false); setForm({ ...BLANK_BIKE }); setAdding(false);
    showToast(`Added ${bikePrimaryLabel(bike)} — ref ${bike.reference_number || "pending"}. Open the bike to add service items.`);
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

        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setAdding(a => !a)} className="g51-btn g51-ghost" style={s.ghostBtn}>{adding ? "Cancel" : "+ Add bike"}</button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6F6862", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="g51-input"
            placeholder="Search by client name, phone, email, or bike…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...s.input, paddingLeft: 36, width: "100%" }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
              ×
            </button>
          )}
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
            {search
              ? `No bikes match "${search}".`
              : filterMode === "all" ? "No storage bikes yet." : `No bikes in the "${filterMode.replace(/_/g, " ")}" category.`}
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
                          : group.bikes.length > 1 ? "WhatsApp all + payment links" : "WhatsApp + payment link"}
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
                        const bikeItems = svcItems.filter(i => i.bike_id === bike.id);
                        const dueItems = bikeItems.filter(i => itemDueStatus(i, bike.engine_hours) === "due");
                        const dueSoonItemsList = bikeItems.filter(i => itemDueStatus(i, bike.engine_hours) === "due_soon");
                        const isBikeOpen = expandedBikes.has(bike.id);
                        const rs = renewalStatus(bike.storage_end_date, bike.renewal_paid_at);
                        const daysLeft = daysUntil(bike.storage_end_date);
                        const total = bikeItems.filter(i => i.interval_hours).length;
                        const overdueW = total > 0 ? (dueItems.length / total) * 100 : 0;
                        const dueSoonW = total > 0 ? (dueSoonItemsList.length / total) * 100 : 0;
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
                                    ? "💳 Payment received — confirm the renewal period and create the invoice"
                                    : rs === "overdue"
                                    ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} overdue`
                                    : `Due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                                </div>

                                {/* Package selector */}
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                  {STORAGE_PACKAGES.map(pkg => {
                                    const isSel = selectedPkg[bike.id] === pkg.months;
                                    const tot = bike.monthly_rate ? bike.monthly_rate * pkg.months : null;
                                    const selColor = rs === "paid" ? GOLD : AMBER;
                                    return (
                                      <button key={pkg.months} className="g51-pkg"
                                        onClick={() => selectPackage(bike, pkg.months)}
                                        style={{ background: isSel ? selColor + "33" : "transparent", border: `1px solid ${isSel ? selColor : "#3A352F"}`, borderRadius: 8, color: isSel ? selColor : "#B5AEA8", fontSize: 12, fontWeight: isSel ? 700 : 400, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                                        {pkg.label}{tot ? ` · AED ${tot.toLocaleString()}` : ""}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* PRE-PAYMENT: WhatsApp (now auto-creates and includes payment link) */}
                                {!bike.renewal_paid_at && (
                                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                                    <button onClick={() => sendRenewalWhatsApp(group, [bike])} className="g51-btn g51-ghost"
                                      style={{ ...s.actionBtn, color: GREEN, borderColor: GREEN + "55", background: waSent.has(bike.id) ? GREEN + "22" : "transparent" }}>
                                      {waSent.has(bike.id)
                                        ? `✓ Sent${selectedPkg[bike.id] ? ` — ${selectedPkg[bike.id]}m` : ""}`
                                        : selectedPkg[bike.id] ? `WhatsApp + payment link — ${selectedPkg[bike.id]}m` : "WhatsApp"}
                                    </button>
                                    {(selectedPkg[bike.id] || waSent.has(bike.id)) && (
                                      <button onClick={() => resetBikePackage(bike.id)}
                                        style={{ background: "transparent", border: "none", color: "#6F6862", fontSize: 12, cursor: "pointer", padding: "4px 6px", fontFamily: "inherit" }}>
                                        ↺ Reset
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* POST-PAYMENT: create invoice only */}
                                {bike.renewal_paid_at && (
                                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                                    {selectedPkg[bike.id] ? (
                                      <button onClick={() => createRenewalInvoice(bike)}
                                        style={{ background: GOLD + "33", border: `1px solid ${GOLD}88`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" }}>
                                        🧾 Create invoice · AED {bike.monthly_rate ? (bike.monthly_rate * selectedPkg[bike.id]).toLocaleString() : ""}
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 12.5, color: GOLD + "AA" }}>← Select a renewal period above</span>
                                    )}
                                    {selectedPkg[bike.id] && (
                                      <button onClick={() => resetBikePackage(bike.id)}
                                        style={{ background: "transparent", border: "none", color: "#6F6862", fontSize: 12, cursor: "pointer", padding: "4px 6px", fontFamily: "inherit" }}>
                                        ↺ Reset
                                      </button>
                                    )}
                                  </div>
                                )}
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

                                {/* ---- SERVICE REQUEST ---- */}
                                {(() => {
                                  const svcEnq = bike.service_enquiry_id ? serviceEnquiries[bike.service_enquiry_id] : null;
                                  const isComplete = !!bike.service_completed_at;
                                  return (
                                    <div style={{ ...s.section, borderTop: "1px solid #2A2623", marginTop: 8 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <div style={s.sectionLabel}>SERVICE REQUEST</div>
                                        {(bike.service_request_sent_at || bike.service_enquiry_id) && (
                                          <button onClick={() => resetServiceRequest(bike)}
                                            style={{ background: "transparent", border: "none", color: "#6F6862", fontSize: 11.5, cursor: "pointer" }}>
                                            ↺ Clear
                                          </button>
                                        )}
                                      </div>

                                      {/* STATE 1 — Request panel */}
                                      {!bike.service_request_sent_at && !bike.service_enquiry_id && (
                                        servicePanel === bike.id ? (
                                          <div>
                                            <label style={{ ...s.fieldCtrl, width: "100%", marginBottom: 8 }}>
                                              <span style={s.fieldLabel}>Service description</span>
                                              <textarea className="g51-input"
                                                value={serviceDraft[bike.id]?.text ?? (bike.service_request_text || "")}
                                                onChange={e => setServiceDraft(prev => ({ ...prev, [bike.id]: { ...prev[bike.id], text: e.target.value, cost: prev[bike.id]?.cost ?? "" } }))}
                                                placeholder="e.g. Oil change, chain adjustment, brake pad replacement…"
                                                rows={3} style={{ ...s.input, width: "100%", resize: "vertical" }} />
                                            </label>
                                            <label style={{ ...s.fieldCtrl, width: "100%", marginBottom: 10 }}>
                                              <span style={s.fieldLabel}>Estimated cost (AED)</span>
                                              <input className="g51-input" type="number"
                                                value={serviceDraft[bike.id]?.cost ?? (bike.service_request_cost ? String(bike.service_request_cost) : "")}
                                                onChange={e => setServiceDraft(prev => ({ ...prev, [bike.id]: { ...prev[bike.id], text: prev[bike.id]?.text ?? "", cost: e.target.value } }))}
                                                placeholder="Included in the WhatsApp message" style={s.input} />
                                            </label>
                                            <div style={{ display: "flex", gap: 8 }}>
                                              <button onClick={() => sendServiceRequest(bike, group)}
                                                style={{ background: "#3B9EFF", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 16px", cursor: "pointer" }}>
                                                Send WhatsApp request
                                              </button>
                                              <button onClick={() => setServicePanel(null)} className="g51-btn g51-ghost" style={s.actionBtn}>Cancel</button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setServicePanel(bike.id);
                                              setServiceDraft(prev => ({ ...prev, [bike.id]: { text: bike.service_request_text || "", cost: bike.service_request_cost ? String(bike.service_request_cost) : "" } }));
                                            }}
                                            className="g51-btn g51-ghost" style={s.actionBtn}>
                                            + Request service from client
                                          </button>
                                        )
                                      )}

                                      {/* STATE 2 — Request sent, awaiting job card creation */}
                                      {bike.service_request_sent_at && !bike.service_enquiry_id && (
                                        <div>
                                          <div style={{ fontSize: 12.5, color: "#3B9EFF", fontWeight: 600, marginBottom: 4 }}>
                                            ✓ Request sent · {fmtDate(bike.service_request_sent_at)}
                                          </div>
                                          <div style={{ fontSize: 12.5, color: "#9A938D", marginBottom: bike.service_request_cost ? 2 : 10, fontStyle: "italic" }}>
                                            {bike.service_request_text}
                                          </div>
                                          {bike.service_request_cost && (
                                            <div style={{ fontSize: 12.5, color: "#9A938D", marginBottom: 10 }}>
                                              Estimate quoted: <strong style={{ color: "#C9C2BC" }}>AED {bike.service_request_cost.toLocaleString()}</strong>
                                            </div>
                                          )}

                                          {jobCardPanel === bike.id ? (
                                            /* ---- Job card form ---- */
                                            <div style={{ background: "#141211", border: "1px solid #3A352F", borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
                                              {/* Header: client + bike context */}
                                              <div style={{ background: "#1B1816", borderBottom: "1px solid #2A2623", padding: "12px 14px" }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#6F6862", marginBottom: 8 }}>JOB CARD</div>
                                                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                                  <div>
                                                    <div style={{ fontSize: 10, color: "#6F6862", marginBottom: 2 }}>CLIENT</div>
                                                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{bike.client_name || group.name}</div>
                                                    {(bike.client_phone || group.phone) && <div style={{ fontSize: 12, color: "#9A938D" }}>{bike.client_phone || group.phone}</div>}
                                                  </div>
                                                  <div>
                                                    <div style={{ fontSize: 10, color: "#6F6862", marginBottom: 2 }}>BIKE</div>
                                                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{bikePrimaryLabel(bike)}</div>
                                                    <div style={{ fontSize: 12, color: "#9A938D" }}>
                                                      {bike.reference_number && <span>{bike.reference_number}</span>}
                                                      {bike.vin && <span> · VIN: {bike.vin}</span>}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Editable job details */}
                                              <div style={{ padding: "12px 14px" }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#6F6862", marginBottom: 10 }}>JOB DETAILS</div>
                                                <div style={s.fieldRow}>
                                                  <label style={{ ...s.fieldCtrl, flex: "2 1 200px" }}>
                                                    <span style={s.fieldLabel}>Work required</span>
                                                    <textarea className="g51-input" value={jobCardForm.work}
                                                      onChange={e => setJobCardForm(f => ({ ...f, work: e.target.value }))}
                                                      rows={3} style={{ ...s.input, resize: "vertical" }} />
                                                  </label>
                                                  <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: 8 }}>
                                                    <label style={s.fieldCtrl}>
                                                      <span style={s.fieldLabel}>Estimated value (AED)</span>
                                                      <input className="g51-input" type="number" value={jobCardForm.amount}
                                                        onChange={e => setJobCardForm(f => ({ ...f, amount: e.target.value }))} style={s.input} />
                                                    </label>
                                                    <label style={s.fieldCtrl}>
                                                      <span style={s.fieldLabel}>Preferred date</span>
                                                      <input className="g51-input" type="date" value={jobCardForm.date}
                                                        onChange={e => setJobCardForm(f => ({ ...f, date: e.target.value }))} style={s.input} />
                                                    </label>
                                                  </div>
                                                </div>
                                                <label style={{ ...s.fieldCtrl, marginTop: 8, width: "100%" }}>
                                                  <span style={s.fieldLabel}>Assign to</span>
                                                  <select className="g51-input" value={jobCardForm.assignedTo}
                                                    onChange={e => setJobCardForm(f => ({ ...f, assignedTo: e.target.value }))} style={s.input}>
                                                    <option value="">Unassigned</option>
                                                    {profiles.filter(p => p.role === "mechanic" || p.role === "admin").map(p => (
                                                      <option key={p.id} value={p.id}>{p.name || p.id}</option>
                                                    ))}
                                                  </select>
                                                </label>
                                                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                                  <button onClick={() => createJobCard(bike, group)} disabled={creatingJob}
                                                    style={{ background: "#ED1C24", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 18px", cursor: "pointer", opacity: creatingJob ? 0.6 : 1 }}>
                                                    {creatingJob ? "Creating…" : "Push to workshop queue"}
                                                  </button>
                                                  <button onClick={() => setJobCardPanel(null)} className="g51-btn g51-ghost" style={s.actionBtn}>Cancel</button>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setJobCardPanel(bike.id);
                                                setJobCardForm({
                                                  work: bike.service_request_text || "",
                                                  assignedTo: "",
                                                  amount: bike.service_request_cost ? String(bike.service_request_cost) : "",
                                                  date: "",
                                                });
                                              }}
                                              style={{ background: "#ED1C2422", border: "1px solid #ED1C2466", borderRadius: 8, color: "#ED1C24", fontSize: 13, fontWeight: 700, padding: "7px 14px", cursor: "pointer" }}>
                                              Client confirmed — create job card →
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {/* STATE 3 — Job in queue, payment flow */}
                                      {svcEnq && !isComplete && (
                                        <div>
                                          <div style={{ background: "#1B1816", border: "1px solid #2A2623", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#3B9EFF", marginBottom: 6 }}>JOB IN WORKSHOP QUEUE</div>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{svcEnq.work_required}</div>
                                            <div style={{ fontSize: 12, color: "#9A938D", marginTop: 3 }}>
                                              {svcEnq.job_status} · AED {svcEnq.estimated_value.toLocaleString()}
                                              {profiles.find(p => p.id === svcEnq.assigned_to)?.name && ` · ${profiles.find(p => p.id === svcEnq.assigned_to)!.name}`}
                                            </div>
                                          </div>
                                          {!svcEnq.paid_at ? (
                                            <button onClick={() => sendServicePaymentWhatsApp(bike, group, svcEnq)}
                                              style={{ background: GREEN + "22", border: `1px solid ${GREEN}55`, borderRadius: 8, color: GREEN, fontSize: 13, fontWeight: 700, padding: "7px 14px", cursor: "pointer" }}>
                                              WhatsApp + payment link · AED {svcEnq.estimated_value.toLocaleString()}
                                            </button>
                                          ) : (
                                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                              <span style={{ background: GOLD + "22", border: `1px solid ${GOLD}66`, borderRadius: 8, color: GOLD, fontSize: 12.5, fontWeight: 700, padding: "6px 13px" }}>
                                                💳 Payment received
                                              </span>
                                              <button onClick={() => createServiceInvoice(bike, svcEnq)}
                                                style={{ background: GOLD + "33", border: `1px solid ${GOLD}88`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, padding: "7px 14px", cursor: "pointer" }}>
                                                🧾 Create invoice
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* STATE 4 — Complete */}
                                      {isComplete && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                          <span style={{ fontSize: 12.5, color: GREEN, fontWeight: 600 }}>✓ Service complete · {fmtDate(bike.service_completed_at)}</span>
                                          <button onClick={() => resetServiceRequest(bike)}
                                            style={{ background: "transparent", border: "none", color: "#6F6862", fontSize: 11.5, cursor: "pointer" }}>
                                            New request
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* ---- CUSTOM SERVICE LOG ---- */}
                                {(() => {
                                  const items = svcItems.filter(i => i.bike_id === bike.id);
                                  const logs = svcLogs.filter(l => l.bike_id === bike.id).slice(0, 8);
                                  return (
                                    <div style={{ ...s.section, borderTop: "1px solid #2A2623", marginTop: 8 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                        <div style={s.sectionLabel}>SERVICE LOG</div>
                                        {newItemPanel !== bike.id && (
                                          <button onClick={() => { setNewItemPanel(bike.id); setNewItemForm({ name: "", intervalHours: "" }); }}
                                            style={{ background: "transparent", border: "none", color: "#3B9EFF", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                                            + Add item
                                          </button>
                                        )}
                                      </div>

                                      {/* Add item form */}
                                      {newItemPanel === bike.id && (
                                        <div style={{ background: "#1B1816", border: "1px solid #2A2623", borderRadius: 10, padding: "11px 13px", marginBottom: 10 }}>
                                          <div style={s.fieldRow}>
                                            <label style={{ ...s.fieldCtrl, flex: "2 1 160px" }}>
                                              <span style={s.fieldLabel}>Item name</span>
                                              <input className="g51-input" value={newItemForm.name}
                                                onChange={e => setNewItemForm(f => ({ ...f, name: e.target.value }))}
                                                placeholder="e.g. Oil change, Chain, Suspension service"
                                                style={s.input} autoFocus />
                                            </label>
                                            <label style={{ ...s.fieldCtrl, flex: "1 1 110px" }}>
                                              <span style={s.fieldLabel}>Track every (hours)</span>
                                              <input className="g51-input" type="number" value={newItemForm.intervalHours}
                                                onChange={e => setNewItemForm(f => ({ ...f, intervalHours: e.target.value }))}
                                                placeholder="blank = manual"
                                                style={s.input} />
                                            </label>
                                          </div>
                                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                            <button onClick={() => addServiceItem(bike.id, bike)}
                                              style={{ background: GREEN, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "7px 14px", cursor: "pointer" }}>
                                              Add
                                            </button>
                                            <button onClick={() => setNewItemPanel(null)} className="g51-btn g51-ghost" style={s.actionBtn}>Cancel</button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Items list */}
                                      {items.length === 0 && newItemPanel !== bike.id && (
                                        <div style={{ fontSize: 12.5, color: "#6F6862", fontStyle: "italic", marginBottom: 8 }}>
                                          No service items tracked yet — click + Add item to start.
                                        </div>
                                      )}
                                      {items.map(item => {
                                        const status = itemDueStatus(item, bike.engine_hours);
                                        const since = item.last_done_hours != null ? bike.engine_hours - item.last_done_hours : null;
                                        const isLogOpen = logPanel === item.id;
                                        const statusColor = status === "due" ? RED : status === "due_soon" ? AMBER : status === "ok" ? GREEN : "#6F6862";
                                        return (
                                          <div key={item.id} style={{ marginBottom: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                              <span style={{ flex: "1 1 140px", fontSize: 13.5, fontWeight: 500 }}>{item.name}</span>
                                              {status !== "manual" && (
                                                <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>
                                                  {status === "due" ? "⚠ Due" : status === "due_soon" ? "⏰ Due soon" : "✓ OK"}
                                                  {since != null && item.interval_hours && ` · ${since.toFixed(0)}h / ${item.interval_hours}h`}
                                                </span>
                                              )}
                                              {status === "manual" && (
                                                <span style={{ fontSize: 11.5, color: "#6F6862" }}>
                                                  {since != null ? `Last at ${item.last_done_hours}h` : "Not yet logged"}
                                                </span>
                                              )}
                                              {!isLogOpen && (
                                                <button onClick={() => { setLogPanel(item.id); setLogForm({ doneAt: new Date().toISOString().slice(0, 10), doneHours: String(bike.engine_hours || ""), by: myName || "", notes: "" }); }}
                                                  className="g51-btn g51-ghost" style={{ ...s.actionBtn, fontSize: 11.5 }}>Log</button>
                                              )}
                                              <button onClick={() => removeServiceItem(item)}
                                                style={{ background: "transparent", border: "none", color: "#3A352F", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: "0 2px" }} title="Remove">×</button>
                                            </div>
                                            {/* Inline log form */}
                                            {isLogOpen && (
                                              <div style={{ background: "#141211", border: "1px solid #2A2623", borderRadius: 9, padding: "10px 12px", marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                                                <label style={{ display: "grid", gap: 3 }}>
                                                  <span style={{ fontSize: 10, color: "#6F6862", textTransform: "uppercase", letterSpacing: "0.07em" }}>Date</span>
                                                  <input type="date" value={logForm.doneAt} onChange={e => setLogForm(f => ({ ...f, doneAt: e.target.value }))}
                                                    style={{ ...s.input, width: 130, padding: "6px 9px" }} />
                                                </label>
                                                <label style={{ display: "grid", gap: 3 }}>
                                                  <span style={{ fontSize: 10, color: "#6F6862", textTransform: "uppercase", letterSpacing: "0.07em" }}>Engine hours</span>
                                                  <input type="number" value={logForm.doneHours} onChange={e => setLogForm(f => ({ ...f, doneHours: e.target.value }))}
                                                    style={{ ...s.input, width: 80, padding: "6px 9px" }} />
                                                </label>
                                                <label style={{ display: "grid", gap: 3, flex: "1 1 100px" }}>
                                                  <span style={{ fontSize: 10, color: "#6F6862", textTransform: "uppercase", letterSpacing: "0.07em" }}>Done by</span>
                                                  <input type="text" value={logForm.by} onChange={e => setLogForm(f => ({ ...f, by: e.target.value }))}
                                                    style={{ ...s.input, padding: "6px 9px" }} />
                                                </label>
                                                <label style={{ display: "grid", gap: 3, flex: "2 1 140px" }}>
                                                  <span style={{ fontSize: 10, color: "#6F6862", textTransform: "uppercase", letterSpacing: "0.07em" }}>Notes</span>
                                                  <input type="text" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} placeholder="optional"
                                                    style={{ ...s.input, padding: "6px 9px" }} />
                                                </label>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                  <button onClick={() => logServiceDone(item, bike)} disabled={savingLog}
                                                    style={{ background: GREEN, border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, padding: "7px 13px", cursor: "pointer" }}>
                                                    {savingLog ? "…" : "Save"}
                                                  </button>
                                                  <button onClick={() => setLogPanel(null)}
                                                    style={{ background: "transparent", border: "1px solid #3A352F", borderRadius: 7, color: "#9A938D", fontSize: 13, padding: "7px 10px", cursor: "pointer" }}>
                                                    Cancel
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* History */}
                                      {logs.length > 0 && (
                                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #2A2623" }}>
                                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 6 }}>HISTORY</div>
                                          {logs.map(entry => (
                                            <div key={entry.id} style={{ display: "flex", gap: 10, fontSize: 12, color: "#9A938D", marginBottom: 4, flexWrap: "wrap" }}>
                                              <span style={{ color: "#C9C2BC", fontWeight: 500 }}>{entry.item_name}</span>
                                              <span>{entry.done_at}</span>
                                              {entry.done_at_hours && <span>at {entry.done_at_hours}h</span>}
                                              {entry.performed_by && <span>by {entry.performed_by}</span>}
                                              {entry.notes && <span style={{ fontStyle: "italic" }}>{entry.notes}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Remove bike */}
                                      <details style={{ marginTop: 10 }}>
                                        <summary style={{ cursor: "pointer", fontSize: 11.5, color: "#6F6862", fontWeight: 600 }}>Remove bike from storage</summary>
                                        <button onClick={() => removeBike(bike)} className="g51-btn g51-ghost"
                                          style={{ ...s.actionBtn, color: "#FF7A7A", marginTop: 8 }}>
                                          Remove "{bikePrimaryLabel(bike)}"
                                        </button>
                                      </details>
                                    </div>
                                  );
                                })()}
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

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 60, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623", position: "sticky", top: 0, background: "#181615", zIndex: 50 },
  logo: { height: 30, width: "auto" },
  menuBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  menuOverlay: { position: "fixed", inset: 0, zIndex: 48 } as CSSProperties,
  menuDropdown: { position: "absolute", top: 57, right: 16, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 13, padding: "6px", zIndex: 49, minWidth: 200, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" } as CSSProperties,
  menuItem: { display: "block", width: "100%", textAlign: "left" as const, background: "transparent", border: "none", color: "#F4F2EF", fontSize: 15, fontWeight: 500, padding: "12px 14px", cursor: "pointer", borderRadius: 9, fontFamily: "inherit" },
  menuDivider: { height: 1, background: "#2A2623", margin: "4px 0" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  primaryBtn: { background: "#ED1C24", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  actionBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 },
  wrap: { maxWidth: 900, margin: "0 auto", padding: "24px 16px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 18px" },
  empty: { color: "#8C857F", textAlign: "center" as const, padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  groupCard: { background: "#1E1B19", border: "1px solid #2F2B27", borderRadius: 14, overflow: "hidden" },
  groupHead: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  groupAvatar: { width: 38, height: 38, borderRadius: "50%", background: "#3B9EFF22", color: "#3B9EFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 },
  groupName: { fontWeight: 700, fontSize: 16 },
  groupCount: { fontSize: 11, color: "#6F6862", background: "#2A2623", borderRadius: 20, padding: "2px 8px" },
  badge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" as const },
  bikeHead: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", background: "#221F1D" },
  bikePrimary: { fontWeight: 600, fontSize: 14.5 },
  refTag: { fontFamily: "monospace", fontSize: 11, fontWeight: 700, background: "#2A2623", color: "#9A938D", borderRadius: 6, padding: "2px 7px", letterSpacing: "0.04em" },
  bikeNumTag: { fontSize: 11, color: "#6F6862", background: "#2A2623", borderRadius: 6, padding: "2px 7px" },
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
