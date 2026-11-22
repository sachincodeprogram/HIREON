import { FareEstimate, LocationInfo, ParcelInfo, PaymentMethod, ReferralChannel } from '../types';

export type RootStackParamList = {
  Splash:   undefined;
  Auth:     undefined;
  Customer: undefined;
  Rider:    undefined;
  Blocked:  undefined;
};

export type AuthStackParamList = {
  Login:      undefined;
  Signup:     { phone: string };
  RoleSelect: { name: string; phone: string; referralCode?: string; referralChannel?: ReferralChannel };
};

/** "Order again" — purane order ki details booking form me bharne ke liye */
export interface BookingDraft {
  pickup: LocationInfo;
  /** Beech ke stops + aakhri me final drop (kam se kam 1) */
  drops: LocationInfo[];
  parcel: ParcelInfo;
  paymentMethod: PaymentMethod;
  sourceOrderId: string;
}

export type CustomerTabParamList = {
  Dashboard:  undefined;
  // nonce: same order dobara "Order again" karne par bhi form fir se bhare
  BookParcel: { draft: BookingDraft; nonce: number } | undefined;
  History:    undefined;
};

export type CustomerStackParamList = {
  CustomerTabs:  undefined;
  FareEstimate:  { pickup: LocationInfo; delivery: LocationInfo; stops?: LocationInfo[]; parcel: ParcelInfo; estimate: FareEstimate; paymentMethod: PaymentMethod };
  LiveTracking:  { orderId: string };
  Profile:       undefined;
  Support:       undefined;
  SupportChat:   { ticketId?: string };
};

export type RiderTabParamList = {
  Dashboard: undefined;
  History:   undefined;
  Earnings:  undefined;
};

export type RiderStackParamList = {
  RiderTabs:      undefined;
  ActiveDelivery: { orderId: string };
  Wallet:         undefined;
  ReferEarn:      undefined;
  Profile:        undefined;
  Support:        undefined;
  SupportChat:    { ticketId?: string };
  Navigation: {
    orderId:            string;
    destination:        { lat: number; lng: number };
    label:              string;   // "Pickup" | "Delivery"
    destinationAddress: string;
  };
};
