import { NextResponse } from "next/server";
import { verifyAdmin, unauthorised } from "../../../../lib/api-auth";
import { syncTaskEvent, type CalendarTaskInput } from "../../../../lib/googleCalendar";

type Body = {
  task?: {
    id?: string;
    title?: string;
    description?: string | null;
    category?: string | null;
    linked_label?: string | null;
    scheduled_at?: string | null;
    duration_minutes?: number | null;
    google_event_id?: string | null;
    assignee_names?: string[];
    primary_assignee_id?: string | null;
  };
};

export async function POST(req: Request) {
  // Any authenticated staff member can push their own tasks — not admin-only,
  // same reasoning as the payment-link route.
  const userId = await verifyAdmin(req, "any");
  if (!userId) return unauthorised();

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { task } = payload;
  if (!task?.id || !task?.title) {
    return NextResponse.json({ error: "Missing task data." }, { status: 400 });
  }

  const taskInput: CalendarTaskInput = {
    taskId: task.id,
    title: task.title,
    description: task.description ?? null,
    category: task.category ?? null,
    linkedLabel: task.linked_label ?? null,
    scheduledAt: task.scheduled_at ?? null,
    durationMinutes: task.duration_minutes ?? undefined,
    googleEventId: task.google_event_id ?? null,
    assigneeNames: task.assignee_names ?? [],
    primaryAssigneeId: task.primary_assignee_id ?? null,
  };

  try {
    const googleEventId = await syncTaskEvent(taskInput);
    return NextResponse.json({ google_event_id: googleEventId });
  } catch (err) {
    console.error("Task calendar sync failed:", err);
    return NextResponse.json({ error: "Could not sync this task to Google Calendar." }, { status: 500 });
  }
}
