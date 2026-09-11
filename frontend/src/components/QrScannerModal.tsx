import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  X,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Sparkles,
  QrCode,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { motionTokens, springs } from '../lib/motionTokens';
import { useAuth } from '../context/AuthContext';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
  expectedToken?: string;
  expectedAppointmentId?: string;
  demoQrPayload?: string;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  expectedToken,
  expectedAppointmentId,
  demoQrPayload,
}) => {
  const { activePatient, openAuthModal, getAuthHeader } = useAuth();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerElementId = 'medconnect-qr-reader-viewport';

  // Stop and clean up scanner instance
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('[QrScannerModal] Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
        setCameraActive(false);
      }
    }
  }, []);

  // Handle server-side check-in verification
  const handleVerifyPayload = useCallback(
    async (decodedText: string) => {
      // Prevent double triggers while verifying
      if (isVerifying) return;

      setIsVerifying(true);
      setCameraError(null);

      // Stop camera once a code is detected
      await stopScanner();

      try {
        // Enforce logged-in patient check
        if (!activePatient) {
          setVerificationResult({
            success: false,
            message: 'You must be logged in to your patient account to check in via QR code.',
          });
          setIsVerifying(false);
          return;
        }

        let extractedToken = expectedToken;
        let extractedApptId = expectedAppointmentId;
        if (decodedText.startsWith('http://') || decodedText.startsWith('https://') || decodedText.includes('token=')) {
          try {
            const u = new URL(decodedText, 'http://localhost');
            extractedToken = u.searchParams.get('token') || u.searchParams.get('tokenId') || extractedToken;
            extractedApptId = u.searchParams.get('id') || u.searchParams.get('appointmentId') || extractedApptId;
          } catch {}
        } else if (!decodedText.startsWith('{')) {
          extractedToken = decodedText;
        }

        const authHeaders = getAuthHeader();
        const res = await fetch('/api/qr/check-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            qr_data: decodedText,
            tokenId: extractedToken,
            appointmentId: extractedApptId,
            action: 'check_in',
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && (data.success || data.status === 'VALID' || data.action_performed === 'CHECKED_IN')) {
          setVerificationResult({
            success: true,
            message: data.message || 'Check-in confirmed! You are now in the live OPD queue.',
            data,
          });

          // Notify parent component after short visual confirmation
          setTimeout(() => {
            onSuccess(data);
            onClose();
          }, 1800);
        } else {
          setVerificationResult({
            success: false,
            message: data.message || 'QR verification rejected. Please verify your appointment pass.',
            data,
          });
        }
      } catch (err: any) {
        setVerificationResult({
          success: false,
          message: err?.message || 'Network error connecting to hospital verification server.',
        });
      } finally {
        setIsVerifying(false);
      }
    },
    [activePatient, expectedAppointmentId, expectedToken, getAuthHeader, isVerifying, onClose, onSuccess, stopScanner]
  );

  // Initialize and start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setVerificationResult(null);

    // Wait for DOM element to be mounted
    await new Promise((resolve) => setTimeout(resolve, 150));

    const element = document.getElementById(readerElementId);
    if (!element) {
      setCameraError('Scanner container viewport not found.');
      return;
    }

    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleVerifyPayload(decodedText);
        },
        () => {
          // ignore scan frame misses
        }
      );

      setCameraActive(true);
    } catch (err: any) {
      console.warn('[QrScannerModal] Camera start failed:', err);
      setCameraActive(false);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setCameraError('Camera access was denied. Please grant camera permission or upload your QR pass.');
      } else if (err?.name === 'NotFoundError' || err?.message?.includes('device not found')) {
        setCameraError('No camera found on this device. You can upload an image of your QR pass instead.');
      } else {
        setCameraError('Unable to start live camera scanner. You can upload a QR pass file or verify your pass.');
      }
    }
  }, [handleVerifyPayload, stopScanner]);

  // Handle image file upload for scanning
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVerifying(true);
    setCameraError(null);
    setVerificationResult(null);

    try {
      await stopScanner();
      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;

      const decodedText = await html5QrCode.scanFile(file, true);
      await html5QrCode.clear();
      scannerRef.current = null;

      handleVerifyPayload(decodedText);
    } catch (err: any) {
      setIsVerifying(false);
      setCameraError('Could not decode a valid QR code from this image. Please ensure the QR code is clear.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Clean scanner cleanup on unmount or close

  // Lifecycle when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setVerificationResult(null);
      setCameraError(null);
      if (activePatient) {
        startCamera();
      }
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, activePatient, startCamera, stopScanner]);

  if (!isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="qr-scanner-backdrop"
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
          key="qr-scanner-panel"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={springs.gentle}
          className="pulse-modal max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="pulse-modal-header">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-lg bg-accent/15 text-accent">
                <Camera className="w-5 h-5" />
              </span>
              <div>
                <h3 className="pulse-h4 text-base">Hospital QR Check-In Scanner</h3>
                <p className="pulse-text-muted text-xs">
                  Scan the hospital kiosk QR or your appointment pass to join the Live Queue
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="pulse-btn pulse-btn-ghost p-1.5 rounded-lg text-ink-muted hover:text-ink"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="pulse-modal-body space-y-4">
            {/* Authenticated Check Requirement */}
            {!activePatient ? (
              <div className="p-5 text-center space-y-4 bg-paper-subtle rounded-xl border border-rule">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-ink text-sm">Login Required for Check-In</h4>
                  <p className="text-xs text-ink-muted mt-1">
                    To prevent patient identification errors, hospital check-in requires you to be logged into your account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openAuthModal('patient');
                  }}
                  className="pulse-btn pulse-btn-primary w-full text-xs"
                >
                  Sign In to Check In
                </button>
              </div>
            ) : (
              <>
                {/* Viewfinder Container */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-rule aspect-square max-h-[300px] flex items-center justify-center">
                  {/* html5-qrcode target div */}
                  <div id={readerElementId} className="w-full h-full" />

                  {/* Laser & Corner Brackets Overlay */}
                  {cameraActive && !isVerifying && !verificationResult && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                      <div className="w-52 h-52 border-2 border-accent/60 rounded-2xl relative">
                        {/* Corner accents */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-accent rounded-tl" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-accent rounded-tr" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-accent rounded-bl" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-accent rounded-br" />

                        {/* Animated Laser Bar */}
                        <motion.div
                          className="w-full h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_12px_#0284c7]"
                          animate={{ y: [10, 195, 10] }}
                          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                        />
                      </div>
                      <span className="mt-3 text-[11px] font-mono text-white/80 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        Align QR code within frame
                      </span>
                    </div>
                  )}

                  {/* Verifying Loader State */}
                  {isVerifying && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4 space-y-3">
                      <Loader2 className="w-8 h-8 text-accent animate-spin" />
                      <p className="text-xs font-mono text-white font-medium">
                        Verifying Cryptographic Pass with Hospital Records...
                      </p>
                    </div>
                  )}

                  {/* Verification Success / Failure Banner inside Viewfinder */}
                  {verificationResult && (
                    <div
                      className={`absolute inset-0 p-6 flex flex-col items-center justify-center text-center space-y-3 ${
                        verificationResult.success
                          ? 'bg-emerald-950/90 text-emerald-100'
                          : 'bg-rose-950/90 text-rose-100'
                      }`}
                    >
                      {verificationResult.success ? (
                        <>
                          <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <CheckCircle2 className="w-7 h-7" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-white">Check-In Successful!</h4>
                            <p className="text-xs mt-1 text-emerald-200">{verificationResult.message}</p>
                            {verificationResult.data?.queue_position && (
                              <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-500/30 text-white font-mono font-bold text-xs">
                                Live Queue Position #{verificationResult.data.queue_position}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                            <AlertCircle className="w-7 h-7" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-white">Verification Failed</h4>
                            <p className="text-xs mt-1 text-rose-200">{verificationResult.message}</p>
                          </div>
                          <button
                            type="button"
                            onClick={startCamera}
                            className="pulse-btn pulse-btn-secondary text-xs px-3 py-1.5 flex items-center space-x-1.5 mt-2"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Try Scanning Again</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Camera Error Alert */}
                {cameraError && (
                  <div className="pulse-alert pulse-alert-emergency text-xs font-mono">
                    <AlertCircle className="w-4 h-4 shrink-0 text-emergency mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {/* Active Patient Identity Confirmation */}
                <div className="flex items-center justify-between text-xs font-mono p-2.5 bg-paper-subtle rounded-xl border border-rule">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-operational shrink-0" />
                    <span className="text-ink font-medium">Logged in: {activePatient.name}</span>
                  </div>
                  {expectedToken && (
                    <span className="text-accent font-bold tabular-nums">{expectedToken}</span>
                  )}
                </div>

                {/* Scanner Actions: Live Camera or Upload QR Pass Image */}
                <div className="space-y-2 pt-1">
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
                    className="pulse-btn pulse-btn-secondary w-full text-xs flex items-center justify-center space-x-1.5 py-2"
                    disabled={isVerifying}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload QR Pass Image (if camera unavailable)</span>
                  </button>

                  <p className="text-[10px] font-mono text-ink-muted text-center pt-1">
                    Point camera at the QR code displayed at the hospital kiosk or on your printed pass.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pulse-modal-footer">
            <button
              onClick={onClose}
              className="pulse-btn pulse-btn-secondary pulse-btn-sm w-full"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
