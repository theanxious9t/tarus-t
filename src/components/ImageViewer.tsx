import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Download } from "lucide-react";

interface ImageViewerProps {
  src: string | null;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, onClose }) => {
  if (!src) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
        onClick={onClose}
      >
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-8 right-8 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-10"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </motion.button>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative max-w-4xl max-h-full"
          onClick={e => e.stopPropagation()}
        >
          <img
            src={src}
            alt="Full View"
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            referrerPolicy="no-referrer"
          />
          
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-4">
            <a
              href={src}
              download="image.png"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-full text-white text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Download Asset
            </a>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImageViewer;
