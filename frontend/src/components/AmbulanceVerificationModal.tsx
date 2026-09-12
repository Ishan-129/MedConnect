import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  Truck,
  Thermometer,
  AlertTriangle,
  ArrowRight,
  Camera,
  Upload,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
  Loader2,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AmbulanceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'PICKUP' | 'DELIVERY';
  dispatchId: string;
  requestId?: string;
  tokenHash?: string;
  donorHospitalName: string;
  requesterHospitalName: string;
  resourceType: string;
  quantity: number;
  qrPassUrl?: string;
  onConfirmVerification: (data?: any) => void;
}

export const AmbulanceVerificationModal: React.FC<AmbulanceVerificationModalProps> = ({
  isOpen,
  onClose,
  type,
  dispatchId,
  requestId,
  tokenHash,
  donorHospitalName,
  requesterHospitalName,
  resourceType,
  quantity,
  qrPassUrl,
  onConfirmVerification,
}) => {
  const [activeTab, setActiveTab] = useState<'protocol' | 'scan' | 'show_qr'>('protocol');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [driverBadgeId] = useState('AMB-DL-01-9482');
  const [batchId] = useState(`BATCH-O-${Math.floor(10000 + Math.random() * 90000)}`);
  const [tempChecked, setTempChecked] = useState(true);
  const [sealIntact, setSealIntact] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // QR Scanner States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerElementId = 'ambulance-qr-reader-viewport';

  const isPickup = type === 'PICKUP';
  const cleanDispatchId = (dispatchId || 'DISP-781806').replace(/^#/, '');
  const cleanToken = tokenHash || `PASS-${cleanDispatchId}`;

  // Direct scannable portal URL
  const passUrl = qrPassUrl || (typeof window !== 'undefined'
    ? `${window.location.origin}/?dispatch_pass=true&dispatch_id=${cleanDispatchId}&req_id=${requestId || ''}&donor=${encodeURIComponent(donorHospitalName)}&requester=${encodeURIComponent(requesterHospitalName)}&resource=${encodeURIComponent(resourceType)}&quantity=${quantity}&token=${encodeURIComponent(cleanToken)}`
    : '');

  // Cleanup scanner instance
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('[AmbulanceVerificationModal] Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
        setCameraActive(false);
      }
    }
  }, []);

  // Send check-in verification to backend
  const executeServerVerification = async (scannedPayload?: string) => {
    setIsVerifying(true);
    setErrorMessage(null);

    const payload = {
      qr_data: scannedPayload || passUrl || window.location.href,
      type: 'emergency_dispatch',
      dispatch_id: cleanDispatchId,
      req_id: requestId,
      token_hash: cleanToken,
      action: isPickup ? 'pickup' : 'check_in',
      donor: donorHospitalName,
      requester: requesterHospitalName,
      resource: resourceType,
      quantity,
    };

    try {
      const res = await fetch('/api/qr/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.success || data.status === 'PICKUP_VERIFIED' || data.status === 'HANDOVER_VERIFIED' || data.status === 'DELIVERED')) {
        setIsSuccess(true);
        setTimeout(() => {
          onConfirmVerification(data);
          onClose();
          setIsSuccess(false);
        }, 1400);
      } else {
        setErrorMessage(data.message || 'Verification rejected. Please check cryptographic signature.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error connecting to verification server.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Start live camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setErrorMessage(null);

    // Wait for DOM node to mount
    await new Promise((resolve) => setTimeout(resolve, 150));
    const el = document.getElementById(readerElementId);
    if (!el) {
      setCameraError('Scanner container viewport not found.');
      return;
    }

    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
        async (decodedText) => {
          await stopScanner();
          executeServerVerification(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err: any) {
      console.warn('[AmbulanceVerificationModal] Camera start error:', err);
      setCameraActive(false);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera permissions or upload your QR pass.'
          : 'Unable to start camera. You can upload an image of the QR pass or use digital signing.'
      );
    }
  }, [stopScanner]);

  // Handle image file upload for QR code
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVerifying(true);
    setCameraError(null);
    setErrorMessage(null);

    try {
      await stopScanner();
      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;
      const decodedText = await html5QrCode.scanFile(file, true);
      await html5QrCode.clear();
      scannerRef.current = null;
      executeServerVerification(decodedText);
    } catch {
      setIsVerifying(false);
      setCameraError('Could not decode a valid QR code from this image. Please ensure the code is clearly visible.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Tab change handler
  useEffect(() => {
    if (activeTab === 'scan') {
      startCamera();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [activeTab, startCamera, stopScanner]);

  // Modal open/close lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setIsSuccess(false);
      setErrorMessage(null);
      setActiveTab('protocol');
    }
  }, [isOpen, stopScanner]);

  const handleCopyPassLink = () => {
    navigator.clipboard.writeText(passUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-lg bg-paper border border-rule rounded-2xl shadow-2xl overflow-hidden text-ink max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div
            className={`p-4 text-white flex items-center justify-between ${
              isPickup ? 'bg-gradient-to-r from-blue-600 to-indigo-700' : 'bg-gradient-to-r from-emerald-600 to-teal-700'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-white/15 backdrop-blur-md border border-white/20">
                <QrCode className="w-5 h-5 text-white" />
              </span>
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase font-mono">
                  {isPickup ? 'Step 1: Donor Facility Pickup' : 'Step 2: Emergency Intake Handshake'}
                </h3>
                <p className="text-[11px] text-white/85 font-mono">
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

          {/* Navigation Tab Bar */}
          <div className="flex border-b border-rule bg-paper-subtle p-1.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('protocol')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'protocol'
                  ? 'bg-paper text-ink shadow-sm border border-rule font-bold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              <span>Verify & Sign</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'scan'
                  ? 'bg-paper text-ink shadow-sm border border-rule font-bold text-accent'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Scan QR Code</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('show_qr')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'show_qr'
                  ? 'bg-paper text-ink shadow-sm border border-rule font-bold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-500" />
              <span>Display Pass QR</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Error message alert */}
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-mono text-red-600 dark:text-red-400 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* TAB 1: PROTOCOL VERIFICATION */}
            {activeTab === 'protocol' && (
              <div className="space-y-4">
                {/* Mission Overview */}
                <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule font-mono text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Dispatch Pass ID:</span>
                    <span className="font-bold text-ink">#{cleanDispatchId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Medical Asset:</span>
                    <strong className="text-emergency font-bold">
                      {quantity} Units of {resourceType.replace(/_/g, ' ')}
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-rule-subtle pt-1">
                    <span className="text-ink-muted">Transit Route:</span>
                    <span className="text-accent font-semibold truncate max-w-[240px]">
                      {donorHospitalName.split(' ')[0]} ➔ {requesterHospitalName.split(' ')[0]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Courier Unit:</span>
                    <span className="text-ink font-semibold">{driverBadgeId}</span>
                  </div>
                </div>

                {/* Checklist Verification Items */}
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold text-ink uppercase tracking-wider block">
                    Clinical Custody Verification Protocol:
                  </label>

                  <div className="p-3 bg-paper-subtle rounded-xl border border-rule flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center space-x-2.5">
                      <Thermometer className="w-4 h-4 text-emerald-500" />
                      <div>
                        <span className="font-bold block">Cold-Chain Temperature Sensor</span>
                        <span className="text-[10px] text-ink-muted">Reading: 3.8°C (Within safe 2°C – 6°C)</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={tempChecked}
                      onChange={(e) => setTempChecked(e.target.checked)}
                      className="rounded border-rule text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                  </div>

                  <div className="p-3 bg-paper-subtle rounded-xl border border-rule flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center space-x-2.5">
                      <ShieldCheck className="w-4 h-4 text-accent" />
                      <div>
                        <span className="font-bold block">Tamper-Evident Security Seal</span>
                        <span className="text-[10px] text-ink-muted">Cryptographic physical lock intact</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={sealIntact}
                      onChange={(e) => setSealIntact(e.target.checked)}
                      className="rounded border-rule text-accent focus:ring-accent w-4 h-4"
                    />
                  </div>
                </div>

                {/* Scanner Visualizer / Status Box */}
                <div className="relative p-4 bg-paper-subtle rounded-xl border border-rule text-center text-ink font-mono text-xs overflow-hidden">
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#2563eb_1px,transparent_1px)] [background-size:16px_16px]" />

                  {isSuccess ? (
                    <div className="py-4 flex flex-col items-center space-y-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-12 h-12 animate-bounce text-emerald-500" />
                      <span className="font-bold text-sm">
                        {isPickup ? 'PICKUP VERIFIED · AMBULANCE EN ROUTE' : 'DELIVERY VERIFIED · INVENTORY RESTOCKED'}
                      </span>
                    </div>
                  ) : (
                    <div className="py-2 flex flex-col items-center space-y-2">
                      {isVerifying ? (
                        <Loader2 className="w-8 h-8 text-accent animate-spin" />
                      ) : (
                        <QrCode className="w-8 h-8 text-accent" />
                      )}
                      <span className="text-[11px] text-ink font-medium">
                        {isVerifying
                          ? 'Validating HMAC SHA-256 digital signature with hospital network...'
                          : 'Ready to verify digital handover pass at triage terminal'}
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        Assigned Serial: {batchId}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Trigger Button */}
                <button
                  onClick={() => executeServerVerification()}
                  disabled={isVerifying || isSuccess || !tempChecked || !sealIntact}
                  className={`w-full pulse-btn pulse-btn-md font-mono text-xs font-semibold flex items-center justify-center space-x-2 ${
                    isPickup ? 'pulse-btn-primary' : 'pulse-btn-emergency'
                  }`}
                >
                  {isVerifying ? (
                    <span>Verifying Digital Signature...</span>
                  ) : isPickup ? (
                    <>
                      <span>Confirm Pickup & Launch Road Transit</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Confirm Emergency Delivery & Restock Blood Bank</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: LIVE CAMERA / FILE QR SCANNER */}
            {activeTab === 'scan' && (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-rule aspect-square max-h-[280px] flex items-center justify-center mx-auto w-full">
                  <div id={readerElementId} className="w-full h-full" />

                  {cameraActive && !isVerifying && !isSuccess && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                      <div className="w-48 h-48 border-2 border-accent/70 rounded-2xl relative">
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-accent rounded-tl" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-accent rounded-tr" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-accent rounded-bl" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-accent rounded-br" />
                        <motion.div
                          className="w-full h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_12px_#0284c7]"
                          animate={{ y: [10, 175, 10] }}
                          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                        />
                      </div>
                      <span className="mt-3 text-[11px] font-mono text-white/90 bg-black/70 px-3 py-1 rounded-full backdrop-blur-sm">
                        Point camera at Donor Handover QR
                      </span>
                    </div>
                  )}

                  {isVerifying && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4 space-y-3">
                      <Loader2 className="w-8 h-8 text-accent animate-spin" />
                      <p className="text-xs font-mono text-white font-medium">
                        Verifying Scanned Pass with Hospital Grid...
                      </p>
                    </div>
                  )}

                  {isSuccess && (
                    <div className="absolute inset-0 bg-emerald-950/90 text-white flex flex-col items-center justify-center text-center p-4 space-y-2">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                      <h4 className="font-bold text-sm">QR Pass Verified!</h4>
                      <p className="text-xs text-emerald-200">
                        {isPickup ? 'Ambulance pickup recorded. Transit active.' : 'Intake recorded. Assets delivered.'}
                      </p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-mono text-amber-700 dark:text-amber-400">
                    {cameraError}
                  </div>
                )}

                <div className="space-y-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isVerifying}
                    className="pulse-btn pulse-btn-secondary w-full text-xs font-mono flex items-center justify-center space-x-1.5 py-2.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload QR Pass Image (if camera unavailable)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => executeServerVerification()}
                    disabled={isVerifying || isSuccess}
                    className="pulse-btn pulse-btn-primary w-full text-xs font-mono flex items-center justify-center space-x-1.5 py-2.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Simulate Scan & Instant Digital Sign</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: DISPLAY PASS QR CODE */}
            {activeTab === 'show_qr' && (
              <div className="space-y-4 text-center">
                <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl border-2 border-accent shadow-lg mx-auto w-fit">
                  <QRCodeSVG value={passUrl} size={180} level="M" includeMargin={false} />
                  <div className="mt-3 text-center">
                    <span className="font-mono text-xs font-bold text-slate-900 tracking-wider">
                      #{cleanDispatchId}
                    </span>
                    <p className="text-[10px] font-mono text-accent font-semibold mt-0.5">
                      DIGITAL HANDOVER VERIFICATION PASS
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-paper-subtle rounded-xl border border-rule text-xs font-mono text-ink-muted space-y-2">
                  <p>
                    Present this QR code at the donor blood bank desk or ambulance mobile unit for direct optical verification.
                  </p>
                  <div className="flex items-center justify-center space-x-2 pt-1">
                    <button
                      onClick={handleCopyPassLink}
                      className="px-3 py-1.5 bg-paper hover:bg-paper-subtle border border-rule rounded-lg text-xs font-mono text-ink flex items-center space-x-1.5 shadow-sm transition-all"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Link Copied!' : 'Copy Pass Link'}</span>
                    </button>
                    <button
                      onClick={() => executeServerVerification()}
                      disabled={isVerifying || isSuccess}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-mono font-semibold flex items-center space-x-1.5 shadow-sm transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Direct Self-Check</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3.5 border-t border-rule bg-paper-subtle flex justify-end">
            <button
              onClick={onClose}
              className="pulse-btn pulse-btn-secondary pulse-btn-sm font-mono text-xs"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
