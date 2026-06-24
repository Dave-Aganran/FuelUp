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
          "SELECT available_quantity::float FROM products WHERE id = $1 AND outlet_id = $2 FOR UPDATE",
          [input.productId, input.outletId]
        );

        if (productResult.rowCount === 0) {
          throw new Error("Selected product is no longer available.");
        }

        const availableQuantity = Number(productResult.rows[0].available_quantity);
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
              notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
            input.notes || null
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
          ord.buyer_name,
          ord.buyer_phone,
          ord.buyer_email,
          ord.quantity::float,
          ord.fulfillment_method,
          ord.delivery_address,
          ord.notes,
          ord.status,
          ord.created_at,
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

    async updateOrderStatus(orderId, status) {
      const { rows } = await pool.query("UPDATE orders SET status = $1 WHERE id = $2 RETURNING *", [
        status,
        orderId
      ]);
      if (rows.length === 0) {
        throw new Error("Order not found.");
      }
      return rows[0];
    }
  };
}

module.exports = { createPostgresStore };
