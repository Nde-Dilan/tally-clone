<p align="center">
  <img src="apps/web/public/forms_wordmark.svg" alt="Tally Clone" width="220" />
</p>

<p align="center">
  <strong>Modern, serverless form builder and data collection platform.</strong><br />
  Build conversational multi-step forms, score answers, analyze drop-offs, and store responses in Firebase Firestore.
</p>

<p align="center">
  <a href="https://tally-clone-zeta.vercel.app"><img src="https://img.shields.io/badge/Live_Demo-Vercel-black?style=flat&logo=vercel" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/Next.js-16_(Turbopack)-black?style=flat&logo=nextdotjs" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat&logo=firebase&logoColor=black" alt="Firebase Firestore" />
  <img src="https://img.shields.io/badge/License-MIT-3DDC84?style=flat" alt="License: MIT" />
</p>

<p align="center">
  <a href="https://tally-clone-zeta.vercel.app">Live Demo</a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#attribution">Attribution</a>
</p>

---

## Overview

A full-stack data collection and form management platform built with **Next.js 16 (App Router)** and **Firebase Firestore NoSQL**. Features a visual Document Flow builder, multi-step public form renderer, real-time response analytics, and automated submission workflows designed for high-performance serverless deployment on **Vercel**.

---

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="docs/images/live-form-builder.png" alt="Visual Form Editor" />
      <p align="center"><strong>Visual Form Editor</strong><br />Document flow canvas with 13+ question types & live preview</p>
    </td>
    <td width="50%">
      <img src="docs/images/live-form-public.png" alt="Branded Public Form" />
      <p align="center"><strong>Public Form Experience</strong><br />Clean, mobile-optimized multi-step conversational UI</p>
    </td>
  </tr>
  <tr>
    <td>
      <img src="docs/images/live-submissions.png" alt="Submissions Management" />
      <p align="center"><strong>Submissions Sheet</strong><br />Real-time responses with filtering, sorting, and CSV export</p>
    </td>
    <td>
      <img src="docs/images/live-analytics.png" alt="Realtime Analytics" />
      <p align="center"><strong>Drop-off & Funnel Analytics</strong><br />Views, starts, completions, and question-level drop-offs</p>
    </td>
  </tr>
</table>

---

## Features

- **Document Flow Builder:** Visual block-based form builder with 13+ input types, conditional logic jumps, and answer scoring.
- **Modern Public Forms:** Keyboard-friendly, responsive multi-step renderer with automatic referral code generation and UTM capture.
- **Response Management:** Live sheet view of submissions with full-text search, column filters, and CSV downloads.
- **Funnel Analytics:** Real-time visibility into views, starts, completions, and step-by-step drop-off rates.
- **Unified Serverless Architecture:** Fully consolidated Next.js 16 App Router backend with Firestore NoSQL persistence (zero external API daemon dependencies).
- **Production-Ready on Vercel:** Optimized serverless route handlers and edge middleware for low latency and high availability.

---

## Quickstart

### Prerequisites
- Node.js >= 20.9
- pnpm >= 10

### 1. Clone & Install
```bash
git clone https://github.com/Nde-Dilan/tally-clone.git
cd tally-clone
pnpm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local` in `apps/web`:
```bash
cp apps/web/.env.example apps/web/.env.local
```
Configure your Firebase Firestore credentials (or use the built-in SQLite database for local development):
```env
# Optional: Firebase Firestore (leave unset for local SQLite)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### 3. Run Locally
```bash
pnpm --dir apps/web dev
```
Open [http://localhost:3000](http://localhost:3000) for the public form and [http://localhost:3000/admin](http://localhost:3000/admin) for the admin portal.

### 4. Build & Typecheck
```bash
pnpm --dir apps/web run typecheck
pnpm --dir apps/web run build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router & Turbopack) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS & PrimeIcons |
| **Database** | Firebase Firestore (Production) / SQLite via Drizzle (Local Dev) |
| **Deployment** | Vercel Serverless Functions |
| **E2E Testing** | Playwright |

---

## Attribution

This project is built upon the open-source form engine and design system created by [dForms](https://github.com/Dapta-Tech/dapta-forms) ([Dapta Tech](https://dforms.ai)), distributed under the **MIT License**. We gratefully acknowledge their foundational open-source contribution to the modern web form ecosystem.

---

## License

[MIT](LICENSE)
