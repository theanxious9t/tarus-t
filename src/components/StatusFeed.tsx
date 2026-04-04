import React, { useState, useEffect, useRef } from "react";
import { auth, db, handleFirestoreError, OperationType, getChatId } from "../lib/firebase";
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc, Timestamp, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Camera, Video, Type, Mic, Clock, Trash2, ChevronLeft, ChevronRight, Play, Pause, Volume2, ThumbsUp, ThumbsDown, MessageCircle, Send, Edit2 } from "lucide-react";
import MediaEditor from "./MediaEditor";
import { AudioRecorder, useAudioRecorder } from "react-audio-voice-recorder";
import { AppUser, Status } from "../types";

interface StatusFeedProps {
  isOpen: boolean;
  onClose: () => void;
  initialUserId?: string | null;
}

const StatusFeed: React.FC<StatusFeedProps> = ({ isOpen, onClose, initialUserId }) => {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<'image' | 'video' | 'text' | 'voice'>('image');
  const [textContent, setTextContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [expiryHours, setExpiryHours] = useState(24);
  const [visibility, setVisibility] = useState<'all_contacts' | 'custom'>('all_contacts');
  const [visibleTo, setVisibleTo] = useState<string[]>([]);
  const [activeStatusIndex, setActiveStatusIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showLikesModal, setShowLikesModal] = useState<{ type: 'likes' | 'dislikes' | 'views', uids: string[] } | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [editType, setEditType] = useState<'image' | 'video' | 'text' | 'voice'>('image');
  const [editContent, setEditContent] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showReplies, setShowReplies] = useState(false);
  const recorderControls = useAudioRecorder();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (isOpen && initialUserId && statuses.length > 0) {
      const index = statuses.findIndex(s => s.uid === initialUserId);
      if (index !== -1) {
        setActiveStatusIndex(index);
        setProgress(0);
      }
    }
  }, [isOpen, initialUserId, statuses]);

  useEffect(() => {
    if (!currentUser) return;

    // Clean up expired statuses
    const cleanup = async () => {
      try {
        const now = Timestamp.now();
        // Query for ANY expired status (rules now allow deletion of expired ones)
        const q = query(
          collection(db, "statuses"), 
          where("expiresAt", "<=", now)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (d) => {
          await deleteDoc(doc(db, "statuses", d.id));
        });
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    };
    cleanup();

    const q = query(collection(db, "statuses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: Status[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Status);
      });
      setStatuses(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "statuses");
    });

    return () => unsub();
  }, [currentUser]);

  const filteredStatuses = React.useMemo(() => {
    if (!currentUser) return [];
    const now = Timestamp.now();
    return statuses.filter(data => {
      // Filter out expired statuses
      if (data.expiresAt && data.expiresAt.toDate() <= now.toDate()) return false;
      
      if (data.uid === currentUser.uid) return true;
      // If the creator (data.uid) has the current user (currentUser.uid) in their friends list
      const isFriendOfCreator = allUsers.find(u => u.uid === data.uid)?.friends?.includes(currentUser.uid);
      if (data.visibility === 'all_contacts' && isFriendOfCreator) return true;
      if (data.visibility === 'custom' && data.visibleTo?.includes(currentUser.uid)) return true;
      return false;
    });
  }, [statuses, currentUser, allUsers]);

  useEffect(() => {
    if (isOpen && initialUserId && filteredStatuses.length > 0) {
      const index = filteredStatuses.findIndex(s => s.uid === initialUserId);
      if (index !== -1) {
        setActiveStatusIndex(index);
        setProgress(0);
      }
    }
  }, [isOpen, initialUserId, filteredStatuses]);

  useEffect(() => {
    if (activeStatusIndex !== null && activeStatusIndex >= filteredStatuses.length) {
      setActiveStatusIndex(null);
    }
  }, [activeStatusIndex, filteredStatuses.length]);

  useEffect(() => {
    if (activeStatusIndex !== null && activeStatusIndex < filteredStatuses.length) {
      const currentStatus = filteredStatuses[activeStatusIndex];
      if (currentStatus && currentUser && currentStatus.uid !== currentUser.uid) {
        handleView(currentStatus.id);
      }

      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            if (activeStatusIndex < filteredStatuses.length - 1) {
              setActiveStatusIndex(activeStatusIndex + 1);
              return 0;
            } else {
              setActiveStatusIndex(null);
              return 0;
            }
          }
          return prev + 1;
        });
      }, 50); // 5 seconds total per status (100 * 50ms)
      return () => clearInterval(interval);
    }
  }, [activeStatusIndex, filteredStatuses.length]);

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: AppUser[] = [];
      snapshot.forEach(d => list.push(d.data() as AppUser));
      setAllUsers(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });
    return () => unsub();
  }, []);

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

  const handleLike = async (statusId: string) => {
    if (!currentUser) return;
    const statusRef = doc(db, "statuses", statusId);
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;

    const currentLikes = status.likes || [];
    const isLiked = currentLikes.includes(currentUser.uid);
    const newLikes = isLiked
      ? currentLikes.filter(id => id !== currentUser.uid)
      : [...currentLikes, currentUser.uid];
    
    try {
      await updateDoc(statusRef, { 
        likes: newLikes,
        dislikes: (status.dislikes || []).filter(id => id !== currentUser.uid)
      });
      console.log("Like updated successfully");
    } catch (error) {
      console.error("Error updating like:", error);
      handleFirestoreError(error, OperationType.UPDATE, `statuses/${statusId}`);
    }
  };

  const handleDislike = async (statusId: string) => {
    if (!currentUser) return;
    const statusRef = doc(db, "statuses", statusId);
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;

    const currentDislikes = status.dislikes || [];
    const isDisliked = currentDislikes.includes(currentUser.uid);
    const newDislikes = isDisliked
      ? currentDislikes.filter(id => id !== currentUser.uid)
      : [...currentDislikes, currentUser.uid];
    
    try {
      await updateDoc(statusRef, { 
        dislikes: newDislikes,
        likes: (status.likes || []).filter(id => id !== currentUser.uid)
      });
      console.log("Dislike updated successfully");
    } catch (error) {
      console.error("Error updating dislike:", error);
      handleFirestoreError(error, OperationType.UPDATE, `statuses/${statusId}`);
    }
  };

  const handleView = async (statusId: string) => {
    if (!currentUser) return;
    const statusRef = doc(db, "statuses", statusId);
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;

    const currentViews = status.views || [];
    if (currentViews.includes(currentUser.uid)) return;

    try {
      await updateDoc(statusRef, {
        views: [...currentViews, currentUser.uid]
      });
    } catch (error) {
      console.error("Error updating views:", error);
      // Don't show error to user for view tracking as it's background
    }
  };

  const handleReply = async (statusId: string) => {
    if (!currentUser || !replyText.trim()) return;
    const statusRef = doc(db, "statuses", statusId);
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;

    const newReply = {
      uid: currentUser.uid,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
      text: replyText,
      timestamp: Timestamp.now()
    };

    try {
      await updateDoc(statusRef, {
        replies: [...(status.replies || []), newReply]
      });
      setReplyText("");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `statuses/${statusId}`);
    }
  };

  const handleEditStatus = async () => {
    if (!currentUser || !editingStatus) return;
    setIsUploading(true);
    try {
      let content = editingStatus.content;
      let caption = editingStatus.caption || "";

      if (editType === 'text') {
        content = editContent;
      } else {
        caption = editContent;
        if (editFile) {
          const reader = new FileReader();
          content = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(editFile);
          });
        }
      }

      await updateDoc(doc(db, "statuses", editingStatus.id), {
        content,
        type: editType,
        caption
      });
      setEditingStatus(null);
      setEditFile(null);
      setEditContent("");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "statuses");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setEditingFile(file);
        setUploadType('image');
      } else if (file.type.startsWith('video/')) {
        setSelectedFile(file);
        setUploadType('video');
      }
    }
  };

  const handleVoiceStatus = async (blob: Blob) => {
    if (!currentUser) return;
    setIsUploading(true);
    try {
      const reader = new FileReader();
      const content = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiryHours);

      const statusData: any = {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        type: 'voice',
        content,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expiresAt),
        duration: expiryHours,
        visibility: 'all_contacts',
        visibleTo: [],
        likes: [],
        dislikes: [],
        replies: []
      };
      if (currentUser.photoURL) statusData.photoURL = currentUser.photoURL;

      await addDoc(collection(db, "statuses"), statusData);
      setShowVoiceRecorder(false);
      setShowUploadModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "statuses");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = async (fileOverride?: File, captionOverride?: string) => {
    if (!currentUser) return;
    setIsUploading(true);

    try {
      let content = textContent;
      const fileToUpload = fileOverride || selectedFile;
      if (fileToUpload) {
        const reader = new FileReader();
        content = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(fileToUpload);
        });
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiryHours);

      const statusData: any = {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        type: uploadType,
        content,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expiresAt),
        duration: expiryHours,
        visibility,
        visibleTo: visibility === 'custom' ? visibleTo : [],
        likes: [],
        dislikes: [],
        replies: []
      };
      if (currentUser.photoURL) statusData.photoURL = currentUser.photoURL;
      if (captionOverride || uploadType === 'image' || uploadType === 'video') {
        statusData.caption = captionOverride || "";
      }

      await addDoc(collection(db, "statuses"), statusData);

      setShowUploadModal(false);
      setSelectedFile(null);
      setTextContent("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "statuses");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
      >
        <div className="w-full max-w-4xl h-[80vh] flex flex-col glass-panel rounded-[48px] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="micro-label">Ephemeral Feed</span>
              <h2 className="text-2xl font-serif italic">Moments</h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowUploadModal(true)}
                className="luxury-button bg-accent text-bg hover:bg-ink flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Share Moment
              </button>
              <button onClick={onClose} className="p-2 text-muted hover:text-ink transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredStatuses.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center text-muted py-20">
                  <Clock className="w-12 h-12 mb-4 opacity-20" />
                  <span className="micro-label">No active moments in your orbit</span>
                </div>
              ) : (
                filteredStatuses.map((status, index) => (
                  <motion.div
                    key={status.id}
                    layoutId={status.id}
                    whileHover={{ y: -10 }}
                    onClick={() => { setActiveStatusIndex(index); setProgress(0); }}
                    className="aspect-[3/4] rounded-[40px] overflow-hidden relative group border border-white/10 cursor-pointer shadow-2xl"
                  >
                    {status.type === 'image' && (
                      <img src={status.content} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                    )}
                    {status.type === 'video' && (
                      <video src={status.content} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                    )}
                    {status.type === 'voice' && (
                      <div className="w-full h-full bg-accent/5 flex flex-col items-center justify-center p-6 gap-4">
                        <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center">
                          <Volume2 className="w-10 h-10 text-accent animate-pulse" />
                        </div>
                        <span className="micro-label">Voice Broadcast</span>
                      </div>
                    )}
                    {status.type === 'text' && (
                      <div className="w-full h-full bg-accent/5 flex items-center justify-center p-12 text-center">
                        <p className="text-lg font-serif italic leading-relaxed">{status.content}</p>
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={status.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-accent/50 p-0.5" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white">{status.displayName}</span>
                          <span className="text-[8px] text-accent uppercase tracking-[0.2em]">Live Node</span>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-6 left-6 right-6">
                      {status.caption && (
                        <p className="text-xs text-white/80 italic mb-4 line-clamp-2">{status.caption}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1 text-white/60">
                            <ThumbsUp size={12} />
                            <span className="text-[10px]">{status.likes?.length || 0}</span>
                          </div>
                          <div className="flex items-center gap-1 text-white/60">
                            <MessageCircle size={12} />
                            <span className="text-[10px]">{status.replies?.length || 0}</span>
                          </div>
                        </div>
                        <span className="text-[8px] text-white/40 uppercase tracking-widest">
                          {status.duration}H Left
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Status Viewer */}
        <AnimatePresence>
          {activeStatusIndex !== null && filteredStatuses[activeStatusIndex] && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
            >
              {/* Immersive Background */}
              <div className="absolute inset-0 bg-black">
                {filteredStatuses[activeStatusIndex].type === 'image' && (
                  <img src={filteredStatuses[activeStatusIndex].content} className="w-full h-full object-cover blur-[100px] opacity-40" alt="" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
              </div>

              <div className="relative w-full max-w-lg h-full flex flex-col">
                {/* Progress Bars */}
                <div className="absolute top-12 left-8 right-8 flex gap-2 z-20">
                  {filteredStatuses.map((_, i) => (
                    <div key={i} className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all duration-500"
                        style={{ 
                          width: i < activeStatusIndex ? '100%' : i === activeStatusIndex ? `${progress}%` : '0%' 
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Header */}
                <div className="absolute top-16 left-8 right-8 flex items-center justify-between z-20">
                  {(() => {
                    const status = filteredStatuses[activeStatusIndex];
                    const user = allUsers.find(u => u.uid === status.uid) || { uid: status.uid, displayName: status.displayName, photoURL: status.photoURL } as AppUser;
                    return (
                      <div className="flex items-center gap-4">
                        <img 
                          src={getPhotoURL(user)} 
                          alt={user.displayName} 
                          className="w-10 h-10 rounded-full border border-white/20" 
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{user.displayName}</span>
                          <span className="text-[10px] text-white/40 uppercase tracking-widest">
                            {new Date(status.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  <button onClick={() => setActiveStatusIndex(null)} className="p-2 text-white/40 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex items-center justify-center p-8">
                  <motion.div
                    key={filteredStatuses[activeStatusIndex].id}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full h-full flex items-center justify-center"
                  >
                    {filteredStatuses[activeStatusIndex].type === 'image' && (
                      <img 
                        src={filteredStatuses[activeStatusIndex].content} 
                        alt="" 
                        className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl" 
                      />
                    )}
                    {filteredStatuses[activeStatusIndex].type === 'video' && (
                      <video 
                        src={filteredStatuses[activeStatusIndex].content} 
                        autoPlay 
                        className="max-w-full max-h-full rounded-3xl shadow-2xl" 
                      />
                    )}
                    {filteredStatuses[activeStatusIndex].type === 'voice' && (
                      <div className="flex flex-col items-center gap-12">
                        <div className="w-48 h-48 rounded-full bg-accent/10 flex items-center justify-center relative">
                          <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-ping" />
                          <Volume2 className="w-20 h-20 text-accent" />
                        </div>
                        <audio src={filteredStatuses[activeStatusIndex].content} autoPlay controls className="w-full max-w-xs opacity-60 hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                    {filteredStatuses[activeStatusIndex].type === 'text' && (
                      <div className="max-w-md text-center">
                        <h3 className="text-4xl font-serif italic text-white leading-tight">
                          {filteredStatuses[activeStatusIndex].content}
                        </h3>
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Footer Interaction */}
                <div className="p-8 pb-12 space-y-8 z-20">
                  {filteredStatuses[activeStatusIndex].caption && (
                    <p className="text-center text-lg font-serif italic text-white/90">{filteredStatuses[activeStatusIndex].caption}</p>
                  )}

                    <div className="flex items-center gap-6 justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleLike(filteredStatuses[activeStatusIndex].id); }}
                          className={`p-4 rounded-full glass-panel transition-all ${filteredStatuses[activeStatusIndex].likes?.includes(currentUser?.uid || "") ? "bg-accent text-bg border-accent" : "text-white/60 hover:text-white"}`}
                        >
                          <ThumbsUp size={24} />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setShowLikesModal({ type: 'likes', uids: filteredStatuses[activeStatusIndex].likes || [] }); 
                          }}
                          className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                        >
                          {filteredStatuses[activeStatusIndex].likes?.length || 0} Likes
                        </button>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDislike(filteredStatuses[activeStatusIndex].id); }}
                          className={`p-4 rounded-full glass-panel transition-all ${filteredStatuses[activeStatusIndex].dislikes?.includes(currentUser?.uid || "") ? "bg-red-500 text-white border-red-500" : "text-white/60 hover:text-white"}`}
                        >
                          <ThumbsDown size={24} />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setShowLikesModal({ type: 'dislikes', uids: filteredStatuses[activeStatusIndex].dislikes || [] }); 
                          }}
                          className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                        >
                          {filteredStatuses[activeStatusIndex].dislikes?.length || 0} Dislikes
                        </button>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setShowLikesModal({ type: 'views', uids: filteredStatuses[activeStatusIndex].views || [] }); 
                          }}
                          className="p-4 rounded-full glass-panel text-white/60 hover:text-white transition-all"
                        >
                          <Clock size={24} />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setShowLikesModal({ type: 'views', uids: filteredStatuses[activeStatusIndex].views || [] }); 
                          }}
                          className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                        >
                          {filteredStatuses[activeStatusIndex].views?.length || 0} Views
                        </button>
                      </div>
                    </div>

                    {/* Reply Input */}
                    <div className="flex items-center gap-4 bg-white/5 p-4 rounded-3xl border border-white/10">
                      <input 
                        type="text" 
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Reply to moment..."
                        className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-white/20"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReply(filteredStatuses[activeStatusIndex].id); }}
                        className="p-2 bg-accent text-bg rounded-full hover:scale-110 transition-transform"
                      >
                        <Send size={16} />
                      </button>
                    </div>

                    {/* Edit Button (if owner) */}
                    {filteredStatuses[activeStatusIndex].uid === currentUser?.uid && (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setEditingStatus(filteredStatuses[activeStatusIndex]);
                          setEditType(filteredStatuses[activeStatusIndex].type);
                          setEditContent(filteredStatuses[activeStatusIndex].type === 'text' ? filteredStatuses[activeStatusIndex].content : filteredStatuses[activeStatusIndex].caption || "");
                        }}
                        className="luxury-button bg-white/10 text-white hover:bg-white/20 flex items-center gap-2 mx-auto"
                      >
                        <Edit2 className="w-4 h-4" /> Edit Moment
                      </button>
                    )}
                </div>

                {/* Navigation Zones */}
                <div className="absolute inset-y-0 left-0 w-1/4 cursor-pointer z-10" onClick={() => activeStatusIndex > 0 && setActiveStatusIndex(activeStatusIndex - 1)} />
                <div className="absolute inset-y-0 right-0 w-1/4 cursor-pointer z-10" onClick={() => activeStatusIndex < filteredStatuses.length - 1 && setActiveStatusIndex(activeStatusIndex + 1)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload Modal */}
        <AnimatePresence>
          {showUploadModal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-xl"
            >
              <div className="w-full max-w-xl glass-panel rounded-[48px] p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-serif italic">Create Moment</h3>
                  <button onClick={() => setShowUploadModal(false)} className="p-2 text-muted hover:text-ink">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex justify-center gap-6">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-6 rounded-3xl border transition-all ${uploadType === 'image' || uploadType === 'video' ? "bg-accent/10 border-accent text-accent" : "bg-white/5 border-white/5 text-muted hover:text-ink"}`}
                  >
                    <Camera className="w-8 h-8" />
                    <span className="block mt-2 micro-label">Visual</span>
                  </button>
                  <button
                    onClick={() => setUploadType('text')}
                    className={`p-6 rounded-3xl border transition-all ${uploadType === 'text' ? "bg-accent/10 border-accent text-accent" : "bg-white/5 border-white/5 text-muted hover:text-ink"}`}
                  >
                    <Type className="w-8 h-8" />
                    <span className="block mt-2 micro-label">Script</span>
                  </button>
                  <button
                    onClick={() => setShowVoiceRecorder(true)}
                    className={`p-6 rounded-3xl border transition-all ${uploadType === 'voice' ? "bg-accent/10 border-accent text-accent" : "bg-white/5 border-white/5 text-muted hover:text-ink"}`}
                  >
                    <Mic className="w-8 h-8" />
                    <span className="block mt-2 micro-label">Voice</span>
                  </button>
                </div>

                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,video/*" />

                {showVoiceRecorder && (
                  <div className="p-8 glass-panel rounded-3xl flex flex-col items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="micro-label">Capturing Voice Moment...</span>
                    </div>
                    <AudioRecorder 
                      onRecordingComplete={handleVoiceStatus}
                      recorderControls={recorderControls}
                      showVisualizer={true}
                    />
                    <button onClick={() => setShowVoiceRecorder(false)} className="text-muted hover:text-ink text-xs uppercase tracking-widest">Cancel</button>
                  </div>
                )}

                {uploadType === 'text' && (
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="What's on your mind?"
                    className="luxury-input h-32 resize-none"
                  />
                )}

                {uploadType === 'image' && selectedFile && (
                  <div className="relative rounded-3xl overflow-hidden aspect-video bg-white/5">
                    <img src={URL.createObjectURL(selectedFile)} alt="" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setEditingFile(selectedFile)}
                      className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-md"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="micro-label">Persistence Protocol</span>
                    <span className="text-accent font-bold">{expiryHours} Hours</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="72"
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(parseInt(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="micro-label">Visibility Protocol</span>
                    <div className="flex gap-2">
                      {(['all_contacts', 'custom'] as const).map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVisibility(v)}
                          className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest transition-all ${visibility === v ? "bg-accent text-bg" : "bg-white/5 text-muted"}`}
                        >
                          {v.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {visibility === 'custom' && (
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                      <span className="text-[8px] uppercase tracking-widest text-muted">Select Recipient Nodes</span>
                      <div className="flex flex-wrap gap-2">
                        {allUsers.filter(u => u.uid !== currentUser?.uid && allUsers.find(cu => cu.uid === currentUser?.uid)?.friends?.includes(u.uid)).map(user => (
                          <button
                            key={user.uid}
                            type="button"
                            onClick={() => {
                              setVisibleTo(prev => prev.includes(user.uid) ? prev.filter(id => id !== user.uid) : [...prev, user.uid]);
                            }}
                            className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest transition-all ${visibleTo.includes(user.uid) ? "bg-accent text-bg" : "bg-white/5 text-muted"}`}
                          >
                            {user.displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleUpload()}
                  disabled={isUploading || (uploadType === 'text' && !textContent) || (uploadType === 'image' && !selectedFile)}
                  className="w-full luxury-button bg-ink text-bg hover:bg-accent disabled:opacity-50"
                >
                  {isUploading ? "Transmitting..." : "Broadcast Moment"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editingFile && (
            <MediaEditor
              file={editingFile}
              onSave={(edited, caption) => {
                if (editingStatus) {
                  setEditFile(edited);
                  setEditType('image');
                  setEditContent(caption || "");
                } else {
                  handleUpload(edited, caption);
                }
                setEditingFile(null);
              }}
              onCancel={() => setEditingFile(null)}
            />
          )}
        </AnimatePresence>
        {/* Likes/Dislikes Modal */}
        <AnimatePresence>
          {showLikesModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-xs glass-panel rounded-[32px] p-8 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-serif italic capitalize">{showLikesModal.type}</h3>
                  <button onClick={() => setShowLikesModal(null)} className="p-2 text-muted hover:text-ink">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar">
                  {showLikesModal.uids.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">No reactions yet</p>
                  ) : (
                    showLikesModal.uids.map(uid => {
                      const user = allUsers.find((u: AppUser) => u.uid === uid);
                      return (
                        <div key={uid} className="flex items-center gap-3">
                          <img src={user?.photoURL || "https://picsum.photos/seed/user/200"} alt="" className="w-8 h-8 rounded-full" />
                          <span className="text-sm font-medium">{user?.displayName || "Unknown Explorer"}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Status Modal */}
        <AnimatePresence>
          {editingStatus && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/95 backdrop-blur-xl"
            >
              <div className="w-full max-w-xl glass-panel rounded-[48px] p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-serif italic">Edit Moment</h3>
                  <button onClick={() => setEditingStatus(null)} className="p-2 text-muted hover:text-ink">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {editType === 'text' ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="luxury-input h-32 resize-none"
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="relative rounded-3xl overflow-hidden aspect-video bg-white/5">
                      {editType === 'image' ? (
                        <img src={editFile ? URL.createObjectURL(editFile) : editContent} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <video src={editFile ? URL.createObjectURL(editFile) : editContent} className="w-full h-full object-cover" />
                      )}
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors group"
                      >
                        <Plus className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Add a caption..."
                      className="luxury-input h-20 resize-none"
                    />
                    {editType === 'image' && (
                      <button
                        onClick={() => {
                          if (editFile) {
                            setEditingFile(editFile);
                          } else {
                            // Fetch the image as a file to edit
                            fetch(editContent)
                              .then(res => res.blob())
                              .then(blob => {
                                const file = new File([blob], "status.png", { type: "image/png" });
                                setEditingFile(file);
                              });
                          }
                        }}
                        className="w-full luxury-button bg-white/5 text-ink hover:bg-white/10 text-[10px]"
                      >
                        Open Creative Studio
                      </button>
                    )}
                    <p className="text-[10px] text-muted text-center uppercase tracking-widest">Click to replace media</p>
                  </div>
                )}

                <button
                  onClick={handleEditStatus}
                  disabled={isUploading}
                  className="w-full luxury-button bg-ink text-bg hover:bg-accent"
                >
                  {isUploading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default StatusFeed;
