# RyanTravel

A mobile-optimized group travel expense tracker built for iPhone and iPad.

**Live app:** https://bruinesq.github.io/RyanTravel/

---

## Features

- Create trips with a date and member list
- Enter expenses with category, payor, and per-person participants
- Built-in calculator keypad (telephone-pad style) for amount entry
- Color-coded expense list sortable by date, recency, or payor
- Summary view with breakdowns by category, per person, and settlement calculations
- PDF export of full trip summary
- Delete trips and individual expenses

## Tech Stack

- **Frontend:** React 18 + Vite
- **Backend:** Supabase (PostgreSQL)
- **Deployment:** GitHub Pages via GitHub Actions

## Repository Structure
RyanTravel/

├── .github/

│   └── workflows/

│       └── deploy.yml       # GitHub Actions deploy pipeline

├── src/

│   ├── App.jsx              # All screens and components

│   ├── index.css            # Global styles

│   ├── main.jsx             # React entry point

│   └── supabase.js          # Supabase client

├── index.html               # HTML entry point

├── package.json

└── vite.config.js           # Vite config with /RyanTravel/ base path
## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via the workflow in `.github/workflows/deploy.yml`. No manual steps required.

## Database

Hosted on Supabase. Tables: `trips`, `trip_members`, `expenses`, `expense_participants`. Row-level security enabled with open anon policies for app access.
