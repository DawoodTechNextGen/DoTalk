import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  contacts: [],
  groups: [],
  messages: [],
  activeChat: null,
  onlineUsers: [], // Array to be JSON serializable
  lastSeenMap: {},
  typingUsers: {},
  sidebarFilter: 'all',
  replyingTo: null,
  ownPublicKeyJwk: null,
  activeGroupKey: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setContacts(state, action) {
      state.contacts = action.payload;
    },
    setGroups(state, action) {
      state.groups = action.payload;
    },
    setMessages(state, action) {
      state.messages = action.payload;
    },
    appendMessage(state, action) {
      state.messages.push(action.payload);
    },
    updateMessageStatus(state, action) {
      const { messageIds, isRead } = action.payload;
      state.messages.forEach(msg => {
        if (messageIds.includes(msg.id)) {
          msg.isRead = isRead;
        }
      });
    },
    setActiveChat(state, action) {
      state.activeChat = action.payload;
      state.replyingTo = null; // Clear reply status on chat change
      state.activeGroupKey = null; // Clear group key
    },
    setOnlineUsers(state, action) {
      state.onlineUsers = action.payload;
    },
    addOnlineUser(state, action) {
      if (!state.onlineUsers.includes(action.payload)) {
        state.onlineUsers.push(action.payload);
      }
    },
    removeOnlineUser(state, action) {
      state.onlineUsers = state.onlineUsers.filter(id => id !== action.payload);
    },
    updateLastSeen(state, action) {
      const { userId, lastSeen } = action.payload;
      state.lastSeenMap[userId] = lastSeen;
    },
    setTyping(state, action) {
      const { userId, isTyping, groupId } = action.payload;
      state.typingUsers[userId] = { isTyping, groupId };
    },
    clearTyping(state) {
      state.typingUsers = {};
    },
    setSidebarFilter(state, action) {
      state.sidebarFilter = action.payload;
    },
    setReplyingTo(state, action) {
      state.replyingTo = action.payload;
    },
    setOwnPublicKeyJwk(state, action) {
      state.ownPublicKeyJwk = action.payload;
    },
    setActiveGroupKey(state, action) {
      state.activeGroupKey = action.payload;
    },
    resetChatState(state) {
      return initialState;
    }
  }
});

export const {
  setContacts,
  setGroups,
  setMessages,
  appendMessage,
  updateMessageStatus,
  setActiveChat,
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  updateLastSeen,
  setTyping,
  clearTyping,
  setSidebarFilter,
  setReplyingTo,
  setOwnPublicKeyJwk,
  setActiveGroupKey,
  resetChatState
} = chatSlice.actions;

export default chatSlice.reducer;
