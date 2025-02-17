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
  });
};

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

prisma.$on("error" as never, async (e) => {
  logger.error("Prisma error", { error: e });
  try {
    await connectWithRetry(prisma);
  } catch (error) {
    logger.error("Failed to reconnect prisma client", { error });
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
