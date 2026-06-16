import { submitEnquiry } from "./actions";
import type { ReactNode, CSSProperties } from "react";

const ORANGE = "#FF5E1A";

export default function Home() {
  return (
    <div style={styles.page}>
      <style>{css}</style>
      <div style={styles.card}>
        <header style={styles.header}>
          <div style={styles.mark}>G51</div>
          <div>
            <div style={styles.wordmark}>GARAGE<span style={{ color: ORANGE }}>51</span></div>
            <div style={styles.tagline}>Booking Enquiry</div>
          </div>
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
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&display=swap');
.g51-input::placeholder { color: #6B6F78; }
.g51-input:focus { outline: none; border-color: ${ORANGE}; box-shadow: 0 0 0 3px rgba(255,94,26,0.18); }
.g51-button:hover { background: #e54e12; }
`;

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#16171B",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "48px 20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    colorScheme: "dark",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "#1E2026",
    border: "1px solid #2A2D34",
    borderRadius: 16,
    padding: "32px 28px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
  },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 },
  mark: {
    background: ORANGE, color: "#16171B", fontFamily: "'Oswald', system-ui, sans-serif",
    fontWeight: 700, fontSize: 18, width: 46, height: 46, borderRadius: 10,
    display: "grid", placeItems: "center", transform: "skewX(-6deg)",
  },
  wordmark: {
    fontFamily: "'Oswald', system-ui, sans-serif", fontWeight: 700, fontSize: 26,
    letterSpacing: "0.08em", color: "#F2F1EE", lineHeight: 1,
  },
  tagline: {
    fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase",
    color: "#8A8D96", marginTop: 5,
  },
  intro: { color: "#A9ACB4", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 24px" },
  form: { display: "grid", gap: 16 },
  field: { display: "grid", gap: 6 },
  label: {
    fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "#8A8D96", fontWeight: 600,
  },
  input: {
    width: "100%", boxSizing: "border-box",
    background: "#121317", border: "1px solid #2C2F36", borderRadius: 9,
    color: "#F2F1EE", fontSize: 15, padding: "11px 13px", fontFamily: "inherit",
  },
  button: {
    marginTop: 6, background: ORANGE, color: "#16171B", border: "none",
    borderRadius: 10, padding: "14px", fontSize: 15.5, fontWeight: 700,
    cursor: "pointer", letterSpacing: "0.02em",
  },
};