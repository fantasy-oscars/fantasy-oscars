export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: ErrorDetails
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(message: string, fields?: string[]) {
  return new AppError("VALIDATION_ERROR", 400, message, fields ? { fields } : undefined);
}

export function internalError() {
  return new AppError("INTERNAL_ERROR", 500, "Unexpected error");
}

export function errorBody(err: AppError | Error) {
  if (err instanceof AppError) {
    return {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    };
  }
  return { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } };
}
