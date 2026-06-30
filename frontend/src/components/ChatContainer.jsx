import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  setContacts, setGroups, setMessages, appendMessage, updateMessageStatus,
  setActiveChat, addOnlineUser, removeOnlineUser, updateLastSeen,
  setTyping, clearTyping, setSidebarFilter, setReplyingTo,
  setOwnPublicKeyJwk, setActiveGroupKey, resetChatState
} from '../store/chatSlice';
import { 
  Users, User as UserIcon, MessageSquare, Send, Paperclip, 
  Smile, Plus, X, Search, Check, CheckCheck, Monitor, HelpCircle, ArrowLeft,
  FileText, Image as ImageIcon, CornerUpLeft, Info
} from 'lucide-react';
import {
  getOrCreateKeyPair,
  encryptDirectMessage,
  decryptDirectMessage,
  createGroupKeyExport,
  encryptGroupKeyForMember,
  decryptGroupKey,
  encryptGroupMessage,
  decryptGroupMessage
} from '../utils/cryptoHelper';

export default function ChatContainer({ user, token, socket, apiUrl }) {
  const dispatch = useDispatch();

  // Redux State Selectors
  const contacts = useSelector((state) => state.chat.contacts);
  const groups = useSelector((state) => state.chat.groups);
  const activeChat = useSelector((state) => state.chat.activeChat);
  const messages = useSelector((state) => state.chat.messages);
  const onlineUsersArray = useSelector((state) => state.chat.onlineUsers);
  const onlineUsers = new Set(onlineUsersArray); // Convert to Set locally for fast lookups
  const typingUsers = useSelector((state) => state.chat.typingUsers);
  const replyingTo = useSelector((state) => state.chat.replyingTo);
  const lastSeenMap = useSelector((state) => state.chat.lastSeenMap);
  const sidebarFilter = useSelector((state) => state.chat.sidebarFilter);
  const ownPublicKeyJwk = useSelector((state) => state.chat.ownPublicKeyJwk);
  const activeGroupKey = useSelector((state) => state.chat.activeGroupKey);

  // Local Component-Only States
  const [inputText, setInputText] = useState('');
  const [typingTimeout, setTypingTimeout] = useState(null);
  
  // Create Group Modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [searchContactQuery, setSearchContactQuery] = useState('');
  const [technologies, setTechnologies] = useState([]);
  const [internshipTypes, setInternshipTypes] = useState([]);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [selectedInternshipType, setSelectedInternshipType] = useState('');
  const [groupCategory, setGroupCategory] = useState('tech'); // 'tech' | 'internship'

  // Emojis & File Attachment states
  const [selectedFile, setSelectedFile] = useState(null); // { name, type: 'image' | 'file', base64 }
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // WhatsApp-Style Replies & Group Info states
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // New Chat panel & last seen map
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');

  // E2EE Private Key cache (needs to remain local/IndexedDB or stored securely)
  const [ownPrivateKey, setOwnPrivateKey] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null); // Notification sound ref
  
  const activeChatRef = useRef(activeChat);
  const ownPrivateKeyRef = useRef(null);
  const ownPublicKeyJwkRef = useRef(null);
  const activeGroupKeyRef = useRef(null);

  // Sync state refs to prevent stale closure bugs in socket listeners
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { ownPrivateKeyRef.current = ownPrivateKey; }, [ownPrivateKey]);
  useEffect(() => { ownPublicKeyJwkRef.current = ownPublicKeyJwk; }, [ownPublicKeyJwk]);
  useEffect(() => { activeGroupKeyRef.current = activeGroupKey; }, [activeGroupKey]);

  // Load private key on mount
  useEffect(() => {
    getOrCreateKeyPair()
      .then((keys) => {
        setOwnPrivateKey(keys.privateKey);
        dispatch(setOwnPublicKeyJwk(keys.publicKeyJwk));
        console.log('[E2EE] Keys loaded successfully.');
      })
      .catch((err) => {
        console.error('[E2EE] Failed to load keys:', err);
      });
  }, []);

  // Keep activeChatRef in sync
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Play notification sound helper
  const playNotificationSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/notification.wav');
        audioRef.current.volume = 0.5;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {}); // Ignore autoplay policy errors
    } catch (e) {
      // Silently ignore if audio fails
    }
  };

  // Load Contacts and Groups on mount
  useEffect(() => {
    fetchContacts();
    fetchGroups();
    fetchTechnologies();
    fetchInternshipTypes();
  }, []);

  // Auto-refresh contacts & groups every 30 seconds to keep unread counts fresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchContacts();
      fetchGroups();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Handle new message arrival
    const handleMessageReceived = async (msg) => {
      const currentActive = activeChatRef.current;
      // Determine if message belongs to current active chat
      const isCurrentDirect = currentActive?.type === 'direct' && 
        ((msg.senderId === currentActive.id && msg.receiverId === user.id) || 
         (msg.senderId === user.id && msg.receiverId === currentActive.id));
         
      const isCurrentGroup = currentActive?.type === 'group' && msg.groupId === currentActive.id;

      if (isCurrentDirect || isCurrentGroup) {
        // Decrypt message in real time
        const decryptedMsg = await decryptSingleMessage(msg);
        dispatch(appendMessage(decryptedMsg));
        
        // If received from someone else, mark it as read immediately
        if (msg.senderId !== user.id) {
          socket.emit('markRead', { 
            messageIds: [msg.id], 
            senderId: msg.senderId 
          });
        }
      } else {
        // Play notification sound for messages not in current view
        if (msg.senderId !== user.id) {
          playNotificationSound();
        }
      }

      // Always reload contacts & groups to update lastMessage and sorting immediately
      fetchContacts();
      fetchGroups();
    };

    // Handle user typing statuses
    const handleTypingStatus = (data) => {
      dispatch(setTyping({ userId: data.userId, isTyping: data.isTyping, groupId: data.groupId }));
    };

    // Handle online/offline updates
    const handleUserStatusChanged = (data) => {
      if (data.status === 'online') {
        dispatch(addOnlineUser(data.userId));
      } else {
        dispatch(removeOnlineUser(data.userId));
        if (data.lastSeen) {
          dispatch(updateLastSeen({ userId: data.userId, lastSeen: data.lastSeen }));
        }
      }
      fetchContacts();
    };

    // Handle message read receipts (blue ticks)
    const handleMessagesMarkedRead = (data) => {
      dispatch(updateMessageStatus({ messageIds: data.messageIds, isRead: 1 }));
    };

    // Handle in-app notifications (play sound when message comes from another chat)
    const handleInAppNotification = (data) => {
      const currentActive = activeChatRef.current;
      const isCurrentChat = 
        (data.senderId && currentActive?.type === 'direct' && currentActive?.id === data.senderId) ||
        (data.groupId && currentActive?.type === 'group' && currentActive?.id === data.groupId);
      
      if (!isCurrentChat) {
        playNotificationSound();
      }
    };

    // Handle socket reconnect — re-fetch data so messages load without re-login
    const handleReconnect = () => {
      fetchContacts();
      fetchGroups();
      // If there was an active chat, reload its messages
      const currentActive = activeChatRef.current;
      if (currentActive) {
        const historyUrl = currentActive.type === 'direct'
          ? `${apiUrl}/chat/history/private/${currentActive.id}`
          : `${apiUrl}/chat/history/group/${currentActive.id}`;
        fetch(historyUrl, { headers: { Authorization: `Bearer ${token}` } })
          .then(res => res.json())
          .then(async (data) => {
            const decrypted = await decryptMessageList(data, activeGroupKeyRef.current);
            dispatch(setMessages(decrypted));
          })
          .catch(() => {});
      }
    };

    socket.on('messageReceived', handleMessageReceived);
    socket.on('typingStatus', handleTypingStatus);
    socket.on('userStatusChanged', handleUserStatusChanged);
    socket.on('messagesMarkedRead', handleMessagesMarkedRead);
    socket.on('inAppNotification', handleInAppNotification);
    socket.io.on('reconnect', handleReconnect);

    return () => {
      socket.off('messageReceived', handleMessageReceived);
      socket.off('typingStatus', handleTypingStatus);
      socket.off('userStatusChanged', handleUserStatusChanged);
      socket.off('messagesMarkedRead', handleMessagesMarkedRead);
      socket.off('inAppNotification', handleInAppNotification);
      socket.io.off('reconnect', handleReconnect);
    };
  }, [socket, user]);

  // Scroll to bottom whenever messages list is updated
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);




  // Decrypt single message helper
  const decryptSingleMessage = async (msg, groupKey = null) => {
    // Check if it's direct or group E2EE
    const keyReceiver = msg.encryptedKeyReceiver || msg.encrypted_key_receiver;
    const keySender = msg.encryptedKeySender || msg.encrypted_key_sender;
    const hasKeys = keyReceiver || keySender;

    console.log('[E2EE Debug] decryptSingleMessage input:', {
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      groupId: msg.groupId,
      hasIv: !!msg.iv,
      hasKeys: !!hasKeys,
      msgPreview: msg.message ? msg.message.substring(0, 15) : ''
    });

    if (!msg.iv || !hasKeys) {
      console.log('[E2EE Debug] Bypassing decryption. Plain text or legacy message.');
      return msg; // Plain text / legacy message
    }

    try {
      if (msg.groupId) {
        const key = groupKey || activeGroupKeyRef.current;
        if (!key) {
          console.warn('[E2EE Debug] Group key missing for group:', msg.groupId);
          return { ...msg, message: '[Encrypted group message — Key loading...]' };
        }
        const decryptedText = await decryptGroupMessage(msg, key);
        return { ...msg, message: decryptedText };
      } else {
        const privKey = ownPrivateKeyRef.current;
        if (!privKey) {
          console.warn('[E2EE Debug] Own private key missing/not loaded.');
          return { ...msg, message: '[E2EE Message — Keys loading...]' };
        }
        const isSender = Number(msg.senderId) === Number(user.id);
        console.log('[E2EE Debug] Decrypting DM. isSender:', isSender, 'myUserId:', user.id, 'msgSenderId:', msg.senderId);
        const decryptedText = await decryptDirectMessage(msg, { key: privKey, isSender });
        console.log('[E2EE Debug] Decrypted DM text:', decryptedText ? decryptedText.substring(0, 15) : '');
        return { ...msg, message: decryptedText };
      }
    } catch (e) {
      console.error('[E2EE Debug] Decryption exception:', e);
      return { ...msg, message: '[Unable to decrypt E2EE message]' };
    }
  };

  // Asynchronous message decryptor for list
  const decryptMessageList = async (list, groupKey = null) => {
    const promises = list.map((msg) => decryptSingleMessage(msg, groupKey));
    return await Promise.all(promises);
  };

  // Handle active chat switching & E2EE key resolution
  useEffect(() => {
    if (!activeChat) return;

    // Reset typing status for active chat
    dispatch(clearTyping());
    dispatch(setReplyingTo(null));
    setShowGroupInfo(false);

    const loadChatHistory = async () => {
      let groupKeyToUse = null;

      // 1. Resolve Group key if switching to a group chat
      if (activeChat.type === 'group') {
        try {
          const groupRes = await fetch(`${apiUrl}/chat/groups`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (groupRes.ok) {
            const allGroups = await groupRes.json();
            const currentGroup = allGroups.find(g => g.id === activeChat.id);
            if (currentGroup) {
              const myMembership = currentGroup.members?.find(m => m.userId === user.id);
              if (myMembership && myMembership.encryptedGroupKey && ownPrivateKeyRef.current) {
                groupKeyToUse = await decryptGroupKey(myMembership.encryptedGroupKey, ownPrivateKeyRef.current);
                dispatch(setActiveGroupKey(groupKeyToUse));
                console.log('[E2EE] Resolved group key successfully.');
              }
            }
          }
        } catch (err) {
          console.error('[E2EE] Group key resolution failed:', err);
        }
      } else {
        dispatch(setActiveGroupKey(null));
      }

      // 2. Fetch history
      const historyUrl = activeChat.type === 'direct'
        ? `${apiUrl}/chat/history/private/${activeChat.id}`
        : `${apiUrl}/chat/history/group/${activeChat.id}`;

      try {
        const res = await fetch(historyUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Decrypt messages before setting state
          const decryptedData = await decryptMessageList(data, groupKeyToUse);
          dispatch(setMessages(decryptedData));

          // Mark incoming unread messages as read
          const unreadIds = decryptedData
            .filter((msg) => msg.senderId !== user.id && msg.isRead === 0)
            .map((msg) => msg.id);

          if (unreadIds.length > 0 && socket) {
            socket.emit('markRead', { 
              messageIds: unreadIds, 
              senderId: activeChat.id 
            });
          }
          
          // Trigger REST endpoint to mark read on direct messages
          if (activeChat.type === 'direct') {
            fetch(`${apiUrl}/chat/read/direct/${activeChat.id}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            }).then(() => fetchContacts());
          }
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };

    loadChatHistory();
  }, [activeChat, ownPrivateKey]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${apiUrl}/chat/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        dispatch(setContacts(data));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${apiUrl}/chat/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        dispatch(setGroups(data));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTechnologies = async () => {
    try {
      const res = await fetch(`${apiUrl}/chat/technologies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTechnologies(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInternshipTypes = async () => {
    try {
      const res = await fetch(`${apiUrl}/chat/internship-types`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInternshipTypes(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedFile({
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        base64: reader.result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!socket) return;
    if (!inputText.trim() && !selectedFile) return;

    const messageText = selectedFile ? selectedFile.name : inputText.trim();
    const messageType = selectedFile ? selectedFile.type : 'text';
    let filePath = selectedFile ? selectedFile.base64 : null;

    const payload = {
      receiverId: activeChat.type === 'direct' ? activeChat.id : null,
      groupId: activeChat.type === 'group' ? activeChat.id : null,
      message: messageText,
      messageType,
      filePath,
      parentId: replyingTo ? replyingTo.id : null,
    };

    try {
      if (activeChat.type === 'direct') {
        // Fetch receiver public key
        const keyRes = await fetch(`${apiUrl}/chat/public-key/${activeChat.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          if (keyData.publicKey && ownPublicKeyJwk) {
            // Perform E2EE Direct message encryption
            const encrypted = await encryptDirectMessage(messageText, keyData.publicKey, ownPublicKeyJwk);
            payload.message = encrypted.ciphertext;
            payload.encryptedKeyReceiver = encrypted.encryptedKeyReceiver;
            payload.encryptedKeySender = encrypted.encryptedKeySender;
            payload.iv = encrypted.iv;
            console.log('[E2EE] DM sent encrypted.');
          } else {
            console.warn('[E2EE] Receiver does not have a registered public key. Falling back to plain text.');
          }
        }
      } else if (activeChat.type === 'group') {
        if (activeGroupKey) {
          // Perform E2EE Group message encryption
          const encrypted = await encryptGroupMessage(messageText, activeGroupKey);
          payload.message = encrypted.ciphertext;
          payload.iv = encrypted.iv;
          console.log('[E2EE] Group message sent encrypted.');
        } else {
          console.warn('[E2EE] Group key is not active. Falling back to plain text.');
        }
      }
    } catch (encryptErr) {
      console.error('[E2EE] Encryption failed. Sending message failed:', encryptErr);
      return;
    }

    socket.emit('sendMessage', payload);
    setInputText('');
    setSelectedFile(null);
    dispatch(setReplyingTo(null));

    // Emit stop typing
    socket.emit('typing', {
      receiverId: activeChat.type === 'direct' ? activeChat.id : null,
      groupId: activeChat.type === 'group' ? activeChat.id : null,
      isTyping: false,
    });
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (!socket) return;

    // Send typing notification
    socket.emit('typing', {
      receiverId: activeChat.type === 'direct' ? activeChat.id : null,
      groupId: activeChat.type === 'group' ? activeChat.id : null,
      isTyping: true,
    });

    // Clear previous timeout and set a new one to stop typing indicator after inactivity
    if (typingTimeout) clearTimeout(typingTimeout);

    const timeout = setTimeout(() => {
      socket.emit('typing', {
        receiverId: activeChat.type === 'direct' ? activeChat.id : null,
        groupId: activeChat.type === 'group' ? activeChat.id : null,
        isTyping: false,
      });
    }, 2000);

    setTypingTimeout(timeout);
  };

  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || selectedMemberIds.length === 0) return;

    try {
      // 1. Generate E2EE Group AES Key (base64 string representation of raw key)
      const rawGroupKey = await createGroupKeyExport();

      // 2. Encrypt group key for each member
      const memberKeys = {};
      const allMembersToEncrypt = [...selectedMemberIds, user.id];
      
      const encryptionPromises = allMembersToEncrypt.map(async (memberId) => {
        try {
          const keyRes = await fetch(`${apiUrl}/chat/public-key/${memberId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (keyRes.ok) {
            const keyData = await keyRes.json();
            if (keyData.publicKey) {
              const encryptedGroupKey = await encryptGroupKeyForMember(rawGroupKey, keyData.publicKey);
              if (encryptedGroupKey) {
                memberKeys[memberId] = encryptedGroupKey;
              }
            }
          }
        } catch (err) {
          console.error('[E2EE] Failed to encrypt group key for member:', memberId, err);
        }
      });
      
      await Promise.all(encryptionPromises);

      const payload = {
        groupName: newGroupName.trim(),
        memberIds: selectedMemberIds,
        techId: groupCategory === 'tech' && selectedTechId ? parseInt(selectedTechId) : undefined,
        internshipType: groupCategory === 'internship' && selectedInternshipType !== '' ? parseInt(selectedInternshipType) : undefined,
        memberKeys,
      };

      const res = await fetch(`${apiUrl}/chat/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const newGroup = await res.json();
        // Subscribe socket client to the new room instantly
        if (socket) {
          socket.emit('joinGroupRoom', { groupId: newGroup.id });
        }
        
        // Since Redux list is fetched on mount and updated, we re-fetch groups
        fetchGroups();
        dispatch(setActiveChat({ type: 'group', id: newGroup.id, name: newGroup.groupName }));
        
        // Reset states
        setNewGroupName('');
        setSelectedMemberIds([]);
        setSelectedTechId('');
        setSelectedInternshipType('');
        setGroupCategory('tech');
        setShowCreateGroup(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    
    try {
      const res = await fetch(`${apiUrl}/chat/groups/${activeChat.id}/members/${memberUserId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const updatedGroup = await res.json();
        // Update local groups state
        setGroups((prev) =>
          prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleMemberSelection = (contactId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  // ── WhatsApp-style last seen formatter ──────────────────────────────────────
  const formatLastSeen = (userId) => {
    if (onlineUsers.has(userId)) return null; // online — don't show last seen
    const ts = lastSeenMap[userId] || contacts.find(c => c.id === userId)?.lastSeen;
    if (!ts) return 'last seen a while ago';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now - 86400000).toDateString() === d.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffMins < 1) return 'last seen just now';
    if (diffMins < 60) return `last seen ${diffMins}m ago`;
    if (isToday) return `last seen today at ${timeStr}`;
    if (isYesterday) return `last seen yesterday at ${timeStr}`;
    const dayStr = d.toLocaleDateString([], { weekday: 'short' });
    return `last seen ${dayStr} at ${timeStr}`;
  };

  // ── Recent chats: contacts + groups that have at least one message, sorted by lastMessage.createdAt ──
  const recentChats = [
    ...contacts
      .filter(c => c.lastMessage)
      .map(c => ({ ...c, chatType: 'direct', chatId: c.id, chatName: c.name })),
    ...groups
      .filter(g => g.lastMessage)
      .map(g => ({ ...g, chatType: 'group', chatId: g.id, chatName: g.groupName })),
  ]
    .filter(item =>
      item.chatName.toLowerCase().includes(searchContactQuery.toLowerCase())
    )
    .filter(item => {
      if (sidebarFilter === 'unread') return item.unreadCount > 0;
      if (sidebarFilter === 'groups') return item.chatType === 'group';
      return true; // 'all'
    })
    .sort((a, b) => {
      const aTime = new Date(a.lastMessage?.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessage?.createdAt || 0).getTime();
      return bTime - aTime; // newest first
    });

  // New-chat panel: all contacts + groups, filtered by search
  const newChatContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(newChatSearch.toLowerCase())
  ).sort((a, b) => {
    const aOnline = onlineUsers.has(a.id) ? 1 : 0;
    const bOnline = onlineUsers.has(b.id) ? 1 : 0;
    return bOnline - aOnline;
  });
  const newChatGroups = groups.filter(g =>
    g.groupName.toLowerCase().includes(newChatSearch.toLowerCase())
  );

  // ── Sorted groups: unread first (kept for create-group modal) ─────────────
  const sortedGroups = [...groups].sort(
    (a, b) => (b.unreadCount || 0) - (a.unreadCount || 0)
  );

  // Render typing text indicator helper
  const getTypingText = () => {
    if (activeChat.type === 'direct') {
      return typingUsers[activeChat.id]?.isTyping ? 'typing...' : null;
    } else {
      const typers = Object.keys(typingUsers)
        .filter((userId) => {
          const t = typingUsers[userId];
          return t?.isTyping && t?.groupId === activeChat.id;
        })
        .map((userId) => contacts.find((c) => c.id === parseInt(userId))?.name || 'Someone');
        
      if (typers.length === 0) return null;
      if (typers.length === 1) return `${typers[0]} is typing...`;
      return 'Multiple members are typing...';
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* ═══ LEFT SIDEBAR — WhatsApp style ══════════════════════════════════════ */}
      <aside className={`w-full md:w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0 bg-white dark:bg-gray-900/60 backdrop-blur-md ${
        activeChat ? 'hidden md:flex' : 'flex'
      }`}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Chats</h2>
            <div className="flex items-center gap-1">
              {/* New Chat button */}
              <button
                onClick={() => { setShowNewChat(true); setNewChatSearch(''); }}
                className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer"
                title="New Chat"
              >
                <MessageSquare size={18} />
              </button>
              {/* Create Group button */}
              <button
                onClick={() => setShowCreateGroup(true)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer"
                title="New Group"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={15} />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchContactQuery}
              onChange={(e) => setSearchContactQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
            />
          </div>

          {/* Filter Labels (WhatsApp Style) */}
          <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
              { id: 'groups', label: 'Groups' }
            ].map(tab => {
              const active = sidebarFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => dispatch(setSidebarFilter(tab.id))}
                  className={`text-xs px-3.5 py-1.5 rounded-full transition-all duration-200 font-semibold cursor-pointer shrink-0 ${
                    active
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-500/20 dark:shadow-blue-500/10'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800/80 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-transparent dark:border-gray-800/60'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Recent Chats List ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {recentChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-14 h-14 bg-blue-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <MessageSquare size={24} className="text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No chats yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tap the chat icon above to start a conversation</p>
            </div>
          ) : (
            <div className="py-1">
              {recentChats.map((item) => {
                const isGroup = item.chatType === 'group';
                const isActive = activeChat?.type === item.chatType && activeChat.id === item.chatId;
                const hasUnread = (item.unreadCount || 0) > 0 && !isActive;
                const isOnline = !isGroup && onlineUsers.has(item.chatId);
                const lastMsg = item.lastMessage;
                const lastTime = lastMsg?.createdAt
                  ? (() => {
                      const d = new Date(lastMsg.createdAt);
                      const now = new Date();
                      const isToday = d.toDateString() === now.toDateString();
                      const isYesterday = new Date(now - 86400000).toDateString() === d.toDateString();
                      if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      if (isYesterday) return 'Yesterday';
                      return d.toLocaleDateString([], { weekday: 'short' });
                    })()
                  : '';
                const avatarLetter = item.chatName.charAt(0).toUpperCase();

                return (
                  <button
                    key={`${item.chatType}-${item.chatId}`}
                    onClick={() => dispatch(setActiveChat({ type: item.chatType, id: item.chatId, name: item.chatName }))}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition text-left cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm ${
                        isGroup
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                          : 'bg-gradient-to-br from-sky-400 to-blue-600'
                      }`}>
                        {isGroup ? <Users size={20} /> : avatarLetter}
                      </div>
                      {/* Online dot */}
                      {isOnline && (
                        <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                      )}
                    </div>

                    {/* Chat info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-sm truncate ${ hasUnread ? 'font-bold text-gray-900 dark:text-white' : 'font-semibold text-gray-800 dark:text-gray-200' }`}>
                            {item.chatName}
                          </span>
                          {/* Supervisor badge */}
                          {!isGroup && item.isSupervisor && (
                            <span className="shrink-0 text-[9px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/40">
                              SUPERVISOR
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] shrink-0 ${ hasUnread ? 'text-blue-600 dark:text-sky-400 font-bold' : 'text-gray-400' }`}>
                          {lastTime}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-xs truncate ${ hasUnread ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400 dark:text-gray-500' }`}>
                          {lastMsg
                            ? (lastMsg.isMine ? `You: ${lastMsg.text}` : (isGroup ? `${item.lastMessage.senderName}: ${lastMsg.text}` : lastMsg.text))
                            : (isGroup ? 'Group created' : 'No messages yet')
                          }
                        </p>
                        {hasUnread && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                            {item.unreadCount > 99 ? '99+' : item.unreadCount}
                          </span>
                        )}
                      </div>
                      {/* Tech label for groups */}
                      {isGroup && item.technology?.name && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          {item.technology.name}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ═══ NEW CHAT PANEL ══════════════════════════════════════════════════════ */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewChat(false)} />
          {/* Panel slides from left */}
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="px-4 pt-5 pb-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setShowNewChat(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                >
                  <ArrowLeft size={20} />
                </button>
                <h3 className="font-bold text-lg">New Chat</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-white/60" size={15} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search people & groups..."
                  value={newChatSearch}
                  onChange={(e) => setNewChatSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-white/15 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:bg-white/20 transition"
                />
              </div>
            </div>

            {/* Contacts */}
            <div className="flex-1 overflow-y-auto">
              {newChatGroups.length > 0 && (
                <>
                  <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Groups</p>
                  {newChatGroups.map(g => (
                    <button
                      key={`ng-${g.id}`}
                      onClick={() => { dispatch(setActiveChat({ type: 'group', id: g.id, name: g.groupName })); setShowNewChat(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{g.groupName}</p>
                        <p className="text-xs text-gray-400 truncate">{g.technology?.name || 'Group'}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">People</p>
              {newChatContacts.map(contact => {
                const isOnline = onlineUsers.has(contact.id);
                return (
                  <button
                    key={`nc-${contact.id}`}
                    onClick={() => { dispatch(setActiveChat({ type: 'direct', id: contact.id, name: contact.name })); setShowNewChat(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer text-left"
                  >
                    {/* Avatar with online dot */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{contact.name}</p>
                        {contact.isSupervisor && (
                          <span className="shrink-0 text-[9px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 px-1.5 py-0.5 rounded-full">
                            SUPERVISOR
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {contact.technology?.name || contact.userRole}
                        {contact.isSupervisor && contact.technology?.name ? ' • Supervisor' : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold ${ isOnline ? 'text-green-500' : 'text-gray-400' }`}>
                      {isOnline ? 'online' : formatLastSeen(contact.id) || 'offline'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Workspace */}
      <section className={`flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950 ${
        activeChat ? 'flex' : 'hidden md:flex'
      }`}>
        {activeChat ? (
          <>
            {/* ── Chat Pane Header ─────────────────────────────────────────────── */}
            <header className="glass px-4 sm:px-6 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => dispatch(setActiveChat(null))}
                  className="md:hidden p-2 -ml-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer shrink-0"
                  title="Back to Chats"
                >
                  <ArrowLeft size={20} />
                </button>
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm ${
                    activeChat.type === 'group'
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                      : 'bg-gradient-to-br from-sky-400 to-blue-600'
                  }`}>
                    {activeChat.type === 'group' ? <Users size={18} /> : activeChat.name.charAt(0).toUpperCase()}
                  </div>
                  {activeChat.type === 'direct' && onlineUsers.has(activeChat.id) && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                    {activeChat.name}
                  </h3>
                  <p className="text-xs h-4 truncate">
                    {getTypingText() ? (
                      <span className="text-blue-600 dark:text-sky-400 animate-pulse">{getTypingText()}</span>
                    ) : activeChat.type === 'direct' ? (
                      onlineUsers.has(activeChat.id)
                        ? <span className="text-green-500 font-medium">online</span>
                        : <span className="text-gray-400">{formatLastSeen(activeChat.id) || 'offline'}</span>
                    ) : (
                      <span className="text-gray-400">{groups.find(g => g.id === activeChat.id)?.members?.length || 0} members</span>
                    )}
                  </p>
                </div>
              </div>

              {activeChat.type === 'group' && (
                <button
                  type="button"
                  onClick={() => setShowGroupInfo(!showGroupInfo)}
                  className={`p-2.5 rounded-xl transition smooth-hover cursor-pointer ${
                    showGroupInfo 
                      ? 'bg-blue-50 text-blue-600 dark:bg-sky-950/40 dark:text-sky-400' 
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title="Group Info"
                >
                  <Info size={20} />
                </button>
              )}
            </header>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => {
                const isMine = msg.senderId === user.id;
                return (
                  <div 
                    key={msg.id} 
                    className={`flex items-end gap-1.5 group relative max-w-[85%] ${
                      isMine ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
                    }`}
                  >
                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      {!isMine && (
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5 px-1">
                          {msg.sender?.name || 'Someone'}
                        </span>
                      )}
                      <div className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl shadow-sm text-sm ${
                        isMine
                          ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-tr-none'
                          : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200/80 dark:border-gray-800/60 rounded-tl-none'
                      }`}>
                        {msg.parent && (
                          <div className="bg-black/5 dark:bg-white/5 border-l-4 border-blue-500 rounded-r-lg pl-3 pr-2 py-1.5 mb-2 text-left text-xs opacity-90">
                            <p className="font-bold text-blue-600 dark:text-sky-400">{msg.parent.sender?.name || 'Someone'}</p>
                            <p className="text-gray-650 dark:text-gray-300 truncate max-w-[200px]">{msg.parent.messageType === 'text' ? msg.parent.message : '📎 Attachment'}</p>
                          </div>
                        )}

                        {msg.messageType === 'image' ? (
                          <div className="space-y-1">
                            <img 
                              src={msg.filePath} 
                              alt="sent attachment" 
                              className="max-w-xs max-h-60 rounded-xl object-cover hover:opacity-95 transition"
                            />
                            <p className="text-xs opacity-75 truncate">{msg.message}</p>
                          </div>
                        ) : msg.messageType === 'file' ? (
                          <a 
                            href={msg.filePath} 
                            download={msg.message} 
                            className={`flex items-center gap-3 p-3 rounded-xl border transition duration-200 ${
                              isMine 
                                ? 'bg-blue-700/30 border-blue-500/20 text-white hover:bg-blue-700/50' 
                                : 'bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                            }`}
                          >
                            <FileText className={isMine ? 'text-blue-200' : 'text-blue-500'} size={24} />
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-sm font-semibold truncate">{msg.message}</p>
                              <span className="text-[10px] opacity-75">Click to download</span>
                            </div>
                          </a>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        )}
                        
                        <div className={`flex items-center gap-1 mt-1.5 justify-end text-[10px] ${
                          isMine ? 'text-blue-100 opacity-75' : 'text-gray-400 opacity-75'
                        }`}>
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {/* Tick system: single gray = sent, double gray = delivered, double blue = seen */}
                          {isMine && (
                            <span className={`transition-colors duration-300 ${
                              msg.isRead === 1
                                ? 'text-sky-300' // Blue double tick = seen
                                : 'text-blue-200'  // Gray double tick = delivered (sent via socket)
                            }`}>
                              {msg.isRead === 1
                                ? <CheckCheck size={13} />
                                : <CheckCheck size={13} />
                              }
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reply Icon on Hover */}
                    <button
                      type="button"
                      onClick={() => dispatch(setReplyingTo({
                        id: msg.id,
                        senderName: msg.sender?.name || 'Someone',
                        text: msg.messageType === 'text' ? msg.message : '📎 Attachment'
                      }))}
                      className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-sky-400 rounded-lg hover:bg-gray-105 dark:hover:bg-gray-800 transition duration-150 cursor-pointer shrink-0"
                      title="Reply"
                    >
                      <CornerUpLeft size={16} />
                    </button>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* WhatsApp-Style Reply Preview Panel */}
            {replyingTo && (
              <div className="px-6 py-2.5 bg-blue-50/40 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between animate-in fade-in duration-150">
                <div className="border-l-4 border-blue-500 pl-3 min-w-0 text-left">
                  <p className="text-xs font-bold text-blue-600 dark:text-sky-400">Replying to {replyingTo.senderName}</p>
                  <p className="text-xs text-gray-550 dark:text-gray-400 truncate max-w-md">{replyingTo.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dispatch(setReplyingTo(null))}
                  className="text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-800 p-1.5 rounded-lg transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* File Attachment Preview Panel */}
            {selectedFile && (
              <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  {selectedFile.type === 'image' ? (
                    <ImageIcon size={18} className="text-blue-500 shrink-0" />
                  ) : (
                    <FileText size={18} className="text-blue-500 shrink-0" />
                  )}
                  <span className="truncate max-w-[250px] font-medium text-gray-800 dark:text-gray-200">{selectedFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-800 p-1.5 rounded-lg transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Chat Pane Footer Form Input */}
            <footer className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 relative">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              />

              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                {/* Attach button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 p-2 sm:p-2.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition smooth-hover cursor-pointer"
                  title="Attach File"
                >
                  <Paperclip size={18} />
                </button>

                {/* Text input — flex-1 so it takes remaining space */}
                <input
                  type="text"
                  placeholder={selectedFile ? "File ready to send..." : "Type a message..."}
                  value={inputText}
                  onChange={handleInputChange}
                  disabled={!!selectedFile}
                  className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition disabled:opacity-60"
                />

                {/* Emoji popover wrapper */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2 sm:p-2.5 rounded-xl transition smooth-hover cursor-pointer ${
                      showEmojiPicker 
                        ? 'bg-blue-50 text-blue-600 dark:bg-sky-950/40 dark:text-sky-400' 
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    title="Emoji"
                  >
                    <Smile size={18} />
                  </button>

                  {showEmojiPicker && (
                    <div className="absolute right-0 bottom-14 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 shadow-xl grid grid-cols-8 gap-1.5 w-56 sm:w-64 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {['😀', '😂', '😊', '😍', '👍', '🔥', '🎉', '❤️', '👏', '🙌', '🚀', '💯', '😜', '😎', '😢', '😮'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setInputText((prev) => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="w-7 h-7 text-lg flex items-center justify-center hover:scale-125 transition cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send button — always visible, never shrinks */}
                <button
                  type="submit"
                  disabled={!inputText.trim() && !selectedFile}
                  className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 flex items-center justify-center"
                >
                  <Send size={17} />
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="bg-blue-50 dark:bg-gray-900 p-6 rounded-3xl mb-4 animate-bounce">
              <img src="/logo.png" alt="DoTalk Logo" className="w-16 h-16 object-contain" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">DoTalk Lounge</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
              Select an employee or create a group from the sidebar to start collaborating in real-time.
            </p>
          </div>
        )}
      </section>

      {/* Right Sidebar - Group Info Drawer */}
      {showGroupInfo && activeChat && activeChat.type === 'group' && (
        <aside className="w-72 border-l border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900/60 backdrop-blur-md shrink-0 animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Group Info</h4>
            <button
              onClick={() => setShowGroupInfo(false)}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Group info summary */}
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-950/40 rounded-2xl border border-gray-200/50 dark:border-gray-800">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 rounded-xl flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                {activeChat.name.substring(0, 2).toUpperCase()}
              </div>
              <h5 className="font-bold text-gray-900 dark:text-white truncate text-sm">{activeChat.name}</h5>
              
              {groups.find(g => g.id === activeChat.id) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 justify-center">
                  {groups.find(g => g.id === activeChat.id).technology && (
                    <span className="text-[10px] font-semibold bg-blue-50 dark:bg-sky-950/40 text-blue-600 dark:text-sky-400 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/20">
                      {groups.find(g => g.id === activeChat.id).technology.name}
                    </span>
                  )}
                  {groups.find(g => g.id === activeChat.id).internshipType !== null && (
                    <span className="text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full border border-purple-100 dark:border-purple-900/20">
                      {groups.find(g => g.id === activeChat.id).internshipType === 0 ? 'Task-based' : 'Learning-based'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Leader / Supervisor */}
            {groups.find(g => g.id === activeChat.id)?.supervisorId && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block text-left">Group Leader</span>
                <div className="flex items-center gap-3 p-3 bg-blue-50/20 dark:bg-sky-950/10 rounded-xl border border-blue-500/10 text-left">
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold rounded-xl flex items-center justify-center text-sm shadow-sm shadow-blue-500/10">
                    {groups.find(g => g.id === activeChat.id).members?.find(m => m.userId === groups.find(g => g.id === activeChat.id).supervisorId)?.user?.name?.charAt(0) || 'L'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {groups.find(g => g.id === activeChat.id).members?.find(m => m.userId === groups.find(g => g.id === activeChat.id).supervisorId)?.user?.name || 'Supervisor'}
                    </p>
                    <span className="text-[9px] text-blue-600 dark:text-sky-400 font-bold uppercase tracking-wider">Supervisor</span>
                  </div>
                </div>
              </div>
            )}

            {/* Members List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block text-left">
                Members ({groups.find(g => g.id === activeChat.id)?.members?.length || 0})
              </span>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {groups.find(g => g.id === activeChat.id)?.members?.map((m) => {
                  const isCreator = groups.find(g => g.id === activeChat.id).createdBy === m.userId;
                  const isSupervisor = groups.find(g => g.id === activeChat.id).supervisorId === m.userId;
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/40 transition text-left">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold rounded-lg flex items-center justify-center text-xs">
                        {m.user?.name?.charAt(0) || 'M'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{m.user?.name}</p>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate block">
                          {m.user?.technology?.name || m.user?.userRole}
                        </span>
                      </div>
                      {isSupervisor && (
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 dark:text-sky-400 dark:bg-sky-950/40 px-1.5 py-0.5 rounded-md shrink-0">Leader</span>
                      )}
                      {isCreator && !isSupervisor && (
                        <span className="text-[9px] font-bold text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800 px-1.5 py-0.5 rounded-md shrink-0">Creator</span>
                      )}
                      {groups.find(g => g.id === activeChat.id)?.createdBy === user.id && m.userId !== user.id && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.userId)}
                          className="text-[9px] font-bold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer shrink-0 ml-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full glass-card rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => {
                setShowCreateGroup(false);
                setNewGroupName('');
                setSelectedMemberIds([]);
              }}
              className="absolute right-4 top-4 p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Create Chat Group</h3>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
                  placeholder="Enter group name (e.g., React JS interns)"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Technology Stack
                  </label>
                  <select
                    value={selectedTechId}
                    onChange={(e) => setSelectedTechId(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition cursor-pointer"
                  >
                    <option value="">Select stack...</option>
                    {technologies.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Internship Mode
                  </label>
                  <select
                    value={selectedInternshipType}
                    onChange={(e) => setSelectedInternshipType(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition cursor-pointer"
                  >
                    <option value="">Select mode...</option>
                    {internshipTypes.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Add Members ({selectedMemberIds.length})
                </label>
                <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
                  {contacts.map((contact) => {
                    const isSelected = selectedMemberIds.includes(contact.id);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleMemberSelection(contact.id)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                      >
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-gray-200">{contact.name}</p>
                          <p className="text-xs text-gray-400">{contact.technology?.name || contact.userRole}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'border-gray-300 dark:border-gray-700'
                        }`}>
                          {isSelected && <Check size={14} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={!newGroupName.trim() || selectedMemberIds.length === 0}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
