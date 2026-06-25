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
  setAuthCookies,
  verifyPassword
} = require("./auth");
const { createConfig } = require("./config");
const { initDatabase } = require("./db/init");
const { createMemoryStore } = require("./data/memoryStore");
const { createPostgresStore } = require("./data/postgresStore");
const { normalizeInventoryInput, normalizeOrderInput, normalizeStatus } = require("./validation");
const {
  dashboardPage,
  inventoryPage,
  loginPage,
  marketplacePage,
  orderFormPage,
  orderSuccessPage
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
  await initDatabase(pool);
  return { ...createPostgresStore(pool), pool };
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
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
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
  app.use(express.urlencoded({ extended: false, limit: config.maxRequestBody }));
  app.use(parseCookies);
  app.use(attachUser(config));
  app.use(express.static("public", { maxAge: config.isProduction ? "1h" : 0 }));

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

  app.get("/", async (_request, response, next) => {
    try {
      const products = await store.listMarketplace();
      response.send(marketplacePage(products, store.mode));
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

  app.post("/orders", async (request, response, next) => {
    const { input, errors } = normalizeOrderInput(request.body);

    try {
      if (errors.length > 0) {
        throw new Error(errors.join(" "));
      }

      const order = await store.createOrder(input);
      response.status(201).send(orderSuccessPage(order, store.mode));
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
      const orders = await store.listOrders();
      const summary = await store.getDashboardSummary();
      const auditEvents = await store.listAuditEvents(8);
      response.send(dashboardPage({
        orders,
        summary,
        auditEvents,
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
      const products = await store.listInventory();
      const auditEvents = await store.listAuditEvents(8);
      response.send(inventoryPage({
        products,
        auditEvents,
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

      await store.updateOrderStatus(Number(request.params.id), status, request.user);
      response.redirect("/dashboard?message=Order%20status%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, _next) => {
    console.error(error);
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
