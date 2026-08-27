import { z } from "zod";

export const createTransactionSchema = z.object({
    amount: z
        .number()
        .positive()
        .max(10000)
        .refine((val) => Math.abs(val * 100 - Math.round(val * 100)) < 1e-6, {
            message: "amount must have at most two decimal places",
        }),
    currency: z.enum(["GBP"]),
    type: z.enum(["deposit", "withdrawal"]),
    reference: z.string().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;