import React, { useState, useEffect } from "react";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, Check, Users } from "lucide-react";
import { AppUser } from "../types";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose }) => {
  const [groupName, setGroupName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser || !isOpen) return;

    const q = query(collection(db, "users"), where("uid", "!=", currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList: AppUser[] = [];
      snapshot.forEach((doc) => {
        usersList.push(doc.data() as AppUser);
      });
      setUsers(usersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });

    return () => unsubscribe();
  }, [currentUser, isOpen]);

  const toggleUser = (uid: string) => {
    setSelectedUsers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0 || !currentUser) return;

    setIsCreating(true);
    try {
      const groupData = {
        name: groupName.trim(),
        photoURL: `https://picsum.photos/seed/${groupName}/200/200`,
        createdBy: currentUser.uid,
        members: [...selectedUsers, currentUser.uid],
        admins: [currentUser.uid],
        pendingMembers: [],
        inviteLink: Math.random().toString(36).substring(2, 10),
        createdAt: serverTimestamp(),
        lastMessage: "Collective established",
        lastMessageTime: serverTimestamp(),
        settings: {
          editGroupInfo: 'all',
          sendMessages: 'all',
          editGroupSettings: 'all',
          approveNewMembers: false,
          disappearingMessages: 0
        }
      };

      await addDoc(collection(db, "groups"), groupData);
      onClose();
      setGroupName("");
      setSelectedUsers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "groups");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-8 bg-bg/90 backdrop-blur-xl">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-xl glass-panel rounded-[40px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-10 border-b border-white/5 flex items-center justify-between">
            <div className="flex flex-col">
              <h2 className="text-2xl font-serif italic tracking-tight flex items-center gap-4">
                <Users className="w-6 h-6 text-accent" /> Establish Collective
              </h2>
              <span className="micro-label mt-1">Define a new circle of influence</span>
            </div>
            <button onClick={onClose} className="p-3 text-muted hover:text-ink transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar flex-1">
            <div className="space-y-4">
              <label className="micro-label">Collective Designation</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter collective name..."
                className="luxury-input text-lg"
              />
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <label className="micro-label">Select Members ({selectedUsers.length})</label>
              </div>
              
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Search connections..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="luxury-input pl-14 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                {users
                  .filter(u => u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(user => (
                    <button
                      key={user.uid}
                      onClick={() => toggleUser(user.uid)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 ${
                        selectedUsers.includes(user.uid) ? "bg-accent/10 border-accent/20" : "hover:bg-white/5 border-transparent"
                      } border`}
                    >
                      <img 
                        src={user.photoURL} 
                        alt="" 
                        className="w-12 h-12 rounded-full grayscale border border-border"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">{user.displayName}</p>
                        <p className="text-[10px] text-muted uppercase tracking-widest font-mono">{user.email}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                        selectedUsers.includes(user.uid) ? "bg-accent border-accent" : "border-border"
                      }`}>
                        {selectedUsers.includes(user.uid) && <Check className="w-3 h-3 text-bg" />}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <div className="p-10 border-t border-white/5 bg-white/2">
            <button
              onClick={handleCreateGroup}
              disabled={isCreating || !groupName.trim() || selectedUsers.length === 0}
              className="w-full py-5 bg-ink text-bg font-serif italic text-xl rounded-full hover:bg-accent transition-all disabled:opacity-20 disabled:grayscale shadow-xl"
            >
              {isCreating ? "Establishing..." : "Establish Collective"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CreateGroupModal;
