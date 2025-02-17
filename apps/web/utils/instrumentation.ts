import { withServerActionInstrumentation } from "@sentry/nextjs";
import { createScopedLogger } from "@/utils/logger";
import type { ServerActionResponse } from "@/utils/error";

const logger = createScopedLogger("instrumentation");

type EnsureObject<T> = T extends object ? T : never;

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
  ): Promise<
    ServerActionResponse<EnsureObject<Result> & { success: boolean }, Err>
  > => {
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
              return { success: true } as EnsureObject<Result> & {
                success: boolean;
              };
            }

            if ("error" in res) return res;

            return {
              success: true,
              ...res,
            } as unknown as EnsureObject<Result> & {
              success: true;
            };
          } catch (error) {
            logger.error("Error in action", { action: name, error });
            return {
              error: "An error occurred",
              success: false,
            } as ServerActionResponse<Result, Err>;
          }
        },
      );

      return result;
    } catch (error) {
      logger.error("Error in action", { action: name, error });
      return {
        error: "An error occurred",
        success: false,
      } as ServerActionResponse<Result, Err>;
    }
  };
}
