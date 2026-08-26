export function toAccountResponse(account: any) {
    return {
        accountNumber: account.accountNumber,
        sortCode: account.sortCode,
        name: account.name,
        accountType: account.accountType,
        balance: account.balancePence / 100,
        currency: account.currency,
        createdTimestamp: account.createdAt.toISOString(),
        updatedTimestamp: account.updatedAt.toISOString(),
    };
}