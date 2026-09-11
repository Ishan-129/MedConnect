import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', showDot = true }) => {
  const getBadgeClass = (val: string) => {
    switch (val.toUpperCase()) {
      case 'CRITICAL':
      case 'EMERGENCY':
        return {
          badge: 'pulse-badge-emergency',
          dot: 'pulse-dot-red animate-pulse-gentle',
        };
      case 'HIGH':
      case 'URGENT':
      case 'PENDING':
        return {
          badge: 'pulse-badge-amber',
          dot: 'pulse-dot-amber',
        };
      case 'OPEN':
      case 'WAITING':
        return {
          badge: 'pulse-badge-blue',
          dot: 'pulse-dot-blue',
        };
      case 'CALLED':
      case 'IN_CONSULTATION':
        return {
          badge: 'pulse-badge-green',
          dot: 'pulse-dot-green animate-pulse-gentle',
        };
      case 'COMPLETED':
      case 'ACCEPTED':
      case 'DISPATCHED':
      case 'FULFILLED':
      case 'READY':
      case 'AVAILABLE':
        return {
          badge: 'pulse-badge-green',
          dot: 'pulse-dot-green',
        };
      default:
        return {
          badge: 'pulse-badge-neutral',
          dot: 'pulse-dot-blue',
        };
    }
  };

  const { badge, dot } = getBadgeClass(status);

  return (
    <span className={`pulse-badge ${badge} ${className}`}>
      {showDot && <span className={`pulse-dot ${dot}`} />}
      <span className="font-semibold">{status}</span>
    </span>
  );
};

