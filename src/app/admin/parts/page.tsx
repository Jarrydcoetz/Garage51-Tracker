"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import {
  type Part,
  type StockMovement as Movement,
  type ServiceProduct,
  type ServiceProductItem,
  sellPrice,
  stockFor,
  isLowStock as isLow,
} from "../../../lib/partsShared";

const RED = "#ED1C24";

const CATEGORIES = [
  { key: "fluids", label: "Fluids & lubricants" },
  { key: "filters", label: "Filters" },
  { key: "brakes", label: "Brakes" },
  { key: "drivetrain", label: "Drivetrain & chain" },
  { key: "electrical", label: "Electrical" },
  { key: "tires", label: "Tires & tubes" },
  { key: "hardware", label: "Hardware & fasteners" },
  { key: "consumables", label: "Shop consumables" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]));
const CATEGORY_COLOR: Record<string, string> = {
  fluids: "#3B9EFF", filters: "#FFB02E", brakes: "#ED1C24", drivetrain: "#A78BFA",
  electrical: "#2FBF71", tires: "#5DCAA5", hardware: "#9A938D", consumables: "#D4537E",
};
const CATEGORY_PREFIX: Record<string, string> = {
  fluids: "FLU", filters: "FIL", brakes: "BRK", drivetrain: "DRV",
  electrical: "ELE", tires: "TIR", hardware: "HW", consumables: "CON",
};
const UNITS = ["each", "liter", "ml", "box", "set", "meter"];

type Supplier = { id: string; name: string };

const BLANK_PART = {
  name: "", sku: "", category: "fluids", unit: "each",
  cost_price: 0, markup_pct: 30, reorder_threshold: 0, location: "", supplier_id: "",
};

const CSS = `
.g51-btn{transition:background .15s ease,border-color .15s ease,opacity .15s ease;}
.g51-ghost:hover{border-color:#5A534D;color:#F4F2EF;}
.g51-primary:hover{background:#ff2a32;}
.g51-input:focus{outline:none;border-color:#6A625B;}
.g51-btn:disabled{opacity:.55;cursor:default;}
.g51-item:hover{background:#322D29;}
.g51-row:hover{background:#2A2624;}
`;

