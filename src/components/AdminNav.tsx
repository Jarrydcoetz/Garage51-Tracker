"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

export type NavPage =
  | "overview" | "bookings" | "workshop" | "storage"
  | "fleet" | "parts" | "clients" | "tasks" | "staff";

const ACCENT = "#3B9EFF";

const NAV_SECTIONS: { label: string; items: { key: NavPage; label: string; href: string }[] }[] = [
  {
    label: "OPERATIONS",
    items: [
      { key: "bookings", label: "Bookings",      href: "/admin" },
      { key: "workshop", label: "Workshop",       href: "/admin/workshop" },
      { key: "storage",  label: "Storage bikes",  href: "/admin/storage-bikes" },
    ],
  },
  {
    label: "ASSETS",
    items: [
      { key: "fleet", label: "Fleet",              href: "/admin/fleet" },
      { key: "parts", label: "Parts & inventory",  href: "/admin/parts" },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { key: "clients", label: "Clients", href: "/admin/clients" },
      { key: "tasks",   label: "Tasks",   href: "/admin/tasks" },
    ],
  },
];

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function AdminNav({ page, isAdmin }: { page: NavPage; isAdmin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const go = (href: string) => { router.push(href); setOpen(false); };

  const navItemStyle = (active: boolean): CSSProperties => ({
    display: "block", width: "100%", textAlign: "left",
    background: "transparent", fontFamily: "inherit",
    border: "none",
    borderLeft: `3px solid ${active ? ACCENT : "transparent"}`,
    borderRadius: 0,
    color: active ? ACCENT : "#F4F2EF",
    fontSize: 15, fontWeight: active ? 600 : 400,
    padding: "10px 14px 10px 11px",
    cursor: "pointer",
    transition: "color .15s, background .15s",
  });

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Menu"
        aria-expanded={open}
        style={{
          background: "transparent", color: "#B5AEA8",
          border: "1px solid #3A352F", borderRadius: 9,
          padding: "8px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {open && (
        <>
          {/* Overlay closes the menu */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 48 } as CSSProperties}
            aria-hidden="true"
          />

          {/* Dropdown */}
          <nav
            aria-label="Main navigation"
            style={{
              position: "absolute", top: 57, right: 16, zIndex: 49,
              background: "#221F1D", border: "1px solid #3A352F",
              borderRadius: 13, padding: "8px 0",
              minWidth: 230, boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            } as CSSProperties}
          >
            {NAV_SECTIONS.map(({ label, items }) => (
              <div key={label}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
                  color: "#6F6862", padding: "8px 14px 4px",
                  textTransform: "uppercase",
                }}>
                  {label}
                </div>
                {items.map(item => (
                  <button key={item.key} onClick={() => go(item.href)}
                    style={navItemStyle(page === item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}

            {/* Staff — admin only */}
            {isAdmin && (
              <button onClick={() => go("/admin/staff")}
                style={{
                  ...navItemStyle(page === "staff"),
                  marginTop: 2,
                }}>
                Staff
              </button>
            )}

            {/* Divider + Overview home */}
            <div style={{ height: 1, background: "#2A2623", margin: "8px 0" }} />
            <button onClick={() => go("/admin/overview")}
              style={{
                ...navItemStyle(page === "overview"),
                color: page === "overview" ? ACCENT : "#9A938D",
                fontSize: 13,
              }}>
              ← Overview
            </button>
          </nav>
        </>
      )}
    </>
  );
}
