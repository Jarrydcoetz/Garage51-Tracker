"use client";

import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import type { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import { AdminNav } from "../../../components/AdminNav";

const RED = "#ED1C24";
const AMBER = "#FFB02E";
const GREEN = "#2FBF71";
const BLUE = "#3B9EFF";
const GOLD = "#F59E0B";

const CATEGORIES = [
  { key: "client",   label: "Client",   color: BLUE },
  { key: "storage",  label: "Storage",  color: "#F97316" },
  { key: "workshop", label: "Workshop", color: AMBER },
  { key: "fleet",    label: "Fleet",    color: GREEN },
  { key: "academy",  label: "Academy",  color: "#A78BFA" },
  { key: "admin",    label: "Admin",    color: "#9A938D" },
  { key: "general",  label: "General",  color: "#6F6862" },
];
const PRIORITIES = [
  { key: "high",   label: "High",   color: RED },
  { key: "normal", label: "Normal", color: "#9A938D" },
  { key: "low",    label: "Low",    color: "#6F6862" },
];
const STATUSES = [
  { key: "open",        label: "Open",        color: "#9A938D" },
  { key: "in_progress", label: "In progress", color: BLUE },
  { key: "done",        label: "Done",        color: GREEN },
];

type Task = {
  id: string; title: string; description: string | null; category: string;
  status: string; priority: string;
  assigned_to: string | null; created_by: string | null;
  due_date: string | null; linked_label: string | null;
  linked_enquiry_id: string | null; linked_storage_bike_id: string | null;
  linked_client_phone: string | null; completed_at: string | null;
  created_at: string;
};
type Profile = { id: string; name: string | null; role: string };
const BLANK: Partial<Task> & { title: string } = {
  title: "", description: "", category: "general", status: "open",
  priority: "normal", assigned_to: null, due_date: null, linked_label: null,
  linked_enquiry_id: null, linked_storage_bike_id: null, linked_client_phone: null,
};

function catColor(key: string) { return CATEGORIES.find(c => c.key === key)?.color || "#6F6862"; }
function priColor(key: string) { return PRIORITIES.find(p => p.key === key)?.color || "#6F6862"; }
function statusColor(key: string) { return STATUSES.find(s => s.key === key)?.color || "#6F6862"; }

function dueDateLabel(d: string | null): { text: string; color: string } {
  if (!d) return { text: "", color: "#6F6862" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: RED };
  if (diff === 0) return { text: "Due today", color: AMBER };
  if (diff === 1) return { text: "Due tomorrow", color: AMBER };
  if (diff <= 7) return { text: `Due in ${diff}d`, color: "#9A938D" };
  return { text: due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), color: "#6F6862" };
}

function nextStatus(s: string) { return s === "open" ? "in_progress" : s === "in_progress" ? "done" : "open"; }

const CSS = `
.g51-btn{transition:background .15s,border-color .15s;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.task-row:hover{border-color:#403A35;}
nav button:hover{background:#2A2624 !important;}
`;

function TasksInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [priFilter, setPriFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK });
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setMyId(data.session.user.id);
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,name,role").eq("active", true),
      ]);
      setTasks((t as Task[]) || []);
      setProfiles((p as Profile[]) || []);
      setReady(true);
      // Pre-fill from URL params (contextual buttons on other pages)
      if (params.get("create") === "1") {
        setForm({
          ...BLANK,
          title: params.get("title") || "",
          category: params.get("category") || "general",
          linked_label: params.get("linked_label") || null,
          linked_storage_bike_id: params.get("linked_storage_bike_id") || null,
          linked_client_phone: params.get("linked_client_phone") || null,
          linked_enquiry_id: params.get("linked_enquiry_id") || null,
        });
        setCreating(true);
      }
    });
  }, [router, params]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }
  const setF = (k: string, v: string | null) => setForm(prev => ({ ...prev, [k]: v }));
  const setE = (k: string, v: string | null) => setEditForm(prev => ({ ...prev, [k]: v }));

  async function createTask() {
    if (!form.title.trim()) { showToast("Title is required.", "err"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("tasks").insert({
      title: form.title.trim(), description: form.description?.trim() || null,
      category: form.category, status: "open", priority: form.priority,
      assigned_to: form.assigned_to || null, created_by: myId,
      due_date: form.due_date || null, linked_label: form.linked_label || null,
      linked_storage_bike_id: form.linked_storage_bike_id || null,
      linked_client_phone: form.linked_client_phone || null,
      linked_enquiry_id: form.linked_enquiry_id || null,
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not create task.", "err"); setSaving(false); return; }
    setTasks(prev => [data as Task, ...prev]);
    setForm({ ...BLANK }); setCreating(false); setSaving(false);
    showToast("Task created.");
    router.replace("/admin/tasks"); // clear URL params
  }

  async function saveEdit(task: Task) {
    setSaving(true);
    const patch = { ...editForm };
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) { showToast(error.message || "Could not save.", "err"); setSaving(false); return; }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t));
    setEditingId(null); setSaving(false);
    showToast("Task saved.");
  }

  async function cycleStatus(task: Task) {
    const next = nextStatus(task.status);
    const completedAt = next === "done" ? new Date().toISOString() : null;
    await supabase.from("tasks").update({ status: next, completed_at: completedAt }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed_at: completedAt } : t));
  }

  async function deleteTask(id: string) {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    await supabase.from("tasks").delete().eq("id", id);
    setTasks(prev => prev.filter(t => t.id !== id));
    if (expanded === id) setExpanded(null);
    showToast("Task deleted.");
  }

  // Sort: open high → open normal → in_progress → open low → done
  const sortedTasks = useMemo(() => {
    const priority = { high: 0, normal: 1, low: 2 };
    const statusOrd = { open: 0, in_progress: 1, done: 2 };
    return [...tasks].sort((a, b) => {
      const so = (statusOrd[a.status as keyof typeof statusOrd] ?? 3) - (statusOrd[b.status as keyof typeof statusOrd] ?? 3);
      if (so !== 0) return so;
      const po = (priority[a.priority as keyof typeof priority] ?? 1) - (priority[b.priority as keyof typeof priority] ?? 1);
      if (po !== 0) return po;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1; if (b.due_date) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [tasks]);

  const visible = useMemo(() => sortedTasks.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (catFilter !== "all" && t.category !== catFilter) return false;
    if (priFilter !== "all" && t.priority !== priFilter) return false;
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "me" && t.assigned_to !== myId) return false;
      if (assigneeFilter !== "me" && t.assigned_to !== assigneeFilter) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q) || (t.linked_label || "").toLowerCase().includes(q);
    }
    return true;
  }), [sortedTasks, statusFilter, catFilter, priFilter, assigneeFilter, search, myId]);

  const counts = useMemo(() => ({
    open: tasks.filter(t => t.status === "open").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done: tasks.filter(t => t.status === "done").length,
    overdue: tasks.filter(t => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date()).length,
  }), [tasks]);

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const profileName = (id: string | null) => profiles.find(p => p.id === id)?.name || null;

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <AdminNav page="tasks" isAdmin={me?.role === "admin"} />
      </header>
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 48 } as CSSProperties} />
          <nav style={s.menu}>
            <button onClick={() => { router.push("/admin"); setMenuOpen(false); }} style={s.menuItem}>Bookings</button>
            <button onClick={() => { router.push("/admin/workshop"); setMenuOpen(false); }} style={s.menuItem}>Workshop</button>
            <button onClick={() => { router.push("/admin/storage-bikes"); setMenuOpen(false); }} style={s.menuItem}>Storage bikes</button>
            <button onClick={() => { router.push("/admin/clients"); setMenuOpen(false); }} style={s.menuItem}>Clients</button>
            <div style={{ height: 1, background: "#2A2623", margin: "4px 0" }} />
            <button onClick={() => { router.push("/admin/overview"); setMenuOpen(false); }} style={s.menuItem}>← Overview</button>
          </nav>
        </>
      )}

      <div style={s.wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <h1 style={s.h1}>Tasks</h1>
            <p style={s.sub}>
              {counts.open} open · {counts.in_progress} in progress · {counts.done} done
              {counts.overdue > 0 && <span style={{ color: RED, fontWeight: 600 }}> · {counts.overdue} overdue</span>}
            </p>
          </div>
          <button onClick={() => { setForm({ ...BLANK }); setCreating(true); }} className="g51-btn g51-ghost" style={s.ghostBtn}>+ New task</button>
        </div>

        {/* Create form */}
        {creating && (
          <div style={s.createCard}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#6F6862", marginBottom: 10 }}>NEW TASK</div>
            <input className="g51-input" value={form.title} onChange={e => setF("title", e.target.value)}
              placeholder="Task title *" style={{ ...s.input, marginBottom: 8, fontSize: 15, fontWeight: 500 }} autoFocus />
            <textarea className="g51-input" value={form.description || ""} onChange={e => setF("description", e.target.value)}
              placeholder="Description (optional)" rows={2} style={{ ...s.input, resize: "vertical", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <select className="g51-input" value={form.category} onChange={e => setF("category", e.target.value)} style={{ ...s.input, flex: "1 1 110px" }}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select className="g51-input" value={form.priority} onChange={e => setF("priority", e.target.value)} style={{ ...s.input, flex: "1 1 100px" }}>
                {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label} priority</option>)}
              </select>
              <select className="g51-input" value={form.assigned_to || ""} onChange={e => setF("assigned_to", e.target.value || null)} style={{ ...s.input, flex: "1 1 140px" }}>
                <option value="">Unassigned</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
              </select>
              <input className="g51-input" type="date" value={form.due_date || ""} onChange={e => setF("due_date", e.target.value || null)} style={{ ...s.input, flex: "1 1 130px" }} />
            </div>
            {form.linked_label && (
              <div style={{ fontSize: 12.5, color: "#9A938D", marginBottom: 8, fontStyle: "italic" }}>
                Linked to: {form.linked_label}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={createTask} disabled={saving}
                style={{ background: BLUE, border: "none", borderRadius: 9, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 18px", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Creating…" : "Create task"}
              </button>
              <button onClick={() => { setCreating(false); router.replace("/admin/tasks"); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#6F6862", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input className="g51-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…" style={{ ...s.input, paddingLeft: 32 }} />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#6F6862", cursor: "pointer", fontSize: 16 }}>×</button>}
        </div>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {[{ key: "all", label: "All", color: "#9A938D" }, ...STATUSES].map(({ key, label, color }) => {
            const count = key === "all" ? tasks.length : tasks.filter(t => t.status === key).length;
            const active = statusFilter === key;
            return (
              <button key={key} onClick={() => setStatusFilter(key)}
                style={{ background: active ? color + "22" : "transparent", border: `1px solid ${active ? color : "#2F2B27"}`, borderRadius: 20, color: active ? color : "#9A938D", fontSize: 12.5, fontWeight: active ? 700 : 500, padding: "4px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                {label} <span style={{ background: active ? color + "33" : "#2A2623", borderRadius: 10, padding: "1px 5px", fontSize: 11, fontWeight: 700, color: active ? color : "#6F6862" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Category + Priority + Assignee filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <select className="g51-input" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...s.input, flex: "0 0 auto", fontSize: 12.5, padding: "6px 10px" }}>
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select className="g51-input" value={priFilter} onChange={e => setPriFilter(e.target.value)} style={{ ...s.input, flex: "0 0 auto", fontSize: 12.5, padding: "6px 10px" }}>
            <option value="all">All priorities</option>
            {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select className="g51-input" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={{ ...s.input, flex: "0 0 auto", fontSize: 12.5, padding: "6px 10px" }}>
            <option value="all">All assignees</option>
            <option value="me">Assigned to me</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
          </select>
        </div>

        {/* Task list */}
        {visible.length === 0 ? (
          <div style={s.empty}>{search ? `No tasks match "${search}".` : "No tasks here."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {visible.map(task => {
              const isExpanded = expanded === task.id;
              const isEditing = editingId === task.id;
              const due = dueDateLabel(task.due_date);
              const assigneeName = profileName(task.assigned_to);
              const catCol = catColor(task.category);
              const priCol = priColor(task.priority);
              const stsCol = statusColor(task.status);

              return (
                <div key={task.id} className="task-row" style={{ background: "#1E1B19", border: "1px solid #2F2B27", borderRadius: 12, overflow: "hidden", transition: "border-color .15s", opacity: task.status === "done" ? 0.65 : 1 }}>
                  {/* Task header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
                    onClick={() => { setExpanded(isExpanded ? null : task.id); if (!isExpanded) { setEditForm({}); setEditingId(null); } }}>
                    {/* Status toggle */}
                    <button onClick={e => { e.stopPropagation(); cycleStatus(task); }}
                      title={`Status: ${task.status} — click to advance`}
                      style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${stsCol}`, background: task.status === "done" ? stsCol : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {task.status === "done" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      {task.status === "in_progress" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: stsCol }} />}
                    </button>
                    {/* Priority dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: priCol, flexShrink: 0 }} />
                    {/* Title + badges */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, textDecoration: task.status === "done" ? "line-through" : "none", color: task.status === "done" ? "#6F6862" : "#F4F2EF" }}>{task.title}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: `1px solid ${catCol}55`, borderRadius: 20, padding: "1px 7px", color: catCol, background: catCol + "18", whiteSpace: "nowrap" }}>
                          {CATEGORIES.find(c => c.key === task.category)?.label || task.category}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                        {task.linked_label && <span style={{ fontSize: 11.5, color: "#9A938D", fontStyle: "italic" }}>↗ {task.linked_label}</span>}
                        {due.text && <span style={{ fontSize: 11.5, color: due.color, fontWeight: due.color === RED ? 700 : 400 }}>{due.text}</span>}
                        {assigneeName && <span style={{ fontSize: 11.5, color: "#6F6862" }}>→ {assigneeName}</span>}
                      </div>
                    </div>
                    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s", opacity: 0.5, flexShrink: 0 }}>
                      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Expanded / edit panel */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #2A2623", padding: "12px 14px" }}>
                      {task.description && !isEditing && (
                        <p style={{ fontSize: 13.5, color: "#C9C2BC", margin: "0 0 10px", lineHeight: 1.5 }}>{task.description}</p>
                      )}
                      {isEditing ? (
                        <div>
                          <input className="g51-input" value={editForm.title ?? task.title} onChange={e => setE("title", e.target.value)}
                            style={{ ...s.input, marginBottom: 7, fontSize: 14, fontWeight: 500 }} />
                          <textarea className="g51-input" value={editForm.description ?? task.description ?? ""} onChange={e => setE("description", e.target.value)}
                            rows={2} style={{ ...s.input, resize: "vertical", marginBottom: 8 }} />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                            <select className="g51-input" value={editForm.category ?? task.category} onChange={e => setE("category", e.target.value)} style={{ ...s.input, flex: "1 1 100px" }}>
                              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                            <select className="g51-input" value={editForm.priority ?? task.priority} onChange={e => setE("priority", e.target.value)} style={{ ...s.input, flex: "1 1 100px" }}>
                              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                            <select className="g51-input" value={editForm.assigned_to ?? task.assigned_to ?? ""} onChange={e => setE("assigned_to", e.target.value || null)} style={{ ...s.input, flex: "1 1 130px" }}>
                              <option value="">Unassigned</option>
                              {profiles.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                            </select>
                            <input className="g51-input" type="date" value={editForm.due_date ?? task.due_date ?? ""} onChange={e => setE("due_date", e.target.value || null)} style={{ ...s.input, flex: "1 1 130px" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEdit(task)} disabled={saving} style={{ background: GREEN, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 16px", cursor: "pointer" }}>
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button onClick={() => setEditingId(null)} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={() => { setEditingId(task.id); setEditForm({}); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Edit</button>
                          <button onClick={() => cycleStatus(task)} className="g51-btn g51-ghost"
                            style={{ ...s.ghostBtn, color: statusColor(nextStatus(task.status)), borderColor: statusColor(nextStatus(task.status)) + "55" }}>
                            → Mark {STATUSES.find(s => s.key === nextStatus(task.status))?.label}
                          </button>
                          <button onClick={() => deleteTask(task.id)} className="g51-btn g51-ghost" style={{ ...s.ghostBtn, color: "#FF7A7A", marginLeft: "auto" }}>Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ ...s.toast, ...(toast.kind === "err" ? s.toastErr : s.toastOk) }}>{toast.msg}</div>
      )}
    </main>
  );
}

export default function TasksPage() {
  return <Suspense fallback={<main style={{ minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>Loading…</main>}><TasksInner /></Suspense>;
}

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 60, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623", position: "sticky", top: 0, background: "#181615", zIndex: 50 },
  logo: { height: 30, width: "auto" },
  menuBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", top: 57, right: 16, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 13, padding: "6px", zIndex: 49, minWidth: 200, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" } as CSSProperties,
  menuItem: { display: "block", width: "100%", textAlign: "left" as const, background: "transparent", border: "none", color: "#F4F2EF", fontSize: 15, fontWeight: 500, padding: "12px 14px", cursor: "pointer", borderRadius: 9, fontFamily: "inherit" },
  wrap: { maxWidth: 860, margin: "0 auto", padding: "24px 16px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 4px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 16px" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  input: { width: "100%", boxSizing: "border-box" as const, background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "9px 12px", fontFamily: "inherit" },
  createCard: { background: "#1E1B19", border: "1px solid #3A352F", borderRadius: 14, padding: "16px", marginBottom: 16 },
  empty: { color: "#8C857F", textAlign: "center" as const, padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" as const },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};
