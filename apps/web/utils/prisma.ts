import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("prisma");

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });

  // Add middleware for error handling
  client.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (error) {
      const e = error as Error;
      const isSSLError =
        e.message?.includes("SSL") || e.message?.includes("exchange_error");
      const isMaxConns = e.message?.includes("Max client connections reached");

      logger.error("Prisma error", { error: e, isSSLError, isMaxConns });

      if (isMaxConns) {
        logger.warn("Max connections reached, forcing disconnect");
        try {
          await client.$disconnect();
          await new Promise((resolve) => setTimeout(resolve, 100));
          await connectWithRetry(client, 3, 50);
          return next(params);
        } catch (reconnectError) {
          logger.error("Failed to reconnect after max connections error", {
            error: reconnectError,
          });
        }
      } else if (isSSLError) {
        logger.warn(
          "SSL/Exchange error detected, attempting immediate reconnect",
        );
        try {
          await client.$disconnect();
          await connectWithRetry(client, 3, 100);
          return next(params);
        } catch (reconnectError) {
          logger.error("Failed to reconnect after SSL error", {
            error: reconnectError,
          });
        }
      } else {
        try {
          await connectWithRetry(client);
          return next(params);
        } catch (error) {
          logger.error("Failed to reconnect prisma client", { error });
        }
      }
      throw error;
    }
  });

  return client;
};

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

async function connectWithRetry(
  client: PrismaClient,
  retries = 5,
  backoffMs = 1000,
): Promise<void> {
  try {
    await client.$connect();
    logger.info("Successfully connected Prisma client to database");
  } catch (error) {
    if (retries > 0) {
      logger.warn(
        `Failed to connect Prisma client, retrying... (${retries} attempts left)`,
        { error },
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return connectWithRetry(
        client,
        retries - 1,
        Math.min(backoffMs * 2, 10000),
      );
    }
    logger.error(
      "Failed to connect Prisma client to database after all retries",
      { error },
    );
    throw error;
  }
}

// Initialize connection
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
