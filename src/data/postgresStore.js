const crypto = require("crypto");

function createReference() {
  return `FUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function createPostgresStore(pool) {
  async function assertActorCanAccessProduct(client, productId, actor) {
    if (!actor || actor.role === "admin") return;
    const { rowCount } = await client.query(
      `
        SELECT 1
        FROM products p
        JOIN user_outlets uo ON uo.outlet_id = p.outlet_id
        WHERE p.id = $1 AND uo.user_id = $2
      `,
      [productId, actor.id]
    );
    if (rowCount === 0) {
      const error = new Error("You do not have access to this outlet.");
      error.statusCode = 403;
      throw error;
    }
  }

  async function assertActorCanAccessOrder(client, orderId, actor) {
    if (!actor || actor.role === "admin") return;
    const { rowCount } = await client.query(
      `
        SELECT 1
        FROM orders ord
        JOIN user_outlets uo ON uo.outlet_id = ord.outlet_id
        WHERE ord.id = $1 AND uo.user_id = $2
      `,
      [orderId, actor.id]
    );
    if (rowCount === 0) {
      const error = new Error("You do not have access to this outlet.");
      error.statusCode = 403;
      throw error;
    }
  }

  return {
    mode: "postgres",

    async listMarketplace() {
      const { rows } = await pool.query(`
        SELECT
          p.id,
          p.outlet_id,
          p.name,
          p.unit,
          p.price::float,
          p.available_quantity::float,
          p.low_stock_threshold::float,
          o.name AS outlet_name,
          o.city,
          o.address,
          o.phone,
          o.is_open,
          org.name AS organization_name
        FROM products p
        JOIN outlets o ON o.id = p.outlet_id
        JOIN organizations org ON org.id = o.organization_id
        ORDER BY o.city, o.name, p.name
      `);
      return rows;
    },

    async getOrderContext(outletId, productId) {
      const { rows } = await pool.query(
        `
          SELECT
            p.id,
            p.outlet_id,
            p.name,
            p.unit,
            p.price::float,
            p.available_quantity::float,
            p.low_stock_threshold::float,
            o.name AS outlet_name,
            o.city,
            o.address,
            o.phone,
            o.is_open,
            org.name AS organization_name
          FROM products p
          JOIN outlets o ON o.id = p.outlet_id
          JOIN organizations org ON org.id = o.organization_id
          WHERE p.id = $1 AND p.outlet_id = $2
        `,
        [productId, outletId]
      );
      return rows[0] || null;
    },

    async createOrder(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const productResult = await client.query(
          "SELECT price::float, available_quantity::float FROM products WHERE id = $1 AND outlet_id = $2 FOR UPDATE",
          [input.productId, input.outletId]
        );

        if (productResult.rowCount === 0) {
          throw new Error("Selected product is no longer available.");
        }

        const availableQuantity = Number(productResult.rows[0].available_quantity);
        const unitPrice = Number(productResult.rows[0].price);
        if (Number(input.quantity) > availableQuantity) {
          throw new Error("Requested quantity is above available outlet stock.");
        }

        const orderResult = await client.query(
          `
            INSERT INTO orders (
              outlet_id,
              product_id,
              buyer_name,
              buyer_phone,
              buyer_email,
              quantity,
              fulfillment_method,
              delivery_address,
              notes,
              order_reference,
              unit_price,
              total_amount
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `,
          [
            input.outletId,
            input.productId,
            input.buyerName,
            input.buyerPhone,
            input.buyerEmail,
            input.quantity,
            input.fulfillmentMethod,
            input.deliveryAddress || null,
            input.notes || null,
            createReference(),
            unitPrice,
            unitPrice * Number(input.quantity)
          ]
        );

        await client.query(
          "UPDATE products SET available_quantity = available_quantity - $1, updated_at = NOW() WHERE id = $2",
          [input.quantity, input.productId]
        );

        await client.query("COMMIT");
        return orderResult.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listOrders(user) {
      const scopeJoin = user?.role === "operator" ? "JOIN user_outlets uo ON uo.outlet_id = ord.outlet_id AND uo.user_id = $1" : "";
      const params = user?.role === "operator" ? [user.id] : [];
      const { rows } = await pool.query(`
        SELECT
          ord.id,
          ord.order_reference,
          ord.buyer_name,
          ord.buyer_phone,
          ord.buyer_email,
          ord.quantity::float,
          ord.fulfillment_method,
          ord.delivery_address,
          ord.notes,
          ord.unit_price::float,
          ord.total_amount::float,
          ord.payment_status,
          ord.payment_provider,
          ord.payment_reference,
          ord.paid_at,
          ord.payment_payload,
          ord.cancellation_requested,
          ord.cancellation_reason,
          ord.status,
          ord.created_at,
          ord.updated_at,
          p.name AS product_name,
          p.unit,
          p.price::float,
          o.name AS outlet_name,
          org.name AS organization_name
        FROM orders ord
        JOIN products p ON p.id = ord.product_id
        JOIN outlets o ON o.id = ord.outlet_id
        JOIN organizations org ON org.id = o.organization_id
        ${scopeJoin}
        ORDER BY ord.created_at DESC
      `, params);
      return rows;
    },

    async listInventory(user) {
      const scopeJoin = user?.role === "operator" ? "JOIN user_outlets uo ON uo.outlet_id = p.outlet_id AND uo.user_id = $1" : "";
      const params = user?.role === "operator" ? [user.id] : [];
      const { rows } = await pool.query(`
        SELECT
          p.id,
          p.outlet_id,
          p.name,
          p.unit,
          p.price::float,
          p.available_quantity::float,
          p.low_stock_threshold::float,
          p.updated_at,
          o.name AS outlet_name,
          o.city,
          o.address,
          o.phone,
          o.is_open,
          org.name AS organization_name
        FROM products p
        JOIN outlets o ON o.id = p.outlet_id
        JOIN organizations org ON org.id = o.organization_id
        ${scopeJoin}
        ORDER BY org.name, o.name, p.name
      `, params);
      return rows;
    },

    async recordAuditEvent(input) {
      const { rows } = await pool.query(
        `
          INSERT INTO audit_events (actor_user_id, actor_email, entity_type, entity_id, action, details)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          input.actor?.id || null,
          input.actor?.email || null,
          input.entityType,
          input.entityId || null,
          input.action,
          JSON.stringify(input.details || {})
        ]
      );
      return rows[0];
    },

    async updateInventory(productId, input, actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await assertActorCanAccessProduct(client, productId, actor);
        const current = await client.query(
          "SELECT id, price::float, available_quantity::float, low_stock_threshold::float FROM products WHERE id = $1 FOR UPDATE",
          [productId]
        );
        if (current.rowCount === 0) {
          throw new Error("Product not found.");
        }

        const before = current.rows[0];
        const currentStock = Number(before.available_quantity);
        const nextStock = input.adjustmentMode === "add"
          ? currentStock + Number(input.adjustmentQuantity)
          : input.adjustmentMode === "remove"
            ? currentStock - Number(input.adjustmentQuantity)
            : Number(input.availableQuantity);
        if (nextStock < 0) {
          throw new Error("Stock cannot be reduced below zero.");
        }
        const updated = await client.query(
          `
            UPDATE products
            SET price = $1, available_quantity = $2, low_stock_threshold = $3, updated_at = NOW()
            WHERE id = $4
            RETURNING id, price::float, available_quantity::float, low_stock_threshold::float, updated_at
          `,
          [input.price, nextStock, input.lowStockThreshold || 0, productId]
        );

        await client.query(
          `
            INSERT INTO audit_events (actor_user_id, actor_email, entity_type, entity_id, action, details)
            VALUES ($1, $2, 'product', $3, 'inventory.updated', $4)
          `,
          [
            actor?.id || null,
            actor?.email || null,
            productId,
            JSON.stringify({
              before: {
                price: before.price,
                available_quantity: before.available_quantity,
                low_stock_threshold: before.low_stock_threshold
              },
              after: {
                price: updated.rows[0].price,
                available_quantity: updated.rows[0].available_quantity,
                low_stock_threshold: updated.rows[0].low_stock_threshold
              },
              adjustment: {
                mode: input.adjustmentMode,
                quantity: Number(input.adjustmentQuantity || 0)
              },
              reason: input.adjustmentReason
            })
          ]
        );

        await client.query("COMMIT");
        return updated.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getDashboardSummary(user) {
      const scopeJoin = user?.role === "operator" ? "JOIN user_outlets uo ON uo.outlet_id = orders.outlet_id AND uo.user_id = $1" : "";
      const params = user?.role === "operator" ? [user.id] : [];
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS "totalOrders",
          COUNT(*) FILTER (WHERE status = 'pending')::int AS "pendingOrders",
          COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedOrders",
          COALESCE(SUM(total_amount), 0)::float AS "totalValue"
        FROM orders
        ${scopeJoin}
      `, params);
      return rows[0];
    },

    async findUserByEmail(email) {
      const { rows } = await pool.query(
        "SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1 AND is_active = TRUE",
        [email]
      );
      return rows[0] || null;
    },

    async findUserById(id) {
      const { rows } = await pool.query(
        "SELECT id, email, name, role, is_active FROM users WHERE id = $1 AND is_active = TRUE",
        [id]
      );
      return rows[0] || null;
    },

    async listUsers() {
      const { rows } = await pool.query(`
        SELECT id, email, name, role, is_active, created_at, updated_at
        FROM users
        ORDER BY email
      `);
      return rows;
    },

    async setUserActive(userId, isActive, actor) {
      const { rows } = await pool.query(
        "UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, role, is_active",
        [isActive, userId]
      );
      if (rows.length === 0) throw new Error("User not found.");
      await this.recordAuditEvent({
        actor,
        entityType: "user",
        entityId: userId,
        action: isActive ? "user.enabled" : "user.disabled",
        details: { email: rows[0].email }
      });
      return rows[0];
    },

    async createPasswordReset(userId, actor) {
      const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const { rows } = await pool.query(
        `
          UPDATE users
          SET password_reset_token = $1,
              password_reset_expires_at = NOW() + INTERVAL '24 hours',
              updated_at = NOW()
          WHERE id = $2
          RETURNING id, email, name, role, is_active, password_reset_token, password_reset_expires_at
        `,
        [token, userId]
      );
      if (rows.length === 0) throw new Error("User not found.");
      await this.recordAuditEvent({
        actor,
        entityType: "user",
        entityId: userId,
        action: "user.password_reset_created",
        details: { email: rows[0].email }
      });
      return rows[0];
    },

    async resetPasswordByToken(token, passwordHash) {
      const { rows } = await pool.query(
        `
          UPDATE users
          SET password_hash = $1,
              password_reset_token = NULL,
              password_reset_expires_at = NULL,
              is_active = TRUE,
              updated_at = NOW()
          WHERE password_reset_token = $2 AND password_reset_expires_at > NOW()
          RETURNING id, email, name, role, is_active
        `,
        [passwordHash, token]
      );
      if (rows.length === 0) throw new Error("Invalid or expired reset token.");
      await this.recordAuditEvent({
        actor: { email: rows[0].email },
        entityType: "user",
        entityId: rows[0].id,
        action: "user.password_reset_completed",
        details: { email: rows[0].email }
      });
      return rows[0];
    },

    async upsertUser(input) {
      const { rows } = await pool.query(
        `
          INSERT INTO users (email, name, password_hash, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW()
          RETURNING id, email, name, role, is_active
        `,
        [input.email, input.name, input.passwordHash, input.role]
      );
      return rows[0];
    },

    async assignUserOutlet(userId, outletId, actor) {
      await pool.query(
        "INSERT INTO user_outlets (user_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, outletId]
      );
      await this.recordAuditEvent({
        actor,
        entityType: "user",
        entityId: userId,
        action: "user.outlet_assigned",
        details: { outletId }
      });
    },

    async listUserOutletAssignments() {
      const { rows } = await pool.query(`
        SELECT
          uo.user_id,
          uo.outlet_id,
          u.email AS user_email,
          o.name AS outlet_name,
          org.name AS organization_name,
          uo.created_at
        FROM user_outlets uo
        JOIN users u ON u.id = uo.user_id
        JOIN outlets o ON o.id = uo.outlet_id
        JOIN organizations org ON org.id = o.organization_id
        ORDER BY u.email, org.name, o.name
      `);
      return rows;
    },

    async listOrganizations() {
      const { rows } = await pool.query("SELECT id, name, contact_email, created_at FROM organizations ORDER BY name");
      return rows;
    },

    async listOutlets() {
      const { rows } = await pool.query(`
        SELECT
          o.id,
          o.organization_id,
          o.name,
          o.city,
          o.address,
          o.phone,
          o.is_open,
          org.name AS organization_name
        FROM outlets o
        JOIN organizations org ON org.id = o.organization_id
        ORDER BY org.name, o.name
      `);
      return rows;
    },

    async createOrganization(input, actor) {
      const { rows } = await pool.query(
        "INSERT INTO organizations (name, contact_email) VALUES ($1, $2) RETURNING *",
        [input.name, input.contactEmail]
      );
      await this.recordAuditEvent({
        actor,
        entityType: "organization",
        entityId: rows[0].id,
        action: "organization.created",
        details: rows[0]
      });
      return rows[0];
    },

    async createOutlet(input, actor) {
      const { rows } = await pool.query(
        `
          INSERT INTO outlets (organization_id, name, city, address, phone, is_open)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [input.organizationId, input.name, input.city, input.address, input.phone, input.isOpen]
      );
      await this.recordAuditEvent({
        actor,
        entityType: "outlet",
        entityId: rows[0].id,
        action: "outlet.created",
        details: rows[0]
      });
      return rows[0];
    },

    async createProduct(input, actor) {
      const { rows } = await pool.query(
        `
          INSERT INTO products (outlet_id, name, unit, price, available_quantity)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [input.outletId, input.name, input.unit, input.price, input.availableQuantity]
      );
      await this.recordAuditEvent({
        actor,
        entityType: "product",
        entityId: rows[0].id,
        action: "product.created",
        details: rows[0]
      });
      return rows[0];
    },

    async createTenantOnboarding(input, passwordHash) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const organizationResult = await client.query(
          "INSERT INTO organizations (name, contact_email) VALUES ($1, $2) RETURNING *",
          [input.organizationName, input.organizationEmail]
        );
        const organization = organizationResult.rows[0];
        const outletResult = await client.query(
          `
            INSERT INTO outlets (organization_id, name, city, address, phone, is_open)
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING *
          `,
          [organization.id, input.outletName, input.city, input.address, input.phone]
        );
        const outlet = outletResult.rows[0];
        const productResult = await client.query(
          `
            INSERT INTO products (outlet_id, name, unit, price, available_quantity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `,
          [outlet.id, input.productName, input.unit, input.price, input.availableQuantity]
        );
        const product = productResult.rows[0];
        const activationToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
        const userResult = await client.query(
          `
            INSERT INTO users (email, name, password_hash, role, is_active, activation_token, activation_expires_at)
            VALUES ($1, $2, $3, 'operator', FALSE, $4, NOW() + INTERVAL '24 hours')
            RETURNING id, email, name, role, is_active, activation_token, activation_expires_at
          `,
          [input.operatorEmail, input.operatorName, passwordHash, activationToken]
        );
        const user = userResult.rows[0];
        await client.query(
          "INSERT INTO user_outlets (user_id, outlet_id) VALUES ($1, $2)",
          [user.id, outlet.id]
        );
        await client.query(
          `
            INSERT INTO audit_events (actor_user_id, actor_email, entity_type, entity_id, action, details)
            VALUES ($1, $2, 'organization', $3, 'tenant.self_onboarded', $4)
          `,
          [
            user.id,
            user.email,
            organization.id,
            JSON.stringify({ outletId: outlet.id, productId: product.id, userId: user.id })
          ]
        );
        await client.query("COMMIT");
        return { organization, outlet, product, user };
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          throw new Error("An account already exists for this operator email.");
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async activateUserByToken(token) {
      const { rows } = await pool.query(
        `
          UPDATE users
          SET is_active = TRUE,
              activation_token = NULL,
              activation_expires_at = NULL,
              activated_at = NOW(),
              updated_at = NOW()
          WHERE activation_token = $1 AND activation_expires_at > NOW()
          RETURNING id, email, name, role, is_active
        `,
        [token]
      );
      if (rows.length === 0) throw new Error("Invalid or expired activation link.");
      await this.recordAuditEvent({
        actor: { email: rows[0].email },
        entityType: "user",
        entityId: rows[0].id,
        action: "user.activated",
        details: { email: rows[0].email }
      });
      return rows[0];
    },

    async createBuyerSignup(input) {
      const activationToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      try {
        const { rows } = await pool.query(
          `
            INSERT INTO buyer_accounts (email, name, phone, company_name, activation_token, activation_expires_at)
            VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
            RETURNING *
          `,
          [input.email, input.name, input.phone, input.companyName || null, activationToken]
        );
        return rows[0];
      } catch (error) {
        if (error.code === "23505") {
          throw new Error("A buyer account already exists for this email.");
        }
        throw error;
      }
    },

    async activateBuyerByToken(token) {
      const { rows } = await pool.query(
        `
          UPDATE buyer_accounts
          SET is_active = TRUE,
              activation_token = NULL,
              activation_expires_at = NULL,
              activated_at = NOW(),
              updated_at = NOW()
          WHERE activation_token = $1 AND activation_expires_at > NOW()
          RETURNING *
        `,
        [token]
      );
      if (rows.length === 0) throw new Error("Invalid or expired activation link.");
      return rows[0];
    },

    async findOrderForBuyer(reference, buyerEmail) {
      const { rows } = await pool.query(
        `
          SELECT
            ord.id,
            ord.order_reference,
            ord.buyer_name,
            ord.buyer_email,
            ord.quantity::float,
            ord.fulfillment_method,
            ord.delivery_address,
            ord.notes,
            ord.unit_price::float,
            ord.total_amount::float,
            ord.payment_status,
            ord.payment_provider,
            ord.payment_reference,
            ord.paid_at,
            ord.payment_payload,
            ord.cancellation_requested,
            ord.cancellation_reason,
            ord.status,
            ord.created_at,
            p.name AS product_name,
            p.unit,
            o.name AS outlet_name,
            org.name AS organization_name
          FROM orders ord
          JOIN products p ON p.id = ord.product_id
          JOIN outlets o ON o.id = ord.outlet_id
          JOIN organizations org ON org.id = o.organization_id
          WHERE ord.order_reference = $1 AND ord.buyer_email = $2
        `,
        [reference, buyerEmail]
      );
      return rows[0] || null;
    },

    async requestCancellation(reference, buyerEmail, reason) {
      const { rows } = await pool.query(
        `
          UPDATE orders
          SET cancellation_requested = TRUE, cancellation_reason = $3, updated_at = NOW()
          WHERE order_reference = $1 AND buyer_email = $2
          RETURNING id, order_reference
        `,
        [reference, buyerEmail, reason]
      );
      if (rows.length === 0) throw new Error("Order not found.");
      await this.recordAuditEvent({
        actor: { email: buyerEmail },
        entityType: "order",
        entityId: rows[0].id,
        action: "order.cancellation_requested",
        details: { order_reference: reference, reason }
      });
      return this.findOrderForBuyer(reference, buyerEmail);
    },

    async decideCancellation(orderId, input, actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await assertActorCanAccessOrder(client, orderId, actor);
        const current = await client.query(
          "SELECT id, order_reference, product_id, quantity::float, status FROM orders WHERE id = $1 FOR UPDATE",
          [orderId]
        );
        if (current.rowCount === 0) throw new Error("Order not found.");

        const order = current.rows[0];
        const nextStatus = input.decision === "approved" ? "cancelled" : order.status;
        const { rows } = await client.query(
          `
            UPDATE orders
            SET cancellation_decision = $1,
                cancellation_decision_reason = $2,
                cancellation_decided_by = $3,
                cancellation_decided_at = NOW(),
                status = $4,
                updated_at = NOW()
            WHERE id = $5
            RETURNING *
          `,
          [input.decision, input.reason, actor?.id || null, nextStatus, orderId]
        );

        if (input.decision === "approved" && order.status !== "cancelled") {
          await client.query(
            "UPDATE products SET available_quantity = available_quantity + $1, updated_at = NOW() WHERE id = $2",
            [order.quantity, order.product_id]
          );
        }

        await client.query(
          `
            INSERT INTO audit_events (actor_user_id, actor_email, entity_type, entity_id, action, details)
            VALUES ($1, $2, 'order', $3, 'order.cancellation_decided', $4)
          `,
          [
            actor?.id || null,
            actor?.email || null,
            orderId,
            JSON.stringify({ order_reference: order.order_reference, decision: input.decision, reason: input.reason })
          ]
        );
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updatePaymentStatus(orderId, paymentStatus, actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await assertActorCanAccessOrder(client, orderId, actor);
        const current = await client.query("SELECT id, order_reference, payment_status FROM orders WHERE id = $1 FOR UPDATE", [
          orderId
        ]);
        if (current.rowCount === 0) throw new Error("Order not found.");
        const { rows } = await client.query(
          "UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
          [paymentStatus, orderId]
        );
        await client.query(
          `
            INSERT INTO audit_events (actor_user_id, actor_email, entity_type, entity_id, action, details)
            VALUES ($1, $2, 'order', $3, 'order.payment_updated', $4)
          `,
          [
            actor?.id || null,
            actor?.email || null,
            orderId,
            JSON.stringify({
              from: current.rows[0].payment_status,
              to: paymentStatus,
              order_reference: current.rows[0].order_reference
            })
          ]
        );
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listSettlementRows(filters = {}) {
      const params = [];
      const clauses = ["ord.payment_status = 'paid'"];
      if (filters.from) {
        params.push(filters.from);
        clauses.push(`COALESCE(ord.paid_at, ord.created_at) >= $${params.length}`);
      }
      if (filters.to) {
        params.push(filters.to);
        clauses.push(`COALESCE(ord.paid_at, ord.created_at) <= $${params.length}`);
      }
      const { rows } = await pool.query(`
        SELECT
          ord.order_reference,
          ord.buyer_name,
          ord.buyer_email,
          ord.total_amount::float,
          ord.payment_status,
          ord.payment_provider,
          ord.payment_reference,
          ord.paid_at,
          o.name AS outlet_name,
          org.name AS organization_name
        FROM orders ord
        JOIN outlets o ON o.id = ord.outlet_id
        JOIN organizations org ON org.id = o.organization_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY ord.paid_at DESC NULLS LAST, ord.created_at DESC
      `, params);
      return rows;
    },

    async updateOrganization(id, input, actor) {
      const { rows } = await pool.query(
        "UPDATE organizations SET name = $1, contact_email = $2 WHERE id = $3 RETURNING *",
        [input.name, input.contactEmail, id]
      );
      if (rows.length === 0) throw new Error("Organization not found.");
      await this.recordAuditEvent({ actor, entityType: "organization", entityId: id, action: "organization.updated", details: input });
      return rows[0];
    },

    async updateOutlet(id, input, actor) {
      const { rows } = await pool.query(
        `
          UPDATE outlets
          SET organization_id = $1, name = $2, city = $3, address = $4, phone = $5, is_open = $6
          WHERE id = $7
          RETURNING *
        `,
        [input.organizationId, input.name, input.city, input.address, input.phone, input.isOpen, id]
      );
      if (rows.length === 0) throw new Error("Outlet not found.");
      await this.recordAuditEvent({ actor, entityType: "outlet", entityId: id, action: "outlet.updated", details: input });
      return rows[0];
    },

    async updateProduct(id, input, actor) {
      const { rows } = await pool.query(
        `
          UPDATE products
          SET outlet_id = $1, name = $2, unit = $3, price = $4, available_quantity = $5, updated_at = NOW()
          WHERE id = $6
          RETURNING *
        `,
        [input.outletId, input.name, input.unit, input.price, input.availableQuantity, id]
      );
      if (rows.length === 0) throw new Error("Product not found.");
      await this.recordAuditEvent({ actor, entityType: "product", entityId: id, action: "product.updated", details: input });
      return rows[0];
    },

    async createNotification(input) {
      const { rows } = await pool.query(
        `
          INSERT INTO notification_events (recipient_email, subject, body, channel)
          VALUES ($1, $2, $3, 'email')
          RETURNING *
        `,
        [input.recipientEmail, input.subject, input.body]
      );
      return rows[0];
    },

    async updateNotificationStatus(id, status, providerResponse) {
      const { rows } = await pool.query(
        `
          UPDATE notification_events
          SET status = $1, provider_response = $2, sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END
          WHERE id = $3
          RETURNING *
        `,
        [status, JSON.stringify(providerResponse || {}), id]
      );
      if (rows.length === 0) throw new Error("Notification not found.");
      return rows[0];
    },

    async listNotifications(limit = 20) {
      const { rows } = await pool.query(
        "SELECT * FROM notification_events ORDER BY created_at DESC LIMIT $1",
        [limit]
      );
      return rows;
    },

    async prepareOrderPayment(reference, buyerEmail, payment) {
      const { rows } = await pool.query(
        `
          UPDATE orders
          SET payment_status = 'invoice_sent',
              payment_provider = 'paystack',
              payment_reference = $3,
              payment_payload = $4,
              updated_at = NOW()
          WHERE order_reference = $1 AND buyer_email = $2
          RETURNING id, order_reference, buyer_email, payment_reference
        `,
        [reference, buyerEmail, payment.reference, JSON.stringify(payment.providerResponse || {})]
      );
      if (rows.length === 0) throw new Error("Order not found.");
      await this.recordAuditEvent({
        actor: { email: buyerEmail },
        entityType: "order",
        entityId: rows[0].id,
        action: "order.payment_initialized",
        details: { order_reference: reference, payment_reference: payment.reference }
      });
      return rows[0];
    },

    async findOrderByPaymentReference(paymentReference) {
      const { rows } = await pool.query(
        `
          SELECT id, order_reference, buyer_email, total_amount::float, payment_reference, payment_status
          FROM orders
          WHERE payment_reference = $1
        `,
        [paymentReference]
      );
      return rows[0] || null;
    },

    async markPaymentPaid(paymentReference, payload) {
      const { rows } = await pool.query(
        `
          UPDATE orders
          SET payment_status = 'paid',
              paid_at = NOW(),
              payment_payload = $2,
              updated_at = NOW()
          WHERE payment_reference = $1
          RETURNING id, order_reference
        `,
        [paymentReference, JSON.stringify(payload || {})]
      );
      if (rows.length === 0) throw new Error("Order not found.");
      await this.recordAuditEvent({
        actor: { email: "paystack" },
        entityType: "order",
        entityId: rows[0].id,
        action: "order.payment_paid",
        details: { order_reference: rows[0].order_reference, payment_reference: paymentReference }
      });
      return rows[0];
    },

    async listAuditEvents(limit = 12) {
      const { rows } = await pool.query(
        `
          SELECT id, actor_email, entity_type, entity_id, action, details, created_at
          FROM audit_events
          ORDER BY created_at DESC
          LIMIT $1
        `,
        [limit]
      );
      return rows;
    },

    async updateOrderStatus(orderId, status, actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await assertActorCanAccessOrder(client, orderId, actor);
        const current = await client.query("SELECT id, order_reference, status FROM orders WHERE id = $1 FOR UPDATE", [
          orderId
        ]);
        if (current.rowCount === 0) {
          throw new Error("Order not found.");
        }

        const { rows } = await client.query(
          "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
          [status, orderId]
        );

        await client.query(
          `
            INSERT INTO audit_events (actor_user_id, actor_email, entity_type, entity_id, action, details)
            VALUES ($1, $2, 'order', $3, 'order.status_updated', $4)
          `,
          [
            actor?.id || null,
            actor?.email || null,
            orderId,
            JSON.stringify({
              from: current.rows[0].status,
              to: status,
              order_reference: current.rows[0].order_reference
            })
          ]
        );

        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

module.exports = { createPostgresStore };
