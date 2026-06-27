function createDemoPaymentReference(order) {
  return `DEMO-${order.order_reference}-${Date.now()}`;
}

function initializeDemoPayment(order) {
  const reference = createDemoPaymentReference(order);
  return {
    provider: "demo",
    reference,
    amount: Math.round(Number(order.total_amount || 0) * 100),
    authorizationUrl: `/payments/demo/confirm?reference=${encodeURIComponent(reference)}`,
    providerResponse: {
      status: true,
      message: "Demo payment initialized",
      reference
    }
  };
}

module.exports = { initializeDemoPayment };
