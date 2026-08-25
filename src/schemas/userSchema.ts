import { z } from "zod";

const addressSchema = z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    line3: z.string().optional(),
    town: z.string().min(1),
    county: z.string().min(1),
    postcode: z.string().min(1),
});

export const createUserSchema = z.object({
    name: z.string().min(1),
    address: addressSchema,
    phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
    email: z.string().email(),
    password: z.string().min(8),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;