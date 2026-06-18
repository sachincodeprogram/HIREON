import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserProfile } from '../../types';

interface AuthState {
  profile: UserProfile | null;
  loading: boolean;
}

const initialState: AuthState = {
  profile: null,
  loading: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setProfile(state, action: PayloadAction<UserProfile | null>) {
      state.profile = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    clearAuth(state) {
      state.profile = null;
      state.loading = false;
    },
  },
});

export const { setProfile, setLoading, clearAuth } = authSlice.actions;
export default authSlice.reducer;
