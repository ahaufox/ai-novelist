import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { updater } from '../../wailsjs/go/models';

export interface WebviewTab {
  id: string;
  title: string;
  url: string;
}

export interface UserInfo {
  email?: string;
  is_verified?: boolean;
  created_at?: string;
}

export interface LauncherState {
  logs: string[];
  updateStatus: updater.UpdateStatus | null;
  checkingUpdate: boolean;
  updating: boolean;
  progress: number;
  copied: boolean;
  backendRunning: boolean;
  frontendRunning: boolean;
  webviewTabs: WebviewTab[];
  // 认证状态
  isAuthenticated: boolean;
  user: UserInfo | null;
  authLoading: boolean;
}

const initialState: LauncherState = {
  logs: [],
  updateStatus: null,
  checkingUpdate: false,
  updating: false,
  progress: 0,
  copied: false,
  backendRunning: false,
  frontendRunning: false,
  webviewTabs: [],
  isAuthenticated: false,
  user: null,
  authLoading: false,
};

export const launcherSlice = createSlice({
  name: 'launcherSlice',
  initialState,
  reducers: {
    addLog: (state: Draft<LauncherState>, action: PayloadAction<string>) => {
      state.logs.push(action.payload);
    },
    setLogs: (state: Draft<LauncherState>, action: PayloadAction<string[]>) => {
      state.logs = action.payload;
    },
    setUpdateStatus: (state: Draft<LauncherState>, action: PayloadAction<updater.UpdateStatus | null>) => {
      state.updateStatus = action.payload;
    },
    setCheckingUpdate: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.checkingUpdate = action.payload;
    },
    setUpdating: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.updating = action.payload;
    },
    setProgress: (state: Draft<LauncherState>, action: PayloadAction<number>) => {
      state.progress = action.payload;
    },
    setCopied: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.copied = action.payload;
    },
    setBackendRunning: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.backendRunning = action.payload;
    },
    setFrontendRunning: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.frontendRunning = action.payload;
    },
    resetProgress: (state: Draft<LauncherState>) => {
      state.progress = 0;
    },
    addWebviewTab: (state: Draft<LauncherState>, action: PayloadAction<WebviewTab>) => {
      const exists = state.webviewTabs.find((t) => t.id === action.payload.id);
      if (!exists) {
        state.webviewTabs.push(action.payload);
      }
    },
    removeWebviewTab: (state: Draft<LauncherState>, action: PayloadAction<string>) => {
      state.webviewTabs = state.webviewTabs.filter((t) => t.id !== action.payload);
    },
    // 认证状态
    setAuthenticated: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.isAuthenticated = action.payload;
    },
    setUser: (state: Draft<LauncherState>, action: PayloadAction<UserInfo | null>) => {
      state.user = action.payload;
    },
    setAuthLoading: (state: Draft<LauncherState>, action: PayloadAction<boolean>) => {
      state.authLoading = action.payload;
    },
  },
});

export const {
  addLog,
  setLogs,
  setUpdateStatus,
  setCheckingUpdate,
  setUpdating,
  setProgress,
  setCopied,
  setBackendRunning,
  setFrontendRunning,
  resetProgress,
  addWebviewTab,
  removeWebviewTab,
  setAuthenticated,
  setUser,
  setAuthLoading,
} = launcherSlice.actions;

export default launcherSlice.reducer;
