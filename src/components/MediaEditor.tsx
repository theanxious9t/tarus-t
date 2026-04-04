import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, Type, Palette, Sticker, Move, Maximize, Search } from "lucide-react";

interface StickerItem {
  id: string;
  content: string;
  type: 'emoji' | 'gif';
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface MediaEditorProps {
  file: File;
  onSave: (editedFile: File, caption?: string) => void;
  onCancel: () => void;
}

const MediaEditor: React.FC<MediaEditorProps> = ({ file, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'none' | 'draw' | 'text' | 'sticker'>('none');
  const [color, setColor] = useState('#f27d26');
  const [isDrawing, setIsDrawing] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [caption, setCaption] = useState("");
  const [gifSearch, setGifSearch] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);

  const isVideo = file.type.startsWith('video/');

  useEffect(() => {
    if (isVideo) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      setImage(img);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const maxWidth = window.innerWidth * 0.8;
          const maxHeight = window.innerHeight * 0.6;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
        }
      }
    };
  }, [file, isVideo]);

  const searchGifs = async (query: string) => {
    if (!query) return;
    try {
      const resp = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${query}&limit=10`);
      const data = await resp.json();
      setGifs(data.data);
    } catch (error) {
      console.error("GIF search error:", error);
    }
  };

  useEffect(() => {
    if (gifSearch) {
      const timer = setTimeout(() => searchGifs(gifSearch), 500);
      return () => clearTimeout(timer);
    }
  }, [gifSearch]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw' || isVideo) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
      const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw' || isVideo) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
      const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const addSticker = (content: string, type: 'emoji' | 'gif' = 'emoji') => {
    if (isVideo) return;
    const newSticker: StickerItem = {
      id: Math.random().toString(36).substr(2, 9),
      content,
      type,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      scale: 1,
      rotation: 0
    };
    setStickers([...stickers, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  const handleStickerMouseDown = (e: React.MouseEvent, id: string) => {
    if (isVideo) return;
    e.stopPropagation();
    setSelectedStickerId(id);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && selectedStickerId && !isVideo) {
      setStickers(prev => prev.map(s => 
        s.id === selectedStickerId 
          ? { ...s, x: e.clientX, y: e.clientY }
          : s
      ));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updateStickerScale = (id: string, delta: number) => {
    if (isVideo) return;
    setStickers(prev => prev.map(s => 
      s.id === id ? { ...s, scale: Math.max(0.5, s.scale + delta) } : s
    ));
  };

  const handleSave = () => {
    if (isVideo) {
      onSave(file, caption);
      return;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height;
      const ctx = finalCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0);
        
        const drawStickers = async () => {
          for (const s of stickers) {
            ctx.save();
            const canvasRect = canvas.getBoundingClientRect();
            const canvasX = s.x - canvasRect.left;
            const canvasY = s.y - canvasRect.top;
            
            ctx.translate(canvasX, canvasY);
            ctx.scale(s.scale, s.scale);
            ctx.rotate((s.rotation * Math.PI) / 180);

            if (s.type === 'emoji') {
              ctx.font = '60px serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(s.content, 0, 0);
            } else {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = s.content;
              await new Promise((resolve) => {
                img.onload = () => {
                  ctx.drawImage(img, -50, -50, 100, 100);
                  resolve(null);
                };
                img.onerror = () => resolve(null);
              });
            }
            ctx.restore();
          }

          finalCanvas.toBlob((blob) => {
            if (blob) {
              const editedFile = new File([blob], file.name, { type: file.type });
              onSave(editedFile, caption);
            }
          }, file.type);
        };

        drawStickers();
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur-xl select-none"
    >
      <div className="p-8 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-6">
          <button onClick={onCancel} className="p-2 text-muted hover:text-ink transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="flex flex-col">
            <span className="micro-label">Creative Studio</span>
            <h2 className="text-xl font-serif italic">{isVideo ? "Review Media" : "Enhance Media"}</h2>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!isVideo && (
            <>
              <button onClick={() => setMode('draw')} className={`p-3 rounded-full ${mode === 'draw' ? "bg-accent text-bg" : "text-muted hover:text-ink"}`}>
                <Palette className="w-5 h-5" />
              </button>
              <button onClick={() => setMode('sticker')} className={`p-3 rounded-full ${mode === 'sticker' ? "bg-accent text-bg" : "text-muted hover:text-ink"}`}>
                <Sticker className="w-5 h-5" />
              </button>
            </>
          )}
          <button onClick={handleSave} className="w-12 h-12 bg-ink text-bg rounded-full flex items-center justify-center hover:bg-accent transition-colors ml-4">
            <Check className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden" ref={containerRef}>
        <div className="relative glass-panel rounded-3xl overflow-hidden shadow-2xl max-w-full max-h-[70vh]">
          {isVideo ? (
            <video src={URL.createObjectURL(file)} controls className="max-w-full max-h-full" />
          ) : (
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className={`max-w-full max-h-full ${mode === 'draw' ? "cursor-crosshair" : "cursor-default"}`}
            />
          )}
        </div>

        <div className="mt-8 w-full max-w-xl">
          <input
            type="text"
            placeholder="Add a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="luxury-input text-center"
          />
        </div>

        {!isVideo && stickers.map((s) => (
          <motion.div
            key={s.id}
            initial={{ scale: 0 }}
            animate={{ scale: s.scale }}
            onMouseDown={(e) => handleStickerMouseDown(e, s.id)}
            className={`fixed cursor-move group ${selectedStickerId === s.id ? "ring-2 ring-accent rounded-lg p-2" : ""}`}
            style={{ left: s.x, top: s.y, transform: `translate(-50%, -50%) rotate(${s.rotation}deg)` }}
          >
            {s.type === 'emoji' ? (
              <span className="text-6xl">{s.content}</span>
            ) : (
              <img src={s.content} alt="" className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
            )}
            {selectedStickerId === s.id && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-2 bg-bg/80 backdrop-blur-md p-2 rounded-full border border-white/10">
                <button onClick={(e) => { e.stopPropagation(); updateStickerScale(s.id, 0.1); }} className="p-1 hover:text-accent"><Maximize className="w-4 h-4" /></button>
                <button onClick={(e) => { e.stopPropagation(); updateStickerScale(s.id, -0.1); }} className="p-1 hover:text-accent rotate-180"><Maximize className="w-4 h-4" /></button>
                <button onClick={(e) => { e.stopPropagation(); setStickers(prev => prev.filter(st => st.id !== s.id)); }} className="p-1 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {mode === 'sticker' && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="p-8 border-t border-white/5 flex flex-col items-center gap-6 bg-bg/50 backdrop-blur-xl">
            <div className="flex items-center gap-4 w-full max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Search GIFs..."
                  value={gifSearch}
                  onChange={(e) => setGifSearch(e.target.value)}
                  className="luxury-input pl-12"
                />
              </div>
            </div>
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar w-full px-8">
              {gifSearch && gifs.length > 0 ? (
                gifs.map((gif) => (
                  <button 
                    key={gif.id} 
                    onClick={() => addSticker(gif.images.fixed_height.url, 'gif')} 
                    className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden hover:scale-110 transition-transform"
                  >
                    <img src={gif.images.fixed_height.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))
              ) : (
                ['🔥', '❤️', '😂', '✨', '🚀', '🎨', '🌟', '💯', '🌈', '🍕', '🐱', '🐶', '🍔', '🍦', '🍩'].map((sticker) => (
                  <button key={sticker} onClick={() => addSticker(sticker)} className="text-4xl hover:scale-125 transition-transform flex-shrink-0">{sticker}</button>
                ))
              )}
            </div>
          </motion.div>
        )}
        {mode === 'draw' && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="p-8 border-t border-white/5 flex items-center justify-center gap-6">
            {['#f27d26', '#ffffff', '#ff4444', '#44ff44', '#4444ff', '#ffff44', '#000000'].map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? "scale-125 border-white" : "border-transparent"}`} style={{ backgroundColor: c }} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default MediaEditor;
