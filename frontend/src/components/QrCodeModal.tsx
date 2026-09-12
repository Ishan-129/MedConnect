import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, QrCode, ShieldCheck, Clock, ExternalLink, Copy, Check } from 'lucide-react';
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
    qrPayload?: string;
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [networkBaseUrl, setNetworkBaseUrl] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
    return 'http://172.16.4.90:5173';
  });

  // Fetch host LAN IP from backend so mobile phone connected to same Wi-Fi can open the check-in URL
  useEffect(() => {
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((info) => {
        if (info.baseUrl) {
          setNetworkBaseUrl(info.baseUrl);
        }
      })
      .catch(() => {});
  }, []);

  // Construct direct clickable check-in URL for mobile camera scanning
  const rawTokenStr = typeof data.token === 'string' ? data.token : ((data.token as any)?.token_number || String(data.id || ''));
  const cleanToken = rawTokenStr ? (rawTokenStr.startsWith('#') ? rawTokenStr : `#${rawTokenStr}`) : '#MED-PASS';
  const cleanId = String(data.id || '');
  const cleanSig = typeof data.signature === 'string' ? data.signature : String(data.signature || '');

  const checkInUrl = type === 'appointment'
    ? `${networkBaseUrl}/?checkin=true&token=${encodeURIComponent(cleanToken)}&id=${encodeURIComponent(cleanId)}${cleanSig ? `&sig=${encodeURIComponent(cleanSig)}` : ''}`
    : `${networkBaseUrl}/?dispatch_pass=true&dispatch_id=${encodeURIComponent(cleanId)}&token=${encodeURIComponent(cleanToken)}${cleanSig ? `&sig=${encodeURIComponent(cleanSig)}` : ''}&issued=${encodeURIComponent(data.issuedAt || '')}&exp=${encodeURIComponent(data.expiresAt || '')}`;

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
                      ? 'Scan with phone camera or tap link for instant check-in'
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
              {/* Real Cryptographic QR Representation */}
              <div className="bg-white p-5 rounded-xl border border-rule flex flex-col items-center justify-center shadow-hairline mx-auto max-w-[280px]">
                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-center">
                  <QRCodeSVG
                    value={checkInUrl}
                    size={176}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div className="mt-2.5 text-center">
                  <span className="text-[11px] font-mono font-bold text-slate-900 tabular-nums">
                    {cleanToken}
                  </span>
                  <p className="text-[10px] font-mono text-emerald-600 font-bold tracking-wider uppercase mt-0.5">
                    {type === 'appointment' ? 'Direct Mobile Check-In QR' : 'Verified Cryptographic Pass'}
                  </p>
                </div>

                <div className="mt-3 w-full space-y-2">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center text-center space-y-1">
                    <span className="text-[10px] font-mono text-slate-600 font-bold uppercase tracking-wider flex items-center space-x-1">
                      <ExternalLink className="w-3 h-3 text-accent" />
                      <span>{type === 'appointment' ? 'Instant Mobile Check-In Link' : 'Direct Emergency Pass Portal Link'}</span>
                    </span>
                    <a
                      href={checkInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-accent hover:underline break-all line-clamp-1"
                      title={checkInUrl}
                    >
                      {checkInUrl}
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(checkInUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="pulse-btn pulse-btn-secondary text-[10px] py-1.5 px-2.5 flex-1 flex items-center justify-center space-x-1 font-mono"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-ink-muted" />}
                      <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                    </button>

                    <a
                      href={checkInUrl}
                      className="pulse-btn pulse-btn-primary text-[10px] py-1.5 px-3 flex items-center justify-center space-x-1 font-mono shrink-0"
                    >
                      <span>Open Now →</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Clinical Telemetry & Metadata Strip */}
              <div className="pulse-card p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center text-ink-muted">
                  <span>Reference ID:</span>
                  <span className="text-ink font-semibold tabular-nums">{String(data.id || '')}</span>
                </div>
                <div className="flex justify-between items-center text-ink-muted">
                  <span>{type === 'appointment' ? 'Doctor / Dept:' : 'Recipient Unit:'}</span>
                  <span className="text-ink font-medium">{String(data.targetName || '')}</span>
                </div>
                <div className="flex justify-between items-center text-ink-muted">
                  <span>Payload:</span>
                  <span className="text-accent font-semibold">{String(data.detail || '')}</span>
                </div>
                <div className="flex justify-between items-center text-ink-muted pt-1.5 border-t border-rule-subtle">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Valid Until:</span>
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                    {data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : '24 Hours'}
                  </span>
                </div>
                <div className="text-[10px] text-ink-muted truncate pt-1 border-t border-rule-subtle">
                  HMAC-SHA256:{' '}
                  <span className="font-mono text-ink tabular-nums">
                    {(typeof data.signature === 'string' ? data.signature : String(data.signature || '')).slice(0, 26)}...
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
