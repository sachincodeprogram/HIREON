import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Order, EarningsData } from '../../types';

interface RiderState {
  isOnline:       boolean;
  pendingRequests: Order[];
  earnings:       EarningsData | null;
}

const initialState: RiderState = {
  isOnline:       false,
  pendingRequests: [],
  earnings:       null,
};

const riderSlice = createSlice({
  name: 'rider',
  initialState,
  reducers: {
    setOnlineStatus(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
    },
    setPendingRequests(state, action: PayloadAction<Order[]>) {
      state.pendingRequests = action.payload;
    },
    addPendingRequest(state, action: PayloadAction<Order>) {
      const exists = state.pendingRequests.some(o => o._id === action.payload._id);
      if (!exists) state.pendingRequests.unshift(action.payload);
    },
    removePendingRequest(state, action: PayloadAction<string>) {
      state.pendingRequests = state.pendingRequests.filter(o => o._id !== action.payload);
    },
    setEarnings(state, action: PayloadAction<EarningsData>) {
      state.earnings = action.payload;
    },
  },
});

export const { setOnlineStatus, setPendingRequests, addPendingRequest, removePendingRequest, setEarnings } = riderSlice.actions;
export default riderSlice.reducer;
