# 🐟 FishTrackPro

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
├── index.html                  # Landing/redirect page
├── manifest.json                # PWA manifest (installable app metadata)
├── sw.js                        # Service worker (offline caching, install prompt)
├── netlify.toml                 # Netlify build config + PWA headers
└── netlify/
    └── functions/
        └── ai-chat.js           # Serverless function — proxies chat requests to Anthropic API
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
- **Monthly AI Review** — full performance report generated automatically each month

### Admin Panel
Accessible at `fishtrackpro.netlify.app/fishtrackpro-p3.html?admin=true` — view all registered farmers, aggregated industry data, manage subscriptions, and moderate AI-suggested outreach messages.

### Payments
Paystack integration for subscription billing (Basic / Pro / Enterprise tiers). Currently running on a test key pending business verification for the live key.

---

## Environment Variables (Netlify)

The `ai-chat.js` function requires one environment variable set in the Netlify dashboard (**Site settings → Environment variables**) — never committed to this repo:

```
ANTHROPIC_API_KEY=your_key_here
```

---

## Deployment

This project deploys to Netlify with **zero build step**.

1. Push to GitHub
2. Connect the repo in Netlify (or drag-and-drop the folder for manual deploy)
3. Set the `ANTHROPIC_API_KEY` environment variable in Netlify site settings
4. Deploy

> ⚠️ **Important:** All files — including the `netlify/functions/` folder — must be deployed together. Uploading the HTML file alone without the functions folder will break AI Chat, since the serverless function won't exist to proxy requests.

After changing the environment variable, trigger a redeploy for the change to take effect.

---

## Roadmap

- [x] Phase 1 — Auth, pond management, feeding log, weight tracker
- [x] Phase 2 — Expenses, sales, harvest, inventory, analytics
- [x] Phase 3 — Subscription billing (Paystack, test key)
- [x] Phase 4 — AI Chat, Smart Alerts, Monthly AI Review, PWA conversion
- [ ] Paystack live key (pending business verification)
- [ ] Phase 5 — Farmer community (posts, comments, direct messages)
- [ ] Phase 6 — Push notifications, admin dashboard refinement

---

## About

Built by **Olufemi Dominic Fabian** — Founder, Doha Prime Ventures.

FishTrackPro grew out of Doha Prime Ventures' own catfish aquaculture operation in Abuja. The same tools used to run that farm are now being extended into a multi-tenant platform for other Nigerian fish farmers.

- Website: [dohaprimeventure.com](https://dohaprimeventure.com)
- Contact: olufemidominic@gmail.com

---

## License

Proprietary — © 2026 Doha Prime Ventures. All rights reserved.
