# Timesheet Management System — Step 2 + Step 3

This package contains the runnable Vue 3/Vite foundation for the Timesheet Management System:

- Vite + Vue 3 + Vue Router 4 + Pinia
- One Supabase browser client in `src/lib/supabase.js`
- Session restoration, email/password sign-in, profile loading and role state
- Central History-mode route guard
- Pinia timesheet store for week loading, draft creation, entry CRUD and submission
- Baseline CSS variables and styling carried forward from the supplied static prototype

The feature screens and shared production components are intentionally delivered in the later steps. To prevent a broken dev build in the meantime, protected routes show a small operational status screen after a successful login.

## Requirements

- Node.js 20 or later
- A Supabase project
- The Step 1 SQL migration executed in that project

## Run locally

```bash
npm install
copy .env.example .env
npm run dev
```

On macOS/Linux, use this instead of `copy`:

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Then open the URL printed by Vite, normally `http://localhost:5173`.

## Seed accounts

When using the Step 1 local-development seed SQL, every account uses this password:

```text
Password123!
```

Example employee account:

```text
chris.wong@company.test
```

Example admin account:

```text
admin@company.test
```

## Available foundation files

```text
src/
├── App.vue
├── assets/styles.css
├── lib/supabase.js
├── main.js
├── router/index.js
├── stores/
│   ├── auth.js
│   ├── pinia.js
│   └── timesheet.js
├── utils/date.js
└── views/
    ├── SignIn.vue
    └── SystemReady.vue
```

## Important security rule

Only `VITE_SUPABASE_URL` and the browser-safe anon/publishable key belong in `.env` for this frontend. Never place a Supabase Service Role Key in a Vite `VITE_*` variable or browser bundle.
