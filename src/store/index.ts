import { configureStore } from '@reduxjs/toolkit';
import authReducer  from './slices/authSlice';
import orderReducer from './slices/orderSlice';
import riderReducer from './slices/riderSlice';

export const store = configureStore({
  reducer: {
    auth:  authReducer,
    order: orderReducer,
    rider: riderReducer,
  },
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
