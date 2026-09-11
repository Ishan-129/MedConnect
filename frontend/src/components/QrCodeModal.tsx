import React, { useEffect, useRef } from 'react';
import { X, QrCode, ShieldCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { motionTokens, springs } from '../lib/motionTokens';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: 'appointment' | 'dispatch';
  data: {
    token?: string;
    id: string;
    targetName: string;
    detail: string;
    issuedAt: string;
    expiresAt: string;
    signature: string;
  };
}

export const QrCodeModal: React.FC<QrModalProps> = ({
  isOpen,
  onClose,
  title,
  type,
  data,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const el = modalRef.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    first?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="qr-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.fast }}
          className="pulse-backdrop"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            ref={modalRef}
            key="qr-modal-panel"
            initial={{
              opacity: 0,
              scale: motionTokens.scale.subtle,
              y: motionTokens.distance.sm,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: motionTokens.scale.subtle,
              y: motionTokens.distance.sm,
            }}
            transition={springs.gentle}
            className="pulse-modal max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="pulse-modal-header">
              <div className="flex items-center space-x-2.5">
                <span
                  className={`p-2 rounded-lg ${
                    type === 'appointment'
                      ? 'bg-accent/15 text-accent'
                      : 'bg-emergency/15 text-emergency'
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="pulse-h4 text-base">{title}</h3>
                  <p className="pulse-text-muted text-xs">
                    {type === 'appointment'
                      ? 'Present token at reception desk for instant check-in'
                      : 'Official Tamper-Proof Handover Pass'}
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: motionTokens.scale.pop }}
                whileTap={{ scale: motionTokens.scale.press }}
                onClick={onClose}
                className="pulse-btn pulse-btn-ghost p-1.5 rounded-lg text-ink-muted hover:text-ink"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Modal Body */}
            <div className="pulse-modal-body space-y-4">
              {/* High-Contrast Crisp QR Representation */}
              <div className="bg-white p-5 rounded-xl border border-rule flex flex-col items-center justify-center shadow-hairline mx-auto max-w-[240px]">
                <div className="w-44 h-44 bg-slate-900 rounded-lg flex flex-col items-center justify-center p-3 relative overflow-hidden">
                  {/* Grid pattern resembling clean high-density QR */}
                  <div className="absolute inset-2 grid grid-cols-6 grid-rows-6 gap-1.5 opacity-95">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div
                        key={i}
                        className={`rounded-xs ${
                          i === 0 ||
                          i === 5 ||
                          i === 30 ||
                          (i % 3 === 0 && i % 2 !== 0) ||
                          i === 14 ||
                          i === 21
                            ? type === 'appointment'
                              ? 'bg-emerald-400'
                              : 'bg-red-400'
                            : i % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Center Identifier Pill */}
                  <div className="relative z-10 bg-slate-950 px-2.5 py-1 rounded border border-slate-700 shadow-md">
                    <span className="text-[11px] font-mono font-bold text-white tabular-nums">
                      {data.token || data.id}
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-mono text-slate-700 mt-2.5 font-bold tracking-wider uppercase">
                  MedConnect Anti-Tamper Token
                </span>
              </div>

              {/* Clinical Telemetry & Metadata Strip */}
              <div className="pulse-card p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center text-ink-muted">
                  <span>Reference ID:</span>
                  <span className="text-ink font-semibold tabular-nums">{data.id}</span>
                </div>
                <div className="flex justify-between items-center text-ink-muted">
                  <span>{type === 'appointment' ? 'Doctor / Dept:' : 'Recipient Unit:'}</span>
                  <span className="text-ink font-medium">{data.targetName}</span>
                </div>
                <div className="flex justify-between items-center text-ink-muted">
                  <span>Payload:</span>
                  <span className="text-accent font-semibold">{data.detail}</span>
                </div>
                <div className="flex justify-between items-center text-ink-muted pt-1.5 border-t border-rule-subtle">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Valid Until:</span>
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                    {new Date(data.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[10px] text-ink-muted truncate pt-1 border-t border-rule-subtle">
                  HMAC-SHA256:{' '}
                  <span className="font-mono text-ink tabular-nums">
                    {data.signature.slice(0, 26)}...
                  </span>
                </div>
              </div>

              {/* Security Guarantee */}
              <div className="flex items-center space-x-2 text-[11px] text-ink-muted bg-paper-subtle p-2.5 rounded-lg border border-rule">
                <ShieldCheck className="w-4 h-4 text-operational shrink-0" />
                <span>
                  Cryptographic single-use token. Verified atomically on scan against Supabase backend.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pulse-modal-footer">
              <motion.button
                whileHover={{ scale: motionTokens.scale.pop }}
                whileTap={{ scale: motionTokens.scale.press }}
                onClick={onClose}
                className="pulse-btn pulse-btn-secondary pulse-btn-sm"
              >
                Dismiss
              </motion.button>
              <motion.button
                whileHover={{ scale: motionTokens.scale.pop }}
                whileTap={{ scale: motionTokens.scale.press }}
                onClick={() => window.print()}
                className="pulse-btn pulse-btn-primary pulse-btn-sm"
              >
                Print Digital Pass
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
