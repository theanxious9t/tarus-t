import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Monitor, Volume2, Settings2, Sparkles, Check, Video, Phone } from "lucide-react";

interface CallQualitySettingsProps {
  type: 'audio' | 'video' | 'screen_share';
  onStart: (settings: {
    video: '720p' | '1080p' | '4k';
    audio: 'standard' | 'high';
    systemAudio: boolean;
  }) => void;
  onCancel: () => void;
}

const CallQualitySettings: React.FC<CallQualitySettingsProps> = ({ type, onStart, onCancel }) => {
  const [videoQuality, setVideoQuality] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [audioQuality, setAudioQuality] = useState<'standard' | 'high'>('standard');
  const [systemAudio, setSystemAudio] = useState(true);

  const qualities: { id: '720p' | '1080p' | '4k'; label: string; desc: string }[] = [
    { id: '720p', label: '720p (HD)', desc: 'Standard clarity, low bandwidth' },
    { id: '1080p', label: '1080p (FHD)', desc: 'High clarity, balanced performance' },
    { id: '4k', label: '4K (UHD)', desc: 'Ultra clarity, high bandwidth' },
  ];

  const audioOptions: { id: 'standard' | 'high'; label: string; desc: string }[] = [
    { id: 'standard', label: 'Standard', desc: '48kHz, 128kbps' },
    { id: 'high', label: 'High Fidelity', desc: '96kHz, 256kbps' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-bg/90 backdrop-blur-2xl"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-lg glass-panel rounded-[40px] p-8 space-y-8 overflow-hidden relative"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 glass-panel rounded-2xl text-accent">
              {type === 'screen_share' ? <Monitor className="w-6 h-6" /> : type === 'video' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-2xl font-serif italic tracking-tight">Transmission Config</h3>
              <p className="micro-label text-muted">Configure your {type === 'screen_share' ? 'screen share' : type === 'video' ? 'video call' : 'audio call'} parameters</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 text-muted hover:text-ink glass-panel rounded-xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Video Quality */}
          {type !== 'audio' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted">
                <Settings2 className="w-4 h-4" />
                <span className="micro-label uppercase tracking-widest">Visual Resolution</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {qualities.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setVideoQuality(q.id)}
                    className={`flex items-center justify-between p-4 rounded-3xl border transition-all ${
                      videoQuality === q.id 
                        ? "bg-accent/10 border-accent text-accent" 
                        : "bg-white/5 border-white/5 text-muted hover:border-white/10"
                    }`}
                  >
                    <div className="text-left">
                      <div className="text-sm font-medium">{q.label}</div>
                      <div className="text-[10px] opacity-60 uppercase tracking-tighter">{q.desc}</div>
                    </div>
                    {videoQuality === q.id && <Check className="w-5 h-5" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Audio Quality */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted">
              <Volume2 className="w-4 h-4" />
              <span className="micro-label uppercase tracking-widest">Audio Fidelity</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {audioOptions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAudioQuality(a.id)}
                  className={`p-4 rounded-3xl border transition-all text-left ${
                    audioQuality === a.id 
                      ? "bg-accent/10 border-accent text-accent" 
                      : "bg-white/5 border-white/5 text-muted hover:border-white/10"
                  }`}
                >
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-[10px] opacity-60 uppercase tracking-tighter">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* System Audio Toggle */}
          {type === 'screen_share' && (
            <div className="p-6 glass-panel rounded-[32px] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl transition-colors ${systemAudio ? "bg-accent/20 text-accent" : "bg-white/5 text-muted"}`}>
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-medium">Capture System Audio</div>
                  <div className="text-[10px] text-muted uppercase tracking-tighter">Include internal system sounds</div>
                </div>
              </div>
              <button
                onClick={() => setSystemAudio(!systemAudio)}
                className={`w-12 h-6 rounded-full transition-all relative ${systemAudio ? "bg-accent" : "bg-white/10"}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${systemAudio ? "right-1" : "left-1"}`} />
              </button>
            </div>
          )}
        </div>

        <div className="pt-4 flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 p-4 glass-panel rounded-3xl text-sm font-medium hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onStart({ video: videoQuality, audio: audioQuality, systemAudio })}
            className="flex-[2] p-4 bg-accent text-bg rounded-3xl text-sm font-medium hover:bg-accent/80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
          >
            <Sparkles className="w-4 h-4" />
            Initiate Transmission
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CallQualitySettings;
