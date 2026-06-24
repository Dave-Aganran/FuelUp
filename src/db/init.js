const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function initDatabase(pool) {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM organizations");
  if (rows[0].count > 0) {
    return;
  }

  await pool.query(`
    INSERT INTO organizations (name, contact_email) VALUES
      ('Northstar Energy Services', 'ops@northstar.example'),
      ('Lagos Prime Fuels', 'support@lagosprime.example');
  `);

  await pool.query(`
    INSERT INTO outlets (organization_id, name, city, address, phone, is_open) VALUES
      (1, 'Northstar Lekki Phase 1', 'Lagos', 'Admiralty Way, Lekki Phase 1', '+234 800 100 1001', TRUE),
      (1, 'Northstar Victoria Island', 'Lagos', 'Ahmadu Bello Way, VI', '+234 800 100 1002', TRUE),
      (2, 'Lagos Prime Ikeja', 'Lagos', 'Obafemi Awolowo Way, Ikeja', '+234 800 200 2001', TRUE);
  `);

  await pool.query(`
    INSERT INTO products (outlet_id, name, unit, price, available_quantity) VALUES
      (1, 'PMS Petrol', 'litre', 720.00, 18000),
      (1, 'AGO Diesel', 'litre', 1120.00, 9000),
      (2, 'PMS Petrol', 'litre', 725.00, 12000),
      (2, 'LPG Cooking Gas', 'kg', 1250.00, 2200),
      (3, 'AGO Diesel', 'litre', 1115.00, 16000),
      (3, 'Engine Oil 5W-30', 'bottle', 8500.00, 140);
  `);
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
