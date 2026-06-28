const { Pool } = require("pg");
const { hashPassword } = require("../auth");
const { initDatabase } = require("./init");
const seedData = require("./uatSeedData");

async function seedUatDatabase(pool, options = {}) {
  await initDatabase(pool);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      TRUNCATE TABLE
        user_outlets,
        notification_events,
        audit_events,
        buyer_accounts,
        loyalty_programs,
        orders,
        products,
        outlets,
        organizations,
        users
      RESTART IDENTITY CASCADE
    `);

    const organizationIds = new Map();
    for (const organization of seedData.organizations) {
      const result = await client.query(
        "INSERT INTO organizations (name, contact_email) VALUES ($1, $2) RETURNING id",
        [organization.name, organization.contact_email]
      );
      organizationIds.set(organization.name, result.rows[0].id);
    }

    const outletIds = new Map();
    for (const outlet of seedData.outlets) {
      const result = await client.query(
        `
          INSERT INTO outlets (organization_id, name, city, address, phone, is_open)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [
          organizationIds.get(outlet.organization_name),
          outlet.name,
          outlet.city,
          outlet.address,
          outlet.phone,
          outlet.is_open
        ]
      );
      outletIds.set(outlet.name, result.rows[0].id);
    }

    for (const product of seedData.products) {
      await client.query(
        `
          INSERT INTO products (outlet_id, name, unit, price, available_quantity, low_stock_threshold)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          outletIds.get(product.outlet_name),
          product.name,
          product.unit,
          product.price,
          product.available_quantity,
          product.low_stock_threshold
        ]
      );
    }

    let siteManager = null;
    if (options.adminEmail && options.adminPassword) {
      const result = await client.query(
        `
          INSERT INTO users (email, name, password_hash, role, is_active, activated_at)
          VALUES ($1, $2, $3, 'site_manager', TRUE, NOW())
          RETURNING id, email, role
        `,
        [
          options.adminEmail.toLowerCase(),
          "FuelUp Site Manager",
          await hashPassword(options.adminPassword)
        ]
      );
      siteManager = result.rows[0];
    }

    await client.query("COMMIT");
    return {
      organizations: seedData.organizations.length,
      outlets: seedData.outlets.length,
      products: seedData.products.length,
      users: siteManager ? 1 : 0,
      siteManager
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for db:seed:uat.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  try {
    const result = await seedUatDatabase(pool, {
      adminEmail: process.env.ADMIN_EMAIL,
      adminPassword: process.env.ADMIN_PASSWORD
    });
    console.log(
      `UAT database seeded: ${result.organizations} organizations, ${result.outlets} outlets, ${result.products} products, ${result.users} configured user.`
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { seedUatDatabase };
