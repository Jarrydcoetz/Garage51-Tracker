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
    bike_year?: string | null;
    bike_hours?: string | null;
    selection?: string | null;
    estimated_value?: number | null;
    assigned_staff_name?: string | null;
    rider_category?: string | null;
    rider_count?: number | null;
    own_gear?: boolean | null;
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
    bikeYear: enquiry.bike_year ?? null,
    bikeHours: enquiry.bike_hours ?? null,
    selection: enquiry.selection ?? null,
    estimatedValue: enquiry.estimated_value ?? null,
    assignedStaffName: enquiry.assigned_staff_name ?? null,
    riderCategory: enquiry.rider_category ?? null,
    riderCount: enquiry.rider_count ?? null,
    ownGear: enquiry.own_gear ?? null,
  };

  try {
    const googleEventId = await syncSessionEvent(sessionInput, enquiryInput);
    return NextResponse.json({ google_event_id: googleEventId });
  } catch (err) {
    console.error("Calendar sync failed:", err);
    return NextResponse.json({ error: "Could not sync this session to Google Calendar." }, { status: 500 });
  }
}
