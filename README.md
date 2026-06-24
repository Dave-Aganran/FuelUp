# FuelUp

FuelUp is a trading and ordering platform that connects buyers with downstream oil and gas service organizations and their filling station outlets.

## Current Scope

- Buyer marketplace homepage
- Outlet and product availability listing
- Buyer order placement
- Outlet/admin order board
- Order status updates
- PostgreSQL support for Render
- In-memory fallback for quick local demos without a database
- HTTP security headers
- Request body limits and rate limiting
- Health and readiness endpoints
- Order references, order values, and dashboard metrics
- Production-oriented Render configuration

## Local Run

```powershell
pnpm install
pnpm run dev
```

Open:

```text
http://localhost:3000
```

Without `DATABASE_URL`, the app uses seeded in-memory demo data.

To run with PostgreSQL, set `DATABASE_URL` before starting the app. The database schema and seed data are created automatically on startup.

## Render Deployment

Recommended POC deployment path:

1. Push this repo to GitHub.
2. In Render, choose **New +** then **Blueprint**.
3. Select the GitHub repo.
4. Render will read `render.yaml` and create:
   - `fuelup-poc` web service
   - `fuelup-poc-db` PostgreSQL database
5. After deploy, open the Render service URL.

The app creates or updates its database tables and seed data automatically on startup.

## Useful Routes

- `/` - buyer marketplace
- `/orders/new?outletId=1&productId=1` - order form
- `/dashboard` - outlet/admin order board
- `/health` - Render health check
- `/readiness` - database readiness check

## Production Readiness Status

This version is hardened beyond a POC, but it is not yet fully production-ready.

Completed baseline:

- PostgreSQL persistence
- Security headers via Helmet
- Rate limiting
- Request body limits
- Input normalization and validation
- Database indexes for common operational paths
- Graceful shutdown
- Health and readiness checks
- Render deployment blueprint

Remaining production blockers:

- Real authentication and role-based access control
- Organization and outlet onboarding/verification workflow
- Admin-only dashboard protection
- Payment collection and settlement reconciliation
- Audit logs for order and inventory changes
- Stock adjustment controls for station staff
- Notification channels for buyers and outlets
- Backups, observability, and incident response procedures
- Automated tests in CI
