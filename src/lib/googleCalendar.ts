import { google } from "googleapis";

// ---- auth -------------------------------------------------------------

let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

function getAuth() {
  if (!cachedAuth) {
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
    cachedAuth = new google.auth.GoogleAuth({
      credentials: JSON.parse(key),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
  }
  return cachedAuth;
}

function getCalendar() {
  return google.calendar({ version: "v3", auth: getAuth() });
}

function getCalendarId() {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error("GOOGLE_CALENDAR_ID is not set");
  return id;
}

// ---- types --------------------------------------------------------------

export type CalendarSessionInput = {
  sessionId: string;
  scheduledAt: string | null; // ISO string, or null = unscheduled
  status: string; // "scheduled" | "completed" | "no_show" | "cancelled"
  googleEventId: string | null;
  durationMinutes?: number; // defaults to 120 (2 hours) — sessions normally carry their own real value now
};

export type CalendarEnquiryInput = {
  enquiryId: string;
  customerName: string;
  phone: string;
  serviceType: string;
  notes?: string | null;
  workRequired?: string | null;
  bikeDetails?: string | null;
  bikeYear?: string | null;
  bikeHours?: string | null;
  selection?: string | null;
  estimatedValue?: number | null;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  riderCategory?: string | null;
  riderCount?: number | null;
  ownGear?: boolean | null;
};

// Google Calendar's fixed event-color palette: valid colorId values are the
// strings "1" through "11", each a distinct, stable color in the Calendar UI.
const EVENT_COLOR_IDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

// Deterministically maps a staff member to one of those 11 colors, so the
// same person's bookings always render the same color without needing any
// manual color-picker UI. Unassigned bookings get no colorId at all, so they
// fall back to the calendar's default color — visually distinct from "assigned."
function colorIdForStaff(staffId: string): string {
  let hash = 0;
  for (let i = 0; i < staffId.length; i++) {
    hash = (hash * 31 + staffId.charCodeAt(i)) >>> 0;
  }
  return EVENT_COLOR_IDS[hash % EVENT_COLOR_IDS.length];
}

// ---- helpers --------------------------------------------------------------

function buildEventBody(session: CalendarSessionInput, enquiry: CalendarEnquiryInput) {
  const start = new Date(session.scheduledAt as string);
  const minutes = session.durationMinutes ?? 120;
  const end = new Date(start.getTime() + minutes * 60000);

  const descriptionParts: string[] = [`Phone: ${enquiry.phone}`];
  if (enquiry.assignedStaffName) descriptionParts.push(`Assigned to: ${enquiry.assignedStaffName}`);
  if (enquiry.selection) descriptionParts.push(`Requested: ${enquiry.selection}`);
  if (enquiry.riderCategory) descriptionParts.push(`Rider category: ${enquiry.riderCategory}`);
  if (enquiry.riderCount) descriptionParts.push(`Riders: ${enquiry.riderCount}`);
  if (enquiry.ownGear != null) descriptionParts.push(`Own gear: ${enquiry.ownGear ? "Yes" : "No"}`);
  if (enquiry.bikeDetails) descriptionParts.push(`Bike: ${enquiry.bikeDetails}`);
  if (enquiry.bikeYear) descriptionParts.push(`Year: ${enquiry.bikeYear}`);
  if (enquiry.bikeHours) descriptionParts.push(`Hours/mileage: ${enquiry.bikeHours}`);
  if (enquiry.workRequired) descriptionParts.push(`Work required: ${enquiry.workRequired}`);
  if (enquiry.estimatedValue) descriptionParts.push(`Estimated value: AED ${enquiry.estimatedValue.toLocaleString()}`);
  if (enquiry.notes) descriptionParts.push(`Notes: ${enquiry.notes}`);

  const titleSuffix = enquiry.assignedStaffName ? ` · ${enquiry.assignedStaffName}` : "";

  return {
    summary: `${enquiry.customerName} — ${enquiry.serviceType.replace("_", " ")}${titleSuffix}`,
    description: descriptionParts.join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    colorId: enquiry.assignedStaffId ? colorIdForStaff(enquiry.assignedStaffId) : undefined,
    extendedProperties: {
      private: {
        enquiryId: enquiry.enquiryId,
        sessionId: session.sessionId,
      },
    },
  };
}

function shouldRemoveFromCalendar(session: CalendarSessionInput) {
  return !session.scheduledAt || session.status === "cancelled" || session.status === "no_show";
}

function isNotFound(err: unknown) {
  const e = err as { code?: number; response?: { status?: number } };
  return e?.code === 404 || e?.response?.status === 404;
}

// ---- public API -------------------------------------------------------------

/**
 * Creates, updates, or removes the Google Calendar event for a single session,
 * based on its current scheduled_at / status. Returns the resulting Google
 * event ID, or null if there is no event (removed, or never scheduled).
 */
export async function syncSessionEvent(
  session: CalendarSessionInput,
  enquiry: CalendarEnquiryInput
): Promise<string | null> {
  const calendar = getCalendar();
  const calendarId = getCalendarId();

  if (shouldRemoveFromCalendar(session)) {
    if (session.googleEventId) {
      try {
        await calendar.events.delete({ calendarId, eventId: session.googleEventId });
      } catch (err) {
        if (!isNotFound(err)) throw err; // already gone is fine, anything else isn't
      }
    }
    return null;
  }

  const requestBody = buildEventBody(session, enquiry);

  if (session.googleEventId) {
    try {
      const { data } = await calendar.events.update({
        calendarId,
        eventId: session.googleEventId,
        requestBody,
      });
      return data.id ?? session.googleEventId;
    } catch (err) {
      // Event may have been deleted directly in Calendar — fall through and recreate it.
      if (!isNotFound(err)) throw err;
    }
  }

  const { data } = await calendar.events.insert({ calendarId, requestBody });
  return data.id ?? null;
}
