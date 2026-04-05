import React, { useEffect, useState } from "react";
import { completeGoogleRedirectSignIn, signInWithGoogle } from "../lib/firebase";
import { motion } from "motion/react";
import { LogIn, ArrowRight } from "lucide-react";
import { ScrambleText } from "./ScrambleText";

const Auth: React.FC = () => {
  const [isRedirectProcessing, setIsRedirectProcessing] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let isMounted = true;

    completeGoogleRedirectSignIn()
      .catch((error) => {
        console.error("Redirect login failed:", error);
      })
      .finally(() => {
        if (isMounted) {
          setIsRedirectProcessing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async () => {
    if (isSigningIn || isRedirectProcessing) return;
    setIsSigningIn(true);
    try {
      const method = await signInWithGoogle();
      if (method === "redirect") {
        setIsRedirectProcessing(true);
      }
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg text-ink overflow-hidden relative">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-accent/10 blur-[160px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-white/5 blur-[160px] rounded-full" />
      </div>

      <div className="z-10 w-full max-w-7xl px-8 grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="micro-label mb-6">
            <ScrambleText text="Communication Reimagined" duration={1200} />
          </div>
          <h1 className="text-8xl md:text-[12vw] font-serif leading-[0.85] mb-4 italic">
            <ScrambleText text="Tarsus" duration={1500} delay={200} /><span className="text-accent">.</span>
          </h1>
          <p className="text-xs text-muted/60 tracking-[0.3em] uppercase mb-8">
            <ScrambleText text="branch of tarsi" duration={1000} delay={600} />
          </p>
          <p className="text-muted text-xl md:text-2xl font-light leading-relaxed max-w-lg">
            <ScrambleText text="A sanctuary for high-fidelity connection. Seamlessly blending human intuition with digital precision." duration={2000} delay={800} />
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-start lg:items-end"
        >
          <div className="glass-panel p-12 rounded-[40px] w-full max-w-md relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            <h2 className="text-3xl font-serif mb-8 relative z-10">Begin your journey</h2>
            
            <button
              onClick={handleLogin}
              disabled={isRedirectProcessing || isSigningIn}
              className="luxury-button w-full flex items-center justify-between group/btn relative z-10 overflow-hidden"
            >
              <span className="flex items-center gap-3">
                <LogIn className="w-4 h-4" />
                {isRedirectProcessing ? "Checking sign-in..." : isSigningIn ? "Signing in..." : "Sign in with Google"}
              </span>
              <ArrowRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
            </button>

            <div className="mt-8 pt-8 border-t border-white/5 text-center relative z-10">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Secure • Encrypted • Private
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-12 left-12 flex items-center gap-8">
        <div className="flex flex-col">
          <span className="micro-label">Status</span>
          <span className="text-[10px] font-mono"><ScrambleText text="Operational" duration={1000} delay={1500} /></span>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div className="flex flex-col">
          <span className="micro-label">Version</span>
          <span className="text-[10px] font-mono"><ScrambleText text="2.0.4" duration={800} delay={1700} /></span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
