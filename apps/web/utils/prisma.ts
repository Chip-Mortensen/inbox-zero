import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("prisma");

declare global {
  var prisma: PrismaClient | undefined;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;

async function connectWithRetry(
  client: PrismaClient,
  retries = MAX_RETRIES,
): Promise<void> {
  try {
    await client.$connect();
    logger.info("Successfully connected to database");
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Failed to connect, retrying... (${retries} attempts left)`, {
        error,
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return connectWithRetry(client, retries - 1);
    }
    logger.error("Failed to connect to database after all retries", { error });
    throw error;
  }
}

// biome-ignore lint/suspicious/noRedeclare: <explanation>
const prisma =
  global.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: {
        url: env.DIRECT_URL,
      },
    },
  });

if (process.env.NODE_ENV === "development") {
  global.prisma = prisma;
  logger.info("Set global prisma client in development");
}

// Warm up the connection with retries
void connectWithRetry(prisma);

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

// Helper to retry database operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientInitializationError &&
      retries > 0
    ) {
      logger.warn(`Operation failed, retrying... (${retries} attempts left)`, {
        error,
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return withRetry(operation, retries - 1);
    }
    throw error;
  }
}
