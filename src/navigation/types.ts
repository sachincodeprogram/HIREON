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

export type CustomerTabParamList = {
  Dashboard:  undefined;
  BookParcel: undefined;
  History:    undefined;
};

export type CustomerStackParamList = {
  CustomerTabs:  undefined;
  FareEstimate:  { pickup: LocationInfo; delivery: LocationInfo; parcel: ParcelInfo; estimate: FareEstimate; paymentMethod: PaymentMethod };
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
