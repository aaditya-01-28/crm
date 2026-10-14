import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const forceSsl = connectionString.includes("sslmode=require") || connectionString.includes("ssl=true");
  const ssl = forceSsl ? { rejectUnauthorized: false } : isLocal ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false);

  const pool = new Pool({
    connectionString,
    ssl,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
