const crypto = require("crypto");

function createReference() {
  return `FUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function createPostgresStore(pool) {
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

    async listOrders() {
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
        ORDER BY ord.created_at DESC
      `);
      return rows;
    },

    async listInventory() {
      const { rows } = await pool.query(`
        SELECT
          p.id,
          p.outlet_id,
          p.name,
          p.unit,
          p.price::float,
          p.available_quantity::float,
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
        ORDER BY org.name, o.name, p.name
      `);
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
        const current = await client.query(
          "SELECT id, price::float, available_quantity::float FROM products WHERE id = $1 FOR UPDATE",
          [productId]
        );
        if (current.rowCount === 0) {
          throw new Error("Product not found.");
        }

        const before = current.rows[0];
        const updated = await client.query(
          `
            UPDATE products
            SET price = $1, available_quantity = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING id, price::float, available_quantity::float, updated_at
          `,
          [input.price, input.availableQuantity, productId]
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
              before: { price: before.price, available_quantity: before.available_quantity },
              after: {
                price: updated.rows[0].price,
                available_quantity: updated.rows[0].available_quantity
              }
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

    async getDashboardSummary() {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS "totalOrders",
          COUNT(*) FILTER (WHERE status = 'pending')::int AS "pendingOrders",
          COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedOrders",
          COALESCE(SUM(total_amount), 0)::float AS "totalValue"
        FROM orders
      `);
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

    async updatePaymentStatus(orderId, paymentStatus, actor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
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
