# Scout Mode Roadmap

A prioritized feature roadmap to make Scout Mode best-in-class for community-driven memorial mapping.

---

## Phase 1: Foundation Fixes (Week 1-2)
*Priority: Critical - Must complete before scaling*

### 1.1 Data Quality & Validation
- [ ] **Coordinate validation** - Reject pins outside valid lat/lng ranges
- [ ] **Duplicate detection** - Prevent pins within 5m of existing memorials
- [ ] **Cemetery boundary check** - Warn if pin is outside known cemetery bounds
- [ ] **Photo validation** - Basic checks (min resolution, file type, size limits)

### 1.2 Verification Workflow
- [ ] **Admin verification queue** - Review submitted locations before awarding full points
- [ ] **Verification states** - Pending → Verified → Rejected with reasons
- [ ] **Partial points** - Award 50% on submission, 50% on verification
- [ ] **Rejection feedback** - Notify scout why submission was rejected

### 1.3 User Feedback Improvements
- [ ] **Badge progress indicators** - Show "3/10 pins to next badge"
- [ ] **Real-time point animation** - Floating +25 when points awarded
- [ ] **Submission confirmation modal** - Show exactly what was submitted
- [ ] **Better error messages** - Specific, actionable error text

---

## Phase 2: Enhanced Mapping (Week 3-4)
*Priority: High - Core functionality improvements*

### 2.1 Location Accuracy
- [ ] **Adjustable zoom levels** - Start zoomed out for rural, auto-zoom for urban
- [ ] **Accuracy indicator** - Show GPS accuracy circle on map
- [ ] **Manual accuracy input** - "How sure are you?" slider (1-10)
- [ ] **Section/Row/Plot fields** - Add cemetery-specific location data

### 2.2 Cemetery Intelligence
- [ ] **Cemetery database integration** - Pre-load boundaries from OpenStreetMap
- [ ] **Cemetery auto-detect** - Suggest cemetery name based on coordinates
- [ ] **Cemetery boundary drawing** - Scouts can outline new cemeteries
- [ ] **Cemetery statistics** - Show % mapped, total graves, active scouts

### 2.3 Photo Enhancements
- [ ] **Multi-photo support** - Upload up to 5 photos per pin
- [ ] **Photo cropping** - Built-in crop tool before upload
- [ ] **Headstone OCR** - Auto-extract name/dates using Google Vision (already integrated)
- [ ] **Photo quality score** - AI assessment before accepting

---

## Phase 3: Gamification 2.0 (Week 5-6)
*Priority: High - User engagement & retention*

### 3.1 Challenges & Streaks
- [ ] **Daily challenges** - "Map 3 graves today for 2x points"
- [ ] **Weekly challenges** - "Visit 2 new cemeteries this week"
- [ ] **Streak tracking** - Consecutive days active
- [ ] **Streak rewards** - Bonus points for 7-day, 30-day streaks

### 3.2 Leaderboards & Competition
- [ ] **Weekly leaderboard** - Reset every Monday
- [ ] **Regional leaderboards** - By state/country
- [ ] **Cemetery leaderboards** - Top scouts per cemetery
- [ ] **All-time hall of fame** - Permanent recognition for top contributors

### 3.3 Social Features
- [ ] **Scout profiles** - Public profile showing stats, badges, recent activity
- [ ] **Follow other scouts** - See their activity in feed
- [ ] **Scout teams** - Create groups, compete as teams
- [ ] **Referral rewards** - Bonus for inviting new scouts

### 3.4 New Badge Categories
- [ ] **Regional badges** - "Mapped 100 graves in Ohio"
- [ ] **Specialty badges** - "Military graves expert", "Historic (pre-1900) specialist"
- [ ] **Seasonal badges** - Memorial Day mapper, Veterans Day contributor
- [ ] **Achievement chains** - Complete all badges in a category for mega-badge

---

## Phase 4: Offline & Mobile (Week 7-8)
*Priority: Medium - Field usability*

### 4.1 Offline Support
- [ ] **Offline queue** - Save pins locally when no connection
- [ ] **Auto-sync** - Upload when connection restored
- [ ] **Offline maps** - Download cemetery map tiles for offline use
- [ ] **Draft management** - View/edit pending uploads

### 4.2 Mobile Optimizations
- [ ] **Camera integration** - Direct camera access, not file picker
- [ ] **GPS optimization** - Better accuracy settings for mobile
- [ ] **Battery-aware mode** - Reduce GPS polling when battery low
- [ ] **Haptic feedback** - Vibration on pin drop, badge earned

