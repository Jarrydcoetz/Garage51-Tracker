import type { CSSProperties } from "react";

const ORANGE = "#FF5E1A";

export default function ThankYou() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.badge}>✓</div>
        <h1 style={styles.heading}>Enquiry received</h1>
        <p style={styles.text}>Thanks — the Garage51 team will be in touch with you shortly.</p>
        <a href="/" style={styles.link}>← Submit another enquiry</a>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh", background: "#16171B", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark",
  },
  card: {
    width: "100%", maxWidth: 460, background: "#1E2026", border: "1px solid #2A2D34",
    borderRadius: 16, padding: "40px 32px", textAlign: "center",
    boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
  },
  badge: {
    width: 56, height: 56, borderRadius: "50%", background: ORANGE, color: "#16171B",
    fontSize: 28, fontWeight: 700, display: "grid", placeItems: "center", margin: "0 auto 20px",
  },
  heading: { color: "#F2F1EE", fontSize: 24, margin: "0 0 10px" },
  text: { color: "#A9ACB4", fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" },
  link: { color: ORANGE, textDecoration: "none", fontWeight: 600, fontSize: 14 },
};