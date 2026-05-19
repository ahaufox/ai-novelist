import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import httpClient from '../utils/httpClient';
import type { UserInfo } from '../types/api';

// ==================== State ====================

export interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  initialized: false,
};

// ==================== Async Thunks ====================

/** 检查登录状态（应用启动时） */
export const checkAuthStatusAsync = createAsyncThunk(
  'auth/checkStatus',
  async (_, { rejectWithValue }) => {
    try {
      const data = await httpClient.get('/api/auth/status') as { isAuthenticated: boolean; user: UserInfo | null };
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || '检查登录状态失败');
    }
  },
);

/** 登录 */
export const loginAsync = createAsyncThunk(
  'auth/login',
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    try {
      const data = await httpClient.post('/api/auth/login', { username, password }) as { user: UserInfo; isAuthenticated: boolean };
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || '登录失败');
    }
  },
);

/** 获取当前用户信息 */
export const fetchUserAsync = createAsyncThunk(
  'auth/fetchUser',
  async (_, { rejectWithValue }) => {
    try {
      const data = await httpClient.get('/api/auth/me') as UserInfo;
      return data;
    } catch (err: any) {
      return rejectWithValue(err.message || '获取用户信息失败');
    }
  },
);

/** 登出 */
export const logoutAsync = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await httpClient.post('/api/auth/logout', {});
      return true;
    } catch (err: any) {
      return rejectWithValue(err.message || '登出失败');
    }
  },
);

// ==================== Slice ====================

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // --- checkAuthStatus ---
    builder.addCase(checkAuthStatusAsync.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(checkAuthStatusAsync.fulfilled, (state, action) => {
      state.isLoading = false;
      state.initialized = true;
      state.isAuthenticated = action.payload.isAuthenticated;
      state.user = action.payload.user;
    });
    builder.addCase(checkAuthStatusAsync.rejected, (state) => {
      state.isLoading = false;
      state.initialized = true;
      state.isAuthenticated = false;
      state.user = null;
    });
    // --- login ---
    builder.addCase(loginAsync.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(loginAsync.fulfilled, (state, action) => {
      state.isLoading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
    });
    builder.addCase(loginAsync.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload as string;
    });
    // --- fetchUser ---
    builder.addCase(fetchUserAsync.fulfilled, (state, action) => {
      state.user = action.payload;
    });
    builder.addCase(fetchUserAsync.rejected, (state) => {
      state.user = null;
      state.isAuthenticated = false;
    });
    // --- logout ---
    builder.addCase(logoutAsync.fulfilled, (state) => {
      state.isAuthenticated = false;
      state.user = null;
    });
    builder.addCase(logoutAsync.rejected, (state) => {
      state.isAuthenticated = false;
      state.user = null;
    });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
