/**
 * @mss/server - Error Handling
 */

export class MCPServerError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "MCPServerError";
  }
}

export class NotFoundError extends MCPServerError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends MCPServerError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class UnauthorizedError extends MCPServerError {
  constructor() {
    super("Unauthorized", "UNAUTHORIZED", 401);
  }
}

export function errorHandler(err: Error): { status: number; body: object } {
  if (err instanceof MCPServerError) {
    return {
      status: err.statusCode,
      body: { error: err.message, code: err.code }
    };
  }
  
  console.error("[Error]", err);
  return {
    status: 500,
    body: { error: "Internal server error", code: "INTERNAL_ERROR" }
  };
}
