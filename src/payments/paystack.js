const crypto = require("crypto");

function paystackAmount(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function isConfigured(config) {
  return Boolean(config.paystackSecretKey);
}

function createPaymentReference(order) {
  return `${order.order_reference}-${Date.now()}`;
}

async function initializePaystackPayment(order, config) {
  if (!isConfigured(config)) {
    const error = new Error("Paystack is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const reference = createPaymentReference(order);
  const amount = paystackAmount(order.total_amount);

  if (config.paystackSecretKey === "sk_test_mock") {
    return {
      provider: "paystack",
      reference,
      amount,
      authorizationUrl: `${config.paystackCallbackUrl || "/payments/paystack/callback"}?reference=${reference}`,
      providerResponse: { status: true, message: "Mock Paystack authorization" }
    };
  }

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.paystackSecretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: order.buyer_email,
      amount,
      reference,
      callback_url: config.paystackCallbackUrl || undefined,
      metadata: {
        orderReference: order.order_reference,
        orderId: order.id
      }
    })
  });

  const payload = await response.json();
  if (!response.ok || !payload.status) {
    const error = new Error(payload.message || "Unable to initialize Paystack payment.");
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: "paystack",
    reference,
    amount,
    authorizationUrl: payload.data.authorization_url,
    providerResponse: payload
  };
}

async function verifyPaystackReference(reference, config) {
  if (config.paystackSecretKey === "sk_test_mock") {
    return {
      status: true,
      data: {
        status: "success",
        reference,
        amount: 0,
        currency: "NGN"
      }
    };
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.paystackSecretKey}` }
  });
  const payload = await response.json();
  if (!response.ok || !payload.status) {
    const error = new Error(payload.message || "Unable to verify Paystack payment.");
    error.statusCode = 502;
    throw error;
  }
  return payload;
}

function verifyPaystackWebhook(rawBody, signature, secretKey) {
  if (!secretKey || !signature) {
    return false;
  }
  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  initializePaystackPayment,
  paystackAmount,
  verifyPaystackReference,
  verifyPaystackWebhook
};
