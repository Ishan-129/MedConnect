import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, ShieldCheck, QrCode, Building2, Truck, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  if (!isOpen || !passData) return null;

  const qrPayload = JSON.stringify({
    pass_type: 'EMERGENCY_DISPATCH_HANDOVER',
    dispatch_id: passData.dispatch_id,
    request_id: passData.request_id,
    token_hash: passData.qr_token_hash,
    resource: passData.resource_type,
    quantity: passData.quantity,
    donor: passData.donor_hospital_name,
    requester: passData.requester_hospital_name,
    exp: passData.expires_at,
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-md bg-paper border border-rule rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header Banner */}
          <div className="p-4 bg-gradient-to-r from-red-600 to-red-700 text-white flex items-center justify-between">
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
              <QRCodeSVG
                value={qrPayload}
                size={200}
                level="H"
                includeMargin={false}
              />
              <div className="mt-3 text-center">
                <span className="font-mono text-xs font-bold text-slate-900 tracking-wider">
                  #{passData.dispatch_id}
                </span>
                <p className="text-[10px] font-mono text-red-600 font-semibold mt-0.5">
                  PRIORITY EMERGENCY LIFE-LINE DISPATCH
                </p>
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
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/40 text-[11px] text-red-700 dark:text-red-300 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
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
