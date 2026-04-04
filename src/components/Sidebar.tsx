import React, { useEffect, useState } from "react";
import { db, auth, logout, handleFirestoreError, OperationType, getChatId } from "../lib/firebase";
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, updateDoc, serverTimestamp, addDoc, Timestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AppUser, Group } from "../types";
import { ScrambleText } from "./ScrambleText";
import { 
  LogOut, 
  User as UserIcon, 
  Search, 
  X, 
  Settings, 
  Users, 
  Plus, 
  MoreVertical, 
  Clock, 
  Phone, 
  Video as VideoIcon, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed, 
  UserPlus, 
  Check,
  Pin,
  BellOff,
  Monitor
} from "lucide-react";
import CreateGroupModal from "./CreateGroupModal";
import { formatDistanceToNow } from "date-fns";
import ImageViewer from "./ImageViewer";

interface SidebarProps {
  onSelectUser: (user: AppUser) => void;
  onSelectGroup: (group: Group) => void;
  selectedUserId?: string;
  selectedGroupId?: string;
  selectedFeedId?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenStatus: (uid?: string) => void;
  onSelectFeed?: (feed: any) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onSelectUser, 
  onSelectGroup, 
  selectedUserId, 
  selectedGroupId, 
  selectedFeedId,
  isOpen, 
  onClose,
  onOpenSettings,
  onOpenStatus,
  onSelectFeed
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'groups' | 'calls' | 'feeds'>('chats');
  const [callFilter, setCallFilter] = useState<'all' | 'dialed' | 'received' | 'missed'>('all');
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [feeds, setFeeds] = useState<any[]>([]);
  const [userData, setUserData] = useState<AppUser | null>(null);
  const [recentChatUids, setRecentChatUids] = useState<string[]>([]);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;

