# FuelUp POC

FuelUp is a proof-of-concept trading and ordering platform that connects buyers with downstream oil and gas service organizations and their filling station outlets.

## Current POC Scope

- Buyer marketplace homepage
- Outlet and product availability listing
- Buyer order placement
- Outlet/admin order board
- Order status updates
- PostgreSQL support for Render
- In-memory fallback for quick local demos without a database

## Local Run

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Without `DATABASE_URL`, the app uses seeded in-memory demo data.

## Render Deployment

Recommended POC deployment path:

1. Push this repo to GitHub.
2. In Render, choose **New +** then **Blueprint**.
3. Select the GitHub repo.
4. Render will read `render.yaml` and create:
   - `fuelup-poc` web service
   - `fuelup-poc-db` PostgreSQL database
5. After deploy, open the Render service URL.

The app creates its database tables and seed data automatically on startup.

## Useful Routes

- `/` - buyer marketplace
- `/orders/new?outletId=1&productId=1` - order form
- `/dashboard` - outlet/admin order board
- `/health` - Render health check

## Production Notes

This is intentionally a POC. Before production, add real authentication, role permissions, payment reconciliation, outlet verification, audit logs, fraud controls, rate limiting, and operational monitoring.
