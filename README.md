# Pyrox Biz

Pyrox Biz is a React and Vite business workspace for reviewing business activity and managing sales, purchases, products, customers, suppliers, invoices, expenses, settings, and membership administration.

## Requirements

- Node.js 20.19+ or 22.12+
- A Firebase project configured for the application

## Getting started

```sh
npm ci
npm run dev
```

Create a local `.env.local` file in the project root and set the Firebase web app values:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Restart the Vite server after changing environment variables. Do not commit `.env.local`; it is excluded by `.gitignore`.

## Checks

```sh
npm run lint
npm run build
npm run preview
```

## Data and access

The app reads and writes business data in Firebase Firestore and uses Firebase Authentication for sign-in. Configure Firestore Security Rules to enforce owner-scoped access and administrator permissions; client-side checks are not a security boundary. The app does not include sample transactions or Firebase credentials.
