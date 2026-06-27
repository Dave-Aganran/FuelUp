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

function productInitial(name) {
  return escapeHtml(String(name || "F").trim().slice(0, 1).toUpperCase());
}

function productImage(name) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("lpg") || normalized.includes("gas")) {
    return "https://image.pollinations.ai/prompt/premium%20photorealistic%20LPG%20gas%20cylinders%20at%20a%20modern%20downstream%20energy%20depot%20corporate%20product%20photography%20no%20text?width=1100&height=760&seed=214&nologo=true";
  }
  if (normalized.includes("oil")) {
    return "https://image.pollinations.ai/prompt/premium%20photorealistic%20engine%20oil%20lubricant%20containers%20in%20a%20modern%20oil%20and%20gas%20warehouse%20corporate%20product%20photography%20no%20text?width=1100&height=760&seed=318&nologo=true";
  }
  if (normalized.includes("ago") || normalized.includes("diesel")) {
    return "https://image.pollinations.ai/prompt/premium%20photorealistic%20diesel%20fuel%20tanker%20truck%20at%20a%20clean%20industrial%20loading%20bay%20oil%20and%20gas%20corporate%20photography%20no%20text?width=1100&height=760&seed=512&nologo=true";
  }
  return "https://image.pollinations.ai/prompt/premium%20photorealistic%20petrol%20fuel%20pump%20and%20storage%20terminal%20clean%20modern%20downstream%20oil%20and%20gas%20corporate%20photography%20no%20text?width=1100&height=760&seed=728&nologo=true";
}

function heroImage() {
  return "https://image.pollinations.ai/prompt/premium%20photorealistic%20oil%20and%20gas%20fuel%20terminal%20at%20dusk%20storage%20tanks%20tanker%20truck%20corporate%20photography%20no%20text?width=1400&height=920&seed=901&nologo=true";
}

function statusLabel(status) {
  const labels = {
    pending: "New request",
    accepted: "Accepted",
    ready: "Ready",
    completed: "Delivered",
    cancelled: "Cancelled"
  };
  return labels[status] || status || "pending";
}

function paymentLabel(status) {
  const labels = {
    unpaid: "Payment due",
    invoice_sent: "Invoice sent",
    paid: "Paid",
    refunded: "Refunded"
  };
  return labels[status] || status || "unpaid";
}

function orderTimeline(order) {
  const steps = [
    ["pending", "Order placed"],
    ["accepted", "Outlet accepted"],
    ["ready", "Ready / dispatching"],
    ["completed", "Completed"]
  ];
  const orderStatus = order?.status || "pending";
  const activeIndex = Math.max(0, steps.findIndex(([status]) => status === orderStatus));
  const isCancelled = orderStatus === "cancelled";

  return `
    <ol class="timeline ${isCancelled ? "timeline-cancelled" : ""}">
      ${steps.map(([status, label], index) => `
        <li class="${index <= activeIndex && !isCancelled ? "done" : ""} ${status === orderStatus ? "current" : ""}">
          <span></span>
          <strong>${escapeHtml(label)}</strong>
        </li>
      `).join("")}
      ${isCancelled ? `<li class="current danger-step"><span></span><strong>Cancellation approved</strong></li>` : ""}
    </ol>
  `;
}

function navItemsFor(user) {
  const publicItems = [
    { href: "/", label: "Marketplace", detail: "Buyer ordering" },
    { href: "/track", label: "Track order", detail: "Buyer self-service" },
    { href: "/self-onboarding", label: "Join FuelUp", detail: "Self-service onboarding" }
  ];

  if (!user) {
    return [
      ...publicItems,
      { href: "/login", label: "Operator login", detail: "Secure access", cta: true }
    ];
  }

  const operatorItems = [
    { href: "/dashboard", label: "Operations", detail: "Fulfilment control" },
    { href: "/inventory", label: "Inventory", detail: "Stock and pricing" }
  ];
  const adminItems = user.role === "admin"
    ? [
        { href: "/admin/users", label: "Users", detail: "Team access" },
        { href: "/onboarding", label: "Onboarding", detail: "Organizations and outlets" },
        { href: "/settlements", label: "Settlements", detail: "Paid order exports" }
      ]
    : [];

  return [
    ...operatorItems,
    ...adminItems,
    ...publicItems,
    { href: "/dashboard", label: user.email, detail: `${user.role} session`, cta: true }
  ];
}

