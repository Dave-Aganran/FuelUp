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
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      orders.push(order);
      return withOrderDetails(order);
    },

    async listOrders() {
      return orders.slice().reverse().map(withOrderDetails);
    },

    async listInventory() {
      return products.map(withOutletAndOrganization);
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

    async getDashboardSummary() {
      const totalOrders = orders.length;
      const pendingOrders = orders.filter((item) => item.status === "pending").length;
      const completedOrders = orders.filter((item) => item.status === "completed").length;
      const totalValue = orders.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      return { totalOrders, pendingOrders, completedOrders, totalValue };
    },

    async findUserByEmail(email) {
      return users.find((item) => item.email === email && item.is_active) || null;
    },

    async findUserById(id) {
      return users.find((item) => item.id === id && item.is_active) || null;
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
