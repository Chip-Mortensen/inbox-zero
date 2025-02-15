import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("cron");

export function hasCronSecret(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("cron_secret");

  logger.info("Checking cron secret from URL params", {
    hasSecret: !!secret,
    matches: secret === env.CRON_SECRET,
    urlSecret: secret,
    envSecret: env.CRON_SECRET,
  });

  return secret === env.CRON_SECRET;
}

export async function hasPostCronSecret(request: Request) {
  const headerSecret = request.headers.get("x-cron-secret");

  logger.info("Checking POST cron secret from headers", {
    hasHeaderSecret: !!headerSecret,
    matches: headerSecret === env.CRON_SECRET,
    headerSecret,
    envSecret: env.CRON_SECRET,
    allHeaders: Object.fromEntries(request.headers.entries()),
  });

  return headerSecret === env.CRON_SECRET;
}

export function getCronSecretHeader(): Record<string, string> | undefined {
  if (!env.CRON_SECRET) return undefined;

  return {
    "x-cron-secret": env.CRON_SECRET,
  };
}
