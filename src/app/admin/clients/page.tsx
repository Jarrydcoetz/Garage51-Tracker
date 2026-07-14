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
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
      if (!prof || (prof as { role: string }).role !== "admin") { router.replace("/admin/overview"); return; }
      const [{ data: enqData }, { data: cliData }, { data: sbData }] = await Promise.all([
        supabase.from("enquiries").select("id,customer_name,phone,email,service_type,estimated_value,paid_at,stage,created_at,bike_details,bike_year,client_id").order("created_at", { ascending: false }),
        supabase.from("clients").select("id,name,whatsapp,email,notes"),
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

    // First pass: build from enquiries (existing logic)
    for (const e of enquiries) {
      const phone = (e.phone || "").trim();
      if (!phone) continue;
      if (!map.has(phone)) {
        const cli = clientRows.find(c => c.whatsapp === phone);
        map.set(phone, {
          phone,
          name: e.customer_name,
          email: e.email,
          clientId: cli?.id || null,
          notes: notes[phone] || "",
          enquiries: [],
          ltv: 0,
          outstanding: 0,
          lastBookingAt: e.created_at,
          services: [],
          bikes: [],
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

    // Second pass: pick up storage bike owners who have no linked enquiry
    for (const sb of storageBikes) {
      const phone = (sb.client_phone || "").trim();
      if (!phone) continue;
      if (!map.has(phone)) {
        const cli = clientRows.find(c => c.whatsapp === phone);
        map.set(phone, {
          phone,
          name: sb.client_name || sb.name,
          email: sb.client_email,
          clientId: cli?.id || null,
          notes: notes[phone] || "",
          enquiries: [],
          ltv: 0,
          outstanding: 0,
          lastBookingAt: new Date(0).toISOString(),
          services: ["motorcycle_storage"],
          bikes: [[sb.make, sb.model, sb.year].filter(Boolean).join(" ") || sb.name],
        });
      } else {
        // Client already exists from an enquiry — just make sure storage shows in services
        const rec = map.get(phone)!;
        if (!rec.services.includes("motorcycle_storage")) rec.services.push("motorcycle_storage");
        const bikeName = [sb.make, sb.model, sb.year].filter(Boolean).join(" ") || sb.name;
        if (!rec.bikes.includes(bikeName)) rec.bikes.push(bikeName);
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
                        {client.outstanding > 0 && (
                          <span style={{ ...s.pill, color: RED, borderColor: RED + "55", background: RED + "15" }}>
                            {aed(client.outstanding)} owed
                          </span>
                        )}
                      </div>
                      <div style={s.clientSub}>
                        {client.services.map(sv => (
                          <span key={sv} style={{ ...s.pill, color: SERVICE_COLORS[sv] || "#9A938D", borderColor: (SERVICE_COLORS[sv] || "#9A938D") + "55", background: (SERVICE_COLORS[sv] || "#9A938D") + "18", fontSize: 10 }}>
                            {client.enquiries.filter(e => e.service_type === sv).length}× {SERVICE_LABELS[sv] || sv}
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

                      {/* Contact row */}
                      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "#9A938D" }}>{client.phone}</span>
                        {client.email && <span style={{ fontSize: 13, color: "#9A938D" }}>· {client.email}</span>}
                        <a href={`https://wa.me/${waNumber(client.phone)}`} target="_blank" rel="noreferrer"
                          style={{ marginLeft: "auto", background: "#1A3A25", color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 9, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          WhatsApp
                        </a>
                      </div>

                      {/* Stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "14px 0" }}>
                        {[
                          { label: "Lifetime value", value: aed(client.ltv), color: GREEN },
                          { label: "Outstanding", value: client.outstanding > 0 ? aed(client.outstanding) : "—", color: client.outstanding > 0 ? RED : "#6F6862" },
                          { label: "Client since", value: new Date(client.enquiries[client.enquiries.length - 1]?.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), color: "#F4F2EF" },
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
