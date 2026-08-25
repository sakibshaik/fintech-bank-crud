import { randomBytes } from "crypto";
export function generateId(prefix: string) {
    return `${prefix}-${randomBytes(6).toString("hex")}`;
}