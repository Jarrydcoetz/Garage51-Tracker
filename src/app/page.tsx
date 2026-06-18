"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { submitEnquiry } from "./actions";

const RED = "#ED1C24";
const aed = (n: number) => "AED " + n.toLocaleString();

type Pkg = { key: string; label: string; price: number | null; perRider?: boolean };

const ACADEMY_OWNGEAR: Pkg[] = [
  { key: "single", label: "Single lesson (2 hours)", price: 690 },
  { key: "pack3", label: "3-lesson package (3 x 2h)", price: 1920 },
  { key: "pack5", label: "5-lesson package (5 x 2h)", price: 3000 },
  { key: "group", label: "Your own group (min 2 riders)", price: 420, perRider: true },
  { key: "custom", label: "Not sure / need a custom solution", price: null },
];
const ACADEMY_JUNIOR: Pkg[] = [
  { key: "single", label: "Single lesson (2 hours)", price: 1320 },
  { key: "pack3", label: "3-lesson package (3 x 2h)", price: 3600 },
  { key: "pack5", label: "5-lesson package (5 x 2h)", price: 5400 },
  { key: "group", label: "Your own group (min 2, under 125cc)", price: 800, perRider: true },
  { key: "custom", label: "Not sure / need a custom solution", price: null },
];
const ACADEMY_ADULT: Pkg[] = [
  { key: "single", label: "Single lesson (2 hours, over 125cc)", price: 1650 },
  { key: "pack3", label: "3-lesson package (3 x 2h)", price: 4450 },
  { key: "pack5", label: "5-lesson package (5 x 2h)", price: 6600 },
  { key: "group", label: "Your own group (min 2, over 125cc)", price: 1200, perRider: true },
  { key: "custom", label: "Not sure / need a custom solution", price: null },
];

type Bike = { key: string; label: string; durations: { key: string; label: string; price: number }[] };
const RENTAL_BIKES: Bike[] = [
  { key: "desmo450", label: "Ducati Desmo450 MX", durations: [
    { key: "1h", label: "1 hour", price: 750 }, { key: "2h", label: "2 hours", price: 1200 }, { key: "3h", label: "3 hours", price: 1600 }] },
  { key: "tc125_250", label: "Husqvarna TC125/250 Two-Stroke", durations: [
    { key: "1h", label: "1 hour", price: 450 }, { key: "2h", label: "2 hours", price: 850 }, { key: "3h", label: "3 hours", price: 1200 }] },
  { key: "ktm85", label: "KTM 85 SX", durations: [
    { key: "1h", label: "1 hour", price: 400 }, { key: "2h", label: "2 hours", price: 750 }] },
  { key: "tc65", label: "Husqvarna TC65 Two-Stroke", durations: [
    { key: "1h", label: "1 hour", price: 400 }, { key: "2h", label: "2 hours", price: 750 }] },
  { key: "ycf", label: "YCF 50/88/125 Four-Stroke", durations: [
    { key: "1h", label: "1 hour", price: 300 }, { key: "2h", label: "2 hours", price: 500 }] },
];

const DESERT: Pkg[] = [
  { key: "guide2h", label: "2-hour Guide Hire (your own bike/gear)", price: 690 },
  { key: "desmo2h", label: "2-hour Desmo450 private tour (single)", price: 1850 },
  { key: "desmo4h", label: "4-hour Desmo450 private tour (single)", price: 2400 },
  { key: "group", label: "Group booking request", price: null },
];

const SERVICES = [
  { key: "academy", label: "Academy", desc: "Coached training sessions and packages" },
  { key: "rental", label: "Bike Rental", desc: "Rent a bike for our tracks and facilities" },
  { key: "desert_tour", label: "Desert Tour", desc: "Guided desert rides" },
  { key: "workshop", label: "Workshop", desc: "Service, repairs and maintenance" },
];

