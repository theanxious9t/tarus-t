import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, MapPin, Calendar, Info, Phone, Video } from 'lucide-react';
import { AppUser } from '../types';

interface UserProfileModalProps {
  user: AppUser | null;
  currentUser: AppUser | null;
  isOpen: boolean;
  onClose: () => void;
  onStartCall?: (type: 'audio' | 'video') => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, currentUser, isOpen, onClose, onStartCall }) => {
  if (!user) return null;

  const canSeePhoto = () => {
    const visibility = user.settings?.showProfilePhoto || 'everyone';
    if (visibility === 'everyone') return true;
    if (visibility === 'nobody') return false;
    if (visibility === 'contacts') {
      return user.friends?.includes(currentUser?.uid || "");
    }
    return true;
  };

  const getPhotoURL = () => {
    if (canSeePhoto()) return user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random`;
    return `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-zinc-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-zinc-800"
          >
            <div className="relative h-48 bg-gradient-to-br from-indigo-600 to-purple-700">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
              >
                <X size={20} />
              </button>
              <div className="absolute -bottom-16 left-1/2 -translate-x-1/2">
                <div className="relative">
                  <img
                    src={getPhotoURL()}
                    alt={user.displayName}
                    className="w-32 h-32 rounded-full border-4 border-zinc-900 object-cover shadow-xl"
                    referrerPolicy="no-referrer"
                  />
                  <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-zinc-900 ${
                    user.status === 'online' ? 'bg-green-500' : user.status === 'away' ? 'bg-yellow-500' : 'bg-zinc-500'
                  }`} />
                </div>
              </div>
            </div>

            <div className="pt-20 pb-8 px-8 text-center">
              <h2 className="text-2xl font-bold text-white">{user.displayName}</h2>
              <p className="text-zinc-400 text-sm mt-1">{user.status === 'online' ? 'Active now' : 'Offline'}</p>

              {user.bio && (
                <p className="mt-4 text-zinc-300 text-sm leading-relaxed italic">
                  "{user.bio}"
                </p>
              )}

              <div className="flex justify-center gap-4 mt-6">
                <button
                  onClick={() => onStartCall?.('audio')}
                  className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-white transition-all hover:scale-105"
                >
                  <Phone size={20} />
                </button>
                <button
                  onClick={() => onStartCall?.('video')}
                  className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-white transition-all hover:scale-105"
                >
                  <Video size={20} />
                </button>
              </div>

              <div className="mt-8 space-y-4 text-left">
                <div className="flex items-center gap-4 text-zinc-300">
                  <div className="p-2 bg-zinc-800/50 rounded-lg">
                    <Mail size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Email</p>
                    <p className="text-sm">{user.email}</p>
                  </div>
                </div>

                {user.address && (
                  <div className="flex items-center gap-4 text-zinc-300">
                    <div className="p-2 bg-zinc-800/50 rounded-lg">
                      <MapPin size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Location</p>
                      <p className="text-sm">{user.address}</p>
                    </div>
                  </div>
                )}

                {user.dob && (
                  <div className="flex items-center gap-4 text-zinc-300">
                    <div className="p-2 bg-zinc-800/50 rounded-lg">
                      <Calendar size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Birthday</p>
                      <p className="text-sm">{user.dob}</p>
                    </div>
                  </div>
                )}

                {user.otherInfo && (
                  <div className="flex items-start gap-4 text-zinc-300">
                    <div className="p-2 bg-zinc-800/50 rounded-lg">
                      <Info size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">About</p>
                      <p className="text-sm">{user.otherInfo}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
