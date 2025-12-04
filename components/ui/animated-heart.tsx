"use client";

import React, { useCallback } from 'react';

interface AnimatedHeartProps {
  isLiked: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}

export default function AnimatedHeart({ isLiked, onToggle, size = 20, className = "" }: AnimatedHeartProps) {
  const handleClick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    onToggle();
  }, [onToggle]);

  return (
    <div 
      className={`heart-container ${className}`}
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
        '--heart-color': 'rgb(255, 91, 137)',
        '--heart-color-outline': 'rgb(156, 163, 175)'
      } as React.CSSProperties}
    >
      <input
        className="checkbox"
        type="checkbox"
        checked={isLiked}
        onChange={handleClick}
        tabIndex={-1}
      />
      <div className="svg-container">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="svg-outline"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="svg-filled"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="svg-celebrate"
          width={size * 2}
          height={size * 2}
          viewBox="0 0 60 60"
          fill="none"
        >
          <circle cx="15" cy="15" r="1.5" />
          <circle cx="45" cy="15" r="1" />
          <circle cx="15" cy="45" r="1" />
          <circle cx="45" cy="45" r="1.5" />
          <circle cx="30" cy="8" r="0.8" />
          <circle cx="30" cy="52" r="0.8" />
          <circle cx="8" cy="30" r="1.2" />
          <circle cx="52" cy="30" r="1.2" />
        </svg>
      </div>
    </div>
  );
}