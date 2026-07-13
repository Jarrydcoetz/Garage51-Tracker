"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
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
} from "../../../lib/partsShared";

const RED = "#ED1C24";

const JOB_STATUSES = [
  { key: "queued", label: "Queued" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_parts", label: "Waiting on parts" },
  { key: "completed", label: "Completed" },
];
const STATUS_COLOR: Record<string, string> = {
  queued: "#3B9EFF", in_progress: "#FFB02E", waiting_parts: "#C77B6B", completed: "#2FBF71",
};

type Profile = { id: string; name: string | null; role: string };
type Job = {
  id: string;
  customer_name: string;
  bike_details: string | null;
  bike_year: string | null;
  bike_hours: string | null;
  work_required: string | null;
  job_status: string | null;
  labour_hours: number | null;
  assigned_to: string | null;
  stage: string;
};

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
.g51-row:hover{border-color:#403A35;}
nav button:hover{background:#2A2624 !important;}
`;

const aed = (n: number) => "AED " + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", opacity: 0.7, flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function WorkshopScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [serviceProducts, setServiceProducts] = useState<ServiceProduct[]>([]);
  const [productItems, setProductItems] = useState<ServiceProductItem[]>([]);
  const [applications, setApplications] = useState<ServiceProductApplication[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [addPartRowId, setAddPartRowId] = useState<string | null>(null);
  const [addPartSelection, setAddPartSelection] = useState("");
  const [addPartQty, setAddPartQty] = useState("1");
  const [applyProductRowId, setApplyProductRowId] = useState<string | null>(null);
  const [applyProductSelection, setApplyProductSelection] = useState("");
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("id, name, role").eq("id", data.session.user.id).single();
      const me = prof as Profile | null;
      if (!me || (me.role !== "mechanic" && me.role !== "admin")) { router.replace("/admin"); return; }
      setMyRole(me.role);

      const [{ data: jobsData }, { data: partsData }, { data: movementsData }, { data: spData }, { data: spiData }, { data: appData }] = await Promise.all([
        supabase.from("enquiries")
          .select("id, customer_name, bike_details, bike_year, bike_hours, work_required, job_status, labour_hours, assigned_to, stage")
          .eq("service_type", "workshop")
          .not("job_status", "is", null)
          .order("created_at", { ascending: true }),
        supabase.from("parts").select("*").eq("active", true).order("name"),
        supabase.from("stock_movements").select("id, part_id, quantity, reason, enquiry_id, service_product_application_id, cost_price_snapshot, sell_price_snapshot, created_at"),
        supabase.from("service_products").select("*").eq("active", true).order("name"),
        supabase.from("service_product_items").select("*"),
        supabase.from("service_product_applications").select("*"),
      ]);

      const all = (jobsData as Job[]) || [];
      const scoped = me.role === "admin" ? all : all.filter(j => j.assigned_to === me.id);
      setJobs(scoped.filter(j => j.stage !== "cancelled" && j.stage !== "lost"));
      setParts((partsData as Part[]) || []);
      setMovements((movementsData as StockMovement[]) || []);
      setServiceProducts((spData as ServiceProduct[]) || []);
      setProductItems((spiData as ServiceProductItem[]) || []);
      setApplications((appData as ServiceProductApplication[]) || []);
      setReady(true);
    });
  }, [router]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function editJobLocal(id: string, patch: Partial<Job>) {
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...patch } : j)));
  }
  async function saveJob(id: string, patch: Partial<Job>) {
    const { error } = await supabase.from("enquiries").update(patch).eq("id", id);
    if (error) showToast(error.message || "Could not save.", "err");
  }
  function setStatus(job: Job, status: string) {
    editJobLocal(job.id, { job_status: status });
    saveJob(job.id, { job_status: status });
  }
  function setHours(job: Job, hours: number | null) {
    editJobLocal(job.id, { labour_hours: hours });
    saveJob(job.id, { labour_hours: hours });
  }
  async function addPart(job: Job) {
    const part = parts.find(p => p.id === addPartSelection);
    const qty = Number(addPartQty);
    if (!part) { showToast("Choose a part first.", "err"); return; }
    if (!qty || qty <= 0) { showToast("Enter a quantity greater than zero.", "err"); return; }
    const { data, error } = await supabase.from("stock_movements").insert({
      part_id: part.id, quantity: -qty, reason: "used", enquiry_id: job.id,
      cost_price_snapshot: part.cost_price, sell_price_snapshot: partSellPrice(part),
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not add the part.", "err"); return; }
    setMovements(prev => [...prev, data as StockMovement]);
    setAddPartRowId(null);
    setAddPartSelection("");
    setAddPartQty("1");
    showToast(`Added ${qty} × ${part.name}.`);
  }
  async function applyServiceProduct(job: Job) {
    const product = serviceProducts.find(sp => sp.id === applyProductSelection);
    if (!product) { showToast("Choose a service product first.", "err"); return; }
    const { data: appRow, error: appError } = await supabase.from("service_product_applications").insert({
      service_product_id: product.id, enquiry_id: job.id,
      name_snapshot: product.name, price_snapshot: product.price,
    }).select().single();
    if (appError || !appRow) { showToast(appError?.message || "Could not apply the product.", "err"); return; }
    const application = appRow as ServiceProductApplication;
    setApplications(prev => [...prev, application]);
    const recipe = productItems.filter(i => i.service_product_id === product.id);
    for (const item of recipe) {
      const part = parts.find(p => p.id === item.part_id);
      if (!part) continue;
      const { data: movRow } = await supabase.from("stock_movements").insert({
        part_id: part.id, quantity: -item.quantity, reason: "used", enquiry_id: job.id,
        service_product_application_id: application.id,
        cost_price_snapshot: part.cost_price, sell_price_snapshot: partSellPrice(part),
      }).select().single();
      if (movRow) setMovements(prev => [...prev, movRow as StockMovement]);
    }
    setApplyProductRowId(null);
    setApplyProductSelection("");
    showToast(`Applied "${product.name}" — ${aed(product.price)}.`);
  }
  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const visible = jobs.filter(j => showCompleted || j.job_status !== "completed");

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={() => setMenuOpen(m => !m)} className="g51-btn g51-ghost" style={s.menuBtn} aria-label="Menu">
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={s.menuOverlay} />
          <nav style={s.menuDropdown}>
            <button onClick={() => { router.push("/admin/parts"); setMenuOpen(false); }} style={s.menuItem}>Parts & Inventory</button>
            <button onClick={() => { router.push("/admin/fleet"); setMenuOpen(false); }} style={s.menuItem}>Fleet Bikes</button>
            <button onClick={() => { router.push("/admin/storage-bikes"); setMenuOpen(false); }} style={s.menuItem}>Storage Bikes</button>
            {myRole === "admin" && (
              <button onClick={() => { router.push("/admin/overview"); setMenuOpen(false); }} style={s.menuItem}>← Overview</button>
            )}
            <div style={s.menuDivider} />
            <button onClick={() => { setMenuOpen(false); logout(); }} style={{ ...s.menuItem, color: "#FF7A7A" }}>Log out</button>
          </nav>
        </>
      )}

      <div style={s.wrap}>
        <h1 style={s.h1}>Your jobs</h1>
        <p style={s.sub}>Status, parts, and hours. Nothing here touches pricing or the customer — that's handled elsewhere.</p>

        <button onClick={() => setShowCompleted(v => !v)} className="g51-btn g51-ghost" style={s.toggleBtn}>
          {showCompleted ? "Hide completed" : "Show completed"}
        </button>

        {visible.length === 0 ? (
          <div style={s.empty}>No jobs waiting on you right now.</div>
        ) : (
          <div style={s.list}>
            {visible.map(job => {
              const open = expanded.has(job.id);
              const usedLines = partsUsedFor(job.id, movements);
              const partsSubtotal = partsUsedTotal(usedLines);
              const appliedProducts = applicationsFor(job.id, applications);
              const productsSubtotal = applicationsTotal(appliedProducts);
              const labour = labourCharge(job.labour_hours);
              const total = Math.round((partsSubtotal + productsSubtotal + labour) * 100) / 100;
              const statusKey = job.job_status || "queued";
              const statusColor = STATUS_COLOR[statusKey] || "#9A938D";
              return (
                <div key={job.id} className="g51-row" style={s.card}>
                  <div style={s.cardHead} onClick={() => toggleExpand(job.id)}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.nameRow}>
                        <span style={s.jobName}>{job.customer_name}</span>
                        <span style={{ ...s.pill, color: statusColor, borderColor: statusColor + "66", background: statusColor + "1c" }}>
                          {JOB_STATUSES.find(j => j.key === statusKey)?.label || statusKey}
                        </span>
                      </div>
                      <div style={s.jobSub}>
                        {job.bike_details || "No bike details"}{job.bike_year ? ` · ${job.bike_year}` : ""}
                      </div>
                    </div>
                    <Chevron open={open} />
                  </div>

                  {open && (
                    <div style={s.cardBody}>
                      {job.work_required && (
                        <div style={s.box}>
                          <div style={s.boxLabel}>Work required</div>
                          <div style={s.boxText}>{job.work_required}</div>
                        </div>
                      )}

                      <div style={s.controls}>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Status</span>
                          <select className="g51-input" value={statusKey} onChange={e => setStatus(job, e.target.value)} style={s.input}>
                            {JOB_STATUSES.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
                          </select></label>
                        <label style={s.ctrl}><span style={s.ctrlLabel}>Labour hours</span>
                          <input className="g51-input" type="number" step="0.25" min={0} value={job.labour_hours ?? ""}
                            onChange={e => setHours(job, e.target.value === "" ? null : Number(e.target.value))} style={s.input} /></label>
                      </div>

                      <div style={s.partsWrap}>
                        <div style={s.partsHead}>
                          <span style={s.partsTitle}>Parts, products &amp; labour{total > 0 ? ` · ${aed(total)}` : ""}</span>
                        </div>
                        {labour > 0 && (
                          <div style={s.partRow}>
                            <span style={{ flex: "1 1 auto" }}>Labour — {job.labour_hours}h × {aed(LABOUR_RATE_PER_HOUR)}/h</span>
                            <span style={{ fontWeight: 700 }}>{aed(labour)}</span>
                          </div>
                        )}
                        {appliedProducts.map(app => (
                          <div key={app.id} style={s.partRow}>
                            <span style={{ flex: "1 1 auto" }}>{app.name_snapshot} <span style={{ opacity: 0.6 }}>(fixed price)</span></span>
                            <span style={{ fontWeight: 700 }}>{aed(app.price_snapshot)}</span>
                          </div>
                        ))}
                        {usedLines.map(line => {
                          const part = parts.find(p => p.id === line.part_id);
                          return (
                            <div key={line.part_id} style={s.partRow}>
                              <span style={{ flex: "1 1 auto" }}>{part?.name || "Unknown part"} × {line.qty}</span>
                              <span style={{ fontWeight: 700 }}>{aed(line.qty * line.sellSnapshot)}</span>
                            </div>
                          );
                        })}
                        {addPartRowId === job.id ? (
                          <div style={s.partRow}>
                            <select className="g51-input" value={addPartSelection} onChange={e => setAddPartSelection(e.target.value)} style={{ ...s.input, flex: "1 1 200px" }}>
                              <option value="">Choose a part…</option>
                              {parts.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({stockFor(p.id, movements)} in stock)</option>
                              ))}
                            </select>
                            <input className="g51-input" type="number" min={1} value={addPartQty} onChange={e => setAddPartQty(e.target.value)} style={{ ...s.input, width: 70, flex: "0 0 70px" }} />
                            <button onClick={() => addPart(job)} className="g51-btn g51-primary" style={{ ...s.smallBtn, background: RED, color: "#fff", border: "none", fontWeight: 700 }}>Add</button>
                            <button onClick={() => setAddPartRowId(null)} className="g51-btn g51-ghost" style={s.smallBtn}>Cancel</button>
                          </div>
                        ) : applyProductRowId === job.id ? (
                          <div style={s.partRow}>
                            <select className="g51-input" value={applyProductSelection} onChange={e => setApplyProductSelection(e.target.value)} style={{ ...s.input, flex: "1 1 200px" }}>
                              <option value="">Choose a product…</option>
                              {serviceProducts.map(sp => (
                                <option key={sp.id} value={sp.id}>{sp.name} ({aed(sp.price)})</option>
                              ))}
                            </select>
                            <button onClick={() => applyServiceProduct(job)} className="g51-btn g51-primary" style={{ ...s.smallBtn, background: RED, color: "#fff", border: "none", fontWeight: 700 }}>Apply</button>
                            <button onClick={() => setApplyProductRowId(null)} className="g51-btn g51-ghost" style={s.smallBtn}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => { setAddPartRowId(job.id); setAddPartSelection(""); setAddPartQty("1"); }} className="g51-btn g51-ghost" style={s.smallBtn}>+ Add part</button>
                            {serviceProducts.length > 0 && (
                              <button onClick={() => { setApplyProductRowId(job.id); setApplyProductSelection(""); }} className="g51-btn g51-ghost" style={s.smallBtn}>+ Apply product</button>
                            )}
                          </div>
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

      {toast && (
        <div style={{ ...s.toast, ...(toast.kind === "err" ? s.toastErr : s.toastOk) }}>{toast.msg}</div>
      )}
    </main>
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
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  wrap: { maxWidth: 720, margin: "0 auto", padding: "26px 20px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 },
  toggleBtn: { fontSize: 12.5, padding: "7px 13px", marginBottom: 18 },
  empty: { color: "#8C857F", textAlign: "center", padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14 },
  cardHead: { display: "flex", alignItems: "center", gap: 12, padding: "15px 17px", cursor: "pointer" },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  jobName: { fontWeight: 700, fontSize: 16 },
  jobSub: { fontSize: 13, color: "#9A938D", marginTop: 3 },
  pill: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" },
  cardBody: { padding: "0 17px 17px", borderTop: "1px solid #2A2623", marginTop: 4, paddingTop: 14 },
  box: { border: "1px solid #2F2B27", borderRadius: 9, padding: "10px 12px", marginBottom: 14, background: "#1B1816" },
  boxLabel: { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A938D", marginBottom: 4 },
  boxText: { fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" },
  controls: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px", marginBottom: 13 },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  partsWrap: { background: "#1B1816", border: "1px solid #2F2B27", borderRadius: 11, padding: "12px 13px" },
  partsHead: { marginBottom: 8 },
  partsTitle: { fontSize: 12.5, fontWeight: 700, color: "#C9C2BC", letterSpacing: "0.03em" },
  partRow: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 13.5 },
  smallBtn: { fontSize: 12.5, padding: "7px 12px" },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};

