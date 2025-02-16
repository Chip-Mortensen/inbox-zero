import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("prisma");

declare global {
  var prisma: PrismaClient | undefined;
}

// biome-ignore lint/suspicious/noRedeclare: <explanation>
const prisma =
  global.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV === "development") {
  global.prisma = prisma;
  logger.info("Set global prisma client in development");
}

// Test the connection
prisma
  .$connect()
  .then(() => {
    logger.info("Successfully connected to database");
  })
  .catch((error) => {
    logger.error("Failed to connect to database", { error });
  });

export default prisma;

export function isDuplicateError(error: unknown, key?: string) {
  const duplicateError =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";

  if (key)
    return duplicateError && (error.meta?.target as string[])?.includes?.(key);

  return duplicateError;
}

export function isNotFoundError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
