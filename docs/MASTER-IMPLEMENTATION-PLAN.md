# Headstone Legacy - Master Implementation Plan

## Overview
Complete feature buildout to maximize revenue, engagement, and B2B partnerships.

---

## Phase 1: Foundation (COMPLETED)
- [x] Partner signup page (`/partners`)
- [x] Referral tracking system
- [x] Partner dashboard
- [x] Outreach templates & prospect guide

---

## Phase 2: Payment & Order System (PRIORITY)
**Goal:** Switch to Stripe, proper order tracking, referral attribution

### 2.1 Stripe Integration
- [ ] Create Stripe account & get API keys
- [ ] Install Stripe JS SDK
- [ ] Create `/api/payments/create-stripe-session.js`
- [ ] Embedded checkout on order-tag page
- [ ] Webhook endpoint `/api/webhooks/stripe.js`

### 2.2 Order Success Flow
- [ ] Create order-success page (`/order-success`)
- [ ] Display order confirmation details
- [ ] Trigger referral conversion on webhook
- [ ] Send confirmation email (optional)

### 2.3 Order Management
- [ ] Orders table in Supabase (exists, needs updates)
- [ ] Admin view of all orders
- [ ] Order status tracking (paid → shipped → delivered)

### 2.4 Partner Payouts (Stripe Connect)
- [ ] Partners connect Stripe account
- [ ] Auto-calculate monthly commissions
- [ ] Auto-payout via Stripe Connect
- [ ] Payout history in partner dashboard

---

## Phase 3: Wholesale Program (B2B)
**Goal:** Monument companies buy bulk tags at discount

### 3.1 Wholesale Portal
- [ ] Wholesale pricing page (`/wholesale`)
- [ ] Tiered pricing display (10+, 25+, 50+ tags)
- [ ] Wholesale application form
- [ ] Admin approval workflow

### 3.2 Wholesale Ordering
- [ ] Bulk order form (quantity selector)
- [ ] Volume discount calculation
- [ ] Stripe checkout for wholesale orders
- [ ] Order management for wholesale

### 3.3 Wholesale Dashboard
- [ ] Partner sees wholesale orders
- [ ] Reorder functionality
- [ ] Invoice history

---

## Phase 4: Engagement Features
**Goal:** Increase user retention and viral growth

### 4.1 Social Sharing
- [ ] Share buttons on memorial page (Facebook, Twitter, Email, Copy Link)
- [ ] Open Graph meta tags for rich previews
- [ ] "Share this memorial" modal
- [ ] Track shares (analytics)

### 4.2 Email Notifications
- [ ] Email when candle is lit
- [ ] Email when tribute is approved
- [ ] Email when voice recording added
- [ ] Anniversary reminder emails (birthday, death date)
- [ ] Weekly digest option

### 4.3 Visitor Engagement
- [ ] Visitor counter on memorial ("X people have visited")
- [ ] "Recently visited" section on homepage
- [ ] Candle animation improvements
- [ ] Photo slideshow/gallery view

### 4.4 Memorial Discovery
- [ ] Public memorial search (`/search`)
- [ ] Filter by location, date, name
- [ ] "Memorials near you" using geolocation
- [ ] Featured memorials rotation

---

## Phase 5: QR Tag Tiers
**Goal:** Increase average order value

### 5.1 Product Tiers
- [ ] Basic Tag - $29 (aluminum, adhesive)
- [ ] Premium Tag - $49 (stainless steel, screws included)
- [ ] Deluxe Tag - $79 (bronze, decorative border, premium packaging)

### 5.2 Order Page Updates
- [ ] Tier selection UI
- [ ] Product images for each tier
- [ ] Feature comparison table
- [ ] Dynamic pricing in checkout

### 5.3 Wholesale Tier Pricing
- [ ] Bulk pricing for each tier
- [ ] Mixed tier orders

---

## Phase 6: Co-Branded Partner Pages (B2B)
**Goal:** Partners get custom landing pages

### 6.1 Partner Profiles
- [ ] Partner logo upload
- [ ] Custom URL slug (`/partner/smith-funeral`)
- [ ] Brand colors option
- [ ] Contact info display

### 6.2 Co-Branded Experience
- [ ] Dynamic landing page template
- [ ] Partner branding on memorial creation
- [ ] "Powered by Headstone Legacy" footer
- [ ] Partner-specific analytics

### 6.3 Revenue Sharing
- [ ] 70/30 split tracking
- [ ] Partner revenue dashboard
- [ ] Automated monthly reports

---

## Phase 7: SEO & Growth
**Goal:** Organic traffic from Google

### 7.1 Technical SEO
- [ ] Server-side rendering for memorial pages (or pre-rendering)
- [ ] Sitemap.xml generation
- [ ] Robots.txt optimization
- [ ] Schema.org markup (Person, Cemetery)

### 7.2 Content SEO
- [ ] Memorial pages indexable by Google
- [ ] City/cemetery landing pages
- [ ] Blog section (grief resources, memorial ideas)
- [ ] "How to preserve memories" guides

### 7.3 User Referral Program
- [ ] Families can refer other families
- [ ] $10 credit per referral
- [ ] Referral tracking (separate from B2B)

---

## Phase 8: Admin & Analytics
**Goal:** Manage and measure everything

### 8.1 Admin Dashboard
- [ ] Order management
- [ ] Partner management (approve, suspend)
- [ ] Memorial moderation queue
- [ ] Tribute/recording approvals

### 8.2 Analytics
- [ ] Revenue dashboard (daily, weekly, monthly)
- [ ] Conversion funnel (visit → signup → memorial → order)
- [ ] Partner performance leaderboard
- [ ] Traffic sources

### 8.3 Reporting
- [ ] Monthly revenue reports
- [ ] Partner commission reports
- [ ] Export to CSV

---

## Implementation Order (Recommended)

### Sprint 1 (This Week)
1. Stripe integration (replace Square)
2. Order success page
3. Webhook for order completion
4. Fix referral conversion tracking

### Sprint 2
5. Social sharing buttons
6. Visitor counter
7. Email notifications setup

### Sprint 3
8. Wholesale portal
9. Bulk ordering
10. QR tag tiers

### Sprint 4
11. Memorial search/directory
12. SEO improvements
13. Co-branded partner pages

### Sprint 5
14. Admin dashboard
15. Analytics
16. User referral program

---

## Technical Requirements

### Environment Variables Needed
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...
```

### New Database Tables
- `orders` (update existing)
- `order_items` (for multi-item orders)
- `partner_payouts` (exists)
- `wholesale_accounts` (new)
- `wholesale_orders` (new)

### New API Endpoints
- `POST /api/payments/create-stripe-session`
- `POST /api/webhooks/stripe`
- `POST /api/wholesale/apply`
- `POST /api/wholesale/order`
- `GET /api/analytics/dashboard`

---

## Success Metrics

| Metric | Current | Goal (90 days) |
|--------|---------|----------------|
| Monthly orders | ? | 50+ |
| Active partners | 0 | 25+ |
| Wholesale accounts | 0 | 10+ |
| Monthly revenue | ? | $3,000+ |
| Memorial signups | ? | 100+/month |

---

Last Updated: 2025-01-25
