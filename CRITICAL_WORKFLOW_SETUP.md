# Critical Alert Workflow - Setup & Verification Guide

## ✅ Prerequisite Checklist

Your system has **all features already built and integrated**. Before testing, verify:

### 1. **MongoDB Connection** ✓
```env
# .env
MONGO_URI=mongodb://localhost:27017/water_loss_detection
MONGO_DATABASE=water_loss_detection
```
- [ ] MongoDB running locally or on cloud
- [ ] Can connect: `mongo mongodb://localhost:27017/water_loss_detection`

### 2. **Email Configuration** ✓
```env
# Gmail app password (NOT your regular Gmail password)
EMAIL_USER=labajesiddhant07@gmail.com
EMAIL_PASS=zdrsxylzypbqyoeb
```
- [ ] Gmail SMTP credentials set in .env
- [ ] All whitespace removed from EMAIL_PASS

### 3. **ML Prediction Running** ✓
```env
# Backend detects critical alerts every 15 seconds
ML_RUN_INTERVAL_MS=15000
```
- [ ] Python ML worker configured
- [ ] ML predictions being saved to `mlpredictions` collection

### 4. **Admin Account Created** ✓
```
Navigate to: http://localhost:5000/setup.html
Use ADMIN_BOOTSTRAP_KEY from .env to create first admin
```
- [ ] Admin account active and email verified
- [ ] Owner name & email configured in NotificationSettings

---

## 🚀 Quick Start - Complete End-to-End Test

### **Step 1: Start Services**

```bash
# Terminal 1: Start MongoDB
mongod

# Terminal 2: Start Node.js backend
npm start
# Should see: [BROADCAST] Ticker started, polling ML predictions every 15 seconds

# Terminal 3: Start Python ML worker (if not embedded)
cd ai-smart-water-ml
python run_once_predict.py
```

### **Step 2: Setup Admin Account**

1. Go to http://localhost:5000/setup.html
2. Enter admin credentials (from .env)
3. Create account
4. Verify email confirmed (or check your inbox)

### **Step 3: Create Plumber Accounts**

**As Admin:**
1. Log in to http://localhost:5000/admin.html
2. Go to "Plumber Management"
3. Create 2 test plumber accounts:
   - Plumber One (email: plumber1@test.com)
   - Plumber Two (email: plumber2@test.com)
4. **Approve both** and set as "Available"

### **Step 4: Trigger Critical Leak Alert**

**Insert test prediction (critical leak):**

```bash
# MongoDB shell or Compass
use water_loss_detection

db.mlpredictions.insertOne({
  flowSensorData: 85.5,
  pressureSensorData: 45,
  tankLevelSensorData: 35,
  turbidityData: 25,
  waterLossRate: 15.2,
  mlPredictionData: 1,              # ← LEAK DETECTED
  mlProbability: 92.5,
  mlSeverity: "HIGH",
  overallSystemStatus: "CRITICAL",  # ← CRITICAL STATUS
  createdAt: new Date(),
  mlProcessedAt: new Date()
})
```

### **Step 5: Watch It Trigger (Within 15 Seconds)**

**Backend console should show:**
```
[BROADCAST] New prediction found: ...
[LEAK] Created repair incident WLD-20261025-001 from critical alert
[EMAIL] Critical alert sent to owner@example.com
[EMAIL] Leak notification preparation started for WLD-20261025-001
[EMAIL] Leak notification sent to plumber1@test.com
[EMAIL] Leak notification sent to plumber2@test.com
```

**Check your email inbox:**
- [ ] Email 1: "[CRITICAL] Smart Water Monitor alert" (Owner)
- [ ] Email 2: "[NEW LEAK REQUEST] Incident WLD-..." (Plumber 1)
- [ ] Email 3: "[NEW LEAK REQUEST] Incident WLD-..." (Plumber 2)

### **Step 6: Plumbers Submit Proposals**

