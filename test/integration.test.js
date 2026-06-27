const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, describe, it } = require("node:test");
const { createApp } = require("../src/server");

let server;
let baseUrl;

function formBody(values) {
  return new URLSearchParams(values);
}

function parseCookies(headers) {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function csrfFrom(html) {
  const match = html.match(/name="csrfToken" value="([^"]+)"/);
  return match ? match[1] : "";
}

before(async () => {
  const { app } = await createApp({
    nodeEnv: "test",
    isProduction: false,
    port: 0,
    databaseUrl: "",
    trustProxy: false,
    maxRequestBody: "20kb",
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000,
    authSecret: "test-auth-secret-with-enough-length",
    cookieSecure: false,
    adminEmail: "ops@example.com",
    adminPassword: "StrongPass123!",
    paystackSecretKey: "sk_test_mock",
    paystackCallbackUrl: "",
    appName: "FuelUp"
  });

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("FuelUp core flows", () => {
  it("serves public health, readiness, and marketplace pages", async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, mode: "memory", env: "test" });

    const readiness = await fetch(`${baseUrl}/readiness`);
    assert.equal(readiness.status, 200);
    assert.equal((await readiness.json()).database, "not-configured");

    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Verified downstream trading/);
    assert.match(homeHtml, /Join FuelUp/);
    assert.match(homeHtml, /Buyer signup/);
    assert.doesNotMatch(homeHtml, />Operations</);
    assert.doesNotMatch(homeHtml, />Users</);
  });

  it("creates buyer orders without operator login", async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        outletId: "1",
        productId: "1",
        buyerName: "CI Buyer Ltd",
        buyerPhone: "+2348000000000",
        buyerEmail: "buyer@example.com",
        quantity: "12",
        fulfillmentMethod: "pickup",
        deliveryAddress: "",
        notes: "Automated test order"
      })
    });

    assert.equal(response.status, 201);
    assert.match(await response.text(), /FUP-/);
  });

  it("protects operations pages until login", async () => {
    const response = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^\/login/);
  });

  it("logs in operator and performs CSRF-protected inventory and status updates", async () => {
    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        email: "ops@example.com",
        password: "StrongPass123!",
        next: "/dashboard"
      })
    });

    assert.equal(login.status, 302);
    const cookies = parseCookies(login.headers);
    assert.match(cookies, /fu_auth=/);
    assert.match(cookies, /fu_csrf=/);

    const inventory = await fetch(`${baseUrl}/inventory`, { headers: { cookie: cookies } });
    assert.equal(inventory.status, 200);
    const inventoryHtml = await inventory.text();
    assert.match(inventoryHtml, /Price and stock management/);
    const csrf = csrfFrom(inventoryHtml);
    assert.ok(csrf.length > 20);

    const inventoryPost = await fetch(`${baseUrl}/products/1/inventory`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: cookies,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: formBody({
        price: "745",
        availableQuantity: "17500",
        adjustmentMode: "set",
        adjustmentQuantity: "0",
        lowStockThreshold: "1000",
        adjustmentReason: "CI inventory verification",
        csrfToken: csrf
      })
    });
    assert.equal(inventoryPost.status, 302);

    const inventoryAdd = await fetch(`${baseUrl}/products/1/inventory`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: cookies,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: formBody({
        price: "745",
        availableQuantity: "17500",
        adjustmentMode: "add",
        adjustmentQuantity: "250",
        lowStockThreshold: "1000",
        adjustmentReason: "CI stock receipt",
        csrfToken: csrf
      })
    });
    assert.equal(inventoryAdd.status, 302);

    const inventoryRemove = await fetch(`${baseUrl}/products/1/inventory`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: cookies,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: formBody({
        price: "745",
        availableQuantity: "17500",
        adjustmentMode: "remove",
        adjustmentQuantity: "50",
        lowStockThreshold: "1000",
        adjustmentReason: "CI stock correction",
        csrfToken: csrf
      })
    });
    assert.equal(inventoryRemove.status, 302);

    const dashboard = await fetch(`${baseUrl}/dashboard`, { headers: { cookie: cookies } });
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /Recent audit trail/);
    const dashboardCsrf = csrfFrom(dashboardHtml);

    const statusPost = await fetch(`${baseUrl}/orders/1/status`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: cookies,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: formBody({ status: "accepted", csrfToken: dashboardCsrf })
    });
    assert.equal(statusPost.status, 302);

    const paymentPost = await fetch(`${baseUrl}/orders/1/payment`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: cookies,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: formBody({ paymentStatus: "invoice_sent", csrfToken: dashboardCsrf })
    });
    assert.equal(paymentPost.status, 302);
  });

  it("supports admin user management and onboarding", async () => {
    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ email: "ops@example.com", password: "StrongPass123!", next: "/admin/users" })
    });
    const cookies = parseCookies(login.headers);

    const users = await fetch(`${baseUrl}/admin/users`, { headers: { cookie: cookies } });
    assert.equal(users.status, 200);
    const usersHtml = await users.text();
    assert.match(usersHtml, /User management/);
    const csrf = csrfFrom(usersHtml);

    const createUser = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: cookies, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        name: "Station Operator",
        email: "station@example.com",
        role: "operator",
        password: "OperatorPass123!",
        csrfToken: csrf
      })
    });
    assert.equal(createUser.status, 302);

    const usersAfter = await fetch(`${baseUrl}/admin/users`, { headers: { cookie: cookies } });
    const usersAfterHtml = await usersAfter.text();
    const assignCsrf = csrfFrom(usersAfterHtml);
    const assign = await fetch(`${baseUrl}/admin/users/2/outlets`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: cookies, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ outletId: "1", csrfToken: assignCsrf })
    });
    assert.equal(assign.status, 302);

    const disable = await fetch(`${baseUrl}/admin/users/2/active`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: cookies, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ isActive: "false", csrfToken: assignCsrf })
    });
    assert.equal(disable.status, 302);

    const reset = await fetch(`${baseUrl}/admin/users/2/reset`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: cookies, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ csrfToken: assignCsrf })
    });
    assert.equal(reset.status, 302);

    const onboarding = await fetch(`${baseUrl}/onboarding`, { headers: { cookie: cookies } });
    assert.equal(onboarding.status, 200);
    const onboardingHtml = await onboarding.text();
    assert.match(onboardingHtml, /Organization and outlet onboarding/);
    const onboardingCsrf = csrfFrom(onboardingHtml);

    const createOrg = await fetch(`${baseUrl}/organizations`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: cookies, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ name: "CI Energy", contactEmail: "ops@cienergy.example", csrfToken: onboardingCsrf })
    });
    assert.equal(createOrg.status, 302);
  });

  it("lets buyers track orders and request cancellation", async () => {
    const order = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        outletId: "1",
        productId: "1",
        buyerName: "Tracking Buyer Ltd",
        buyerPhone: "+2348000000000",
        buyerEmail: "track@example.com",
        quantity: "5",
        fulfillmentMethod: "pickup",
        deliveryAddress: "",
        notes: "Tracking test order"
      })
    });
    const html = await order.text();
    const reference = html.match(/FUP-[0-9A-Z-]+/)[0];

    const track = await fetch(`${baseUrl}/track?orderReference=${reference}&buyerEmail=track@example.com`);
    assert.equal(track.status, 200);
    assert.match(await track.text(), /Tracking Buyer|PMS Petrol|Status:/);

    const cancel = await fetch(`${baseUrl}/orders/cancel-request`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        orderReference: reference,
        buyerEmail: "track@example.com",
        reason: "No longer required"
      })
    });
    assert.equal(cancel.status, 200);
    assert.match(await cancel.text(), /Cancellation request sent/);

    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ email: "ops@example.com", password: "StrongPass123!", next: "/dashboard" })
    });
    const cookies = parseCookies(login.headers);
    const dashboard = await fetch(`${baseUrl}/dashboard`, { headers: { cookie: cookies } });
    const csrf = csrfFrom(await dashboard.text());
    const decision = await fetch(`${baseUrl}/orders/2/cancellation`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie: cookies, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ decision: "approved", reason: "Buyer request accepted", csrfToken: csrf })
    });
    assert.equal(decision.status, 302);
  });

  it("initializes Paystack payments and marks callback payments paid", async () => {
    const order = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        outletId: "1",
        productId: "1",
        buyerName: "Payment Buyer Ltd",
        buyerPhone: "+2348000000000",
        buyerEmail: "pay@example.com",
        quantity: "4",
        fulfillmentMethod: "pickup",
        deliveryAddress: "",
        notes: "Payment test order"
      })
    });
    const html = await order.text();
    const reference = html.match(/FUP-[0-9A-Z-]+/)[0];

    const init = await fetch(`${baseUrl}/payments/paystack/initialize`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ orderReference: reference, buyerEmail: "pay@example.com" })
    });
    assert.equal(init.status, 302);
    const paystackReference = new URL(init.headers.get("location"), baseUrl).searchParams.get("reference");
    assert.ok(paystackReference.startsWith(reference));

    const callback = await fetch(`${baseUrl}/payments/paystack/callback?reference=${encodeURIComponent(paystackReference)}`, {
      redirect: "manual"
    });
    assert.equal(callback.status, 302);

    const track = await fetch(`${baseUrl}/track?orderReference=${reference}&buyerEmail=pay@example.com`);
    assert.match(await track.text(), /Payment confirmed/);
  });

  it("accepts signed Paystack charge.success webhooks", async () => {
    const order = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        outletId: "1",
        productId: "1",
        buyerName: "Webhook Buyer Ltd",
        buyerPhone: "+2348000000000",
        buyerEmail: "webhook@example.com",
        quantity: "3",
        fulfillmentMethod: "pickup",
        deliveryAddress: "",
        notes: "Webhook test order"
      })
    });
    const reference = (await order.text()).match(/FUP-[0-9A-Z-]+/)[0];
    const init = await fetch(`${baseUrl}/payments/paystack/initialize`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ orderReference: reference, buyerEmail: "webhook@example.com" })
    });
    const paymentReference = new URL(init.headers.get("location"), baseUrl).searchParams.get("reference");
    const payload = JSON.stringify({
      event: "charge.success",
      data: { reference: paymentReference, amount: 999999999, status: "success" }
    });
    const signature = crypto.createHmac("sha512", "sk_test_mock").update(payload).digest("hex");
    const webhook = await fetch(`${baseUrl}/webhooks/paystack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": signature
      },
      body: payload
    });
    assert.equal(webhook.status, 200);
  });

  it("exposes protected notification outbox and settlement export", async () => {
    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ email: "ops@example.com", password: "StrongPass123!", next: "/admin/users" })
    });
    const cookies = parseCookies(login.headers);

    const notifications = await fetch(`${baseUrl}/notifications`, { headers: { cookie: cookies } });
    assert.equal(notifications.status, 200);
    const notificationRows = await notifications.json();
    assert.ok(Array.isArray(notificationRows));
    assert.ok(notificationRows.length > 0);

    const settlements = await fetch(`${baseUrl}/settlements.csv`, { headers: { cookie: cookies } });
    assert.equal(settlements.status, 200);
    assert.match(await settlements.text(), /order_reference,buyer_email,organization/);

    const settlementPage = await fetch(`${baseUrl}/settlements`, { headers: { cookie: cookies } });
    assert.equal(settlementPage.status, 200);
    assert.match(await settlementPage.text(), /Settlement reconciliation/);

    const resetNotification = notificationRows.find((item) => item.subject === "FuelUp password reset");
    assert.ok(resetNotification);
    const token = resetNotification.body.match(/token=([^ ]+)/)[1];
    const reset = await fetch(`${baseUrl}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
      body: formBody({ token, password: "NewOperatorPass123!" })
    });
    assert.equal(reset.status, 302);
  });

  it("supports public tenant self-onboarding with scoped operator navigation", async () => {
    const form = await fetch(`${baseUrl}/self-onboarding`);
    assert.equal(form.status, 200);
    const formHtml = await form.text();
    assert.match(formHtml, /Create your tenant/);
    assert.match(formHtml, /Organization/);
    assert.match(formHtml, /Outlet/);

    const tenantValues = {
      organizationName: "Self Serve Energy",
      organizationEmail: "tenant@example.com",
      outletName: "Self Serve Ajah",
      city: "Lagos",
      address: "Lekki-Epe Expressway",
      phone: "+2348003334444",
      productName: "PMS Petrol",
      unit: "litre",
      price: "730",
      availableQuantity: "6000",
      operatorName: "Tenant Operator",
      operatorEmail: "tenant.operator@example.com"
    };

    const organization = await fetch(`${baseUrl}/self-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        step: "organization",
        direction: "next",
        organizationName: tenantValues.organizationName,
        organizationEmail: tenantValues.organizationEmail
      })
    });
    assert.equal(organization.status, 200);
    assert.match(await organization.text(), /Where will orders be fulfilled/);

    const outlet = await fetch(`${baseUrl}/self-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        ...tenantValues,
        step: "outlet",
        direction: "next"
      })
    });
    assert.equal(outlet.status, 200);
    assert.match(await outlet.text(), /What should buyers be able to order first/);

    const product = await fetch(`${baseUrl}/self-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        ...tenantValues,
        step: "product",
        direction: "next"
      })
    });
    assert.equal(product.status, 200);
    assert.match(await product.text(), /Who will manage this tenant/);

    const operator = await fetch(`${baseUrl}/self-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        ...tenantValues,
        step: "operator",
        direction: "next"
      })
    });
    assert.equal(operator.status, 200);
    const reviewHtml = await operator.text();
    assert.match(reviewHtml, /Review and create your tenant/);
    assert.match(reviewHtml, /Self Serve Energy/);
    assert.match(reviewHtml, /Completed/);
    assert.match(reviewHtml, /Active now/);

    const onboard = await fetch(`${baseUrl}/self-onboarding`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        ...tenantValues,
        step: "review",
        direction: "create",
        password: "TenantPass123!",
        confirmPassword: "TenantPass123!",
        acceptedTerms: "true"
      })
    });

    assert.equal(onboard.status, 302);
    assert.equal(onboard.headers.get("location"), "/login?error=Check%20your%20email%20for%20the%20activation%20link.");

    const inactiveLogin = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ email: tenantValues.operatorEmail, password: "TenantPass123!", next: "/dashboard" })
    });
    assert.equal(inactiveLogin.status, 302);
    assert.match(inactiveLogin.headers.get("location"), /Invalid%20email%20or%20password/);

    const adminLogin = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ email: "ops@example.com", password: "StrongPass123!", next: "/notifications" })
    });
    const adminCookies = parseCookies(adminLogin.headers);
    const notifications = await fetch(`${baseUrl}/notifications`, { headers: { cookie: adminCookies } });
    const notificationRows = await notifications.json();
    const activationNotification = notificationRows.find((item) => item.subject === "Activate your FuelUp tenant account");
    assert.ok(activationNotification);
    const activationToken = activationNotification.body.match(/token=([^ ]+)/)[1];

    const activation = await fetch(`${baseUrl}/activate-account?token=${encodeURIComponent(activationToken)}`, {
      redirect: "manual"
    });
    assert.equal(activation.status, 302);
    assert.equal(activation.headers.get("location"), "/dashboard?message=Account%20activated");
    const cookies = parseCookies(activation.headers);

    const dashboard = await fetch(`${baseUrl}/dashboard`, { headers: { cookie: cookies } });
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /tenant.operator@example.com/);
    assert.match(dashboardHtml, />Inventory</);
    assert.doesNotMatch(dashboardHtml, />Users</);
    assert.doesNotMatch(dashboardHtml, />Settlements</);

    const adminUsers = await fetch(`${baseUrl}/admin/users`, {
      headers: { cookie: cookies },
      redirect: "manual"
    });
    assert.equal(adminUsers.status, 403);
  });

  it("supports buyer signup with activation baseline", async () => {
    const signup = await fetch(`${baseUrl}/buyers/signup`);
    assert.equal(signup.status, 200);
    assert.match(await signup.text(), /Create a buyer profile/);

    const createBuyer = await fetch(`${baseUrl}/buyers/signup`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        name: "Reward Buyer",
        email: "reward@example.com",
        phone: "+2348011112222",
        companyName: "Reward Logistics"
      })
    });
    assert.equal(createBuyer.status, 302);
    assert.equal(createBuyer.headers.get("location"), "/buyers/signup?message=Check%20your%20email%20for%20the%20activation%20link.");

    const adminLogin = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ email: "ops@example.com", password: "StrongPass123!", next: "/notifications" })
    });
    const adminCookies = parseCookies(adminLogin.headers);
    const notifications = await fetch(`${baseUrl}/notifications`, { headers: { cookie: adminCookies } });
    const notificationRows = await notifications.json();
    const buyerActivation = notificationRows.find((item) => item.subject === "Activate your FuelUp buyer account");
    assert.ok(buyerActivation);
    const buyerToken = buyerActivation.body.match(/token=([^ ]+)/)[1];

    const activateBuyer = await fetch(`${baseUrl}/buyers/activate?token=${encodeURIComponent(buyerToken)}`, {
      redirect: "manual"
    });
    assert.equal(activateBuyer.status, 302);
    assert.equal(activateBuyer.headers.get("location"), "/track?message=Buyer%20account%20activated.");
  });
});
