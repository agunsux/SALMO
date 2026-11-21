/**
 * HandicapLab Payment Providers Registry
 */

export * from './types';
export * from './stablecoinAdapter';
export * from './fiatAdapter';
export * from './seaEwalletAdapter';

import { StablecoinAdapter } from './stablecoinAdapter';
import { FiatAdapter } from './fiatAdapter';
import { SeaEwalletAdapter } from './seaEwalletAdapter';
import { PaymentRail, PaymentProviderAdapter } from './types';

export const paymentAdapters: Record<PaymentRail, PaymentProviderAdapter> = {
  STABLECOIN: new StablecoinAdapter(),
  FIAT: new FiatAdapter(),
  SEA_EWALLET: new SeaEwalletAdapter(),
};