**As Plumber 1:**
1. Log in to http://localhost:5000/plumber.html
2. See "🚨 Available repair requests" with the critical leak
3. Click "📝 Submit cost estimate"
4. Fill in proposal:
   - Labour charges: 2500
   - Material charges: 3000
   - Visit charges: 500
   - Duration: 4 hours
   - Repair method: "Excavate and replace 3m burst pipe"
5. Click "✔ Submit estimate"

**As Plumber 2:**
1. Do the same but with higher cost (3500 + 4500 = 8000 total)

### **Step 7: Admin Assigns Best Plumber**

**As Admin:**
1. Go to http://localhost:5000/admin.html
2. Find "🚨 CRITICAL ALERT" section
3. Click "🔧 View proposals & assign plumber"
4. See both proposals sorted by cost
5. Click "[Assign this plumber]" on Plumber 1 (cheapest)

**Check inbox immediately:**
- [ ] Email 4: "[ASSIGNED] Your proposal for incident WLD-... was selected" (Plumber 1)
- [ ] Email 5: "[UPDATE] Incident WLD-... has been assigned" (Plumber 2 - not selected)

### **Step 8: Plumber Accepts & Completes**

**As Plumber 1:**
1. Go to http://localhost:5000/plumber.html
2. See "🔧 My assignments" showing "WLD-20261025-001"
3. Status shows: [Assigned] → next step [Accepted]
4. Click "✔ Accept assignment" → Status changes to "Accepted"
5. Click "🔧 Start repair" → Status changes to "In progress"
6. Click "📋 Submit completion report"
7. Fill in:
   - Work performed: "Successfully repaired..."
   - Final charges: same as estimate
8. Click "✔ Submit completion report"

**Status should now be:** [Assigned] → [Accepted] → [In progress] → [Completed] ✅

---

## 🧪 Automated Test Suite

Run all workflow tests at once:

```bash
npm test -- backend/tests/end-to-end-critical-workflow.test.js
```

**Expected Output:**
```
✓ Complete Critical Alert Workflow (all 14 steps)
  ✓ 1. Setup: Create admin user for notifications
  ✓ 2. Setup: Create approved plumbers
  ✓ 3. Critical Alert Detected: Create ML prediction
  ✓ 4. Leak Event Created: Generate repair incident
  ✓ 5. Notifications Created: Admin and plumbers notified
  ✓ 6. Plumber Dashboard Updated: Critical leak visible
  ✓ 7. Plumber Proposes: Submit cost estimate
  ✓ 8. Plumber Proposes: Second estimate submitted
  ✓ 9. Admin Decision: Assign best (cheapest) plumber
  ✓ 10. Assignment Notification: Plumber notified
  ✓ 11. Plumber Accepts: Assignment accepted
  ✓ 12. Plumber Working: In progress
  ✓ 13. Plumber Completes: Completion report
  ✓ 14. Workflow Complete: Verify all states

✓ Duplicate Critical Alert Prevention
✓ Non-Leak Critical Alerts

Passed: 3 tests (all subtests)
```

---

## 🔍 Troubleshooting

### **Problem: No emails received**

**Check:**
1. EMAIL_USER and EMAIL_PASS in .env are correct
2. No whitespace in EMAIL_PASS
3. Gmail 2FA enabled? Use app password, not regular password
4. Check spam folder
5. Backend logs show `[EMAIL] Critical alert sent to...`?

**Debug:**
```javascript
// In backend console
import { sendCriticalAlert } from './services/email.service.js';
const pred = { mlPredictionData: 1, mlSeverity: 'HIGH', ... };
await sendCriticalAlert(pred);
// Should print: [EMAIL] Critical alert sent to owner@example.com
```

### **Problem: Plumbers don't see leak requests**

**Check:**
1. Plumber account status = "active" and emailVerified = true
2. PlumberProfile approvalStatus = "approved"
3. PlumberProfile availability = "available"
4. LeakEvent created with status = "OPEN_FOR_PROPOSALS"
5. Plumber portal refreshes automatically via SSE

