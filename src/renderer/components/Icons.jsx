import React from 'react';

export function PauseIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="2" width="4" height="12" rx="1.5" fill="currentColor"/>
      <rect x="9" y="2" width="4" height="12" rx="1.5" fill="currentColor"/>
    </svg>
  );
}

export function PlayIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M4.5 2.8C4.5 2.32 5.04 2.03 5.44 2.29L13.14 7.49C13.5 7.73 13.5 8.27 13.14 8.51L5.44 13.71C5.04 13.97 4.5 13.68 4.5 13.2V2.8Z" 
        fill="currentColor"
      />
    </svg>
  );
}

export function WaveformIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="24" 
      height="16" 
      viewBox="0 0 24 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="5" width="2.5" height="6" rx="1.25" fill="currentColor"/>
      <rect x="6.5" y="3" width="2.5" height="10" rx="1.25" fill="currentColor"/>
      <rect x="11" y="1" width="2.5" height="14" rx="1.25" fill="currentColor"/>
      <rect x="15.5" y="3" width="2.5" height="10" rx="1.25" fill="currentColor"/>
      <rect x="20" y="5" width="2.5" height="6" rx="1.25" fill="currentColor"/>
    </svg>
  );
}

export function SparkleIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M8 1C8.27 1 8.5 1.22 8.5 1.5V3.5C8.5 4.88 9.62 6 11 6H13C13.28 6 13.5 6.22 13.5 6.5C13.5 6.78 13.28 7 13 7H11C9.62 7 8.5 8.12 8.5 9.5V11.5C8.5 11.78 8.28 12 8 12C7.72 12 7.5 11.78 7.5 11.5V9.5C7.5 8.12 6.38 7 5 7H3C2.72 7 2.5 6.78 2.5 6.5C2.5 6.22 2.72 6 3 6H5C6.38 6 7.5 4.88 7.5 3.5V1.5C7.5 1.22 7.72 1 8 1Z" 
        fill="currentColor"
      />
      <path 
        d="M12.5 10C12.78 10 13 10.22 13 10.5V11H13.5C13.78 11 14 11.22 14 11.5C14 11.78 13.78 12 13.5 12H13V12.5C13 12.78 12.78 13 12.5 13C12.22 13 12 12.78 12 12.5V12H11.5C11.22 12 11 11.78 11 11.5C11 11.22 11.22 11 11.5 11H12V10.5C12 10.22 12.22 10 12.5 10Z" 
        fill="currentColor"
      />
      <path 
        d="M3.5 11C3.78 11 4 11.22 4 11.5V12H4.5C4.78 12 5 12.22 5 12.5C5 12.78 4.78 13 4.5 13H4V13.5C4 13.78 3.78 14 3.5 14C3.22 14 3 13.78 3 13.5V13H2.5C2.22 13 2 12.78 2 12.5C2 12.22 2.22 12 2.5 12H3V11.5C3 11.22 3.22 11 3.5 11Z" 
        fill="currentColor"
      />
    </svg>
  );
}

export function TranscriptIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M2 4H14M2 8H10M2 12H12" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CopyIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect 
        x="5" 
        y="5" 
        width="9" 
        height="9" 
        rx="2" 
        stroke="currentColor" 
        strokeWidth="1.5"
      />
      <path 
        d="M11 5V3.5C11 2.67 10.33 2 9.5 2H3.5C2.67 2 2 2.67 2 3.5V9.5C2 10.33 2.67 11 3.5 11H5" 
        stroke="currentColor" 
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function BookIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M2.5 3C2.5 2.45 2.95 2 3.5 2H6C7.1 2 8 2.9 8 4V14C8 13.45 7.55 13 7 13H3.5C2.95 13 2.5 12.55 2.5 12V3Z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinejoin="round"
      />
      <path 
        d="M13.5 3C13.5 2.45 13.05 2 12.5 2H10C8.9 2 8 2.9 8 4V14C8 13.45 8.45 13 9 13H12.5C13.05 13 13.5 12.55 13.5 12V3Z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GlobeIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle 
        cx="8" 
        cy="8" 
        r="6" 
        stroke="currentColor" 
        strokeWidth="1.5"
      />
      <ellipse 
        cx="8" 
        cy="8" 
        rx="3" 
        ry="6" 
        stroke="currentColor" 
        strokeWidth="1.5"
      />
      <path 
        d="M2.5 8H13.5" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChatIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M14 10C14 10.55 13.55 11 13 11H5L2 14V3C2 2.45 2.45 2 3 2H13C13.55 2 14 2.45 14 3V10Z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M5 6H11M5 8.5H9" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle 
        cx="8" 
        cy="8" 
        r="6" 
        stroke="currentColor" 
        strokeWidth="1.5"
      />
      <path 
        d="M6 6L10 10M10 6L6 10" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EyeIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <circle 
        cx="8" 
        cy="8" 
        r="2" 
        stroke="currentColor" 
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function CheckIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M3 8.5L6.5 12L13 4" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GripIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="6" 
      viewBox="0 0 16 6" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M1 1H15M1 5H15" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function ResetIcon({ className = '' }) {
  return (
    <svg 
      className={className} 
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M2 8C2 4.68629 4.68629 2 8 2C10.2208 2 12.1599 3.26822 13.1973 5.12035" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
      <path 
        d="M14 8C14 11.3137 11.3137 14 8 14C5.77924 14 3.84009 12.7318 2.80269 10.8796" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
      <path 
        d="M10 5H13.5V1.5" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M6 11H2.5V14.5" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}
