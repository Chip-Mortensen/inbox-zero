import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";
import { people } from "@googleapis/people";
import { saveRefreshToken } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("gmail/client");

type ClientOptions = {
  accessToken?: string;
  refreshToken?: string;
};

const getClient = (session: ClientOptions) => {
  const googleAuth = new auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });

  // not passing refresh_token when next-auth handles it
  googleAuth.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  return googleAuth;
};

export const getGmailClient = (session: ClientOptions) => {
  const auth = getClient(session);
  const g = gmail({ version: "v1", auth });

  return g;
};

export const getContactsClient = (session: ClientOptions) => {
  const auth = getClient(session);
  const contacts = people({ version: "v1", auth });

  return contacts;
};

export const getGmailAccessToken = (session: ClientOptions) => {
  const auth = getClient(session);
  return auth.getAccessToken();
};

export const getGmailClientWithRefresh = async (
  session: ClientOptions & { refreshToken: string; expiryDate?: number | null },
  providerAccountId: string,
): Promise<gmail_v1.Gmail | undefined> => {
  logger.info("Getting Gmail client with refresh", {
    hasAccessToken: !!session.accessToken,
    hasRefreshToken: !!session.refreshToken,
    hasExpiryDate: !!session.expiryDate,
    expiryDate: session.expiryDate
      ? new Date(session.expiryDate * 1000).toISOString()
      : null,
    providerAccountId,
  });

  const auth = getClient(session);
  const g = gmail({ version: "v1", auth });

  if (session.expiryDate && session.expiryDate > Date.now() / 1000) {
    logger.info("Token still valid, using existing token", {
      expiresIn: Math.round((session.expiryDate - Date.now() / 1000) / 60),
      minutes: true,
      providerAccountId,
    });
    return g;
  }

  // may throw `invalid_grant` error
  try {
    logger.info("Attempting to refresh access token", {
      providerAccountId,
      tokenLength: session.refreshToken.length,
      expiryDate: session.expiryDate
        ? new Date(session.expiryDate * 1000).toISOString()
        : null,
    });

    const tokens = await auth.refreshAccessToken();
    const newAccessToken = tokens.credentials.access_token;

    logger.info("Token refresh result", {
      hasNewAccessToken: !!newAccessToken,
      tokensDifferent: newAccessToken !== session.accessToken,
      newExpiryDate: tokens.credentials.expiry_date
        ? new Date(tokens.credentials.expiry_date).toISOString()
        : null,
      providerAccountId,
    });

    if (newAccessToken !== session.accessToken) {
      await saveRefreshToken(
        {
          access_token: newAccessToken ?? undefined,
          expires_at: tokens.credentials.expiry_date
            ? Math.floor(tokens.credentials.expiry_date / 1000)
            : undefined,
        },
        {
          refresh_token: session.refreshToken,
          providerAccountId,
        },
      );
    }

    return g;
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.error("Error refreshing Gmail access token: invalid_grant", {
        error,
        errorMessage: error.message,
        errorStack: error.stack,
        providerAccountId,
        tokenLength: session.refreshToken.length,
        expiryDate: session.expiryDate
          ? new Date(session.expiryDate * 1000).toISOString()
          : null,
      });
      return undefined;
    }

    logger.error("Unexpected error refreshing token", {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      providerAccountId,
      tokenLength: session.refreshToken.length,
      expiryDate: session.expiryDate
        ? new Date(session.expiryDate * 1000).toISOString()
        : null,
    });

    throw error;
  }
};