export default function EnquiryForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [service, setService] = useState("");

  // academy
  const [cat, setCat] = useState<"" | "junior" | "adult">("");
  const [ownGear, setOwnGear] = useState<null | boolean>(null);
  const [pkg, setPkg] = useState("");
  const [riderCount, setRiderCount] = useState(2);

  // rental
  const [ack, setAck] = useState(false);
  const [bike, setBike] = useState("");
  const [dur, setDur] = useState("");
  const [rentalCustom, setRentalCustom] = useState(false);

  // desert
  const [desert, setDesert] = useState("");

  // workshop
  const [wsMake, setWsMake] = useState("");
  const [wsModel, setWsModel] = useState("");
  const [wsYear, setWsYear] = useState("");
  const [wsHours, setWsHours] = useState("");
  const [wsWork, setWsWork] = useState("");

  // contact
  const [preferredDate, setPreferredDate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const academyList: Pkg[] =
    ownGear === true ? ACADEMY_OWNGEAR : cat === "junior" ? ACADEMY_JUNIOR : cat === "adult" ? ACADEMY_ADULT : [];

  function pickService(k: string) {
    setService(k);
    setCat(""); setOwnGear(null); setPkg("");
    setAck(false); setBike(""); setDur(""); setRentalCustom(false);
    setDesert("");
  }
  function pickCat(c: "junior" | "adult") { setCat(c); setPkg(""); }
  function pickGear(g: boolean) { setOwnGear(g); setPkg(""); }
  function pickBike(b: string) { setBike(b); setDur(""); setRentalCustom(false); }

  function quote(): { price: number | null; selection: string; custom: boolean } {
    if (service === "academy") {
      const p = academyList.find(x => x.key === pkg);
      if (!p) return { price: null, selection: "", custom: false };
      const gear = ownGear ? "own gear" : "rental incl.";
      if (p.key === "custom") return { price: null, selection: `Academy / ${cat} / ${gear} / custom`, custom: true };
      if (p.perRider) {
        const riders = Math.max(2, riderCount);
        return { price: (p.price || 0) * riders, selection: `Academy / ${cat} / ${gear} / group x${riders} (${p.price}/rider)`, custom: false };
      }
      return { price: p.price, selection: `Academy / ${cat} / ${gear} / ${p.label}`, custom: false };
    }
    if (service === "rental") {
      if (rentalCustom) return { price: null, selection: "Rental / custom", custom: true };
      const b = RENTAL_BIKES.find(x => x.key === bike);
      const d = b?.durations.find(x => x.key === dur);
      if (!b || !d) return { price: null, selection: "", custom: false };
      return { price: d.price, selection: `Rental / ${b.label} / ${d.label}`, custom: false };
    }
    if (service === "desert_tour") {
      const o = DESERT.find(x => x.key === desert);
      if (!o) return { price: null, selection: "", custom: false };
      return { price: o.price, selection: `Desert tour / ${o.label}`, custom: o.price === null };
    }
    if (service === "workshop") {
      return { price: null, selection: `Workshop / ${wsMake} ${wsModel}`.trim(), custom: true };
    }
    return { price: null, selection: "", custom: false };
  }

  function step2Valid(): boolean {
    if (service === "academy") {
      if (!cat || ownGear === null || !pkg) return false;
      const p = academyList.find(x => x.key === pkg);
      if (p?.perRider && riderCount < 2) return false;
      return true;
    }
    if (service === "rental") {
      if (!ack) return false;
      if (rentalCustom) return true;
      return !!bike && !!dur;
    }
    if (service === "desert_tour") return !!desert;
    if (service === "workshop") return !!wsMake.trim() && !!wsModel.trim() && !!wsWork.trim();
    return false;
  }

  async function submit() {
    if (!name.trim() || !phone.trim()) { setErr("Please add your name and phone number."); return; }
    setSubmitting(true); setErr("");
    const q = quote();
    const isGroup = service === "academy" && academyList.find(x => x.key === pkg)?.perRider;
    const res = await submitEnquiry({
      customer_name: name,
      phone,
      email,
      service_type: service,
      rider_category: service === "academy" ? cat : null,
      own_gear: service === "academy" ? ownGear : null,
      selection: q.selection || null,
      rider_count: isGroup ? Math.max(2, riderCount) : null,
      preferred_date: preferredDate || null,
      bike_details: service === "workshop" ? `${wsMake} ${wsModel}`.trim() : null,
      bike_year: service === "workshop" ? wsYear || null : null,
      bike_hours: service === "workshop" ? wsHours || null : null,
      work_required: service === "workshop" ? wsWork || null : null,
      estimated_value: q.price ?? 0,
      notes,
    });
    setSubmitting(false);
    if (!res.ok) { setErr(res.error || "Something went wrong. Please try again."); return; }
    router.push("/thank-you");
  }

  const q = quote();

  return (
    <main style={s.page}>
      <div style={s.wrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <h1 style={s.h1}>Booking enquiry</h1>
        <p style={s.sub}>Tell us what you are after and we will confirm availability and your quote.</p>

        <div style={s.steps}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ ...s.stepDot, ...(step >= n ? s.stepDotOn : {}) }} />
          ))}
        </div>

        {/* STEP 1 — service */}
        {step === 1 && (
          <section style={s.card}>
            <div style={s.q}>What can we help you with?</div>
            {SERVICES.map(sv => (
              <Opt key={sv.key} active={service === sv.key} onClick={() => pickService(sv.key)} title={sv.label} sub={sv.desc} />
            ))}
          </section>
        )}

        {/* STEP 2 — branch */}
        {step === 2 && service === "academy" && (
          <section style={s.card}>
            <div style={s.q}>Who is riding?</div>
            <div style={s.row}>
              <Opt active={cat === "junior"} onClick={() => pickCat("junior")} title="Junior" half />
              <Opt active={cat === "adult"} onClick={() => pickCat("adult")} title="Adult (16+)" half />
            </div>
            {cat && (
              <>
                <div style={s.q}>Do you have your own bike and gear?</div>
                <div style={s.row}>
                  <Opt active={ownGear === true} onClick={() => pickGear(true)} title="Yes" half />
                  <Opt active={ownGear === false} onClick={() => pickGear(false)} title="No, I need rental" half />
                </div>
              </>
            )}
            {cat && ownGear !== null && (
              <>
                <div style={s.q}>Choose a package</div>
                {academyList.map(p => (
                  <Opt key={p.key} active={pkg === p.key} onClick={() => setPkg(p.key)} title={p.label}
                    price={p.perRider ? p.price : p.price} custom={p.price === null} perRider={p.perRider} />
                ))}
                {academyList.find(x => x.key === pkg)?.perRider && (
                  <label style={s.field}>
                    <span style={s.label}>How many riders?</span>
                    <input type="number" min={2} value={riderCount}
                      onChange={e => setRiderCount(Math.max(2, Number(e.target.value) || 2))} style={s.input} />
                  </label>
                )}
              </>
            )}
          </section>
        )}

        {step === 2 && service === "rental" && (
          <section style={s.card}>
            <div style={s.notice}>
              Prior motocross / off-road experience is required for all rentals without an instructor. Rentals are for
              use within our tracks and training facilities only (no desert rides without a guide).
            </div>
            <label style={s.ackRow} onClick={() => setAck(!ack)}>
              <span style={{ ...s.checkbox, ...(ack ? s.checkboxOn : {}) }}>{ack ? "✓" : ""}</span>
              <span>I understand and confirm the above</span>
            </label>
            {ack && (
              <>
                <div style={s.q}>Choose a bike</div>
                {RENTAL_BIKES.map(b => (
                  <Opt key={b.key} active={bike === b.key && !rentalCustom} onClick={() => pickBike(b.key)} title={b.label}
                    sub={`from ${aed(b.durations[0].price)}`} />
                ))}
                <Opt active={rentalCustom} onClick={() => { setRentalCustom(true); setBike(""); setDur(""); }}
                  title="Not sure / need a custom solution" custom />
                {bike && !rentalCustom && (
                  <>
                    <div style={s.q}>For how long?</div>
                    <div style={s.row}>
                      {RENTAL_BIKES.find(b => b.key === bike)!.durations.map(d => (
                        <Opt key={d.key} active={dur === d.key} onClick={() => setDur(d.key)} title={d.label} price={d.price} half />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {step === 2 && service === "desert_tour" && (
          <section style={s.card}>
            <div style={s.q}>Choose your desert tour</div>
            {DESERT.map(o => (
              <Opt key={o.key} active={desert === o.key} onClick={() => setDesert(o.key)} title={o.label}
                price={o.price} custom={o.price === null} />
            ))}
          </section>
        )}

        {step === 2 && service === "workshop" && (
          <section style={s.card}>
            <div style={s.q}>Tell us about your bike</div>
            <div style={s.row}>
              <label style={{ ...s.field, flex: 1 }}><span style={s.label}>Make *</span>
                <input value={wsMake} onChange={e => setWsMake(e.target.value)} placeholder="e.g. KTM" style={s.input} /></label>
              <label style={{ ...s.field, flex: 1 }}><span style={s.label}>Model *</span>
                <input value={wsModel} onChange={e => setWsModel(e.target.value)} placeholder="e.g. 350 SX-F" style={s.input} /></label>
            </div>
            <div style={s.row}>
              <label style={{ ...s.field, flex: 1 }}><span style={s.label}>Year</span>
                <input value={wsYear} onChange={e => setWsYear(e.target.value)} placeholder="e.g. 2022" style={s.input} /></label>
              <label style={{ ...s.field, flex: 1 }}><span style={s.label}>Hours / mileage</span>
                <input value={wsHours} onChange={e => setWsHours(e.target.value)} placeholder="e.g. 45h" style={s.input} /></label>
            </div>
            <label style={s.field}><span style={s.label}>What work is needed? *</span>
              <textarea value={wsWork} onChange={e => setWsWork(e.target.value)} rows={3}
                placeholder="Describe the service or repair" style={{ ...s.input, resize: "vertical" }} /></label>
          </section>
        )}

        {/* STEP 3 — date + contact */}
        {step === 3 && (
          <section style={s.card}>
            <label style={s.field}><span style={s.label}>Preferred date</span>
              <input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} style={s.input} /></label>
            <label style={s.field}><span style={s.label}>Your name *</span>
              <input value={name} onChange={e => setName(e.target.value)} style={s.input} /></label>
            <label style={s.field}><span style={s.label}>Phone *</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 05x xxx xxxx" style={s.input} /></label>
            <label style={s.field}><span style={s.label}>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={s.input} /></label>
            <label style={s.field}><span style={s.label}>Anything else?</span>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...s.input, resize: "vertical" }} /></label>
          </section>
        )}

        {/* Summary */}
        {step >= 2 && q.selection && (
          <div style={s.summary}>
            <div>
              <div style={s.summaryLabel}>Your selection</div>
              <div style={s.summaryText}>{q.selection}</div>
            </div>
            <div style={s.summaryPrice}>
              {q.custom || q.price === null ? <span style={s.poa}>We will confirm your quote</span> : aed(q.price)}
            </div>
          </div>
        )}

        {err && <p style={s.err}>{err}</p>}

        {/* Nav */}
        <div style={s.nav}>
          {step > 1 && <button onClick={() => setStep(step - 1)} style={s.back}>Back</button>}
          {step === 1 && <button onClick={() => service && setStep(2)} disabled={!service} style={s.next}>Continue</button>}
          {step === 2 && <button onClick={() => step2Valid() && setStep(3)} disabled={!step2Valid()} style={s.next}>Continue</button>}
          {step === 3 && <button onClick={submit} disabled={submitting} style={s.next}>{submitting ? "Sending..." : "Send enquiry"}</button>}
        </div>

        <p style={s.foot}>This is an enquiry, not a confirmed booking. We will be in touch to confirm availability and payment.</p>
      </div>
    </main>
  );
}

function Opt({ active, onClick, title, sub, price, custom, perRider, half }: {
  active: boolean; onClick: () => void; title: string; sub?: string;
  price?: number | null; custom?: boolean; perRider?: boolean; half?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...s.opt, ...(half ? { flex: 1 } : {}), ...(active ? s.optOn : {}) }}>
      <span style={s.optLeft}>
        <span style={s.optTitle}>{title}</span>
        {sub && <span style={s.optSub}>{sub}</span>}
      </span>
      {price != null && <span style={s.optPrice}>{aed(price)}{perRider ? " /rider" : ""}</span>}
      {custom && <span style={s.optPoa}>POA</span>}
    </button>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#1A1817", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", padding: "32px 18px 70px", colorScheme: "dark" },
  wrap: { maxWidth: 540, margin: "0 auto" },
  logo: { height: 42, width: "auto", display: "block", margin: "0 auto 22px" },
  h1: { fontSize: 24, fontWeight: 700, textAlign: "center", margin: "0 0 6px" },
  sub: { color: "#9A938D", textAlign: "center", fontSize: 14, margin: "0 0 22px" },
  steps: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 22 },
  stepDot: { width: 34, height: 4, borderRadius: 4, background: "#3A332E" },
  stepDotOn: { background: RED },
  card: { background: "#242120", border: "1px solid #39342F", borderRadius: 14, padding: 18 },
  q: { fontSize: 13, fontWeight: 700, letterSpacing: "0.03em", margin: "4px 0 12px", color: "#D8D2CC" },
  row: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 },
  opt: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "#151311", border: "1px solid #3A332E", borderRadius: 10, padding: "13px 15px", marginBottom: 10, cursor: "pointer", color: "#F4F2EF", fontFamily: "inherit" },
  optOn: { borderColor: RED, background: "#2A1718" },
  optLeft: { display: "flex", flexDirection: "column", gap: 3 },
  optTitle: { fontSize: 15, fontWeight: 600 },
  optSub: { fontSize: 12.5, color: "#9A938D" },
  optPrice: { fontSize: 14, fontWeight: 700, color: "#F4F2EF", whiteSpace: "nowrap" },
  optPoa: { fontSize: 12, fontWeight: 700, color: "#FFB02E" },
  notice: { fontSize: 13, lineHeight: 1.5, color: "#C9C2BC", background: "#151311", border: "1px solid #3A332E", borderRadius: 10, padding: "12px 14px", marginBottom: 12 },
  ackRow: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, marginBottom: 6 },
  checkbox: { width: 22, height: 22, borderRadius: 6, border: "1px solid #4A443E", display: "grid", placeItems: "center", fontSize: 13, color: "#fff", flexShrink: 0 },
  checkboxOn: { background: RED, borderColor: RED },
  field: { display: "grid", gap: 6, marginBottom: 14 },
  label: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#151311", border: "1px solid #3A332E", borderRadius: 9, color: "#F4F2EF", fontSize: 15, padding: "11px 13px", fontFamily: "inherit" },
  summary: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#242120", border: "1px solid " + RED + "55", borderRadius: 12, padding: "14px 16px", marginTop: 16 },
  summaryLabel: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  summaryText: { fontSize: 14, marginTop: 3 },
  summaryPrice: { fontSize: 18, fontWeight: 800, color: RED, whiteSpace: "nowrap" },
  poa: { fontSize: 13, fontWeight: 600, color: "#FFB02E" },
  err: { color: "#FF6B6B", fontSize: 14, marginTop: 14 },
  nav: { display: "flex", gap: 10, marginTop: 20 },
  back: { flex: "0 0 auto", background: "transparent", color: "#9A938D", border: "1px solid #3A332E", borderRadius: 10, padding: "13px 22px", fontSize: 15, cursor: "pointer" },
  next: { flex: 1, background: RED, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  foot: { color: "#6F6862", fontSize: 12, textAlign: "center", marginTop: 18, lineHeight: 1.5 },
};
