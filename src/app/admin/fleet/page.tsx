"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";

const RED = "#ED1C24";

// Starter set for hard-ridden MX/rental bikes — these intervals are a
// sensible guess, not your real maintenance schedule. Adjust per bike below
// once you know better; "not completely universal" was the whole point of
// making interval_hours editable per bike rather than fixed globally.
const SERVICE_ITEMS = [
  { key: "oil_change", label: "Oil change", defaultInterval: 10 },
  { key: "air_filter", label: "Air filter", defaultInterval: 10 },
  { key: "chain_sprockets", label: "Chain & sprockets", defaultInterval: 25 },
  { key: "brake_pads", label: "Brake pads", defaultInterval: 25 },
  { key: "top_end", label: "Top-end / piston", defaultInterval: 50 },
];
const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICE_ITEMS.map(i => [i.key, i.label]));

const CATEGORIES = [
  { key: "rental", label: "Rental" },
  { key: "desert_tour", label: "Desert Tour" },
  { key: "other", label: "Other" },
];
const CATEGORY_COLOR: Record<string, string> = { rental: "#3B9EFF", desert_tour: "#FFB02E", other: "#9A938D" };

type FleetBike = {
  id: string;
  name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  engine_hours: number;
  active: boolean;
};
type ServiceDue = {
  id: string;
  bike_id: string;
  item_key: string;
  interval_hours: number;
  hours_at_last_done: number;
};

