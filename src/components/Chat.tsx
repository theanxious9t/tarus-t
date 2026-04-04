import React, { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { db, auth, handleFirestoreError, OperationType, getChatId, sendPushNotification } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, limit, updateDoc, doc, getDocs, getDoc, Timestamp, arrayUnion, arrayRemove } from "firebase/firestore";
import socket from "../lib/socket";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import ConfirmationModal from "./ConfirmationModal";
import { ScrambleText } from "./ScrambleText";
import { 
  Send, 
  Smile, 
  Paperclip, 
  Video, 
  Phone, 
  MoreVertical, 
  Sparkles, 
  Mic, 
  Trash2, 
  Shield, 
  ShieldOff, 
  X, 
  Play, 
  Pause, 
  Settings, 
  Users, 
  Plus,
  MapPin,
  Star,
  Pin,
  Download,
  Lock,
  BellOff,
  Music,
  Clock,
  ChevronRight,
  ShieldCheck,
  Search,
  Image as ImageIcon,
  File as FileIcon,
  Copy,
  Forward,
  Edit2,
  Check,
  CheckCheck,
  Crown,
  UserMinus,
  LogOut,
  Monitor
} from "lucide-react";
import CallQualitySettings from "./CallQualitySettings";
import { getAIResponse } from "../lib/gemini";
import { encryptMessage, decryptMessage } from "../lib/encryption";
import { notificationService } from "../lib/notifications";
import ReactMarkdown from "react-markdown";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { AudioRecorder, useAudioRecorder } from "react-audio-voice-recorder";
import MediaEditor from "./MediaEditor";
import ImageViewer from "./ImageViewer";

import { QRCodeSVG } from "qrcode.react";
import { AppUser, Message, Group } from "../types";

const VoiceMessage: React.FC<{ url: string }> = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex items-center gap-4 min-w-[240px]">
      <button 
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-bg hover:scale-105 transition-transform"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 h-px bg-white/10 relative overflow-hidden rounded-full">
        <motion.div 
          initial={{ x: "-100%" }}
          animate={{ x: isPlaying ? "0%" : "-100%" }}
          transition={{ duration: 12, ease: "linear", repeat: isPlaying ? Infinity : 0 }}
          className="absolute inset-0 bg-accent" 
        />
      </div>
      <audio 
        ref={audioRef} 
        src={url} 
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden" 
      />
      <span className="text-[10px] font-mono text-muted">Voice</span>
    </div>
  );
};

interface ChatProps {
  selectedUser: AppUser | null;
  selectedGroup: Group | null;
  onStartCall: (type: 'audio' | 'video' | 'screen_share', quality?: any) => void;
  onToggleSidebar: () => void;
  onViewProfile: (user: AppUser) => void;
  isBlocked?: boolean;
  onBlock?: () => void;
  onUnblock?: () => void;
}