// Suggests "PREFIX-TOKEN" from the category and name — a starting point to
// tweak, not a final answer. Avoids clashing with whatever's already in use.
function suggestSku(name: string, category: string, existingSkus: string[]): string {
  const prefix = CATEGORY_PREFIX[category] || category.slice(0, 3).toUpperCase();
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const token = cleaned.slice(0, 6) || "ITEM";
  const taken = new Set(existingSkus.map(s => s.toUpperCase()));
  let candidate = `${prefix}-${token}`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${prefix}-${token}${n}`;
    n++;
  }
  return candidate;
}
const aed = (n: number) => "AED " + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", opacity: 0.7 }}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PartsScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ServiceProduct[]>([]);
  const [productItems, setProductItems] = useState<ServiceProductItem[]>([]);
  const [productsOpen, setProductsOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [recipePartSelection, setRecipePartSelection] = useState<Record<string, string>>({});
  const [recipeQty, setRecipeQty] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState("");
  const [form, setForm] = useState({ ...BLANK_PART });
  const [filter, setFilter] = useState("all");
  const [receiveOpenId, setReceiveOpenId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const [{ data: p }, { data: m }, { data: s }, { data: sp }, { data: spi }] = await Promise.all([
        supabase.from("parts").select("*").eq("active", true).order("name"),
        supabase.from("stock_movements").select("id, part_id, quantity, reason, created_at"),
        supabase.from("suppliers").select("id, name").order("name"),
        supabase.from("service_products").select("*").eq("active", true).order("name"),
        supabase.from("service_product_items").select("*"),
      ]);
      setParts((p as Part[]) || []);
      setMovements((m as Movement[]) || []);
      setSuppliers((s as Supplier[]) || []);
      setProducts((sp as ServiceProduct[]) || []);
      setProductItems((spi as ServiceProductItem[]) || []);
      setReady(true);
    });
  }, [router]);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  async function addNewSupplier() {
    const name = window.prompt("New supplier name:");
    if (!name || !name.trim()) return;
    const { data, error } = await supabase.from("suppliers").insert({ name: name.trim() }).select().single();
    if (error || !data) { showToast(error?.message || "Could not add supplier.", "err"); return; }
    const sp = data as Supplier;
    setSuppliers(prev => [...prev, sp].sort((a, b) => a.name.localeCompare(b.name)));
    set("supplier_id", sp.id);
    showToast(`Added supplier "${sp.name}".`);
  }

  async function createPart() {
    if (!form.name.trim()) { setAddError("Name is required."); return; }
    setCreating(true); setAddError("");
    const { data, error } = await supabase.from("parts").insert({
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      category: form.category,
      unit: form.unit,
      cost_price: Number(form.cost_price) || 0,
      markup_pct: Number(form.markup_pct) || 0,
      reorder_threshold: Number(form.reorder_threshold) || 0,
      location: form.location.trim() || null,
      supplier_id: form.supplier_id || null,
    }).select().single();
    if (error || !data) { setCreating(false); setAddError(error?.message || "Could not add part."); return; }
    setParts(prev => [...prev, data as Part].sort((a, b) => a.name.localeCompare(b.name)));
    setCreating(false);
    setForm({ ...BLANK_PART });
    setAdding(false);
    showToast(`Added "${(data as Part).name}".`);
  }

  function editPartLocal(id: string, patch: Partial<Part>) {
    setParts(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  }
  async function savePart(id: string, patch: Partial<Part>) {
    const { error } = await supabase.from("parts").update(patch).eq("id", id);
    if (error) showToast(error.message || "Could not save changes.", "err");
  }

  async function createProduct() {
    if (!newProductName.trim()) { showToast("Name is required.", "err"); return; }
    const price = Number(newProductPrice);
    if (!price || price <= 0) { showToast("Enter a price greater than zero.", "err"); return; }
    setCreatingProduct(true);
    const { data, error } = await supabase.from("service_products").insert({
      name: newProductName.trim(),
      price,
    }).select().single();
    setCreatingProduct(false);
    if (error || !data) { showToast(error?.message || "Could not add the product.", "err"); return; }
    setProducts(prev => [...prev, data as ServiceProduct].sort((a, b) => a.name.localeCompare(b.name)));
    setNewProductName("");
    setNewProductPrice("");
    showToast(`Added "${(data as ServiceProduct).name}".`);
  }

  async function addRecipeItem(product: ServiceProduct) {
    const partId = recipePartSelection[product.id];
    const qty = Number(recipeQty[product.id]);
    const part = parts.find(p => p.id === partId);
    if (!part) { showToast("Choose a part first.", "err"); return; }
    if (!qty || qty <= 0) { showToast("Enter a quantity greater than zero.", "err"); return; }
    const { data, error } = await supabase.from("service_product_items").insert({
      service_product_id: product.id, part_id: partId, quantity: qty,
    }).select().single();
    if (error || !data) { showToast(error?.message || "Could not add to the recipe.", "err"); return; }
    setProductItems(prev => [...prev, data as ServiceProductItem]);
    setRecipePartSelection(prev => ({ ...prev, [product.id]: "" }));
    setRecipeQty(prev => ({ ...prev, [product.id]: "" }));
    showToast(`Added ${qty} × ${part.name} to "${product.name}".`);
  }

  async function removeRecipeItem(item: ServiceProductItem) {
    await supabase.from("service_product_items").delete().eq("id", item.id);
    setProductItems(prev => prev.filter(i => i.id !== item.id));
  }

  async function removeProduct(product: ServiceProduct) {
    await supabase.from("service_products").update({ active: false }).eq("id", product.id);
    setProducts(prev => prev.filter(p => p.id !== product.id));
    showToast(`Removed "${product.name}" from the catalog.`);
  }

  async function receiveStock(part: Part) {
    const qty = Number(receiveQty);
    if (!qty || qty <= 0) { showToast("Enter a quantity greater than zero.", "err"); return; }
    const { data, error } = await supabase.from("stock_movements")
      .insert({ part_id: part.id, quantity: qty, reason: "received" })
      .select().single();
    if (error || !data) { showToast(error?.message || "Could not record stock received.", "err"); return; }
    setMovements(prev => [...prev, data as Movement]);
    setReceiveOpenId(null);
    setReceiveQty("");
    showToast(`Received ${qty} ${part.unit === "each" ? "" : part.unit} ${part.name}.`);
  }

  if (!ready) return <main style={s.loading}>Loading…</main>;

  const visible = filter === "all" ? parts : parts.filter(p => p.category === filter);
  const lowCount = parts.filter(p => isLow(p, stockFor(p.id, movements))).length;
  const counts: Record<string, number> = { all: parts.length };
  CATEGORIES.forEach(c => { counts[c.key] = parts.filter(p => p.category === c.key).length; });

  return (
    <main style={s.page}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={s.header}>
        <img src="/garage51-logo.png" alt="Garage51" style={s.logo} />
        <button onClick={() => setMenuOpen(m => !m)} className="g51-btn g51-ghost" style={s.menuBtn} aria-label="Menu">
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </header>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={s.menuOverlay} />
          <nav style={s.menuDropdown}>
            <button onClick={() => { router.push("/admin/fleet"); setMenuOpen(false); }} style={s.menuItem}>Fleet Bikes</button>
            <button onClick={() => { router.push("/admin/storage-bikes"); setMenuOpen(false); }} style={s.menuItem}>Storage Bikes</button>
            <button onClick={() => { router.push("/admin"); setMenuOpen(false); }} style={s.menuItem}>Bookings</button>
            <div style={s.menuDivider} />
            <button onClick={() => { router.push("/admin/overview"); setMenuOpen(false); }} style={s.menuItem}>← Overview</button>
          </nav>
        </>
      )}

      <div style={s.wrap}>
        <h1 style={s.h1}>Parts &amp; inventory</h1>
        <p style={s.sub}>Catalog, stock levels, and suppliers. Stock counts are computed from every receive and use — never edited directly.</p>

        {lowCount > 0 && (
          <div style={s.lowBanner}>⚠ {lowCount} part{lowCount > 1 ? "s" : ""} at or below reorder level</div>
        )}

        <div style={s.card}>
          <div style={s.cardTitleRow} onClick={() => setAdding(a => !a)}>
            <span style={s.cardTitle}>Add a part</span>
            <Chevron open={adding} />
          </div>
          {adding && (
            <>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Name *</span>
                  <input className="g51-input" value={form.name} onChange={e => set("name", e.target.value)} style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>SKU</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="g51-input" value={form.sku} onChange={e => set("sku", e.target.value)} placeholder="Matches the shelf label" style={s.input} />
                    <button onClick={() => {
                      if (!form.name.trim()) { showToast("Type a name first.", "err"); return; }
                      const existing = parts.map(p => p.sku || "").filter(Boolean);
                      set("sku", suggestSku(form.name, form.category, existing));
                    }} className="g51-btn g51-ghost" style={{ ...s.ghostBtn, flexShrink: 0 }}>Suggest</button>
                  </div></label>
              </div>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Category</span>
                  <select className="g51-input" value={form.category} onChange={e => set("category", e.target.value)} style={s.input}>
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Unit</span>
                  <select className="g51-input" value={form.unit} onChange={e => set("unit", e.target.value)} style={s.input}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select></label>
              </div>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Cost price (AED)</span>
                  <input className="g51-input" type="number" value={form.cost_price} onChange={e => set("cost_price", Number(e.target.value))} style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Markup %</span>
                  <input className="g51-input" type="number" value={form.markup_pct} onChange={e => set("markup_pct", Number(e.target.value))} style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Reorder at</span>
                  <input className="g51-input" type="number" value={form.reorder_threshold} onChange={e => set("reorder_threshold", Number(e.target.value))} style={s.input} /></label>
              </div>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Shelf / bin location</span>
                  <input className="g51-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. A2" style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Supplier</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select className="g51-input" value={form.supplier_id} onChange={e => set("supplier_id", e.target.value)} style={s.input}>
                      <option value="">No supplier</option>
                      {suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                    <button onClick={addNewSupplier} className="g51-btn g51-ghost" style={{ ...s.ghostBtn, flexShrink: 0 }}>+ New</button>
                  </div></label>
              </div>
              {addError && <p style={s.addError}>{addError}</p>}
              <div style={s.actions}>
                <button onClick={createPart} disabled={creating} className="g51-btn g51-primary" style={s.primaryBtn}>{creating ? "Adding…" : "Add part"}</button>
                <button onClick={() => { setAdding(false); setAddError(""); }} className="g51-btn g51-ghost" style={s.ghostBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitleRow} onClick={() => setProductsOpen(p => !p)}>
            <span style={s.cardTitle}>Service products{products.length > 0 ? ` (${products.length})` : ""}</span>
            <Chevron open={productsOpen} />
          </div>
          {productsOpen && (
            <>
              <p style={{ ...s.sub, margin: "10px 0 14px" }}>
                A fixed-price offering — like &ldquo;Four-stroke engine oil service&rdquo; — that quietly consumes its own
                recipe of parts when applied to a job. The customer sees one price; the parts it used still come off the shelf.
              </p>
              <div style={s.controls}>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Name</span>
                  <input className="g51-input" value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="e.g. Four-stroke engine oil service" style={s.input} /></label>
                <label style={s.ctrl}><span style={s.ctrlLabel}>Price (AED)</span>
                  <input className="g51-input" type="number" value={newProductPrice} onChange={e => setNewProductPrice(e.target.value)} style={s.input} /></label>
              </div>
              <div style={s.actions}>
                <button onClick={createProduct} disabled={creatingProduct} className="g51-btn g51-primary" style={s.primaryBtn}>
                  {creatingProduct ? "Adding…" : "Add product"}
                </button>
              </div>

              {products.length > 0 && (
                <div style={{ ...s.list, marginTop: 18 }}>
                  {products.map(product => {
                    const items = productItems.filter(i => i.service_product_id === product.id);
                    return (
                      <div key={product.id} style={s.row}>
                        <div style={s.rowMain}>
                          <div style={s.nameRow}>
                            <span style={s.partName}>{product.name}</span>
                            <span style={{ ...s.pill, color: "#2FBF71", borderColor: "#2FBF7166", background: "#2FBF711c" }}>{aed(product.price)}</span>
                          </div>
                          <div style={s.partSub}>
                            {items.length === 0
                              ? "No recipe set yet — applying this won't use any stock"
                              : items.map(i => `${parts.find(p => p.id === i.part_id)?.name || "?"} ×${i.quantity}`).join(", ")}
                          </div>
                        </div>
                        <details style={s.editWrap}>
                          <summary style={s.editSummary}>Edit recipe</summary>
                          {items.map(i => {
                            const part = parts.find(p => p.id === i.part_id);
                            return (
                              <div key={i.id} style={s.rowRight}>
                                <span style={{ flex: "1 1 auto" }}>{part?.name || "Unknown part"} × {i.quantity}</span>
                                <button onClick={() => removeRecipeItem(i)} className="g51-btn g51-ghost" style={{ ...s.smallGhost, color: "#FF7A7A" }}>Remove</button>
                              </div>
                            );
                          })}
                          <div style={{ ...s.rowRight, marginTop: 8 }}>
                            <select className="g51-input" value={recipePartSelection[product.id] || ""}
                              onChange={e => setRecipePartSelection(prev => ({ ...prev, [product.id]: e.target.value }))}
                              style={{ ...s.input, flex: "1 1 200px" }}>
                              <option value="">Choose a part…</option>
                              {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <input className="g51-input" type="number" min={1} value={recipeQty[product.id] || ""}
                              onChange={e => setRecipeQty(prev => ({ ...prev, [product.id]: e.target.value }))}
                              placeholder="Qty" style={s.qtyInput} />
                            <button onClick={() => addRecipeItem(product)} className="g51-btn g51-primary" style={s.smallPrimary}>Add</button>
                          </div>
                          <button onClick={() => removeProduct(product)} className="g51-btn g51-ghost" style={{ ...s.smallGhost, color: "#FF7A7A", marginTop: 10 }}>
                            Remove product
                          </button>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div style={s.filterRow}>
          <button onClick={() => setFilter("all")} className="g51-btn" style={{ ...s.filterPill, ...(filter === "all" ? s.filterPillOn : {}) }}>
            All <span style={s.filterCount}>{counts.all}</span>
          </button>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)} className="g51-btn"
              style={{ ...s.filterPill, ...(filter === c.key ? { ...s.filterPillOn, borderColor: CATEGORY_COLOR[c.key] } : {}) }}>
              {c.label} <span style={s.filterCount}>{counts[c.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div style={s.empty}>No parts in this category yet.</div>
        ) : (
          <div style={s.list}>
            {visible.map(p => {
              const stock = stockFor(p.id, movements);
              const low = isLow(p, stock);
              const supplier = suppliers.find(sp => sp.id === p.supplier_id);
              return (
                <div key={p.id} className="g51-row" style={s.row}>
                  <div style={s.rowMain}>
                    <div style={s.nameRow}>
                      <span style={s.partName}>{p.name}</span>
                      <span style={{ ...s.pill, color: CATEGORY_COLOR[p.category], borderColor: CATEGORY_COLOR[p.category] + "66", background: CATEGORY_COLOR[p.category] + "1c" }}>
                        {CATEGORY_LABEL[p.category] || p.category}
                      </span>
                      {low && <span style={s.lowBadge}>⚠ Low stock</span>}
                    </div>
                    <div style={s.partSub}>
                      {p.sku && <>{p.sku}<span style={s.dotSep}>·</span></>}
                      {stock} {p.unit !== "each" ? p.unit : ""} in stock
                      <span style={s.dotSep}>·</span>
                      {aed(p.cost_price)} cost → {aed(sellPrice(p))} sell
                      {p.location && <><span style={s.dotSep}>·</span>{p.location}</>}
                      {supplier && <><span style={s.dotSep}>·</span>{supplier.name}</>}
                    </div>
                  </div>
                  <div style={s.rowRight}>
                    {receiveOpenId === p.id ? (
                      <>
                        <input className="g51-input" type="number" autoFocus value={receiveQty}
                          onChange={e => setReceiveQty(e.target.value)} placeholder="Qty" style={s.qtyInput} />
                        <button onClick={() => receiveStock(p)} className="g51-btn g51-primary" style={s.smallPrimary}>Add</button>
                        <button onClick={() => { setReceiveOpenId(null); setReceiveQty(""); }} className="g51-btn g51-ghost" style={s.smallGhost}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => { setReceiveOpenId(p.id); setReceiveQty(""); }} className="g51-btn g51-ghost" style={s.smallGhost}>
                        + Receive stock
                      </button>
                    )}
                  </div>
                  <details style={s.editWrap}>
                    <summary style={s.editSummary}>Edit</summary>
                    <div style={s.controls}>
                      <label style={s.ctrl}><span style={s.ctrlLabel}>Cost price (AED)</span>
                        <input className="g51-input" type="number" value={p.cost_price}
                          onChange={e => editPartLocal(p.id, { cost_price: Number(e.target.value) })}
                          onBlur={e => savePart(p.id, { cost_price: Number(e.target.value) })} style={s.input} /></label>
                      <label style={s.ctrl}><span style={s.ctrlLabel}>Markup %</span>
                        <input className="g51-input" type="number" value={p.markup_pct}
                          onChange={e => editPartLocal(p.id, { markup_pct: Number(e.target.value) })}
                          onBlur={e => savePart(p.id, { markup_pct: Number(e.target.value) })} style={s.input} /></label>
                      <label style={s.ctrl}><span style={s.ctrlLabel}>Reorder at</span>
                        <input className="g51-input" type="number" value={p.reorder_threshold}
                          onChange={e => editPartLocal(p.id, { reorder_threshold: Number(e.target.value) })}
                          onBlur={e => savePart(p.id, { reorder_threshold: Number(e.target.value) })} style={s.input} /></label>
                    </div>
                    <div style={s.controls}>
                      <label style={s.ctrl}><span style={s.ctrlLabel}>Shelf / bin location</span>
                        <input className="g51-input" value={p.location || ""}
                          onChange={e => editPartLocal(p.id, { location: e.target.value })}
                          onBlur={e => savePart(p.id, { location: e.target.value || null })} style={s.input} /></label>
                      <label style={s.ctrl}><span style={s.ctrlLabel}>Category</span>
                        <select className="g51-input" value={p.category}
                          onChange={e => { editPartLocal(p.id, { category: e.target.value }); savePart(p.id, { category: e.target.value }); }} style={s.input}>
                          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select></label>
                    </div>
                    <button onClick={async () => {
                      await supabase.from("parts").update({ active: false }).eq("id", p.id);
                      setParts(prev => prev.filter(x => x.id !== p.id));
                      showToast(`Removed "${p.name}" from the catalog.`);
                    }} className="g51-btn g51-ghost" style={{ ...s.smallGhost, color: "#FF7A7A" }}>Remove from catalog</button>
                  </details>
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

const s: Record<string, CSSProperties> = {
  loading: { minHeight: "100vh", background: "#181615", color: "#9A938D", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" },
  page: { minHeight: "100vh", background: "#181615", color: "#F4F2EF", fontFamily: "system-ui, -apple-system, sans-serif", colorScheme: "dark", paddingBottom: 50, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #2A2623", position: "sticky", top: 0, background: "#181615", zIndex: 50 },
  logo: { height: 30, width: "auto" },
  menuBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  menuOverlay: { position: "fixed", inset: 0, zIndex: 48 } as CSSProperties,
  menuDropdown: { position: "absolute", top: 57, right: 16, background: "#221F1D", border: "1px solid #3A352F", borderRadius: 13, padding: "6px", zIndex: 49, minWidth: 200, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" } as CSSProperties,
  menuItem: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#F4F2EF", fontSize: 15, fontWeight: 500, padding: "12px 14px", cursor: "pointer", borderRadius: 9, fontFamily: "inherit" } as CSSProperties,
  menuDivider: { height: 1, background: "#2A2623", margin: "4px 0" },
  ghostBtn: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  wrap: { maxWidth: 860, margin: "0 auto", padding: "26px 20px 0" },
  h1: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" },
  sub: { color: "#9A938D", fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 },
  lowBanner: { background: "#FFB02E18", border: "1px solid #FFB02E55", color: "#FFB02E", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 18 },
  card: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 14, padding: 18, marginBottom: 22 },
  cardTitleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" },
  cardTitle: { fontWeight: 700, fontSize: 15 },
  controls: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 },
  ctrl: { display: "grid", gap: 5, flex: "1 1 160px" },
  ctrlLabel: { fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A938D" },
  input: { width: "100%", boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "10px 12px", fontFamily: "inherit" },
  addError: { color: "#FF6B6B", fontSize: 13, margin: "12px 0 0" },
  actions: { display: "flex", gap: 10, marginTop: 16 },
  primaryBtn: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  filterRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  filterPill: { background: "#221F1D", color: "#9A938D", border: "1px solid #2F2B27", borderRadius: 20, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  filterPillOn: { color: "#F4F2EF", borderColor: "#5A534D", background: "#2A2624" },
  filterCount: { color: "#6F6862", marginLeft: 4 },
  empty: { color: "#8C857F", textAlign: "center", padding: "40px 20px", border: "1px dashed #322E2A", borderRadius: 14, fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 9 },
  row: { background: "#221F1D", border: "1px solid #2F2B27", borderRadius: 12, padding: "13px 16px" },
  rowMain: { marginBottom: 4 },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  partName: { fontWeight: 600, fontSize: 15 },
  pill: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", border: "1px solid", borderRadius: 20, padding: "2px 9px", whiteSpace: "nowrap" },
  lowBadge: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFB02E", border: "1px solid #FFB02E55", background: "#FFB02E18", borderRadius: 20, padding: "2px 8px" },
  partSub: { fontSize: 12.5, color: "#9A938D", marginTop: 4, lineHeight: 1.5 },
  dotSep: { margin: "0 7px", opacity: 0.5 },
  rowRight: { display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" },
  qtyInput: { width: 80, boxSizing: "border-box", background: "#141211", border: "1px solid #322E2A", borderRadius: 9, color: "#F4F2EF", fontSize: 14, padding: "8px 10px", fontFamily: "inherit" },
  smallPrimary: { background: RED, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  smallGhost: { background: "transparent", color: "#B5AEA8", border: "1px solid #3A352F", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  editWrap: { marginTop: 10, borderTop: "1px solid #2A2623", paddingTop: 8 },
  editSummary: { cursor: "pointer", fontSize: 12.5, color: "#8C857F", fontWeight: 600 },
  toast: { position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 100, maxWidth: "calc(100vw - 32px)", padding: "12px 18px", borderRadius: 11, fontSize: 14, fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: "1px solid", textAlign: "center" },
  toastOk: { background: "#10301C", color: "#7CE0A6", borderColor: "#2FBF7155" },
  toastErr: { background: "#3A1518", color: "#FF9B9B", borderColor: "#ED1C2455" },
};
