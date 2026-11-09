import { execSync } from "node:child_process";

const DATABASE_URL = "postgresql://postgres:Admin123@localhost:5432/sb_db_test?schema=public";

export function setup(): void {
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });
  execSync("npx tsx prisma/seed.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });
}

export function teardown(): void {}
