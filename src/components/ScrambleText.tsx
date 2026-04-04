import React, { useEffect, useState } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+<>~_-\\/';

interface ScrambleTextProps {
  text: string;
  duration?: number;
  className?: string;
  delay?: number;
}

export const ScrambleText: React.FC<ScrambleTextProps> = ({ 
  text, 
  duration = 800, 
  className = '',
  delay = 0
}) => {
  const [display, setDisplay] = useState('');
  const [isStarted, setIsStarted] = useState(delay === 0);

  useEffect(() => {
    if (delay > 0) {
      const timeout = setTimeout(() => setIsStarted(true), delay);
      return () => clearTimeout(timeout);
    }
  }, [delay]);

  useEffect(() => {
    if (!isStarted) return;

    let start = Date.now();
    let frame: number;

    const tick = () => {
      const now = Date.now();
      const progress = Math.min((now - start) / duration, 1);
      
      let result = '';
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') {
          result += ' ';
          continue;
        }
        // Easing function for a more "mechanical" reveal
        const revealProgress = Math.pow(progress, 1.5); 
        
        if (revealProgress * text.length > i) {
          result += text[i];
        } else {
          result += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      
      setDisplay(result);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration, isStarted]);

  return <span className={className}>{isStarted ? display : ''}</span>;
};
