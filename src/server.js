const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const {
  attachUser,
  clearAuthCookies,
  getCsrfToken,
  hashPassword,
  parseCookies,
  requireAuth,
  requireCsrf,
  requireRole,
  setAuthCookies,
  verifyPassword
} = require("./auth");
const { createConfig } = require("./config");
const { initDatabase } = require("./db/init");
const { createMemoryStore } = require("./data/memoryStore");
const { createPostgresStore } = require("./data/postgresStore");
const { logEvent, requestLogger } = require("./logger");
const {
  dispatchNotification,
  orderCreatedNotification,
  orderStatusNotification,
  paymentNotification
} = require("./notifications");
const {
  initializePaystackPayment,
  paystackAmount,
  verifyPaystackReference,
  verifyPaystackWebhook
} = require("./payments/paystack");
const { initializeDemoPayment } = require("./payments/demo");
const {
  normalizeCancellationInput,
  normalizeCancellationDecisionInput,
  normalizeBuyerSignupInput,
  normalizeInventoryInput,
  normalizeOrderInput,
  normalizeOrganizationInput,
  normalizeOutletInput,
  normalizePaymentStatus,
  normalizePasswordResetInput,
  normalizeProductInput,
  normalizeSelfOnboardingInput,
  normalizeStatus,
  normalizeUserInput
} = require("./validation");
const {
  buyerSignupPage,
  dashboardPage,
  demoPaymentPage,
  inventoryPage,
  loginPage,
  marketplacePage,
  onboardingPage,
  orderFormPage,
  orderSuccessPage,
  resetPasswordPage,
  selfOnboardingPage,
  settlementsPage,
  trackOrderPage,
  usersPage
} = require("./views");