const BLANK_BIKE = { name: "", category: "rental", make: "", model: "", year: "", engine_hours: 0 };

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
.g51-row:hover{background:#2A2624;}
`;

function hoursSince(bike: FleetBike, due: ServiceDue): number {
  return Math.max(0, Number(bike.engine_hours) - Number(due.hours_at_last_done));
}
function isDue(bike: FleetBike, due: ServiceDue): boolean {
  return hoursSince(bike, due) >= due.interval_hours;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", opacity: 0.7 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FleetScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bikes, setBikes] = useState<FleetBike[]>([]);
  const [serviceDue, setServiceDue] = useState<ServiceDue[]>([]);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ ...BLANK_BIKE });
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const [{ data: b }, { data: sd }] = await Promise.all([
        supabase.from("fleet_bikes").select("*").eq("active", true).order("name"),
        supabase.from("fleet_service_due").select("*"),
      ]);
      setBikes((b as FleetBike[]) || []);
      setServiceDue((sd as ServiceDue[]) || []);
      setReady(true);
    });
  }, [router]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  async function createBike() {
    if (!form.name.trim()) { setAddError("Name is required."); return; }
    setCreating(true); setAddError("");
    const startingHours = Number(form.engine_hours) || 0;
    const { data, error } = await supabase.from("fleet_bikes").insert({
      name: form.name.trim(),
      category: form.category || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      year: form.year.trim() || null,
      engine_hours: startingHours,
    }).select().single();
    if (error || !data) { setCreating(false); setAddError(error?.message || "Could not add the bike."); return; }
    const bike = data as FleetBike;

    // Start the clock on every tracked item from today's hours — not from
    // zero, which would falsely flag a perfectly fine bike as overdue.
    const dueRows: ServiceDue[] = [];
    for (const item of SERVICE_ITEMS) {
      const { data: d } = await supabase.from("fleet_service_due").insert({
        bike_id: bike.id, item_key: item.key, interval_hours: item.defaultInterval, hours_at_last_done: startingHours,
      }).select().single();
      if (d) dueRows.push(d as ServiceDue);
    }

    setBikes(prev => [...prev, bike].sort((a, b) => a.name.localeCompare(b.name)));
    setServiceDue(prev => [...prev, ...dueRows]);
    setCreating(false);
    setForm({ ...BLANK_BIKE });
    setAdding(false);
    showToast(`Added "${bike.name}".`);
  }

  function editBikeLocal(id: string, patch: Partial<FleetBike>) {
    setBikes(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }
  async function saveBike(id: string, patch: Partial<FleetBike>) {
    const { error } = await supabase.from("fleet_bikes").update(patch).eq("id", id);
    if (error) showToast(error.message || "Could not save changes.", "err");
  }

  function editDueLocal(id: string, patch: Partial<ServiceDue>) {
    setServiceDue(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }
  async function saveDue(id: string, patch: Partial<ServiceDue>) {
    const { error } = await supabase.from("fleet_service_due").update(patch).eq("id", id);
    if (error) showToast(error.message || "Could not save changes.", "err");
  }
  function markDone(bike: FleetBike, due: ServiceDue) {
    const patch = { hours_at_last_done: bike.engine_hours };
    editDueLocal(due.id, patch);
    saveDue(due.id, patch);
    showToast(`${SERVICE_LABEL[due.item_key] || due.item_key} marked done on "${bike.name}".`);
  }

  async function removeBike(bike: FleetBike) {
    await supabase.from("fleet_bikes").update({ active: false }).eq("id", bike.id);
    setBikes(prev => prev.filter(b => b.id !== bike.id));
    showToast(`Removed "${bike.name}" from the fleet.`);
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const dueCountByBike = (bikeId: string) =>
    serviceDue.filter(d => d.bike_id === bikeId).filter(d => {
      const bike = bikes.find(b => b.id === bikeId);
      return bike && isDue(bike, d);
    }).length;
  const bikesNeedingAttention = bikes.filter(b => dueCountByBike(b.id) > 0).length;

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={() => router.push("/admin")} className="g51-btn g51-ghost" style={s.ghostBtn}>← Dashboard</button>
      </header>

      <div style={s.wrap}>
        <h1 style={s.h1}>Fleet bikes</h1>
        <p style={s.sub}>Your rental and desert tour bikes — hours, and what's due for service on each.</p>

        {bikesNeedingAttention > 0 && (
          <div style={s.lowBanner}>⚠ {bikesNeedingAttention} bike{bikesNeedingAttention > 1 ? "s" : ""} need attention</div>
        )}

        <div style={s.card}>
          <div style={s.cardTitleRow} onClick={() => setAdding(a => !a)}>
            <span style={s.cardTitle}>Add a bike</span>
            <Chevron open={adding} />
          </div>
          {adding && (
            <>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Name / tag *</span>
                  <input className="g51-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Desmo450 #2" style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Category</span>
                  <select className="g51-input" value={form.category} onChange={e => set("category", e.target.value)} style={s.input}>
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select></label>
              </div>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Make</span>
                  <input className="g51-input" value={form.make} onChange={e => set("make", e.target.value)} placeholder="e.g. Ducati" style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Model</span>
                  <input className="g51-input" value={form.model} onChange={e => set("model", e.target.value)} placeholder="e.g. Desmo450 MX" style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Year</span>
                  <input className="g51-input" value={form.year} onChange={e => set("year", e.target.value)} style={s.input} /></label>
              </div>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Current engine hours</span>
                  <input className="g51-input" type="number" value={form.engine_hours} onChange={e => set("engine_hours", Number(e.target.value))} style={s.input} /></label>
              </div>
              {addError && <p style={s.addError}>{addError}</p>}
              <div style={s.actions}>
                <button onClick={createBike} disabled={creating} className="g51-btn g51-primary" style={s.primaryBtn}>{creating ? "Adding…" : "Add bike"}</button>
                <button onClick={() => { setAdding(false); setAddError(""); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>

        {bikes.length === 0 ? (
          <div style={s.empty}>No fleet bikes yet.</div>
        ) : (
          <div style={s.list}>
            {bikes.map(bike => {
              const dues = serviceDue.filter(d => d.bike_id === bike.id);
              const dueCount = dueCountByBike(bike.id);
              const catColor = CATEGORY_COLOR[bike.category || "other"] || "#9A938D";
              return (
                <div key={bike.id} className="g51-row" style={s.row}>
                  <div style={s.rowMain}>
                    <div style={s.nameRow}>
                      <span style={s.partName}>{bike.name}</span>
                      <span style={{ ...s.pill, color: catColor, borderColor: catColor + "66", background: catColor + "1c" }}>
                        {CATEGORIES.find(c => c.key === bike.category)?.label || "Other"}
                      </span>
                      {dueCount > 0 && <span style={s.lowBadge}>⚠ {dueCount} due</span>}
                    </div>
                    <div style={s.partSub}>
                      {[bike.make, bike.model, bike.year].filter(Boolean).join(" ") || "No make/model set"}
                      <span style={s.dotSep}>·</span>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input className="g51-input" type="number" value={bike.engine_hours}
                          onChange={e => editBikeLocal(bike.id, { engine_hours: Number(e.target.value) })}
                          onBlur={e => saveBike(bike.id, { engine_hours: Number(e.target.value) })}
                          style={{ ...s.input, width: 70, padding: "4px 8px", display: "inline-block" }} />
                        hours
                      </label>
                    </div>
                  </div>

                  <details style={s.editWrap}>
                    <summary style={s.editSummary}>Service items</summary>
                    {dues.map(due => {
                      const since = hoursSince(bike, due);
                      const due_ = isDue(bike, due);
                      return (
                        <div key={due.id} style={s.dueRow}>
                          <span style={{ flex: "1 1 160px" }}>{SERVICE_LABEL[due.item_key] || due.item_key}</span>
                          <span style={{ ...s.dueStatus, color: due_ ? "#FFB02E" : "#2FBF71" }}>
                            {since}h / {due.interval_hours}h {due_ ? "— due" : ""}
                          </span>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={s.ctrlLabel}>Interval</span>
                            <input className="g51-input" type="number" value={due.interval_hours}
                              onChange={e => editDueLocal(due.id, { interval_hours: Number(e.target.value) })}
                              onBlur={e => saveDue(due.id, { interval_hours: Number(e.target.value) })}
                              style={{ ...s.input, width: 60, padding: "5px 7px" }} />
                          </label>
                          <button onClick={() => markDone(bike, due)} className="g51-btn g51-ghost" style={s.smallGhost}>Mark done</button>
                        </div>
                      );
                    })}
                    <button onClick={() => removeBike(bike)} className="g51-btn g51-ghost" style={{ ...s.smallGhost, color: "#FF7A7A", marginTop: 10 }}>
                      Remove from fleet
                    </button>
                  </details>
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
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623" },
  logo: { height: 30, width: "auto" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  wrap: { maxWidth: 860, margin: "0 auto", padding: "26px 20px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 },
  lowBanner: { background: "#FFB02E18", border: "1px solid #FFB02E55", color: "#FFB02E", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 18 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, padding: 18, marginBottom: 22 },
  cardTitleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" },
  cardTitle: { fontWeight: 700, fontSize: 15 },
  controls: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px" },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  addError: { color: "#FF6B6B", fontSize: 13, margin: "12px 0 0" },
  actions: { display: "flex", gap: 10, marginTop: 16 },
  primaryBtn: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  empty: { color: "#8C857F", textAlign: "center", padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 9 },
  row: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 12, padding: "13px 16px" },
  rowMain: { marginBottom: 4 },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  partName: { fontWeight: 600, fontSize: 15 },
  pill: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "2px 9px", whiteSpace: "nowrap" },
  lowBadge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFB02E", border: "1px solid #FFB02E55", background: "#FFB02E18", borderRadius: 20, padding: "2px 8px" },
  partSub: { fontSize: 12.5, color: "#9A938D", marginTop: 4, lineHeight: 1.5, display: "flex", alignItems: "center", flexWrap: "wrap" },
  dotSep: { margin: "0 7px", opacity: 0.5 },
  editWrap: { marginTop: 10, borderTop: "1px solid #2A2623", paddingTop: 8 },
  editSummary: { cursor: "pointer", fontSize: 12.5, color: "#8C857F", fontWeight: 600 },
  dueRow: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 13.5 },
  dueStatus: { fontWeight: 700, flex: "0 0 auto" },
  smallGhost: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "6px 12px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};
