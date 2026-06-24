const currency = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function layout({ title, body, storeMode }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | FuelUp</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/">FuelUp</a>
      <nav>
        <a href="/">Marketplace</a>
        <a href="/dashboard">Outlet dashboard</a>
      </nav>
    </header>
    <main>
      ${body}
    </main>
    <footer>
      <span>POC mode: ${escapeHtml(storeMode)}</span>
      <span>Render + PostgreSQL ready</span>
    </footer>
  </body>
</html>`;
}

function marketplacePage(products, storeMode) {
  const cards = products
    .map(
      (product) => `
        <article class="card product-card">
          <div>
            <p class="eyebrow">${escapeHtml(product.organization_name)}</p>
            <h2>${escapeHtml(product.name)}</h2>
            <p>${escapeHtml(product.outlet_name)} · ${escapeHtml(product.city)}</p>
            <p class="muted">${escapeHtml(product.address)}</p>
          </div>
          <dl class="facts">
            <div><dt>Price</dt><dd>${currency.format(product.price)} / ${escapeHtml(product.unit)}</dd></div>
            <div><dt>Available</dt><dd>${Number(product.available_quantity).toLocaleString()} ${escapeHtml(product.unit)}</dd></div>
            <div><dt>Status</dt><dd>${product.is_open ? "Open" : "Closed"}</dd></div>
          </dl>
          <a class="button" href="/orders/new?outletId=${product.outlet_id}&productId=${product.id}">Place order</a>
        </article>
      `
    )
    .join("");

  return layout({
    title: "Marketplace",
    storeMode,
    body: `
      <section class="hero">
        <div>
          <p class="eyebrow">Downstream trading POC</p>
          <h1>Order fuel and station products from verified outlets.</h1>
          <p>FuelUp connects buyers with oil and gas organizations that operate one or many filling station outlets.</p>
        </div>
        <div class="hero-panel">
          <strong>POC workflow</strong>
          <span>Browse availability</span>
          <span>Reserve product</span>
          <span>Outlet confirms order</span>
        </div>
      </section>
      <section class="section-heading">
        <h2>Available Products</h2>
        <p>${products.length} live demo listings</p>
      </section>
      <section class="grid">
        ${cards}
      </section>
    `
  });
}

function orderFormPage(context, storeMode, error = "") {
  return layout({
    title: "Place Order",
    storeMode,
    body: `
      <section class="narrow">
        <a class="backlink" href="/">Back to marketplace</a>
        <h1>Place Order</h1>
        ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
        <div class="summary">
          <strong>${escapeHtml(context.name)}</strong>
          <span>${escapeHtml(context.outlet_name)} · ${escapeHtml(context.organization_name)}</span>
          <span>${currency.format(context.price)} / ${escapeHtml(context.unit)} · ${Number(context.available_quantity).toLocaleString()} ${escapeHtml(context.unit)} available</span>
        </div>
        <form method="post" action="/orders">
          <input type="hidden" name="outletId" value="${context.outlet_id}">
          <input type="hidden" name="productId" value="${context.id}">

          <label>
            Buyer name
            <input required name="buyerName" placeholder="Aganran Logistics">
          </label>

          <label>
            Phone
            <input required name="buyerPhone" placeholder="+234...">
          </label>

          <label>
            Email
            <input required type="email" name="buyerEmail" placeholder="buyer@example.com">
          </label>

          <label>
            Quantity
            <input required type="number" name="quantity" min="1" step="0.01" placeholder="1000">
          </label>

          <label>
            Fulfillment
            <select name="fulfillmentMethod">
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery request</option>
            </select>
          </label>

          <label>
            Delivery address
            <textarea name="deliveryAddress" placeholder="Required if delivery is requested"></textarea>
          </label>

          <label>
            Notes
            <textarea name="notes" placeholder="Vehicle details, loading window, invoice preference"></textarea>
          </label>

          <button class="button" type="submit">Submit order</button>
        </form>
      </section>
    `
  });
}

function orderSuccessPage(order, storeMode) {
  return layout({
    title: "Order Submitted",
    storeMode,
    body: `
      <section class="narrow success">
        <h1>Order submitted</h1>
        <p>Your order is now pending outlet confirmation.</p>
        <div class="summary">
          <strong>Order #${escapeHtml(order.id)}</strong>
          <span>Status: ${escapeHtml(order.status || "pending")}</span>
        </div>
        <a class="button" href="/dashboard">View dashboard</a>
      </section>
    `
  });
}

function dashboardPage(orders, storeMode, message = "") {
  const orderRows = orders.length
    ? orders
        .map(
          (order) => `
            <tr>
              <td>#${escapeHtml(order.id)}</td>
              <td>
                <strong>${escapeHtml(order.buyer_name)}</strong>
                <span>${escapeHtml(order.buyer_phone)}</span>
              </td>
              <td>${escapeHtml(order.product_name)}</td>
              <td>${Number(order.quantity).toLocaleString()} ${escapeHtml(order.unit)}</td>
              <td>${escapeHtml(order.outlet_name)}</td>
              <td><span class="status">${escapeHtml(order.status)}</span></td>
              <td>
                <form class="inline-form" method="post" action="/orders/${order.id}/status">
                  <select name="status">
                    ${["pending", "accepted", "ready", "completed", "cancelled"]
                      .map(
                        (status) =>
                          `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`
                      )
                      .join("")}
                  </select>
                  <button type="submit">Update</button>
                </form>
              </td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No orders yet. Place one from the marketplace to test the flow.</td></tr>`;

  return layout({
    title: "Outlet Dashboard",
    storeMode,
    body: `
      <section class="section-heading">
        <div>
          <p class="eyebrow">Outlet operations</p>
          <h1>Order Dashboard</h1>
        </div>
        <a class="button secondary" href="/">New buyer order</a>
      </section>
      ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Outlet</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${orderRows}</tbody>
        </table>
      </section>
    `
  });
}

module.exports = {
  dashboardPage,
  marketplacePage,
  orderFormPage,
  orderSuccessPage
};
