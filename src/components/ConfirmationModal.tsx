import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = 'danger'
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm glass-panel p-8 rounded-[32px] border border-white/10 shadow-2xl"
          >
            <div className="flex flex-col items-center text-center gap-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                type === 'danger' ? "bg-red-500/10 text-red-500" : 
                type === 'warning' ? "bg-orange-500/10 text-orange-500" : 
                "bg-accent/10 text-accent"
              }`}>
                <AlertTriangle className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-serif italic">{title}</h3>
                <p className="text-sm text-muted leading-relaxed">{message}</p>
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className="flex-1 py-4 rounded-full border border-white/5 text-muted hover:text-ink hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest font-bold"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 py-4 rounded-full text-bg transition-all text-[10px] uppercase tracking-widest font-bold ${
                    type === 'danger' ? "bg-red-500 hover:bg-red-600" : 
                    type === 'warning' ? "bg-orange-500 hover:bg-orange-600" : 
                    "bg-accent hover:bg-accent/80"
                  }`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmationModal;
