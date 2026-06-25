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

function formatQuantity(value) {
  return Number(value || 0).toLocaleString();
}

function layout({ title, body, storeMode }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="FuelUp connects downstream oil and gas outlets with buyers for product availability, order reservation, and outlet fulfillment.">
    <title>${escapeHtml(title)} | FuelUp</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/" aria-label="FuelUp home">
        <span class="brand-mark">F</span>
        <span>FuelUp</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="/">Marketplace</a>
        <a href="/dashboard">Operations</a>
        <a href="/inventory">Inventory</a>
        <a href="/login">Login</a>
      </nav>
    </header>
    <main>
      ${body}
    </main>
    <footer>
      <span>FuelUp trading platform</span>
      <span>Runtime: ${escapeHtml(storeMode)}</span>
    </footer>
  </body>
</html>`;
}

function loginPage({ storeMode, nextPath, error = "", adminConfigured = true }) {
  return layout({
    title: "Operator Login",
    storeMode,
    body: `
      <section class="auth-shell">
        <div class="auth-card">
          <p class="eyebrow">Secure operations</p>
          <h1>Operator login</h1>
          <p>Access is required for order management, outlet fulfillment, and status changes.</p>
          ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
          ${adminConfigured ? "" : `<p class="alert">No operator account is configured yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in Render.</p>`}
          <form method="post" action="/login">
            <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
            <label>
              Email
              <input required type="email" name="email" autocomplete="username" placeholder="ops@example.com">
            </label>
            <label>
              Password
              <input required type="password" name="password" autocomplete="current-password" placeholder="Enter password">
            </label>
            <button class="button wide" type="submit">Sign in</button>
          </form>
        </div>
      </section>
    `
  });
}

function marketplacePage(products, storeMode) {
  const openOutlets = new Set(products.filter((item) => item.is_open).map((item) => item.outlet_id)).size;
  const organizations = new Set(products.map((item) => item.organization_name)).size;
  const productCount = products.length;

  const cards = products
    .map((product) => {
      const availabilityClass = Number(product.available_quantity) > 5000 ? "good" : "watch";
      return `
        <article class="listing-card">
          <div class="listing-head">
            <div>
              <p class="eyebrow">${escapeHtml(product.organization_name)}</p>
              <h2>${escapeHtml(product.name)}</h2>
            </div>
            <span class="pill ${product.is_open ? "success" : "muted-pill"}">${product.is_open ? "Open" : "Closed"}</span>
          </div>
          <p class="station">${escapeHtml(product.outlet_name)}</p>
          <p class="muted">${escapeHtml(product.address)}, ${escapeHtml(product.city)}</p>
          <dl class="market-facts">
            <div>
              <dt>Live price</dt>
              <dd>${currency.format(product.price)} <span>/ ${escapeHtml(product.unit)}</span></dd>
            </div>
            <div>
              <dt>Available stock</dt>
              <dd class="${availabilityClass}">${formatQuantity(product.available_quantity)} <span>${escapeHtml(product.unit)}</span></dd>
            </div>
          </dl>
          <div class="listing-actions">
            <a class="button" href="/orders/new?outletId=${product.outlet_id}&productId=${product.id}">Reserve order</a>
            <span>${escapeHtml(product.phone)}</span>
          </div>
        </article>
      `;
    })
    .join("");

  return layout({
    title: "Marketplace",
    storeMode,
    body: `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Verified downstream trading</p>
          <h1>Fuel ordering infrastructure for buyers, outlets, and operators.</h1>
          <p>FuelUp gives buyers a clear ordering path while station operators manage product availability, confirmations, and fulfillment from one control surface.</p>
          <div class="hero-actions">
            <a class="button" href="#marketplace">Browse products</a>
            <a class="button secondary" href="/dashboard">Open operations</a>
          </div>
        </div>
        <aside class="command-panel" aria-label="Marketplace snapshot">
          <div class="panel-top">
            <span class="signal"></span>
            <strong>Live marketplace</strong>
          </div>
          <dl>
            <div><dt>Organizations</dt><dd>${organizations}</dd></div>
            <div><dt>Open outlets</dt><dd>${openOutlets}</dd></div>
            <div><dt>Products listed</dt><dd>${productCount}</dd></div>
          </dl>
        </aside>
      </section>

      <section class="trust-strip" aria-label="Platform capabilities">
        <div><strong>Buyer orders</strong><span>Pickup or delivery request</span></div>
        <div><strong>Outlet control</strong><span>Accept, prepare, complete</span></div>
        <div><strong>Stock guard</strong><span>Orders cannot exceed availability</span></div>
        <div><strong>Postgres ready</strong><span>Render-backed persistence</span></div>
      </section>

      <section id="marketplace" class="section-heading">
        <div>
          <p class="eyebrow">Marketplace</p>
          <h2>Available products</h2>
        </div>
        <p>${productCount} listings across ${openOutlets} open outlets</p>
      </section>

      <section class="grid">
        ${cards || `<p class="empty-panel">No products are currently listed.</p>`}
      </section>
    `
  });
}

function orderFormPage(context, storeMode, error = "") {
  return layout({
    title: "Place Order",
    storeMode,
    body: `
      <section class="form-shell">
        <a class="backlink" href="/">Back to marketplace</a>
        <div class="form-grid">
          <aside class="order-context">
            <p class="eyebrow">Order reservation</p>
            <h1>${escapeHtml(context.name)}</h1>
            <p>${escapeHtml(context.outlet_name)} by ${escapeHtml(context.organization_name)}</p>
            <dl>
              <div><dt>Price</dt><dd>${currency.format(context.price)} / ${escapeHtml(context.unit)}</dd></div>
              <div><dt>Available</dt><dd>${formatQuantity(context.available_quantity)} ${escapeHtml(context.unit)}</dd></div>
              <div><dt>Outlet phone</dt><dd>${escapeHtml(context.phone)}</dd></div>
            </dl>
          </aside>

          <section class="form-card">
            <h2>Buyer details</h2>
            ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
            <form method="post" action="/orders">
              <input type="hidden" name="outletId" value="${context.outlet_id}">
              <input type="hidden" name="productId" value="${context.id}">

              <div class="field-row">
                <label>
                  Buyer name
                  <input required name="buyerName" maxlength="120" placeholder="Aganran Logistics">
                </label>

                <label>
                  Phone
                  <input required name="buyerPhone" maxlength="40" placeholder="+234...">
                </label>
              </div>

              <label>
                Email
                <input required type="email" name="buyerEmail" maxlength="160" placeholder="buyer@example.com">
              </label>

              <div class="field-row">
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
              </div>

              <label>
                Delivery address
                <textarea name="deliveryAddress" maxlength="400" placeholder="Required if delivery is requested"></textarea>
              </label>

              <label>
                Notes
                <textarea name="notes" maxlength="500" placeholder="Vehicle details, loading window, invoice preference"></textarea>
              </label>

              <button class="button wide" type="submit">Submit reservation</button>
            </form>
          </section>
        </div>
      </section>
    `
  });
}

function orderSuccessPage(order, storeMode) {
  return layout({
    title: "Order Submitted",
    storeMode,
    body: `
      <section class="success-panel">
        <p class="eyebrow">Reservation received</p>
        <h1>Order submitted for outlet confirmation.</h1>
        <div class="summary-card">
          <strong>${escapeHtml(order.order_reference || `Order #${order.id}`)}</strong>
          <span>Status: ${escapeHtml(order.status || "pending")}</span>
        </div>
        <div class="hero-actions">
          <a class="button" href="/dashboard">View operations dashboard</a>
          <a class="button secondary" href="/">Back to marketplace</a>
        </div>
      </section>
    `
  });
}

function auditFeed(events) {
  if (!events || events.length === 0) {
    return `<p class="empty-panel compact">No audit events yet.</p>`;
  }

  return `
    <ol class="audit-list">
      ${events
        .map((event) => {
          const details = event.details || {};
          const label = event.action === "inventory.updated"
            ? `Inventory updated for product #${event.entity_id}`
            : `Order status changed to ${escapeHtml(details.to || "updated")}`;
          return `
            <li>
              <strong>${label}</strong>
              <span>${escapeHtml(event.actor_email || "system")} · ${new Date(event.created_at).toLocaleString()}</span>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function dashboardPage({ orders, summary, auditEvents, storeMode, message = "", user, csrfToken }) {
  const metricCards = [
    ["Total orders", summary.totalOrders || 0],
    ["Pending", summary.pendingOrders || 0],
    ["Completed", summary.completedOrders || 0],
    ["Order value", currency.format(summary.totalValue || 0)]
  ]
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  const orderRows = orders.length
    ? orders
        .map(
          (order) => `
            <tr>
              <td>
                <strong>${escapeHtml(order.order_reference || `#${order.id}`)}</strong>
                <span>${new Date(order.created_at).toLocaleString()}</span>
              </td>
              <td>
                <strong>${escapeHtml(order.buyer_name)}</strong>
                <span>${escapeHtml(order.buyer_phone)}</span>
              </td>
              <td>
                <strong>${escapeHtml(order.product_name)}</strong>
                <span>${formatQuantity(order.quantity)} ${escapeHtml(order.unit)}</span>
              </td>
              <td>
                <strong>${escapeHtml(order.outlet_name)}</strong>
                <span>${escapeHtml(order.organization_name)}</span>
              </td>
              <td>${currency.format(order.total_amount || Number(order.quantity) * Number(order.price || 0))}</td>
              <td><span class="status status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td>
              <td>
                <form class="inline-form" method="post" action="/orders/${order.id}/status">
                  <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
                  <select name="status" aria-label="Order status">
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
    title: "Operations Dashboard",
    storeMode,
    body: `
      <section class="dashboard-head">
        <div>
          <p class="eyebrow">Outlet operations</p>
          <h1>Order control center</h1>
          <p>Signed in as ${escapeHtml(user.email)}. Monitor incoming buyer reservations, move orders through fulfillment, and keep station teams aligned.</p>
        </div>
        <div class="hero-actions">
          <a class="button secondary" href="/">Create buyer order</a>
          <a class="button secondary" href="/inventory">Manage inventory</a>
          <form class="logout-form" method="post" action="/logout">
            <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
            <button class="button ghost" type="submit">Sign out</button>
          </form>
        </div>
      </section>

      <section class="metrics-grid">
        ${metricCards}
      </section>

      ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}

      <section class="ops-grid">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Product</th>
                <th>Outlet</th>
                <th>Value</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${orderRows}</tbody>
          </table>
        </div>
        <aside class="activity-panel">
          <p class="eyebrow">Recent audit trail</p>
          <h2>Activity</h2>
          ${auditFeed(auditEvents)}
        </aside>
      </section>
    `
  });
}

function inventoryPage({ products, auditEvents, storeMode, message = "", error = "", user, csrfToken }) {
  const rows = products.length
    ? products.map((product) => `
        <tr>
          <td>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.organization_name)} · ${escapeHtml(product.outlet_name)}</span>
          </td>
          <td>${escapeHtml(product.city)}</td>
          <td>${escapeHtml(product.unit)}</td>
          <td>
            <form class="inventory-form" method="post" action="/products/${product.id}/inventory">
              <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
              <label>
                Price
                <input required type="number" name="price" min="1" step="0.01" value="${escapeHtml(product.price)}">
              </label>
              <label>
                Stock
                <input required type="number" name="availableQuantity" min="0" step="0.01" value="${escapeHtml(product.available_quantity)}">
              </label>
              <button type="submit">Save</button>
            </form>
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="empty">No inventory records found.</td></tr>`;

  return layout({
    title: "Inventory",
    storeMode,
    body: `
      <section class="dashboard-head">
        <div>
          <p class="eyebrow">Inventory control</p>
          <h1>Price and stock management</h1>
          <p>Signed in as ${escapeHtml(user.email)}. Update station-level availability and pricing with audit history.</p>
        </div>
        <div class="hero-actions">
          <a class="button secondary" href="/dashboard">Back to operations</a>
          <form class="logout-form" method="post" action="/logout">
            <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
            <button class="button ghost" type="submit">Sign out</button>
          </form>
        </div>
      </section>

      ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
      ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}

      <section class="ops-grid">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>City</th>
                <th>Unit</th>
                <th>Update</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <aside class="activity-panel">
          <p class="eyebrow">Recent audit trail</p>
          <h2>Activity</h2>
          ${auditFeed(auditEvents)}
        </aside>
      </section>
    `
  });
}

module.exports = {
  dashboardPage,
  inventoryPage,
  loginPage,
  marketplacePage,
  orderFormPage,
  orderSuccessPage
};
