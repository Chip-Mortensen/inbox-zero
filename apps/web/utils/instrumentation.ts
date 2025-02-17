import { withServerActionInstrumentation } from "@sentry/nextjs";
import { createScopedLogger } from "@/utils/logger";
import type { ServerActionResponse, ActionError } from "@/utils/error";

const logger = createScopedLogger("instrumentation");

type ActionResult<T> = T extends object
  ? T & { success: boolean }
  : { success: boolean };

export function withActionInstrumentation<
  Args extends any[],
  Result extends object | undefined = undefined,
  Err extends object = Record<string, unknown>,
>(
  name: string,
  action: (...args: Args) => Promise<ServerActionResponse<Result, Err>>,
  options?: { recordResponse?: boolean },
) {
  return async (
    ...args: Args
  ): Promise<ServerActionResponse<ActionResult<Result>, Err>> => {
    try {
      const result = await withServerActionInstrumentation(
        name,
        {
          recordResponse: options?.recordResponse ?? true,
        },
        async () => {
          try {
            logger.info(`Action: ${name}`, { action: name });
            const res = await action(...args);

            if (!res) {
              return { success: true } as unknown as ActionResult<Result>;
            }

            if ("error" in res) {
              return res as ActionError<Err>;
            }

            return { ...res, success: true } as unknown as ActionResult<Result>;
          } catch (error) {
            logger.error("Error in action", { action: name, error });
            return {
              error: "An error occurred",
            } as ActionError<Err>;
          }
        },
      );

      return result;
    } catch (error) {
      logger.error("Error in action", { action: name, error });
      return {
        error: "An error occurred",
      } as ActionError<Err>;
    }
  };
}
