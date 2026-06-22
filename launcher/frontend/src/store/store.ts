import { configureStore } from '@reduxjs/toolkit'
import launcherReducer from './launcher'

export const store = configureStore({
  reducer: {
    launcherSlice: launcherReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
