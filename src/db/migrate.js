const { Pool } = require("pg");
const { initDatabase } = require("./init");

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for migrations.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await initDatabase(pool);
    await pool.query(
      "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING",
      ["0001_schema_bootstrap"]
    );
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { migrate };
