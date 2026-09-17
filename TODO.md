# TODO — Round: Business-structure / automation-opportunity diagram

Started: 2026-09-15. Plan: `/Users/jarryd/.claude/plans/sunny-stirring-eclipse.md`

- [x] Map customer-facing booking/waiver/payment flow (Explore agent report, 2026-09-15)
- [x] Map internal admin/staff workflows across all modules (Explore agent report, 2026-09-15)
- [x] Map external integrations: Ziina, Zoho Books, Google Calendar (Explore agent report, 2026-09-15)
- [x] Synthesize findings into plan, get user greenlight (plan approved 2026-09-15)
- [x] Create CONTEXT.md and this TODO.md for the project
- [x] Load `artifact-design` and `artifact-diagramming` skills before building
- [x] Build interactive swimlane diagram Artifact "The Manual Middle": Customer/Public Site/Admin-Staff/Workshop-Storage/External Systems lanes × 6 process stages, automated (green) vs manual (amber, dashed) vs customer-action (outline) vs external (slate) coding, 8 numbered ranked automation-opportunity callouts
- [x] Verify: viewed rendered artifact once (dark theme), fixed one badge-placement overlap found (badge "1" was sitting on the seam between two stacked nodes), republished as v2
- [x] Publish artifact and send Jarryd the direct URL — https://claude.ai/artifact/UqEb9xiyd1Fgou4h5NmeXH
- [x] Confirm with Jarryd which manual workflow to tackle first — chose #1: automatic customer follow-up after enquiry (2026-09-15)

Note: light-theme and narrow-width rendering were not visually re-checked after the fix (browser scroll tooling couldn't confirm past the first viewport in this session) — flag if anything looks off below the fold.

---

# TODO — Round: Automate opportunity #1 (WhatsApp enquiry acknowledgement)

Started: 2026-09-15. Plan: `/Users/jarryd/.claude/plans/sunny-stirring-eclipse.md`

- [x] Choose channel + provider with Jarryd: WhatsApp via Twilio (from-scratch account), plan approved 2026-09-15
- [x] Build `src/lib/whatsapp.ts` — `sendEnquiryAck()`, no-op-safe when Twilio env vars are unset
- [x] Wire into `src/app/actions.ts` `submitEnquiry()` — non-blocking, records `whatsapp_ack_sent_at` / `whatsapp_ack_error`
- [x] Add `TWILIO_*` placeholders to `.env.local` (no `.env.example` exists in this repo — confirmed, only `garage51-site` has one)
- [x] Add staff-visible indicator on `/admin` for `whatsapp_ack_error` (⚠ WhatsApp not sent badge, same style as the existing conflict badge)
- [x] Verify: `npm run lint` and `npx tsc --noEmit` both pass with no new errors (pre-existing unrelated lint errors in other files untouched)
- [x] Live test with Jarryd's explicit go-ahead: real `submitEnquiry()` call against production Supabase (test row "TEST — Claude live test (delete me)", phone +971500000001, id `7ffbeaf8-d43b-48f0-b932-5d0b51c4937a`) — confirmed `{ok: true}` and the graceful "WhatsApp not configured, skipping" no-op; throwaway scripts deleted after, test row left for Jarryd to clean up
- [x] **Provider swap: Twilio → Meta WhatsApp Cloud API** — Twilio required adding a card ("upgrade your account") just to unlock the sandbox, undercutting the frictionless-testing reason it was picked; Jarryd chose Meta direct instead (free test tier, no billing info, more technical console). Re-planned and approved 2026-09-15.
  - [x] Rewrote `src/lib/whatsapp.ts` to call Meta's Graph API (`graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`, Bearer token, JSON template payload) — same `sendEnquiryAck()` signature, so `actions.ts` and the admin badge needed no changes
  - [x] Swapped `.env.local` placeholders: `TWILIO_*` → `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG`
  - [x] Re-verified: `npx tsc --noEmit` clean; re-ran the live-test script against production Supabase (test row "TEST — Claude live test (delete me) 2", phone +971500000002) — `{ok: true}`, graceful no-op logged, throwaway script deleted after
- [ ] Hand Jarryd the outside-this-session checklist: create a Meta Business app + add the WhatsApp product (free test number, up to 5 verified test recipients, no card), submit the Utility template for approval via WhatsApp Manager, get the access token + Phone Number ID + template name/language, paste into `.env.local` + Vercel, run the `enquiries` ALTER TABLE SQL in Supabase
- [ ] Once Jarryd has Meta test credentials + approved template: joint test — submit one real enquiry, confirm the WhatsApp message arrives on a verified test number and `whatsapp_ack_sent_at` is set

Two test rows now sit in production `enquiries` for Jarryd to delete: phone +971500000001 and +971500000002, both named "TEST — Claude live test (delete me)".
