import { z } from "zod";

export const createAccountSchema = z.object({
    name: z.string().min(1),
    accountType: z.enum(["personal"]),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;