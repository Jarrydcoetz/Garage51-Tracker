import { submitEnquiry } from "./actions";

export default function Home() {
  return (
    <main style={{ maxWidth: 480, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui" }}>
      <h1>Garage51 — Booking Enquiry</h1>
      <p>Tell us what you need and we&apos;ll be in touch.</p>
      <form action={submitEnquiry} style={{ display: "grid", gap: 14, marginTop: 20 }}>
        <label style={{ display: "grid", gap: 4 }}>
          Name
          <input name="customer_name" required style={{ padding: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          Phone / WhatsApp
          <input name="phone" required style={{ padding: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          Email
          <input name="email" type="email" style={{ padding: 8 }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          Service
          <select name="service_type" required style={{ padding: 8 }}>
            <option value="academy">Academy</option>
            <option value="rental">Bike rental</option>
            <option value="workshop">Workshop</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          Preferred date
          <input name="preferred_date" type="date" style={{ padding: 8 }} />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          Notes
          <textarea name="notes" rows={3} style={{ padding: 8 }} />
        </label>
        <button type="submit" style={{ padding: 10, fontWeight: 600, cursor: "pointer" }}>
          Send enquiry
        </button>
      </form>
    </main>
  );
}