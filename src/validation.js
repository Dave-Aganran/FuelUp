const allowedFulfillmentMethods = new Set(["pickup", "delivery"]);
const allowedStatuses = new Set(["pending", "accepted", "ready", "completed", "cancelled"]);
const allowedPaymentStatuses = new Set(["unpaid", "invoice_sent", "paid", "refunded"]);
const allowedRoles = new Set(["admin", "operator"]);

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanLongText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeOrderInput(body) {
  const quantity = Number(body.quantity);
  const input = {
    outletId: Number(body.outletId),
    productId: Number(body.productId),
    buyerName: cleanText(body.buyerName, 120),
    buyerPhone: cleanText(body.buyerPhone, 40),
    buyerEmail: cleanText(body.buyerEmail, 160).toLowerCase(),
    quantity,
    fulfillmentMethod: cleanText(body.fulfillmentMethod, 20),
    deliveryAddress: cleanLongText(body.deliveryAddress, 400),
    notes: cleanLongText(body.notes, 500)
  };

  const errors = [];
  if (!Number.isInteger(input.outletId) || input.outletId < 1) {
    errors.push("Choose a valid outlet.");
  }
  if (!Number.isInteger(input.productId) || input.productId < 1) {
    errors.push("Choose a valid product.");
  }
  if (input.buyerName.length < 2) {
    errors.push("Buyer name is required.");
  }
  if (input.buyerPhone.length < 7) {
    errors.push("A valid phone number is required.");
  }
  if (!isEmail(input.buyerEmail)) {
    errors.push("A valid buyer email is required.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.push("Quantity must be greater than zero.");
  }
  if (Number.isFinite(input.quantity) && input.quantity > 1000000) {
    errors.push("Quantity is above the maximum allowed order size.");
  }
  if (!allowedFulfillmentMethods.has(input.fulfillmentMethod)) {
    errors.push("Choose pickup or delivery.");
  }
  if (input.fulfillmentMethod === "delivery" && input.deliveryAddress.length < 8) {
    errors.push("Delivery address is required for delivery requests.");
  }

  return { input, errors };
}

function normalizeStatus(value) {
  const status = cleanText(value, 20);
  if (!allowedStatuses.has(status)) {
    return null;
  }
  return status;
}

function normalizePaymentStatus(value) {
  const status = cleanText(value, 20);
  if (!allowedPaymentStatuses.has(status)) {
    return null;
  }
  return status;
}

function normalizeInventoryInput(body) {
  const price = Number(body.price);
  const availableQuantity = Number(body.availableQuantity);
  const input = { price, availableQuantity };
  const errors = [];

  if (!Number.isFinite(price) || price <= 0) {
    errors.push("Price must be greater than zero.");
  }
  if (Number.isFinite(price) && price > 100000000) {
    errors.push("Price is above the allowed limit.");
  }
  if (!Number.isFinite(availableQuantity) || availableQuantity < 0) {
    errors.push("Available quantity cannot be negative.");
  }
  if (Number.isFinite(availableQuantity) && availableQuantity > 100000000) {
    errors.push("Available quantity is above the allowed limit.");
  }

  return { input, errors };
}

function normalizeUserInput(body) {
  const input = {
    name: cleanText(body.name, 120),
    email: cleanText(body.email, 160).toLowerCase(),
    role: cleanText(body.role, 20),
    password: String(body.password || "")
  };
  const errors = [];

  if (input.name.length < 2) errors.push("User name is required.");
  if (!isEmail(input.email)) errors.push("A valid user email is required.");
  if (!allowedRoles.has(input.role)) errors.push("Choose admin or operator role.");
  if (input.password.length < 10) errors.push("Password must be at least 10 characters.");

  return { input, errors };
}

function normalizeOrganizationInput(body) {
  const input = {
    name: cleanText(body.name, 160),
    contactEmail: cleanText(body.contactEmail, 160).toLowerCase()
  };
  const errors = [];
  if (input.name.length < 2) errors.push("Organization name is required.");
  if (!isEmail(input.contactEmail)) errors.push("A valid contact email is required.");
  return { input, errors };
}

function normalizeOutletInput(body) {
  const input = {
    organizationId: Number(body.organizationId),
    name: cleanText(body.name, 160),
    city: cleanText(body.city, 80),
    address: cleanText(body.address, 240),
    phone: cleanText(body.phone, 40),
    isOpen: body.isOpen === "on" || body.isOpen === "true"
  };
  const errors = [];
  if (!Number.isInteger(input.organizationId) || input.organizationId < 1) errors.push("Choose a valid organization.");
  if (input.name.length < 2) errors.push("Outlet name is required.");
  if (input.city.length < 2) errors.push("City is required.");
  if (input.address.length < 5) errors.push("Address is required.");
  if (input.phone.length < 7) errors.push("Phone number is required.");
  return { input, errors };
}

function normalizeProductInput(body) {
  const input = {
    outletId: Number(body.outletId),
    name: cleanText(body.name, 120),
    unit: cleanText(body.unit, 30),
    price: Number(body.price),
    availableQuantity: Number(body.availableQuantity)
  };
  const errors = [];
  if (!Number.isInteger(input.outletId) || input.outletId < 1) errors.push("Choose a valid outlet.");
  if (input.name.length < 2) errors.push("Product name is required.");
  if (input.unit.length < 1) errors.push("Unit is required.");
  if (!Number.isFinite(input.price) || input.price <= 0) errors.push("Price must be greater than zero.");
  if (!Number.isFinite(input.availableQuantity) || input.availableQuantity < 0) {
    errors.push("Available quantity cannot be negative.");
  }
  return { input, errors };
}

function normalizeCancellationInput(body) {
  const input = {
    orderReference: cleanText(body.orderReference, 40).toUpperCase(),
    buyerEmail: cleanText(body.buyerEmail, 160).toLowerCase(),
    reason: cleanLongText(body.reason, 400)
  };
  const errors = [];
  if (!input.orderReference.startsWith("FUP-")) errors.push("Enter a valid FuelUp order reference.");
  if (!isEmail(input.buyerEmail)) errors.push("A valid buyer email is required.");
  if (input.reason.length < 5) errors.push("Cancellation reason is required.");
  return { input, errors };
}

module.exports = {
  allowedPaymentStatuses,
  allowedStatuses,
  normalizeCancellationInput,
  normalizeInventoryInput,
  normalizeOrganizationInput,
  normalizeOrderInput,
  normalizeOutletInput,
  normalizePaymentStatus,
  normalizeProductInput,
  normalizeStatus,
  normalizeUserInput
};
