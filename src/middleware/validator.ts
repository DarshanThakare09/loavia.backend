import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ValidationError, ValidationErrorDetail } from "../errors/ValidationError";

export const validate = (schema: {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails: ValidationErrorDetail[] = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));
        next(new ValidationError(errorDetails));
      } else {
        next(error);
      }
    }
  };
};