async function createStore(config) {
  if (!config.databaseUrl) {
    return createMemoryStore();
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.isProduction ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  if (config.autoMigrate) {
    await initDatabase(pool);
  }
  return { ...createPostgresStore(pool), pool };
}

const selfOnboardingSteps = ["organization", "outlet", "product", "operator", "review"];

function selfOnboardingStep(value) {
  return selfOnboardingSteps.includes(value) ? value : "organization";
}

function adjacentSelfOnboardingStep(step, direction) {
  const index = Math.max(0, selfOnboardingSteps.indexOf(selfOnboardingStep(step)));
  if (direction === "back") {
    return selfOnboardingSteps[Math.max(0, index - 1)];
  }
  return selfOnboardingSteps[Math.min(selfOnboardingSteps.length - 1, index + 1)];
}

function absoluteUrl(request, path) {
  return `${request.protocol}://${request.get("host")}${path}`;
}

function readPage(query, name = "page") {
  const page = Number(query[name]);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function createApp(config = createConfig()) {
  const app = express();
  const store = await createStore(config);
  const adminConfigured = Boolean(config.adminEmail && config.adminPassword);

  if (adminConfigured) {
    await store.upsertUser({
      email: config.adminEmail.toLowerCase(),
      name: "FuelUp Admin",
      passwordHash: await hashPassword(config.adminPassword),
      role: "admin"
    });
  } else if (config.isProduction) {
    console.warn("ADMIN_EMAIL and ADMIN_PASSWORD are not configured. Operations login is disabled.");
  }

  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https://image.pollinations.ai"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      }
    })
  );
  app.use(compression());
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.post("/webhooks/paystack", express.raw({ type: "application/json", limit: config.maxRequestBody }), async (request, response, next) => {
    try {
      const signature = request.headers["x-paystack-signature"];
      if (!verifyPaystackWebhook(request.body, signature, config.paystackSecretKey)) {
        response.status(401).send("Invalid signature.");
        return;
      }

      const event = JSON.parse(request.body.toString("utf8"));
      if (event.event === "charge.success" && event.data?.reference) {
        const order = await store.findOrderByPaymentReference(event.data.reference);
        if (order && Number(event.data.amount) >= paystackAmount(order.total_amount)) {
          await store.markPaymentPaid(event.data.reference, event);
        }
      }
      response.status(200).send("ok");
    } catch (error) {
      next(error);
    }
  });

  app.use(express.urlencoded({ extended: false, limit: config.maxRequestBody }));
  app.use(parseCookies);
  app.use(attachUser(config));
  app.use(express.static("public", {
    etag: true,
    maxAge: 0,
    setHeaders(response) {
      response.setHeader("Cache-Control", "no-cache");
    }
  }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, mode: store.mode, env: config.nodeEnv });
  });

  app.get("/readiness", async (_request, response) => {
    try {
      if (store.pool) {
        await store.pool.query("SELECT 1");
      }
      response.json({ ok: true, database: store.mode === "postgres" ? "connected" : "not-configured" });
    } catch (error) {
      response.status(503).json({ ok: false, database: "unavailable" });
    }
  });

  app.get("/", async (request, response, next) => {
    try {
      const products = await store.listMarketplace();
      response.send(marketplacePage(products, store.mode, request.user, {
        page: readPage(request.query)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/login", (request, response) => {
    response.send(loginPage({
      storeMode: store.mode,
      nextPath: request.query.next || "/dashboard",
      error: request.query.error || "",
      adminConfigured
    }));
  });

  app.get("/self-onboarding", (request, response) => {
    if (request.user) {
      response.redirect("/dashboard");
      return;
    }
    response.send(selfOnboardingPage({
      storeMode: store.mode,
      message: request.query.message || "",
      error: request.query.error || "",
      step: selfOnboardingStep(request.query.step)
    }));
  });

  app.post("/self-onboarding", async (request, response, next) => {
    try {
      const step = selfOnboardingStep(request.body.step);
      const direction = String(request.body.direction || "next");
      if (direction === "back") {
        response.send(selfOnboardingPage({
          storeMode: store.mode,
          values: request.body,
          step: adjacentSelfOnboardingStep(step, "back")
        }));
        return;
      }

      const { input, errors } = normalizeSelfOnboardingInput(request.body, step);
      if (errors.length > 0) {
        response.status(400).send(selfOnboardingPage({
          storeMode: store.mode,
          error: errors.join(" "),
          values: input,
          step
        }));
        return;
      }

      if (step !== "review" || direction !== "create") {
        response.send(selfOnboardingPage({
          storeMode: store.mode,
          values: input,
          step: adjacentSelfOnboardingStep(step, "next")
        }));
        return;
      }

      const tenant = await store.createTenantOnboarding(input, await hashPassword(input.password));
      const activationUrl = absoluteUrl(request, `/activate-account?token=${encodeURIComponent(tenant.user.activation_token)}`);
      await dispatchNotification(store, config, {
        recipientEmail: input.operatorEmail,
        subject: "Activate your FuelUp tenant account",
        body: `Your FuelUp account for ${input.organizationName} is almost ready. Activate it here: ${activationUrl}`
      });
      response.redirect("/login?error=Check%20your%20email%20for%20the%20activation%20link.");
    } catch (error) {
      response.status(error.statusCode || 400).send(selfOnboardingPage({
        storeMode: store.mode,
        error: error.message,
        values: request.body,
        step: selfOnboardingStep(request.body.step)
      }));
    }
  });

  app.get("/activate-account", async (request, response, next) => {
    try {
      const token = String(request.query.token || "").trim();
      const user = await store.activateUserByToken(token);
      setAuthCookies(response, user, config);
      response.redirect("/dashboard?message=Account%20activated");
    } catch (error) {
      response.redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/buyers/signup", (request, response) => {
    response.send(buyerSignupPage({
      storeMode: store.mode,
      message: request.query.message || "",
      error: request.query.error || ""
    }));
  });

  app.post("/buyers/signup", async (request, response) => {
    try {
      const { input, errors } = normalizeBuyerSignupInput(request.body);
      if (errors.length > 0) {
        response.status(400).send(buyerSignupPage({ storeMode: store.mode, error: errors.join(" "), values: input }));
        return;
      }
      const buyer = await store.createBuyerSignup(input);
      const activationUrl = absoluteUrl(request, `/buyers/activate?token=${encodeURIComponent(buyer.activation_token)}`);
      await dispatchNotification(store, config, {
        recipientEmail: input.email,
        subject: "Activate your FuelUp buyer account",
        body: `Activate your FuelUp buyer account here: ${activationUrl}`
      });
      response.redirect("/buyers/signup?message=Check%20your%20email%20for%20the%20activation%20link.");
    } catch (error) {
      response.status(400).send(buyerSignupPage({ storeMode: store.mode, error: error.message, values: request.body }));
    }
  });

  app.get("/buyers/activate", async (request, response) => {
    try {
      await store.activateBuyerByToken(String(request.query.token || "").trim());
      response.redirect("/track?message=Buyer%20account%20activated.");
    } catch (error) {
      response.redirect(`/buyers/signup?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.post("/login", async (request, response, next) => {
    try {
      if (!adminConfigured) {
        response.redirect("/login?error=Operations%20login%20is%20not%20configured");
        return;
      }

      const email = String(request.body.email || "").trim().toLowerCase();
      const password = String(request.body.password || "");
      const user = await store.findUserByEmail(email);
      const valid = user && await verifyPassword(password, user.password_hash);

      if (!valid) {
        response.redirect("/login?error=Invalid%20email%20or%20password");
        return;
      }

      setAuthCookies(response, user, config);
      const nextPath = String(request.body.next || "/dashboard");
      response.redirect(nextPath.startsWith("/") ? nextPath : "/dashboard");
    } catch (error) {
      next(error);
    }
  });

  app.post("/logout", requireAuth, requireCsrf(config), (request, response) => {
    clearAuthCookies(response, config);
    response.redirect("/");
  });

  app.get("/reset-password", (request, response) => {
    response.send(resetPasswordPage({
      storeMode: store.mode,
      token: request.query.token || "",
      message: request.query.message || "",
      error: request.query.error || ""
    }));
  });

  app.post("/reset-password", async (request, response, next) => {
    try {
      const { input, errors } = normalizePasswordResetInput(request.body);
      if (errors.length > 0) {
        response.status(400).send(resetPasswordPage({ storeMode: store.mode, token: input.token, error: errors.join(" ") }));
        return;
      }
      await store.resetPasswordByToken(input.token, await hashPassword(input.password));
      response.redirect("/login?error=Password%20reset%20complete.%20Please%20sign%20in.");
    } catch (error) {
      response.status(400).send(resetPasswordPage({ storeMode: store.mode, token: request.body.token || "", error: error.message }));
    }
  });

  app.get("/orders/new", async (request, response, next) => {
    try {
      const outletId = Number(request.query.outletId);
      const productId = Number(request.query.productId);
      const context = await store.getOrderContext(outletId, productId);

      if (!context) {
        response.status(404).send("Product not found.");
        return;
      }

      response.send(orderFormPage(context, store.mode));
    } catch (error) {
      next(error);
    }
  });

  app.get("/track", async (request, response, next) => {
    try {
      const orderReference = String(request.query.orderReference || "").trim().toUpperCase();
      const buyerEmail = String(request.query.buyerEmail || "").trim().toLowerCase();
      if (!orderReference && !buyerEmail) {
        response.send(trackOrderPage({ storeMode: store.mode, message: request.query.message || "", paymentProvider: config.paymentProvider }));
        return;
      }
      const order = await store.findOrderForBuyer(orderReference, buyerEmail);
      response.send(trackOrderPage({
        storeMode: store.mode,
        order,
        error: order ? "" : "No order matched that reference and email.",
        paymentProvider: config.paymentProvider
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/orders/cancel-request", async (request, response, next) => {
    try {
      const { input, errors } = normalizeCancellationInput(request.body);
      if (errors.length > 0) {
        response.status(400).send(trackOrderPage({ storeMode: store.mode, error: errors.join(" "), paymentProvider: config.paymentProvider }));
        return;
      }
      const order = await store.requestCancellation(input.orderReference, input.buyerEmail, input.reason);
      await dispatchNotification(store, config, {
        recipientEmail: input.buyerEmail,
        subject: `FuelUp cancellation request ${input.orderReference}`,
        body: `Your cancellation request for ${input.orderReference} has been sent to operations.`
      });
      response.send(trackOrderPage({
        storeMode: store.mode,
        order,
        message: "Cancellation request sent to operations.",
        paymentProvider: config.paymentProvider
      }));
    } catch (error) {
      response.status(404).send(trackOrderPage({ storeMode: store.mode, error: error.message, paymentProvider: config.paymentProvider }));
    }
  });

  const startPayment = async (request, response, next) => {
    let order = null;
    let orderReference = "";
    let buyerEmail = "";
    try {
      orderReference = String(request.body.orderReference || "").trim().toUpperCase();
      buyerEmail = String(request.body.buyerEmail || "").trim().toLowerCase();
      order = await store.findOrderForBuyer(orderReference, buyerEmail);
      if (!order) {
        response.status(404).send(trackOrderPage({ storeMode: store.mode, error: "Order not found.", paymentProvider: config.paymentProvider }));
        return;
      }
      if (order.payment_status === "paid") {
        response.redirect(`/track?orderReference=${encodeURIComponent(orderReference)}&buyerEmail=${encodeURIComponent(buyerEmail)}`);
        return;
      }

      const payment = config.paymentProvider === "demo"
        ? initializeDemoPayment(order)
        : await initializePaystackPayment(order, config);
      await store.prepareOrderPayment(orderReference, buyerEmail, payment);
      response.redirect(payment.authorizationUrl);
    } catch (error) {
      try {
        order = order || await store.findOrderForBuyer(orderReference, buyerEmail);
        response.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 502).send(trackOrderPage({
          storeMode: store.mode,
          order,
          error: `Payment could not be started. ${error.message}`,
          paymentProvider: config.paymentProvider
        }));
      } catch (fallbackError) {
        next(fallbackError);
      }
    }
  };

  app.post("/payments/initialize", startPayment);
  app.post("/payments/paystack/initialize", startPayment);

  app.get("/payments/demo/confirm", async (request, response, next) => {
    try {
      const reference = String(request.query.reference || "").trim();
      if (!reference) {
        response.status(400).send("Payment reference is required.");
        return;
      }

      const order = await store.findOrderByPaymentReference(reference);
      if (!order) {
        response.status(404).send("Order not found for payment reference.");
        return;
      }

      response.send(demoPaymentPage({ storeMode: store.mode, order, reference }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/payments/demo/confirm", async (request, response, next) => {
    try {
      const reference = String(request.body.reference || "").trim();
      if (!reference) {
        response.status(400).send("Payment reference is required.");
        return;
      }

      const order = await store.findOrderByPaymentReference(reference);
      if (!order) {
        response.status(404).send("Order not found for payment reference.");
        return;
      }

      await store.markPaymentPaid(reference, {
        status: true,
        data: {
          status: "success",
          reference,
          provider: "demo",
          amount: Math.round(Number(order.total_amount || 0) * 100),
          currency: "NGN"
        }
      });
      response.redirect(`/track?orderReference=${encodeURIComponent(order.order_reference)}&buyerEmail=${encodeURIComponent(order.buyer_email)}&message=${encodeURIComponent("Demo payment confirmed.")}`);
    } catch (error) {
      next(error);
    }
  });

  app.get("/payments/paystack/callback", async (request, response, next) => {
    try {
      const reference = String(request.query.reference || "").trim();
      if (!reference) {
        response.status(400).send("Payment reference is required.");
        return;
      }

      const order = await store.findOrderByPaymentReference(reference);
      if (!order) {
        response.status(404).send("Order not found for payment reference.");
        return;
      }

      const verification = await verifyPaystackReference(reference, config);
      if (verification.data?.status === "success") {
        if (config.paystackSecretKey === "sk_test_mock" || Number(verification.data.amount) >= paystackAmount(order.total_amount)) {
          await store.markPaymentPaid(reference, verification);
        }
      }

      response.redirect(`/track?orderReference=${encodeURIComponent(order.order_reference)}&buyerEmail=${encodeURIComponent(order.buyer_email)}`);
    } catch (error) {
      next(error);
    }
  });

  app.post("/orders", async (request, response, next) => {
    const { input, errors } = normalizeOrderInput(request.body);

    try {
      if (errors.length > 0) {
        throw new Error(errors.join(" "));
      }

      const order = await store.createOrder(input);
      await dispatchNotification(store, config, orderCreatedNotification(order));
      response.status(201).send(orderSuccessPage(order, store.mode, config.paymentProvider));
    } catch (error) {
      try {
        const context = await store.getOrderContext(input.outletId, input.productId);
        response.status(400).send(orderFormPage(context, store.mode, error.message));
      } catch (fallbackError) {
        next(fallbackError);
      }
    }
  });

  app.get("/dashboard", requireAuth, async (request, response, next) => {
    try {
      const orders = await store.listOrders(request.user);
      const summary = await store.getDashboardSummary(request.user);
      const auditEvents = await store.listAuditEvents(8);
      response.send(dashboardPage({
        orders,
        summary,
        auditEvents,
        page: readPage(request.query),
        storeMode: store.mode,
        message: request.query.message || "",
        user: request.user,
        csrfToken: getCsrfToken(request, config)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/inventory", requireAuth, async (request, response, next) => {
    try {
      const products = await store.listInventory(request.user);
      const auditEvents = await store.listAuditEvents(8);
      response.send(inventoryPage({
        products,
        auditEvents,
        page: readPage(request.query),
        storeMode: store.mode,
        message: request.query.message || "",
        error: request.query.error || "",
        user: request.user,
        csrfToken: getCsrfToken(request, config)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/users", requireRole("admin"), async (request, response, next) => {
    try {
      response.send(usersPage({
        users: await store.listUsers(),
        assignments: await store.listUserOutletAssignments(),
        outlets: await store.listOutlets(),
        usersPage: readPage(request.query, "usersPage"),
        assignmentsPage: readPage(request.query, "assignmentsPage"),
        storeMode: store.mode,
        message: request.query.message || "",
        error: request.query.error || "",
        user: request.user,
        csrfToken: getCsrfToken(request, config)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/users", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeUserInput(request.body);
      if (errors.length > 0) {
        response.redirect(`/admin/users?error=${encodeURIComponent(errors.join(" "))}`);
        return;
      }
      await store.upsertUser({
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: await hashPassword(input.password)
      });
      response.redirect("/admin/users?message=User%20saved");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/users/:id/active", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const userId = Number(request.params.id);
      const isActive = request.body.isActive === "true";
      await store.setUserActive(userId, isActive, request.user);
      response.redirect("/admin/users?message=User%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/users/:id/reset", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const user = await store.createPasswordReset(Number(request.params.id), request.user);
      const resetUrl = `${request.protocol}://${request.get("host")}/reset-password?token=${encodeURIComponent(user.password_reset_token)}`;
      await dispatchNotification(store, config, {
        recipientEmail: user.email,
        subject: "FuelUp password reset",
        body: `Use this link to set your FuelUp password: ${resetUrl}`
      });
      response.redirect("/admin/users?message=Password%20reset%20created");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/users/:id/outlets", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const userId = Number(request.params.id);
      const outletId = Number(request.body.outletId);
      await store.assignUserOutlet(userId, outletId, request.user);
      response.redirect("/admin/users?message=Outlet%20assigned");
    } catch (error) {
      next(error);
    }
  });

  app.get("/settlements.csv", requireRole("admin"), async (_request, response, next) => {
    try {
      const rows = await store.listSettlementRows({ from: _request.query.from, to: _request.query.to });
      const header = ["order_reference", "buyer_email", "organization", "outlet", "amount", "payment_provider", "payment_reference", "paid_at"];
      const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [
        header.join(","),
        ...rows.map((row) => [
          row.order_reference,
          row.buyer_email,
          row.organization_name,
          row.outlet_name,
          row.total_amount,
          row.payment_provider,
          row.payment_reference,
          row.paid_at
        ].map(escapeCsv).join(","))
      ].join("\n");
      response.setHeader("content-type", "text/csv; charset=utf-8");
      response.setHeader("content-disposition", "attachment; filename=\"fuelup-settlements.csv\"");
      response.send(csv);
    } catch (error) {
      next(error);
    }
  });

  app.get("/settlements", requireRole("admin"), async (request, response, next) => {
    try {
      const filters = { from: request.query.from || "", to: request.query.to || "" };
      const rows = await store.listSettlementRows(filters);
      response.send(settlementsPage({
        rows,
        filters,
        page: readPage(request.query),
        storeMode: store.mode,
        user: request.user
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/notifications", requireRole("admin"), async (_request, response, next) => {
    try {
      response.json(await store.listNotifications(50));
    } catch (error) {
      next(error);
    }
  });

  app.get("/onboarding", requireRole("admin"), async (request, response, next) => {
    try {
      response.send(onboardingPage({
        organizations: await store.listOrganizations(),
        outlets: await store.listOutlets(),
        storeMode: store.mode,
        message: request.query.message || "",
        error: request.query.error || "",
        user: request.user,
        csrfToken: getCsrfToken(request, config)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/organizations", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeOrganizationInput(request.body);
      if (errors.length > 0) return response.redirect(`/onboarding?error=${encodeURIComponent(errors.join(" "))}`);
      await store.createOrganization(input, request.user);
      response.redirect("/onboarding?message=Organization%20created");
    } catch (error) {
      next(error);
    }
  });

  app.post("/organizations/:id", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeOrganizationInput(request.body);
      if (errors.length > 0) return response.redirect(`/onboarding?error=${encodeURIComponent(errors.join(" "))}`);
      await store.updateOrganization(Number(request.params.id), input, request.user);
      response.redirect("/onboarding?message=Organization%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.post("/outlets", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeOutletInput(request.body);
      if (errors.length > 0) return response.redirect(`/onboarding?error=${encodeURIComponent(errors.join(" "))}`);
      await store.createOutlet(input, request.user);
      response.redirect("/onboarding?message=Outlet%20created");
    } catch (error) {
      next(error);
    }
  });

  app.post("/outlets/:id", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeOutletInput(request.body);
      if (errors.length > 0) return response.redirect(`/onboarding?error=${encodeURIComponent(errors.join(" "))}`);
      await store.updateOutlet(Number(request.params.id), input, request.user);
      response.redirect("/onboarding?message=Outlet%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.post("/products", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeProductInput(request.body);
      if (errors.length > 0) return response.redirect(`/onboarding?error=${encodeURIComponent(errors.join(" "))}`);
      await store.createProduct(input, request.user);
      response.redirect("/onboarding?message=Product%20created");
    } catch (error) {
      next(error);
    }
  });

  app.post("/products/:id", requireRole("admin"), requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeProductInput(request.body);
      if (errors.length > 0) return response.redirect(`/onboarding?error=${encodeURIComponent(errors.join(" "))}`);
      await store.updateProduct(Number(request.params.id), input, request.user);
      response.redirect("/onboarding?message=Product%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.post("/products/:id/inventory", requireAuth, requireCsrf(config), async (request, response, next) => {
    try {
      const productId = Number(request.params.id);
      if (!Number.isInteger(productId) || productId < 1) {
        throw new Error("Invalid product.");
      }

      const { input, errors } = normalizeInventoryInput(request.body);
      if (errors.length > 0) {
        response.redirect(`/inventory?error=${encodeURIComponent(errors.join(" "))}`);
        return;
      }

      await store.updateInventory(productId, input, request.user);
      response.redirect("/inventory?message=Inventory%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.post("/orders/:id/status", requireAuth, requireCsrf(config), async (request, response, next) => {
    try {
      const status = normalizeStatus(request.body.status);
      if (!status) {
        throw new Error("Invalid order status.");
      }

      const order = await store.updateOrderStatus(Number(request.params.id), status, request.user);
      await dispatchNotification(store, config, orderStatusNotification(order));
      response.redirect("/dashboard?message=Order%20status%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.post("/orders/:id/cancellation", requireAuth, requireCsrf(config), async (request, response, next) => {
    try {
      const { input, errors } = normalizeCancellationDecisionInput(request.body);
      if (errors.length > 0) throw new Error(errors.join(" "));
      const order = await store.decideCancellation(Number(request.params.id), input, request.user);
      await dispatchNotification(store, config, {
        recipientEmail: order.buyer_email,
        subject: `FuelUp cancellation ${order.order_reference}`,
        body: `Your cancellation request for ${order.order_reference} was ${input.decision}. Reason: ${input.reason}`
      });
      response.redirect("/dashboard?message=Cancellation%20decision%20saved");
    } catch (error) {
      next(error);
    }
  });

  app.post("/orders/:id/payment", requireAuth, requireCsrf(config), async (request, response, next) => {
    try {
      const paymentStatus = normalizePaymentStatus(request.body.paymentStatus);
      if (!paymentStatus) {
        throw new Error("Invalid payment status.");
      }
      const order = await store.updatePaymentStatus(Number(request.params.id), paymentStatus, request.user);
      await dispatchNotification(store, config, paymentNotification(order));
      response.redirect("/dashboard?message=Payment%20status%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, _next) => {
    logEvent("error", "http.error", {
      requestId: request.id,
      path: request.originalUrl,
      message: error.message,
      stack: config.isProduction ? undefined : error.stack
    });
    const status = error.statusCode || 500;
    response.status(status).send(
      status >= 500
        ? "FuelUp hit an unexpected error. Check server logs for details."
        : error.message
    );
  });

  return { app, config, store };
}

async function startServer(config = createConfig()) {
  const { app, store } = await createApp(config);

  const server = app.listen(config.port, () => {
    console.log(`FuelUp running on port ${config.port} using ${store.mode} store.`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received. Shutting down FuelUp.`);
    server.close(async () => {
      if (store.pool) {
        await store.pool.end();
      }
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return { app, server, store, config };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { createApp, createStore, startServer };
