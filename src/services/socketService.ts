import { io, Socket } from 'socket.io-client';
import auth from '@react-native-firebase/auth';
import { SOCKET_URL } from '../constants/api';
import { getDevPhone } from './apiClient';

let socket: Socket | null = null;

export const connectSocket = async (): Promise<Socket> => {
  if (socket?.connected) return socket;

  let token = await auth().currentUser?.getIdToken();
  // Dev mode: agar test login se aaye hain to dev:<phone> token bhejo
  const devPhone = getDevPhone();
  if (__DEV__ && devPhone) token = `dev:${devPhone}`;
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
  });
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const getSocket = (): Socket | null => socket;

export const trackOrder = (orderId: string) => {
  socket?.emit('track_order', orderId);
};

export const joinOrderRoom = (orderId: string) => {
  socket?.emit('join_order', orderId);
};

export const emitRiderLocation = (orderId: string, lat: number, lng: number, heading: number) => {
  socket?.emit('rider_location', { orderId, lat, lng, heading });
};
