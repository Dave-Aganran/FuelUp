const crypto = require("crypto");

function logEvent(level, event, fields = {}) {
  const payload = {
    level,
    event,
    at: new Date().toISOString(),
    ...fields
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function requestLogger(request, response, next) {
  const startedAt = Date.now();
  const requestId = request.headers["x-request-id"] || crypto.randomUUID();
  request.id = requestId;
  response.setHeader("x-request-id", requestId);

  response.on("finish", () => {
    logEvent("info", "http.request", {
      requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode: response.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
}

module.exports = { logEvent, requestLogger };
