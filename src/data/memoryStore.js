const organizations = [
  { id: 1, name: "Northstar Energy Services", contact_email: "ops@northstar.example" },
  { id: 2, name: "Lagos Prime Fuels", contact_email: "support@lagosprime.example" }
];

const outlets = [
  {
    id: 1,
    organization_id: 1,
    organization_name: "Northstar Energy Services",
    name: "Northstar Lekki Phase 1",
    city: "Lagos",
    address: "Admiralty Way, Lekki Phase 1",
    phone: "+234 800 100 1001",
    is_open: true
  },
  {
    id: 2,
    organization_id: 1,
    organization_name: "Northstar Energy Services",
    name: "Northstar Victoria Island",
    city: "Lagos",
    address: "Ahmadu Bello Way, VI",
    phone: "+234 800 100 1002",
    is_open: true
  },
  {
    id: 3,
    organization_id: 2,
    organization_name: "Lagos Prime Fuels",
    name: "Lagos Prime Ikeja",
    city: "Lagos",
    address: "Obafemi Awolowo Way, Ikeja",
    phone: "+234 800 200 2001",
    is_open: true
  }
];

const products = [
  { id: 1, outlet_id: 1, name: "PMS Petrol", unit: "litre", price: 720, available_quantity: 18000 },
  { id: 2, outlet_id: 1, name: "AGO Diesel", unit: "litre", price: 1120, available_quantity: 9000 },
  { id: 3, outlet_id: 2, name: "PMS Petrol", unit: "litre", price: 725, available_quantity: 12000 },
  { id: 4, outlet_id: 2, name: "LPG Cooking Gas", unit: "kg", price: 1250, available_quantity: 2200 },
  { id: 5, outlet_id: 3, name: "AGO Diesel", unit: "litre", price: 1115, available_quantity: 16000 },
  { id: 6, outlet_id: 3, name: "Engine Oil 5W-30", unit: "bottle", price: 8500, available_quantity: 140 }
];

const orders = [];
const users = [];
const auditEvents = [];
const notificationEvents = [];
const userOutlets = [];

function orderReference(id) {
  return `FUP-${String(id).padStart(6, "0")}`;
}

function withOutletAndOrganization(product) {
  const outlet = outlets.find((item) => item.id === product.outlet_id);
  return {
    ...product,
    outlet_name: outlet.name,
    city: outlet.city,
    address: outlet.address,
    phone: outlet.phone,
    is_open: outlet.is_open,
    organization_name: outlet.organization_name
  };
}

function withOrderDetails(order) {
  const product = products.find((item) => item.id === order.product_id);
  const outlet = outlets.find((item) => item.id === order.outlet_id);
  return {
    ...order,
    product_name: product.name,
    unit: product.unit,
    price: product.price,
    outlet_name: outlet.name,
    organization_name: outlet.organization_name
  };
}

