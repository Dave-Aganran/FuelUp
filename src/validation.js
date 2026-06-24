const allowedFulfillmentMethods = new Set(["pickup", "delivery"]);
const allowedStatuses = new Set(["pending", "accepted", "ready", "completed", "cancelled"]);

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

module.exports = {
  allowedStatuses,
  normalizeOrderInput,
  normalizeStatus
};
