# Headstone Legacy - Project Status & Roadmap

> **IMPORTANT: Update this file at least once per hour during development sessions.**
> Last Updated: November 27, 2025 @ 11:00 AM

---

## Current State: PRODUCTION READY

The platform is fully built and functional. The focus now is **growth, marketing, and sales**.

---

## Revenue Products (All Working)

| Product | Price | Status | Notes |
|---------|-------|--------|-------|
| QR Tag - Basic | $29 | LIVE | Aluminum with adhesive |
| QR Tag - Premium | $39 | LIVE | Stainless steel, laser-engraved |
| QR Tag - Deluxe | $79 | LIVE | Bronze with decorative border |
| Memorial Book | $79 | LIVE | 8.5x11 hardcover via Lulu |
| Legacy Bundle | $109 | LIVE | Book + QR Tag + 10 Cards |
| Family Package | $249 | LIVE | 3 Books + 3 Tags + 30 Cards |
| Keepsake Cards | $19 | LIVE | 10-pack wallet cards |

### B2B Programs (Built, Need Marketing)

| Program | Pricing | Status |
|---------|---------|--------|
| Wholesale | $15-25/tag based on volume | Built, admin approval flow |
| Affiliate/Partner | $15 commission per tag | Built, tracking in place |

---

## Core Features (All Functional)

### Memorial System
- [x] Create/edit memorials with photos, bio, milestones
- [x] GPS location pinning (exact gravesite)
- [x] Family member connections
- [x] Tributes/guestbook with moderation
- [x] Virtual candle lighting
- [x] View counter
- [x] Public/draft status

### Scout Mode (Community Feature)
- [x] Single pin mode - locate one grave
- [x] Multi-pin batch mode - document multiple graves
- [x] Wanted Graves system - help families find ancestors
- [x] Points & badges gamification
- [x] Photo uploads for scouted graves

### AI Features
- [x] AI Storyteller - guided interview generates biography
- [x] Headstone transcription (Google Vision)
- [x] AI biography generation

### Collaboration
- [x] Invite collaborators by email
- [x] Multiple curators per memorial
- [x] Accept invitation flow

### Additional Features
- [x] Legacy Messages - scheduled messages for loved ones
- [x] GEDCOM import - import family trees
- [x] Family tree connections

---

## Admin Dashboard Features

- [x] Stats overview (memorials, views, candles)
- [x] Orders management with QR code generation
- [x] Mark orders as shipped with tracking
- [x] Wholesale application approval
- [x] Partner/affiliate tracking
- [x] Tributes moderation
- [x] Memorial management
- [x] Project notes

---

## Tech Stack

| Service | Purpose |
|---------|---------|
| Vercel | Hosting & API routes |
| Supabase | Database, Auth, Storage |
| Stripe | Payment processing |
| Lulu Direct | Book printing/fulfillment |
| Mapbox | Maps & GPS |
| Anthropic Claude | AI features |
| Google Cloud Vision | OCR/transcription |

---

## What's NOT Built Yet

- [ ] Email notifications (shipping, etc.) - needs Resend/SendGrid
- [ ] SMS notifications
- [ ] Mobile app
- [ ] Cemetery partnerships portal
- [ ] Subscription tiers (currently all one-time purchases)

---

## Growth Priorities

### Immediate (This Week)
1. Drive traffic to site
2. First QR tag sales
3. SEO optimization

### Short Term
1. Funeral home outreach
2. Cemetery partnerships
3. Genealogy community engagement

### Marketing Channels to Pursue
- SEO: "QR code gravestone", "digital memorial", "cemetery QR code"
- Funeral homes (direct B2B)
- Genealogy forums (Ancestry, FamilySearch communities)
- Veterans organizations
- Grief support communities

---

## Revenue Goal

**Target: $75,000 in 12 months**

At $39/tag average: ~1,923 tags needed (~5/day)
At $109 bundles: ~688 bundles needed (~2/day)

---

## Session Log

### November 27, 2025
- Completed full codebase audit
- Homepage polish and Scout section
- Created /about-scouting landing page
- Consolidated How It Works (redirect to /get-started)
- Updated ROADMAP.md to reflect actual state

### November 24, 2025
- Firebase to Supabase migration complete
- Firebase Hosting to Vercel migration complete

---

## File Structure Reference

```
/api
  /ai - storyteller.js, generate-biography.js, scan-headstone.js
  /books - generate-pdf.js, submit-to-lulu.js, preview-pdf.js
  /payments - create-stripe-session.js, create-book-order.js
  /webhooks - stripe.js, lulu.js
  /scouts - wanted-graves.js, submit-location.js
  /collaborators - invite.js, accept.js, manage.js, list.js
  /family - pin-relative.js, list.js, manage.js, reciprocal.js
  /partners - wholesale-apply.js
  /messages - legacy-messages.js
  /gedcom - parse.js, import.js

/src/pages - All page JavaScript modules
/public/pages - All HTML templates
/public/css - styles.css (main), memorial-form.css, legacy-messages.css
/supabase/migrations - Database schema
```

---

*Keep this document updated. It's the source of truth for project status.*