function layout({ title, body, storeMode, user = null }) {
  const nav = navItemsFor(user)
    .map((item) => `<a class="${item.cta ? "nav-cta" : ""}" href="${escapeHtml(item.href)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail)}</small></a>`)
    .join("");

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
    <div class="app-layout">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="FuelUp home">
        <span class="brand-mark">Fu</span>
        <span><strong>FuelUp</strong><small>Trading OS</small></span>
      </a>
      <nav class="side-nav" aria-label="Primary navigation">
        ${nav}
      </nav>
      <div class="sidebar-card">
        <span class="signal"></span>
        <strong>Production posture</strong>
        <small>Render + PostgreSQL</small>
      </div>
    </aside>
    <div class="page-frame">
      <main class="app-shell">
        ${body}
      </main>
      <footer>
        <span>FuelUp trading platform</span>
        <span>Runtime: ${escapeHtml(storeMode)}</span>
      </footer>
    </div>
    </div>
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

function selfOnboardingPage({ storeMode, error = "", message = "", values = {} }) {
  return layout({
    title: "Join FuelUp",
    storeMode,
    body: `
      <section class="form-shell">
        <div class="form-grid">
          <aside class="order-context">
            <p class="eyebrow">Self-service onboarding</p>
            <h1>Create your tenant, first outlet, and operator account.</h1>
            <p>Use this path when a downstream organization wants to join FuelUp without waiting for an internal admin to create the tenant manually.</p>
          </aside>
          <section class="form-card">
            ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
            ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
            <form method="post" action="/self-onboarding">
              <h2>Organization</h2>
              <label>Organization name<input required name="organizationName" maxlength="160" value="${escapeHtml(values.organizationName || "")}"></label>
              <label>Organization email<input required type="email" name="organizationEmail" maxlength="160" value="${escapeHtml(values.organizationEmail || "")}"></label>

              <h2>First outlet</h2>
              <div class="field-row">
                <label>Outlet name<input required name="outletName" maxlength="160" value="${escapeHtml(values.outletName || "")}"></label>
                <label>City<input required name="city" maxlength="80" value="${escapeHtml(values.city || "")}"></label>
              </div>
              <label>Address<input required name="address" maxlength="240" value="${escapeHtml(values.address || "")}"></label>
              <label>Phone<input required name="phone" maxlength="40" value="${escapeHtml(values.phone || "")}"></label>

              <h2>First product</h2>
              <div class="field-row">
                <label>Product name<input required name="productName" maxlength="120" placeholder="PMS Petrol" value="${escapeHtml(values.productName || "")}"></label>
                <label>Unit<input required name="unit" maxlength="30" placeholder="litre" value="${escapeHtml(values.unit || "")}"></label>
              </div>
              <div class="field-row">
                <label>Price<input required type="number" name="price" min="1" step="0.01" value="${escapeHtml(values.price || "")}"></label>
                <label>Available quantity<input required type="number" name="availableQuantity" min="0" step="0.01" value="${escapeHtml(values.availableQuantity || "")}"></label>
              </div>

              <h2>Operator credentials</h2>
              <label>Your name<input required name="operatorName" maxlength="120" value="${escapeHtml(values.operatorName || "")}"></label>
              <label>Email<input required type="email" name="operatorEmail" maxlength="160" value="${escapeHtml(values.operatorEmail || "")}"></label>
              <label>Password<input required type="password" name="password" minlength="10" autocomplete="new-password"></label>
              <button class="button wide" type="submit">Create tenant account</button>
            </form>
          </section>
        </div>
      </section>
    `
  });
}

function marketplacePage(products, storeMode, user = null) {
  const openOutlets = new Set(products.filter((item) => item.is_open).map((item) => item.outlet_id)).size;
  const organizations = new Set(products.map((item) => item.organization_name)).size;
  const productCount = products.length;
  const lowestPrice = products.length ? Math.min(...products.map((item) => Number(item.price || 0))) : 0;

  const cards = products
    .map((product) => {
      const availabilityClass = Number(product.available_quantity) > 5000 ? "good" : "watch";
      return `
        <article class="listing-card">
          <div class="product-art">
            <img src="${escapeHtml(productImage(product.name))}" alt="${escapeHtml(product.name)} supply image" loading="lazy">
            <span>${productInitial(product.name)}</span>
          </div>
          <div class="listing-head">
            <div>
              <p class="eyebrow">${escapeHtml(product.organization_name)}</p>
              <h2>${escapeHtml(product.name)}</h2>
            </div>
            <span class="pill ${product.is_open ? "success" : "muted-pill"}">${product.is_open ? "Open" : "Closed"}</span>
          </div>
          <p class="station">${escapeHtml(product.outlet_name)}</p>
          <p class="muted">${escapeHtml(product.address)}, ${escapeHtml(product.city)}</p>
          <div class="listing-meta">
            <span>Verified outlet</span>
            <span>${escapeHtml(product.city)}</span>
            <span>${Number(product.available_quantity) > 0 ? "Stock live" : "Out of stock"}</span>
          </div>
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
          <h1>Order fuel from verified outlets with live stock, pricing, and fulfilment tracking.</h1>
          <p>FuelUp connects buyers to downstream oil and gas organizations while giving station operators a single control surface for orders, payments, inventory, and fulfilment.</p>
          <div class="hero-actions">
            <a class="button" href="#marketplace">Browse products</a>
            <a class="button secondary" href="/track">Track an order</a>
            <a class="button ghost" href="${user ? "/dashboard" : "/self-onboarding"}">${user ? "Open operations" : "Join as outlet"}</a>
          </div>
        </div>
        <aside class="market-preview" aria-label="Marketplace snapshot">
          <figure class="hero-media">
            <img src="${escapeHtml(heroImage())}" alt="Premium oil and gas terminal at dusk">
            <figcaption>Verified station supply network</figcaption>
          </figure>
          <div class="terminal-card">
            <div class="panel-top"><span class="signal"></span><strong>Live marketplace</strong></div>
            <dl>
              <div><dt>Organizations</dt><dd>${organizations}</dd></div>
              <div><dt>Open outlets</dt><dd>${openOutlets}</dd></div>
              <div><dt>Products listed</dt><dd>${productCount}</dd></div>
            </dl>
          </div>
          <div class="terminal-card accent-card">
            <span>From</span>
            <strong>${lowestPrice ? currency.format(lowestPrice) : "No price yet"}</strong>
            <small>per listed unit</small>
          </div>
          <div class="route-card">
            <span>Buyer</span><i></i><span>Outlet</span><i></i><span>Dispatch</span>
          </div>
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

      <section class="filter-bar" aria-label="Marketplace filters">
        <label>Product <select><option>All fuel products</option><option>PMS</option><option>AGO</option><option>LPG</option></select></label>
        <label>Location <input placeholder="City or area"></label>
        <label>Fulfilment <select><option>Pickup or delivery</option><option>Pickup</option><option>Delivery request</option></select></label>
        <button type="button">Search</button>
      </section>

      <section class="grid">
        ${cards || `<p class="empty-panel">No products are currently listed.</p>`}
      </section>
    `,
    user
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
            <ol class="checkout-steps" aria-label="Checkout steps">
              <li class="active"><span>1</span>Buyer</li>
              <li><span>2</span>Fulfilment</li>
              <li><span>3</span>Payment</li>
            </ol>
            <h2>Complete your reservation</h2>
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
              <p class="form-footnote">Payment can be completed after the outlet receives the reservation.</p>
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
        ${orderTimeline(order)}
        <div class="summary-card">
          <strong>${escapeHtml(order.order_reference || `Order #${order.id}`)}</strong>
          <span>Status: ${escapeHtml(statusLabel(order.status || "pending"))}</span>
          <span>Payment: ${escapeHtml(paymentLabel(order.payment_status || "unpaid"))}</span>
        </div>
        <div class="hero-actions">
          <form class="logout-form" method="post" action="/payments/paystack/initialize">
            <input type="hidden" name="orderReference" value="${escapeHtml(order.order_reference || "")}">
            <input type="hidden" name="buyerEmail" value="${escapeHtml(order.buyer_email || "")}">
            <button class="button" type="submit">Pay with Paystack</button>
          </form>
          <a class="button secondary" href="/track?orderReference=${encodeURIComponent(order.order_reference || "")}&buyerEmail=${encodeURIComponent(order.buyer_email || "")}">Track order</a>
          <a class="button secondary" href="/">Back to marketplace</a>
        </div>
      </section>
    `
  });
}

function trackOrderPage({ storeMode, order = null, error = "", message = "" }) {
  return layout({
    title: "Track Order",
    storeMode,
    body: `
      <section class="form-shell">
        <div class="form-grid">
          <aside class="order-context">
            <p class="eyebrow">Buyer self-service</p>
            <h1>Track or request cancellation</h1>
            <p>Use the order reference and buyer email from the reservation confirmation.</p>
          </aside>
          <section class="form-card">
            ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
            ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
            <form method="get" action="/track">
              <label>Order reference<input required name="orderReference" placeholder="FUP-000001" value="${escapeHtml(order?.order_reference || "")}"></label>
              <label>Buyer email<input required type="email" name="buyerEmail" placeholder="buyer@example.com" value="${escapeHtml(order?.buyer_email || "")}"></label>
              <button class="button wide" type="submit">Find order</button>
            </form>
            ${order ? `
              ${orderTimeline(order)}
              <div class="summary-card">
                <strong>${escapeHtml(order.order_reference)}</strong>
                <span>${escapeHtml(order.product_name)} - ${formatQuantity(order.quantity)} ${escapeHtml(order.unit)}</span>
                <span>Status: ${escapeHtml(statusLabel(order.status))} - Payment: ${escapeHtml(paymentLabel(order.payment_status || "unpaid"))}</span>
                <span>Outlet: ${escapeHtml(order.outlet_name)}</span>
                ${order.cancellation_requested ? `<span>Cancellation requested: ${escapeHtml(order.cancellation_reason || "")}</span>` : ""}
              </div>
              ${order.payment_status === "paid" ? `<p class="notice">Payment confirmed.</p>` : `
                <form method="post" action="/payments/paystack/initialize">
                  <input type="hidden" name="orderReference" value="${escapeHtml(order.order_reference)}">
                  <input type="hidden" name="buyerEmail" value="${escapeHtml(order.buyer_email)}">
                  <button class="button wide" type="submit">Pay with Paystack</button>
                </form>
              `}
              <form method="post" action="/orders/cancel-request">
                <input type="hidden" name="orderReference" value="${escapeHtml(order.order_reference)}">
                <input type="hidden" name="buyerEmail" value="${escapeHtml(order.buyer_email)}">
                <label>Cancellation reason<textarea required name="reason" maxlength="400" placeholder="Tell the outlet why you need to cancel"></textarea></label>
                <button class="button secondary wide" type="submit">Request cancellation</button>
              </form>
            ` : ""}
          </section>
        </div>
      </section>
    `
  });
}

function resetPasswordPage({ storeMode, token = "", error = "", message = "" }) {
  return layout({
    title: "Reset Password",
    storeMode,
    body: `
      <section class="auth-shell">
        <div class="auth-card">
          <p class="eyebrow">Account security</p>
          <h1>Reset password</h1>
          ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
          ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
          <form method="post" action="/reset-password">
            <input type="hidden" name="token" value="${escapeHtml(token)}">
            <label>New password<input required type="password" name="password" minlength="10"></label>
            <button class="button wide" type="submit">Set password</button>
          </form>
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
  const statuses = ["pending", "accepted", "ready", "completed", "cancelled"];
  const statusCounts = statuses.reduce((counts, status) => {
    counts[status] = orders.filter((order) => order.status === status).length;
    return counts;
  }, {});
  const cancellationCount = orders.filter((order) => order.cancellation_requested && !order.cancellation_decision).length;
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
                <form class="inline-form" method="post" action="/orders/${order.id}/payment">
                  <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
                  <select name="paymentStatus" aria-label="Payment status">
                    ${["unpaid", "invoice_sent", "paid", "refunded"]
                      .map((status) => `<option value="${status}" ${order.payment_status === status ? "selected" : ""}>${status}</option>`)
                      .join("")}
                  </select>
                  <button type="submit">Payment</button>
                </form>
                ${order.cancellation_requested && !order.cancellation_decision ? `
                  <form class="inline-form" method="post" action="/orders/${order.id}/cancellation">
                    <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
                    <select name="decision" aria-label="Cancellation decision">
                      <option value="approved">approve cancel</option>
                      <option value="rejected">reject cancel</option>
                    </select>
                    <input name="reason" placeholder="Decision reason">
                    <button type="submit">Decide</button>
                  </form>
                ` : ""}
              </td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No orders yet. Place one from the marketplace to test the flow.</td></tr>`;

  return layout({
    title: "Operations Dashboard",
    storeMode,
    user,
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

      <section class="queue-board" aria-label="Order queue">
        ${statuses.map((status) => `
          <article>
            <span class="status status-${status}">${escapeHtml(statusLabel(status))}</span>
            <strong>${statusCounts[status] || 0}</strong>
            <small>${status === "pending" ? "Needs acceptance" : status === "ready" ? "Awaiting handoff" : "Orders"}</small>
          </article>
        `).join("")}
        <article class="${cancellationCount ? "queue-alert" : ""}">
          <span class="status status-cancelled">Cancel review</span>
          <strong>${cancellationCount}</strong>
          <small>Buyer requests</small>
        </article>
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

function usersPage({ users, assignments = [], outlets = [], storeMode, message = "", error = "", user, csrfToken }) {
  const rows = users.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email)}</span></td>
      <td>${escapeHtml(item.role)}</td>
      <td>${item.is_active ? "Active" : "Disabled"}</td>
      <td>
        <form class="inline-form" method="post" action="/admin/users/${item.id}/active">
          <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
          <input type="hidden" name="isActive" value="${item.is_active ? "false" : "true"}">
          <button type="submit">${item.is_active ? "Disable" : "Enable"}</button>
        </form>
        <form class="inline-form" method="post" action="/admin/users/${item.id}/reset">
          <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
          <button type="submit">Reset</button>
        </form>
        <form class="inline-form" method="post" action="/admin/users/${item.id}/outlets">
          <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
          <select name="outletId" aria-label="Assign outlet">
            ${outlets.map((outlet) => `<option value="${outlet.id}">${escapeHtml(outlet.organization_name)} - ${escapeHtml(outlet.name)}</option>`).join("")}
          </select>
          <button type="submit">Assign</button>
        </form>
      </td>
    </tr>
  `).join("");
  const assignmentRows = assignments.map((item) => `
    <tr><td>${escapeHtml(item.user_email)}</td><td>${escapeHtml(item.organization_name || "")}</td><td>${escapeHtml(item.outlet_name)}</td></tr>
  `).join("");

  return layout({
    title: "Users",
    storeMode,
    user,
    body: `
      <section class="dashboard-head">
        <div><p class="eyebrow">Admin</p><h1>User management</h1><p>Signed in as ${escapeHtml(user.email)}.</p></div>
        <div class="hero-actions">
          <a class="button secondary" href="/onboarding">Onboard outlets</a>
          <a class="button secondary" href="/settlements">Settlements</a>
          <a class="button secondary" href="/notifications">Notification outbox</a>
        </div>
      </section>
      ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
      ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
      <section class="ops-grid">
        <div class="table-wrap">
          <table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Controls</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        <aside class="activity-panel">
          <p class="eyebrow">Create user</p>
          <form method="post" action="/admin/users">
            <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
            <label>Name<input required name="name"></label>
            <label>Email<input required type="email" name="email"></label>
            <label>Role<select name="role"><option value="operator">operator</option><option value="admin">admin</option></select></label>
            <label>Password<input required type="password" name="password" minlength="10"></label>
            <button class="button wide" type="submit">Create user</button>
          </form>
        </aside>
      </section>
      <section class="table-wrap spaced">
        <table><thead><tr><th>User</th><th>Organization</th><th>Outlet</th></tr></thead><tbody>${assignmentRows || `<tr><td colspan="3" class="empty">No outlet assignments yet.</td></tr>`}</tbody></table>
      </section>
    `
  });
}

function settlementsPage({ rows, filters, storeMode, user }) {
  const tableRows = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.order_reference)}</td>
      <td>${escapeHtml(row.buyer_email)}</td>
      <td>${escapeHtml(row.organization_name)} / ${escapeHtml(row.outlet_name)}</td>
      <td>${currency.format(row.total_amount || 0)}</td>
      <td>${escapeHtml(row.payment_reference || "")}</td>
      <td>${escapeHtml(row.paid_at || "")}</td>
    </tr>
  `).join("");
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  return layout({
    title: "Settlements",
    storeMode,
    user,
    body: `
      <section class="dashboard-head">
        <div><p class="eyebrow">Finance</p><h1>Settlement reconciliation</h1><p>Review paid orders and export settlement records.</p></div>
        <a class="button secondary" href="/settlements.csv${query ? `?${query}` : ""}">Export CSV</a>
      </section>
      <section class="form-card">
        <form class="field-row" method="get" action="/settlements">
          <label>From<input type="date" name="from" value="${escapeHtml(filters.from || "")}"></label>
          <label>To<input type="date" name="to" value="${escapeHtml(filters.to || "")}"></label>
          <button class="button" type="submit">Filter</button>
        </form>
      </section>
      <section class="table-wrap spaced">
        <table><thead><tr><th>Order</th><th>Buyer</th><th>Outlet</th><th>Amount</th><th>Reference</th><th>Paid at</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6" class="empty">No paid orders for this period.</td></tr>`}</tbody></table>
      </section>
    `
  });
}

function onboardingPage({ organizations, outlets, storeMode, message = "", error = "", user, csrfToken }) {
  return layout({
    title: "Onboarding",
    storeMode,
    user,
    body: `
      <section class="dashboard-head">
        <div><p class="eyebrow">Admin</p><h1>Organization and outlet onboarding</h1><p>Create operators' trading entities and products.</p></div>
        <a class="button secondary" href="/admin/users">User management</a>
      </section>
      ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
      ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
      <section class="admin-grid">
        <article class="form-card">
          <h2>Organization</h2>
          <form method="post" action="/organizations">
            <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
            <label>Name<input required name="name"></label>
            <label>Contact email<input required type="email" name="contactEmail"></label>
            <button class="button wide" type="submit">Create organization</button>
          </form>
        </article>
        <article class="form-card">
          <h2>Outlet</h2>
          <form method="post" action="/outlets">
            <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
            <label>Organization<select name="organizationId">${organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join("")}</select></label>
            <label>Name<input required name="name"></label>
            <label>City<input required name="city"></label>
            <label>Address<input required name="address"></label>
            <label>Phone<input required name="phone"></label>
            <label class="check-row"><input type="checkbox" name="isOpen" checked> Open for orders</label>
            <button class="button wide" type="submit">Create outlet</button>
          </form>
        </article>
        <article class="form-card">
          <h2>Product</h2>
          <form method="post" action="/products">
            <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
            <label>Outlet<select name="outletId">${outlets.map((outlet) => `<option value="${outlet.id}">${escapeHtml(outlet.organization_name)} - ${escapeHtml(outlet.name)}</option>`).join("")}</select></label>
            <label>Name<input required name="name" placeholder="PMS Petrol"></label>
            <label>Unit<input required name="unit" placeholder="litre"></label>
            <label>Price<input required type="number" name="price" min="1" step="0.01"></label>
            <label>Available quantity<input required type="number" name="availableQuantity" min="0" step="0.01"></label>
            <button class="button wide" type="submit">Create product</button>
          </form>
        </article>
      </section>
    `
  });
}

function inventoryPage({ products, auditEvents, storeMode, message = "", error = "", user, csrfToken }) {
  const lowStock = products.filter((product) => Number(product.available_quantity || 0) <= Number(product.low_stock_threshold || 0)).length;
  const totalStock = products.reduce((sum, product) => sum + Number(product.available_quantity || 0), 0);
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
              <label>
                Low alert
                <input required type="number" name="lowStockThreshold" min="0" step="0.01" value="${escapeHtml(product.low_stock_threshold || 0)}">
              </label>
              <label>
                Reason
                <input required name="adjustmentReason" placeholder="Adjustment reason">
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
    user,
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

      <section class="metrics-grid inventory-metrics">
        <article class="metric-card"><span>Products managed</span><strong>${products.length}</strong></article>
        <article class="metric-card"><span>Total available stock</span><strong>${formatQuantity(totalStock)}</strong></article>
        <article class="metric-card ${lowStock ? "metric-warning" : ""}"><span>Low stock alerts</span><strong>${lowStock}</strong></article>
        <article class="metric-card"><span>Control mode</span><strong>${escapeHtml(user.role)}</strong></article>
      </section>

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
  orderSuccessPage,
  onboardingPage,
  resetPasswordPage,
  selfOnboardingPage,
  settlementsPage,
  trackOrderPage,
  usersPage
};
