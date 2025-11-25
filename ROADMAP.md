# Headstone Legacy - Product Roadmap & Business Plan

> Last Updated: November 24, 2025
> Status: Active Development

---

## 🎯 Mission

Create the most meaningful digital memorial platform that helps families preserve and share the legacies of their loved ones.

---

## 💰 Business Model

### Current Revenue
- **QR Code Plaques**: $39 each (cost ~$9, margin ~$30)

### Target Revenue Streams (Path to $1M)

| Revenue Stream | Target | Annual Revenue |
|----------------|--------|----------------|
| QR Plaque Sales | 5,000 units | $195,000 |
| Premium Subscriptions | 3,000 @ $99/yr | $297,000 |
| Funeral Home Partnerships | 30 @ $1,000/mo | $360,000 |
| Additional Products | 2,000 units | $150,000 |
| Services (AI bio, restoration) | 1,500 orders | $60,000 |
| **Total Target** | | **$1,062,000** |

### Pricing Tiers (To Implement)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Basic memorial, 5 photos, text bio |
| **Premium** | $99/year | Unlimited photos, video, voice recordings, family tree, AI bio, custom themes |
| **Legacy** | $299/year | All Premium + QR plaque included, memorial book PDF, priority support |

---

## 🚀 Feature Roadmap

### Phase 1: Engagement Features (Q1)
> Goal: Make memorials interactive and encourage repeat visits

- [ ] **Virtual Candle Lighting**
  - Visitors can light a candle
  - Shows count of candles lit
  - Optional: candles expire after 24hrs, can be re-lit
  - Notification to family when someone lights a candle

- [ ] **Enhanced Guestbook/Tributes**
  - Allow photo uploads with messages
  - Moderation queue for family
  - Email notifications for new tributes

- [ ] **Anniversary & Birthday Reminders**
  - Email reminders to registered family members
  - "On this day" memories
  - Option to share on social media

### Phase 2: Rich Media (Q2)
> Goal: Make memorials more personal and immersive

- [ ] **Voice Recordings**
  - Upload audio clips (stories, messages, voicemails)
  - Record directly in browser
  - Preserve the sound of loved one's voice

- [ ] **Video Tributes**
  - Upload video clips
  - YouTube/Vimeo embed support
  - Auto-generated slideshow from photos

- [ ] **Life Timeline**
  - Visual timeline of life events
  - Photos attached to dates
  - Milestones with descriptions

### Phase 3: AI Features (Q3)
> Goal: Help families create richer content with less effort

- [ ] **AI Biography Generator**
  - Answer prompts about the person
  - AI writes a polished biography
  - Multiple style options (formal, warm, storytelling)

- [ ] **Photo Restoration**
  - Upload old/damaged photos
  - AI enhancement and restoration
  - Colorization of black & white photos

- [ ] **Headstone Transcription** (Already have Google Vision)
  - Auto-extract dates and text
  - Pre-fill memorial form

### Phase 4: Monetization & Growth (Q4)
> Goal: Implement premium tiers and partnerships

- [ ] **Subscription Billing**
  - Stripe integration
  - Free/Premium/Legacy tiers
  - Feature gating based on plan

- [ ] **Funeral Home Dashboard**
  - White-label options
  - Bulk memorial creation
  - Analytics and reporting

- [ ] **Printable Memorial Book**
  - PDF generation
  - Professional layouts
  - Order printed copies

- [ ] **Flower/Gift Delivery**
  - Partner with florists (1-800-Flowers, local)
  - Commission on orders
  - Delivery to cemetery

### Phase 5: Community & Viral (Future)
> Goal: Network effects and organic growth

- [ ] **Memorial Collaboration**
  - Invite family members to contribute
  - Shared editing permissions
  - Activity feed

- [ ] **Public Memorial Directory**
  - Searchable database (opt-in)
  - Connect with distant relatives
  - Historical/genealogy research

- [ ] **Integration with Ancestry/FamilySearch**
  - Import family tree data
  - Sync relationships
  - Expand reach

---

## 🛠 Technical Debt & Infrastructure

### Completed ✅
- [x] Migrate from Firebase to Supabase
- [x] Migrate from Firebase Hosting to Vercel
- [x] Create Vercel API routes
- [x] Update all client-side code for Supabase
- [x] Set up Supabase Auth with Google OAuth

