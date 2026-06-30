import { configureStore } from '@reduxjs/toolkit';
import chatReducer from './chatSlice';

export const store = configureStore({
  reducer: {
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore checking non-serializable values (like CryptoKey objects for E2EE if we put them in state)
        ignoredActions: ['chat/setActiveGroupKey'],
        ignoredPaths: ['chat.activeGroupKey'],
      },
    }),
});
