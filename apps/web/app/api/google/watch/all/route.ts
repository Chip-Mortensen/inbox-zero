import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { hasAiAccess, hasColdEmailAccess } from "@/utils/premium";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/google/watch/all");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function watchAllEmails() {
  logger.info("Starting watchAllEmails function");

  const premiums = await prisma.premium.findMany({
    where: {
      lemonSqueezyRenewsAt: { gt: new Date() },
    },
    select: {
      tier: true,
      coldEmailBlockerAccess: true,
      aiAutomationAccess: true,
      users: {
        select: {
          id: true,
          email: true,
          aiApiKey: true,
          watchEmailsExpirationDate: true,
          accounts: {
            select: {
              access_token: true,
              refresh_token: true,
              expires_at: true,
              providerAccountId: true,
            },
          },
        },
      },
    },
  });

  logger.info("Found premium users", { count: premiums.length });

  const users = premiums
    .flatMap((premium) => premium.users.map((user) => ({ ...user, premium })))
    .sort((a, b) => {
      if (!a.watchEmailsExpirationDate && b.watchEmailsExpirationDate)
        return -1;
      if (a.watchEmailsExpirationDate && !b.watchEmailsExpirationDate) return 1;
      if (a.watchEmailsExpirationDate && b.watchEmailsExpirationDate) {
        return (
          new Date(a.watchEmailsExpirationDate).getTime() -
          new Date(b.watchEmailsExpirationDate).getTime()
        );
      }
      return 0;
    });

  logger.info("Processing users", { totalUsers: users.length });

  for (const user of users) {
    try {
      logger.info("Processing user", {
        email: user.email,
        hasWatchExpiration: !!user.watchEmailsExpirationDate,
        watchExpiration: user.watchEmailsExpirationDate,
      });

      const userHasAiAccess = hasAiAccess(
        user.premium.aiAutomationAccess,
        user.aiApiKey,
      );
      const userHasColdEmailAccess = hasColdEmailAccess(
        user.premium.coldEmailBlockerAccess,
        user.aiApiKey,
      );

      logger.info("User access status", {
        email: user.email,
        hasAiAccess: userHasAiAccess,
        hasColdEmailAccess: userHasColdEmailAccess,
      });

      if (!userHasAiAccess && !userHasColdEmailAccess) {
        logger.info("User does not have required access", {
          email: user.email,
        });
        if (
          user.watchEmailsExpirationDate &&
          new Date(user.watchEmailsExpirationDate) < new Date()
        ) {
          logger.info("Updating expired watch date", { email: user.email });
          await prisma.user.update({
            where: { id: user.id },
            data: { watchEmailsExpirationDate: null },
          });
        }
        continue;
      }

      const account = user.accounts[0];

      if (!account?.access_token || !account?.refresh_token) {
        logger.warn("Missing tokens for user", {
          email: user.email,
          hasAccessToken: !!account?.access_token,
          hasRefreshToken: !!account?.refresh_token,
        });
        continue;
      }

      logger.info("Getting Gmail client", { email: user.email });
      const gmail = await getGmailClientWithRefresh(
        {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiryDate: account.expires_at,
        },
        account.providerAccountId,
      );

      if (!gmail) {
        logger.error("Failed to get Gmail client", { email: user.email });
        continue;
      }

      logger.info("Watching emails for user", { email: user.email });
      await watchEmails(user.id, gmail);
      logger.info("Successfully set up watch for user", { email: user.email });
    } catch (error) {
      logger.error("Error processing user", {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ success: true });
}

export const GET = withError(async (request: Request) => {
  logger.info("Received GET request", {
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
  });

  if (!hasCronSecret(request)) {
    logger.error("Unauthorized GET request", {
      headers: Object.fromEntries(request.headers.entries()),
    });
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Authorized GET request, proceeding with watchAllEmails");
  return watchAllEmails();
});

export const POST = withError(async (request: Request) => {
  logger.info("Received POST request", {
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
  });

  const hasSecret = await hasPostCronSecret(request);
  logger.info("POST request authorization check", { hasSecret });

  if (!hasSecret) {
    logger.error("Unauthorized POST request", {
      headers: Object.fromEntries(request.headers.entries()),
    });
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Authorized POST request, proceeding with watchAllEmails");
  return watchAllEmails();
});