### Pending
- [ ] Set up Supabase database tables and RLS policies
- [ ] Configure production environment variables in Vercel
- [ ] Set up Supabase Storage buckets with proper permissions
- [ ] Implement proper error handling and logging
- [ ] Add analytics (Plausible, PostHog, or similar)
- [ ] Set up transactional emails (Resend, SendGrid)
- [ ] Implement rate limiting on API routes
- [ ] Add proper SEO meta tags and Open Graph

---

## 📊 Supabase Database Schema

### Tables Needed

```sql
-- profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- memorials
CREATE TABLE memorials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lowercase TEXT,
  birth_date DATE,
  death_date DATE,
  bio TEXT,
  main_photo TEXT,
  photos JSONB DEFAULT '[]',
  cemetery_name TEXT,
  cemetery_address TEXT,
  cemetery_lat DECIMAL(10, 8),
  cemetery_lng DECIMAL(11, 8),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  is_location_exact BOOLEAN DEFAULT FALSE,
  relatives JSONB DEFAULT '[]',
  milestones JSONB DEFAULT '[]',
  military_service JSONB,
  status TEXT DEFAULT 'draft',
  tier TEXT DEFAULT 'memorial',
  curator_ids UUID[] DEFAULT '{}',
  curators JSONB DEFAULT '[]',
  candle_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- tributes (guestbook entries)
CREATE TABLE tributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  author_name TEXT,
  author_email TEXT,
  message TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- candles
CREATE TABLE candles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  lit_by_name TEXT,
  lit_by_user_id UUID REFERENCES auth.users(id),
  message TEXT,
  lit_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- suggested_locations
CREATE TABLE suggested_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  suggested_by UUID REFERENCES auth.users(id),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- voice_recordings (Phase 2)
CREATE TABLE voice_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  audio_url TEXT,
  duration_seconds INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- anniversary_reminders (Phase 1)
CREATE TABLE anniversary_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id TEXT REFERENCES memorials(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  email TEXT,
  reminder_type TEXT, -- 'birthday', 'death_anniversary', 'custom'
  custom_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 Legal & Business Protection

### Completed
- [ ] Trademark "Headstone Legacy" (USPTO)
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Cookie Policy

### Needed
- [ ] Business entity formation (LLC)
- [ ] Business bank account
- [ ] Business insurance

---

## 📈 Marketing Strategy

### Channels to Explore
1. **SEO** - Target "digital memorial", "QR code gravestone", "online obituary"
2. **Funeral Home Partnerships** - Direct sales to funeral directors
3. **Cemetery Partnerships** - Bulk deals with cemetery management
4. **Grief Support Communities** - Tasteful, helpful presence
5. **Genealogy Communities** - Ancestry.com forums, FamilySearch
6. **Veterans Organizations** - VFW, American Legion partnerships
7. **Religious Organizations** - Churches, synagogues, mosques
8. **Social Media** - Heartwarming memorial stories (with permission)

### Content Ideas
- "How to preserve family memories"
- "Creating a meaningful memorial"
- "Digital legacy planning"
- Guest posts on grief/bereavement blogs

---

## 📝 Session Notes

### November 24, 2025
- Completed Firebase → Supabase migration
- Completed Firebase Hosting → Vercel migration
- Created all Vercel API routes
- Updated all client-side files for Supabase
- Discussed business model and path to $1M
- Decided to focus on building features over patents
- Priority: Trademark brand, build competitive moats
- Next: Build engagement features (candles, reminders, enhanced tributes)

---

## 🤝 Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Nov 24, 2025 | Switch to Supabase + Vercel | Lower cost, better developer experience, no vendor lock-in |
| Nov 24, 2025 | Price QR tags at $39 | Good margin, competitive pricing |
| Nov 24, 2025 | Focus on features over patents | Execution > legal protection for this type of product |
| Nov 24, 2025 | Build engagement features first | Increase user retention and emotional connection |

---

## 📞 Contacts & Resources

### Services Used
- **Hosting**: Vercel
- **Database/Auth**: Supabase (https://wsgxvhcdpyrjxyuhlnnw.supabase.co)
- **Payments**: Square
- **Maps**: Mapbox
- **OCR**: Google Cloud Vision
- **Domain**: (add your domain)

### Useful Links
- Supabase Dashboard: https://app.supabase.com
- Vercel Dashboard: https://vercel.com/dashboard
- Square Dashboard: https://squareup.com/dashboard

---

*This document is the source of truth for the Headstone Legacy product roadmap. Update it as decisions are made and progress is achieved.*
