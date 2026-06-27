# FuelUp

FuelUp is a trading and ordering platform that connects buyers with downstream oil and gas service organizations and their filling station outlets.

## Current Scope

- Buyer marketplace homepage
- Public tenant self-service onboarding
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
- Operator login for operations dashboard
- Signed HTTP-only auth cookies
- CSRF protection for operator state changes
- Protected inventory price and stock updates
- Audit trail for order status and inventory changes
- Automated integration tests for marketplace, ordering, login, inventory, and protected updates
- GitHub Actions CI
- Structured request logs with request IDs
- Operations runbook
- Paystack payment initialization, callback verification, and webhook signature verification
- Notification outbox with optional webhook dispatch
- Outlet assignment for scoped operator access
- Role-aware navigation for authenticated operator/admin sessions
- Tenant-scoped operator write controls
- Settlement CSV export
- Admin account enable/disable controls
- Migration runner foundation
- Password reset tokens for operator/admin accounts
- Cancellation approval/rejection with stock restoration
- Low-stock thresholds and stock adjustment reasons
- Resend email provider support
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

## Checks

```powershell
pnpm run check
pnpm test
```

In this Codex shell, Node may not be on system `PATH`; the same checks were verified with the bundled Node runtime.

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
- `/inventory` - protected operator inventory controls
- `/login` - operator login
- `/self-onboarding` - public tenant, outlet, product, and operator signup
- `/track` - buyer order tracking and payment
- `/settlements.csv` - admin settlement export
- `/settlements` - admin settlement dashboard with date filters
- `/notifications` - admin notification outbox JSON
- `/health` - Render health check
- `/readiness` - database readiness check

## Operations

See [OPERATIONS.md](OPERATIONS.md) for daily checks, Render environment requirements, backup/restore notes, and incident response.

## Required Production Environment Variables

Set these in Render before exposing operations users:

- `ADMIN_EMAIL` - first admin/operator login email
- `ADMIN_PASSWORD` - first admin/operator password
- `AUTH_SECRET` - generated automatically by the Render Blueprint for new deployments
- `COOKIE_SECURE=true` - already configured in `render.yaml`
- `PAYSTACK_SECRET_KEY` - Paystack secret key
- `PAYSTACK_CALLBACK_URL` - usually `https://fuelup-poc.onrender.com/payments/paystack/callback`
- `NOTIFICATION_WEBHOOK_URL` - optional outbound notification webhook
- `NOTIFICATION_FROM_EMAIL` - sender identity for webhook payloads
- `RESEND_API_KEY` - optional direct email provider
- `AUTO_MIGRATE=true` - keep startup schema sync enabled on Render

If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are not set, the public marketplace still runs, but the operations dashboard cannot be accessed.

## Production Readiness Status

This version is hardened beyond a POC, but it is not yet fully production-ready.

Completed baseline:

- PostgreSQL persistence
- Security headers via Helmet
- Rate limiting
- Request body limits
- Input normalization and validation
- Password-hashed operator login
- Protected operations dashboard
- CSRF protection for status updates and logout
- Audited status and inventory changes
- Protected price and stock controls
- Public self-service tenant onboarding
- Integration test coverage for critical flows
- GitHub Actions CI for pushes and pull requests
- Structured logs with request IDs
- Paystack payment initialization, callback verification, and signed webhook handling
- Notification outbox and optional webhook dispatch
- Direct Resend email dispatch when configured
- Outlet-scoped operators
- Tenant-aware operator navigation and mutation controls
- Settlement CSV export
- Settlement dashboard with date filters
- Account enable/disable controls
- Password reset token flow
- Cancellation decision workflow with stock restoration
- Low-stock thresholds and adjustment reasons
- Database indexes for common operational paths
- Graceful shutdown
- Health and readiness checks
- Render deployment blueprint

Remaining production blockers:

- Full invitation UX and branded email templates
- Settlement reconciliation against provider fee/net settlement files
- SMS/WhatsApp notifications
- Backups, observability, and incident response procedures
- Wider test coverage around PostgreSQL migrations and failure states
