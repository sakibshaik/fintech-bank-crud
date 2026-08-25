export function toUserResponse(user: any) {
    return {
        id: user.id,
        name: user.name,
        address: {
            line1: user.addressLine1,
            line2: user.addressLine2 ?? null,
            line3: user.addressLine3 ?? null,
            town: user.town,
            county: user.county,
            postcode: user.postcode,
        },
        phoneNumber: user.phoneNumber,
        email: user.email,
        createdTimestamp: user.createdAt.toISOString(),
        updatedTimestamp: user.updatedAt.toISOString(),
    };
}