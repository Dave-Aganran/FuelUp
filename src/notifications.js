const { logEvent } = require("./logger");

function orderCreatedNotification(order) {
  return {
    recipientEmail: order.buyer_email,
    subject: `FuelUp order ${order.order_reference} received`,
    body: `Your FuelUp order ${order.order_reference} was received and is pending outlet confirmation.`
  };
}

function orderStatusNotification(order) {
  return {
    recipientEmail: order.buyer_email,
    subject: `FuelUp order ${order.order_reference} status updated`,
    body: `Your FuelUp order ${order.order_reference} is now ${order.status}.`
  };
}

function paymentNotification(order) {
  return {
    recipientEmail: order.buyer_email,
    subject: `FuelUp order ${order.order_reference} payment updated`,
    body: `Payment for FuelUp order ${order.order_reference} is now ${order.payment_status}.`
  };
}

async function dispatchNotification(store, config, notification) {
  const event = await store.createNotification(notification);

  if (!config.notificationWebhookUrl) {
    logEvent("info", "notification.queued", {
      notificationId: event.id,
      recipientEmail: notification.recipientEmail,
      subject: notification.subject
    });
    return event;
  }

  try {
    const response = await fetch(config.notificationWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.notificationFromEmail,
        to: notification.recipientEmail,
        subject: notification.subject,
        body: notification.body
      })
    });
    const text = await response.text();
    await store.updateNotificationStatus(event.id, response.ok ? "sent" : "failed", { status: response.status, body: text });
  } catch (error) {
    await store.updateNotificationStatus(event.id, "failed", { error: error.message });
  }

  return event;
}

module.exports = {
  dispatchNotification,
  orderCreatedNotification,
  orderStatusNotification,
  paymentNotification
};
