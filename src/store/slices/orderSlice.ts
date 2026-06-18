import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Order, Coordinates } from '../../types';

interface OrderState {
  orders:       Order[];
  activeOrder:  Order | null;
  riderCoords:  Coordinates | null;
  loading:      boolean;
}

const initialState: OrderState = {
  orders:      [],
  activeOrder: null,
  riderCoords: null,
  loading:     false,
};

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    setOrders(state, action: PayloadAction<Order[]>) {
      state.orders = action.payload;
    },
    setActiveOrder(state, action: PayloadAction<Order | null>) {
      state.activeOrder = action.payload;
    },
    updateActiveOrderStatus(state, action: PayloadAction<Order['status']>) {
      if (state.activeOrder) state.activeOrder.status = action.payload;
    },
    setRiderCoords(state, action: PayloadAction<Coordinates | null>) {
      state.riderCoords = action.payload;
    },
    setOrderLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    prependOrder(state, action: PayloadAction<Order>) {
      state.orders.unshift(action.payload);
    },
  },
});

export const { setOrders, setActiveOrder, updateActiveOrderStatus, setRiderCoords, setOrderLoading, prependOrder } = orderSlice.actions;
export default orderSlice.reducer;
