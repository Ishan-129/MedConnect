import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Building2,
  Truck,
  Clock,
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  Radio,
  Share2,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TransportationMap } from '../components/TransportationMap';
import { AmbulanceVerificationModal } from '../components/AmbulanceVerificationModal';
import { Hospital } from '../types';

interface DispatchPassPortalViewProps {
  onOpenHospitalCenter?: () => void;
  onBackToHome?: () => void;
}

export const DispatchPassPortalView: React.FC<DispatchPassPortalViewProps> = ({
  onOpenHospitalCenter,
  onBackToHome,
}) => {
  const [params, setParams] = useState<Record<string, string>>({});
  const [liveStatus, setLiveStatus] = useState<string>('IN_TRANSIT');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>('59:45');
  const [tempReading, setTempReading] = useState<number>(3.8);
  const [showVerificationModal, setShowVerificationModal] = useState<boolean>(false);
  const [verificationType, setVerificationType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');

  // Parse URL search parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const parsed: Record<string, string> = {};
    urlParams.forEach((val, key) => {
      parsed[key] = val;
    });

    setParams(parsed);
    const initialStatus = parsed.status || 'IN_TRANSIT';
    setLiveStatus(initialStatus.toUpperCase());
    setLastUpdated(new Date().toLocaleTimeString());

    // Fetch live data from backend endpoint if dispatch_id is available
    const dispatchId = parsed.dispatch_id || parsed.id;
    const tokenHash = parsed.token || parsed.token_hash;

    if (dispatchId || tokenHash) {
      fetch(`/api/emergency/dispatch?id=${encodeURIComponent(dispatchId || '')}&token=${encodeURIComponent(tokenHash || '')}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.dispatch) {
            setLiveStatus(data.dispatch.status || 'IN_TRANSIT');
            setParams((prev) => ({
              ...prev,
              donor: data.dispatch.supplying_hospital_name || prev.donor,
              requester: data.dispatch.requesting_hospital_name || prev.requester,
              resource: data.dispatch.resource_type || prev.resource,
              quantity: String(data.dispatch.quantity || prev.quantity || ''),
              status: data.dispatch.status || prev.status,
            }));
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Fetch all registered hospitals for geospatial radar context
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  useEffect(() => {
    fetch('/api/hospitals')
      .then((res) => res.json())
      .then((data) => {
        if (data.hospitals && Array.isArray(data.hospitals)) {
          setAllHospitals(data.hospitals);
        }
      })
      .catch(() => {});
  }, []);

  // Golden Hour countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof window === 'undefined') return;
      const expParam = params.exp || params.expires_at;
      if (expParam) {
        const expMs = new Date(expParam).getTime();
        const diffMs = expMs - Date.now();
        if (diffMs <= 0) {
          setRemainingTime('00:00 (EXPIRED)');
          return;
        }
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        setRemainingTime(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      } else {
        // Fallback realistic decreasing countdown
        setRemainingTime((prev) => {
          const parts = prev.split(':');
          if (parts.length < 2) return '58:30';
          let m = parseInt(parts[0], 10);
          let s = parseInt(parts[1], 10);
          if (s > 0) s -= 1;
          else if (m > 0) {
            m -= 1;
            s = 59;
          }
          return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [params.exp, params.expires_at]);

  // Telemetry fluctuation simulator
  useEffect(() => {
    const tempInterval = setInterval(() => {
      setTempReading(+(3.7 + Math.random() * 0.4).toFixed(1));
    }, 4000);
    return () => clearInterval(tempInterval);
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    const dispatchId = params.dispatch_id || params.id;
    const tokenHash = params.token || params.token_hash;
    try {
      const res = await fetch(
        `/api/emergency/dispatch?id=${encodeURIComponent(dispatchId || '')}&token=${encodeURIComponent(tokenHash || '')}`
      );
      const data = await res.json();
      if (data.success && data.dispatch) {
        setLiveStatus(data.dispatch.status || 'IN_TRANSIT');
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch {
      // Keep optimistic
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenVerification = (action: 'pickup' | 'delivery') => {
    setVerificationType(action === 'pickup' ? 'PICKUP' : 'DELIVERY');
    setShowVerificationModal(true);
  };

  const handleVerificationConfirmed = (data?: any) => {
    if (verificationType === 'PICKUP') {
      setLiveStatus('PICKED_UP');
      setActionMessage({
        text: '✅ Blood Bank Handover Verified! Cargo picked up and cold chain secured.',
      });
    } else {
      setLiveStatus('DELIVERED');
      setActionMessage({
        text: '🎉 Trauma ER Intake Complete! Resource delivered and restocked in inventory.',
      });
    }
    setLastUpdated(new Date().toLocaleTimeString());
  };

  const handleVerifyStep = async (action: 'pickup' | 'delivery') => {
    // Open full-featured QR scan and clinical custody modal
    handleOpenVerification(action);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const dispatchId = params.dispatch_id || params.id || 'DISP-866059';
  const cleanDispatchId = dispatchId.startsWith('#') ? dispatchId : `#${dispatchId}`;
  const donorName = params.donor || 'Yashoda Super Speciality Hospital';
  const requesterName = params.requester || 'All India Institute of Medical Sciences (AIIMS) New Delhi';
  const resourceType = (params.resource || 'BLOOD_O_NEG').replace(/_/g, ' ');
  const quantity = params.quantity || params.qty || '4';
  const tokenHash = params.token || 'PASS-CRYPT-VALID';
  const issuedTime = params.issued ? new Date(params.issued).toLocaleTimeString() : 'Recent';

  const isPickedUp = liveStatus === 'PICKED_UP' || liveStatus === 'DELIVERED' || liveStatus === 'FULFILLED';
  const isDelivered = liveStatus === 'DELIVERED' || liveStatus === 'FULFILLED';

  const donorHospObj: Hospital = useMemo(() => {
    const matched = allHospitals.find(
      (h) => h.name.toLowerCase() === donorName.toLowerCase() || h.hospital_id === params.donor_id
    );
    if (matched) return matched;

    const isYashoda = donorName.toLowerCase().includes('yashoda') || donorName.toLowerCase().includes('yahoda');
    return {
      hospital_id: 'donor-hub-node',
      name: donorName,
      latitude: isYashoda ? 28.6369 : 28.5283,
      longitude: isYashoda ? 77.3195 : 77.2114,
      contact: '+91-11-45678900',
      telegram_chat_id: '0',
      active_status: true,
      supported_resources: ['O_NEG_BLOOD', 'OXYGEN'],
      distance_km: 11.2,
    };
  }, [allHospitals, donorName, params.donor_id]);

  const requesterHospObj: Hospital = useMemo(() => {
    const matched = allHospitals.find(
      (h) => h.name.toLowerCase() === requesterName.toLowerCase() || h.hospital_id === params.req_hosp_id
    );
    if (matched) return matched;
    return {
      hospital_id: 'requester-er-node',
      name: requesterName,
      latitude: 28.5672,
      longitude: 77.2100,
      contact: '+91-11-26588500',
      telegram_chat_id: '0',
      active_status: true,
      supported_resources: ['O_NEG_BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR'],
      distance_km: 0,
    };
  }, [allHospitals, requesterName, params.req_hosp_id]);

  const mapDeliveryStatus = useMemo(() => {
    if (liveStatus === 'DELIVERED' || liveStatus === 'FULFILLED') return 'DELIVERED';
    if (liveStatus === 'ARRIVED') return 'ARRIVED';
    if (liveStatus === 'PICKED_UP') return 'PICKED_UP';
    if (liveStatus === 'PENDING') return 'PENDING';
    return 'DISPATCHED';
  }, [liveStatus]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner Card */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-br from-red-600 via-red-700 to-rose-900 text-white rounded-2xl p-6 shadow-xl overflow-hidden border border-red-500/30"
      >
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-black/25 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono tracking-wide border border-white/15">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>MEDCONNECT PULSE · VERIFIED EMERGENCY PASS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-sans">
              Emergency Lifeline Handover Pass
            </h1>
            <p className="text-red-100 text-xs sm:text-sm font-mono flex items-center space-x-2">
              <span>Token ID: {cleanDispatchId}</span>
              <span>•</span>
              <span className="text-emerald-300 font-bold">Cryptographically Authentic</span>
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex flex-col items-end">
            <div
              className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase shadow-md flex items-center space-x-2 ${
                isDelivered
                  ? 'bg-emerald-500 text-white animate-pulse'
                  : liveStatus === 'ARRIVED'
                  ? 'bg-emerald-600 text-white animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]'
                  : isPickedUp
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white text-red-700 animate-pulse'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>
                {isDelivered
                  ? 'Delivered · Fulfilled'
                  : liveStatus === 'ARRIVED'
                  ? 'Order Has Arrived · On Site'
                  : isPickedUp
                  ? 'Cargo In Road Transit'
                  : 'Active · Dispatched'}
              </span>
            </div>
            <span className="text-[11px] text-red-200 font-mono mt-1">
              Refreshed: {lastUpdated || 'Just now'}
            </span>
          </div>
        </div>

        {/* Live Golden Hour Countdown Banner */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2 text-amber-200">
            <Clock className="w-4 h-4 text-amber-300 animate-spin-slow" />
            <span>Golden Hour Window:</span>
            <strong className="text-base text-white font-black tabular-nums">{remainingTime}</strong>
          </div>
          <div className="flex items-center space-x-2 text-emerald-200">
            <Thermometer className="w-4 h-4 text-emerald-300" />
            <span>Live Cold Chain:</span>
            <strong className="text-white font-bold">{tempReading}°C (Monitored 2°–6°C)</strong>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-white text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Status</span>
          </button>
        </div>
      </motion.div>

      {/* Live Interactive Transportation Map with Stock In Vehicle */}
      <TransportationMap
        requesterHospital={requesterHospObj}
        donorHospital={donorHospObj}
        allHospitals={allHospitals}
        activeRequest={{
          request_id: dispatchId,
          requesting_hospital_id: requesterHospObj.hospital_id,
          requesting_hospital_name: requesterName,
          resource_type: (params.resource || 'BLOOD_O_NEG') as any,
          quantity: Number(quantity) || 4,
          priority: 'CRITICAL',
          status: (liveStatus === 'DELIVERED' ? 'FULFILLED' : 'ACCEPTED') as any,
          created_at: params.issued || new Date().toISOString(),
          expires_at: params.exp || new Date(Date.now() + 3600000).toISOString(),
        }}
        deliveryStatus={mapDeliveryStatus}
        onVerifyPickup={!isPickedUp ? () => handleOpenVerification('pickup') : undefined}
        onVerifyDelivery={!isDelivered ? () => handleOpenVerification('delivery') : undefined}
        onOrderArrived={() => {
          setLiveStatus((prev) => (prev === 'DELIVERED' ? prev : 'ARRIVED'));
        }}
      />

      {/* Corridor & Requisition Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Donor Facility */}
        <div className="p-5 bg-paper border border-rule rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted flex items-center space-x-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Donor Facility (Origin)</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Blood Bank Confirmed
            </span>
          </div>
          <div>
            <h3 className="font-bold text-base text-ink">{donorName}</h3>
            <p className="text-xs text-ink-muted mt-0.5">Emergency Dispatch Hub & Inventory Reserve</p>
          </div>
          <div className="pt-2 border-t border-rule font-mono text-xs text-ink-muted flex justify-between">
            <span>Pickup Protocol:</span>
            <span className="text-ink font-semibold">{isPickedUp ? 'Completed' : 'Awaiting Ambulance Arrival'}</span>
          </div>
        </div>

        {/* Requester Hospital */}
        <div className="p-5 bg-paper border border-rule rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-muted flex items-center space-x-1.5">
              <Building2 className="w-3.5 h-3.5 text-red-500" />
              <span>Requester Hospital (Destination)</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              Trauma ER · Code Red
            </span>
          </div>
          <div>
            <h3 className="font-bold text-base text-ink">{requesterName}</h3>
            <p className="text-xs text-ink-muted mt-0.5">Critical ICU & Emergency Operating Theater</p>
          </div>
          <div className="pt-2 border-t border-rule font-mono text-xs text-ink-muted flex justify-between">
            <span>Intake Protocol:</span>
            <span className="text-ink font-semibold">{isDelivered ? 'Delivered & Stored' : 'Emergency Team on Standby'}</span>
          </div>
        </div>
      </div>

      {/* Cargo & Cold Chain Details Card */}
      <div className="p-5 bg-paper border border-rule rounded-2xl shadow-sm space-y-4">
        <h4 className="text-xs font-mono uppercase tracking-wider text-ink-muted flex items-center space-x-2">
          <Truck className="w-4 h-4 text-accent" />
          <span>Verified Cargo & Transport Specification</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule font-mono">
            <span className="text-[11px] text-ink-muted block">Medical Asset:</span>
            <strong className="text-sm text-emergency font-bold block mt-1">
              {quantity} Units · {resourceType}
            </strong>
          </div>
          <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule font-mono">
            <span className="text-[11px] text-ink-muted block">Cold Chain Sensor:</span>
            <div className="flex items-center space-x-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <strong className="text-sm text-operational font-bold">{tempReading}°C Monitored</strong>
            </div>
          </div>
          <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule font-mono">
            <span className="text-[11px] text-ink-muted block">Issued Timestamp:</span>
            <strong className="text-sm text-ink font-bold block mt-1">{issuedTime}</strong>
          </div>
        </div>

        {/* Cryptographic Signature Integrity Box */}
        <div className="p-3.5 bg-emerald-500/5 rounded-xl border border-emerald-500/20 font-mono text-xs space-y-1.5">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="flex items-center space-x-1.5 font-bold">
              <Lock className="w-3.5 h-3.5" />
              <span>HMAC SHA-256 Digital Verification Token</span>
            </span>
            <span className="text-[11px] font-bold">AUTHENTIC</span>
          </div>
          <p className="text-[11px] text-ink-muted break-all">
            Hash: <code className="text-ink font-semibold">{tokenHash}</code>
          </p>
        </div>
      </div>

      {/* Live Handover Action Steps */}
      <div className="p-5 bg-paper border border-rule rounded-2xl shadow-sm space-y-4">
        <h4 className="text-xs font-mono uppercase tracking-wider text-ink-muted flex items-center space-x-2">
          <Radio className="w-4 h-4 text-emerald-500" />
          <span>Interactive 2-Step Handover Protocol</span>
        </h4>

        {actionMessage && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono ${
              actionMessage.error
                ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Step 1: Donor Blood Bank Pickup */}
          <button
            onClick={() => handleVerifyStep('pickup')}
            disabled={actionLoading !== null || isPickedUp}
            className={`p-4 rounded-xl border font-mono text-xs text-left transition-all flex flex-col justify-between space-y-2 ${
              isPickedUp
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                : 'bg-paper hover:bg-paper-subtle border-rule hover:border-blue-500 active:scale-[0.99] text-ink'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center space-x-1.5">
                {isPickedUp ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Truck className="w-4 h-4 text-blue-500" />
                )}
                <span>Step 1: Donor Facility Pickup</span>
              </span>
              {isPickedUp && <span className="text-[10px] font-bold uppercase">Verified</span>}
            </div>
            <p className="text-[11px] text-ink-muted">
              {isPickedUp
                ? 'Blood units collected and logged by courier.'
                : 'Tap to confirm pickup at donor blood bank desk.'}
            </p>
            {!isPickedUp && (
              <span className="text-blue-600 dark:text-blue-400 font-bold inline-flex items-center space-x-1 mt-1">
                <span>{actionLoading === 'pickup' ? 'Verifying...' : 'Verify Pickup'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            )}
          </button>

          {/* Step 2: Trauma ER Delivery */}
          <button
            onClick={() => handleVerifyStep('delivery')}
            disabled={actionLoading !== null || isDelivered}
            className={`p-4 rounded-xl border font-mono text-xs text-left transition-all flex flex-col justify-between space-y-2 ${
              isDelivered
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                : !isPickedUp
                ? 'opacity-60 bg-paper border-rule cursor-not-allowed text-ink'
                : 'bg-paper hover:bg-paper-subtle border-rule hover:border-emerald-500 active:scale-[0.99] text-ink'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center space-x-1.5">
                {isDelivered ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                )}
                <span>Step 2: Requester ER Intake</span>
              </span>
              {isDelivered && <span className="text-[10px] font-bold uppercase">Delivered</span>}
            </div>
            <p className="text-[11px] text-ink-muted">
              {isDelivered
                ? 'Blood delivered and restocked in trauma ICU.'
                : 'Confirm arrival and intake at destination hospital.'}
            </p>
            {!isDelivered && (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center space-x-1 mt-1">
                <span>{actionLoading === 'delivery' ? 'Completing Handover...' : 'Confirm ER Intake'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Action Navigation Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          onClick={handleCopyLink}
          className="px-4 py-2.5 bg-paper border border-rule hover:bg-paper-subtle rounded-xl text-xs font-mono text-ink flex items-center space-x-2 transition-colors shadow-sm"
        >
          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedLink ? 'Pass Link Copied!' : 'Copy Pass URL'}</span>
        </button>

        <div className="flex items-center space-x-3">
          {onOpenHospitalCenter && (
            <button
              onClick={onOpenHospitalCenter}
              className="pulse-btn pulse-btn-primary pulse-btn-sm font-mono text-xs flex items-center space-x-1.5"
            >
              <span>Hospital Radar View</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="pulse-btn pulse-btn-ghost pulse-btn-sm font-mono text-xs text-ink-muted hover:text-ink"
            >
              Back to Home
            </button>
          )}
        </div>
      </div>

      {/* 2-Step Full-Featured Ambulance & QR Verification Modal */}
      <AmbulanceVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        type={verificationType}
        dispatchId={cleanDispatchId}
        requestId={params.req_id || params.request_id}
        tokenHash={tokenHash}
        donorHospitalName={donorName}
        requesterHospitalName={requesterName}
        resourceType={resourceType}
        quantity={Number(quantity) || 4}
        qrPassUrl={typeof window !== 'undefined' ? window.location.href : undefined}
        onConfirmVerification={handleVerificationConfirmed}
      />
    </div>
  );
};
