# Functions - Notification Outbox Email Worker

## What it does

1. Trigger on new Firestore document: `notificationOutbox/{outboxId}`.
2. If status is `pending`, send an email through SMTP.
3. Update the outbox status:
   - `sent` when the email is delivered.
   - `failed` when delivery fails or SMTP is missing.
4. Run a daily scheduler (`dispatchDailyPortfolioReport`) at `07:30` Europe/Paris:
   - computes portfolio KPIs (retards, blocages, validations),
   - stores a snapshot in `projectReportSnapshots`,
   - creates in-app notifications + email outbox for roles: `admin`, `pmo`, `project_manager`, `decision_maker`.

## Runtime requirement

- Node.js 20 (configured in `functions/package.json`).

## Required secrets (Firebase)

Set once per Firebase project:

```bash
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_PORT
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set SMTP_FROM
```

## Optional environment variables

Create `functions/.env` for local emulator:

```dotenv
APP_BASE_URL=https://your-frontend-domain
SMTP_SECURE=false
SMTP_REPLY_TO=no-reply@example.com
```

## Local usage

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions
```

## Deploy

```bash
cd ..
firebase deploy --only functions
```
