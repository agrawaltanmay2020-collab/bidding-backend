import "dotenv/config";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schema = await readFile(resolve(process.cwd(), "schema.sql"), "utf8");
    await pool.query(schema);
    console.log("Database migration completed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
