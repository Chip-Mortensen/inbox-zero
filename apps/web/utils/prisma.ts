import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("prisma");

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: ["error", "warn", "query"],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });

  let isConnected = false;
  let reconnectAttempt = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Add middleware for connection management
  client.$use(async (params, next) => {
    try {
      // If we're not connected, try to connect first
      if (!isConnected) {
        await connectWithRetry(client);
        isConnected = true;
        reconnectAttempt = 0;
      }

      const result = await next(params);
    } catch (error) {
      const e = error as Error;
      const isSSLError =
        e.message?.includes("SSL") || e.message?.includes("exchange_error");
      const isMaxConns = e.message?.includes("Max client connections reached");
      const isTimeout = e.message?.includes("Timeout");

      logger.error("Prisma error", {
        error: e,
        isSSLError,
        isMaxConns,
        isTimeout,
        operation: params.action,
        model: params.model,
        reconnectAttempt,
      });

      // Only attempt reconnection if we haven't exceeded the limit
      if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempt++;
        isConnected = false;

        if (isMaxConns || isSSLError || isTimeout) {
          logger.warn("Connection issue detected, attempting reconnect", {
            attempt: reconnectAttempt,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
          });

          try {
            await client.$disconnect();
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * reconnectAttempt),
            );
            await connectWithRetry(client, 2, 1000 * reconnectAttempt);
            isConnected = true;
            return next(params);
          } catch (reconnectError) {
            logger.error("Failed to reconnect", {
              error: reconnectError,
              attempt: reconnectAttempt,
            });
          }
        }
      } else {
        logger.error("Max reconnection attempts reached", {
          maxAttempts: MAX_RECONNECT_ATTEMPTS,
        });
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
  retries = 2,
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
