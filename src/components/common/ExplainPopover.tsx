'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

export interface ExplainPopoverProps {
  title: string;
  source: string;
  endpoint: string;
  timestamp?: string;
  modelVersion?: string;
  note?: string;
  className?: string;
}

export const ExplainPopover: React.FC<ExplainPopoverProps> = ({
  title,
  source,
  endpoint,
  timestamp,
  modelVersion,
  note,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={`relative inline-flex items-center align-middle ${className}`} ref={popoverRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`Explain metric: ${title}`}
        aria-expanded={open}
        className="inline-flex items-center justify-center h-3.5 w-3.5 ml-1 text-[#9E968D] hover:text-[#3B1515] transition-colors rounded-full focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
      >
        <HelpCircle className="h-3 w-3" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Data provenance for ${title}`}
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-64 sm:w-72 rounded-lg border border-[#E4DED4] bg-white p-3 shadow-lg text-left text-xs text-[#14110F] font-sans"
        >
          <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-1.5 mb-2">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-[#3B1515]">
              {title}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-[#9E968D] hover:text-[#14110F]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[#6B645C] font-sans">Source:</span>
              <span className="text-[#14110F] text-right truncate font-medium">{source}</span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-[#6B645C] font-sans">Endpoint:</span>
              <span className="text-[#14110F] text-right truncate">{endpoint}</span>
            </div>

            {modelVersion && (
              <div className="flex items-start justify-between gap-2">
                <span className="text-[#6B645C] font-sans">Model:</span>
                <span className="text-[#14110F] text-right">{modelVersion}</span>
              </div>
            )}

            {timestamp && (
              <div className="flex items-start justify-between gap-2">
                <span className="text-[#6B645C] font-sans">Timestamp:</span>
                <span className="text-[#14110F] text-right whitespace-nowrap">
                  {timestamp.replace('T', ' ').slice(0, 19)} UTC
                </span>
              </div>
            )}

            {note && (
              <div className="pt-1 mt-1 border-t border-[#EDE8E0] text-[10px] text-[#6B645C] font-sans">
                {note}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
