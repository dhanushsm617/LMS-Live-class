import { createSlice } from '@reduxjs/toolkit';

// `ready` flips to true once we know whether a session cookie exists, so route guards don't flash.
const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, ready: false },
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
      state.ready = true;
    },
    clearUser(state) {
      state.user = null;
      state.ready = true;
    },
  },
});

export const { setUser, clearUser } = authSlice.actions;
export const selectUser = (s) => s.auth.user;
export const selectAuthReady = (s) => s.auth.ready;
export default authSlice.reducer;
