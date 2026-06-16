import type { CSSProperties } from "react";

const RED = "#ED1C24";

export default function ThankYou() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51 Middle East" style={styles.logo} />
        <h1 style={styles.heading}>Enquiry received</h1>
        <p style={styles.text}>Thanks — the Garage51 team will be in touch with you shortly.</p>
        <a href="/" style={styles.link}>← Submit another enquiry</a>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#1A1817", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark" },
  card: { width: "100%", maxWidth: 460, background: "#242120", border: "1px solid #39342F", borderRadius: 16, padding: "40px 32px", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" },
  logo: { width: 200, maxWidth: "70%", height: "auto", margin: "0 auto 22px", display: "block" },
  heading: { color: "#F4F2EF", fontSize: 24, margin: "0 0 10px" },
  text: { color: "#B6AFA9", fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" },
  link: { color: RED, textDecoration: "none", fontWeight: 600, fontSize: 14 },
};