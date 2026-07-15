"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";

const RED = "#ED1C24";
const GREEN = "#2FBF71";
const AMBER = "#FFB02E";

const SERVICE_LABELS: Record<string, string> = {
  academy: "Academy",
  workshop: "Workshop",
  desert_tour: "Desert Tour",
  rental: "Rental",
  motorcycle_storage: "Storage",
};
const SERVICE_COLORS: Record<string, string> = {
  academy: "#3B9EFF",
  workshop: AMBER,
  desert_tour: "#A78BFA",
  rental: GREEN,
  motorcycle_storage: "#F97316",
};

type EnquiryLite = {
  id: string;
  customer_name: string;
  phone: string;
  email: string | null;
  service_type: string;
  estimated_value: number;
  paid_at: string | null;
  stage: string;
  created_at: string;
  bike_details: string | null;
  bike_year: string | null;
  client_id: string | null;
};
type ClientRow = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  guardian_id: string | null;
  is_minor: boolean;
  relationship: string | null;
};
type StorageBikeLite = {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  name: string;
  make: string | null;
  model: string | null;
  year: string | null;
  monthly_rate: number | null;
  storage_end_date: string | null;
};

type ClientRecord = {
  phone: string;
  name: string;
  email: string | null;
  clientId: string | null;
  notes: string;
  enquiries: EnquiryLite[];
  ltv: number;
  outstanding: number;
  lastBookingAt: string;
  services: string[];
  bikes: string[];
  // Guardian / dependent relationships
  guardianPhone: string | null;
  guardianName: string | null;
  relationship: string | null;
  dependents: { phone: string; name: string; relationship: string | null }[];
  isMinor: boolean;
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
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
function aed(n: number) {
  return "AED " + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Avatar colour cycles through 5 accent hues based on name initial
const AVATAR_COLORS = ["#3B9EFF", "#A78BFA", GREEN, AMBER, "#F97316"];
function avatarColor(name: string) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

const CSS = `
.g51-btn{transition:background .15s,border-color .15s,opacity .15s;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-client:hover{border-color:#403A35;cursor:pointer;}
nav button:hover{background:#2A2624 !important;}
`;

export default function ClientsScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [enquiries, setEnquiries] = useState<EnquiryLite[]>([]);
  const [clientRows, setClientRows] = useState<ClientRow[]>([]);
  const [storageBikes, setStorageBikes] = useState<StorageBikeLite[]>([]);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [sort, setSort] = useState<"ltv" | "recent" | "name">("ltv");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState<string | null>(null); // phone of client being edited
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", relationship: "", isMinor: false });
  const [savingEdit, setSavingEdit] = useState(false);
  const [linkingGuardian, setLinkingGuardian] = useState<string | null>(null); // phone of dependent
  const [guardianSearch, setGuardianSearch] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
      if (!prof || (prof as { role: string }).role !== "admin") { router.replace("/admin/overview"); return; }
      const [{ data: enqData }, { data: cliData }, { data: sbData }] = await Promise.all([
        supabase.from("enquiries").select("id,customer_name,phone,email,service_type,estimated_value,paid_at,stage,created_at,bike_details,bike_year,client_id").order("created_at", { ascending: false }),
        supabase.from("clients").select("id,name,whatsapp,email,notes,guardian_id,is_minor,relationship"),
        supabase.from("storage_bikes").select("id,client_name,client_phone,client_email,name,make,model,year,monthly_rate,storage_end_date").eq("active", true),
      ]);
      setEnquiries((enqData as EnquiryLite[]) || []);
      setClientRows((cliData as ClientRow[]) || []);
      setStorageBikes((sbData as StorageBikeLite[]) || []);
      // Pre-load notes from clients table
      const notesMap: Record<string, string> = {};
      for (const c of (cliData as ClientRow[]) || []) {
        if (c.whatsapp && c.notes) notesMap[c.whatsapp] = c.notes;
      }
      setNotes(notesMap);
      setReady(true);
    });
  }, [router]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  // Build client records by grouping enquiries by phone
  const clients = useMemo<ClientRecord[]>(() => {
    const map = new Map<string, ClientRecord>();

    // First pass: build from enquiries
    for (const e of enquiries) {
      const phone = (e.phone || "").trim();
      if (!phone) continue;
      if (!map.has(phone)) {
        const cli = clientRows.find(c => c.whatsapp === phone);
        map.set(phone, {
          phone,
          name: cli?.name || e.customer_name,
          email: cli?.email || e.email,
          clientId: cli?.id || null,
          notes: notes[phone] || "",
          enquiries: [],
          ltv: 0, outstanding: 0,
          lastBookingAt: e.created_at,
          services: [], bikes: [],
          guardianPhone: null, guardianName: null, relationship: cli?.relationship || null,
          dependents: [], isMinor: cli?.is_minor || false,
        });
      }
      const rec = map.get(phone)!;
      rec.enquiries.push(e);
      if (e.paid_at) rec.ltv += Number(e.estimated_value) || 0;
      if (!e.paid_at && e.stage === "booked") rec.outstanding += Number(e.estimated_value) || 0;
      if (!rec.services.includes(e.service_type)) rec.services.push(e.service_type);
      if (e.bike_details && !rec.bikes.includes(e.bike_details)) rec.bikes.push(e.bike_details);
      if (e.created_at > rec.lastBookingAt) rec.lastBookingAt = e.created_at;
    }

    // Second pass: storage bike owners
    for (const sb of storageBikes) {
      const phone = (sb.client_phone || "").trim();
      const key = phone || `sb:${sb.id}`;
      const bikeName = [sb.make, sb.model, sb.year].filter(Boolean).join(" ") || sb.name;
      if (!map.has(key)) {
        const cli = phone ? clientRows.find(c => c.whatsapp === phone) : null;
        map.set(key, {
          phone,
          name: cli?.name || sb.client_name || sb.name,
          email: cli?.email || sb.client_email,
          clientId: cli?.id || null,
          notes: phone ? (notes[phone] || "") : "",
          enquiries: [], ltv: 0, outstanding: 0,
          lastBookingAt: new Date(0).toISOString(),
          services: ["motorcycle_storage"], bikes: [bikeName],
          guardianPhone: null, guardianName: null, relationship: cli?.relationship || null,
          dependents: [], isMinor: cli?.is_minor || false,
        });
      } else {
        const rec = map.get(key)!;
        if (!rec.services.includes("motorcycle_storage")) rec.services.push("motorcycle_storage");
        if (!rec.bikes.includes(bikeName)) rec.bikes.push(bikeName);
      }
    }

    // Third pass: resolve guardian relationships using clients table
    // Build a map of clientId → phone for quick lookup
    const idToPhone = new Map<string, string>();
    for (const rec of map.values()) {
      if (rec.clientId) idToPhone.set(rec.clientId, rec.phone);
    }
    for (const row of clientRows) {
      if (row.guardian_id && row.whatsapp) {
        const dependentPhone = row.whatsapp;
        const guardianPhone = idToPhone.get(row.guardian_id) || null;
        const dependentRec = map.get(dependentPhone);
        if (dependentRec && guardianPhone) {
          dependentRec.guardianPhone = guardianPhone;
          dependentRec.relationship = row.relationship;
          const guardianRec = map.get(guardianPhone);
          if (guardianRec) {
            const guardianName = guardianRec.name;
            dependentRec.guardianName = guardianName;
            guardianRec.dependents.push({
              phone: dependentPhone,
              name: dependentRec.name,
              relationship: row.relationship,
            });
          }
        }
      }
    }

    return Array.from(map.values());
  }, [enquiries, clientRows, storageBikes, notes]);

  // Filter + sort
  const visible = useMemo(() => {
    let list = clients;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email || "").toLowerCase().includes(q));
    }
    if (serviceFilter !== "all") list = list.filter(c => c.services.includes(serviceFilter));
    if (outstandingOnly) list = list.filter(c => c.outstanding > 0);
    if (sort === "ltv") list = [...list].sort((a, b) => b.ltv - a.ltv);
    if (sort === "recent") list = [...list].sort((a, b) => b.lastBookingAt.localeCompare(a.lastBookingAt));
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [clients, search, serviceFilter, outstandingOnly, sort]);

  // Ensure a proper clients record exists; create one if not — needed before
  // saving guardian links, since both parties must have a record to reference.
  async function ensureClientRecord(client: ClientRecord): Promise<string> {
    if (client.clientId) return client.clientId;
    const { data } = await supabase.from("clients").insert({
      name: client.name, whatsapp: client.phone, email: client.email,
    }).select().single();
    if (data) {
      setClientRows(prev => [...prev, data as ClientRow]);
      return (data as ClientRow).id;
    }
    throw new Error("Could not create client record.");
  }

  function openEdit(client: ClientRecord) {
    setEditForm({
      name: client.name,
      phone: client.phone,
      email: client.email || "",
      relationship: client.relationship || "",
      isMinor: client.isMinor,
    });
    setEditMode(client.phone);
  }

  async function saveClientEdit(client: ClientRecord) {
    setSavingEdit(true);
    const patch = {
      name: editForm.name.trim() || null,
      whatsapp: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      relationship: editForm.relationship.trim() || null,
      is_minor: editForm.isMinor,
    };
    try {
      if (client.clientId) {
        await supabase.from("clients").update(patch).eq("id", client.clientId);
        setClientRows(prev => prev.map(r => r.id === client.clientId ? { ...r, ...patch } : r));
      } else {
        const { data } = await supabase.from("clients").insert({ ...patch }).select().single();
        if (data) setClientRows(prev => [...prev, data as ClientRow]);
      }
      showToast("Client details saved.");
      setEditMode(null);
    } catch { showToast("Could not save.", "err"); }
    setSavingEdit(false);
  }

  async function linkGuardian(dependent: ClientRecord, guardian: ClientRecord) {
    setSavingLink(true);
    try {
      const dependentId = await ensureClientRecord(dependent);
      const guardianId = await ensureClientRecord(guardian);
      await supabase.from("clients").update({ guardian_id: guardianId, is_minor: true }).eq("id", dependentId);
      setClientRows(prev => prev.map(r => r.id === dependentId ? { ...r, guardian_id: guardianId, is_minor: true } : r));
      showToast(`${dependent.name} linked to ${guardian.name}.`);
      setLinkingGuardian(null);
      setGuardianSearch("");
    } catch { showToast("Could not link guardian.", "err"); }
    setSavingLink(false);
  }

  async function unlinkGuardian(client: ClientRecord) {
    if (!client.clientId) return;
    await supabase.from("clients").update({ guardian_id: null, is_minor: false }).eq("id", client.clientId);
    setClientRows(prev => prev.map(r => r.id === client.clientId ? { ...r, guardian_id: null, is_minor: false } : r));
    showToast("Guardian unlinked.");
  }

  async function saveNotes(phone: string, text: string) {
    setNotes(prev => ({ ...prev, [phone]: text }));
    const existing = clientRows.find(c => c.whatsapp === phone);
    if (existing) {
      await supabase.from("clients").update({ notes: text }).eq("id", existing.id);
    } else {
      // Create a minimal client record so we have somewhere to store the notes
      const rec = clients.find(c => c.phone === phone);
      const { data } = await supabase.from("clients").insert({
        name: rec?.name || "", whatsapp: phone, email: rec?.email || null, notes: text,
      }).select().single();
      if (data) setClientRows(prev => [...prev, data as ClientRow]);
    }
    showToast("Notes saved.");
  }

  function exportCsv() {
    const header = ["Name", "Phone", "Email", "LTV (AED)", "Outstanding (AED)", "Services", "Bookings", "Last Booking", "Bikes"];
    const rows = visible.map(c => [
      c.name, c.phone, c.email || "",
      c.ltv, c.outstanding,
      c.services.map(s => SERVICE_LABELS[s] || s).join("; "),
      c.enquiries.length,
      c.lastBookingAt.slice(0, 10),
      c.bikes.join("; "),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `garage51-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const totalOutstanding = clients.reduce((a, c) => a + c.outstanding, 0);

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
            <button onClick={() => { router.push("/admin"); setMenuOpen(false); }} style={s.menuItem}>Bookings</button>
            <button onClick={() => { router.push("/admin/workshop"); setMenuOpen(false); }} style={s.menuItem}>Workshop</button>
            <button onClick={() => { router.push("/admin/parts"); setMenuOpen(false); }} style={s.menuItem}>Parts & Inventory</button>
            <button onClick={() => { router.push("/admin/fleet"); setMenuOpen(false); }} style={s.menuItem}>Fleet Bikes</button>
            <button onClick={() => { router.push("/admin/storage-bikes"); setMenuOpen(false); }} style={s.menuItem}>Storage Bikes</button>
            <div style={s.menuDivider} />
            <button onClick={() => { router.push("/admin/overview"); setMenuOpen(false); }} style={s.menuItem}>← Overview</button>
          </nav>
        </>
      )}

      <div style={s.wrap}>
        <h1 style={s.h1}>Clients</h1>
        <p style={s.sub}>{clients.length} clients · full booking and payment history per person.</p>

        {totalOutstanding > 0 && (
          <div style={{ ...s.banner, borderColor: RED + "55", background: RED + "0e", color: "#FF9B9B" }}>
            ⚠ {aed(totalOutstanding)} outstanding across {clients.filter(c => c.outstanding > 0).length} client{clients.filter(c => c.outstanding > 0).length > 1 ? "s" : ""}
          </div>
        )}

        {/* Search + filters */}
        <div style={s.toolbar}>
          <input className="g51-input" placeholder="Search name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...s.input, flex: "1 1 180px", minWidth: 0 }} />
          <select className="g51-input" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} style={{ ...s.input, flex: "0 0 auto" }}>
            <option value="all">All services</option>
            {Object.entries(SERVICE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="g51-input" value={sort} onChange={e => setSort(e.target.value as "ltv" | "recent" | "name")} style={{ ...s.input, flex: "0 0 auto" }}>
            <option value="ltv">Sort: LTV ↓</option>
            <option value="recent">Sort: Recent</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#B5AEA8", cursor: "pointer" }}>
            <input type="checkbox" checked={outstandingOnly} onChange={e => setOutstandingOnly(e.target.checked)} />
            Outstanding balance only
          </label>
          <button onClick={exportCsv} className="g51-btn g51-ghost" style={{ ...s.ghostBtn, marginLeft: "auto" }}>Export CSV</button>
        </div>

        {visible.length === 0 ? (
          <div style={s.empty}>No clients match your filters.</div>
        ) : (
          <div style={s.list}>
            {visible.map(client => {
              const isOpen = expanded === client.phone;
              const color = avatarColor(client.name);
              const clientNotes = notes[client.phone] || "";

              return (
                <div key={client.phone} className="g51-client" style={{ ...s.card, ...(isOpen ? { borderColor: "#403A35" } : {}) }}>
                  {/* Card header — always visible */}
                  <div style={s.cardHead} onClick={() => setExpanded(isOpen ? null : client.phone)}>
                    <div style={{ ...s.avatar, background: color + "22", color }}>
                      {initials(client.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={s.clientName}>{client.name}</span>
                        {client.isMinor && <span style={{ ...s.pill, color: "#A78BFA", borderColor: "#A78BFA55", background: "#A78BFA18" }}>Minor</span>}
                        {client.guardianName && <span style={{ fontSize: 11.5, color: "#6F6862" }}>via {client.guardianName}</span>}
                        {client.dependents.length > 0 && (
                          <span style={{ ...s.pill, color: "#A78BFA", borderColor: "#A78BFA55", background: "#A78BFA18" }}>
                            {client.dependents.length} dependent{client.dependents.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {!client.phone && <span style={{ ...s.pill, color: AMBER, borderColor: AMBER + "55", background: AMBER + "18" }}>No contact info</span>}
                        {client.outstanding > 0 && (
                          <span style={{ ...s.pill, color: RED, borderColor: RED + "55", background: RED + "15" }}>
                            {aed(client.outstanding)} owed
                          </span>
                        )}
                      </div>
                      <div style={s.clientSub}>
                        {client.services.map(sv => (
                          <span key={sv} style={{ ...s.pill, color: SERVICE_COLORS[sv] || "#9A938D", borderColor: (SERVICE_COLORS[sv] || "#9A938D") + "55", background: (SERVICE_COLORS[sv] || "#9A938D") + "18", fontSize: 10 }}>
                            {client.enquiries.filter(e => e.service_type === sv).length > 0
                              ? `${client.enquiries.filter(e => e.service_type === sv).length}× `
                              : ""}{SERVICE_LABELS[sv] || sv}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: GREEN }}>{aed(client.ltv)}</div>
                      <div style={{ fontSize: 11, color: "#6F6862", marginTop: 2 }}>{client.enquiries.length} booking{client.enquiries.length !== 1 ? "s" : ""}</div>
                    </div>
                  </div>

                  {/* Expanded profile */}
                  {isOpen && (
                    <div style={{ padding: "0 17px 18px", borderTop: "1px solid #2A2623" }}>

                      {/* Guardian/Dependent badge */}
                      {client.guardianPhone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, background: "#A78BFA18", border: "1px solid #A78BFA44", borderRadius: 9, padding: "8px 12px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, color: "#A78BFA", fontWeight: 600 }}>
                            👨‍👦 Guardian: {client.guardianName || client.guardianPhone}
                            {client.relationship ? ` (${client.relationship})` : ""}
                          </span>
                          <button onClick={() => unlinkGuardian(client)}
                            style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#6F6862", fontSize: 12, cursor: "pointer" }}>
                            Unlink
                          </button>
                        </div>
                      )}
                      {client.dependents.length > 0 && (
                        <div style={{ marginTop: 12, background: "#A78BFA18", border: "1px solid #A78BFA44", borderRadius: 9, padding: "8px 12px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#A78BFA", marginBottom: 6 }}>DEPENDENTS / MINOR STUDENTS</div>
                          {client.dependents.map(dep => (
                            <div key={dep.phone} style={{ fontSize: 13, color: "#C9C2BC", marginBottom: 3 }}>
                              👤 {dep.name}{dep.relationship ? ` — ${dep.relationship}` : ""} <span style={{ color: "#6F6862" }}>· {dep.phone}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Contact row + Edit */}
                      {editMode === client.phone ? (
                        <div style={{ marginTop: 14, background: "#1B1816", border: "1px solid #322E2A", borderRadius: 12, padding: "14px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 10 }}>EDITING CLIENT DETAILS</div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <label style={{ display: "grid", gap: 5, flex: "1 1 150px" }}>
                              <span style={{ fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#9A938D" }}>Name</span>
                              <input className="g51-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={s.input} />
                            </label>
                            <label style={{ display: "grid", gap: 5, flex: "1 1 150px" }}>
                              <span style={{ fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#9A938D" }}>Phone</span>
                              <input className="g51-input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={s.input} />
                            </label>
                            <label style={{ display: "grid", gap: 5, flex: "1 1 150px" }}>
                              <span style={{ fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#9A938D" }}>Email</span>
                              <input className="g51-input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={s.input} />
                            </label>
                            <label style={{ display: "grid", gap: 5, flex: "1 1 120px" }}>
                              <span style={{ fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#9A938D" }}>Relationship (if minor)</span>
                              <input className="g51-input" value={editForm.relationship} onChange={e => setEditForm(f => ({ ...f, relationship: e.target.value }))} placeholder="e.g. Son, Daughter" style={s.input} />
                            </label>
                          </div>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#B5AEA8", cursor: "pointer" }}>
                            <input type="checkbox" checked={editForm.isMinor} onChange={e => setEditForm(f => ({ ...f, isMinor: e.target.checked }))} />
                            Minor / student (dependent)
                          </label>
                          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            <button onClick={() => saveClientEdit(client)} disabled={savingEdit}
                              style={{ background: GREEN, border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 16px", cursor: "pointer" }}>
                              {savingEdit ? "Saving…" : "Save changes"}
                            </button>
                            <button onClick={() => setEditMode(null)} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                          {client.phone ? (
                            <>
                              <span style={{ fontSize: 13, color: "#9A938D" }}>{client.phone}</span>
                              {client.email && <span style={{ fontSize: 13, color: "#9A938D" }}>· {client.email}</span>}
                              <a href={`https://wa.me/${waNumber(client.phone)}`} target="_blank" rel="noreferrer"
                                style={{ background: "#1A3A25", color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 9, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                                WhatsApp
                              </a>
                              <button onClick={() => openEdit(client)} className="g51-btn g51-ghost" style={s.ghostBtn}>Edit</button>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ background: AMBER + "18", border: `1px solid ${AMBER}44`, borderRadius: 9, padding: "7px 12px", fontSize: 12.5, color: AMBER, fontWeight: 600 }}>
                                ⚠ No contact info
                              </div>
                              <button onClick={() => openEdit(client)} className="g51-btn g51-ghost" style={s.ghostBtn}>Add contact info</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Link / unlink guardian */}
                      {!client.guardianPhone && (
                        <div style={{ marginTop: 10 }}>
                          {linkingGuardian === client.phone ? (
                            <div style={{ background: "#1B1816", border: "1px solid #322E2A", borderRadius: 12, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 8 }}>LINK GUARDIAN / PAYING PARENT</div>
                              <input className="g51-input" placeholder="Search by name or phone…"
                                value={guardianSearch} onChange={e => setGuardianSearch(e.target.value)}
                                style={{ ...s.input, marginBottom: 8 }} autoFocus />
                              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                                {clients.filter(c =>
                                  c.phone !== client.phone && !c.isMinor &&
                                  (c.name.toLowerCase().includes(guardianSearch.toLowerCase()) || c.phone.includes(guardianSearch))
                                ).slice(0, 8).map(g => (
                                  <button key={g.phone} onClick={() => linkGuardian(client, g)} disabled={savingLink}
                                    style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid #2A2623", color: "#F4F2EF", fontSize: 13.5, padding: "9px 4px", cursor: "pointer" }}>
                                    {g.name} <span style={{ color: "#6F6862" }}>· {g.phone}</span>
                                  </button>
                                ))}
                              </div>
                              <button onClick={() => { setLinkingGuardian(null); setGuardianSearch(""); }} className="g51-btn g51-ghost" style={{ ...s.ghostBtn, marginTop: 8 }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setLinkingGuardian(client.phone)} className="g51-btn g51-ghost"
                              style={{ ...s.ghostBtn, fontSize: 12.5, color: "#A78BFA", borderColor: "#A78BFA44" }}>
                              + Link guardian / parent
                            </button>
                          )}
                        </div>
                      )}

                      {/* Stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "14px 0" }}>
                        {[
                          { label: "Lifetime value", value: aed(client.ltv), color: GREEN },
                          { label: "Outstanding", value: client.outstanding > 0 ? aed(client.outstanding) : "—", color: client.outstanding > 0 ? RED : "#6F6862" },
                          { label: "Client since", value: client.enquiries.length > 0 ? new Date(client.enquiries[client.enquiries.length - 1]?.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—", color: "#F4F2EF" },
                        ].map(stat => (
                          <div key={stat.label} style={{ background: "#1B1816", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10.5, color: "#6F6862", marginBottom: 4 }}>{stat.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Booking history */}
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 8 }}>BOOKING HISTORY</div>
                      <div style={{ background: "#1B1816", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                        {client.enquiries.map((e, i) => (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderBottom: i < client.enquiries.length - 1 ? "1px solid #2A2623" : "none", flexWrap: "wrap" }}>
                            <span style={{ ...s.pill, color: SERVICE_COLORS[e.service_type] || "#9A938D", borderColor: (SERVICE_COLORS[e.service_type] || "#9A938D") + "55", background: (SERVICE_COLORS[e.service_type] || "#9A938D") + "18", fontSize: 10 }}>
                              {SERVICE_LABELS[e.service_type] || e.service_type}
                            </span>
                            <span style={{ flex: 1, fontSize: 13, color: "#C9C2BC" }}>{new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: e.paid_at ? GREEN : (e.stage === "booked" ? RED : "#6F6862") }}>
                              {aed(e.estimated_value)} {e.paid_at ? "paid" : e.stage === "booked" ? "owed" : e.stage}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Bikes on file */}
                      {client.bikes.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 8 }}>BIKES ON FILE</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                            {client.bikes.map(b => (
                              <span key={b} style={{ background: "#1B1816", border: "1px solid #2A2623", borderRadius: 20, padding: "4px 12px", fontSize: 12.5, color: "#C9C2BC" }}>{b}</span>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Notes */}
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6F6862", marginBottom: 8 }}>ADMIN NOTES</div>
                      <textarea
                        className="g51-input"
                        value={clientNotes}
                        onChange={e => setNotes(prev => ({ ...prev, [client.phone]: e.target.value }))}
                        onBlur={e => saveNotes(client.phone, e.target.value)}
                        placeholder="Allergies, preferences, referral source, anything useful…"
                        rows={3}
                        style={{ ...s.input, width: "100%", resize: "vertical" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ ...s.toast, ...(toast.kind === "err" ? s.toastErr : s.toastOk) }}>{toast.msg}</div>
      )}
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
  menuItem: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#F4F2EF", fontSize: 15, fontWeight: 500, padding: "12px 14px", cursor: "pointer", borderRadius: 9, fontFamily: "inherit" } as CSSProperties,
  menuDivider: { height: 1, background: "#2A2623", margin: "4px 0" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  wrap: { maxWidth: 860, margin: "0 auto", padding: "24px 20px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 18px" },
  banner: { border: "1px solid", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 18 },
  toolbar: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 },
  input: { width: "100%", boxSizing: "border-box" as const, background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  empty: { color: "#8C857F", textAlign: "center" as const, padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  list: { display: "flex", flexDirection: "column" as const, gap: 9 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, overflow: "hidden", transition: "border-color .15s" },
  cardHead: { display: "flex", alignItems: "center", gap: 13, padding: "14px 17px", cursor: "pointer" },
  avatar: { width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 },
  clientName: { fontWeight: 700, fontSize: 15 },
  clientSub: { display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 4 },
  pill: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" as const },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" as const },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};
