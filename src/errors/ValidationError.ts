import { AppError } from "./AppError";

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  public readonly errors: ValidationErrorDetail[];

  constructor(errors: ValidationErrorDetail[], message = "Validation Failed") {
    super(message, 422);
    this.errors = errors;
  }
}
