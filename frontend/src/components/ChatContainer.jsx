import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, User as UserIcon, MessageSquare, Send, Paperclip, 
  Smile, Plus, X, Search, Check, CheckCheck, Monitor, HelpCircle, ArrowLeft,
  FileText, Image as ImageIcon, CornerUpLeft, Info
} from 'lucide-react';

export default function ChatContainer({ user, token, socket, apiUrl }) {
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeChat, setActiveChat] = useState(null); // { type: 'direct' | 'group', id: number, name: string }
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  
  // Real-time states
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({}); // userId -> { isTyping: boolean, groupId?: number }
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
  const [replyingTo, setReplyingTo] = useState(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load Contacts and Groups on mount
  useEffect(() => {
    fetchContacts();
    fetchGroups();
    fetchTechnologies();
    fetchInternshipTypes();
  }, []);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Handle new message arrival
    const handleMessageReceived = (msg) => {
      // Determine if message belongs to current active chat
      const isCurrentDirect = activeChat?.type === 'direct' && 
        ((msg.senderId === activeChat.id && msg.receiverId === user.id) || 
         (msg.senderId === user.id && msg.receiverId === activeChat.id));
         
      const isCurrentGroup = activeChat?.type === 'group' && msg.groupId === activeChat.id;

      if (isCurrentDirect || isCurrentGroup) {
        setMessages((prev) => [...prev, msg]);
        
        // If received from someone else, mark it as read immediately
        if (msg.senderId !== user.id) {
          socket.emit('markRead', { 
            messageIds: [msg.id], 
            senderId: msg.senderId 
          });
        }
      } else {
        // Increment unread status badge in contacts or groups
        if (msg.groupId) {
          fetchGroups();
        } else {
          fetchContacts();
        }
      }
    };

    // Handle user typing statuses
    const handleTypingStatus = (data) => {
      setTypingUsers((prev) => ({
        ...prev,
        [data.userId]: { isTyping: data.isTyping, groupId: data.groupId },
      }));
    };

    // Handle online/offline updates
    const handleUserStatusChanged = (data) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (data.status === 'online') {
          next.add(data.userId);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    };

    // Handle message read receipts
    const handleMessagesMarkedRead = (data) => {
      setMessages((prev) => 
        prev.map((msg) => 
          data.messageIds.includes(msg.id) ? { ...msg, isRead: 1 } : msg
        )
      );
    };

    socket.on('messageReceived', handleMessageReceived);
    socket.on('typingStatus', handleTypingStatus);
    socket.on('userStatusChanged', handleUserStatusChanged);
    socket.on('messagesMarkedRead', handleMessagesMarkedRead);

    return () => {
      socket.off('messageReceived', handleMessageReceived);
      socket.off('typingStatus', handleTypingStatus);
      socket.off('userStatusChanged', handleUserStatusChanged);
      socket.off('messagesMarkedRead', handleMessagesMarkedRead);
    };
  }, [socket, activeChat, user]);

  // Scroll to bottom whenever messages list is updated
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Handle active chat switching
  useEffect(() => {
    if (!activeChat) return;

    // Reset typing status for active chat
    setTypingUsers({});
    setReplyingTo(null);
    setShowGroupInfo(false);

    // Load message history
    const historyUrl = activeChat.type === 'direct'
      ? `${apiUrl}/chat/history/private/${activeChat.id}`
      : `${apiUrl}/chat/history/group/${activeChat.id}`;

    fetch(historyUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setMessages(data);

        // Mark incoming unread messages as read
        const unreadIds = data
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
      });
  }, [activeChat]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${apiUrl}/chat/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
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
        setGroups(data);
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!socket) return;
    if (!inputText.trim() && !selectedFile) return;

    const payload = {
      receiverId: activeChat.type === 'direct' ? activeChat.id : null,
      groupId: activeChat.type === 'group' ? activeChat.id : null,
      message: selectedFile ? selectedFile.name : inputText.trim(),
      messageType: selectedFile ? selectedFile.type : 'text',
      filePath: selectedFile ? selectedFile.base64 : null,
      parentId: replyingTo ? replyingTo.id : null,
    };

    socket.emit('sendMessage', payload);
    setInputText('');
    setSelectedFile(null);
    setReplyingTo(null);

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
      const payload = {
        groupName: newGroupName.trim(),
        memberIds: selectedMemberIds,
        techId: groupCategory === 'tech' && selectedTechId ? parseInt(selectedTechId) : undefined,
        internshipType: groupCategory === 'internship' && selectedInternshipType !== '' ? parseInt(selectedInternshipType) : undefined,
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
        
        setGroups((prev) => [...prev, newGroup]);
        setActiveChat({ type: 'group', id: newGroup.id, name: newGroup.groupName });
        
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

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchContactQuery.toLowerCase())
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
      {/* Left Sidebar - Navigation & Chats */}
      <aside className={`w-full md:w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0 bg-white dark:bg-gray-900/60 backdrop-blur-md ${
        activeChat ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Search contacts input */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 text-gray-400" size={17} />
            <input
              type="text"
              placeholder="Search chat..."
              value={searchContactQuery}
              onChange={(e) => setSearchContactQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition"
            />
          </div>
          <button 
            onClick={() => setShowCreateGroup(true)}
            className="p-2.5 bg-blue-50 dark:bg-sky-950/40 text-blue-600 dark:text-sky-400 rounded-xl hover:bg-blue-100 dark:hover:bg-sky-950 transition cursor-pointer"
            title="Create Chat Group"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Channels / Scrollable Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/40">
          {/* Groups list */}
          <div className="p-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase px-2 mb-2">
              <span>Groups ({groups.length})</span>
            </div>
            <div className="space-y-1">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActiveChat({ type: 'group', id: group.id, name: group.groupName })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left cursor-pointer smooth-hover ${
                    activeChat?.type === 'group' && activeChat.id === group.id
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/15'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className={`p-2 rounded-xl ${
                    activeChat?.type === 'group' && activeChat.id === group.id
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-50 dark:bg-gray-800 text-blue-600 dark:text-sky-400'
                  }`}>
                    <Users size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{group.groupName}</p>
                    <p className={`text-xs truncate opacity-75 ${
                      activeChat?.type === 'group' && activeChat.id === group.id
                        ? 'text-white'
                        : 'text-gray-400'
                    }`}>
                      {group.technology?.name || 'General Team'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Direct Contacts list */}
          <div className="p-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase px-2 mb-2">
              <span>Private Messages ({filteredContacts.length})</span>
            </div>
            <div className="space-y-1">
              {filteredContacts.map((contact) => {
                const isOnline = onlineUsers.has(contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => setActiveChat({ type: 'direct', id: contact.id, name: contact.name })}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left cursor-pointer smooth-hover ${
                      activeChat?.type === 'direct' && activeChat.id === contact.id
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/15'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="relative">
                      <div className={`p-2 rounded-xl ${
                        activeChat?.type === 'direct' && activeChat.id === contact.id
                          ? 'bg-white/20 text-white'
                          : 'bg-sky-50 dark:bg-gray-800 text-sky-600 dark:text-sky-400'
                      }`}>
                        <UserIcon size={18} />
                      </div>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 ${
                        isOnline ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <p className="font-semibold text-sm truncate">{contact.name}</p>
                        <span className={`text-[10px] ${
                          isOnline ? 'text-green-500 font-semibold' : 'text-gray-400'
                        }`}>
                          {isOnline ? 'online' : 'offline'}
                        </span>
                      </div>
                      <p className={`text-xs truncate opacity-75 ${
                        activeChat?.type === 'direct' && activeChat.id === contact.id
                          ? 'text-white'
                          : 'text-gray-400'
                      }`}>
                        {contact.technology?.name || contact.userRole}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Workspace */}
      <section className={`flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950 ${
        activeChat ? 'flex' : 'hidden md:flex'
      }`}>
        {activeChat ? (
          <>
            {/* Chat Pane Header */}
            <header className="glass px-6 py-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveChat(null)}
                  className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer"
                  title="Back to Chats"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {activeChat.type === 'group' ? <Users size={18} className="text-blue-500" /> : <UserIcon size={18} className="text-sky-400" />}
                    {activeChat.name}
                  </h3>
                  <p className="text-xs text-blue-600 dark:text-sky-400 h-4">
                    {getTypingText()}
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
                    className={`flex items-center gap-2 group relative max-w-[85%] ${
                      isMine ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
                    }`}
                  >
                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      {!isMine && (
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 px-1">
                          {msg.sender?.name || 'Someone'}
                        </span>
                      )}
                      <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                        isMine
                          ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-tr-none'
                          : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800/80 rounded-tl-none'
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
                        
                        <div className={`flex items-center gap-1 mt-1.5 justify-end text-[10px] opacity-75 ${
                          isMine ? 'text-blue-100' : 'text-gray-400'
                        }`}>
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMine && (
                            <span>
                              {msg.isRead === 1 ? <CheckCheck size={12} /> : <Check size={12} />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reply Icon on Hover */}
                    <button
                      type="button"
                      onClick={() => setReplyingTo({
                        id: msg.id,
                        senderName: msg.sender?.name || 'Someone',
                        text: msg.messageType === 'text' ? msg.message : '📎 Attachment'
                      })}
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
                  onClick={() => setReplyingTo(null)}
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
            <footer className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 relative">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              />

              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition smooth-hover cursor-pointer"
                  title="Attach File"
                >
                  <Paperclip size={20} />
                </button>

                <input
                  type="text"
                  placeholder={selectedFile ? "Selected file ready to send..." : "Type a message..."}
                  value={inputText}
                  onChange={handleInputChange}
                  disabled={!!selectedFile}
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition disabled:opacity-60"
                />

                {/* Emoji popover wrapper */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2.5 rounded-xl transition smooth-hover cursor-pointer ${
                      showEmojiPicker 
                        ? 'bg-blue-50 text-blue-600 dark:bg-sky-950/40 dark:text-sky-400' 
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    title="Emoji"
                  >
                    <Smile size={20} />
                  </button>

                  {showEmojiPicker && (
                    <div className="absolute right-0 bottom-14 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 shadow-xl grid grid-cols-8 gap-2 w-64 animate-in fade-in slide-in-from-bottom-2 duration-200">
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

                <button
                  type="submit"
                  disabled={!inputText.trim() && !selectedFile}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/10 flex items-center justify-center shrink-0"
                >
                  <Send size={20} />
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