### 4.3 AR Features (Future)
- [ ] **AR pin placement** - Use camera to place pins in 3D space
- [ ] **AR navigation** - Guide to nearby wanted graves
- [ ] **AR headstone scanning** - Point camera at stone, auto-read

---

## Phase 5: Family Integration (Week 9-10)
*Priority: Medium - Connecting scouts with families*

### 5.1 Wanted Graves Enhancement
- [ ] **Family urgency levels** - High/Medium/Low with visual indicators
- [ ] **Reward system** - Families can offer bonus points
- [ ] **Direct messaging** - Scouts can message family with questions
- [ ] **Thank you notes** - Families can send appreciation to scouts

### 5.2 Notifications
- [ ] **Email notifications** - Family notified when grave found
- [ ] **Push notifications** - Mobile alerts for nearby wanted graves
- [ ] **Weekly digest** - Summary of scout activity for families
- [ ] **Real-time updates** - Live notification when location submitted

### 5.3 Collaboration
- [ ] **Scout suggestions** - Propose edits to existing memorials
- [ ] **Photo requests** - Families can request better/more photos
- [ ] **Information requests** - Ask scouts to verify specific details
- [ ] **Scout attribution** - Permanent credit on memorial page

---

## Phase 6: Analytics & Admin (Week 11-12)
*Priority: Medium - Operations & insights*

### 6.1 Scout Analytics
- [ ] **Personal dashboard** - Detailed stats, trends, goals
- [ ] **Activity heatmap** - GitHub-style contribution calendar
- [ ] **Efficiency metrics** - Pins per hour, accuracy rate
- [ ] **Achievement predictions** - "X more pins to reach Gold level"

### 6.2 Admin Tools
- [ ] **Bulk verification** - Approve multiple submissions at once
- [ ] **Fraud detection** - Flag suspicious patterns (same location spam)
- [ ] **Scout management** - Suspend, ban, or reward scouts
- [ ] **Quality reports** - Identify low-quality submissions by scout

### 6.3 Business Intelligence
- [ ] **Coverage maps** - Visualize mapped vs unmapped areas
- [ ] **Growth metrics** - New scouts, retention, churn
- [ ] **Regional insights** - Which areas need more scouts
- [ ] **ROI tracking** - Cost per memorial mapped

---

## Technical Debt & Infrastructure

### Performance
- [ ] **API rate limiting** - Prevent abuse
- [ ] **Image compression** - Reduce storage costs
- [ ] **CDN for photos** - Faster loading
- [ ] **Database indexes** - Optimize frequent queries

### Security
- [ ] **Input sanitization** - All user inputs validated
- [ ] **EXIF stripping** - Remove GPS from photos if private
- [ ] **Audit logging** - Track all admin actions
- [ ] **Rate limiting** - Prevent submission spam

### Testing
- [ ] **Unit tests** - Core gamification logic
- [ ] **Integration tests** - API endpoints
- [ ] **E2E tests** - Scout flow from start to finish
- [ ] **Load testing** - Handle 1000+ concurrent scouts

---

## Success Metrics

| Metric | Current | Phase 1 Target | Phase 6 Target |
|--------|---------|----------------|----------------|
| Monthly Active Scouts | ? | 100 | 1,000 |
| Pins per Scout/Month | ? | 10 | 25 |
| Verification Rate | 0% | 80% | 95% |
| Scout Retention (30-day) | ? | 40% | 60% |
| Avg Session Duration | ? | 10 min | 20 min |
| Wanted Graves Found/Month | ? | 50 | 500 |

---

## Competitive Analysis

| Feature | Headstone Legacy | FindAGrave | BillionGraves |
|---------|-----------------|------------|---------------|
| Gamification | Advanced | Basic | Moderate |
| Offline Mode | Planned | No | Yes |
| OCR Scanning | Integrated | No | Yes |
| Family Tree | Integrated | Limited | No |
| Wanted Graves | Yes | Transfer system | No |
| QR Codes | Yes | No | No |
| Memorial Books | Yes | No | No |

**Key Differentiator**: Headstone Legacy combines QR memorials + family trees + gamified scouting in one platform. Focus on this integration as the unique value proposition.

---

## Quick Wins (Can Do This Week)

1. **Badge progress UI** - Show how close to next badge
2. **Point animation** - Floating +25 when earned
3. **Better empty state** - More encouraging when no wanted graves
4. **Zoom level picker** - Let user choose starting zoom
5. **Photo preview improvements** - Larger preview, rotation support
