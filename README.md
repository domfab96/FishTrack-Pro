# 🐟 FishTrackPro
# del .git\index.lock
**Nigeria's Smart Fish Farming Platform** — a full-stack farm management SaaS for catfish farmers, built and operated by [Doha Prime Ventures](https://dohaprimeventure.com).

Live app: [fishtrackpro.netlify.app](https://fishtrackpro.netlify.app/fishtrackpro-p3.html)

---

## What FishTrackPro Does

FishTrackPro gives Nigerian fish farmers a private dashboard to run their farm digitally — replacing notebooks and memory with structured, trackable data. Every registered farmer manages their own ponds, feeding, weight sampling, expenses, harvests and sales. An AI assistant reads each farmer's data and provides personalised advice, smart alerts, and automated monthly performance reviews.

**Three things make it different from a spreadsheet:**

- **AI Assistant** — Claude-powered chat that understands each farmer's actual pond data, feed costs, and FCR, and answers questions or flags problems before they become losses.
- **Smart Alerts** — automatically detects high mortality, missed feeding logs, poor FCR, harvest readiness, and low feed stock, then delivers prioritised alerts to the farmer's inbox.
- **Monthly AI Review** — at the start of each month, generates a full performance report (revenue, FCR trend, mortality, feed efficiency) and delivers it as a dedicated inbox card.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Single-file HTML/CSS/JS (no build step) |
| Auth & Database | Firebase Authentication + Firestore |
| AI | Anthropic Claude (Haiku) via Netlify serverless function |
| Payments | Paystack (Nigeria-native, card/bank/USSD) |
| Hosting | Netlify (static hosting + serverless functions) |
| PWA | Service worker + manifest for installable offline-capable app |

The entire farmer-facing app lives in **one HTML file** (`fishtrackpro-p3.html`) — no bundler, no node_modules for the frontend. This keeps deployment trivial: drag the folder into Netlify and it's live.

---

## Project Structure

```
FishTrackPro/
├── fishtrackpro-p3.html        # Main app — farmer dashboard, admin panel, AI chat (all in one file)
├── index.html                  # Landing page
├── marketplace.html             # Public harvest listing / buyer marketplace (Jiji-style, no login to browse)
├── manifest.json                # PWA manifest (installable app metadata)
├── sw.js                        # Service worker (offline caching, install prompt)
├── netlify.toml                 # Netlify build config + PWA headers
└── netlify/
    └── functions/
        ├── ai-chat.js              # Serverless function — proxies chat requests to Anthropic API
        ├── sensor-ingest.js        # Serverless function — receives ESP32 IoT sensor readings
        ├── create-payment-link.js  # Serverless function — generates a Paystack payment link for marketplace commission
        └── monthly-review-cron-background.js  # SCHEDULED BACKGROUND function — generates every Pro/Enterprise farmer's Monthly AI Review automatically (06:00 UTC, 1st of each month)
```

---

## Core Features

### Farmer Dashboard
- **Pond management** — add/edit/archive ponds, stocking records, mortality log, species selector (catfish, tilapia, carp, salmon, trout)
- **Daily feeding log** — feed type, kg given, auto-calculated cost, live FCR tracking
- **Weight tracking** — sampling records with growth chart, projected harvest date
- **Expenses tracker** — categorised costs (feed, fingerlings, labour, medication, utilities, etc.)
- **Inventory** — feed stock levels with auto-deduction and low-stock alerts
- **Harvest module** — live weight, dry yield by cut (head/middle/tail), automatic FCR at harvest
- **Sales tracker** — per-sale records, customer history, wholesale vs retail

### AI Layer
- **AI Chat** — farmers ask questions in plain language, answered using their actual farm data
- **Admin AI Suggest** — reads farmer data and drafts a personalised message for admin review before sending
- **Two-way Farmer↔Admin chat** — real-time inbox with unread badges
- **Smart Alerts** — up to 3 prioritised alerts per day based on farm conditions
- **Monthly AI Review** — full performance report for every Pro/Enterprise farmer, generated automatically at 06:00 UTC on the 1st of each month by the `monthly-review-cron-background.js` scheduled background function — no longer dependent on the farmer opening the app. A client-side fallback still runs on login (days 1–5) in case the scheduled run ever fails, but checks Firestore first so it won't regenerate (and re-bill the Anthropic API for) a review that already exists.

### Marketplace (Phase 8) — `marketplace.html`
A public, Jiji-style produce aggregation board, separate from the main farmer dashboard so anyone can browse without an account:
- **Farmers** post available harvest for sale (species, quantity, price, date available) directly from their existing FishTrack Pro login — no separate signup.
- **Buyers** are new to the platform, so they go through a light KYC signup (name, phone, business name) before they can unlock a seller's contact details or post their own "want to buy" request. No document upload or manual approval at this stage — self-declared info is enough to start.
- Contact between buyer and seller happens off-platform via WhatsApp deep link — the marketplace only makes the introduction; the actual sale (payment, delivery) is arranged directly between the two parties, matching how fish trading already works in Nigeria.
- Once a farmer marks a listing "Sold" and enters the final price, FishTrack Pro calculates the platform's commission (`MARKETPLACE_COMMISSION_RATE`, default 3%, adjustable within the 2–5% range) and sends a one-off Paystack payment link to the farmer's Inbox — reusing the same live Paystack integration as subscriptions, no split-payment infrastructure required.
- New Firestore collections: `harvestListings` (public read, farmer-owned write), `buyRequests` (public read, buyer-owned write), `buyers` (owner/admin read-write only). See `firestore.rules` additions needed below.

### Financial Forecast (Phase 7) — Pro/Enterprise
A new "💹 Forecast" screen in the farmer dashboard, built entirely from data already in the app (no external integrations, unlike Phase 6):
- **Current Cycle Snapshot** — alive fish, current average weight, cost to date, and projected harvest date, per pond or combined across all ponds.
- **Break-Even & Scenario Calculator** — enter a retail price, bulk price, and retail/bulk split, and it live-recalculates projected dry yield (using the app's existing live÷4 conversion), projected total cost (actual cost to date, from the same expense filter as Reports > P&L, plus an estimated remaining feed cost based on the pond's current FCR and feed price), projected revenue, profit, and a break-even bar showing what % of yield needs to sell to cover costs.
- **12-Month Cash Flow** — last 6 months actual (revenue vs expenses, from real Sales/Expenses records) plus the next 6 months projected using a simple trailing-3-month average, visually distinguished (diagonal-striped bars) so actual and projected are never confused.

### Admin Panel
Accessible at `fishtrackpro.netlify.app/fishtrackpro-p3.html?admin=true` — view all registered farmers, aggregated industry data, manage subscriptions, and moderate AI-suggested outreach messages.

### Payments
Paystack integration for subscription billing (Basic / Pro / Enterprise tiers), now running on the live key. Marketplace commission invoices use the same Paystack account via a standalone one-off payment link (see `create-payment-link.js`).

---

## Environment Variables (Netlify)

Set these in the Netlify dashboard (**Site settings → Environment variables**) — never commit them to this repo:

```
ANTHROPIC_API_KEY=your_key_here          # ai-chat.js — Claude Haiku AI Assistant
PAYSTACK_SECRET_KEY=sk_live_or_test      # create-payment-link.js — marketplace commission invoices
FIREBASE_ADMIN_PASSWORD=your_password    # monthly-review-cron-background.js — signs in as ADMIN_EMAIL to read all farmers' data
```

`PAYSTACK_SECRET_KEY` is different from the `PAYSTACK_PUBLIC_KEY` hardcoded in `fishtrackpro-p3.html` — the public key is safe to expose client-side, the secret key must only ever live in Netlify's environment variables.

`FIREBASE_ADMIN_PASSWORD` is the actual login password for the `olufemidominic@gmail.com` Firebase Auth account (the same one used to open the in-app Admin Panel). The scheduled function signs in with it via the Firebase Auth REST API to get a short-lived ID token, then reads/writes Firestore over its REST API — no Firebase Admin SDK or service-account key needed. Treat this env var with the same care as a database password: it grants the same access the Admin Panel has.

---

## Deployment

This project deploys to Netlify with **zero build step**.

1. Push to GitHub
2. Connect the repo in Netlify (or drag-and-drop the folder for manual deploy)
3. Set all three environment variables listed above in Netlify site settings
4. Deploy

> ⚠️ **Important:** All files — including the `netlify/functions/` folder — must be deployed together. Uploading the HTML file alone without the functions folder will break AI Chat, since the serverless function won't exist to proxy requests.

After changing the environment variable, trigger a redeploy for the change to take effect.

---

## Roadmap

- [x] Phase 1 — Auth, pond management, feeding log, weight tracker
- [x] Phase 2 — Expenses, sales, harvest, inventory, analytics
- [x] Phase 3 — Subscription billing (Paystack, live key active)
- [x] Phase 4 — AI Chat, Smart Alerts, Monthly AI Review (now on a proper scheduled trigger, not just app-open), PWA conversion
- [x] IoT Sensor Dashboard, staff accounts, 4-language selector
- [x] Phase 8 — Harvest Listing / Produce Aggregation marketplace (`marketplace.html`) — public browsing, light-KYC buyers, Paystack commission invoicing
- [x] Phase 5, Stage 1 — Credit Scoring Engine: Water Source + Power Backup fields added to pond setup (unlocks the future irrScore calculation)
- [ ] Phase 5, Stage 2 — Farm Credit Profile screen (auto-calculated credit score, recommended loan ceiling)
- [ ] Phase 5, Stage 3 — Lender API endpoint (requires NITDA registration, Mono/Okra Open Banking)
- [x] Phase 7 — Financial Forecasting Dashboard (break-even calculator, scenario modelling, 12-month cash flow projection)
- [ ] Phase 6 — Bank Statement Reconciliation, Financial Discipline Score (blocked on NITDA registration + Mono/Okra Open Banking)
- [ ] Phase 9 — Cooperative Group Account (multi-farm admin view, Enterprise tier)

---

## About

Built by **Olufemi Dominic Fabian** — Founder, Doha Prime Ventures.

FishTrackPro grew out of Doha Prime Ventures' own catfish aquaculture operation in Abuja. The same tools used to run that farm are now being extended into a multi-tenant platform for other Nigerian fish farmers.

- Website: [dohaprimeventure.com](https://dohaprimeventure.com)
- Contact: olufemidominic@gmail.com

---

## License

Proprietary — © 2026 Doha Prime Ventures. All rights reserved.
