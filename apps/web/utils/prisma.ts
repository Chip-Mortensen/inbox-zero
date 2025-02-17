import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("prisma");

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  }).$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        try {
          const result = await query(args);
          return result;
        } catch (error) {
          const e = error as Error;
          if (e.message?.includes("Max client connections reached")) {
            logger.warn(
              "Max connections reached, forcing disconnect and retry",
            );
            await prisma.$disconnect();
            await new Promise((resolve) => setTimeout(resolve, 50));
            return query(args);
          }
          throw error;
        }
      },
    },
  });
};

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

// Handle connection errors and SSL exchange failures
prisma.$on("error" as never, async (e) => {
  const error = e as Error;
  const isSSLError =
    error.message?.includes("SSL") || error.message?.includes("exchange_error");
  const isMaxConns = error.message?.includes("Max client connections reached");
  logger.error("Prisma error", { error: e, isSSLError, isMaxConns });

  if (isMaxConns) {
    logger.warn("Max connections reached, forcing disconnect");
    try {
      await prisma.$disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await connectWithRetry(prisma, 3, 50);
    } catch (reconnectError) {
      logger.error("Failed to reconnect after max connections error", {
        error: reconnectError,
      });
    }
  } else if (isSSLError) {
    logger.warn("SSL/Exchange error detected, attempting immediate reconnect");
    try {
      await prisma.$disconnect();
      await connectWithRetry(prisma, 3, 100);
    } catch (reconnectError) {
      logger.error("Failed to reconnect after SSL error", {
        error: reconnectError,
      });
    }
  } else {
    try {
      await connectWithRetry(prisma);
    } catch (error) {
      logger.error("Failed to reconnect prisma client", { error });
    }
  }
});

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
