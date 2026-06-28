const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const seedData = require("./uatSeedData");

async function initDatabase(pool) {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM organizations");
  if (rows[0].count > 0) {
    return;
  }

  const organizationIds = new Map();
  for (const organization of seedData.organizations) {
    const result = await pool.query(
      "INSERT INTO organizations (name, contact_email) VALUES ($1, $2) RETURNING id",
      [organization.name, organization.contact_email]
    );
    organizationIds.set(organization.name, result.rows[0].id);
  }

  const outletIds = new Map();
  for (const outlet of seedData.outlets) {
    const result = await pool.query(
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
    await pool.query(
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
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for db:init.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  try {
    await initDatabase(pool);
    console.log("Database initialized.");
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

module.exports = { initDatabase };
