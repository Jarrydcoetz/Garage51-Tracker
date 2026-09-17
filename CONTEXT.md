# Garage51-Tracker — Project Context

_Last refreshed: 2026-09-15_

## What this is
Internal operations app for Garage51 (motorbike workshop/rental/storage/academy business, Dubai). Next.js 16 + React 19 + Supabase (DB/Auth/Realtime), deployed via Vercel. GitHub: `Jarrydcoetz/Garage51-Tracker`. Public marketing site is a **separate** repo/project (`garage51-site`) — not this one.

## Core structure
- **Customer-facing** (`src/app/page.tsx`, `actions.ts`, `login`/`welcome`/`thank-you`/`payment-success`): no customer accounts. One enquiry form branches into Academy / Rental / Desert Tour / Membership / Workshop / Storage, with waiver signing (`src/lib/waivers.ts`) where legally required. Writes `clients`, `enquiries`, `waiver_acceptances`.
- **Staff/admin** (`src/app/admin/*`): roles are admin / mechanic / coach / facilities (`src/lib/roles.ts`; coach & facilities have no dedicated page yet). Modules: Overview (dashboard), Bookings (`/admin`), Workshop (mechanic job queue), Fleet (in-house bike maintenance), Storage-bikes (storage service + renewal billing — largest module), Clients (CRM rollup by phone), Staff (HR), Parts (inventory), Tasks (kanban).
- **External integrations**: Ziina (payments, webhook-verified via HMAC+IP allowlist), Zoho Books (invoicing, self-heals VAT-treatment/contact-reactivation issues but always manually triggered, always drafts), Google Calendar (one shared calendar, one-way app→calendar sync), WhatsApp (staff-facing sends are still manual `wa.me` deep links; the customer-facing enquiry acknowledgement is now automated via Meta's WhatsApp Cloud API — see below), Cloudflare Turnstile (bot check on public form).

## Current automation state (as of 2026-09-15, mid automation round)
No cron/scheduled jobs anywhere in the app. Automated: enquiry intake writes, Ziina payment-webhook status updates, derived/computed fields (stock levels, service-due flags, job totals), and (as of this round, pending Jarryd's Meta account setup) the enquiry-received WhatsApp acknowledgement. Still manual: all other WhatsApp sends (staff notify, payment link, service requests, renewal notices), payment-link generation, invoice creation, storage renewal billing, engine-hours entry. Full detail lives in the business-structure diagram artifact (below) and the plan file that produced it.

## Active initiative
Automating opportunity #1 from the diagram: the customer-facing "enquiry received" acknowledgement. Code is built and live-tested (`src/lib/whatsapp.ts`, wired into `src/app/actions.ts`), currently a safe no-op until Jarryd finishes setting up **Meta's WhatsApp Cloud API** (switched from Twilio after Twilio gated its sandbox behind a billing upgrade). Waiting on Jarryd to: create the Meta Business app + WhatsApp product, submit the "enquiry received" template for approval, and paste `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` into `.env.local`. Also waiting on him to run one ALTER TABLE in Supabase (adds `whatsapp_ack_sent_at`/`whatsapp_ack_error` to `enquiries`) and to delete two clearly-marked test enquiry rows (+971500000001, +971500000002) left in production from live-testing this code. Plan file: `/Users/jarryd/.claude/plans/sunny-stirring-eclipse.md`. See `TODO.md` for full round-by-round status.

## Key files for future sessions
- `src/lib/roles.ts` — role model
- `src/lib/waivers.ts` — legal waiver templates (status: awaiting UAE legal review, English-only)
- `src/lib/whatsapp.ts` — enquiry-received WhatsApp acknowledgement (Meta Cloud API), no-op until env vars are set
- `src/lib/zohoBooks.ts`, `src/app/api/zoho/create-invoice/route.ts` — invoicing, historically fragile (VAT/Designated-Zone + contact-reactivation self-healing added Sep 2026)
- `src/app/api/ziina-webhook/route.ts` — payment webhook, security-hardened
- `src/lib/googleCalendar.ts` — one-way, single shared calendar
- `src/app/admin/storage-bikes/page.tsx` — largest/most complex module (service tracking + renewal billing)
