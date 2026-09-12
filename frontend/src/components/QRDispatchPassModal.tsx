import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  ShieldCheck,
  QrCode,
  Building2,
  Truck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QRDispatchPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  passData: {
    dispatch_id: string;
    request_id: string;
    donor_hospital_name: string;
    requester_hospital_name: string;
    resource_type: string;
    quantity: number;
    qr_token_hash: string;
    issued_at: string;
    expires_at: string;
    status: string;
  } | null;
}

export const QRDispatchPassModal: React.FC<QRDispatchPassModalProps> = ({
  isOpen,
  onClose,
  passData,
}) => {
  const [copied, setCopied] = useState(false);
  const [networkBaseUrl, setNetworkBaseUrl] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
    return 'http://172.16.4.90:5173';
  });

  // Fetch host LAN IP from backend so mobile devices on the same Wi-Fi can open the portal URL
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

  if (!isOpen || !passData) return null;

  // Direct clickable/scannable URL that opens the MedConnect website portal and displays pass details & live status
  const params = new URLSearchParams({
    dispatch_pass: 'true',
    dispatch_id: passData.dispatch_id,
    req_id: passData.request_id,
    donor: passData.donor_hospital_name,
    requester: passData.requester_hospital_name,
    resource: passData.resource_type,
    quantity: String(passData.quantity),
    token: passData.qr_token_hash,
    issued: passData.issued_at,
    exp: passData.expires_at,
    status: passData.status || 'ACTIVE',
  });

  const portalPassUrl = `${networkBaseUrl}/?${params.toString()}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(portalPassUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenDirectly = () => {
    window.open(portalPassUrl, '_blank');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-md bg-paper border border-rule rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Header Banner */}
          <div className="p-4 bg-gradient-to-r from-red-600 to-red-700 text-white flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-white" />
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase">Emergency Dispatch Pass</h3>
                <p className="text-[10px] text-red-100 font-mono">Single-Use Cryptographic Handover Token</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 text-ink">
            {/* High Contrast QR Code Frame */}
            <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl border-2 border-red-500 shadow-lg mx-auto w-fit">
              <div className="p-2 bg-white rounded-xl">
                <QRCodeSVG
                  value={portalPassUrl}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="mt-3 text-center">
                <span className="font-mono text-xs font-bold text-slate-900 tracking-wider">
                  #{passData.dispatch_id}
                </span>
                <p className="text-[10px] font-mono text-red-600 font-semibold mt-0.5">
                  PRIORITY EMERGENCY LIFE-LINE DISPATCH
                </p>
              </div>
            </div>

            {/* Direct Portal Scan Prompt & Actions */}
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/40 text-center space-y-2">
              <p className="text-xs font-mono text-red-700 dark:text-red-300 font-medium">
                📲 <strong>Scan with any phone camera</strong> to open live status & handover portal directly in your browser.
              </p>
              <div className="flex items-center justify-center space-x-2 pt-1">
                <button
                  onClick={handleOpenDirectly}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-mono font-semibold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Portal View</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-paper hover:bg-paper-subtle border border-rule rounded-lg text-xs font-mono text-ink flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Pass Metadata Grid */}
            <div className="space-y-2.5 font-mono text-xs bg-paper-subtle p-3.5 rounded-xl border border-rule">
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Donor Facility:</span>
                <strong className="text-ink text-right">{passData.donor_hospital_name}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Requester Hospital:</span>
                <strong className="text-emergency text-right">{passData.requester_hospital_name}</strong>
              </div>
              <div className="flex justify-between items-center border-t border-rule-subtle pt-2">
                <span className="text-ink-muted">Resource:</span>
                <strong className="text-accent text-right">
                  {passData.quantity} Units · {passData.resource_type.replace(/_/g, ' ')}
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Cold Chain:</span>
                <span className="text-operational font-bold">2°C – 6°C Monitored</span>
              </div>
              <div className="flex justify-between items-center border-t border-rule-subtle pt-2">
                <span className="text-ink-muted">Issued:</span>
                <span className="text-ink">{new Date(passData.issued_at).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Expiry Window:</span>
                <span className="text-amber-500 font-bold">60 Mins (Golden Hour)</span>
              </div>
            </div>

            {/* Validation Instructions */}
            <div className="p-3 bg-paper-subtle rounded-xl border border-rule text-[11px] text-ink-muted flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>Verification Protocol:</strong> Ambulance driver presents this pass at Donor Blood Bank for pickup scan, and again at Requester Trauma ER upon arrival.
              </span>
            </div>

            <button
              onClick={onClose}
              className="pulse-btn pulse-btn-primary w-full pulse-btn-md font-mono text-xs font-semibold"
            >
              Close & View Transportation Map
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
