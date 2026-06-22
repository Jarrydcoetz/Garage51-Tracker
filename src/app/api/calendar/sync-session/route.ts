import { NextResponse } from "next/server";
import { syncSessionEvent, type CalendarEnquiryInput, type CalendarSessionInput } from "../../../../lib/googleCalendar";

type Body = {
  session?: {
    id?: string;
    scheduled_at?: string | null;
    status?: string;
    google_event_id?: string | null;
  };
  enquiry?: {
    id?: string;
    customer_name?: string;
    phone?: string;
    service_type?: string;
    notes?: string | null;
    work_required?: string | null;
    bike_details?: string | null;
  };
};

export async function POST(req: Request) {
  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { session, enquiry } = payload;
  if (!session?.id || !enquiry?.id) {
    return NextResponse.json({ error: "Missing session or enquiry data." }, { status: 400 });
  }

  const sessionInput: CalendarSessionInput = {
    sessionId: session.id,
    scheduledAt: session.scheduled_at ?? null,
    status: session.status ?? "scheduled",
    googleEventId: session.google_event_id ?? null,
  };

  const enquiryInput: CalendarEnquiryInput = {
    enquiryId: enquiry.id,
    customerName: enquiry.customer_name ?? "Customer",
    phone: enquiry.phone ?? "",
    serviceType: enquiry.service_type ?? "booking",
    notes: enquiry.notes ?? null,
    workRequired: enquiry.work_required ?? null,
    bikeDetails: enquiry.bike_details ?? null,
  };

  try {
    const googleEventId = await syncSessionEvent(sessionInput, enquiryInput);
    return NextResponse.json({ google_event_id: googleEventId });
  } catch (err) {
    console.error("Calendar sync failed:", err);
    return NextResponse.json({ error: "Could not sync this session to Google Calendar." }, { status: 500 });
  }
}