const Chat: React.FC<ChatProps> = ({ 
  selectedUser, 
  selectedGroup, 
  onStartCall, 
  onToggleSidebar,
  onViewProfile,
  isBlocked,
  onBlock,
  onUnblock
}) => {
  const [liveUser, setLiveUser] = useState<AppUser | null>(null);
  const [liveCurrentUser, setLiveCurrentUser] = useState<AppUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [messageSize, setMessageSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [disappearingTime, setDisappearingTime] = useState<number | null>(null); // in seconds
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [longPressedMessage, setLongPressedMessage] = useState<Message | null>(null);
  const typingStartTimeRef = useRef<Date | null>(null);
  const [isChatUnlocked, setIsChatUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showCallSettings, setShowCallSettings] = useState<{show: boolean, type: 'audio'|'video'|'screen_share'}>({show: false, type: 'video'});
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  const isSevered = selectedUser && (
    liveCurrentUser?.blockedUsers?.includes(selectedUser.uid) || 
    liveUser?.blockedUsers?.includes(auth.currentUser?.uid || "")
  );

  useEffect(() => {
    if (!auth.currentUser || !messages.length) return;
    
    messages.forEach(msg => {
      if (msg.receiverId === auth.currentUser!.uid && !msg.read && !msg.isGroup) {
        updateDoc(doc(db, "messages", msg.id), { read: true }).catch(console.error);
      }
    });
  }, [messages]);

  useEffect(() => {
    if (selectedUser && liveCurrentUser?.lockedChats?.includes(selectedUser.uid)) {
      setIsChatUnlocked(false);
      setShowPinModal(true);
    } else {
      setIsChatUnlocked(true);
      setShowPinModal(false);
    }
  }, [selectedUser, liveCurrentUser?.lockedChats]);


  const handleVerifyPin = () => {
    const expectedPin = selectedUser ? liveCurrentUser?.settings?.chatPins?.[selectedUser.uid] : null;
    if (expectedPin && pinInput === expectedPin) {
      setIsChatUnlocked(true);
      setShowPinModal(false);
      setPinInput("");
    } else {
      toast.error("Incorrect PIN");
      setPinInput("");
    }
  };
  const [showAddMember, setShowAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [forwardNote, setForwardNote] = useState("");
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState<Message | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [editMessageText, setEditMessageText] = useState("");
  const [decryptedMessages, setDecryptedMessages] = useState<{[key: string]: string}>({});

  useEffect(() => {
    notificationService.requestPermission();
  }, []);

  useEffect(() => {
    const decryptAll = async () => {
      const newDecrypted: {[key: string]: string} = {};
      for (const msg of messages) {
        if (msg.isEncrypted && msg.text) {
          const chatId = msg.groupId || msg.chatId;
          newDecrypted[msg.id] = await decryptMessage(msg.text, chatId);
        }
      }
      setDecryptedMessages(prev => ({ ...prev, ...newDecrypted }));
    };
    decryptAll();
  }, [messages]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ message: Message; forEveryone: boolean } | null>(null);
  const [showConfirm, setShowConfirm] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    onConfirm: () => {},
    title: "",
    message: "",
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<any>(null);
  const currentUser = auth.currentUser;
  const recorderControls = useAudioRecorder();

  useEffect(() => {
    if (!currentUser || !liveCurrentUser?.username) return;
    const userRef = doc(db, "users", currentUser.uid);
    if (recorderControls.isRecording) {
      updateDoc(userRef, { status: 'transmitting' });
    } else {
      // App.tsx will handle the periodic update back to 'active' or 'offline'
      // but we can trigger it here for faster feedback
      const showOnline = liveCurrentUser?.settings?.showOnlineStatus !== false;
      updateDoc(userRef, { status: showOnline ? 'active' : 'offline' });
    }
  }, [recorderControls.isRecording, currentUser, liveCurrentUser?.settings?.showOnlineStatus, liveCurrentUser?.username]);
  const isAdmin = selectedGroup?.admins?.includes(auth.currentUser?.uid || "") || false;
  const canEditSettings = selectedGroup?.createdBy === auth.currentUser?.uid || 
    (isAdmin && (selectedGroup?.settings?.editGroupSettings === 'all_admins' || !selectedGroup?.settings?.editGroupSettings));
  const canEditInfo = selectedGroup?.createdBy === auth.currentUser?.uid || 
    (isAdmin && (selectedGroup?.settings?.editGroupInfo === 'admins' || !selectedGroup?.settings?.editGroupInfo)) ||
    (selectedGroup?.settings?.editGroupInfo === 'all' || !selectedGroup?.settings?.editGroupInfo);
  const canSendMessages = !selectedGroup || 
    selectedGroup.createdBy === auth.currentUser?.uid || 
    (isAdmin && (selectedGroup.settings?.sendMessages === 'admins' || !selectedGroup.settings?.sendMessages)) ||
    (selectedGroup.settings?.sendMessages === 'all' || !selectedGroup.settings?.sendMessages);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, "users", auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setLiveCurrentUser(doc.data() as AppUser);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setLiveUser(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", selectedUser.uid), (doc) => {
      if (doc.exists()) {
        setLiveUser(doc.data() as AppUser);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${selectedUser.uid}`);
    });
    return () => unsub();
  }, [selectedUser]);

  useEffect(() => {
    if (showAddMember) {
      const q = query(collection(db, "users"));
      getDocs(q).then(snap => {
        const list = snap.docs.map(doc => doc.data() as AppUser);
        setAllUsers(list.filter(u => u.uid !== auth.currentUser?.uid));
      }).catch(error => {
        handleFirestoreError(error, OperationType.LIST, "users");
      });
    }
  }, [showAddMember]);

  const handleLongPressStart = (msg: Message) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressedMessage(msg);
    }, 1000);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!auth.currentUser) return;
    try {
      const msgRef = doc(db, "messages", messageId);
      const msgDoc = await getDoc(msgRef);
      if (msgDoc.exists()) {
        const currentReactions = (msgDoc.data().reactions || []) as any[];
        const existingIndex = currentReactions.findIndex(r => r.userId === auth.currentUser?.uid);
        
        let newReactions = [...currentReactions];
        if (existingIndex > -1) {
          if (newReactions[existingIndex].emoji === emoji) {
            newReactions.splice(existingIndex, 1);
          } else {
            newReactions[existingIndex].emoji = emoji;
          }
        } else {
          newReactions.push({ userId: auth.currentUser?.uid, emoji });
        }
        
        await updateDoc(msgRef, { reactions: newReactions });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `messages/${messageId}`);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, "groups"), where("members", "array-contains", auth.currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list: Group[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as Group));
      setAllGroups(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups");
    });
    return () => unsub();
  }, [auth.currentUser]);

  const handlePinMessage = async (msgId: string, currentPinned: boolean) => {
    if (!auth.currentUser) return;
    try {
      const msgRef = doc(db, "messages", msgId);
      await updateDoc(msgRef, {
        pinned: !currentPinned
      });
      toast.success(!currentPinned ? "Message pinned" : "Message unpinned");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `messages/${msgId}`);
    }
  };

  const handleMessageClick = (msg: Message) => {
    clickCountRef.current += 1;
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    
    clickTimeoutRef.current = setTimeout(() => {
      if (clickCountRef.current === 2) {
        // Double tap: Reply
        setReplyingTo(msg);
      } else if (clickCountRef.current === 3) {
        // Triple tap: Pin message
        handlePinMessage(msg.id, !!msg.pinned);
      }
      clickCountRef.current = 0;
    }, 400); // 400ms window for taps
  };

  const handleDeleteMessage = async (messageId: string, forEveryone: boolean = true) => {
    if (!auth.currentUser) return;
    try {
      const msgRef = doc(db, "messages", messageId);
      if (forEveryone) {
        await updateDoc(msgRef, {
          isDeleted: true,
          text: "This message was deleted"
        });
      } else {
        const msgDoc = await getDoc(msgRef);
        if (msgDoc.exists()) {
          const currentDeletedFor = (msgDoc.data().deletedFor || []) as string[];
          if (!currentDeletedFor.includes(currentUser.uid)) {
            await updateDoc(msgRef, {
              deletedFor: [...currentDeletedFor, currentUser.uid]
            });
          }
        }
      }
      setShowDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `messages/${messageId}`);
    }
  };

  const handleEditMessage = async () => {
    if (!editingMessage || !currentUser) return;
    setIsUploading(true);
    try {
      let fileUrl = editingMessage.fileUrl || null;
      let fileName = editingMessage.fileName || null;
      let fileType = editingMessage.fileType || null;

      if (editingFile) {
        const reader = new FileReader();
        fileUrl = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(editingFile);
        });
        fileName = editingFile.name;
        fileType = editingFile.type;
      }

      const msgRef = doc(db, "messages", editingMessage.id);
      await updateDoc(msgRef, {
        text: editMessageText,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        isEdited: true
      });
      setEditingMessage(null);
      setEditMessageText("");
      setEditingFile(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `messages/${editingMessage.id}`);
    } finally {
      setIsUploading(false);
    }
  };
  const handleForwardSelected = async () => {
    if (!forwardMessage || !currentUser || forwardTargets.length === 0) return;
    
    try {
      for (const targetId of forwardTargets) {
        const isGroup = allGroups.some(g => g.id === targetId);
        const chatId = isGroup ? targetId : getChatId(currentUser.uid, targetId);
        const target = isGroup ? allGroups.find(g => g.id === targetId) : allUsers.find(u => u.uid === targetId);
        
        const disappearingAt = isGroup 
          ? ((target as Group).settings?.disappearingMessages ? new Date(Date.now() + (target as Group).settings!.disappearingMessages * 3600000) : null)
          : (liveCurrentUser?.settings?.disappearingMessages?.[targetId] ? new Date(Date.now() + liveCurrentUser.settings.disappearingMessages[targetId] * 3600000) : null);

        const newMsg: any = {
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          senderPhoto: currentUser.photoURL,
          receiverId: targetId,
          text: forwardMessage.text,
          timestamp: serverTimestamp(),
          chatId,
          participants: isGroup ? (target as Group).members : [currentUser.uid, targetId],
          isGroup,
          forwardedFrom: forwardMessage.senderName,
          disappearingAt,
          read: false
        };

        if (forwardMessage.fileUrl) {
          newMsg.fileUrl = forwardMessage.fileUrl;
          newMsg.fileName = forwardMessage.fileName;
          newMsg.fileType = forwardMessage.fileType;
        }
        if (forwardMessage.voiceUrl) {
          newMsg.voiceUrl = forwardMessage.voiceUrl;
        }

        await addDoc(collection(db, "messages"), newMsg);

        if (forwardNote.trim()) {
          await addDoc(collection(db, "messages"), {
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            senderPhoto: currentUser.photoURL,
            receiverId: targetId,
            text: forwardNote.trim(),
            timestamp: serverTimestamp(),
            chatId,
            participants: isGroup ? (target as Group).members : [currentUser.uid, targetId],
            isGroup,
            disappearingAt,
            read: false
          });
        }
      }
      
      toast.success("Message forwarded");
      setShowForwardModal(false);
      setForwardTargets([]);
      setForwardNote("");
      setForwardMessage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "messages");
    }
  };

  const handleAddMember = async (user: AppUser) => {
    if (!selectedGroup) return;
    try {
      const groupRef = doc(db, "groups", selectedGroup.id);
      await updateDoc(groupRef, {
        members: [...selectedGroup.members, user.uid]
      });
      setShowAddMember(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
    }
  };

  const handleToggleSetting = async (field: 'pinnedChats' | 'mutedChats' | 'lockedChats', id: string) => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, "users", currentUser.uid);
      const currentList = currentUser[field] || [];
      const newList = currentList.includes(id) 
        ? currentList.filter(item => item !== id)
        : [...currentList, id];
      
      await updateDoc(userRef, { [field]: newList });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleUpdateUserSetting = async (field: string, value: any) => {
    if (!liveCurrentUser || !liveCurrentUser.settings) return;
    try {
      const userRef = doc(db, "users", liveCurrentUser.uid);
      const currentSetting = liveCurrentUser.settings[field as keyof typeof liveCurrentUser.settings];
      const newValue = (typeof currentSetting === 'object' && currentSetting !== null)
        ? { ...currentSetting, ...value }
        : value;
      await updateDoc(userRef, {
        [`settings.${field}`]: newValue
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${liveCurrentUser.uid}`);
    }
  };

  const handleUpdateGroupSettings = async (settings: Partial<Group['settings']>) => {
    if (!selectedGroup) return;
    try {
      const groupRef = doc(db, "groups", selectedGroup.id);
      await updateDoc(groupRef, {
        settings: { ...(selectedGroup.settings || {}), ...settings }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
    }
  };

  const handleResetInviteLink = async () => {
    if (!selectedGroup) return;
    try {
      const groupRef = doc(db, "groups", selectedGroup.id);
      const newLink = Math.random().toString(36).substring(2, 15);
      await updateDoc(groupRef, { inviteLink: newLink });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
    }
  };

  const handleUpdateGroupInfo = async (data: Partial<Group>) => {
    if (!selectedGroup) return;
    try {
      const groupRef = doc(db, "groups", selectedGroup.id);
      await updateDoc(groupRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    setShowConfirm({
      isOpen: true,
      title: "Remove Participant",
      message: "Are you sure you want to remove this participant from the collective?",
      type: 'danger',
      onConfirm: async () => {
        try {
          const groupRef = doc(db, "groups", selectedGroup.id);
          await updateDoc(groupRef, {
            members: selectedGroup.members.filter(id => id !== userId),
            admins: (selectedGroup.admins || []).filter(id => id !== userId)
          });
          toast.success("Participant removed successfully");
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
        }
      }
    });
  };

  const handleToggleAdmin = async (userId: string) => {
    if (!selectedGroup) return;
    const isAdmin = (selectedGroup.admins || []).includes(userId);
    setShowConfirm({
      isOpen: true,
      title: isAdmin ? "Revoke Admin Status" : "Promote to Admin",
      message: isAdmin 
        ? "Are you sure you want to revoke admin privileges for this participant?" 
        : "Are you sure you want to promote this participant to admin?",
      type: 'warning',
      onConfirm: async () => {
        try {
          const groupRef = doc(db, "groups", selectedGroup.id);
          const currentAdmins = selectedGroup.admins || [];
          const newAdmins = currentAdmins.includes(userId)
            ? currentAdmins.filter(id => id !== userId)
            : [...currentAdmins, userId];
          await updateDoc(groupRef, { admins: newAdmins });
          toast.success(`Admin status ${isAdmin ? "revoked" : "granted"} successfully`);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
        }
      }
    });
  };

  const handleTransferOwnership = async (userId: string) => {
    if (!selectedGroup || !currentUser || selectedGroup.createdBy !== currentUser.uid) return;
    setShowConfirm({
      isOpen: true,
      title: "Transfer Ownership",
      message: "Are you sure you want to transfer ownership of this collective? This action cannot be undone.",
      type: 'danger',
      onConfirm: async () => {
        try {
          const groupRef = doc(db, "groups", selectedGroup.id);
          await updateDoc(groupRef, {
            createdBy: userId,
            admins: Array.from(new Set([...(selectedGroup.admins || []), userId]))
          });
          toast.success("Ownership transferred successfully");
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
        }
      }
    });
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroup || !currentUser) return;
    setShowConfirm({
      isOpen: true,
      title: "Leave Collective",
      message: "Are you sure you want to leave this collective?",
      type: 'danger',
      onConfirm: async () => {
        try {
          const groupRef = doc(db, "groups", selectedGroup.id);
          await updateDoc(groupRef, {
            members: selectedGroup.members.filter(id => id !== currentUser.uid),
            admins: (selectedGroup.admins || []).filter(id => id !== currentUser.uid)
          });
          setShowGroupSettings(false);
          toast.success("Left collective successfully");
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
        }
      }
    });
  };

  const searchGifs = async (query: string) => {
    try {
      const resp = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${query}&limit=10`);
      const data = await resp.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error("Failed to search GIFs:", err);
    }
  };

  useEffect(() => {
    if (gifSearch) {
      const timer = setTimeout(() => searchGifs(gifSearch), 500);
      return () => clearTimeout(timer);
    } else {
      setGifs([]);
    }
  }, [gifSearch]);

  const sendGif = async (url: string) => {
    if (!auth.currentUser || (!selectedUser && !selectedGroup)) return;
    const chatId = selectedGroup ? selectedGroup.id : getChatId(auth.currentUser.uid, selectedUser!.uid);
    const receiverId = selectedGroup ? selectedGroup.id : selectedUser!.uid;
    const isGroup = !!selectedGroup;
    
    const msgData: any = {
      chatId,
      senderId: auth.currentUser.uid,
      senderName: auth.currentUser.displayName,
      senderPhoto: auth.currentUser.photoURL,
      receiverId,
      text: "Sent a GIF",
      fileUrl: url,
      fileType: "image/gif",
      timestamp: serverTimestamp(),
      isGroup,
      participants: isGroup ? selectedGroup.members : [auth.currentUser.uid, selectedUser!.uid],
      disappearingAt: getDisappearingAt(receiverId, isGroup)
    };

    try {
      await addDoc(collection(db, "messages"), msgData);
      setShowGifPicker(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "messages");
    }
  };

  useEffect(() => {
    if (!auth.currentUser || (!selectedUser && !selectedGroup)) return;

    const chatId = selectedGroup ? selectedGroup.id : getChatId(auth.currentUser.uid, selectedUser!.uid);
    
    if (selectedGroup) {
      socket.emit("join_group", selectedGroup.id);
    }

    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chatId),
      where("participants", "array-contains", auth.currentUser.uid),
      orderBy("timestamp", "asc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      const now = new Date();
      snapshot.forEach((doc) => {
        const data = doc.data() as Message;
        const disappearingAt = data.disappearingAt?.toDate ? data.disappearingAt.toDate() : data.disappearingAt ? new Date(data.disappearingAt) : null;
        
        if (!data.deletedFor?.includes(auth.currentUser!.uid) && (!disappearingAt || disappearingAt > now)) {
          msgs.push({ id: doc.id, ...data });
        }
      });
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "messages");
    });

    return () => unsubscribe();
  }, [auth.currentUser, selectedUser, selectedGroup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedUser) return;
    socket.on("user_typing", (data) => {
      if (data.senderId === selectedUser.uid) {
        setIsTyping(data.isTyping);
      }
    });

    return () => {
      socket.off("user_typing");
    };
  }, [selectedUser]);

  const getDisappearingAt = (targetId: string, isGroup: boolean) => {
    if (disappearingTime) {
      return Timestamp.fromDate(new Date(Date.now() + disappearingTime * 1000));
    }
    if (isGroup && selectedGroup?.settings?.disappearingMessages) {
      return Timestamp.fromDate(new Date(Date.now() + selectedGroup.settings.disappearingMessages * 3600000));
    }
    if (!isGroup && liveCurrentUser?.settings?.disappearingMessages?.[targetId]) {
      return Timestamp.fromDate(new Date(Date.now() + liveCurrentUser.settings.disappearingMessages[targetId] * 3600000));
    }
    return null;
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    
    toast.promise(
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
              
              const newMsg: Partial<Message> = {
                text: `📍 Shared Location`,
                location: { lat: latitude, lng: longitude, address: locationUrl },
                senderId: auth.currentUser!.uid,
                senderName: auth.currentUser!.displayName || "Unknown",
                senderPhoto: auth.currentUser!.photoURL || "",
                timestamp: serverTimestamp(),
                readBy: [auth.currentUser!.uid],
                status: 'sent'
              };
              
              if (selectedGroup) {
                newMsg.chatId = selectedGroup.id;
                newMsg.groupId = selectedGroup.id;
                newMsg.participants = selectedGroup.members;
                newMsg.isGroup = true;
              } else if (selectedUser) {
                newMsg.receiverId = selectedUser.uid;
                newMsg.chatId = getChatId(auth.currentUser!.uid, selectedUser.uid);
                newMsg.participants = [auth.currentUser!.uid, selectedUser.uid];
              }
              
              await addDoc(collection(db, "messages"), newMsg);
              resolve(true);
            } catch (error) {
              reject(error);
            }
          },
          (error) => {
            reject(error);
          }
        );
      }),
      {
        loading: 'Fetching location...',
        success: 'Location shared successfully!',
        error: 'Failed to get location'
      }
    );
  };

  const handleStarMessage = async (msgId: string) => {
    if (!auth.currentUser || !liveCurrentUser) return;
    try {
      const isStarred = liveCurrentUser.starredMessages?.includes(msgId);
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        starredMessages: isStarred ? arrayRemove(msgId) : arrayUnion(msgId)
      });
      toast.success(isStarred ? "Message unstarred" : "Message starred");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "users");
    }
  };

  const handleExportChat = () => {
    const chatData = messages.map(msg => {
      const timestamp = msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleString() : 'Pending';
      const text = decryptedMessages[msg.id] || msg.text;
      let line = `[${timestamp}] ${msg.senderName}: ${text}`;
      if (msg.fileUrl) line += `\n   Attachment: ${msg.fileUrl}`;
      if (msg.voiceUrl) line += `\n   Voice Message: ${msg.voiceUrl}`;
      if (msg.location) line += `\n   Location: ${msg.location.address}`;
      return line;
    }).join('\n\n');
    
    const blob = new Blob([chatData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_export_${selectedGroup ? selectedGroup.name : selectedUser?.displayName}_${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Chat exported successfully");
  };

  const handleSendMessage = async (e?: React.FormEvent, textOverride?: string) => {
    e?.preventDefault();
    const messageText = textOverride || newMessage.trim();
    if (!messageText && !textOverride || !auth.currentUser || (!selectedUser && !selectedGroup)) return;

    if (selectedGroup && selectedGroup.settings?.sendMessages === 'admins' && !isAdmin) {
      alert("Only admins can transmit in this collective.");
      return;
    }

    const chatId = selectedGroup ? selectedGroup.id : getChatId(auth.currentUser.uid, selectedUser!.uid);
    const receiverId = selectedGroup ? selectedGroup.id : selectedUser!.uid;
    const isGroup = !!selectedGroup;
    
    if (isEmergencyMode && !isGroup && selectedUser) {
      const currentCount = liveCurrentUser?.settings?.emergencyMessagesCount?.[chatId] || 0;
      if (currentCount >= 3) {
        toast.error("Emergency message limit reached (3/3)");
        return;
      }
      // Increment count
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, {
        [`settings.emergencyMessagesCount.${chatId}`]: currentCount + 1
      });
    }

    if (!textOverride) setNewMessage("");
    setShowEmojiPicker(false);

    try {
      const encryptedText = await encryptMessage(messageText, chatId);
      const messageData = {
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName,
        senderPhoto: auth.currentUser.photoURL,
        receiverId,
        text: encryptedText,
        isEncrypted: true,
        timestamp: serverTimestamp(),
        chatId: chatId,
        participants: isGroup ? selectedGroup.members : [auth.currentUser.uid, selectedUser!.uid],
        isGroup,
        isEmergency: isEmergencyMode,
        disappearingAt: getDisappearingAt(receiverId, isGroup),
        typingStartedAt: typingStartTimeRef.current ? Timestamp.fromDate(typingStartTimeRef.current) : null,
        ...(replyingTo && {
          replyTo: {
            id: replyingTo.id,
            text: replyingTo.text,
            senderName: replyingTo.senderName || 'Unknown',
            voiceUrl: replyingTo.voiceUrl || null,
            fileUrl: replyingTo.fileUrl || null,
            fileName: replyingTo.fileName || null
          }
        }),
        read: false
      };

      await addDoc(collection(db, "messages"), messageData);
      setReplyingTo(null);
      typingStartTimeRef.current = null;

      // Send push notification
      if (selectedUser) {
        sendPushNotification(
          selectedUser.uid,
          `New message from ${auth.currentUser.displayName}`,
          messageText.length > 50 ? messageText.substring(0, 50) + "..." : messageText,
          { chatId, type: 'chat' }
        );
      } else if (selectedGroup) {
        selectedGroup.members.forEach(memberId => {
          if (memberId !== auth.currentUser?.uid) {
            sendPushNotification(
              memberId,
              `New message in ${selectedGroup.name}`,
              `${auth.currentUser?.displayName}: ${messageText.length > 50 ? messageText.substring(0, 50) + "..." : messageText}`,
              { groupId: selectedGroup.id, type: 'chat' }
            );
          }
        });
      }

      socket.emit("send_message", {
        ...messageData,
        senderName: auth.currentUser.displayName
      });

      if (messageText.toLowerCase().startsWith("@ai") && !selectedGroup) {
        handleAIRequest(messageText.replace("@ai", "").trim());
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "messages");
    }
  };

  const handleVoiceMessage = async (blob: Blob) => {
    if (!auth.currentUser) return;
    if (selectedGroup && selectedGroup.settings?.sendMessages === 'admins' && !isAdmin) {
      alert("Only admins can transmit in this collective.");
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const chatId = selectedGroup ? selectedGroup.id : getChatId(auth.currentUser!.uid, selectedUser!.uid);
        const receiverId = selectedGroup ? selectedGroup.id : selectedUser!.uid;
        const isGroup = !!selectedGroup;

        try {
          await addDoc(collection(db, "messages"), {
            senderId: auth.currentUser!.uid,
            senderName: auth.currentUser!.displayName,
            senderPhoto: auth.currentUser!.photoURL,
            receiverId,
            text: "🎤 Voice Message",
            voiceUrl: base64,
            timestamp: serverTimestamp(),
            chatId: chatId,
            participants: isGroup ? selectedGroup.members : [auth.currentUser!.uid, selectedUser!.uid],
            isGroup,
            disappearingAt: getDisappearingAt(receiverId, isGroup)
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, "messages");
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error("Voice message error:", error);
    } finally {
      setIsUploading(false);
      setShowVoiceRecorder(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setEditingFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    processFileUpload(file);
  };

  const processFileUpload = async (file: File, caption?: string) => {
    if (!auth.currentUser) return;
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const chatId = selectedGroup ? selectedGroup.id : getChatId(auth.currentUser!.uid, selectedUser!.uid);
        const receiverId = selectedGroup ? selectedGroup.id : selectedUser!.uid;
        const isGroup = !!selectedGroup;

        try {
          await addDoc(collection(db, "messages"), {
            senderId: auth.currentUser!.uid,
            senderName: auth.currentUser!.displayName,
            senderPhoto: auth.currentUser!.photoURL,
            receiverId,
            text: caption || `Sent a file: ${file.name}`,
            fileUrl: base64,
            fileName: file.name,
            fileType: file.type,
            timestamp: serverTimestamp(),
            chatId: chatId,
            participants: isGroup ? selectedGroup.members : [auth.currentUser!.uid, selectedUser!.uid],
            isGroup,
            disappearingAt: getDisappearingAt(receiverId, isGroup)
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, "messages");
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File upload error:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAIRequest = async (prompt: string) => {
    if (!auth.currentUser) return;
    setIsAILoading(true);
    try {
      const chatId = getChatId(auth.currentUser.uid, selectedUser!.uid);
      const context = messages.slice(-5).map(m => `${m.senderId === auth.currentUser?.uid ? "User" : "Other"}: ${m.text}`).join("\n");
      const aiResponse = await getAIResponse(prompt, context);
      
      try {
        await addDoc(collection(db, "messages"), {
          senderId: "ai-assistant",
          senderName: "Tarsus Intelligence",
          receiverId: auth.currentUser.uid,
          text: aiResponse,
          timestamp: serverTimestamp(),
          isAI: true,
          chatId: chatId,
          participants: [auth.currentUser.uid, selectedUser!.uid]
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "messages");
      }
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (e.target.value.length > 0 && !typingStartTimeRef.current) {
      typingStartTimeRef.current = new Date();
    } else if (e.target.value.length === 0) {
      typingStartTimeRef.current = null;
    }
    if (auth.currentUser && selectedUser) {
      socket.emit("typing", {
        senderId: auth.currentUser.uid,
        receiverId: selectedUser.uid,
        isTyping: e.target.value.length > 0,
      });
    }
  };

  const onEmojiClick = (emojiData: any) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const canSeePhoto = (user: AppUser) => {
    const visibility = user.settings?.showProfilePhoto || 'everyone';
    if (visibility === 'everyone') return true;
    if (visibility === 'nobody') return false;
    if (visibility === 'contacts') {
      return user.friends?.includes(currentUser?.uid || "");
    }
    return true;
  };

  const getPhotoURL = (user: AppUser) => {
    if (canSeePhoto(user)) return user.photoURL || "https://picsum.photos/seed/user/200";
    return "https://api.dicebear.com/7.x/initials/svg?seed=" + user.displayName;
  };

  const targetName = selectedGroup ? selectedGroup.name : (liveUser?.displayName || selectedUser?.displayName);
  const targetPhoto = selectedGroup 
    ? selectedGroup.photoURL 
    : getPhotoURL((liveUser || selectedUser) as AppUser);
  const targetStatus = selectedGroup 
    ? `${selectedGroup.members.length} Members` 
    : (isTyping || (liveUser?.status || selectedUser?.status) === 'transmitting'
        ? "Transmitting..." 
        : (['online', 'active'].includes(liveUser?.status || selectedUser?.status || '') && (liveUser?.settings?.showOnlineStatus !== false || selectedUser?.settings?.showOnlineStatus !== false)
            ? "Active Now" 
            : ((liveUser?.status || selectedUser?.status) === 'away' && (liveUser?.settings?.showOnlineStatus !== false || selectedUser?.settings?.showOnlineStatus !== false)
                ? "Away" 
                : ((liveUser?.settings?.showLastSeen !== false || selectedUser?.settings?.showLastSeen !== false) ? "Offline" : ""))));

  return (
    <div className="flex flex-col h-full bg-bg/95 backdrop-blur-3xl relative overflow-hidden">
      {/* Header */}
      <div className="h-[50px] md:h-auto p-2 md:p-8 glass-panel rounded-none border-t-0 border-x-0 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-2 md:gap-6">
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 text-muted hover:text-ink transition-colors"
          >
            <MoreVertical className="w-4 h-4 rotate-90" />
          </button>
          <div className="relative cursor-pointer" onClick={() => {
            if (selectedGroup || canSeePhoto((liveUser || selectedUser) as AppUser)) {
              setViewingPhoto(targetPhoto);
            }
          }}>
            <img
              src={targetPhoto}
              alt={targetName}
              className={`w-8 h-8 md:w-12 md:h-12 rounded-full object-cover transition-all duration-500 border border-border ${
                (selectedGroup || canSeePhoto((liveUser || selectedUser) as AppUser)) ? "cursor-zoom-in hover:scale-110" : ""
              }`}
              referrerPolicy="no-referrer"
            />
            {!selectedGroup && ['online', 'active', 'transmitting'].includes(liveUser?.status || selectedUser?.status || '') && (liveUser?.settings?.showOnlineStatus !== false || selectedUser?.settings?.showOnlineStatus !== false) && (
              <div className="absolute bottom-0 right-0 w-2 h-2 md:w-3 md:h-3 rounded-full bg-accent border-2 border-bg" />
            )}
            {!selectedGroup && liveUser?.status === 'away' && (liveUser?.settings?.showOnlineStatus !== false || selectedUser?.settings?.showOnlineStatus !== false) && (
              <div className="absolute bottom-0 right-0 w-2 h-2 md:w-3 md:h-3 rounded-full bg-yellow-500 border-2 border-bg" />
            )}
          </div>
          <div className="flex flex-col cursor-pointer" onClick={() => {
            if (selectedGroup) {
              setShowGroupSettings(true);
            } else if (liveUser || selectedUser) {
              onViewProfile((liveUser || selectedUser) as AppUser);
            }
          }}>
            <h2 className="text-sm md:text-xl font-serif italic tracking-tight">{targetName}</h2>
            <span className="micro-label text-[10px] md:text-xs text-accent">
              <ScrambleText text={isTyping ? "Transmitting..." : targetStatus} />
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 md:gap-4">
          {!selectedGroup && (
            <div className="flex items-center gap-1 md:gap-2 pr-2 md:pr-4 border-r border-border">
              <button
                onClick={() => setShowCallSettings({show: true, type: 'screen_share'})}
                className="p-1.5 md:p-3 text-muted hover:text-ink glass-panel rounded-lg md:rounded-2xl transition-all"
                title="Share Screen"
              >
                <Monitor className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button onClick={() => setShowCallSettings({show: true, type: 'video'})} className="p-1.5 md:p-3 text-muted hover:text-ink glass-panel rounded-lg md:rounded-2xl transition-all">
                <Video className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button onClick={() => setShowCallSettings({show: true, type: 'audio'})} className="p-1.5 md:p-3 text-muted hover:text-ink glass-panel rounded-lg md:rounded-2xl transition-all">
                <Phone className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          )}
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 md:p-3 text-muted hover:text-ink glass-panel rounded-lg md:rounded-2xl transition-all"
            >
              <MoreVertical className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-4 w-56 glass-panel rounded-3xl overflow-hidden z-20 shadow-2xl"
                >
                  {selectedGroup && (
                    <button
                      onClick={() => { setShowGroupSettings(true); setShowMenu(false); }}
                      className="w-full flex items-center gap-3 p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest"
                    >
                      <Settings className="w-4 h-4" /> Collective Settings
                    </button>
                  )}
                  {!selectedGroup && (
                    <button
                      onClick={() => {
                        isBlocked ? onUnblock?.() : onBlock?.();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest"
                    >
                      {isBlocked ? (
                        <><Shield className="w-4 h-4 text-accent" /> Restore Connection</>
                      ) : (
                        <><ShieldOff className="w-4 h-4 text-red-500" /> Sever Connection</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => { handleExportChat(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest"
                  >
                    <Download className="w-4 h-4" /> Export Transmission
                  </button>
                  <div className="border-t border-white/5">
                    <button
                      onClick={() => setShowDisappearingMenu(!showDisappearingMenu)}
                      className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-accent" />
                        Disappearing Messages
                      </div>
                      <span className="text-[10px] text-muted">
                        {disappearingTime ? (disappearingTime === 86400 ? '24h' : disappearingTime === 604800 ? '7d' : disappearingTime === 3600 ? '1h' : 'Custom') : 'Off'}
                      </span>
                    </button>
                    <AnimatePresence>
                      {showDisappearingMenu && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden bg-white/5"
                        >
                          {[
                            { label: 'Off', value: null },
                            { label: '1 Hour', value: 3600 },
                            { label: '24 Hours', value: 86400 },
                            { label: '7 Days', value: 604800 }
                          ].map(opt => (
                            <button
                              key={opt.label}
                              onClick={() => { setDisappearingTime(opt.value); setShowDisappearingMenu(false); setShowMenu(false); }}
                              className={`w-full p-4 pl-12 text-left text-[10px] uppercase tracking-widest hover:bg-white/5 ${disappearingTime === opt.value ? 'text-accent' : 'text-muted'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="border-t border-white/5">
                    <button
                      onClick={() => setShowSizeMenu(!showSizeMenu)}
                      className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest"
                    >
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-4 h-4 text-accent" />
                        Message Size
                      </div>
                      <span className="text-[10px] text-muted uppercase">{messageSize}</span>
                    </button>
                    <AnimatePresence>
                      {showSizeMenu && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden bg-white/5"
                        >
                          {(['small', 'medium', 'large'] as const).map(size => (
                            <button
                              key={size}
                              onClick={() => { setMessageSize(size); setShowSizeMenu(false); setShowMenu(false); }}
                              className={`w-full p-4 pl-12 text-left text-[10px] uppercase tracking-widest hover:bg-white/5 ${messageSize === size ? 'text-accent' : 'text-muted'}`}
                            >
                              {size}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="border-t border-white/5">
                    <button
                      onClick={() => { setShowPinnedMessages(true); setShowMenu(false); }}
                      className="w-full flex items-center gap-3 p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest"
                    >
                      <Pin className="w-4 h-4 text-accent" />
                      Pinned Messages
                    </button>
                  </div>
                  <button className="w-full flex items-center gap-3 p-5 hover:bg-white/5 transition-colors text-left text-xs uppercase tracking-widest text-red-500">
                    <Trash2 className="w-4 h-4" /> Purge Records
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar">
        {isChatUnlocked ? (
          <AnimatePresence mode="popLayout">
            {messages.filter(m => !m.deletedFor?.includes(currentUser?.uid || "")).map((msg, idx) => {
            const isMe = msg.senderId === currentUser?.uid;
            const isSystem = msg.senderId === "system";
            const showAvatar = (idx === 0 || messages[idx - 1].senderId !== msg.senderId) && !isSystem;
            
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center w-full py-4">
                  <div className="px-6 py-2 bg-white/5 border border-border rounded-full text-[10px] uppercase tracking-widest text-muted font-bold">
                    <ScrambleText text={msg.text} />
                  </div>
                </div>
              );
            }

            return (
              <motion.div
                key={msg.id}
                id={`message-${msg.id}`}
                layout="position"
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`flex gap-4 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                onMouseDown={() => handleLongPressStart(msg)}
                onMouseUp={handleLongPressEnd}
                onMouseLeave={handleLongPressEnd}
                onTouchStart={() => handleLongPressStart(msg)}
                onTouchEnd={handleLongPressEnd}
                onClick={() => handleMessageClick(msg)}
              >
                {!isMe && (
                      <div className="w-8 h-8 flex-shrink-0">
                        {showAvatar && (
                          <img 
                            src={msg.senderPhoto || ""} 
                            alt="" 
                            onClick={() => setViewingPhoto(msg.senderPhoto || null)}
                            className="w-8 h-8 rounded-full grayscale border border-border cursor-zoom-in hover:scale-110 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                )}
                
                <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                  {showAvatar && !isMe && (
                    <span className="micro-label mb-2 ml-1">{msg.senderName}</span>
                  )}
                  
                  <div className="group relative">
                    <div
                      className={`${
                        messageSize === 'small' ? 'p-2 md:p-3 text-[10px] md:text-xs rounded-[16px] md:rounded-[24px]' :
                        messageSize === 'large' ? 'p-4 md:p-7 text-sm md:text-lg rounded-[24px] md:rounded-[40px]' :
                        'p-3 md:p-5 text-xs md:text-sm rounded-[20px] md:rounded-[32px]'
                      } leading-relaxed relative glass-panel transition-colors duration-500 ${
                        msg.isDeleted 
                          ? "opacity-50 italic"
                          : isMe
                            ? "bg-accent/20 border-accent/30 rounded-tr-none"
                            : msg.isAI 
                              ? "bg-white/5 border-accent/30 rounded-tl-none"
                              : "bg-white/5 border-white/10 rounded-tl-none"
                      }`}
                    >
                      {msg.forwardedFrom && (
                        <div className="flex items-center gap-1.5 mb-2 micro-label text-muted italic">
                          <Send className="w-2.5 h-2.5 rotate-90" />
                          Forwarded from {msg.forwardedFrom}
                        </div>
                      )}
                      
                      {msg.isAI && (
                        <div className="flex items-center gap-2 mb-3 micro-label text-accent">
                          <Sparkles className="w-3 h-3" />
                          Intelligence
                        </div>
                      )}

                      {msg.replyTo && (
                        <div className="mb-3 p-3 bg-black/20 rounded-xl border-l-2 border-accent text-xs opacity-80">
                          <div className="font-bold text-accent mb-1">{msg.replyTo.senderName}</div>
                          <div className="truncate">
                            {msg.replyTo.voiceUrl ? "🎤 Voice Message" : msg.replyTo.fileUrl ? "📎 Attachment" : msg.replyTo.text}
                          </div>
                        </div>
                      )}
                      
                      {!msg.isDeleted && msg.voiceUrl ? (
                        <VoiceMessage url={msg.voiceUrl} />
                      ) : !msg.isDeleted && msg.fileUrl ? (
                        <div className="space-y-4">
                          {msg.fileType?.startsWith("image/") ? (
                            <img 
                              src={msg.fileUrl} 
                              alt="" 
                              onClick={() => setViewingPhoto(msg.fileUrl)}
                              className="rounded-2xl max-h-80 object-cover border border-border cursor-zoom-in hover:opacity-90 transition-opacity" 
                            />
                          ) : (
                            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-border">
                               <Paperclip className="w-5 h-5 text-muted" />
                               <div className="flex-1 overflow-hidden">
                                  <div className="text-xs font-medium truncate">{msg.fileName}</div>
                                  <div className="micro-label opacity-50">{msg.fileType}</div>
                               </div>
                               <a href={msg.fileUrl} download={msg.fileName} className="p-2 hover:text-accent transition-colors">
                                  <Send className="w-4 h-4 rotate-90" />
                                </a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="prose prose-invert max-w-none prose-sm">
                          {msg.location && (
                            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-border mb-2">
                              <MapPin className="w-5 h-5 text-accent" />
                              <a href={msg.location.address} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                                View on Google Maps
                              </a>
                            </div>
                          )}
                          {msg.isAI ? (
                            <ReactMarkdown>{decryptedMessages[msg.id] || msg.text}</ReactMarkdown>
                          ) : (
                            decryptedMessages[msg.id] || msg.text
                          )}
                        </div>
                      )}

                      {/* Pinned and Starred Indicators */}
                      {(msg.pinned || liveCurrentUser?.starredMessages?.includes(msg.id)) && (
                        <div className={`absolute -top-3 ${isMe ? "right-4" : "left-4"} flex gap-1 z-10`}>
                          {msg.pinned && (
                            <div className="bg-accent text-bg text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-lg">
                              <Pin className="w-3 h-3 fill-current" /> Pinned
                            </div>
                          )}
                          {liveCurrentUser?.starredMessages?.includes(msg.id) && (
                            <div className="bg-yellow-500 text-bg text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-lg">
                              <Star className="w-3 h-3 fill-current" /> Starred
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reactions Display */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className="flex gap-1 bg-bg/50 backdrop-blur-md border border-border rounded-full px-2 py-0.5 shadow-sm">
                            {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => (
                              <span key={emoji} className="text-[10px]">{emoji}</span>
                            ))}
                            <span className="text-[8px] text-muted font-bold ml-1">{msg.reactions.length}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Reaction Bar on Hover */}
                    {!msg.isDeleted && (
                      <div className={`absolute top-0 ${isMe ? "-left-56" : "-right-56"} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-bg/80 backdrop-blur-md p-1 rounded-full border border-white/5 z-10 items-center`}>
                        {['❤️', '😂', '😮', '😢', '🔥', '👍'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className="p-1.5 hover:scale-125 transition-transform text-sm"
                          >
                            {emoji}
                          </button>
                        ))}
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <button onClick={() => handleStarMessage(msg.id)} className="p-1.5 hover:scale-125 transition-transform text-yellow-500" title={liveCurrentUser?.starredMessages?.includes(msg.id) ? "Unstar" : "Star"}>
                          <Star className={`w-4 h-4 ${liveCurrentUser?.starredMessages?.includes(msg.id) ? "fill-current" : ""}`} />
                        </button>
                        <button onClick={() => handlePinMessage(msg.id, !!msg.pinned)} className="p-1.5 hover:scale-125 transition-transform text-accent" title={msg.pinned ? "Unpin" : "Pin"}>
                          <Pin className={`w-4 h-4 ${msg.pinned ? "fill-current" : ""}`} />
                        </button>
                        <button onClick={() => { setForwardMessage(msg); setShowForwardModal(true); }} className="p-1.5 hover:scale-125 transition-transform text-muted hover:text-ink" title="Forward">
                          <Forward className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[9px] text-muted uppercase tracking-widest font-mono">
                      {(() => {
                        const msgDate = msg.timestamp?.toDate() || new Date();
                        const dateStr = format(msgDate, "EEE do MMM yy").toLowerCase();
                        const sentTimeStr = format(msgDate, "h:mma").toLowerCase();
                        let timeDisplay = sentTimeStr;

                        if (msg.typingStartedAt) {
                          const typeStart = msg.typingStartedAt.toDate();
                          const typeStartStr = format(typeStart, "h:mma").toLowerCase();
                          timeDisplay = `${typeStartStr}¹ ${sentTimeStr}²`;
                        }

                        return `[${dateStr} ${timeDisplay}]`;
                      })()}
                    </span>
                    {msg.isEdited && (
                      <span className="text-[8px] text-muted italic lowercase tracking-normal">(edited)</span>
                    )}
                    {msg.pinned && (
                      <Pin className="w-3 h-3 text-accent" />
                    )}
                    {isMe && !isSystem && (
                      <div 
                        className={`w-1.5 h-1.5 rounded-full ${
                          msg.read ? "bg-green-500" : 
                          (selectedUser?.status === 'online' || selectedUser?.status === 'active' ? "bg-blue-500" : "bg-white")
                        }`} 
                        title={msg.read ? "Read" : (selectedUser?.status === 'online' || selectedUser?.status === 'active' ? "Delivered" : "Sent")} 
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
          
          {isAILoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-accent" />
              </div>
              <div className="p-5 bg-white/5 border border-accent/20 rounded-[32px] rounded-tl-none flex items-center gap-4">
                <div className="flex gap-1">
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1.5 h-1.5 bg-accent rounded-full" />
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 bg-accent rounded-full" />
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 bg-accent rounded-full" />
                </div>
                <span className="micro-label text-accent">Synthesizing...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-accent/5 flex items-center justify-center border border-accent/20">
              <Lock className="w-8 h-8 text-accent" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-serif italic">Transmission Locked</h3>
              <p className="text-xs text-muted uppercase tracking-widest">Enter PIN to decrypt this record</p>
            </div>
            <button 
              onClick={() => setShowPinModal(true)}
              className="px-8 py-3 bg-accent text-bg rounded-full text-[10px] uppercase tracking-[0.2em] font-bold hover:scale-105 transition-all"
            >
              Unlock Now
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Long Press Menu */}
      <AnimatePresence>
        {longPressedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xl"
            onClick={() => setLongPressedMessage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs glass-panel rounded-[32px] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/5">
                <span className="micro-label">Message Actions</span>
              </div>
              <div className="flex flex-col">
                {longPressedMessage.senderId === currentUser?.uid && 
                 !longPressedMessage.isDeleted && 
                 !longPressedMessage.voiceUrl && (
                  <button
                    onClick={() => {
                      setShowEditConfirm(longPressedMessage);
                      setLongPressedMessage(null);
                    }}
                    className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-accent" />
                    <span className="text-xs uppercase tracking-widest">Edit Transmission</span>
                  </button>
                )}
                <button
                  onClick={() => { handleStarMessage(longPressedMessage.id); setLongPressedMessage(null); }}
                  className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors text-left"
                >
                  <Star className={`w-4 h-4 ${liveCurrentUser?.starredMessages?.includes(longPressedMessage.id) ? "text-yellow-500 fill-current" : "text-accent"}`} />
                  <span className="text-xs uppercase tracking-widest">{liveCurrentUser?.starredMessages?.includes(longPressedMessage.id) ? "Unstar Transmission" : "Star Transmission"}</span>
                </button>
                <button
                  onClick={() => { handlePinMessage(longPressedMessage.id, !!longPressedMessage.pinned); setLongPressedMessage(null); }}
                  className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors text-left"
                >
                  <Pin className={`w-4 h-4 ${longPressedMessage.pinned ? "text-accent fill-current" : "text-accent"}`} />
                  <span className="text-xs uppercase tracking-widest">{longPressedMessage.pinned ? "Unpin Transmission" : "Pin Transmission"}</span>
                </button>
                <button
                  onClick={() => { setForwardMessage(longPressedMessage); setShowForwardModal(true); }}
                  className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors text-left"
                >
                  <Send className="w-4 h-4 text-accent rotate-90" />
                  <span className="text-xs uppercase tracking-widest">Forward Transmission</span>
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm({ message: longPressedMessage, forEveryone: true }); setLongPressedMessage(null); }}
                  className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors text-left text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-widest">Delete for Everyone</span>
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm({ message: longPressedMessage, forEveryone: false }); setLongPressedMessage(null); }}
                  className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors text-left text-muted"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-widest">Delete for Me</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-3xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs text-center space-y-8"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-accent/10 rounded-3xl text-accent">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-serif italic"><ScrambleText text="Transmission Locked" /></h2>
                  <p className="text-[10px] text-muted uppercase tracking-widest"><ScrambleText text="Enter PIN to decrypt" delay={500} /></p>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i}
                    className={`w-3 h-3 rounded-full border border-accent/30 transition-all ${pinInput.length > i ? "bg-accent scale-125" : "bg-transparent"}`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      if (num === "C") setPinInput("");
                      else if (num === "OK") handleVerifyPin();
                      else if (pinInput.length < 4) setPinInput(prev => prev + num);
                    }}
                    className="w-16 h-16 rounded-2xl bg-panel hover:border-accent hover:text-accent transition-all flex items-center justify-center font-serif italic text-lg border border-border shadow-sm"
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => {
                  setShowPinModal(false);
                  // Optionally deselect user
                }}
                className="text-[10px] text-muted uppercase tracking-widest hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Set PIN Modal */}
      <AnimatePresence>
        {showSetPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-3xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs text-center space-y-8"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-accent/10 rounded-3xl text-accent">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-serif italic"><ScrambleText text="Set PIN" /></h2>
                  <p className="text-[10px] text-muted uppercase tracking-widest"><ScrambleText text="Create a 4-digit PIN" delay={500} /></p>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i}
                    className={`w-3 h-3 rounded-full border border-accent/30 transition-all ${newPin.length > i ? "bg-accent scale-125" : "bg-transparent"}`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      if (num === "C") setNewPin("");
                      else if (num === "OK") {
                        if (newPin.length === 4) {
                          const updatedPins = { ...(liveCurrentUser?.settings?.chatPins || {}), [selectedUser!.uid]: newPin };
                          handleUpdateUserSetting('settings', { ...liveCurrentUser?.settings, chatPins: updatedPins });
                          handleToggleSetting('lockedChats', selectedUser!.uid);
                          setShowSetPinModal(false);
                          setNewPin("");
                        } else {
                          toast.error("PIN must be 4 digits");
                        }
                      }
                      else if (newPin.length < 4) setNewPin(prev => prev + num);
                    }}
                    className="w-16 h-16 rounded-2xl bg-panel hover:border-accent hover:text-accent transition-all flex items-center justify-center font-serif italic text-lg border border-border shadow-sm"
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => {
                  setShowSetPinModal(false);
                  setNewPin("");
                }}
                className="text-[10px] text-muted uppercase tracking-widest hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showChatSettings && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md glass-panel rounded-[48px] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="micro-label">Transmission Settings</span>
                  <h2 className="text-2xl font-serif italic">{selectedUser.displayName}</h2>
                </div>
                <button onClick={() => setShowChatSettings(false)} className="p-2 text-muted hover:text-ink">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-xl text-accent">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest">Lock Transmission</span>
                        <span className="text-[10px] text-muted">Secure with PIN</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        const isLocked = liveCurrentUser?.lockedChats?.includes(selectedUser.uid);
                        if (isLocked) {
                          handleToggleSetting('lockedChats', selectedUser.uid);
                        } else {
                          setShowSetPinModal(true);
                        }
                      }}
                      className={`w-10 h-6 rounded-full transition-all relative ${liveCurrentUser?.lockedChats?.includes(selectedUser.uid) ? "bg-accent" : "bg-white/10"}`}
                    >
                      <motion.div 
                        animate={{ x: liveCurrentUser?.lockedChats?.includes(selectedUser.uid) ? 18 : 2 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-white" 
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-xl text-accent">
                        <Pin className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest">Pin Transmission</span>
                        <span className="text-[10px] text-muted">Keep at the top</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleToggleSetting('pinnedChats', selectedUser.uid)}
                      className={`w-10 h-6 rounded-full transition-all relative ${liveCurrentUser?.pinnedChats?.includes(selectedUser.uid) ? "bg-accent" : "bg-white/10"}`}
                    >
                      <motion.div 
                        animate={{ x: liveCurrentUser?.pinnedChats?.includes(selectedUser.uid) ? 18 : 2 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-white" 
                      />
                    </button>
                  </div>

                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-xl text-accent">
                        <BellOff className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest">Mute Notifications</span>
                        <span className="text-[10px] text-muted">Silence alerts</span>
                      </div>
                    </div>
                    <select 
                      value={liveCurrentUser?.mutedChats?.find(m => m.chatId === selectedUser.uid)?.until === 'always' ? 'always' : 
                             liveCurrentUser?.mutedChats?.find(m => m.chatId === selectedUser.uid)?.until ? 'timed' : 'off'}
                      onChange={async (e) => {
                        if (!currentUser) return;
                        const val = e.target.value;
                        const userRef = doc(db, "users", currentUser.uid);
                        let newMuted = (liveCurrentUser?.mutedChats || []).filter(m => m.chatId !== selectedUser.uid);
                        
                        if (val === '8h') {
                          newMuted.push({ chatId: selectedUser.uid, until: Timestamp.fromMillis(Date.now() + 8 * 3600000) });
                        } else if (val === '1w') {
                          newMuted.push({ chatId: selectedUser.uid, until: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600000) });
                        } else if (val === 'always') {
                          newMuted.push({ chatId: selectedUser.uid, until: 'always' });
                        }
                        
                        await updateDoc(userRef, { mutedChats: newMuted });
                      }}
                      className="luxury-input text-[10px]"
                    >
                      <option value="off">Off</option>
                      <option value="8h">8 Hours</option>
                      <option value="1w">1 Week</option>
                      <option value="always">Always</option>
                    </select>
                  </div>

                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-xl text-accent">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest">Disappearing Messages</span>
                        <span className="text-[10px] text-muted">Self-destruct timer</span>
                      </div>
                    </div>
                    <select 
                      value={liveCurrentUser?.settings?.disappearingMessages?.[selectedUser.uid] || 0}
                      onChange={(e) => handleUpdateUserSetting('disappearingMessages', { [selectedUser.uid]: Number(e.target.value) })}
                      className="luxury-input text-[10px]"
                    >
                      <option value={0}>Off</option>
                      <option value={24}>24 Hours</option>
                      <option value={168}>7 Days</option>
                      <option value={720}>30 Days</option>
                    </select>
                  </div>

                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-xl text-accent">
                        <Music className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest">Notification Tone</span>
                        <span className="text-[10px] text-muted">Custom alert sound</span>
                      </div>
                    </div>
                    <select 
                      value={liveCurrentUser?.settings?.notificationTones?.[selectedUser.uid] || 'default'}
                      onChange={(e) => handleUpdateUserSetting('notificationTones', { [selectedUser.uid]: e.target.value })}
                      className="luxury-input text-[10px]"
                    >
                      <option value="default">Default</option>
                      <option value="ethereal">Ethereal</option>
                      <option value="minimal">Minimal</option>
                      <option value="pulse">Pulse</option>
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showGroupSettings && selectedGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl h-[80vh] glass-panel rounded-[48px] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="micro-label">Collective Management</span>
                  <h2 className="text-2xl font-serif italic">{selectedGroup.name}</h2>
                </div>
                <button onClick={() => setShowGroupSettings(false)} className="p-2 text-muted hover:text-ink">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                 <div className="flex flex-col items-center gap-4">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
                        {selectedGroup.photoURL ? (
                          <img src={selectedGroup.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users className="w-10 h-10 text-muted" />
                        )}
                      </div>
                      {isAdmin && (
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                        >
                          <Plus className="w-6 h-6 text-white" />
                        </button>
                      )}
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-serif italic">{selectedGroup.name}</h3>
                      <span className="micro-label text-accent">{selectedGroup.members.length} Members</span>
                    </div>
                    
                      <div className="w-full space-y-4">
                        <div className="space-y-2">
                          <span className="micro-label">Description</span>
                          <textarea 
                            defaultValue={selectedGroup.description}
                            onBlur={(e) => handleUpdateGroupInfo({ description: e.target.value })}
                            disabled={!canEditInfo}
                            className="luxury-input h-20 resize-none text-xs"
                            placeholder="What is this collective about?"
                          />
                        </div>
                        <div className="space-y-2">
                          <span className="micro-label">Rules</span>
                          <textarea 
                            defaultValue={selectedGroup.rules}
                            onBlur={(e) => handleUpdateGroupInfo({ rules: e.target.value })}
                            disabled={!canEditInfo}
                            className="luxury-input h-20 resize-none text-xs"
                            placeholder="Set the ground rules..."
                          />
                        </div>
                      </div>
                 </div>

                  <div className="space-y-4 p-6 bg-white/5 rounded-[32px] border border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent/10 rounded-xl text-accent">
                          <BellOff className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase tracking-widest">Mute Notifications</span>
                          <span className="text-[10px] text-muted">Silence alerts for this collective</span>
                        </div>
                      </div>
                      <select 
                        value={liveCurrentUser?.mutedChats?.find(m => m.chatId === selectedGroup.id)?.until === 'always' ? 'always' : 
                               liveCurrentUser?.mutedChats?.find(m => m.chatId === selectedGroup.id)?.until ? 'timed' : 'off'}
                        onChange={async (e) => {
                          if (!currentUser) return;
                          const val = e.target.value;
                          const userRef = doc(db, "users", currentUser.uid);
                          let newMuted = (liveCurrentUser?.mutedChats || []).filter(m => m.chatId !== selectedGroup.id);
                          
                          if (val === '8h') {
                            newMuted.push({ chatId: selectedGroup.id, until: Timestamp.fromMillis(Date.now() + 8 * 3600000) });
                          } else if (val === '1w') {
                            newMuted.push({ chatId: selectedGroup.id, until: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600000) });
                          } else if (val === 'always') {
                            newMuted.push({ chatId: selectedGroup.id, until: 'always' });
                          }
                          
                          await updateDoc(userRef, { mutedChats: newMuted });
                        }}
                        className="luxury-input text-[10px] w-32"
                      >
                        <option value="off">Off</option>
                        <option value="8h">8 Hours</option>
                        <option value="1w">1 Week</option>
                        <option value="always">Always</option>
                      </select>
                    </div>
                  </div>

                  {canEditSettings && (
                    <div className="space-y-6 bg-white/5 p-6 rounded-[32px] border border-white/5">
                      <h3 className="text-xs uppercase tracking-widest font-bold flex items-center gap-2">
                        <Settings className="w-3 h-3" /> Collective Controls
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <span className="micro-label">Edit Info</span>
                          <select 
                            value={selectedGroup.settings?.editGroupInfo || 'all'}
                            onChange={(e) => handleUpdateGroupSettings({ editGroupInfo: e.target.value as any })}
                            className="luxury-input text-[10px]"
                          >
                            <option value="all">All Participants</option>
                            <option value="admins">Only Admins</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <span className="micro-label">Send Messages</span>
                          <select 
                            value={selectedGroup.settings?.sendMessages || 'all'}
                            onChange={(e) => handleUpdateGroupSettings({ sendMessages: e.target.value as any })}
                            className="luxury-input text-[10px]"
                          >
                            <option value="all">All Participants</option>
                            <option value="admins">Only Admins</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <span className="micro-label">Edit Settings</span>
                          <select 
                            value={selectedGroup.settings?.editGroupSettings || 'all_admins'}
                            onChange={(e) => handleUpdateGroupSettings({ editGroupSettings: e.target.value as any })}
                            className="luxury-input text-[10px]"
                          >
                            <option value="all_admins">All Admins</option>
                            <option value="super_admin">Only Super Admin (Owner)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <span className="micro-label">Approve New Members</span>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleUpdateGroupSettings({ approveNewMembers: !selectedGroup.settings?.approveNewMembers })}
                              className={`w-10 h-6 rounded-full transition-all relative ${selectedGroup.settings?.approveNewMembers ? "bg-accent" : "bg-white/10"}`}
                            >
                              <motion.div 
                                animate={{ x: selectedGroup.settings?.approveNewMembers ? 18 : 2 }}
                                className="absolute top-1 w-4 h-4 rounded-full bg-white" 
                              />
                            </button>
                            <span className="text-[10px] text-muted">Admin Approval Required</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <span className="micro-label">Disappearing Messages</span>
                          <select 
                            value={selectedGroup.settings?.disappearingMessages || 0}
                            onChange={(e) => handleUpdateGroupSettings({ disappearingMessages: Number(e.target.value) })}
                            className="luxury-input text-[10px]"
                          >
                            <option value={0}>Off</option>
                            <option value={24}>24 Hours</option>
                            <option value={168}>7 Days</option>
                            <option value={720}>30 Days</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <span className="micro-label">Invite Link & QR</span>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 luxury-input text-[10px] flex items-center overflow-hidden">
                              <span className="truncate opacity-50">https://ais-pre-xu735imty3vj2mvbenxa63-788959364594.asia-southeast1.run.app/join/{selectedGroup.inviteLink || 'none'}</span>
                            </div>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(`https://ais-pre-xu735imty3vj2mvbenxa63-788959364594.asia-southeast1.run.app/join/${selectedGroup.inviteLink}`);
                                toast.success("Link copied to clipboard");
                              }}
                              className="p-2 text-accent hover:bg-accent/10 rounded-full transition-all"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={handleResetInviteLink}
                              className="p-2 text-accent hover:bg-accent/10 rounded-full transition-all"
                              title="Reset Link"
                            >
                              <Plus className="w-4 h-4 rotate-45" />
                            </button>
                          </div>
                          
                          <div className="flex justify-center p-4 bg-white rounded-3xl">
                            <QRCodeSVG 
                              value={`https://ais-pre-xu735imty3vj2mvbenxa63-788959364594.asia-southeast1.run.app/join/${selectedGroup.inviteLink}`}
                              size={120}
                              level="H"
                              includeMargin={true}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {selectedGroup.pendingMembers && selectedGroup.pendingMembers.length > 0 && isAdmin && (
                      <div className="space-y-2 mb-8">
                        <h3 className="text-xs uppercase tracking-widest font-bold text-accent">Pending Approvals</h3>
                        {allUsers.filter(u => selectedGroup.pendingMembers?.includes(u.uid)).map(user => (
                          <div key={user.uid} className="flex items-center justify-between p-4 bg-accent/5 rounded-2xl border border-accent/20">
                            <div className="flex items-center gap-3">
                              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                              <span className="text-xs font-medium">{user.displayName}</span>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={async () => {
                                  const groupRef = doc(db, "groups", selectedGroup.id);
                                  await updateDoc(groupRef, {
                                    members: [...selectedGroup.members, user.uid],
                                    pendingMembers: selectedGroup.pendingMembers?.filter(id => id !== user.uid)
                                  });
                                }}
                                className="p-2 bg-accent text-bg rounded-full hover:scale-110 transition-transform"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={async () => {
                                  const groupRef = doc(db, "groups", selectedGroup.id);
                                  await updateDoc(groupRef, {
                                    pendingMembers: selectedGroup.pendingMembers?.filter(id => id !== user.uid)
                                  });
                                }}
                                className="p-2 bg-white/5 text-muted rounded-full hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                    <h3 className="text-xs uppercase tracking-widest font-bold">Members</h3>
                    {isAdmin && (
                      <button 
                        onClick={() => setShowAddMember(true)}
                        className="flex items-center gap-2 text-accent hover:text-ink transition-colors text-[10px] uppercase tracking-widest"
                      >
                        <Plus className="w-3 h-3" /> Add Member
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {allUsers.filter(u => selectedGroup.members.includes(u.uid)).map(member => (
                      <div key={member.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onViewProfile(member)}>
                          <img src={member.photoURL} alt="" className="w-8 h-8 rounded-full grayscale" />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{member.displayName}</span>
                              {selectedGroup.createdBy === member.uid && (
                                <span className="px-1.5 py-0.5 bg-accent/20 text-accent text-[8px] rounded uppercase font-bold">Owner</span>
                              )}
                            </div>
                            {(selectedGroup.admins || []).includes(member.uid) && (
                              <span className="text-[8px] text-accent uppercase tracking-widest">Admin</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAdmin && member.uid !== currentUser?.uid && (
                            <>
                              {selectedGroup.createdBy === currentUser?.uid && (
                                <button
                                  onClick={() => handleTransferOwnership(member.uid)}
                                  className="p-2 text-muted hover:text-accent transition-colors"
                                  title="Transfer Ownership"
                                >
                                  <Shield className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleToggleAdmin(member.uid)}
                                className="p-2 text-muted hover:text-accent transition-colors"
                                title={(selectedGroup.admins || []).includes(member.uid) ? "Remove Admin" : "Make Admin"}
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveMember(member.uid)}
                                className="p-2 text-muted hover:text-red-500 transition-colors"
                                title="Remove Member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-white/5 flex justify-between gap-4">
                <button
                  onClick={handleLeaveGroup}
                  className="luxury-button bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-bg"
                >
                  Leave Collective
                </button>
                <button
                  onClick={() => setShowGroupSettings(false)}
                  className="luxury-button bg-ink text-bg hover:bg-accent"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md glass-panel rounded-[40px] p-8 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif italic">Edit Transmission</h3>
                <button onClick={() => setEditingMessage(null)} className="p-2 text-muted hover:text-ink">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <textarea
                value={editMessageText}
                onChange={(e) => setEditMessageText(e.target.value)}
                className="luxury-input h-32 resize-none"
                placeholder="Modify your message..."
              />

              {editingMessage.fileUrl && (
                <div className="space-y-4">
                  <div className="relative rounded-3xl overflow-hidden aspect-video bg-white/5 border border-white/10 group">
                    {editingMessage.fileType?.startsWith("image/") ? (
                      <img src={editingFile ? URL.createObjectURL(editingFile) : editingMessage.fileUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <video src={editingFile ? URL.createObjectURL(editingFile) : editingMessage.fileUrl} className="w-full h-full object-cover" />
                    )}
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Plus className="w-12 h-12 text-white" />
                    </button>
                  </div>
                  {editingMessage.fileType?.startsWith("image/") && (
                    <button
                      onClick={() => {
                        if (editingFile) {
                          setEditingFile(editingFile);
                        } else {
                          fetch(editingMessage.fileUrl!)
                            .then(res => res.blob())
                            .then(blob => {
                              const file = new File([blob], editingMessage.fileName || "image.png", { type: editingMessage.fileType || "image/png" });
                              setEditingFile(file);
                            });
                        }
                      }}
                      className="w-full luxury-button bg-white/5 text-ink hover:bg-white/10 text-[10px]"
                    >
                      Open Creative Studio
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleEditMessage}
                  disabled={isUploading}
                  className="luxury-button bg-accent text-bg hover:bg-ink disabled:opacity-50"
                >
                  {isUploading ? "Updating..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setEditingMessage(null)}
                  className="luxury-button bg-white/5 text-ink hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPinnedMessages && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md glass-panel rounded-[40px] p-8 space-y-6 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif italic">Pinned Transmissions</h3>
                <button onClick={() => setShowPinnedMessages(false)} className="p-2 text-muted hover:text-ink">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                {messages.filter(m => m.pinned).length === 0 ? (
                  <p className="text-center text-muted text-sm py-8">No pinned transmissions found.</p>
                ) : (
                  messages.filter(m => m.pinned).map(msg => (
                    <div 
                      key={msg.id}
                      onClick={() => {
                        setShowPinnedMessages(false);
                        const el = document.getElementById(`message-${msg.id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('bg-accent/20');
                          setTimeout(() => el.classList.remove('bg-accent/20'), 2000);
                        } else {
                          toast.error("Message is too old to jump to.");
                        }
                      }}
                      className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:border-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-accent">{msg.senderName}</span>
                        <span className="text-[10px] text-muted">
                          {format(msg.timestamp?.toDate() || new Date(), "MMM do, h:mma")}
                        </span>
                      </div>
                      <div className="text-sm line-clamp-3">
                        {decryptedMessages[msg.id] || msg.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForwardModal && forwardMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md glass-panel rounded-[40px] p-8 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif italic">Forward Transmission</h3>
                <button onClick={() => setShowForwardModal(false)} className="p-2 text-muted hover:text-ink">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <input 
                  type="text"
                  placeholder="Add a personal message..."
                  value={forwardNote}
                  onChange={(e) => setForwardNote(e.target.value)}
                  className="luxury-input text-sm w-full"
                />
                <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                  <span className="micro-label">Connections</span>
                  {allUsers.map(user => (
                    <button
                      key={user.uid}
                      onClick={() => {
                        setForwardTargets(prev => 
                          prev.includes(user.uid) ? prev.filter(id => id !== user.uid) : [...prev, user.uid]
                        );
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-colors text-left group ${
                        forwardTargets.includes(user.uid) ? "bg-accent/10 border border-accent/20" : "hover:bg-white/5"
                      }`}
                    >
                      <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full grayscale group-hover:grayscale-0 transition-all" />
                      <div className="flex flex-col flex-1">
                        <span className="text-sm font-medium">{user.displayName}</span>
                        <span className="micro-label">{user.status}</span>
                      </div>
                      {forwardTargets.includes(user.uid) && <Check className="w-4 h-4 text-accent" />}
                    </button>
                  ))}
                  <span className="micro-label mt-4 block">Collectives</span>
                  {allGroups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => {
                        setForwardTargets(prev => 
                          prev.includes(group.id) ? prev.filter(id => id !== group.id) : [...prev, group.id]
                        );
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-colors text-left group ${
                        forwardTargets.includes(group.id) ? "bg-accent/10 border border-accent/20" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                        <Users className="w-5 h-5 text-muted" />
                      </div>
                      <div className="flex flex-col flex-1">
                        <span className="text-sm font-medium">{group.name}</span>
                        <span className="micro-label">{group.members.length} Members</span>
                      </div>
                      {forwardTargets.includes(group.id) && <Check className="w-4 h-4 text-accent" />}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end gap-4 pt-4">
                  <button 
                    onClick={() => { setShowForwardModal(false); setForwardTargets([]); setForwardNote(""); }} 
                    className="px-6 py-3 rounded-full bg-white/5 text-ink hover:bg-white/10 transition-colors text-xs uppercase tracking-widest font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleForwardSelected}
                    disabled={forwardTargets.length === 0}
                    className="px-6 py-3 rounded-full bg-accent text-bg hover:bg-ink transition-colors text-xs uppercase tracking-widest font-bold disabled:opacity-50"
                  >
                    Forward ({forwardTargets.length})
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirm.isOpen}
        onClose={() => setShowConfirm(prev => ({ ...prev, isOpen: false }))}
        onConfirm={showConfirm.onConfirm}
        title={showConfirm.title}
        message={showConfirm.message}
        type={showConfirm.type}
      />

      <ConfirmationModal
        isOpen={!!showEditConfirm}
        onClose={() => setShowEditConfirm(null)}
        onConfirm={() => {
          if (showEditConfirm) {
            setEditingMessage(showEditConfirm);
            const decryptedText = decryptedMessages[showEditConfirm.id];
            setEditMessageText(decryptedText || showEditConfirm.text);
            setShowEditConfirm(null);
          }
        }}
        title="Edit Transmission"
        message="Are you sure you want to edit this transmission? The original content will be modified."
        confirmText="Proceed"
        cancelText="Cancel"
      />

      <ImageViewer 
        src={viewingPhoto} 
        onClose={() => setViewingPhoto(null)} 
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs glass-panel rounded-[32px] p-8 text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-serif italic">Purge Transmission?</h3>
                <p className="text-xs text-muted leading-relaxed">
                  {showDeleteConfirm.forEveryone 
                    ? "This will permanently remove the record for all participants." 
                    : "This will remove the record from your personal history."}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleDeleteMessage(showDeleteConfirm.message.id, showDeleteConfirm.forEveryone)}
                  className="luxury-button bg-red-500 text-bg hover:bg-red-600"
                >
                  Confirm Purge
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="luxury-button bg-white/5 text-ink hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddMember && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md glass-panel rounded-[40px] p-8 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif italic">Recruit Member</h3>
                <button onClick={() => setShowAddMember(false)} className="p-2 text-muted hover:text-ink">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {allUsers.filter(u => !selectedGroup?.members.includes(u.uid)).map(user => (
                  <button
                    key={user.uid}
                    onClick={() => handleAddMember(user)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-colors text-left group"
                  >
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full grayscale group-hover:grayscale-0 transition-all" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{user.displayName}</span>
                      <span className="micro-label">{user.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      {isChatUnlocked && (
        <div className="h-[50px] md:h-auto p-2 md:p-8 glass-panel rounded-none border-b-0 border-x-0 z-20 flex items-center">
          {isBlocked ? (
            <div className="flex items-center justify-center p-6 bg-red-500/5 rounded-[32px] border border-red-500/10 text-red-500 micro-label">
              <ShieldOff className="w-4 h-4 mr-3" /> Connection Severed. Restore to transmit data.
            </div>
          ) : !canSendMessages ? (
            <div className="flex items-center justify-center p-6 bg-white/5 rounded-[32px] border border-white/10 text-muted micro-label">
              <Lock className="w-4 h-4 mr-3" /> Only admins can send messages in this collective.
            </div>
          ) : (
            <div className="max-w-5xl mx-auto relative">
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-32 left-0 z-20"
                >
                  <EmojiPicker 
                    onEmojiClick={onEmojiClick} 
                    theme={Theme.DARK}
                    width={320}
                    height={400}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showGifPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-32 left-0 z-20 w-80 glass-panel rounded-[32px] overflow-hidden shadow-2xl"
                >
                  <div className="p-6 border-b border-white/5">
                    <input
                      type="text"
                      placeholder="Search Giphy..."
                      value={gifSearch}
                      onChange={(e) => setGifSearch(e.target.value)}
                      className="luxury-input text-xs"
                    />
                  </div>
                  <div className="h-64 overflow-y-auto p-4 grid grid-cols-2 gap-3 custom-scrollbar">
                    {gifs.map((gif) => (
                      <button
                        key={gif.id}
                        onClick={() => sendGif(gif.images.fixed_height.url)}
                        className="rounded-2xl overflow-hidden hover:scale-105 transition-transform aspect-square bg-white/5"
                      >
                        <img src={gif.images.fixed_height.url} alt="" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-4">
              {isSevered && !isEmergencyMode ? (
                <div className="p-6 text-center glass-panel rounded-[32px] border border-red-500/30">
                  <p className="text-red-500 font-serif italic mb-4">Severed connection {selectedUser?.displayName}</p>
                  <button 
                    onClick={() => setIsEmergencyMode(true)}
                    className="luxury-button bg-red-500 text-white hover:bg-red-600 flex items-center gap-2 mx-auto"
                  >
                    <Sparkles className="w-4 h-4" /> Emergency Text
                  </button>
                </div>
              ) : (
                <>
                  {isEmergencyMode && (
                    <div className="mb-2 flex items-center justify-between px-4 py-2 bg-red-500/10 rounded-xl border border-red-500/20">
                      <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest animate-pulse">
                        Emergency Mode Active ({liveCurrentUser?.settings?.emergencyMessagesCount?.[getChatId(auth.currentUser!.uid, selectedUser!.uid)] || 0}/3)
                      </span>
                      <button onClick={() => setIsEmergencyMode(false)} className="text-[10px] text-muted hover:text-ink underline">Exit</button>
                    </div>
                  )}
                  {replyingTo && (
                <motion.div 
                  layout
                  initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  className="mb-2 p-3 bg-black/20 rounded-2xl border-l-2 border-accent flex items-center justify-between"
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-bold text-accent mb-1">Replying to {replyingTo.senderName}</span>
                    <span className="text-sm text-muted truncate">
                      {replyingTo.voiceUrl ? (
                        <span className="flex items-center gap-2"><Mic className="w-3 h-3" /> Voice Message</span>
                      ) : replyingTo.fileUrl ? (
                        <span className="flex items-center gap-2"><Paperclip className="w-3 h-3" /> {replyingTo.fileName || "Attachment"}</span>
                      ) : (
                        replyingTo.text
                      )}
                    </span>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="p-2 text-muted hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
              <div className="flex items-center gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                <button 
                  type="button"
                  onClick={handleShareLocation}
                  disabled={isUploading || (isSevered && !isEmergencyMode)}
                  className="p-3 text-muted hover:text-ink glass-panel rounded-2xl transition-all"
                  title="Share Location"
                >
                  <MapPin className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || (isSevered && !isEmergencyMode)}
                  className="p-3 text-muted hover:text-ink glass-panel rounded-2xl transition-all"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button 
                  type="button" 
                  onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
                  disabled={isSevered && !isEmergencyMode}
                  className={`p-3 transition-colors glass-panel rounded-2xl ${showEmojiPicker ? "text-accent" : "text-muted hover:text-ink"}`}
                >
                  <Smile className="w-5 h-5" />
                </button>
                <button 
                  type="button" 
                  onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }}
                  disabled={isSevered && !isEmergencyMode}
                  className={`p-3 micro-label transition-colors glass-panel rounded-2xl ${showGifPicker ? "text-accent" : "text-muted hover:text-ink"}`}
                >
                  GIF
                </button>
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-6">
                <div className="flex-1 relative flex items-center gap-4">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder={isEmergencyMode ? "Transmit emergency message..." : "Transmit message..."}
                    className={`luxury-input text-sm ${isEmergencyMode ? "border-red-500/50 focus:border-red-500" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                    disabled={isSevered && !isEmergencyMode}
                    className={`p-3 rounded-full transition-all ${showVoiceRecorder ? "bg-red-500 text-bg" : "text-muted hover:text-ink glass-panel"}`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  className={`w-10 h-10 md:w-14 md:h-14 ${isEmergencyMode ? "bg-red-500" : "bg-accent"} text-bg rounded-full flex items-center justify-center shadow-xl hover:opacity-80 transition-all`}
                >
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                </motion.button>
              </form>
            </>
          )}
        </div>

            <AnimatePresence>
              {showVoiceRecorder && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mt-6 flex items-center justify-between p-6 glass-panel rounded-[32px]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="micro-label"><ScrambleText text="Capturing Audio..." /></span>
                  </div>
                  <AudioRecorder 
                    onRecordingComplete={handleVoiceMessage}
                    recorderControls={recorderControls}
                    showVisualizer={true}
                  />
                  <button onClick={() => setShowVoiceRecorder(false)} className="p-2 text-muted hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}
        </div>
      )}

      {/* Call Quality Settings */}
      <AnimatePresence>
        {showCallSettings.show && (
          <CallQualitySettings
            type={showCallSettings.type}
            onStart={(settings) => {
              setShowCallSettings({show: false, type: 'video'});
              onStartCall(showCallSettings.type, settings);
            }}
            onCancel={() => setShowCallSettings({show: false, type: 'video'})}
          />
        )}
      </AnimatePresence>

      {/* Media Editor */}
      <AnimatePresence>
        {editingFile && (
          <MediaEditor
            file={editingFile}
            onSave={(edited, caption) => {
              processFileUpload(edited, caption);
              setEditingFile(null);
            }}
            onCancel={() => setEditingFile(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Chat;
