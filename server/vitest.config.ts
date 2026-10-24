import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_ACCESS_SECRET: "test-access-secret-test-access-secret-1234",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret-12",
      NODE_ENV: "test",
      RATE_LIMIT_MAX: "10000",
      AUTH_RATE_LIMIT_MAX: "10000",
      ENCRYPTION_KEY: "MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWY=",
      UPLOAD_DIR: "uploads-test",
    },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ["tests/**/*.test.ts"],
  },
});