    // Listen to current user's data for friends and requests
    const unsubUserData = onSnapshot(doc(db, "users", currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserData(doc.data() as AppUser);
      }
    });

    // Listen to all users for search
    const unsubAllUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const list: AppUser[] = [];
      snapshot.forEach((doc) => {
        if (doc.id !== currentUser.uid) {
          list.push(doc.data() as AppUser);
        }
      });
      setAllUsers(list);
    });

    // Listen to messages to find recent chats
    const messagesQuery = query(
      collection(db, "messages"),
      where("participants", "array-contains", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const uids = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.isGroup) {
          const otherUid = data.participants.find((id: string) => id !== currentUser.uid);
          if (otherUid) uids.add(otherUid);
        }
      });
      setRecentChatUids(Array.from(uids));
    });

    const groupsQuery = query(
      collection(db, "groups"), 
      where("members", "array-contains", currentUser.uid),
      orderBy("lastMessageTime", "desc")
    );
    const unsubGroups = onSnapshot(groupsQuery, (snapshot) => {
      const groupsList: Group[] = [];
      snapshot.forEach((doc) => {
        groupsList.push({ id: doc.id, ...doc.data() } as Group);
      });
      setGroups(groupsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups");
    });

    const statusesQuery = query(collection(db, "statuses"), orderBy("createdAt", "desc"));
    const unsubStatuses = onSnapshot(statusesQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Group by user
      const grouped = list.reduce((acc: any, status: any) => {
        if (!acc[status.uid]) {
          acc[status.uid] = {
            uid: status.uid,
            displayName: status.displayName,
            photoURL: status.photoURL,
            statuses: []
          };
        }
        acc[status.uid].statuses.push(status);
        return acc;
      }, {});
      setStatuses(Object.values(grouped));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "statuses");
    });

    const callsQuery = query(
      collection(db, "calls"),
      where("participants", "array-contains", currentUser.uid),
      orderBy("startTime", "desc")
    );
    const unsubCalls = onSnapshot(callsQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setCallHistory(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "calls");
    });

    const feedsQuery = query(
      collection(db, "rtsp_feeds"),
      where("ownerId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );
    const unsubFeeds = onSnapshot(feedsQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setFeeds(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "rtsp_feeds");
    });

    return () => {
      unsubUserData();
      unsubAllUsers();
      unsubMessages();
      unsubGroups();
      unsubStatuses();
      unsubCalls();
      unsubFeeds();
    };
  }, [currentUser]);

  const friends = allUsers.filter(u => userData?.friends?.includes(u.uid));
  const recentChats = allUsers.filter(u => recentChatUids.includes(u.uid) && !userData?.friends?.includes(u.uid));
  
  const searchResults = searchTerm 
    ? allUsers.filter(u => 
        (u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
         u.username?.toLowerCase().includes(searchTerm.toLowerCase())) &&
        u.uid !== currentUser?.uid
      )
    : [];

  const handleAddFriend = async (targetUid: string) => {
    if (!currentUser || !userData) return;
    try {
      const userRef = doc(db, "users", currentUser.uid);
      const targetRef = doc(db, "users", targetUid);
      
      // Mutual add
      await updateDoc(userRef, {
        friends: Array.from(new Set([...(userData.friends || []), targetUid]))
      });

      const targetDoc = await getDoc(targetRef);
      if (targetDoc.exists()) {
        const targetData = targetDoc.data() as AppUser;
        await updateDoc(targetRef, {
          friends: Array.from(new Set([...(targetData.friends || []), currentUser.uid]))
        });

        // Send system message
        const chatId = getChatId(currentUser.uid, targetUid);
        await addDoc(collection(db, "messages"), {
          chatId,
          senderId: "system",
          senderName: "System",
          receiverId: targetUid,
          text: `You have been added to the contact list of ${userData.displayName}. You can now transmit records to each other.`,
          timestamp: serverTimestamp(),
          participants: [currentUser.uid, targetUid]
        });
        
        toast.success("Contact added successfully!");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const handleAcceptRequest = async (fromUid: string) => {
    if (!currentUser || !userData) return;
    try {
      const userRef = doc(db, "users", currentUser.uid);
      const fromRef = doc(db, "users", fromUid);
      
      const newRequests = (userData.friendRequests || []).filter(r => r.from !== fromUid);
      const newFriends = Array.from(new Set([...(userData.friends || []), fromUid]));
      
      await updateDoc(userRef, {
        friendRequests: newRequests,
        friends: newFriends
      });

      const fromDoc = await getDoc(fromRef);
      if (fromDoc.exists()) {
        const fromData = fromDoc.data() as AppUser;
        await updateDoc(fromRef, {
          friends: Array.from(new Set([...(fromData.friends || []), currentUser.uid]))
        });

        // Send system message
        const chatId = getChatId(currentUser.uid, fromUid);
        await addDoc(collection(db, "messages"), {
          chatId,
          senderId: "system",
          senderName: "System",
          receiverId: fromUid,
          text: `You have been added to the contact list of ${userData.displayName}. You can now transmit records to each other.`,
          timestamp: serverTimestamp(),
          participants: [currentUser.uid, fromUid]
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const formatLastSeen = (user: AppUser) => {
    if (user.settings?.showLastSeen === false) return "";
    if (!user.lastSeen) return "";
    try {
      const date = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (e) {
      return "";
    }
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-40 w-80 md:w-96 bg-bg border-r border-border transition-transform duration-500 ease-[0.16, 1, 0.3, 1] transform ${isOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="p-8 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="micro-label">Platform</span>
          <div className="flex flex-col">
            <h1 className="text-2xl font-serif italic tracking-tight">Tarsus</h1>
            <span className="text-[8px] text-muted/60 uppercase tracking-[0.3em] -mt-1">branch of tarsi</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenStatus()}
            className="p-2 text-muted hover:text-accent transition-colors"
            title="Moments"
          >
            <Clock className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 text-muted hover:text-ink transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="md:hidden p-2 text-muted hover:text-ink transition-colors"
          >
             <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 flex gap-8 border-b border-border">
        <button
          onClick={() => setActiveTab('chats')}
          className={`pb-4 text-[10px] uppercase tracking-[0.2em] font-bold transition-all relative ${
            activeTab === 'chats' ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          Connections
          {activeTab === 'chats' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`pb-4 text-[10px] uppercase tracking-[0.2em] font-bold transition-all relative ${
            activeTab === 'groups' ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          Collectives
          {activeTab === 'groups' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
        </button>
        <button
          onClick={() => setActiveTab('calls')}
          className={`pb-4 text-[10px] uppercase tracking-[0.2em] font-bold transition-all relative ${
            activeTab === 'calls' ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          Transmissions
          {activeTab === 'calls' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
        </button>
        <button
          onClick={() => setActiveTab('feeds')}
          className={`pb-4 text-[10px] uppercase tracking-[0.2em] font-bold transition-all relative ${
            activeTab === 'feeds' ? "text-ink" : "text-muted hover:text-ink"
          }`}
        >
          Feeds
          {activeTab === 'feeds' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-px bg-accent" />}
        </button>
      </div>

      {/* Status Bar */}
      <div className="px-8 py-4 border-b border-border overflow-x-auto flex gap-4 custom-scrollbar no-scrollbar">
        <button
          onClick={() => onOpenStatus()}
          className="flex-shrink-0 flex flex-col items-center gap-2 group"
        >
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-muted flex items-center justify-center group-hover:border-accent transition-colors">
            <Plus className="w-6 h-6 text-muted group-hover:text-accent" />
          </div>
          <span className="text-[8px] uppercase tracking-widest text-muted">You</span>
        </button>
        {statuses.map((userStatus) => (
          <button
            key={userStatus.uid}
            onClick={() => onOpenStatus(userStatus.uid)}
            onContextMenu={(e) => {
              e.preventDefault();
              setViewingPhoto(userStatus.photoURL);
            }}
            className="flex-shrink-0 flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full border-2 border-accent p-0.5 group-hover:scale-105 transition-transform">
              <img
                src={userStatus.photoURL}
                alt={userStatus.displayName}
                className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0 transition-all"
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="text-[8px] uppercase tracking-widest text-muted truncate w-14 text-center">
              {userStatus.displayName.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-8">
        <div className="relative group">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
          <input
            type="text"
            placeholder="Search users to add..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="luxury-input pl-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {activeTab === 'chats' ? (
            <div className="space-y-6">
              {/* Search Results */}
              {searchTerm && searchResults.length > 0 && (
                <div className="space-y-2">
                  <span className="micro-label px-4">Global Search</span>
                  {searchResults.map(user => (
                    <div key={user.uid} className="flex items-center justify-between p-4 rounded-3xl bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full grayscale" referrerPolicy="no-referrer" />
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-medium truncate">{user.displayName}</span>
                          <span className="text-[10px] text-muted truncate">@{user.username || 'user'}</span>
                        </div>
                      </div>
                      {userData?.friends?.includes(user.uid) ? (
                        <span className="text-[8px] uppercase tracking-widest text-accent px-3 py-1 bg-accent/10 rounded-full">Connected</span>
                      ) : (
                        <button 
                          onClick={() => handleAddFriend(user.uid)}
                          className="p-2 text-accent hover:bg-accent/10 rounded-full transition-all"
                          title="Add to connections"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pinned Chats */}
              {userData?.pinnedChats?.length > 0 && (
                <div className="space-y-2 mb-8">
                  <span className="micro-label px-4 flex items-center gap-2">
                    <Pin className="w-2 h-2" /> Pinned
                  </span>
                  {friends.filter(f => userData.pinnedChats.includes(f.uid)).map(user => (
                    <motion.button
                      key={user.uid}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => onSelectUser(user)}
                      className={`w-full flex items-center gap-4 p-4 rounded-3xl transition-all group ${
                        selectedUserId === user.uid ? "bg-white/5" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={getPhotoURL(user)}
                          alt={user.displayName}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canSeePhoto(user)) setViewingPhoto(user.photoURL);
                          }}
                          className={`w-12 h-12 rounded-full object-cover transition-all duration-500 ${canSeePhoto(user) ? "cursor-zoom-in hover:scale-110" : ""}`}
                          referrerPolicy="no-referrer"
                        />
                        {['online', 'active', 'transmitting'].includes(user.status || '') && user.settings?.showOnlineStatus !== false && (
                          <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bg ${
                            user.status === 'transmitting' ? 'bg-orange-500 animate-pulse' : 'bg-accent'
                          }`} />
                        )}
                      </div>
                      <div className="flex-1 text-left overflow-hidden">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium truncate">{user.displayName}</div>
                          {userData.mutedChats?.some(m => m.chatId === user.uid) && <BellOff className="w-2 h-2 opacity-50" />}
                        </div>
                        <div className="text-[10px] text-muted uppercase tracking-wider truncate">
                          {user.status === 'transmitting' ? (
                            <span className="text-orange-500 font-bold"><ScrambleText text="Transmitting..." /></span>
                          ) : ['online', 'active'].includes(user.status || '') && user.settings?.showOnlineStatus !== false 
                            ? "Active" 
                            : formatLastSeen(user)}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Friends */}
              <div className="space-y-2">
                <span className="micro-label px-4">Friends</span>
                {friends.length > 0 ? friends.filter(f => !userData?.pinnedChats?.includes(f.uid)).map((user) => (
                  <motion.button
                    key={user.uid}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => onSelectUser(user)}
                    className={`w-full flex items-center gap-4 p-4 rounded-3xl transition-all group ${
                      selectedUserId === user.uid ? "bg-white/5" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={getPhotoURL(user)}
                        alt={user.displayName}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canSeePhoto(user)) setViewingPhoto(user.photoURL);
                        }}
                        className={`w-12 h-12 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 ${canSeePhoto(user) ? "cursor-zoom-in hover:scale-110" : ""}`}
                        referrerPolicy="no-referrer"
                      />
                      {['online', 'active', 'transmitting'].includes(user.status || '') && user.settings?.showOnlineStatus !== false && (
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bg ${
                          user.status === 'transmitting' ? 'bg-orange-500 animate-pulse' : 'bg-accent'
                        }`} />
                      )}
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="text-sm font-medium truncate">{user.displayName}</div>
                      <div className="text-[10px] text-muted uppercase tracking-wider truncate">
                        {user.status === 'transmitting' ? (
                          <span className="text-orange-500 font-bold"><ScrambleText text="Transmitting..." /></span>
                        ) : ['online', 'active'].includes(user.status || '') && user.settings?.showOnlineStatus !== false ? (
                          "Active" 
                        ) : (
                          formatLastSeen(user)
                        )}
                      </div>
                    </div>
                  </motion.button>
                )) : (
                  <p className="text-[10px] text-muted text-center py-4 uppercase tracking-widest">No friends yet</p>
                )}
              </div>

              {/* Recent Chats (Non-friends who messaged) */}
              {recentChats.length > 0 && (
                <div className="space-y-2">
                  <span className="micro-label px-4">Recent Transmissions</span>
                  {recentChats.map((user) => (
                    <motion.button
                      key={user.uid}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => onSelectUser(user)}
                      className={`w-full flex items-center gap-4 p-4 rounded-3xl transition-all group ${
                        selectedUserId === user.uid ? "bg-white/5" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={getPhotoURL(user)}
                          alt={user.displayName}
                          className={`w-12 h-12 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 ${canSeePhoto(user) ? "opacity-50" : "opacity-30"}`}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 text-left overflow-hidden">
                        <div className="text-sm font-medium truncate text-muted">{user.displayName}</div>
                        <div className="text-[10px] text-muted uppercase tracking-wider truncate italic">Not in connections</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'groups' ? (
            filteredGroups.map((group) => (
              <motion.button
                key={group.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => onSelectGroup(group)}
                className={`w-full flex items-center gap-4 p-4 rounded-3xl transition-all group mb-2 ${
                  selectedGroupId === group.id
                    ? "bg-white/5"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center grayscale group-hover:grayscale-0 transition-all">
                  <Users className="w-5 h-5 text-muted" />
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <div className="text-sm font-medium truncate">{group.name}</div>
                  <div className="text-[10px] text-muted uppercase tracking-wider truncate">
                    {group.members.length} Members
                  </div>
                </div>
              </motion.button>
            ))
          ) : activeTab === 'calls' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-4">
                {(['all', 'dialed', 'received', 'missed'] as const).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setCallFilter(filter)}
                    className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest transition-all ${
                      callFilter === filter ? 'bg-accent text-bg font-bold' : 'bg-white/5 text-muted hover:bg-white/10'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              
              {callHistory.filter(call => {
                const isCaller = call.callerId === currentUser?.uid;
                if (callFilter === 'dialed') return isCaller;
                if (callFilter === 'received') return !isCaller && call.status === 'completed';
                if (callFilter === 'missed') return !isCaller && (call.status === 'missed' || call.status === 'rejected');
                return true;
              }).map((call) => {
                const isCaller = call.callerId === currentUser?.uid;
                const otherPartyName = isCaller ? call.receiverName : call.callerName;
                const otherPartyPhoto = isCaller ? call.receiverPhoto : call.callerPhoto;
                const otherPartyUid = isCaller ? call.receiverId : call.callerId;
                const otherUser = allUsers.find(u => u.uid === otherPartyUid) || { uid: otherPartyUid, displayName: otherPartyName, photoURL: otherPartyPhoto } as AppUser;
                
                return (
                  <motion.button
                    key={call.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => onSelectUser(otherUser)}
                    className="w-full flex items-center gap-4 p-4 rounded-3xl transition-all group mb-2 hover:bg-white/[0.02]"
                  >
                    <div className="relative">
                      <img
                        src={getPhotoURL(otherUser)}
                        alt={otherPartyName}
                        className="w-12 h-12 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-bg ${
                        call.status === 'missed' || call.status === 'rejected' ? "bg-red-500" : "bg-accent"
                      }`}>
                        {call.type === 'video' ? <VideoIcon size={10} className="text-bg" /> : call.type === 'screen_share' ? <Monitor size={10} className="text-bg" /> : <Phone size={10} className="text-bg" />}
                      </div>
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="text-sm font-medium truncate">{otherPartyName}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted uppercase tracking-wider">
                        {isCaller ? <PhoneOutgoing size={10} /> : (call.status === 'missed' || call.status === 'rejected') ? <PhoneMissed size={10} className="text-red-500" /> : <PhoneIncoming size={10} />}
                        <span className={!isCaller && (call.status === 'missed' || call.status === 'rejected') ? "text-red-500" : ""}>
                          {isCaller ? 'Dialed' : call.status === 'completed' ? 'Received' : 'Missed'}
                        </span>
                        <span>•</span>
                        <span>{call.type === 'screen_share' ? 'Screen' : call.type === 'video' ? 'Video' : 'Audio'}</span>
                        <span>•</span>
                        <span>{call.startTime?.toDate ? formatDistanceToNow(call.startTime.toDate(), { addSuffix: true }) : "just now"}</span>
                      </div>
                    </div>
                    {call.duration > 0 && (
                      <div className="text-[10px] font-mono text-muted">
                        {Math.floor(call.duration / 60)}m {call.duration % 60}s
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          ) : activeTab === 'feeds' ? (
            <div className="space-y-2">
              {feeds.length > 0 ? feeds.map((feed) => (
                <motion.button
                  key={feed.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => onSelectFeed && onSelectFeed(feed)}
                  className={`w-full flex items-center gap-4 p-4 rounded-3xl transition-all group mb-2 ${
                    selectedFeedId === feed.id ? "bg-white/5" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="relative w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center text-accent">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="text-sm font-medium truncate">{feed.name}</div>
                    <div className="text-[10px] text-muted uppercase tracking-wider truncate">
                      {feed.url.substring(0, 20)}...
                    </div>
                  </div>
                </motion.button>
              )) : (
                <div className="text-center py-12">
                  <Monitor className="w-8 h-8 text-muted mx-auto mb-4 opacity-50" />
                  <p className="text-xs text-muted uppercase tracking-widest">No Live Feeds</p>
                </div>
              )}
            </div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-8 border-t border-border flex items-center justify-between">
        <button 
          onClick={() => setViewingPhoto(currentUser?.photoURL || null)}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <img
            src={currentUser?.photoURL || ""}
            alt="Me"
            className="w-8 h-8 rounded-full grayscale"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col items-start">
            <span className="text-xs font-medium">{currentUser?.displayName}</span>
            <span className="micro-label">Identity</span>
          </div>
        </button>
        <button onClick={logout} className="p-2 text-muted hover:text-accent transition-colors">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {activeTab === 'groups' && (
        <div className="absolute bottom-24 right-8 flex flex-col gap-4 items-end">
          <AnimatePresence>
            {showJoinGroup && (
              <motion.div
                initial={{ opacity: 0, x: 20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.8 }}
                className="glass-panel p-4 rounded-[32px] shadow-2xl border border-white/10 w-64"
              >
                <div className="space-y-4">
                  <span className="micro-label">Join Collective</span>
                  <input 
                    type="text"
                    placeholder="Enter Invite Link..."
                    value={inviteLink}
                    onChange={(e) => setInviteLink(e.target.value)}
                    className="luxury-input text-[10px]"
                  />
                  <button 
                    onClick={async () => {
                      if (!inviteLink || !currentUser) return;
                      try {
                        const link = inviteLink.split('/').pop();
                        const q = query(collection(db, "groups"), where("inviteLink", "==", link));
                        const snap = await getDocs(q);
                        if (!snap.empty) {
                          const groupDoc = snap.docs[0];
                          const groupData = groupDoc.data() as Group;
                          if (groupData.members.includes(currentUser.uid)) {
                            toast.error("Already a member");
                            return;
                          }
                          
                          if (groupData.settings?.approveNewMembers) {
                            await updateDoc(doc(db, "groups", groupDoc.id), {
                              pendingMembers: [...(groupData.pendingMembers || []), currentUser.uid]
                            });
                            toast.success("Request sent to admins");
                          } else {
                            await updateDoc(doc(db, "groups", groupDoc.id), {
                              members: [...groupData.members, currentUser.uid]
                            });
                            toast.success("Joined successfully");
                          }
                          setInviteLink("");
                          setShowJoinGroup(false);
                        } else {
                          toast.error("Invalid link");
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="w-full py-3 bg-accent text-bg rounded-full text-[10px] uppercase tracking-widest font-bold"
                  >
                    Transmit Request
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex gap-4">
            <button
              onClick={() => setShowJoinGroup(!showJoinGroup)}
              className="w-12 h-12 bg-white/5 text-ink rounded-full flex items-center justify-center border border-white/10 hover:bg-white/10 transition-all"
              title="Join via Link"
            >
              <UserPlus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="w-12 h-12 bg-accent text-bg rounded-full flex items-center justify-center shadow-xl shadow-accent/20 hover:scale-110 transition-transform"
              title="Create Collective"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'feeds' && (
        <div className="absolute bottom-24 right-8 flex flex-col gap-4 items-end">
          <AnimatePresence>
            {showAddFeed && (
              <motion.div
                initial={{ opacity: 0, x: 20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.8 }}
                className="glass-panel p-4 rounded-[32px] shadow-2xl border border-white/10 w-64"
              >
                <div className="space-y-4">
                  <span className="micro-label">Add RTSP Feed</span>
                  <input 
                    type="text"
                    placeholder="Camera Name"
                    value={newFeedName}
                    onChange={(e) => setNewFeedName(e.target.value)}
                    className="luxury-input text-[10px]"
                  />
                  <input 
                    type="text"
                    placeholder="rtsp://..."
                    value={newFeedUrl}
                    onChange={(e) => setNewFeedUrl(e.target.value)}
                    className="luxury-input text-[10px]"
                  />
                  <button 
                    onClick={async () => {
                      if (!newFeedName || !newFeedUrl || !currentUser) return;
                      try {
                        await addDoc(collection(db, "rtsp_feeds"), {
                          name: newFeedName,
                          url: newFeedUrl,
                          ownerId: currentUser.uid,
                          createdAt: serverTimestamp()
                        });
                        setNewFeedName("");
                        setNewFeedUrl("");
                        setShowAddFeed(false);
                        toast.success("Feed added successfully");
                      } catch (err) {
                        handleFirestoreError(err, OperationType.CREATE, "rtsp_feeds");
                      }
                    }}
                    className="w-full py-3 bg-accent text-bg rounded-full text-[10px] uppercase tracking-widest font-bold"
                  >
                    Add Feed
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setShowAddFeed(!showAddFeed)}
            className="w-12 h-12 bg-accent text-bg rounded-full flex items-center justify-center shadow-xl shadow-accent/20 hover:scale-110 transition-transform"
            title="Add Feed"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}

      <CreateGroupModal 
        isOpen={isGroupModalOpen} 
        onClose={() => setIsGroupModalOpen(false)} 
      />

      <ImageViewer 
        src={viewingPhoto} 
        onClose={() => setViewingPhoto(null)} 
      />
    </div>
  );
};

export default Sidebar;
