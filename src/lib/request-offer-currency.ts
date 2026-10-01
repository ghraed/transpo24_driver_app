/** The server supplies the driver's home-market currency for a new offer. */
export function requestOfferCurrency(request: { offerCurrency?: string | null }): string {
  const currency = request.offerCurrency?.trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Your offer currency is unavailable. Please reload the request.');
  }
  return currency;
}
