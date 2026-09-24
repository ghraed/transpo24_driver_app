/** Only an authorized request response may supply the offer currency. */
export function requestOfferCurrency(request: { currency?: string | null }): string {
  const currency = request.currency?.trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Request currency is unavailable. Please reload the request.');
  }
  return currency;
}
