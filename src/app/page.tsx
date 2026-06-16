import { submitEnquiry } from "./actions";
import type { ReactNode, CSSProperties } from "react";

const RED = "#ED1C24";
const C = {
  page: "#1A1817", card: "#242120", border: "#39342F",
  inputBg: "#151311", inputBorder: "#3A332E", text: "#F4F2EF", muted: "#9A938D",
};

export default function Home() {
  return (
    <div style={styles.page}>
      <style>{css}</style>
      <div style={styles.card}>
        <header style={styles.header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/garage51-logo.png" alt="Garage51 Middle East" style={styles.logo} />
          <div style={styles.tagline}>Booking Enquiry</div>
        </header>

        <p style={styles.intro}>
          Tell us what you need — academy training, a bike rental, or workshop service —
          and the team will be in touch.
        </p>

        <form action={submitEnquiry} style={styles.form}>
          <Field label="Name">
            <input name="customer_name" required placeholder="Your full name" style={styles.input} className="g51-input" />
          </Field>
          <Field label="Phone / WhatsApp">
            <input name="phone" required placeholder="+971 5X XXX XXXX" style={styles.input} className="g51-input" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" placeholder="you@email.com" style={styles.input} className="g51-input" />
          </Field>
          <Field label="Service">
            <select name="service_type" required defaultValue="academy" style={styles.input} className="g51-input">
              <option value="academy">Academy — training</option>
              <option value="rental">Bike rental</option>
              <option value="workshop">Workshop — service</option>
            </select>
          </Field>
          <Field label="Preferred date">
            <input name="preferred_date" type="date" style={styles.input} className="g51-input" />
          </Field>
          <Field label="Message">
            <textarea name="notes" rows={3} placeholder="Tell us a bit more…" style={{ ...styles.input, resize: "vertical" }} className="g51-input" />
          </Field>
          <button type="submit" style={styles.button} className="g51-button">Send enquiry</button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const css = `
.g51-input::placeholder { color: #6E6862; }
.g51-input:focus { outline: none; border-color: ${RED}; box-shadow: 0 0 0 3px rgba(237,28,36,0.18); }
.g51-button:hover { background: #cf1820; }
`;

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: C.page, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark" },
  card: { width: "100%", maxWidth: 520, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" },
  header: { textAlign: "center", marginBottom: 22 },
  logo: { width: 230, maxWidth: "80%", height: "auto", display: "block", margin: "0 auto" },
  tagline: { fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", color: C.muted, marginTop: 14 },
  intro: { color: "#B6AFA9", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 24px", textAlign: "center" },
  form: { display: "grid", gap: 16 },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, fontWeight: 600 },
  input: { width: "100%", boxSizing: "border-box", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 9, color: C.text, fontSize: 15, padding: "11px 13px", fontFamily: "inherit" },
  button: { marginTop: 6, background: RED, color: "#FFFFFF", border: "none", borderRadius: 10, padding: "14px", fontSize: 15.5, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" },
};