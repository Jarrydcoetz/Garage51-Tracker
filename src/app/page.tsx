"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { submitEnquiry } from "./actions";
import { STORAGE_TERMS, storageMonthlyRate, storageTotalPrice, storageTermMonths, addMonths } from "../lib/storagePricing";

const RED = "#ED1C24";
const aed = (n: number) => "AED " + n.toLocaleString();

type Country = { iso: string; dial: string; flag: string; name: string };
const COUNTRIES: Country[] = [
  { iso: "AE", dial: "+971", flag: "🇦🇪", name: "United Arab Emirates" },
  { iso: "SA", dial: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { iso: "QA", dial: "+974", flag: "🇶🇦", name: "Qatar" },
  { iso: "KW", dial: "+965", flag: "🇰🇼", name: "Kuwait" },
  { iso: "BH", dial: "+973", flag: "🇧🇭", name: "Bahrain" },
  { iso: "OM", dial: "+968", flag: "🇴🇲", name: "Oman" },
  { iso: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { iso: "US", dial: "+1", flag: "🇺🇸", name: "United States" },
  { iso: "CA", dial: "+1", flag: "🇨🇦", name: "Canada" },
  { iso: "IE", dial: "+353", flag: "🇮🇪", name: "Ireland" },
  { iso: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
  { iso: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
  { iso: "ES", dial: "+34", flag: "🇪🇸", name: "Spain" },
  { iso: "IT", dial: "+39", flag: "🇮🇹", name: "Italy" },
  { iso: "NL", dial: "+31", flag: "🇳🇱", name: "Netherlands" },
  { iso: "BE", dial: "+32", flag: "🇧🇪", name: "Belgium" },
  { iso: "CH", dial: "+41", flag: "🇨🇭", name: "Switzerland" },
  { iso: "AT", dial: "+43", flag: "🇦🇹", name: "Austria" },
  { iso: "SE", dial: "+46", flag: "🇸🇪", name: "Sweden" },
  { iso: "NO", dial: "+47", flag: "🇳🇴", name: "Norway" },
  { iso: "DK", dial: "+45", flag: "🇩🇰", name: "Denmark" },
  { iso: "FI", dial: "+358", flag: "🇫🇮", name: "Finland" },
  { iso: "PT", dial: "+351", flag: "🇵🇹", name: "Portugal" },
  { iso: "PL", dial: "+48", flag: "🇵🇱", name: "Poland" },
  { iso: "GR", dial: "+30", flag: "🇬🇷", name: "Greece" },
  { iso: "RU", dial: "+7", flag: "🇷🇺", name: "Russia" },
  { iso: "TR", dial: "+90", flag: "🇹🇷", name: "Turkey" },
  { iso: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
  { iso: "PK", dial: "+92", flag: "🇵🇰", name: "Pakistan" },
  { iso: "BD", dial: "+880", flag: "🇧🇩", name: "Bangladesh" },
  { iso: "LK", dial: "+94", flag: "🇱🇰", name: "Sri Lanka" },
  { iso: "NP", dial: "+977", flag: "🇳🇵", name: "Nepal" },
  { iso: "PH", dial: "+63", flag: "🇵🇭", name: "Philippines" },
  { iso: "ID", dial: "+62", flag: "🇮🇩", name: "Indonesia" },
  { iso: "MY", dial: "+60", flag: "🇲🇾", name: "Malaysia" },
  { iso: "SG", dial: "+65", flag: "🇸🇬", name: "Singapore" },
  { iso: "TH", dial: "+66", flag: "🇹🇭", name: "Thailand" },
  { iso: "VN", dial: "+84", flag: "🇻🇳", name: "Vietnam" },
  { iso: "CN", dial: "+86", flag: "🇨🇳", name: "China" },
  { iso: "JP", dial: "+81", flag: "🇯🇵", name: "Japan" },
  { iso: "KR", dial: "+82", flag: "🇰🇷", name: "South Korea" },
  { iso: "HK", dial: "+852", flag: "🇭🇰", name: "Hong Kong" },
  { iso: "AU", dial: "+61", flag: "🇦🇺", name: "Australia" },
  { iso: "NZ", dial: "+64", flag: "🇳🇿", name: "New Zealand" },
  { iso: "ZA", dial: "+27", flag: "🇿🇦", name: "South Africa" },
  { iso: "EG", dial: "+20", flag: "🇪🇬", name: "Egypt" },
  { iso: "MA", dial: "+212", flag: "🇲🇦", name: "Morocco" },
  { iso: "NG", dial: "+234", flag: "🇳🇬", name: "Nigeria" },
  { iso: "KE", dial: "+254", flag: "🇰🇪", name: "Kenya" },
  { iso: "JO", dial: "+962", flag: "🇯🇴", name: "Jordan" },
  { iso: "LB", dial: "+961", flag: "🇱🇧", name: "Lebanon" },
  { iso: "IQ", dial: "+964", flag: "🇮🇶", name: "Iraq" },
  { iso: "IL", dial: "+972", flag: "🇮🇱", name: "Israel" },
  { iso: "BR", dial: "+55", flag: "🇧🇷", name: "Brazil" },
  { iso: "MX", dial: "+52", flag: "🇲🇽", name: "Mexico" },
  { iso: "AR", dial: "+54", flag: "🇦🇷", name: "Argentina" },
];

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
  { key: "motorcycle_storage", label: "Motorcycle Storage", desc: "Secure monthly storage for your bike" },
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

  // storage
  const [stCategory, setStCategory] = useState<"" | "adult" | "junior">("");
  const [stTerm, setStTerm] = useState<"" | "month_to_month" | "3_months" | "6_months" | "12_months">("");
  const [stMake, setStMake] = useState("");
  const [stModel, setStModel] = useState("");

  // contact
  const [preferredDate, setPreferredDate] = useState("");
  const [name, setName] = useState("");
  const [countryIso, setCountryIso] = useState("AE");
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

  function quote(): { price: number | null; selection: string; custom: boolean; perMonth?: boolean } {
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
    if (service === "motorcycle_storage") {
      if (!stCategory || !stTerm) return { price: null, selection: "", custom: false };
      const total = storageTotalPrice(stCategory, stTerm);
      const catLabel = stCategory === "adult" ? "Adult" : "Junior";
      const termInfo = STORAGE_TERMS.find(t => t.key === stTerm);
      const termLabel = termInfo ? (termInfo.key === "month_to_month" ? termInfo.label : `${termInfo.label} (paid upfront)`) : stTerm;
      const bikeLabel = (stMake || stModel) ? ` — ${stMake} ${stModel}`.trim() : "";
      return {
        price: total,
        selection: `Storage / ${catLabel} / ${termLabel}${bikeLabel}`,
        custom: false,
        perMonth: stTerm === "month_to_month",
      };
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
    if (service === "motorcycle_storage") return !!stCategory && !!stTerm;
    return false;
  }

  async function submit() {
    const natl = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (!name.trim() || !natl) { setErr("Please add your name and WhatsApp number."); return; }
    setSubmitting(true); setErr("");
    const cc = COUNTRIES.find(c => c.iso === countryIso) || COUNTRIES[0];
    const whatsapp = cc.dial + natl;
    const q = quote();
    const isGroup = service === "academy" && academyList.find(x => x.key === pkg)?.perRider;
    const sessionsTotal =
      service === "academy" && pkg === "pack5" ? 5 :
      service === "academy" && pkg === "pack3" ? 3 : 1;
    const isStorage = service === "motorcycle_storage";
    const bikeDetails =
      service === "workshop" ? `${wsMake} ${wsModel}`.trim() :
      isStorage ? (`${stMake} ${stModel}`.trim() || null) :
      null;
    const res = await submitEnquiry({
      customer_name: name,
      whatsapp,
      country: countryIso,
      email,
      service_type: service,
      sessions_total: sessionsTotal,
      rider_category: service === "academy" ? cat : null,
      own_gear: service === "academy" ? ownGear : null,
      selection: q.selection || null,
      rider_count: isGroup ? Math.max(2, riderCount) : null,
      preferred_date: isStorage ? null : (preferredDate || null),
      bike_details: bikeDetails,
      bike_year: service === "workshop" ? wsYear || null : null,
      bike_hours: service === "workshop" ? wsHours || null : null,
      work_required: service === "workshop" ? wsWork || null : null,
      bike_category: isStorage ? stCategory || null : null,
      storage_term: isStorage ? stTerm || null : null,
      storage_start_date: isStorage ? (preferredDate || null) : null,
      storage_end_date: isStorage && stTerm && stTerm !== "month_to_month" && preferredDate
        ? addMonths(preferredDate, storageTermMonths(stTerm))
        : null,
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
              <Opt key={sv.key} active={service === sv.key} onClick={() => pickService(sv.key)} title={sv.label} sub={sv.desc}
                icon={<ServiceIcon service={sv.key} />} />
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

        {step === 2 && service === "motorcycle_storage" && (
          <section style={s.card}>
            <div style={s.q}>What size is the bike?</div>
            <div style={s.row}>
              <Opt active={stCategory === "adult"} onClick={() => setStCategory("adult")} title="Adult" sub="85cc and over" half />
              <Opt active={stCategory === "junior"} onClick={() => setStCategory("junior")} title="Junior" sub="65cc and under" half />
            </div>
            {stCategory && (
              <>
                <div style={s.q}>How long would you like to store it?</div>
                {STORAGE_TERMS.map(t => (
                  <Opt key={t.key} active={stTerm === t.key} onClick={() => setStTerm(t.key)}
                    title={t.label}
                    sub={t.key === "month_to_month" ? undefined : `${aed(storageMonthlyRate(stCategory, t.key))}/month \u2014 paid upfront for ${t.months} months`}
                    price={storageTotalPrice(stCategory, t.key)}
                    perMonth={t.key === "month_to_month"} />
                ))}
              </>
            )}
            {stCategory && stTerm && (
              <div style={s.row}>
                <label style={{ ...s.field, flex: 1 }}><span style={s.label}>Make</span>
                  <input value={stMake} onChange={e => setStMake(e.target.value)} placeholder="e.g. KTM" style={s.input} /></label>
                <label style={{ ...s.field, flex: 1 }}><span style={s.label}>Model</span>
                  <input value={stModel} onChange={e => setStModel(e.target.value)} placeholder="e.g. 350 SX-F" style={s.input} /></label>
              </div>
            )}
          </section>
        )}

        {/* STEP 3 — date + contact */}
        {step === 3 && (
          <section style={s.card}>
            <label style={s.field}><span style={s.label}>{service === "motorcycle_storage" ? "Drop-off date" : "Preferred date"}</span>
              <input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} style={s.input} /></label>
            <label style={s.field}><span style={s.label}>Your name *</span>
              <input value={name} onChange={e => setName(e.target.value)} style={s.input} /></label>
            <label style={s.field}><span style={s.label}>WhatsApp number *</span>
              <div style={s.phoneRow}>
                <select value={countryIso} onChange={e => setCountryIso(e.target.value)} style={s.dial}>
                  {COUNTRIES.map(c => (
                    <option key={c.iso} value={c.iso}>{c.flag} {c.dial}  {c.name}</option>
                  ))}
                </select>
                <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
                  placeholder="50 123 4567" style={{ ...s.input, flex: 1 }} />
              </div>
              <span style={s.hint}>We send your booking confirmation and payment link here on WhatsApp.</span>
            </label>
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
              {q.custom || q.price === null
                ? <span style={s.poa}>We will confirm your quote</span>
                : <>{aed(q.price)}{q.perMonth && <span style={s.perMonthTag}> /month</span>}</>}
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

function ServiceIcon({ service }: { service: string }) {
  const common = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (service === "academy") return (
    <svg {...common}>
      <path d="M4.5 13C4.5 7.5 7.9 3.5 12 3.5S19.5 7.5 19.5 13" />
      <path d="M3.5 13.2h17" />
      <path d="M5.2 13.2v2.3a2.5 2.5 0 0 0 2.5 2.5h8.6a2.5 2.5 0 0 0 2.5-2.5v-2.3" />
      <path d="M8.3 16.6h7.4" />
    </svg>
  );
  if (service === "rental") return (
    <svg {...common}>
      <circle cx="6.5" cy="12" r="3" />
      <path d="M9.5 12H20" />
      <path d="M14.5 12v2.3" />
      <path d="M17.5 12v3.3" />
    </svg>
  );
  if (service === "desert_tour") return (
    <svg {...common}>
      <circle cx="17.5" cy="6.3" r="2.1" />
      <path d="M17.5 2.3v1.1" />
      <path d="M21.3 6.3h-1.1" />
      <path d="M20.1 3.1l-0.9 0.9" />
      <path d="M2.5 18.5c1.8-5.5 5-5.5 6.8 0" />
      <path d="M8 18.5c2.2-7 6-7 8.2 0" />
      <path d="M15 18.5c1.6-4.3 3.8-4.3 5.4 0" />
    </svg>
  );
  if (service === "workshop") return (
    <svg {...common}>
      <path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-.7-.7-2 2.1-2.1z" />
    </svg>
  );
  if (service === "motorcycle_storage") return (
    <svg {...common}>
      <path d="M4 11 12 4l8 7" />
      <path d="M5.5 11v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8" />
      <path d="M9 20v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5" />
    </svg>
  );
  return null;
}

function Opt({ active, onClick, title, sub, price, custom, perRider, perMonth, half, icon }: {
  active: boolean; onClick: () => void; title: string; sub?: string;
  price?: number | null; custom?: boolean; perRider?: boolean; perMonth?: boolean; half?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...s.opt, ...(half ? { flex: 1 } : {}), ...(active ? s.optOn : {}) }}>
      <span style={s.optMain}>
        {icon && <span style={{ ...s.optIconWrap, ...(active ? s.optIconWrapOn : {}) }}>{icon}</span>}
        <span style={s.optLeft}>
          <span style={s.optTitle}>{title}</span>
          {sub && <span style={s.optSub}>{sub}</span>}
        </span>
      </span>
      {price != null && <span style={s.optPrice}>{aed(price)}{perRider ? " /rider" : perMonth ? " /month" : ""}</span>}
      {custom && <span style={s.optPoa}>POA</span>}
    </button>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", padding: "36px 18px 70px", colorScheme: "dark", backgroundColor: "#1A1817", backgroundImage: "linear-gradient(180deg, rgba(18,20,19,0.34) 0%, rgba(18,20,19,0.58) 45%, rgba(18,20,19,0.90) 100%), url('/cover.jpg')", backgroundSize: "cover", backgroundPosition: "center 65%", backgroundRepeat: "no-repeat" },
  wrap: { maxWidth: 540, margin: "0 auto" },
  logo: { height: 54, width: "auto", display: "block", margin: "0 auto 18px", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" },
  h1: { fontSize: 28, fontWeight: 800, textAlign: "center", margin: "0 0 8px", textShadow: "0 2px 16px rgba(0,0,0,0.55)" },
  sub: { color: "#D8D2CC", textAlign: "center", fontSize: 14.5, margin: "0 0 24px", textShadow: "0 1px 10px rgba(0,0,0,0.5)" },
  steps: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 22 },
  stepDot: { width: 34, height: 4, borderRadius: 4, background: "#3A332E" },
  stepDotOn: { background: RED },
  card: { background: "rgba(32,30,29,0.94)", border: "1px solid #46413B", borderRadius: 16, padding: 18, boxShadow: "0 18px 50px rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" },
  q: { fontSize: 13, fontWeight: 700, letterSpacing: "0.03em", margin: "4px 0 12px", color: "#D8D2CC" },
  row: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 },
  opt: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "#151311", border: "1px solid #3A332E", borderRadius: 10, padding: "13px 15px", marginBottom: 10, cursor: "pointer", color: "#F4F2EF", fontFamily: "inherit" },
  optOn: { borderColor: RED, background: "#2A1718" },
  optMain: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  optIconWrap: { display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 9, background: "#1F1B19", color: "#9A938D", flexShrink: 0, transition: "background .15s ease, color .15s ease" },
  optIconWrapOn: { background: RED + "22", color: RED },
  optLeft: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
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
  phoneRow: { display: "flex", gap: 8 },
  dial: { flex: "0 0 132px", boxSizing: "border-box", background: "#151311", border: "1px solid #3A332E", borderRadius: 9, color: "#F4F2EF", fontSize: 15, padding: "11px 10px", fontFamily: "inherit" },
  hint: { fontSize: 11.5, color: "#7E776F", marginTop: 5, lineHeight: 1.4 },
  summary: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#242120", border: "1px solid " + RED + "55", borderRadius: 12, padding: "14px 16px", marginTop: 16 },
  summaryLabel: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A938D" },
  summaryText: { fontSize: 14, marginTop: 3 },
  summaryPrice: { fontSize: 18, fontWeight: 800, color: RED, whiteSpace: "nowrap" },
  poa: { fontSize: 13, fontWeight: 600, color: "#FFB02E" },
  perMonthTag: { fontSize: 12, fontWeight: 600, color: "#9A938D" },
  err: { color: "#FF6B6B", fontSize: 14, marginTop: 14 },
  nav: { display: "flex", gap: 10, marginTop: 20 },
  back: { flex: "0 0 auto", background: "transparent", color: "#9A938D", border: "1px solid #3A332E", borderRadius: 10, padding: "13px 22px", fontSize: 15, cursor: "pointer" },
  next: { flex: 1, background: RED, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  foot: { color: "#6F6862", fontSize: 12, textAlign: "center", marginTop: 18, lineHeight: 1.5 },
};
