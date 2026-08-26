import { randomBytes } from "crypto";
export function generateId(prefix: string) {
    return `${prefix}-${randomBytes(6).toString("hex")}`;
}

export function generateAccountNumber(): string {
    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `01${digits}`;
}