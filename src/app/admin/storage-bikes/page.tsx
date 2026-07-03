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

type StorageEnquiry = { id: string; customer_name: string; phone: string; bike_details: string | null };
type StorageBike = { id: string; name: string; enquiry_id: string | null; make: string | null; model: string | null; year: string | null; engine_hours: number; active: boolean };
type ServiceDue = { id: string; storage_bike_id: string; item_key: string; interval_hours: number; hours_at_last_done: number };

const BLANK_BIKE = { name: "", enquiry_id: "", make: "", model: "", year: "", engine_hours: 0 };

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
        supabase.from("enquiries").select("id, customer_name, phone, bike_details").eq("service_type", "motorcycle_storage"),
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
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/admin/parts")} className="g51-btn g51-ghost" style={s.ghostBtn}>Parts</button>
          <button onClick={() => router.push("/admin/fleet")} className="g51-btn g51-ghost" style={s.ghostBtn}>Fleet</button>
          <button onClick={() => router.push("/admin")} className="g51-btn g51-ghost" style={s.ghostBtn}>Bookings</button>
          <button onClick={() => router.push("/admin/overview")} className="g51-btn g51-ghost" style={s.ghostBtn}>← Overview</button>
        </div>
      </header>

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
              <label style={s.ctrl}><span style={s.ctrlLabel}>Current engine hours</span>
                <input className="g51-input" type="number" value={form.engine_hours} onChange={e => set("engine_hours", Number(e.target.value))} style={s.input} /></label>
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

              return (
                <div key={bike.id} className="g51-bike-card" style={{ ...(isLast ? { borderBottom: "none" } : {}) }}>
                  <div style={s.bikeHead} onClick={() => toggleExpand(bike.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={s.bikeName}>{bike.name}</span>
                        {overdueItems.length > 0 && <span style={{ ...s.badge, color: RED, borderColor: RED + "55", background: RED + "18" }}>⚠ {overdueItems.length} overdue</span>}
                        {dueSoonItems.length > 0 && overdueItems.length === 0 && <span style={{ ...s.badge, color: AMBER, borderColor: AMBER + "55", background: AMBER + "18" }}>⏰ {dueSoonItems.length} due soon</span>}
                        {hasDue && enq?.phone && (
                          <button onClick={e => { e.stopPropagation(); requestFromClient(bike, [...overdueItems, ...dueSoonItems]); }} className="g51-btn g51-ghost" style={{ ...s.logBtn, color: AMBER, borderColor: AMBER + "55" }}>Request from client</button>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                        <span style={s.bikeSub}>{enq ? `${enq.customer_name}'s booking` : "No linked booking"}</span>
                        {(bike.make || bike.model) && <><span style={s.dotSep}>·</span><span style={s.bikeSub}>{[bike.make, bike.model, bike.year].filter(Boolean).join(" ")}</span></>}
                        <span style={s.dotSep}>·</span>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={e => e.stopPropagation()}>
                          <input className="g51-input" type="number" value={bike.engine_hours}
                            onChange={e => editBikeLocal(bike.id, { engine_hours: Number(e.target.value) })}
                            onBlur={e => saveBikeHours(bike.id, Number(e.target.value))}
                            style={{ ...s.input, width: 64, padding: "4px 8px", display: "inline-block" }} />
                          <span style={s.bikeSub}>h</span>
                        </label>
                      </div>
                      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 8, background: "#2A2623", gap: 1 }}>
                        {overdueWidth > 0 && <div style={{ width: `${overdueWidth}%`, background: RED }} />}
                        {dueSoonWidth > 0 && <div style={{ width: `${dueSoonWidth}%`, background: AMBER }} />}
                        {okWidth > 0 && <div style={{ width: `${okWidth}%`, background: GREEN + "55" }} />}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#6F6862", marginTop: 4 }}>
                        {overdueItems.length > 0 && <span style={{ color: RED }}>{overdueItems.length} overdue</span>}
                        {overdueItems.length > 0 && dueSoonItems.length > 0 && " · "}
                        {dueSoonItems.length > 0 && <span style={{ color: AMBER }}>{dueSoonItems.length} due soon</span>}
                        {(overdueItems.length > 0 || dueSoonItems.length > 0) && okItems.length > 0 && " · "}
                        {okItems.length > 0 && <span style={{ color: GREEN }}>{okItems.length} ok</span>}
                      </div>
                    </div>
                    <Chevron open={isOpen} />
                  </div>

                  {isOpen && (
                    <div style={{ padding: "0 17px 16px" }}>
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
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623", flexWrap: "wrap", gap: 10 },
  logo: { height: 30, width: "auto" },
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
