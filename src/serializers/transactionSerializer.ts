export function toTransactionResponse(transaction: any, userId: string) {
    return {
        id: transaction.id,
        amount: transaction.amountPence / 100,
        currency: transaction.currency,
        type: transaction.type,
        reference: transaction.reference ?? undefined,
        userId,
        createdTimestamp: transaction.createdAt.toISOString(),
    };
}