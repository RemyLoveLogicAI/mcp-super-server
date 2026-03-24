/**
 * Ledger Migration Runner
 * Whitepaper §4.2.8: Event Ledger
 *
 * Runs SQL migrations against Supabase/Postgres
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

export interface MigrationConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  migrationsDir?: string;
}

export interface MigrationResult {
  success: boolean;
  migrations: string[];
  error?: string;
}

export async function runMigrations(config: MigrationConfig): Promise<MigrationResult> {
  const client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  const migrationsDir = config.migrationsDir ?? join(__dirname, "../migrations");

  try {
    // Read and execute migration files in order
    const migrationFiles = [
      "001_create_tables.sql",
    ];

    const executed: string[] = [];

    for (const file of migrationFiles) {
      const path = join(migrationsDir, file);
      let sql: string;
      try {
        sql = readFileSync(path, "utf-8");
      } catch (e) {
        // File doesn't exist, skip
        continue;
      }

      // Execute SQL via Supabase RPC
      const { error } = await client.rpc("exec_sql", { sql });

      if (error) {
        // Try direct REST approach if RPC fails
        const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
          method: "POST",
          headers: {
            "apikey": config.supabaseServiceKey,
            "Authorization": `Bearer ${config.supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        });

        if (!response.ok) {
          return {
            success: false,
            migrations: executed,
            error: `Migration ${file} failed: ${await response.text()}`,
          };
        }
      }

      executed.push(file);
    }

    return { success: true, migrations: executed };
  } catch (error) {
    return {
      success: false,
      migrations: [],
      error: `Migration error: ${error}`,
    };
  }
}

// CLI entry point
if (import.meta.main) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("🔄 Running ledger migrations...");
  const result = await runMigrations({ supabaseUrl: url, supabaseServiceKey: key });

  if (result.success) {
    console.log(`✅ Migrations complete: ${result.migrations.join(", ")}`);
  } else {
    console.error(`❌ Migration failed: ${result.error}`);
    process.exit(1);
  }
}
