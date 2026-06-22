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
  durationMinutes?: number; // defaults to 60
};

export type CalendarEnquiryInput = {
  enquiryId: string;
  customerName: string;
  phone: string;
  serviceType: string;
  notes?: string | null;
  workRequired?: string | null;
  bikeDetails?: string | null;
};

// ---- helpers --------------------------------------------------------------

function buildEventBody(session: CalendarSessionInput, enquiry: CalendarEnquiryInput) {
  const start = new Date(session.scheduledAt as string);
  const minutes = session.durationMinutes ?? 60;
  const end = new Date(start.getTime() + minutes * 60000);

  const descriptionParts = [
    `Phone: ${enquiry.phone}`,
    enquiry.bikeDetails ? `Bike: ${enquiry.bikeDetails}` : null,
    enquiry.workRequired ? `Work required: ${enquiry.workRequired}` : null,
    enquiry.notes ? `Notes: ${enquiry.notes}` : null,
  ].filter(Boolean) as string[];

  return {
    summary: `${enquiry.customerName} — ${enquiry.serviceType.replace("_", " ")}`,
    description: descriptionParts.join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
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
