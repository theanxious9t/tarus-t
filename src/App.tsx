import React, { useEffect, useState } from "react";
import { auth, db, handleFirestoreError, OperationType, syncCurrentUserProfile } from "./lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp, Timestamp, deleteDoc, updateDoc, arrayUnion, arrayRemove, query, collection, where, getDocs } from "firebase/firestore";
import socket from "./lib/socket";
import Auth from "./components/Auth";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import VideoCall from "./components/VideoCall";
import SettingsModal from "./components/SettingsModal";
import StatusFeed from "./components/StatusFeed";
import { UserProfileModal } from "./components/UserProfileModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { motion, AnimatePresence } from "motion/react";
import { toast, Toaster } from "sonner";
import ConfirmationModal from "./components/ConfirmationModal";
import { notificationService } from "./lib/notifications";
import { AppUser, Group } from "./types";
import { Phone, X, Check, Video, MessageSquare, MoreVertical, PhoneOff, Settings, LogOut, Trash2, UserPlus, Shield, ShieldOff, Clock, Monitor } from "lucide-react";

import LiveFeedViewer from "./components/LiveFeedViewer";

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<AppUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedFeed, setSelectedFeed] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showStatusFeed, setShowStatusFeed] = useState(false);
  const [selectedStatusUserId, setSelectedStatusUserId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<AppUser | null>(null);
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
  
  // Call state
  const [callState, setCallState] = useState<{
    isActive: boolean;
    isIncoming: boolean;
    isAudioOnly: boolean;
    isScreenShare?: boolean;
    quality?: any;
    user: AppUser | null;
    signal?: any;
  }>({
    isActive: false,
    isIncoming: false,
    isAudioOnly: false,
    isScreenShare: false,
    user: null,
  });

  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        await syncCurrentUserProfile();

        // Listen to user data
        const userRef = doc(db, "users", currentUser.uid);
        const unsubUser = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data() as AppUser;
            setUserData(data);
            if (!data.username) {
              setShowUsernameModal(true);
            }
          } else {
            // New user
            setShowUsernameModal(true);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        });

        socket.connect();
        socket.emit("join", currentUser.uid);
        
        setLoading(false);

        // Listen for notifications
        const notificationsQuery = query(
          collection(db, "notifications"),
          where("userId", "==", currentUser.uid),
          where("status", "==", "pending")
        );
        const unsubNotifications = onSnapshot(notificationsQuery, (snap) => {
          snap.docs.forEach(async (docSnap) => {
            const data = docSnap.data();
            notificationService.sendNotification(data.title, {
              body: data.body,
              icon: '/favicon.ico',
              data: data.data
            });
            // Mark as delivered
            await updateDoc(docSnap.ref, { status: 'delivered' });
          });
        });

        return () => {
          unsubUser();
          unsubNotifications();
          socket.disconnect();
        };
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle group invites
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/join/') && user) {
      const inviteLink = path.split('/join/')[1];
      if (inviteLink) {
        handleJoinGroup(inviteLink);
      }
    }
  }, [user]);

  const handleJoinGroup = async (inviteLink: string) => {
    try {
      const q = query(collection(db, "groups"), where("inviteLink", "==", inviteLink));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const groupDoc = snap.docs[0];
        const groupData = groupDoc.data() as Group;
        const groupId = groupDoc.id;

        if (groupData.members.includes(user!.uid)) {
          toast.info("You are already a member of this collective.");
          window.history.replaceState({}, '', '/');
          return;
        }

        if (groupData.settings?.approveNewMembers) {
          if (groupData.pendingMembers?.includes(user!.uid)) {
            toast.info("Your request to join is pending approval.");
          } else {
            await updateDoc(doc(db, "groups", groupId), {
              pendingMembers: [...(groupData.pendingMembers || []), user!.uid]
            });
            toast.success("Request sent to collective admins.");
          }
        } else {
          await updateDoc(doc(db, "groups", groupId), {
            members: [...groupData.members, user!.uid]
          });
          toast.success("Joined collective successfully!");
          // Select the group after joining
          setSelectedGroup({ id: groupId, ...groupData } as Group);
          setSelectedUser(null);
        }
        window.history.replaceState({}, '', '/');
      } else {
        toast.error("Invalid invite link.");
        window.history.replaceState({}, '', '/');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "groups");
    }
  };

  // Apply theme
  useEffect(() => {
    if (userData?.settings?.theme) {
      document.documentElement.classList.remove('light', 'dark');
      if (userData.settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.add('light');
      }
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [userData?.settings?.theme]);

  // Listen to selected user or group data
  useEffect(() => {
    if (!user) return;
    
    let unsubscribe: (() => void) | undefined;

    if (selectedUser) {
      const userRef = doc(db, "users", selectedUser.uid);
      unsubscribe = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          setSelectedUser(doc.data() as AppUser);
        }
      });
    } else if (selectedGroup) {
      const groupRef = doc(db, "groups", selectedGroup.id);
      unsubscribe = onSnapshot(groupRef, (doc) => {
        if (doc.exists()) {
          setSelectedGroup({ id: doc.id, ...doc.data() } as Group);
        }
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, selectedUser?.uid, selectedGroup?.id]);

  // Socket listeners for calls
  useEffect(() => {
    if (!user) return;

    const handleIncomingCall = (data: any) => {
      setCallState({
        isActive: true,
        isIncoming: true,
        isAudioOnly: data.isAudioOnly || false,
        isScreenShare: data.isScreenShare || false,
        quality: data.quality,
        user: { 
          uid: data.from, 
          displayName: data.name, 
          photoURL: data.photoURL || "", 
          status: "online", 
          lastSeen: null 
        } as AppUser,
        signal: data.offer,
      });
    };

    const handleCallAccepted = (data: any) => {
      setCallState(prev => ({ ...prev, isIncoming: false, signal: data.answer }));
    };

    const handleCallRejected = () => {
      setCallState({ isActive: false, isIncoming: false, isAudioOnly: false, isScreenShare: false, user: null });
    };

    const handleCallEnded = () => {
      setCallState({ isActive: false, isIncoming: false, isAudioOnly: false, isScreenShare: false, user: null });
    };

    socket.on("incoming_call", handleIncomingCall);
    socket.on("call_accepted", handleCallAccepted);
    socket.on("call_rejected", handleCallRejected);
    socket.on("call_ended", handleCallEnded);

    return () => {
      socket.off("incoming_call", handleIncomingCall);
      socket.off("call_accepted", handleCallAccepted);
      socket.off("call_rejected", handleCallRejected);
      socket.off("call_ended", handleCallEnded);
    };
  }, [user]);

  const handleStartCall = (type: 'audio' | 'video' | 'screen_share' = 'video', quality?: any) => {
    if (selectedUser) {
      setCallState({
        isActive: true,
        isIncoming: false,
        isAudioOnly: type === 'audio',
        isScreenShare: type === 'screen_share',
        quality: quality,
        user: selectedUser,
      });
    }
  };

  const handleAcceptCall = () => {
    setCallState(prev => ({ ...prev, isIncoming: false }));
  };

  const handleRejectCall = () => {
    if (callState.user) {
      socket.emit("reject_call", { to: callState.user.uid });
    }
    setCallState({ isActive: false, isIncoming: false, isAudioOnly: false, isScreenShare: false, user: null });
  };

  const handleSelectUser = (u: AppUser) => {
    setSelectedUser(u);
    setSelectedGroup(null);
    setSelectedFeed(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSelectGroup = (g: Group) => {
    setSelectedGroup(g);
    setSelectedUser(null);
    setSelectedFeed(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSelectFeed = (f: any) => {
    setSelectedFeed(f);
    setSelectedUser(null);
    setSelectedGroup(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleEndCall = () => {
    if (callState.user) {
      socket.emit("end_call", { to: callState.user.uid });
    }
    setCallState({ isActive: false, isIncoming: false, isAudioOnly: false, user: null });
  };

  const handleLogout = async () => {
    if (user) {
      if (userData?.username) {
        try {
          await updateDoc(doc(db, "users", user.uid), {
            status: "offline",
            lastSeen: serverTimestamp()
          });
        } catch (error) {
          console.error("Error setting status to offline on logout:", error);
        }
      }
      await auth.signOut();
    }
  };

  useEffect(() => {
    if (!user || !userData?.username) return;

    const userRef = doc(db, "users", user.uid);
    const showOnline = userData?.settings?.showOnlineStatus !== false;
    
    const updateStatus = (status: string) => {
      updateDoc(userRef, {
        status: status,
        lastSeen: serverTimestamp()
      }).catch(err => {
        // Only log if it's not a permission error during initial setup
        if (err.code !== 'permission-denied') {
          console.error("Error updating status:", err);
        }
      });
    };

    // Set initial status
    const initialStatus = callState.isActive ? 'transmitting' : (showOnline ? (document.visibilityState === 'visible' ? 'active' : 'away') : 'offline');
    updateStatus(initialStatus);

    // Update lastSeen periodically
    const interval = setInterval(() => {
      const status = callState.isActive ? 'transmitting' : (showOnline ? (document.visibilityState === 'visible' ? 'active' : 'away') : 'offline');
      updateStatus(status);
    }, 60000); // Every minute

    const handleVisibilityChange = () => {
      const status = callState.isActive ? 'transmitting' : (showOnline ? (document.visibilityState === 'visible' ? 'active' : 'away') : 'offline');
      updateStatus(status);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (user) {
        updateStatus('offline');
      }
    };
  }, [user, userData?.settings?.showOnlineStatus, userData?.username, callState.isActive]);

  const handleSetUsername = async () => {
    if (!user || !usernameInput.trim()) return;
    setIsCheckingUsername(true);
    try {
      const q = query(collection(db, "users"), where("username", "==", usernameInput.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        toast.error("Username already taken. Choose another.");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName || usernameInput,
        username: usernameInput.trim().toLowerCase(),
        email: user.email,
        photoURL: user.photoURL,
        status: 'active',
        lastSeen: serverTimestamp(),
        friends: [],
        friendRequests: [],
        settings: {
          showLastSeen: true,
          showOnlineStatus: true,
          showProfilePhoto: 'everyone',
          theme: 'dark'
        }
      }, { merge: true });
      
      setShowUsernameModal(false);
      toast.success("Username set successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const handleDeleteAccount = async () => {
    setShowConfirm({
      isOpen: true,
      title: "Delete Account",
      message: "Are you sure you want to delete your account? This action is irreversible.",
      type: 'danger',
      onConfirm: async () => {
        if (user) {
          await deleteDoc(doc(db, "users", user.uid));
          await user.delete();
          toast.success("Account deleted successfully");
        }
      }
    });
  };

  const handleToggleSetting = async (setting: 'showLastSeen' | 'showOnlineStatus') => {
    if (user && userData) {
      const newSettings = {
        ...userData.settings,
        [setting]: !userData.settings?.[setting]
      };
      await updateDoc(doc(db, "users", user.uid), {
        settings: newSettings
      });
    }
  };

  const handleBlockUser = async (targetUid: string) => {
    if (user) {
      await updateDoc(doc(db, "users", user.uid), {
        blockedUsers: arrayUnion(targetUid)
      });
    }
  };

  const handleUnblockUser = async (targetUid: string) => {
    if (user) {
      await updateDoc(doc(db, "users", user.uid), {
        blockedUsers: arrayRemove(targetUid)
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-950">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-16 h-16 rounded-full border-4 border-white border-t-transparent"
        />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <ErrorBoundary>
      <div className={`flex h-screen bg-bg text-ink overflow-hidden font-sans selection:bg-accent selection:text-white relative ${userData?.settings?.theme || 'dark'}`}>
        {/* Username Onboarding Modal */}
        <AnimatePresence>
          {showUsernameModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 shadow-2xl"
              >
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-accent/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-accent/20">
                    <Shield className="w-10 h-10 text-accent" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight mb-2">Secure Identity</h2>
                  <p className="text-neutral-500 font-light">Choose a unique username to be discovered by others. This cannot be changed later.</p>
                </div>

                <div className="space-y-6">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-accent transition-colors">
                      <span className="text-lg font-medium">@</span>
                    </div>
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
                      placeholder="username"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl py-4 pl-12 pr-6 text-lg focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all placeholder:text-neutral-700"
                      autoFocus
                    />
                  </div>

                  <button
                    onClick={handleSetUsername}
                    disabled={isCheckingUsername || usernameInput.length < 3}
                    className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isCheckingUsername ? (
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Complete Setup
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <Sidebar 
          onSelectUser={handleSelectUser} 
          onSelectGroup={handleSelectGroup}
          onSelectFeed={handleSelectFeed}
          selectedUserId={selectedUser?.uid}
          selectedGroupId={selectedGroup?.id}
          selectedFeedId={selectedFeed?.id}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStatus={(uid?: string) => {
            setSelectedStatusUserId(uid || null);
            setShowStatusFeed(true);
          }}
        />

        {/* Main Content Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {selectedFeed ? (
              <motion.div
                key={selectedFeed.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <LiveFeedViewer feed={selectedFeed} onToggleSidebar={() => setIsSidebarOpen(true)} />
              </motion.div>
            ) : selectedUser || selectedGroup ? (
              <motion.div
                key={selectedUser?.uid || selectedGroup?.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <Chat 
                  selectedUser={selectedUser} 
                  selectedGroup={selectedGroup}
                  onStartCall={handleStartCall} 
                  onToggleSidebar={() => setIsSidebarOpen(true)}
                  onViewProfile={(u) => {
                    setSelectedProfileUser(u);
                    setShowProfileModal(true);
                  }}
                  isBlocked={userData?.blockedUsers?.includes(selectedUser?.uid || "")}
                  onBlock={() => selectedUser && handleBlockUser(selectedUser.uid)}
                  onUnblock={() => selectedUser && handleUnblockUser(selectedUser.uid)}
                />
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-12 bg-bg/90 backdrop-blur-3xl">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="md:hidden absolute top-6 left-6 p-3 text-muted hover:text-ink glass-panel rounded-2xl"
                >
                  <MoreVertical className="w-6 h-6 rotate-90" />
                </button>
                
                <div className="w-24 h-24 rounded-full glass-panel flex items-center justify-center mb-8">
                  <MessageSquare className="w-10 h-10 text-muted/40" />
                </div>
                <h2 className="text-3xl font-bold tracking-tighter mb-4 uppercase">Select a Connection</h2>
                <p className="text-muted max-w-sm font-light leading-relaxed">
                  Choose a user from the sidebar to start a secure conversation or high-fidelity video call.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Call Notifications */}
        <AnimatePresence>
          {callState.isActive && callState.isIncoming && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 20, scale: 1 }}
              exit={{ opacity: 0, y: -50, scale: 0.9 }}
              className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-6"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={callState.user?.photoURL || ""}
                    alt="Caller"
                    className="w-14 h-14 rounded-full border-2 border-orange-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-accent p-1.5 rounded-full border-2 border-neutral-900">
                    {callState.isScreenShare ? <Monitor className="w-3 h-3 text-white" /> : (callState.isAudioOnly ? <Phone className="w-3 h-3 text-white" /> : <Video className="w-3 h-3 text-white" />)}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{callState.user?.displayName}</h3>
                  <p className="text-neutral-500 uppercase tracking-widest text-[10px] font-mono animate-pulse">Incoming {callState.isScreenShare ? "Screen Share" : (callState.isAudioOnly ? "Audio" : "Video")} Call...</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRejectCall}
                  className="p-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-all"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <button
                  onClick={handleAcceptCall}
                  className="p-4 bg-green-500 text-white hover:bg-green-600 rounded-full transition-all shadow-lg shadow-green-900/20"
                >
                  <Phone className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Call Overlay */}
        <AnimatePresence>
          {callState.isActive && !callState.isIncoming && callState.user && (
            <VideoCall
              receiver={callState.user}
              onEndCall={handleEndCall}
              isIncoming={!!callState.signal}
              incomingSignal={callState.signal}
              isAudioOnly={callState.isAudioOnly}
              isScreenShare={callState.isScreenShare}
              quality={callState.quality}
            />
          )}
        </AnimatePresence>

        {/* Modals */}
        <SettingsModal 
          isOpen={showSettings} 
          onClose={() => setShowSettings(false)} 
        />
        
        <StatusFeed 
          isOpen={showStatusFeed} 
          onClose={() => {
            setShowStatusFeed(false);
            setSelectedStatusUserId(null);
          }}
          initialUserId={selectedStatusUserId}
        />

        {selectedProfileUser && (
          <UserProfileModal
            user={selectedProfileUser}
            currentUser={userData}
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            onStartCall={handleStartCall}
          />
        )}
        <ConfirmationModal
          isOpen={showConfirm.isOpen}
          onClose={() => setShowConfirm(prev => ({ ...prev, isOpen: false }))}
          onConfirm={showConfirm.onConfirm}
          title={showConfirm.title}
          message={showConfirm.message}
          type={showConfirm.type}
        />
        <Toaster position="top-center" richColors />
      </div>
    </ErrorBoundary>
  );
}
