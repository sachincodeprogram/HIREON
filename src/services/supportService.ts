import { Platform } from 'react-native';
import apiClient from './apiClient';
import { SupportCategory, SupportTicket, SupportTicketSummary } from '../types';

// Help & Support — customer aur rider dono ke tickets. Backend har user ko
// sirf uske apne tickets dikhata hai.

export const createSupportTicket = async (payload: {
  category: SupportCategory;
  message: string;
  orderId?: string;
}): Promise<SupportTicket> => {
  const { data } = await apiClient.post('/support/tickets', {
    ...payload,
    platform: `${Platform.OS} ${Platform.Version}`,
  });
  return data.data;
};

export const getMySupportTickets = async (): Promise<SupportTicketSummary[]> => {
  const { data } = await apiClient.get('/support/tickets');
  return data.data;
};

export const getSupportTicket = async (id: string): Promise<SupportTicket> => {
  const { data } = await apiClient.get(`/support/tickets/${id}`);
  return data.data;
};

export const sendSupportMessage = async (id: string, message: string): Promise<SupportTicket> => {
  const { data } = await apiClient.post(`/support/tickets/${id}/messages`, { message });
  return data.data;
};
