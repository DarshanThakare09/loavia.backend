"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const ValidationError_1 = require("../errors/ValidationError");
const validate = (schema) => {
    return async (req, _res, next) => {
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
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const errorDetails = error.errors.map((err) => ({
                    field: err.path.join("."),
                    message: err.message,
                }));
                next(new ValidationError_1.ValidationError(errorDetails));
            }
            else {
                next(error);
            }
        }
    };
};
exports.validate = validate;