function createMemoryStore() {
  function recordAuditEvent(input) {
    const event = {
      id: auditEvents.length + 1,
      actor_user_id: input.actor?.id || null,
      actor_email: input.actor?.email || "",
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      details: input.details || {},
      created_at: new Date().toISOString()
    };
    auditEvents.push(event);
    return event;
  }

  return {
    mode: "memory",

    async listMarketplace() {
      return products.map(withOutletAndOrganization);
    },

    async getOrderContext(outletId, productId) {
      const product = products.find((item) => item.id === productId && item.outlet_id === outletId);
      if (!product) {
        return null;
      }
      return withOutletAndOrganization(product);
    },

    async createOrder(input) {
      const product = products.find((item) => item.id === input.productId && item.outlet_id === input.outletId);
      if (!product) {
        throw new Error("Selected product is no longer available.");
      }

      if (Number(input.quantity) > Number(product.available_quantity)) {
        throw new Error("Requested quantity is above available outlet stock.");
      }

      product.available_quantity = Number(product.available_quantity) - Number(input.quantity);

      const order = {
        id: orders.length + 1,
        order_reference: orderReference(orders.length + 1),
        outlet_id: input.outletId,
        product_id: input.productId,
        buyer_name: input.buyerName,
        buyer_phone: input.buyerPhone,
        buyer_email: input.buyerEmail,
        quantity: Number(input.quantity),
        fulfillment_method: input.fulfillmentMethod,
        delivery_address: input.deliveryAddress || "",
        notes: input.notes || "",
        unit_price: Number(product.price),
        total_amount: Number(product.price) * Number(input.quantity),
        payment_status: "unpaid",
        payment_provider: "",
        payment_reference: "",
        paid_at: null,
        payment_payload: null,
        cancellation_requested: false,
        cancellation_reason: "",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      orders.push(order);
      return withOrderDetails(order);
    },

    async listOrders(user) {
      const allowedOutletIds = user?.role === "operator"
        ? userOutlets.filter((item) => item.user_id === user.id).map((item) => item.outlet_id)
        : null;
      return orders
        .filter((order) => !allowedOutletIds || allowedOutletIds.includes(order.outlet_id))
        .slice()
        .reverse()
        .map(withOrderDetails);
    },

    async listInventory(user) {
      const allowedOutletIds = user?.role === "operator"
        ? userOutlets.filter((item) => item.user_id === user.id).map((item) => item.outlet_id)
        : null;
      return products
        .filter((product) => !allowedOutletIds || allowedOutletIds.includes(product.outlet_id))
        .map(withOutletAndOrganization);
    },

    async updateInventory(productId, input, actor) {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        throw new Error("Product not found.");
      }

      const before = {
        price: Number(product.price),
        available_quantity: Number(product.available_quantity)
      };

      product.price = Number(input.price);
      product.available_quantity = Number(input.availableQuantity);

      recordAuditEvent({
        actor,
        entityType: "product",
        entityId: product.id,
        action: "inventory.updated",
        details: { before, after: { price: product.price, available_quantity: product.available_quantity } }
      });

      return withOutletAndOrganization(product);
    },

    async getDashboardSummary(user) {
      const visibleOrders = await this.listOrders(user);
      const totalOrders = visibleOrders.length;
      const pendingOrders = visibleOrders.filter((item) => item.status === "pending").length;
      const completedOrders = visibleOrders.filter((item) => item.status === "completed").length;
      const totalValue = visibleOrders.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      return { totalOrders, pendingOrders, completedOrders, totalValue };
    },

    async findUserByEmail(email) {
      return users.find((item) => item.email === email && item.is_active) || null;
    },

    async findUserById(id) {
      return users.find((item) => item.id === id && item.is_active) || null;
    },

    async listUsers() {
      return users.slice().sort((a, b) => a.email.localeCompare(b.email));
    },

    async setUserActive(userId, isActive, actor) {
      const user = users.find((item) => item.id === userId);
      if (!user) throw new Error("User not found.");
      user.is_active = isActive;
      user.updated_at = new Date().toISOString();
      recordAuditEvent({ actor, entityType: "user", entityId: userId, action: isActive ? "user.enabled" : "user.disabled", details: { email: user.email } });
      return user;
    },

    async upsertUser(input) {
      const existing = users.find((item) => item.email === input.email);
      if (existing) {
        Object.assign(existing, {
          name: input.name,
          password_hash: input.passwordHash,
          role: input.role,
          is_active: true,
          updated_at: new Date().toISOString()
        });
        return existing;
      }

      const user = {
        id: users.length + 1,
        email: input.email,
        name: input.name,
        password_hash: input.passwordHash,
        role: input.role,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      users.push(user);
      return user;
    },

    async assignUserOutlet(userId, outletId, actor) {
      if (!users.find((item) => item.id === userId)) throw new Error("User not found.");
      if (!outlets.find((item) => item.id === outletId)) throw new Error("Outlet not found.");
      if (!userOutlets.find((item) => item.user_id === userId && item.outlet_id === outletId)) {
        userOutlets.push({ user_id: userId, outlet_id: outletId, created_at: new Date().toISOString() });
      }
      recordAuditEvent({ actor, entityType: "user", entityId: userId, action: "user.outlet_assigned", details: { outletId } });
    },

    async listUserOutletAssignments() {
      return userOutlets.map((assignment) => {
        const user = users.find((item) => item.id === assignment.user_id);
        const outlet = outlets.find((item) => item.id === assignment.outlet_id);
        return { ...assignment, user_email: user?.email || "", outlet_name: outlet?.name || "" };
      });
    },

    async listOrganizations() {
      return organizations.slice();
    },

    async listOutlets() {
      return outlets.slice();
    },

    async createOrganization(input, actor) {
      const organization = {
        id: organizations.length + 1,
        name: input.name,
        contact_email: input.contactEmail,
        created_at: new Date().toISOString()
      };
      organizations.push(organization);
      recordAuditEvent({ actor, entityType: "organization", entityId: organization.id, action: "organization.created", details: organization });
      return organization;
    },

    async createOutlet(input, actor) {
      const organization = organizations.find((item) => item.id === input.organizationId);
      if (!organization) throw new Error("Organization not found.");
      const outlet = {
        id: outlets.length + 1,
        organization_id: organization.id,
        organization_name: organization.name,
        name: input.name,
        city: input.city,
        address: input.address,
        phone: input.phone,
        is_open: input.isOpen
      };
      outlets.push(outlet);
      recordAuditEvent({ actor, entityType: "outlet", entityId: outlet.id, action: "outlet.created", details: outlet });
      return outlet;
    },

    async createProduct(input, actor) {
      const outlet = outlets.find((item) => item.id === input.outletId);
      if (!outlet) throw new Error("Outlet not found.");
      const product = {
        id: products.length + 1,
        outlet_id: outlet.id,
        name: input.name,
        unit: input.unit,
        price: Number(input.price),
        available_quantity: Number(input.availableQuantity)
      };
      products.push(product);
      recordAuditEvent({ actor, entityType: "product", entityId: product.id, action: "product.created", details: product });
      return withOutletAndOrganization(product);
    },

    async findOrderForBuyer(reference, buyerEmail) {
      const order = orders.find(
        (item) => item.order_reference === reference && item.buyer_email === buyerEmail
      );
      return order ? withOrderDetails(order) : null;
    },

    async requestCancellation(reference, buyerEmail, reason) {
      const order = orders.find(
        (item) => item.order_reference === reference && item.buyer_email === buyerEmail
      );
      if (!order) throw new Error("Order not found.");
      order.cancellation_requested = true;
      order.cancellation_reason = reason;
      order.updated_at = new Date().toISOString();
      recordAuditEvent({
        actor: { email: buyerEmail },
        entityType: "order",
        entityId: order.id,
        action: "order.cancellation_requested",
        details: { order_reference: reference, reason }
      });
      return withOrderDetails(order);
    },

    async updatePaymentStatus(orderId, paymentStatus, actor) {
      const order = orders.find((item) => item.id === orderId);
      if (!order) throw new Error("Order not found.");
      const previous = order.payment_status || "unpaid";
      order.payment_status = paymentStatus;
      order.updated_at = new Date().toISOString();
      recordAuditEvent({
        actor,
        entityType: "order",
        entityId: order.id,
        action: "order.payment_updated",
        details: { from: previous, to: paymentStatus, order_reference: order.order_reference }
      });
      return withOrderDetails(order);
    },

    async listSettlementRows() {
      return orders
        .filter((order) => order.payment_status === "paid")
        .map(withOrderDetails);
    },

    async createNotification(input) {
      const event = {
        id: notificationEvents.length + 1,
        recipient_email: input.recipientEmail,
        subject: input.subject,
        body: input.body,
        channel: "email",
        status: "queued",
        provider_response: null,
        created_at: new Date().toISOString(),
        sent_at: null
      };
      notificationEvents.push(event);
      return event;
    },

    async updateNotificationStatus(id, status, providerResponse) {
      const event = notificationEvents.find((item) => item.id === id);
      if (!event) throw new Error("Notification not found.");
      event.status = status;
      event.provider_response = providerResponse || null;
      event.sent_at = status === "sent" ? new Date().toISOString() : null;
      return event;
    },

    async listNotifications(limit = 20) {
      return notificationEvents.slice().reverse().slice(0, limit);
    },

    async prepareOrderPayment(reference, buyerEmail, payment) {
      const order = orders.find(
        (item) => item.order_reference === reference && item.buyer_email === buyerEmail
      );
      if (!order) throw new Error("Order not found.");
      order.payment_status = "invoice_sent";
      order.payment_provider = "paystack";
      order.payment_reference = payment.reference;
      order.payment_payload = payment.providerResponse;
      order.updated_at = new Date().toISOString();
      recordAuditEvent({
        actor: { email: buyerEmail },
        entityType: "order",
        entityId: order.id,
        action: "order.payment_initialized",
        details: { order_reference: order.order_reference, payment_reference: payment.reference }
      });
      return withOrderDetails(order);
    },

    async findOrderByPaymentReference(paymentReference) {
      const order = orders.find((item) => item.payment_reference === paymentReference);
      return order ? withOrderDetails(order) : null;
    },

    async markPaymentPaid(paymentReference, payload) {
      const order = orders.find((item) => item.payment_reference === paymentReference);
      if (!order) throw new Error("Order not found.");
      order.payment_status = "paid";
      order.paid_at = new Date().toISOString();
      order.payment_payload = payload;
      order.updated_at = new Date().toISOString();
      recordAuditEvent({
        actor: { email: "paystack" },
        entityType: "order",
        entityId: order.id,
        action: "order.payment_paid",
        details: { order_reference: order.order_reference, payment_reference: paymentReference }
      });
      return withOrderDetails(order);
    },

    async listAuditEvents(limit = 12) {
      return auditEvents.slice().reverse().slice(0, limit);
    },

    async updateOrderStatus(orderId, status, actor) {
      const order = orders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error("Order not found.");
      }
      const previousStatus = order.status;
      order.status = status;
      order.updated_at = new Date().toISOString();
      recordAuditEvent({
        actor,
        entityType: "order",
        entityId: order.id,
        action: "order.status_updated",
        details: { from: previousStatus, to: status, order_reference: order.order_reference }
      });
      return withOrderDetails(order);
    }
  };
}

module.exports = { createMemoryStore };
