export type ActionError<E extends object = Record<string, unknown>> = {
  error: string;
} & E;

export type ServerActionResponse<
  T extends object | undefined = undefined,
  E extends object = Record<string, unknown>,
> = ActionError<E> | T;

export function isActionError<T extends object | undefined, E extends object>(
  result: ServerActionResponse<T, E>,
): result is ActionError<E> {
  return result !== undefined && "error" in result && result.error !== "";
}
