const express = require("express");
const { Pool } = require("pg");
const { initDatabase } = require("./db/init");
const { createMemoryStore } = require("./data/memoryStore");
const { createPostgresStore } = require("./data/postgresStore");
const {
  dashboardPage,
  marketplacePage,
  orderFormPage,
  orderSuccessPage
} = require("./views");

const allowedStatuses = new Set(["pending", "accepted", "ready", "completed", "cancelled"]);

async function createStore() {
  if (!process.env.DATABASE_URL) {
    return createMemoryStore();
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });
  await initDatabase(pool);
  return createPostgresStore(pool);
}

async function main() {
  const app = express();
  const store = await createStore();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static("public"));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, mode: store.mode });
  });

  app.get("/", async (_request, response, next) => {
    try {
      const products = await store.listMarketplace();
      response.send(marketplacePage(products, store.mode));
    } catch (error) {
      next(error);
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

  app.post("/orders", async (request, response, next) => {
    const input = {
      outletId: Number(request.body.outletId),
      productId: Number(request.body.productId),
      buyerName: request.body.buyerName,
      buyerPhone: request.body.buyerPhone,
      buyerEmail: request.body.buyerEmail,
      quantity: Number(request.body.quantity),
      fulfillmentMethod: request.body.fulfillmentMethod,
      deliveryAddress: request.body.deliveryAddress,
      notes: request.body.notes
    };

    try {
      if (!input.buyerName || !input.buyerPhone || !input.buyerEmail || !input.quantity) {
        throw new Error("Please complete buyer contact details and quantity.");
      }

      if (!["pickup", "delivery"].includes(input.fulfillmentMethod)) {
        throw new Error("Choose a valid fulfillment method.");
      }

      if (input.fulfillmentMethod === "delivery" && !input.deliveryAddress) {
        throw new Error("Delivery address is required for delivery requests.");
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

  app.get("/dashboard", async (request, response, next) => {
    try {
      const orders = await store.listOrders();
      response.send(dashboardPage(orders, store.mode, request.query.message || ""));
    } catch (error) {
      next(error);
    }
  });

  app.post("/orders/:id/status", async (request, response, next) => {
    try {
      const status = request.body.status;
      if (!allowedStatuses.has(status)) {
        throw new Error("Invalid order status.");
      }

      await store.updateOrderStatus(Number(request.params.id), status);
      response.redirect("/dashboard?message=Order%20status%20updated");
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).send("FuelUp hit an unexpected error. Check server logs for details.");
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`FuelUp POC running on port ${port} using ${store.mode} store.`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
