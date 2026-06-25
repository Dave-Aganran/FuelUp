# FuelUp Operations Runbook

## Daily Checks

- Confirm Render service `fuelup-poc` is green.
- Open `/health` and verify `ok: true`.
- Open `/readiness` and verify `database: connected`.
- Review Render logs for `level=error` JSON entries.
- Confirm GitHub Actions CI is passing on `main`.

## Required Render Environment

- `DATABASE_URL` from the Render PostgreSQL database
- `AUTH_SECRET`
- `COOKIE_SECURE=true`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `TRUST_PROXY=true`

## Backup And Restore

- Enable Render PostgreSQL backups before production traffic.
- Before major schema changes, take a manual database backup.
- Test restore into a separate database before relying on a backup plan.

## Incident Response

1. Check `/health`.
2. Check `/readiness`.
3. Inspect recent Render deploy status.
4. Inspect structured logs by `requestId`.
5. If database readiness fails, check Render PostgreSQL status and connection string.
6. If login fails, verify `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and that cookies are allowed over HTTPS.

## Payment Operations

Current payment support tracks order payment state only:

- `unpaid`
- `invoice_sent`
- `paid`
- `refunded`

Before taking real payments, integrate a payment provider, add webhook verification, reconcile settlement IDs, and prevent manual payment changes without audit review.
