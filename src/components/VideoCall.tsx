import React, { useEffect, useRef, useState } from "react";
import socket from "../lib/socket";
import { auth, db, handleFirestoreError, OperationType, sendPushNotification } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, User as UserIcon, Sparkles, Clock, Monitor, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { ScrambleText } from "./ScrambleText";

import { AppUser } from "../types";

interface VideoCallProps {
  receiver: AppUser;
  onEndCall: () => void;
  isIncoming?: boolean;
  incomingSignal?: any;
  isAudioOnly?: boolean;
  isScreenShare?: boolean;
  quality?: {
    video: '720p' | '1080p' | '4k';
    audio: 'standard' | 'high';
    systemAudio: boolean;
  };
}

const VideoCall: React.FC<VideoCallProps> = ({ 
  receiver, 
  onEndCall, 
  isIncoming, 
  incomingSignal, 
  isAudioOnly,
  isScreenShare,
  quality
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(isAudioOnly || false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [hasAcceptedIncoming, setHasAcceptedIncoming] = useState(!isIncoming);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const currentUser = auth.currentUser;

  // Socket listeners for WebRTC
  useEffect(() => {
    const handleIceCandidate = (data: any) => {
      const peer = connectionRef.current;
      console.log("Received ICE candidate", !!peer, peer?.signalingState);
      if (peer && peer.remoteDescription && peer.signalingState !== "closed") {
        peer.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => {
          if (peer.signalingState !== "closed") {
            console.warn("Error adding ICE candidate:", e);
          }
        });
      } else {
        console.log("Queuing ICE candidate");
        pendingCandidates.current.push(data.candidate);
      }
    };

    const handleCallAccepted = (data: any) => {
      const peer = connectionRef.current;
      console.log("Call accepted received", !!peer, peer?.signalingState);
      setCallAccepted(true);
      if (peer && data.answer && peer.signalingState === "have-local-offer") {
        peer.setRemoteDescription(new RTCSessionDescription(data.answer))
          .then(() => {
            console.log("Remote description set successfully");
            processPendingCandidates(peer);
          })
          .catch(e => {
            if (peer.signalingState !== "closed") {
              console.warn("Error setting remote description:", e);
            }
          });
      }
    };

    const processPendingCandidates = (peer: RTCPeerConnection) => {
      if (peer.remoteDescription) {
        while (pendingCandidates.current.length > 0) {
          const candidate = pendingCandidates.current.shift();
          if (candidate) {
            peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
              console.warn("Error adding queued ICE candidate:", e);
            });
          }
        }
      }
    };

    const handleCallRejected = async () => {
      toast.error(`Call rejected by ${receiver.displayName}`);
      await logCallHistory('rejected');
      onEndCall();
    };

    socket.on("ice_candidate", handleIceCandidate);
    socket.on("call_accepted", handleCallAccepted);
    socket.on("call_rejected", handleCallRejected);

    return () => {
      socket.off("ice_candidate", handleIceCandidate);
      socket.off("call_accepted", handleCallAccepted);
      socket.off("call_rejected", handleCallRejected);
    };
  }, [receiver.uid]);

  useEffect(() => {
    if (stream && myVideo.current && !isVideoOff) {
      myVideo.current.srcObject = stream;
    }
  }, [stream, isVideoOff]);

  useEffect(() => {
    if (callAccepted && remoteStream) {
      console.log("Setting remote stream to elements", {
        hasVideo: remoteStream.getVideoTracks().length > 0,
        hasAudio: remoteStream.getAudioTracks().length > 0
      });
      
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remoteStream;
        remoteVideo.current.play().catch(e => console.warn("Remote video play failed:", e));
      }
    }
  }, [callAccepted, remoteStream]);

  useEffect(() => {
    if (isIncoming && !hasAcceptedIncoming) return;

    const startMedia = async () => {
      if (!navigator.mediaDevices) {
        toast.error("Media devices not supported. Please ensure you are using a secure connection (HTTPS).");
        onEndCall();
        return;
      }

      if (!isScreenShare && !navigator.mediaDevices.getUserMedia) {
        toast.error("Camera/Microphone access not supported in this browser.");
        onEndCall();
        return;
      }

      if (isScreenShare && !navigator.mediaDevices.getDisplayMedia) {
        toast.error("Screen sharing not supported in this browser.");
        onEndCall();
        return;
      }

      try {
        let currentStream: MediaStream;

        if (isScreenShare && !isIncoming) {
          const constraints = {
            video: {
              width: quality?.video === '4k' ? 3840 : quality?.video === '1080p' ? 1920 : 1280,
              height: quality?.video === '4k' ? 2160 : quality?.video === '1080p' ? 1080 : 720,
              frameRate: 30
            },
            audio: quality?.systemAudio ? {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: quality?.audio === 'high' ? 96000 : 48000
            } : false
          };
          currentStream = await navigator.mediaDevices.getDisplayMedia(constraints);
          
          // Add mic stream if possible
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStream.getAudioTracks().forEach(track => currentStream.addTrack(track));
          } catch (e) {
            console.warn("Mic not added to screen share:", e);
          }
        } else {
          currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: !isAudioOnly, 
            audio: true 
          });
        }

        setStream(currentStream);

        if (isIncoming && incomingSignal) {
          answerCall(currentStream);
        } else {
          callUser(currentStream);
        }

        // Handle screen share stop from browser UI
        const videoTrack = currentStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            handleEndCall();
          };
        }

      } catch (err: any) {
        console.error("Failed to get media devices:", err);
        if (err.name === 'NotAllowedError') {
          toast.error("Permission denied. Please allow access to your camera/microphone/screen.");
        } else {
          toast.error(`Media Error: ${err.message || "Failed to access devices"}`);
        }
        onEndCall();
      }
    };

    startMedia();

    return () => {
      stream?.getTracks().forEach(track => track.stop());
      connectionRef.current?.close();
    };
  }, [hasAcceptedIncoming]);

  const createPeerConnection = (currentStream: MediaStream) => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
    });

    currentStream.getTracks().forEach((track) => {
      peer.addTrack(track, currentStream);
    });

    peer.ontrack = (event) => {
      console.log("Remote track received:", event.track.kind, event.streams[0]?.id);
      const newStream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(newStream);
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = newStream;
        remoteVideo.current.play().catch(e => console.warn("Remote video play failed:", e));
      }
      setCallAccepted(true);
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice_candidate", { to: receiver.uid, candidate: event.candidate });
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peer.iceConnectionState);
      if (peer.iceConnectionState === 'disconnected' || peer.iceConnectionState === 'failed') {
        console.warn("ICE connection failed or disconnected. Attempting restart...");
        // In a full implementation, we would trigger an ICE restart here.
        // For now, we'll notify the user.
        toast.error("Connection lost. Reconnecting...");
        
        // Attempt ICE restart if supported
        if (typeof peer.restartIce === 'function') {
           peer.restartIce();
        }
      } else if (peer.iceConnectionState === 'connected') {
        toast.success("Connection established");
      }
    };

    peer.onconnectionstatechange = () => {
      console.log("Connection State:", peer.connectionState);
      setConnectionState(peer.connectionState);
      if (peer.connectionState === 'failed') {
        toast.error("Call connection failed.");
        handleEndCall();
      }
    };

    return peer;
  };

  const callUser = async (currentStream: MediaStream) => {
    try {
      const peer = createPeerConnection(currentStream);
      connectionRef.current = peer;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit("call_user", {
        userToCall: receiver.uid,
        signalData: offer,
        from: currentUser?.uid,
        name: currentUser?.displayName,
        photoURL: currentUser?.photoURL,
        isAudioOnly,
        isScreenShare,
        quality
      });

      // Send push notification for call
      sendPushNotification(
        receiver.uid,
        `Incoming ${isScreenShare ? 'Screen Share' : (isAudioOnly ? 'Audio Call' : 'Video Call')}`,
        `From ${currentUser?.displayName}`,
        { type: 'call', isAudioOnly, isScreenShare, quality }
      );
    } catch (err) {
      console.error("Error in callUser:", err);
      toast.error("Failed to initiate call.");
      onEndCall();
    }
  };

  const answerCall = async (currentStream: MediaStream) => {
    setCallAccepted(true);
    const peer = createPeerConnection(currentStream);
    connectionRef.current = peer;

    try {
      if (peer.signalingState === "stable") {
        await peer.setRemoteDescription(new RTCSessionDescription(incomingSignal));
        
        // Process any candidates that arrived before setRemoteDescription
        if (peer.remoteDescription) {
          while (pendingCandidates.current.length > 0) {
            const candidate = pendingCandidates.current.shift();
            if (candidate) {
              await peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
                console.warn("Error adding queued ICE candidate during answer:", e);
              });
            }
          }
        }

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("answer_call", { to: receiver.uid, signal: answer });
      }
    } catch (err) {
      console.error("Error in answerCall:", err);
      toast.error("Failed to establish connection.");
      onEndCall();
    }
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !(!isMuted || isOnHold);
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (stream && !isAudioOnly) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !(!isVideoOff || isOnHold);
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  const toggleHold = () => {
    const newHoldState = !isOnHold;
    setIsOnHold(newHoldState);
    
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !(newHoldState || isMuted);
      });
      if (!isAudioOnly) {
        stream.getVideoTracks().forEach(track => {
          track.enabled = !(newHoldState || isVideoOff);
        });
      }
    }

    if (remoteVideo.current) {
      if (newHoldState) {
        remoteVideo.current.pause();
      } else {
        remoteVideo.current.play().catch(e => console.warn(e));
      }
    }
  };

  const toggleSpeaker = async () => {
    setIsSpeakerOn(!isSpeakerOn);
    // In a real mobile environment, this would switch between earpiece and speaker.
    // On the web, we can try to use setSinkId if available, but it's often restricted.
    // For now, we'll provide visual feedback.
    toast.success(isSpeakerOn ? "Switched to Earpiece" : "Switched to Speaker");
  };

  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef(0);
  const hasLoggedCall = useRef(false);

  useEffect(() => {
    if (callAccepted) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => {
          const newDuration = prev + 1;
          durationRef.current = newDuration;
          return newDuration;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callAccepted]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const logCallHistory = async (status: 'completed' | 'missed' | 'rejected') => {
    if (!currentUser || !receiver || hasLoggedCall.current) return;
    
    // Only the caller logs the call to prevent duplicate entries
    if (isIncoming) return;

    hasLoggedCall.current = true;
    
    try {
      const callData = {
        callerId: currentUser.uid,
        callerName: currentUser.displayName,
        callerPhoto: currentUser.photoURL,
        receiverId: receiver.uid,
        receiverName: receiver.displayName,
        receiverPhoto: receiver.photoURL,
        participants: [currentUser.uid, receiver.uid],
        type: isScreenShare ? 'screen_share' : (isAudioOnly ? 'audio' : 'video'),
        status,
        startTime: serverTimestamp(),
        endTime: serverTimestamp(),
        duration: durationRef.current,
      };
      await addDoc(collection(db, 'calls'), callData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'calls');
    }
  };

  const handleEndCall = async () => {
    socket.emit("end_call", { to: receiver.uid });
    
    // Log history before closing
    if (callAccepted) {
      await logCallHistory('completed');
    } else {
      await logCallHistory('missed');
    }

    onEndCall();
  };

  useEffect(() => {
    const handleCallEnded = async () => {
      if (callAccepted) {
        await logCallHistory('completed');
      } else {
        await logCallHistory('missed');
      }
      onEndCall();
    };

    socket.on("call_ended", handleCallEnded);
    return () => {
      socket.off("call_ended", handleCallEnded);
    };
  }, [callAccepted]);

  const handleAcceptIncoming = () => {
    setHasAcceptedIncoming(true);
  };

  const handleRejectIncoming = () => {
    socket.emit("reject_call", { to: receiver.uid });
    onEndCall();
  };

  if (isIncoming && !hasAcceptedIncoming) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center p-0 overflow-hidden"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] animate-pulse delay-1000" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -inset-8 bg-accent/30 rounded-full blur-2xl"
            />
            <img
              src={receiver.photoURL}
              alt={receiver.displayName}
              className="w-40 h-40 rounded-full object-cover grayscale border-2 border-accent shadow-[0_0_30px_rgba(var(--color-accent),0.3)] relative z-10"
              referrerPolicy="no-referrer"
            />
          </div>
          
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-serif italic text-ink">{receiver.displayName}</h2>
            <p className="text-accent tracking-widest uppercase text-sm">
              Incoming {isScreenShare ? "Screen Share" : isAudioOnly ? "Audio Call" : "Video Call"}
            </p>
          </div>

          <div className="flex items-center gap-8 mt-8">
            <button
              onClick={handleRejectIncoming}
              className="w-16 h-16 bg-red-600 text-bg rounded-full flex items-center justify-center hover:bg-red-700 transition-all shadow-[0_0_30px_rgba(220,38,38,0.4)] hover:scale-110"
            >
              <PhoneOff className="w-8 h-8" />
            </button>
            <button
              onClick={handleAcceptIncoming}
              className="w-16 h-16 bg-green-500 text-bg rounded-full flex items-center justify-center hover:bg-green-600 transition-all shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:scale-110"
            >
              <Phone className="w-8 h-8" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center p-0 overflow-hidden"
    >
      {/* Atmospheric Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <div className="relative w-full h-full flex flex-col">
        {connectionState === 'disconnected' && (
          <div className="absolute inset-0 z-40 bg-bg/80 backdrop-blur-sm flex items-center justify-center">
            <div className="glass-panel p-8 rounded-3xl flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Reconnecting...</p>
            </div>
          </div>
        )}
        
        {/* Main Viewport */}
        <div className="flex-1 relative bg-bg overflow-hidden">
          <video
            playsInline
            ref={remoteVideo}
            autoPlay
            className={`absolute inset-0 w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000 ${(!callAccepted || !remoteStream || remoteStream.getVideoTracks().length === 0 || isAudioOnly) ? 'hidden' : ''}`}
          />
          {(!callAccepted || !remoteStream || remoteStream.getVideoTracks().length === 0 || isAudioOnly) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-12 bg-bg">
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 4 }}
                  className="absolute -inset-12 bg-accent/20 rounded-full blur-3xl"
                />
                <img
                  src={receiver.photoURL}
                  alt={receiver.displayName}
                  className="w-48 h-48 md:w-64 md:h-64 rounded-full object-cover grayscale border border-border shadow-2xl relative z-10"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="text-center space-y-4 z-10">
                <h3 className="text-4xl md:text-6xl font-serif italic tracking-tight text-ink">{receiver.displayName}</h3>
                <div className="flex items-center justify-center gap-3">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                  <span className="micro-label text-accent">
                    <ScrambleText text={!callAccepted ? (isIncoming ? "Incoming Transmission" : "Initiating Connection") : (isScreenShare ? "Secure Screen Stream" : (isAudioOnly ? "Secure Audio Link" : "Secure Visual Link"))} />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Local Video (PIP) */}
          <motion.div
            drag
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            className={`absolute top-12 right-12 ${isScreenShare && !isIncoming ? "w-72 h-48" : "w-48 h-72"} bg-bg/50 backdrop-blur-2xl rounded-[32px] overflow-hidden border border-border shadow-2xl z-20 cursor-move transition-all duration-500`}
          >
            {isVideoOff ? (
              <div className="w-full h-full flex items-center justify-center">
                <UserIcon className="w-12 h-12 text-muted" />
              </div>
            ) : (
              <video
                playsInline
                muted
                ref={myVideo}
                autoPlay
                className={`w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500 ${!isScreenShare ? "mirror" : ""}`}
              />
            )}
            <div className="absolute bottom-4 left-4 px-3 py-1 glass-panel rounded-full micro-label flex items-center gap-2">
              {isScreenShare && !isIncoming && <Monitor className="w-3 h-3 text-accent" />}
              <span>{isScreenShare && !isIncoming ? "Broadcasting" : "You"}</span>
            </div>
          </motion.div>

          {/* Top Bar */}
          <div className="absolute top-12 left-12 flex items-center gap-4 z-20">
            <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-3">
              {isScreenShare ? <Monitor className="w-4 h-4 text-accent" /> : <Sparkles className="w-4 h-4 text-accent" />}
              <span className="micro-label"><ScrambleText text={isScreenShare ? "Screen Transmission" : "Encrypted Link"} /></span>
            </div>
            {callAccepted && (
              <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-3">
                <Clock className="w-4 h-4 text-accent" />
                <span className="micro-label font-mono">{formatDuration(callDuration)}</span>
              </div>
            )}
            {quality && (
              <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[8px] uppercase tracking-tighter opacity-50">Quality</span>
                  <span className="micro-label text-accent">{quality.video} / {quality.audio}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls Bar */}
        <div className="p-12 bg-bg flex items-center justify-center gap-6 md:gap-8 relative z-30 flex-wrap">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${
              isMuted ? "bg-red-500 text-bg" : "bg-white/5 text-muted hover:text-ink border border-border"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          {!isAudioOnly && (
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${
                isVideoOff ? "bg-red-500 text-bg" : "bg-white/5 text-muted hover:text-ink border border-border"
              }`}
              title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          )}

          {isAudioOnly && (
            <button
              onClick={toggleSpeaker}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${
                !isSpeakerOn ? "bg-accent text-bg" : "bg-white/5 text-muted hover:text-ink border border-border"
              }`}
              title={isSpeakerOn ? "Switch to Earpiece" : "Switch to Speaker"}
            >
              {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </button>
          )}

          <button
            onClick={toggleHold}
            className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${
              isOnHold ? "bg-orange-500 text-bg" : "bg-white/5 text-muted hover:text-ink border border-border"
            }`}
            title={isOnHold ? "Resume Call" : "Hold Call"}
          >
            {isOnHold ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
          </button>

          <button
            onClick={handleEndCall}
            className="w-16 h-16 md:w-20 md:h-20 bg-red-600 text-bg rounded-full flex items-center justify-center hover:bg-red-700 transition-all shadow-[0_0_40px_rgba(220,38,38,0.3)]"
            title="End Call"
          >
            <PhoneOff className="w-8 h-8" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default VideoCall;
