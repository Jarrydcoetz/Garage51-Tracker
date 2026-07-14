"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import { type Part, type StockMovement, stockFor, isLowStock } from "../../../lib/partsShared";
import { isItemDue } from "../../../lib/bikeServiceShared";

const RED = "#ED1C24";

type EnquiryLite = { id: string; service_type: string; stage: string; estimated_value: number; paid_at: string | null; job_status: string | null; phone: string | null };
type BikeLite = { id: string; engine_hours: number };
type FleetDueLite = { bike_id: string; interval_hours: number; hours_at_last_done: number };
type StorageDueLite = { storage_bike_id: string; interval_hours: number; hours_at_last_done: number };
type StaffLite = { id: string; role: string };

const aed = (n: number) => "AED " + (Number(n) || 0).toLocaleString();

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-card:hover{border-color:#403A35;}
`;

function ModuleCard({ title, headline, headlineColor, sub, badgeCount, badgeLabel, onClick }: {
  title: string; headline: string; headlineColor?: string; sub: string;
  badgeCount?: number; badgeLabel?: string; onClick: () => void;
}) {
  return (
    <div className="g51-card" style={s.moduleCard} onClick={onClick}>
      <div style={s.moduleHead}>
        <span style={s.moduleTitle}>{title}</span>
        {!!badgeCount && badgeCount > 0 && (
          <span style={s.lowBadge}>⚠ {badgeCount} {badgeLabel}</span>
        )}
      </div>
      <div style={{ ...s.moduleHeadline, color: headlineColor || "#F4F2EF" }}>{headline}</div>
      <div style={s.moduleSub}>{sub}</div>
    </div>
  );
}

export default function OverviewScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [meName, setMeName] = useState<string | null>(null);
  const [enquiries, setEnquiries] = useState<EnquiryLite[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [fleetBikes, setFleetBikes] = useState<BikeLite[]>([]);
  const [fleetDue, setFleetDue] = useState<FleetDueLite[]>([]);
  const [storageBikes, setStorageBikes] = useState<BikeLite[]>([]);
  const [storageDue, setStorageDue] = useState<StorageDueLite[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("id, name, role").eq("id", data.session.user.id).single();
      const me = prof as { id: string; name: string | null; role: string } | null;
      // Revenue and pipeline data lives here — admin only, same boundary as the Staff page.
      if (!me || me.role !== "admin") { router.replace("/admin"); return; }
      setMeName(me.name);

      const [
        { data: enqData },
        { data: partsData }, { data: movementsData },
        { data: fleetData }, { data: fleetDueData },
        { data: storageData }, { data: storageDueData },
        { data: staffData },
      ] = await Promise.all([
        supabase.from("enquiries").select("id, service_type, stage, estimated_value, paid_at, job_status, phone"),
        supabase.from("parts").select("*").eq("active", true),
        supabase.from("stock_movements").select("part_id, quantity"),
        supabase.from("fleet_bikes").select("id, engine_hours").eq("active", true),
        supabase.from("fleet_service_due").select("bike_id, interval_hours, hours_at_last_done"),
        supabase.from("storage_bikes").select("id, engine_hours").eq("active", true),
        supabase.from("storage_bikes_service_due").select("storage_bike_id, interval_hours, hours_at_last_done"),
        supabase.from("profiles").select("id, role").eq("active", true),
      ]);

      setEnquiries((enqData as EnquiryLite[]) || []);
      setParts((partsData as Part[]) || []);
      setMovements((movementsData as StockMovement[]) || []);
      setFleetBikes((fleetData as BikeLite[]) || []);
      setFleetDue((fleetDueData as FleetDueLite[]) || []);
      setStorageBikes((storageData as BikeLite[]) || []);
      setStorageDue((storageDueData as StorageDueLite[]) || []);
      setStaff((staffData as StaffLite[]) || []);
      setReady(true);
    });
  }, [router]);

  if (!ready) return <main style={s.loading}>Loading…</main>;

  // Bookings
  const pipeline = enquiries.filter(r => ["new", "contacted"].includes(r.stage)).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const booked = enquiries.filter(r => r.stage === "booked" && !r.paid_at).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const earned = enquiries.filter(r => !!r.paid_at).reduce((a, r) => a + (r.estimated_value || 0), 0);
  const needsPayment = enquiries.filter(r => r.stage === "booked" && !r.paid_at).length;
  const activeBookings = enquiries.filter(r => !["cancelled", "lost"].includes(r.stage)).length;

  // Workshop
  const workshopJobs = enquiries.filter(r => r.service_type === "workshop" && !!r.job_status);
  const waitingParts = workshopJobs.filter(r => r.job_status === "waiting_parts").length;
  const inProgress = workshopJobs.filter(r => r.job_status === "in_progress").length;
  const queued = workshopJobs.filter(r => r.job_status === "queued").length;
  const activeJobs = waitingParts + inProgress + queued;

  // Parts
  const lowStockCount = parts.filter(p => isLowStock(p, stockFor(p.id, movements))).length;

  // Fleet
  const fleetAttention = fleetBikes.filter(b =>
    fleetDue.some(d => d.bike_id === b.id && isItemDue(b.engine_hours, d.hours_at_last_done, d.interval_hours))
  ).length;

  // Storage bikes
  const storageAttention = storageBikes.filter(b =>
    storageDue.some(d => d.storage_bike_id === b.id && isItemDue(b.engine_hours, d.hours_at_last_done, d.interval_hours))
  ).length;

  // Staff
  const staffByRole = (role: string) => staff.filter(p => p.role === role).length;

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Log out</button>
      </header>

      <div style={s.wrap}>
        <h1 style={s.h1}>{meName ? `Welcome back, ${meName.split(" ")[0]}` : "Overview"}</h1>
        <p style={s.sub}>The whole business, at a glance. Click into any card for the full picture.</p>

        <div style={s.stats}>
          <div style={s.stat}>
            <div style={s.statLabel}>In pipeline</div>
            <div style={{ ...s.statValue, color: "#5BB0FF" }}>{aed(pipeline)}</div>
            <div style={s.statSub}>New + contacted</div>
          </div>
          <div style={s.stat}>
            <div style={s.statLabel}>Booked</div>
            <div style={{ ...s.statValue, color: "#A78BFA" }}>{aed(booked)}</div>
            <div style={s.statSub}>Awaiting payment</div>
          </div>
          <div style={s.stat}>
            <div style={s.statLabel}>Earned</div>
            <div style={{ ...s.statValue, color: "#2FBF71" }}>{aed(earned)}</div>
            <div style={s.statSub}>Paid</div>
          </div>
        </div>

        <div style={s.grid}>
          <ModuleCard
            title="Bookings"
            headline={`${activeBookings} active`}
            sub={needsPayment > 0 ? `${needsPayment} awaiting payment` : "All caught up on payment"}
            badgeCount={needsPayment}
            badgeLabel="awaiting payment"
            onClick={() => router.push("/admin")}
          />
          <ModuleCard
            title="Workshop queue"
            headline={`${activeJobs} active job${activeJobs === 1 ? "" : "s"}`}
            sub={`${queued} queued · ${inProgress} in progress · ${waitingParts} waiting on parts`}
            badgeCount={waitingParts}
            badgeLabel="waiting on parts"
            onClick={() => router.push("/admin/workshop")}
          />
          <ModuleCard
            title="Parts & inventory"
            headline={`${parts.length} parts tracked`}
            sub={lowStockCount > 0 ? `${lowStockCount} at or below reorder level` : "Stock levels look fine"}
            badgeCount={lowStockCount}
            badgeLabel="low stock"
            onClick={() => router.push("/admin/parts")}
          />
          <ModuleCard
            title="Fleet bikes"
            headline={`${fleetBikes.length} bikes`}
            sub={fleetAttention > 0 ? `${fleetAttention} need service` : "Nothing due right now"}
            badgeCount={fleetAttention}
            badgeLabel="need service"
            onClick={() => router.push("/admin/fleet")}
          />
          <ModuleCard
            title="Storage bikes"
            headline={`${storageBikes.length} tracked`}
            sub={storageAttention > 0 ? `${storageAttention} need service` : "Nothing due right now"}
            badgeCount={storageAttention}
            badgeLabel="need service"
            onClick={() => router.push("/admin/storage-bikes")}
          />
          <ModuleCard
            title="Staff"
            headline={`${staff.length} active`}
            sub={`${staffByRole("admin")} admin · ${staffByRole("coach")} coach · ${staffByRole("mechanic")} mechanic`}
            onClick={() => router.push("/admin/staff")}
          />
          <ModuleCard
            title="Clients"
            headline={`${new Set(enquiries.map(e => e.phone).filter(Boolean)).size} total`}
            sub="Booking history, LTV, bikes on file, notes"
            onClick={() => router.push("/admin/clients")}
          />
        </div>
      </div>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623" },
  logo: { height: 30, width: "auto" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  wrap: { maxWidth: 980, margin: "0 auto", padding: "26px 20px 0" },
  h1: { fontSize: 26, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 22px", lineHeight: 1.5 },
  stats: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 26 },
  stat: { flex: "1 1 160px", background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, padding: "15px 17px" },
  statLabel: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  statValue: { fontSize: 23, fontWeight: 800, margin: "7px 0 3px", letterSpacing: "-0.01em" },
  statSub: { fontSize: 11.5, color: "#6F6862" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 },
  moduleCard: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, padding: "17px 19px", cursor: "pointer" },
  moduleHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  moduleTitle: { fontWeight: 700, fontSize: 14.5 },
  moduleHeadline: { fontSize: 21, fontWeight: 800, marginBottom: 4 },
  moduleSub: { fontSize: 12.5, color: "#9A938D", lineHeight: 1.5 },
  lowBadge: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#FFB02E", border: "1px solid #FFB02E55", background: "#FFB02E18", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" },
};
