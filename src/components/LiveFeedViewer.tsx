import React, { useState, useEffect, useRef } from 'react';
import { RTSPFeed } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Activity, ShieldAlert, Wifi, Maximize, Settings, Menu } from 'lucide-react';

interface LiveFeedViewerProps {
  feed: RTSPFeed;
  onToggleSidebar?: () => void;
}

export default function LiveFeedViewer({ feed, onToggleSidebar }: LiveFeedViewerProps) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsConnecting(true);
    const timer = setTimeout(() => {
      setIsConnecting(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [feed.url]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="h-full flex flex-col bg-bg relative overflow-hidden" ref={containerRef}>
      {/* Header */}
      <div className="h-20 border-b border-border flex items-center justify-between px-8 bg-bg/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-2 text-muted hover:text-ink glass-panel rounded-2xl"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-accent/10 rounded-2xl flex items-center justify-center text-accent">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{feed.name}</h2>
            <div className="flex items-center gap-2 text-xs text-muted font-mono">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {feed.url}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleFullscreen} className="p-2 text-muted hover:text-ink glass-panel rounded-xl transition-all">
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewer Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <AnimatePresence>
          {isConnecting ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black"
            >
              <div className="relative w-32 h-32 mb-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-0 border-2 border-accent border-t-transparent rounded-full opacity-50"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  className="absolute inset-4 border-2 border-white border-b-transparent rounded-full opacity-20"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wifi className="w-8 h-8 text-accent animate-pulse" />
                </div>
              </div>
              <div className="text-accent font-mono text-sm tracking-widest uppercase animate-pulse">
                Establishing RTSP Connection...
              </div>
              <div className="text-muted font-mono text-xs mt-2 opacity-50">
                {feed.url}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0"
            >
              {/* Simulated Video Feed (Since native RTSP is not supported in browser without proxy) */}
              <div className="absolute inset-0 bg-neutral-900">
                <video 
                  src="https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="w-full h-full object-cover grayscale contrast-125 brightness-90"
                />
                {/* Noise overlay */}
                <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
              </div>

              {/* OSD (On-Screen Display) */}
              <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between font-mono text-xs text-white/70 text-shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-red-500 font-bold">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      REC
                    </div>
                    <div>CAM: {feed.name.toUpperCase()}</div>
                    <div>FPS: 29.97</div>
                    <div>RES: 1920x1080</div>
                  </div>
                  <div className="text-right flex flex-col gap-1">
                    <div>{new Date().toLocaleDateString()}</div>
                    <div>{new Date().toLocaleTimeString()}</div>
                    <div className="text-accent mt-2">RTSP PROXY REQUIRED</div>
                    <div className="text-[10px] opacity-50 max-w-[200px]">Native browser playback of RTSP requires a backend WebRTC/HLS transcoder.</div>
                  </div>
                </div>

                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-green-500" />
                      NETWORK STABLE
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-yellow-500" />
                      MOTION DETECTED
                    </div>
                  </div>
                  <div className="text-right">
                    <div>BITRATE: 4.2 Mbps</div>
                    <div>CODEC: H.264</div>
                  </div>
                </div>
              </div>

              {/* Scanning line effect */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <motion.div
                  animate={{ y: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  className="w-full h-32 bg-gradient-to-b from-transparent via-white/5 to-transparent"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
