import React, { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import { X, Camera, User as UserIcon, MapPin, FileText, Shield, Check, Clock, ShieldOff } from "lucide-react";
import { AppUser } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState({
    displayName: "",
    photoURL: "",
    bio: "",
    address: "",
    dob: "",
    otherInfo: "",
    showOnlineStatus: { type: 'all' as 'all' | 'nobody' | 'custom', allowedUsers: [] as string[] },
    showLastSeen: { type: 'all' as 'all' | 'nobody' | 'custom', allowedUsers: [] as string[] },
    showProfilePhoto: 'everyone' as 'everyone' | 'contacts' | 'nobody',
    theme: 'light' as 'dark' | 'light',
    blockedUsers: [] as string[],
  });
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [showCustomOnline, setShowCustomOnline] = useState(false);
  const [showCustomLastSeen, setShowCustomLastSeen] = useState(false);
  const [blockedUserDetails, setBlockedUserDetails] = useState<AppUser[]>([]);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (isOpen && currentUser) {
      const fetchProfile = async () => {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfile({
              displayName: data.displayName || currentUser.displayName || "",
              photoURL: data.photoURL || currentUser.photoURL || "",
              bio: data.bio || "",
              address: data.address || "",
              dob: data.dob || "",
              otherInfo: data.otherInfo || "",
              showOnlineStatus: data.settings?.privacy?.onlineStatus || { type: 'all', allowedUsers: [] },
              showLastSeen: data.settings?.privacy?.lastSeen || { type: 'all', allowedUsers: [] },
              showProfilePhoto: data.settings?.showProfilePhoto || 'everyone',
              theme: data.settings?.theme || 'dark',
              blockedUsers: data.blockedUsers || [],
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, "users");
        }
      };
      fetchProfile();

      // Fetch all users for custom privacy selection
      const fetchAllUsers = async () => {
        try {
          const snap = await getDocs(collection(db, "users"));
          const users = snap.docs.map(d => d.data() as AppUser).filter(u => u.uid !== currentUser.uid);
          setAllUsers(users);
        } catch (error) {
          console.error("Error fetching users:", error);
        }
      };
      fetchAllUsers();
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (profile.blockedUsers.length > 0) {
      const fetchBlockedUsers = async () => {
        try {
          const details: AppUser[] = [];
          for (const uid of profile.blockedUsers) {
            const uDoc = await getDoc(doc(db, "users", uid));
            if (uDoc.exists()) details.push(uDoc.data() as AppUser);
          }
          setBlockedUserDetails(details);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, "users");
        }
      };
      fetchBlockedUsers();
    } else {
      setBlockedUserDetails([]);
    }
  }, [profile.blockedUsers]);

  const handleUnblock = async (uid: string) => {
    if (!currentUser) return;
    try {
      const newBlocked = profile.blockedUsers.filter(id => id !== uid);
      await updateDoc(doc(db, "users", currentUser.uid), {
        blockedUsers: newBlocked
      });
      setProfile(prev => ({ ...prev, blockedUsers: newBlocked }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setLoading(true);
    try {
      const docRef = doc(db, "users", currentUser.uid);
      const { showOnlineStatus, showLastSeen, showProfilePhoto, theme, ...rest } = profile;
      await updateDoc(docRef, {
        ...rest,
        settings: {
          privacy: {
            onlineStatus: showOnlineStatus,
            lastSeen: showLastSeen,
          },
          showProfilePhoto,
          theme,
        },
        updatedAt: new Date(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      setProfile(prev => ({ ...prev, photoURL: base64 }));
    } catch (error) {
      console.error("Photo upload error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-2xl glass-panel rounded-[48px] overflow-hidden shadow-2xl"
        >
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="micro-label">Configuration</span>
              <h2 className="text-2xl font-serif italic">Identity Profile</h2>
            </div>
            <button onClick={onClose} className="p-2 text-muted hover:text-ink transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleUpdate} className="p-8 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-6">
              <div className="relative group">
                <img
                  src={profile.photoURL || "https://picsum.photos/seed/user/200"}
                  alt="Avatar"
                  className="w-32 h-32 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 border-2 border-white/10"
                  referrerPolicy="no-referrer"
                />
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
                  <Camera className="w-6 h-6 text-white" />
                  <input 
                    type="file" 
                    accept="image/*"
                    className="hidden" 
                    onChange={handlePhotoUpload}
                  />
                </label>
              </div>
              <div className="w-full max-w-xs">
                <input
                  type="text"
                  placeholder="Avatar URL"
                  value={profile.photoURL}
                  onChange={(e) => setProfile({ ...profile, photoURL: e.target.value })}
                  className="luxury-input text-center text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted">
                  <UserIcon className="w-4 h-4" />
                  <span className="micro-label">Display Name</span>
                </div>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  className="luxury-input"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted">
                  <Clock className="w-4 h-4" />
                  <span className="micro-label">Date of Birth</span>
                </div>
                <input
                  type="date"
                  value={profile.dob}
                  onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                  className="luxury-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted">
                  <MapPin className="w-4 h-4" />
                  <span className="micro-label">Address</span>
                </div>
                <input
                  type="text"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="luxury-input"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted">
                  <Shield className="w-4 h-4" />
                  <span className="micro-label">Other Information</span>
                </div>
                <input
                  type="text"
                  value={profile.otherInfo}
                  onChange={(e) => setProfile({ ...profile, otherInfo: e.target.value })}
                  className="luxury-input"
                  placeholder="Additional details..."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-muted">
                <FileText className="w-4 h-4" />
                <span className="micro-label">Bio / Manifesto</span>
              </div>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="luxury-input h-24 resize-none"
                placeholder="Tell the world who you are..."
              />
            </div>

            <div className="space-y-6">
              <div className="flex flex-col">
                <span className="micro-label mb-4">Aesthetic Protocol</span>
                <div className="grid grid-cols-2 gap-4">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProfile({ ...profile, theme: t })}
                      className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${
                        profile.theme === t 
                          ? "border-accent bg-accent/10" 
                          : "border-border bg-panel hover:border-accent/50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${
                        t === 'light' ? 'bg-[#f5f1ea]' : 'bg-[#1a1614]'
                      } border border-border`} />
                      <span className="text-[10px] uppercase tracking-widest">{t}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Shield className="w-5 h-5 text-accent" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Online Status Visibility</span>
                        <span className="text-[10px] text-muted uppercase tracking-wider">Privacy Protocol</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {(['all', 'nobody', 'custom'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setProfile({ ...profile, showOnlineStatus: { ...profile.showOnlineStatus, type } })}
                          className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest transition-all ${profile.showOnlineStatus.type === type ? "bg-accent text-bg" : "bg-white/5 text-muted"}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  {profile.showOnlineStatus.type === 'custom' && (
                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <span className="text-[8px] uppercase tracking-widest text-muted">Allowed Nodes</span>
                      <div className="flex flex-wrap gap-2">
                        {allUsers.map(user => (
                          <button
                            key={user.uid}
                            type="button"
                            onClick={() => {
                              const current = profile.showOnlineStatus.allowedUsers;
                              const next = current.includes(user.uid) ? current.filter(id => id !== user.uid) : [...current, user.uid];
                              setProfile({ ...profile, showOnlineStatus: { ...profile.showOnlineStatus, allowedUsers: next } });
                            }}
                            className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest transition-all ${profile.showOnlineStatus.allowedUsers.includes(user.uid) ? "bg-accent text-bg" : "bg-white/5 text-muted"}`}
                          >
                            {user.displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Clock className="w-5 h-5 text-accent" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Last Seen Visibility</span>
                        <span className="text-[10px] text-muted uppercase tracking-wider">Privacy Protocol</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {(['all', 'nobody', 'custom'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setProfile({ ...profile, showLastSeen: { ...profile.showLastSeen, type } })}
                          className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest transition-all ${profile.showLastSeen.type === type ? "bg-accent text-bg" : "bg-white/5 text-muted"}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  {profile.showLastSeen.type === 'custom' && (
                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <span className="text-[8px] uppercase tracking-widest text-muted">Allowed Nodes</span>
                      <div className="flex flex-wrap gap-2">
                        {allUsers.map(user => (
                          <button
                            key={user.uid}
                            type="button"
                            onClick={() => {
                              const current = profile.showLastSeen.allowedUsers;
                              const next = current.includes(user.uid) ? current.filter(id => id !== user.uid) : [...current, user.uid];
                              setProfile({ ...profile, showLastSeen: { ...profile.showLastSeen, allowedUsers: next } });
                            }}
                            className={`px-3 py-1 rounded-full text-[8px] uppercase tracking-widest transition-all ${profile.showLastSeen.allowedUsers.includes(user.uid) ? "bg-accent text-bg" : "bg-white/5 text-muted"}`}
                          >
                            {user.displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4">
                <div className="flex items-center gap-4">
                  <Camera className="w-5 h-5 text-accent" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Profile Photo Visibility</span>
                    <span className="text-[10px] text-muted uppercase tracking-wider">Who can see your image</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['everyone', 'contacts', 'nobody'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setProfile({ ...profile, showProfilePhoto: v })}
                      className={`py-2 rounded-xl border text-[10px] uppercase tracking-widest transition-all ${
                        profile.showProfilePhoto === v 
                          ? "border-accent bg-accent/10 text-accent" 
                          : "border-white/5 bg-white/5 text-muted hover:text-ink"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Blocked Users Section */}
            {blockedUserDetails.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-muted">
                  <ShieldOff className="w-4 h-4 text-red-500" />
                  <span className="micro-label">Severed Connections</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {blockedUserDetails.map(u => (
                    <div key={u.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full grayscale" />
                        <span className="text-xs font-medium">{u.displayName}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleUnblock(u.uid)}
                        className="text-[10px] uppercase tracking-widest text-accent hover:text-white transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex items-center justify-end gap-4">
              {success && (
                <motion.span
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-accent micro-label flex items-center gap-2"
                >
                  <Check className="w-3 h-3" /> Profile Synchronized
                </motion.span>
              )}
              <button
                type="submit"
                disabled={loading}
                className="luxury-button bg-ink text-bg hover:bg-accent disabled:opacity-50"
              >
                {loading ? "Processing..." : "Save Changes"}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SettingsModal;
