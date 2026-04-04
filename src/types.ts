import { Timestamp } from "firebase/firestore";

export interface AppUser {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  photoURL: string;
  status: 'active' | 'offline' | 'away' | 'transmitting' | 'online';
  lastSeen: any;
  blockedUsers?: string[];
  friends?: string[];
  friendRequests?: { from: string; status: 'pending' | 'accepted' | 'rejected'; timestamp: any }[];
  bio?: string;
  address?: string;
  dob?: string;
  otherInfo?: string;
  showOnlineStatus?: boolean;
  pinnedChats?: string[];
  mutedChats?: { chatId: string; until: any }[];
  lockedChats?: string[];
  starredMessages?: string[];
  settings?: {
    showLastSeen: boolean;
    showOnlineStatus: boolean;
    showProfilePhoto: 'everyone' | 'contacts' | 'nobody';
    theme?: 'dark' | 'light' | 'glass';
    chatPin?: string;
    chatPins?: { [chatId: string]: string };
    disappearingMessages?: { [chatId: string]: number };
    notificationTones?: { [chatId: string]: string };
    privacy?: {
      onlineStatus: { type: 'all' | 'nobody' | 'custom'; allowedUsers: string[] };
      lastSeen: { type: 'all' | 'nobody' | 'custom'; allowedUsers: string[] };
    };
    emergencyMessagesCount?: { [chatId: string]: number };
  };
}

export interface Group {
  id: string;
  name: string;
  photoURL: string;
  createdBy: string;
  members: string[];
  admins: string[];
  pendingMembers?: string[];
  createdAt: any;
  lastMessage?: string;
  lastMessageTime?: any;
  bio?: string;
  description?: string;
  rules?: string;
  settings?: {
    editGroupInfo: 'all' | 'admins';
    sendMessages: 'all' | 'admins';
    editGroupSettings: 'all_admins' | 'super_admin';
    approveNewMembers: boolean;
    disappearingMessages: number | null; // in seconds, e.g., 86400 for 24h
  };
  inviteLink?: string;
  inviteLinkResetAt?: any;
}

export interface RTSPFeed {
  id: string;
  name: string;
  url: string;
  ownerId: string;
  createdAt: any;
}

export interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  receiverId: string;
  text: string;
  timestamp: any;
  isAI?: boolean;
  chatId: string;
  participants: string[];
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  voiceUrl?: string;
  isDeleted?: boolean;
  isGroup?: boolean;
  deletedFor?: string[];
  reactions?: { userId: string; emoji: string }[];
  forwardedFrom?: string;
  isEdited?: boolean;
  isEncrypted?: boolean;
  disappearingAt?: any;
  typingStartedAt?: any;
  location?: { lat: number; lng: number; address: string };
  contact?: { name: string; phone: string };
  replyTo?: { id: string; text: string; senderName: string; voiceUrl?: string; fileUrl?: string; fileName?: string };
  pinned?: boolean;
  read?: boolean;
  readBy?: string[];
  groupId?: string;
  status?: 'sent' | 'delivered' | 'read';
  isEmergency?: boolean;
}

export interface CallState {
  isActive: boolean;
  isIncoming: boolean;
  isAudioOnly: boolean;
  isScreenShare?: boolean;
  user: AppUser | null;
  signal?: any;
  quality?: {
    video: '720p' | '1080p' | '4k';
    audio: 'standard' | 'high';
    systemAudio: boolean;
  };
}

export interface Status {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string;
  type: 'image' | 'video' | 'text' | 'voice';
  content: string;
  caption?: string;
  expiresAt: any;
  createdAt: any;
  duration: number;
  visibility: 'all_contacts' | 'custom';
  visibleTo?: string[];
  likes?: string[];
  dislikes?: string[];
  views?: string[];
  replies?: { uid: string; text: string; timestamp: any; displayName: string; photoURL: string }[];
}

export interface Call {
  id: string;
  callerId: string;
  callerName: string;
  callerPhoto: string;
  receiverId: string;
  receiverName: string;
  receiverPhoto: string;
  type: 'audio' | 'video' | 'screen_share';
  status: 'missed' | 'completed' | 'rejected' | 'ongoing';
  startTime: any;
  endTime?: any;
  duration?: number;
}