### **Problem: Duplicate incidents created**

**This should NOT happen.** The system prevents duplicates:
```javascript
// isCriticalLeakAlert() tracks previousCriticalLeak state
// Duplicate sustained critical alerts are rejected
```

If duplicates appear, check broadcaster logs for the issue.

### **Problem: Email delivery fails**

**Gmail blocklist:**
```
❌ Wrong: Regular Gmail password
❌ Wrong: Email without @gmail.com
❌ Wrong: Spaces in EMAIL_PASS
✅ Correct: Gmail app password
✅ Correct: Two-factor auth enabled
```

**Get Gmail app password:**
1. Go to https://myaccount.google.com
2. Security → App passwords
3. Generate for "Mail" on "Windows Computer"
4. Copy the 16-char password → paste in .env (no spaces)

---

## 📊 Database Verification

**After test, verify records created:**

```javascript
// MongoDB shell
use water_loss_detection

// Count critical predictions
db.mlpredictions.countDocuments({ mlPredictionData: 1 })
// Should be >= 1

// Count leak incidents
db.leakevents.countDocuments()
// Should be >= 1

// Count proposals
db.repairproposals.countDocuments()
// Should be >= 2 (if both plumbers submitted)

// Count assignments
db.repairassignments.countDocuments()
// Should be >= 1 (if admin assigned)

// Count notifications sent
db.notifications.countDocuments({ status: "sent" })
// Should be >= 5 (owner alert + 2 plumber alerts + selected + not_selected)
```

---

## 🎯 Key Features Verified

- [x] **Critical alert detection** → LeakEvent created automatically
- [x] **Email sent to owner** → Immediately on critical alert
- [x] **Email sent to plumbers** → When incident created
- [x] **Plumber dashboard updated** → Critical leak visible
- [x] **Plumbers submit proposals** → Multiple plumbers can bid
- [x] **Admin reviews & assigns** → Best plumber selected
- [x] **Plumber notified** → "You were selected" email
- [x] **Plumber workflow** → Accept → Complete
- [x] **Duplicate prevention** → Only 1 incident per critical state
- [x] **Email retry** → Failed emails queued for retry

---

## 📝 Configuration Summary

**All emails configured and working:**

| Email | Trigger | Recipient | Status |
|-------|---------|-----------|--------|
| Critical Alert | Critical+Leak detected | Owner | ✅ Built |
| Leak Notification | LeakEvent created | All approved plumbers | ✅ Built |
| Leak Notification | LeakEvent created | All admins | ✅ Built |
| Proposal Selected | Admin assigns | Selected plumber | ✅ Built |
| Proposal Not Selected | Admin assigns | Other plumbers | ✅ Built |

**All tracked in `Notification` collection with:**
- Delivery status (sent/failed/pending)
- Retry count
- Timestamp
- Deduplication key

---

## 🚀 Production Deployment

When ready to deploy:

1. **MongoDB Atlas** → Update MONGO_URI with cloud URI
2. **Gmail** → Use production email credentials
3. **Render/AWS** → Update RENDER_EXTERNAL_URL in .env
4. **HTTPS** → All URLs must use https://
5. **SSL Certificate** → Generate for your domain
6. **Email verification** → Users must verify email before notifications

**Check before deploying:**
```bash
# All critical env vars set?
echo $MONGO_URI $EMAIL_USER $EMAIL_PASS $JWT_SECRET

# Test email delivery
npm test -- backend/tests/end-to-end-critical-workflow.test.js

# Check logs for errors
tail -f backend.log
```

---

## 🤝 Support

Your workflow is **production-ready**. For issues:

1. Check backend logs: `[LEAK]`, `[EMAIL]`, `[BROADCAST]` prefixes
2. Check MongoDB: use Compass to view collections
3. Check email: verify credentials and app password
4. Run test suite: `npm test`

All components are integrated and tested. Good to go! 🎉

