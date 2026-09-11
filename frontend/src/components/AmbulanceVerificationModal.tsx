import React, { useState } from 'react';
import { X, CheckCircle2, ShieldCheck, QrCode, Truck, Thermometer, Building2, AlertTriangle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AmbulanceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'PICKUP' | 'DELIVERY';
  dispatchId: string;
  donorHospitalName: string;
  requesterHospitalName: string;
  resourceType: string;
  quantity: number;
  onConfirmVerification: () => void;
}

export const AmbulanceVerificationModal: React.FC<AmbulanceVerificationModalProps> = ({
  isOpen,
  onClose,
  type,
  dispatchId,
  donorHospitalName,
  requesterHospitalName,
  resourceType,
  quantity,
  onConfirmVerification,
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [driverBadgeId] = useState('AMB-DL-01-9482');
  const [batchId] = useState(`BATCH-O-${Math.floor(10000 + Math.random() * 90000)}`);
  const [tempChecked, setTempChecked] = useState(true);
  const [sealIntact, setSealIntact] = useState(true);

  if (!isOpen) return null;

  const handleExecuteVerification = () => {
    setIsVerifying(true);

    setTimeout(() => {
      setIsVerifying(false);
      setIsSuccess(true);

      setTimeout(() => {
        onConfirmVerification();
        onClose();
        setIsSuccess(false);
      }, 1200);
    }, 1000);
  };

  const isPickup = type === 'PICKUP';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-md bg-paper border border-rule rounded-2xl shadow-2xl overflow-hidden text-ink"
        >
          {/* Header */}
          <div className={`p-4 text-white flex items-center justify-between ${
            isPickup ? 'bg-blue-600' : 'bg-emerald-600'
          }`}>
            <div className="flex items-center space-x-2">
              <QrCode className="w-5 h-5" />
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase">
                  {isPickup ? 'Step 1: Donor Pickup Verification' : 'Step 2: Emergency Intake Handshake'}
                </h3>
                <p className="text-[10px] text-white/80 font-mono">
                  {isPickup ? `At ${donorHospitalName}` : `At ${requesterHospitalName}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Mission Overview */}
            <div className="p-3 bg-paper-subtle rounded-xl border border-rule font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ink-muted">Dispatch Pass ID:</span>
                <span className="font-bold text-ink">#{dispatchId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Medical Cargo:</span>
                <span className="font-bold text-emergency">
                  {quantity} Units of {resourceType.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between border-t border-rule-subtle pt-1">
                <span className="text-ink-muted">Route Corridor:</span>
                <span className="text-accent font-semibold truncate max-w-[200px]">
                  {donorHospitalName.split(' ')[0]} ➔ {requesterHospitalName.split(' ')[0]}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Ambulance Unit:</span>
                <span className="text-ink font-semibold">{driverBadgeId}</span>
              </div>
            </div>

            {/* Checklist Verification Items */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-ink uppercase tracking-wider">
                Clinical Custody Verification Protocol:
              </label>

              <div className="p-2.5 bg-paper-subtle rounded-lg border border-rule flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <Thermometer className="w-4 h-4 text-operational" />
                  <span>Cold-Chain Temp Check (3.8°C)</span>
                </div>
                <input
                  type="checkbox"
                  checked={tempChecked}
                  onChange={(e) => setTempChecked(e.target.checked)}
                  className="rounded border-rule text-operational focus:ring-operational w-4 h-4"
                />
              </div>

              <div className="p-2.5 bg-paper-subtle rounded-lg border border-rule flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span>Tamper-Evident Medical Seal</span>
                </div>
                <input
                  type="checkbox"
                  checked={sealIntact}
                  onChange={(e) => setSealIntact(e.target.checked)}
                  className="rounded border-rule text-accent focus:ring-accent w-4 h-4"
                />
              </div>
            </div>

            {/* Scanner Visualizer */}
            <div className="relative p-4 bg-paper-subtle rounded-xl border border-rule text-center text-ink font-mono text-xs overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#2563eb_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              {isSuccess ? (
                <div className="py-4 flex flex-col items-center space-y-2 text-operational">
                  <CheckCircle2 className="w-10 h-10 animate-bounce" />
                  <span className="font-bold text-sm">
                    {isPickup ? 'PICKUP VERIFIED · AMBULANCE EN ROUTE' : 'DELIVERY VERIFIED · INVENTORY RESTOCKED'}
                  </span>
                </div>
              ) : (
                <div className="py-2 flex flex-col items-center space-y-2">
                  <QrCode className={`w-8 h-8 ${isVerifying ? 'text-emergency animate-spin' : 'text-accent'}`} />
                  <span className="text-[11px] text-ink-2 font-medium">
                    {isVerifying ? 'Validating cryptographic pass with hospital node...' : 'Ready to scan digital pass at triage terminal'}
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    Assigned Serial: {batchId}
                  </span>
                </div>
              )}
            </div>

            {/* Action Trigger */}
            <button
              onClick={handleExecuteVerification}
              disabled={isVerifying || isSuccess || !tempChecked || !sealIntact}
              className={`w-full pulse-btn pulse-btn-md font-mono text-xs font-semibold ${
                isPickup ? 'pulse-btn-primary' : 'pulse-btn-emergency'
              }`}
            >
              {isVerifying ? (
                <span>Verifying Digital Signature...</span>
              ) : isPickup ? (
                <span>Confirm Pickup & Launch Road Transit</span>
              ) : (
                <span>Confirm Emergency Delivery & Restock Blood Bank</span>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
