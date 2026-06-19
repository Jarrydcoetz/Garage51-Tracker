import type { CSSProperties } from "react";

export default function ThankYou() {
  return (
    <main style={s.page}>
      <div style={s.wrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <div style={s.check}>✓</div>
        <h1 style={s.h1}>Enquiry received</h1>
        <p style={s.p}>
          Thanks — the Garage51 team will be in touch with you shortly to confirm availability and the details.
        </p>
        <a href="/" style={s.btn}>Submit another enquiry</a>
      </div>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", display: "grid", placeItems: "center", padding: "32px 20px", backgroundColor: "#1A1817", backgroundImage: "linear-gradient(180deg, rgba(18,20,19,0.55) 0%, rgba(18,20,19,0.74) 50%, rgba(18,20,19,0.90) 100%), url('/cover-confirm.jpg')", backgroundSize: "cover", backgroundPosition: "center 40%", backgroundRepeat: "no-repeat" },
  wrap: { maxWidth: 460, textAlign: "center" },
  logo: { height: 44, width: "auto", margin: "0 auto 28px", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" },
  check: { width: 64, height: 64, borderRadius: "50%", background: "#ED1C24", color: "#fff", fontSize: 34, fontWeight: 800, display: "grid", placeItems: "center", margin: "0 auto 22px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" },
  h1: { fontSize: 26, fontWeight: 800, margin: "0 0 12px", textShadow: "0 2px 16px rgba(0,0,0,0.55)" },
  p: { color: "#E4DED8", fontSize: 15.5, lineHeight: 1.6, margin: "0 0 28px", textShadow: "0 1px 10px rgba(0,0,0,0.5)" },
  btn: { display: "inline-block", background: "#ED1C24", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 15, padding: "12px 26px", borderRadius: 10 },
};
