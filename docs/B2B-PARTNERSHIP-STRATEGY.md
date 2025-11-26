# B2B Partnership Strategy - Headstone Legacy

## Overview
Stack three partnership models to maximize revenue from funeral homes, cemeteries, and headstone/monument businesses.

---

## Phase 1: Affiliate/Referral Program (START HERE)
**Target Launch: Week 1**
**Status: IN PROGRESS**

### How It Works
- Partners get unique referral link (e.g., `headstonelegacy.com/?ref=smithfuneral`)
- Earn $15 commission per QR tag sold
- We handle all fulfillment, support, billing
- Zero risk for partners

### Technical Requirements
- [x] Partner signup page (`/partners`)
- [x] Referral link tracking system (URL param `?ref=PARTNER_CODE`)
- [x] Store referral code in localStorage (30-day expiry)
- [x] Track clicks in Supabase (referrals table)
- [x] Partner dashboard to view earnings (`/partner-dashboard`)
- [x] Referral data passed to Square checkout
- [ ] **TODO: Square webhook to mark conversions as completed**
- [ ] Monthly payout system (PayPal/Venmo/check)

### Database Tables Created
- `partners` - Partner accounts with referral codes
- `referrals` - Click and conversion tracking
- `partner_payouts` - Payout history

### Files Created
- `/public/pages/partners.html` - Partner signup page
- `/src/pages/partners.js` - Partner signup logic
- `/public/pages/partner-dashboard.html` - Dashboard UI
- `/src/pages/partner-dashboard.js` - Dashboard logic
- `/src/utils/referral-tracker.js` - Referral tracking utility
- `/supabase/migrations/004_partner_program.sql` - Database schema

### Target Partners
- Funeral homes (already in end-of-life conversations)
- Cemetery offices
- Grief counselors
- Estate attorneys
- Churches with memorial gardens

### Outreach Strategy
- Cold email template
- LinkedIn outreach
- Local funeral home visits
- Funeral director association conferences

---

## Phase 2: Wholesale Program
**Target Launch: Month 2**
**Status: NOT STARTED**

### Pricing Tiers
| Volume    | Partner Price | Suggested Retail | Partner Margin |
|-----------|---------------|------------------|----------------|
| 10+ tags  | $25/tag       | $49-59           | $24-34/tag     |
| 25+ tags  | $20/tag       | $49-59           | $29-39/tag     |
| 50+ tags  | $15/tag       | $49-59           | $34-44/tag     |

### How It Works
- Partners buy tags in bulk at wholesale price
- They resell to their customers at retail markup
- Tags can be pre-linked or blank (partner links to memorial)
- Partners handle their own customer relationships

### Technical Requirements
- [ ] Wholesale order form (bulk quantities)
- [ ] Partner account system with wholesale pricing
- [ ] Bulk tag generation (pre-assigned memorial IDs or blank)
- [ ] Invoice/receipt system
- [ ] Inventory tracking

### Target Partners
- Monument/headstone companies (primary - easy $49 upsell on $3,000 headstone)
- Cemetery management companies
- Funeral home chains
- Memorial product retailers

---

## Phase 3: Co-Branded Landing Pages
**Target Launch: Month 3**
**Status: NOT STARTED**

### How It Works
- Custom URL: `headstonelegacy.com/partner/smith-funeral-home`
- Partner's logo and branding on the page
- Families create memorials through partner-branded experience
- Revenue split: 70% us / 30% partner

### Technical Requirements
- [ ] Partner profile in Supabase (logo, name, colors, custom URL slug)
- [ ] Dynamic landing page that pulls partner branding
- [ ] Partner-specific analytics dashboard
- [ ] Automated revenue split tracking
- [ ] Monthly payout reports

### Value Proposition for Partners
- "Offer digital memorial services" without any tech investment
- Looks like their own product
- Additional revenue stream
- Differentiator from competitors

### Upgrade Path
- Offer to top-performing affiliates from Phase 1
- "You've earned $500 in commissions - upgrade to co-branded for 2x earnings"

---

## Revenue Projections (Conservative)

### Year 1 Goals
| Channel          | Partners | Tags/Month | Revenue/Month |
|------------------|----------|------------|---------------|
| Direct (website) | -        | 20         | $780          |
| Affiliates       | 25       | 50         | $1,950        |
| Wholesale        | 10       | 100        | $2,000        |
| Co-branded       | 5        | 30         | $1,170        |
| **TOTAL**        |          | **200**    | **$5,900**    |

### Key Metrics to Track
- Partner signup rate
- Partner activation rate (first referral)
- Tags sold per partner per month
- Partner retention rate
- Revenue per partner type

---

## Outreach Templates

### Cold Email - Funeral Homes (Affiliate)
```
Subject: Free way to help families preserve memories

Hi [Name],

I built Headstone Legacy to help families create digital memorials with QR codes for headstones. Visitors scan the code to see photos, stories, and family history.

I'm looking for funeral home partners to recommend this to families. You'd earn $15 for each QR tag ordered through your referral link.

No cost, no inventory, no risk. Just an additional service to offer grieving families.

Would you be open to a quick call this week?

[Your name]
```

### Cold Email - Monument Companies (Wholesale)
```
Subject: Add $30+ profit to every headstone sale

Hi [Name],

What if you could add a $49 upsell to every headstone you sell - with $30+ profit margin?

I make weatherproof QR code tags that attach to headstones. Families scan to see a digital memorial with photos and stories.

At wholesale ($15-20/tag), you'd make $29-34 profit on each $49 sale. Easy add-on to a $3,000 headstone purchase.

Interested in samples?

[Your name]
```

---

## Next Actions
1. [ ] Build partner signup page
2. [ ] Create referral tracking system
3. [ ] Design partner dashboard
4. [ ] Write outreach email templates
5. [ ] Build list of 50 local funeral homes
6. [ ] Build list of 25 monument companies
7. [ ] Start outreach campaign

---

## Notes
- Keep affiliate program simple - don't over-engineer
- Focus on headstone/monument companies for wholesale (best fit)
- Co-branded is a "premium upgrade" - don't lead with it
- Track everything from day 1

Last Updated: 2025-01-25
