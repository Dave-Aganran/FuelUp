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
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_CALLBACK_URL`
- `NOTIFICATION_WEBHOOK_URL` optional
- `NOTIFICATION_FROM_EMAIL`
- `TRUST_PROXY=true`

## Backup And Restore

- Enable Render PostgreSQL backups before production traffic.
- Before major schema changes, take a manual database backup.
- Test restore into a separate database before relying on a backup plan.
- Run `pnpm run db:migrate` for explicit migration application when moving away from startup schema sync.

## Incident Response

1. Check `/health`.
2. Check `/readiness`.
3. Inspect recent Render deploy status.
4. Inspect structured logs by `requestId`.
5. If database readiness fails, check Render PostgreSQL status and connection string.
6. If login fails, verify `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and that cookies are allowed over HTTPS.

## Payment Operations

Current payment support integrates Paystack and tracks:

- `unpaid`
- `invoice_sent`
- `paid`
- `refunded`

Configure this webhook URL in Paystack:

```text
https://fuelup-poc.onrender.com/webhooks/paystack
```

Use Render logs and audit events to reconcile payment initialization, callbacks, and `charge.success` webhook events.

## Notifications

FuelUp records notification events for buyer-facing order, payment, and cancellation messages. If `NOTIFICATION_WEBHOOK_URL` is set, FuelUp posts notification payloads to that endpoint. If not set, notifications remain queued and visible at `/notifications` for admins.

## Outlet Access

Admins assign users to outlets from `/admin/users`. Operators only see dashboard orders and inventory for assigned outlets.

## Settlements

Admins can export paid-order settlements from:

```text
https://fuelup-poc.onrender.com/settlements.csv
```
