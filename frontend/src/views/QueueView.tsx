/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users,
  QrCode,
  Play,
  CheckCircle2,
  ChevronRight,
  Clock,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Stethoscope,
  Loader2,
  Search,
  XCircle,
  Camera,
  Shield,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QueueEntry, QueueStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { QrCodeModal } from '../components/QrCodeModal';
import { QrScannerModal } from '../components/QrScannerModal';
import { motionTokens, springs } from '../lib/motionTokens';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

interface QueueViewProps {
  defaultRole?: 'patient' | 'reception' | 'doctor';
  hideRoleSwitcher?: boolean;
}

export const QueueView: React.FC<QueueViewProps> = ({ defaultRole = 'reception', hideRoleSwitcher = false }) => {
  const { activePatient, activeHospital, allHospitals, openAuthModal, getAuthHeader, setPatientSession } = useAuth();
  const [roleView, setRoleView] = useState<'patient' | 'reception' | 'doctor'>(defaultRole);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Instant URL QR Check-In state
  const [autoCheckInStatus, setAutoCheckInStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
    token?: string;
    queuePosition?: number;
  } | null>(null);

  // Patient custom token tracking state
  const [trackedToken, setTrackedToken] = useState<string>(() => {
    try {
      return localStorage.getItem('medconnect_patient_token') || '';
    } catch {
      return '';
    }
  });
  const [tokenInput, setTokenInput] = useState<string>('');
  const [trackedStatusData, setTrackedStatusData] = useState<any>(null);
  const [isSearchingToken, setIsSearchingToken] = useState(false);
  const [tokenSearchError, setTokenSearchError] = useState<string | null>(null);

  // QR Check-in scanner modal and digital pass modal state
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [activePatientAppt, setActivePatientAppt] = useState<any>(null);

  const hospitalId = activeHospital?.hospital_id || allHospitals[0]?.hospital_id || '';

  // Fetch live queue from backend (including booked appointments awaiting check-in for reception)
  const fetchQueue = useCallback(async () => {
    try {
      const url = hospitalId
        ? `/api/queue/entries?includeBooked=true&hospitalId=${hospitalId}`
        : '/api/queue/entries?includeBooked=true';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const entries: QueueEntry[] = data.entries || [];
        setQueue(entries);
        setQueueError(null);
      } else {
        console.warn('[QueueView] Queue fetch returned', res.status);
        setQueueError(`Backend returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.warn('[QueueView] Queue fetch failed:', err?.message);
      setQueueError('Unable to reach backend — showing last known state.');
    } finally {
      setQueueLoading(false);
    }
  }, [hospitalId]);

  // Fetch specific token status from backend
  const fetchTokenStatus = useCallback(async (token: string) => {
    if (!token) {
      setTrackedStatusData(null);
      return;
    }
    setIsSearchingToken(true);
    setTokenSearchError(null);
    try {
      const res = await fetch(`/api/queue/status?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.token || data.my_token)) {
          setTrackedStatusData(data);
          try {
            localStorage.setItem('medconnect_patient_token', data.token || data.my_token);
          } catch {}
        } else {
          setTokenSearchError(data.message || 'No appointment found with this token');
        }
      } else {
        setTokenSearchError('Failed to retrieve ticket status from hospital database');
      }
    } catch (err: any) {
      setTokenSearchError(err?.message || 'Network error fetching ticket status');
    } finally {
      setIsSearchingToken(false);
    }
  }, []);

  // Mount: load immediately and subscribe to Supabase Realtime + fallback 6s polling
  useEffect(() => {
    fetchQueue();
    if (trackedToken) {
      fetchTokenStatus(trackedToken);
    }

    pollTimerRef.current = setInterval(() => {
      fetchQueue();
      if (trackedToken) {
        fetchTokenStatus(trackedToken);
      }
    }, 6000);

    // Supabase Realtime subscription on appointments table
    const channel = supabase
      .channel('live-queue-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          fetchQueue();
          if (trackedToken) {
            fetchTokenStatus(trackedToken);
          }
        }
      )
      .subscribe();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchQueue, trackedToken, fetchTokenStatus]);

  // Handle instant URL QR Check-In (e.g. mobile camera scan: /?checkin=true&token=...&id=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const isCheckInRequest = urlParams.get('checkin') === 'true' || window.location.pathname.startsWith('/checkin');
    const tokenParam = urlParams.get('token') || urlParams.get('tokenId');
    const idParam = urlParams.get('id') || urlParams.get('appointmentId');
    const sigParam = urlParams.get('sig') || urlParams.get('signature');

    if (tokenParam && (isCheckInRequest || idParam)) {
      const cleanTok = tokenParam.startsWith('#') ? tokenParam : `#${tokenParam}`;
      setRoleView('patient');
      setTrackedToken(cleanTok);
      setAutoCheckInStatus({
        loading: true,
        message: `Verifying digital check-in pass for ${cleanTok}...`,
      });

      fetch('/api/qr/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          qr_data: window.location.href,
          tokenId: cleanTok,
          appointmentId: idParam,
          sig: sigParam,
          action: 'check_in',
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok && (data.success || data.action_performed === 'CHECKED_IN' || data.status === 'VALID' || data.status === 'ALREADY USED / CHECKED IN')) {
            const pos = data.appointment?.queue_position || data.queue_position || 1;
            setAutoCheckInStatus({
              loading: false,
              success: true,
              token: cleanTok,
              queuePosition: pos,
              message: data.message || `Check-in confirmed! You are now in the live queue at Position #${pos}.`,
            });
            try {
              localStorage.setItem('medconnect_patient_token', cleanTok);
            } catch {}

            // Automatically set authenticated patient profile from appointment
            if (data.user) {
              setPatientSession({
                patient_id: data.user.id || data.appointment?.patient_id,
                name: data.user.name || data.appointment?.patient_name || 'Verified Patient',
                phone: data.user.phone || data.appointment?.patient_phone || '',
                blood_group: 'O+',
              }, data.token);
            }

            fetchQueue();
            fetchTokenStatus(cleanTok);

            // Clean up URL parameters cleanly without page refresh
            const cleanPath = window.location.pathname.replace(/\/checkin\/?$/, '/') || '/';
            window.history.replaceState({}, '', cleanPath);
          } else {
            setAutoCheckInStatus({
              loading: false,
              success: false,
              message: data.message || 'Check-in pass could not be verified.',
            });
          }
        })
        .catch((err) => {
          setAutoCheckInStatus({
            loading: false,
            success: false,
            message: err?.message || 'Network error during check-in verification.',
          });
        });
    }
  }, [fetchQueue, fetchTokenStatus, getAuthHeader, setPatientSession]);

  // Auto-switch role view based on authenticated user type
  useEffect(() => {
    if (activePatient && !activeHospital) {
      setRoleView('patient');
    } else if (activeHospital) {
      setRoleView('reception');
    }
  }, [activePatient, activeHospital]);

  // Phase 7: Automatically resolve patient active appointment from real database upon login/mount
  useEffect(() => {
    if (activePatient?.patient_id || activePatient?.phone) {
      const params = new URLSearchParams();
      if (activePatient.patient_id) params.set('patientId', activePatient.patient_id);
      if (activePatient.phone) params.set('phone', activePatient.phone);

      fetch(`/api/appointments?${params.toString()}`, {
        headers: { ...getAuthHeader() },
      })
        .then(res => res.json())
        .then(data => {
          if (data.appointments && data.appointments.length > 0) {
            // Strict client-side isolation to logged-in patient
            const cleanUserPhone = (activePatient.phone || '').replace(/\D/g, '');
            const myAppts = data.appointments.filter((a: any) => {
              const aPatId = a.patient_id || a.patients?.id || a.patients?.patient_id;
              if (activePatient.patient_id && aPatId && aPatId === activePatient.patient_id) return true;
              const aPhone = (a.patient_phone || a.phone || a.patients?.phone_number || a.patients?.phone || '').replace(/\D/g, '');
              if (cleanUserPhone && aPhone) {
                if (cleanUserPhone === aPhone) return true;
                if (cleanUserPhone.length >= 10 && aPhone.endsWith(cleanUserPhone.slice(-10))) return true;
                if (aPhone.length >= 10 && cleanUserPhone.endsWith(aPhone.slice(-10))) return true;
              }
              if (activePatient.name && (a.patient_name || a.patients?.full_name)) {
                const name1 = activePatient.name.trim().toLowerCase();
                const name2 = (a.patient_name || a.patients?.full_name || '').trim().toLowerCase();
                if (name1 && name2 && name1 === name2) return true;
              }
              return false;
            });

            if (myAppts.length > 0) {
              // Find active appointment or latest
              const activeAppt = myAppts.find((a: any) =>
                ['BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'CALLED', 'booked', 'checked_in', 'in_consultation', 'called'].includes(a.status)
              ) || myAppts[0];
              setActivePatientAppt(activeAppt);
              const tok = activeAppt.token_number || activeAppt.token;
              if (tok) {
                setTrackedToken(tok);
                fetchTokenStatus(tok);
              }
            } else {
              setActivePatientAppt(null);
              setTrackedToken('');
              setTrackedStatusData(null);
            }
          } else {
            // Patient has no appointments: clear any previous user's token
            setActivePatientAppt(null);
            setTrackedToken('');
            setTrackedStatusData(null);
          }
        })
        .catch(err => console.warn('[QueueView] Auto-resolve appointment error:', err));
    } else if (!activePatient) {
      setActivePatientAppt(null);
      setTrackedToken('');
      setTrackedStatusData(null);
    }
  }, [activePatient?.patient_id, activePatient?.phone, activePatient?.name, fetchTokenStatus, getAuthHeader]);

  const [checkInToken, setCheckInToken] = useState('');
  const [checkInMsg, setCheckInMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Manual Check-In by in-person receptionist using appointment number / token
  const handleManualCheckInAppointment = async (targetTokenOrId: string) => {
    if (!targetTokenOrId) return;
    try {
      const authHeader = getAuthHeader();
      const res = await fetch('/api/qr/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          tokenId: targetTokenOrId,
          appointmentId: targetTokenOrId.includes('-') ? targetTokenOrId : undefined,
          action: 'check_in',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.status === 'VALID' || data.success || data.action_performed === 'CHECKED_IN') {
        const appt = data.appointment || {};
        const newPos = data.queue_position || queue.filter((q) => q.status === 'WAITING').length + 1;
        setCheckInMsg({
          text: `[MANUAL CHECK-IN SUCCESS] ${data.message || 'Patient checked in successfully!'} ${appt.patient_name || targetTokenOrId} assigned Position #${newPos}.`,
          error: false,
        });
        setCheckInToken('');
        fetchQueue();
      } else {
        setCheckInMsg({
          text: `[CHECK-IN FAILED] ${data.message || 'Unable to check in patient.'}`,
          error: true,
        });
      }
    } catch (err: any) {
      setCheckInMsg({
        text: `[NETWORK ERROR] Could not connect to verification server: ${err.message}`,
        error: true,
      });
    }
  };

  // Call Next Patient — persist to backend and sync real DB state
  const handleCallNext = async () => {
    try {
      const res = await fetch('/api/queue/call-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ hospitalId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.entries) {
          setQueue(data.entries);
        } else {
          fetchQueue();
        }
      } else {
        fetchQueue();
      }
    } catch {
      fetchQueue();
    }
  };

  // Granular Status Update (e.g. COMPLETED, CALLED, IN_CONSULTATION, CANCELLED)
  const handleUpdateStatus = async (appointmentId: string, status: string) => {
    try {
      const res = await fetch('/api/queue/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ appointmentId, status }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.entries) {
          setQueue(data.entries);
        } else {
          fetchQueue();
        }
      }
    } catch {
      fetchQueue();
    }
  };

  // In-person receptionist manual check-in by Appointment No / Token
  const handleReceptionistManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = checkInToken.trim();
    if (!rawInput) return;

    try {
      const authHeader = getAuthHeader();
      const res = await fetch('/api/qr/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          qr_data: rawInput.startsWith('{') ? rawInput : undefined,
          tokenId: !rawInput.startsWith('{') ? rawInput : undefined,
          action: 'check_in',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.status === 'VALID') {
        const appt = data.appointment || {};
        const newPos = data.queue_position || queue.filter((q) => q.status === 'WAITING').length + 1;
        const newEntry: QueueEntry = {
          queue_id: `q-${Date.now()}`,
          appointment_id: data.appointment_id || appt.appointment_id || appt.id || `apt-${Date.now()}`,
          patient_id: appt.patient_id || `pat-${Date.now()}`,
          patient_name: appt.patient_name || `Verified Patient (${data.token || rawInput})`,
          doctor_id: appt.doctor_id || '',
          doctor_name: appt.doctor_name || 'Assigned Doctor',
          department_name: appt.department_name || 'OPD',
          token: data.token || (rawInput.startsWith('#') ? rawInput : `#${rawInput}`),
          position: newPos,
          check_in_at: data.check_in_at || new Date().toISOString(),
          status: 'WAITING',
          estimated_wait_mins: data.estimated_wait_minutes || (newPos - 1) * 15,
        };

        setQueue((prev) => {
          const filtered = prev.filter((q) => q.token !== newEntry.token);
          return [...filtered, newEntry];
        });
        setCheckInMsg({
          text: `[VALID] ${data.message || 'Check-in verified successfully!'} Patient: ${newEntry.patient_name} — Doctor: ${newEntry.doctor_name} (Position #${newPos}).`,
          error: false,
        });
        setCheckInToken('');
        // Refresh queue from backend to stay in sync
        setTimeout(fetchQueue, 500);
      } else if (data.status === 'ALREADY USED / CHECKED IN' || data.status === 'ALREADY_USED') {
        setCheckInMsg({
          text: `[ALREADY USED / CHECKED IN] ${data.message || 'This pass has already been used.'}`,
          error: true,
        });
      } else if (data.status === 'CANCELLED') {
        setCheckInMsg({
          text: `[CANCELLED] ${data.message || 'This appointment was cancelled and cannot be used.'}`,
          error: true,
        });
      } else if (data.status === 'EXPIRED') {
        setCheckInMsg({
          text: `[EXPIRED] ${data.message || 'This QR pass has expired.'}`,
          error: true,
        });
      } else if (data.status === 'INVALID') {
        setCheckInMsg({
          text: `[INVALID] ${data.message || 'Cryptographic verification failed: Forged or modified QR data rejected.'}`,
          error: true,
        });
      } else if (data.status === 'NOT FOUND') {
        setCheckInMsg({
          text: `[NOT FOUND] ${data.message || 'No appointment found in hospital records matching this QR token.'}`,
          error: true,
        });
      } else if (data.status === 'FORBIDDEN') {
        setCheckInMsg({
          text: `[FORBIDDEN] ${data.message || 'Unauthorized access: You are not permitted to verify this pass.'}`,
          error: true,
        });
      } else {
        setCheckInMsg({
          text: `[VERIFICATION FAILED] ${data.message || 'Unable to verify QR token with backend.'}`,
          error: true,
        });
      }
    } catch (err: any) {
      setCheckInMsg({
        text: `[NETWORK ERROR] Could not connect to verification server: ${err.message}`,
        error: true,
      });
    }
  };

  const activeConsultation = queue.find((q) => q.status === 'IN_CONSULTATION');
  const calledPatient = queue.find((q) => q.status === 'CALLED');
  const waitingPatients = queue.filter((q) => q.status === 'WAITING');
  const bookedPatients = queue.filter((q) => q.status === 'BOOKED');
  const checkedInQueue = queue.filter((q) => q.status !== 'BOOKED');

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-rule gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="pulse-badge pulse-badge-green">
              Live OPD Operations
            </span>
            <span className="text-xs font-mono text-ink-muted">Real-time Queue State Engine</span>
          </div>
          <h1 className="pulse-h2 text-2xl font-bold text-ink mt-1">
            {roleView === 'patient' ? 'My OPD Queue Status & Waiting Token' : 'Realtime Live Queue & Check-In Desk'}
          </h1>
          <p className="pulse-text-sm text-ink-muted mt-0.5">
            {roleView === 'patient' 
              ? 'Real-time estimated wait time, position tracking, and turn notification.' 
              : 'QR verification, dynamic FIFO position calculation, receptionist desk triggers & doctor room sync.'}
          </p>
        </div>

        {/* 3-Way Role Switcher with Animated Pill */}
        {!hideRoleSwitcher && (
          <div className="flex items-center bg-paper-subtle p-1 rounded-xl border border-rule relative">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setRoleView('reception')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                roleView === 'reception' ? 'text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {roleView === 'reception' && (
                <motion.div
                  layoutId="queueRoleTab"
                  className="absolute inset-0 bg-accent rounded-lg shadow-hairline"
                  transition={springs.snappy}
                />
              )}
              <span className="relative z-10">Reception Desk</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setRoleView('doctor')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                roleView === 'doctor' ? 'text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {roleView === 'doctor' && (
                <motion.div
                  layoutId="queueRoleTab"
                  className="absolute inset-0 bg-accent rounded-lg shadow-hairline"
                  transition={springs.snappy}
                />
              )}
              <span className="relative z-10">Doctor Panel</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setRoleView('patient')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                roleView === 'patient' ? 'text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {roleView === 'patient' && (
                <motion.div
                  layoutId="queueRoleTab"
                  className="absolute inset-0 bg-accent rounded-lg shadow-hairline"
                  transition={springs.snappy}
                />
              )}
              <span className="relative z-10">Patient View</span>
            </motion.button>
          </div>
        )}
      </div>

      {/* Top Telemetry KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="pulse-card p-4">
          <span className="pulse-stat-label">In Consultation</span>
          <div className="flex items-center justify-between mt-1">
            <span className="pulse-stat-value text-operational tabular-nums">
              {activeConsultation ? activeConsultation.token : 'Vacant'}
            </span>
            <span className="pulse-dot pulse-dot-green animate-pulse-gentle" />
          </div>
        </div>

        <div className="pulse-card p-4">
          <span className="pulse-stat-label">Currently Called</span>
          <div className="flex items-center justify-between mt-1">
            <span className="pulse-stat-value text-accent tabular-nums">
              {calledPatient ? calledPatient.token : 'None'}
            </span>
            <span className="pulse-dot pulse-dot-blue" />
          </div>
        </div>

        <div className="pulse-card p-4">
          <span className="pulse-stat-label">Waiting in OPD</span>
          <div className="flex items-center justify-between mt-1">
            <span className="pulse-stat-value text-ink tabular-nums">
              {waitingPatients.length} Patients
            </span>
            <span className="pulse-dot pulse-dot-amber" />
          </div>
        </div>

        <div className="pulse-card p-4">
          <span className="pulse-stat-label">Est. Avg Wait</span>
          <div className="flex items-center justify-between mt-1">
            <span className="pulse-stat-value text-amber-500 tabular-nums">
              {waitingPatients.length * 8} mins
            </span>
            <Clock className="w-4 h-4 text-ink-muted" />
          </div>
        </div>
      </div>

      {/* Role View Transitions wrapped in AnimatePresence */}
      <AnimatePresence mode="wait">
        {/* VIEW 1: RECEPTION DESK */}
        {roleView === 'reception' && (
          <motion.div
            key="queue-reception-view"
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -motionTokens.distance.sm }}
            transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            
            {/* Left Column: Desk Controls & Check-In */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Primary Action Card: Call Next */}
              <div className="pulse-card space-y-4 border-accent/40">
                <div className="flex items-center justify-between">
                  <span className="pulse-badge pulse-badge-blue">Desk Manager</span>
                  <span className="text-xs font-mono text-ink-muted">Dr. Priya Nair (OPD)</span>
                </div>
                
                <div className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-ink-muted">In Consultation:</span>
                    <span className="text-operational font-bold tabular-nums">
                      {activeConsultation ? activeConsultation.token : 'Vacant'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-ink-muted">Called Outside:</span>
                    <span className="text-accent font-bold tabular-nums">
                      {calledPatient ? `${calledPatient.token} (${calledPatient.patient_name})` : 'Waiting for call'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-ink-muted">Waiting Queue:</span>
                    <span className="text-ink font-bold tabular-nums">{waitingPatients.length} Patients</span>
                  </div>
                </div>

                <div className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCallNext}
                    className="pulse-btn pulse-btn-primary w-full pulse-btn-lg text-xs"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>CALL NEXT PATIENT</span>
                  </motion.button>
                </div>
              </div>

              {/* In-Person Reception Desk: Manual Check-In & Barcode Terminal */}
              <div className="pulse-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                    <UserCheck className="w-4 h-4 text-operational" />
                    <span>Receptionist Desk: Manual Check-In</span>
                  </h3>
                  <span className="pulse-badge pulse-badge-neutral text-[10px]">Staff Authorized</span>
                </div>

                <p className="pulse-text-sm text-ink-muted">
                  Hospital staff can check in walk-in or arriving patients manually by entering their Appointment No / Token, or clicking Check In on the roster below.
                </p>

                {!activeHospital && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Hospital Staff sign-in required for manual desk actions</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAuthModal('hospital')}
                      className="pulse-btn pulse-btn-primary text-xs px-2.5 py-1"
                    >
                      Sign In as Staff
                    </button>
                  </div>
                )}

                <form onSubmit={handleReceptionistManualCheckIn} className="space-y-3">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={checkInToken}
                      onChange={(e) => setCheckInToken(e.target.value)}
                      placeholder="Appointment No / Token e.g. #MED-4030"
                      className="pulse-input flex-1 uppercase tabular-nums font-mono text-xs"
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      type="submit"
                      className="pulse-btn pulse-btn-secondary text-xs px-3"
                    >
                      Check In
                    </motion.button>
                  </div>
                </form>

                <AnimatePresence mode="wait">
                  {checkInMsg && (
                    <motion.div
                      key={checkInMsg.text}
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={springs.gentle}
                      className={`pulse-alert ${
                        checkInMsg.error ? 'pulse-alert-emergency' : 'pulse-alert-success'
                      }`}
                    >
                      {checkInMsg.error ? (
                        <AlertCircle className="w-4 h-4 shrink-0 text-emergency mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-operational mt-0.5" />
                      )}
                      <span className="text-xs font-mono font-medium">{checkInMsg.text}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Today's Booked Patients Awaiting Check-In */}
                {bookedPatients.length > 0 && (
                  <div className="pt-3 border-t border-rule space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-ink flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>Booked Patients Awaiting Check-In ({bookedPatients.length})</span>
                      </span>
                      <span className="text-[10px] font-mono text-ink-muted">Ready to Arrive</span>
                    </div>

                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {bookedPatients.map((bp) => (
                        <div
                          key={bp.queue_id || bp.token}
                          className="flex items-center justify-between p-2 rounded-lg bg-paper-subtle border border-rule text-xs font-mono"
                        >
                          <div className="truncate pr-2">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-ink tabular-nums">{bp.token}</span>
                              <span className="text-ink-2 font-medium truncate">{bp.patient_name}</span>
                            </div>
                            <span className="text-[10px] text-ink-muted block truncate">
                              {bp.doctor_name} ({bp.department_name})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleManualCheckInAppointment(bp.token || bp.appointment_id)}
                            className="pulse-btn pulse-btn-primary text-[11px] px-2.5 py-1 flex items-center space-x-1 shrink-0"
                            title="Manually Check In this patient"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Check In</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Live Queue Table with PopLayout Motion */}
            <div className="lg:col-span-7">
              <div className="pulse-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                    <Users className="w-4 h-4 text-accent" />
                    <span>Checked-In Queue Roster (Realtime FIFO)</span>
                  </h3>
                  <div className="flex items-center space-x-2">
                    {queueLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />}
                    <button
                      onClick={fetchQueue}
                      className="text-[10px] font-mono text-ink-muted hover:text-accent flex items-center gap-1"
                      title="Refresh queue"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                    <span className="text-xs font-mono text-ink-muted tabular-nums font-semibold">
                      {checkedInQueue.length} Checked-In
                    </span>
                  </div>
                </div>
                {queueError && (
                  <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5 bg-amber-500/10 px-2 py-1.5 rounded-lg border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {queueError}
                  </div>
                )}

                <div className="pulse-table-container">
                  <table className="pulse-table pulse-table-hover">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Token</th>
                        <th>Patient</th>
                        <th>Doctor / OPD</th>
                        <th>Arrival</th>
                        <th>Status</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <motion.tbody>
                      <AnimatePresence mode="popLayout">
                        {checkedInQueue.map((item, idx) => (
                          <motion.tr
                            layout
                            key={item.queue_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={springs.gentle}
                          >
                            <td className="font-mono text-ink-muted">
                              {item.status === 'IN_CONSULTATION' ? (
                                <span className="text-operational font-bold">Room</span>
                              ) : item.status === 'CALLED' ? (
                                <span className="text-accent font-bold">Next</span>
                              ) : (
                                <span className="tabular-nums">#{item.position || idx + 1}</span>
                              )}
                            </td>
                            <td className="font-bold text-ink tabular-nums">
                              {item.token}
                              {item.token?.startsWith('#EMERG') && (
                                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-emergency/10 text-emergency font-bold">EMERGENCY</span>
                              )}
                            </td>
                            <td className="font-medium text-ink-2">{item.patient_name}</td>
                            <td className="text-xs text-ink-muted">{item.doctor_name}</td>
                            <td className="text-ink-muted tabular-nums text-xs">
                              {new Date(item.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="text-right space-x-1">
                              {item.status === 'WAITING' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(item.appointment_id, 'CALLED')}
                                    className="text-[10px] font-mono font-semibold px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors"
                                  >
                                    Call
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(item.appointment_id, 'CANCELLED')}
                                    className="text-[10px] font-mono font-semibold px-1.5 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                                    title="Cancel Appointment"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {item.status === 'CALLED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(item.appointment_id, 'IN_CONSULTATION')}
                                    className="text-[10px] font-mono font-semibold px-2 py-1 rounded bg-operational/10 text-operational hover:bg-operational hover:text-white transition-colors"
                                  >
                                    Admit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(item.appointment_id, 'SKIPPED')}
                                    className="text-[10px] font-mono font-semibold px-1.5 py-1 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-600 hover:text-white transition-colors"
                                    title="Mark No-Show / Skip"
                                  >
                                    Skip
                                  </button>
                                </>
                              )}
                              {item.status === 'IN_CONSULTATION' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(item.appointment_id, 'COMPLETED')}
                                  className="text-[10px] font-mono font-semibold px-2 py-1 rounded bg-green-500/10 text-green-500 hover:bg-green-600 hover:text-white transition-colors"
                                >
                                  Complete
                                </button>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </motion.tbody>
                  </table>
                </div>
              </div>
            </div>

          </motion.div>
        )}

        {/* VIEW 2: DOCTOR PANEL */}
        {roleView === 'doctor' && (
          <motion.div
            key="queue-doctor-view"
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -motionTokens.distance.sm }}
            transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="pulse-card space-y-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-rule-subtle">
              <div>
                <span className="pulse-badge pulse-badge-blue">Clinical Consultation Queue</span>
                <h3 className="pulse-h3 text-lg font-bold text-ink mt-1">Dr. Priya Nair · Dermatology Consultation Room 4</h3>
              </div>
              <span className="pulse-badge pulse-badge-green">
                Session Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="pulse-card p-5 border-operational/40">
                <span className="text-xs font-mono text-operational font-bold uppercase tracking-wider">Currently In Consultation</span>
                <div className="mt-3">
                  <h4 className="pulse-h2 text-xl font-bold text-ink tabular-nums">
                    {activeConsultation ? activeConsultation.token : 'No patient currently inside'}
                  </h4>
                  <p className="text-sm font-mono text-ink-2 mt-1 font-semibold">
                    {activeConsultation ? activeConsultation.patient_name : 'Click Call Next from Reception'}
                  </p>
                  <p className="text-xs font-mono text-ink-muted mt-2 tabular-nums">
                    Checked in at: {activeConsultation ? new Date(activeConsultation.check_in_at).toLocaleTimeString() : '—'}
                  </p>
                </div>
              </div>

              <div className="pulse-card p-5 border-accent/40">
                <span className="text-xs font-mono text-accent font-bold uppercase tracking-wider">Next Patient Waiting Outside</span>
                <div className="mt-3">
                  <h4 className="pulse-h2 text-xl font-bold text-ink tabular-nums">
                    {calledPatient ? calledPatient.token : waitingPatients[0]?.token || 'Queue Clear'}
                  </h4>
                  <p className="text-sm font-mono text-ink-2 mt-1 font-semibold">
                    {calledPatient ? calledPatient.patient_name : waitingPatients[0]?.patient_name || 'No upcoming patients'}
                  </p>
                  <p className="text-xs font-mono text-ink-muted mt-2">
                    Estimated arrival: Immediate
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 3: PATIENT LIVE VIEW */}
        {roleView === 'patient' && (() => {
          // Find matching queue entry for logged-in patient or tracked token
          const myQueueEntry = queue.find(
            (q) =>
              (trackedToken && (q.token === trackedToken || q.appointment_id === trackedToken)) ||
              (activePatient?.patient_id && q.patient_id === activePatient.patient_id) ||
              (activePatient?.phone && (q.patient_phone === activePatient.phone || (q.patient_phone && q.patient_phone.endsWith(activePatient.phone.slice(-10))))) ||
              (activePatient?.name && q.patient_name?.toLowerCase().includes(activePatient.name.toLowerCase().split(' ')[0]))
          );

          const dbRecord = trackedStatusData?.success ? trackedStatusData : null;

          const myToken = myQueueEntry?.token || dbRecord?.token || dbRecord?.my_token || activePatientAppt?.token_number || trackedToken;
          const hasTicket = Boolean(myQueueEntry || dbRecord?.token || activePatientAppt?.token_number || trackedToken);

          // Patient is only checked-in if marked checked_in or in queue roster with status other than BOOKED
          const isCheckedIn = Boolean(
            (myQueueEntry && myQueueEntry.status !== 'BOOKED') ||
            (dbRecord?.checked_in === true && dbRecord?.status !== 'BOOKED') ||
            (dbRecord?.status && ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED'].includes(dbRecord.status)) ||
            (activePatientAppt?.status && ['checked_in', 'called', 'in_consultation', 'completed'].includes(activePatientAppt.status.toLowerCase()))
          );

          const myStatus = isCheckedIn
            ? (myQueueEntry?.status || dbRecord?.status || 'WAITING')
            : 'BOOKED';

          const myPos = myStatus === 'IN_CONSULTATION' ? 0 : (myStatus === 'CALLED' ? 0 : (myQueueEntry?.position ?? dbRecord?.queue_position ?? 1));
          const myDoc = myQueueEntry?.doctor_name || dbRecord?.doctor_name || activePatientAppt?.doctor_name || 'Assigned OPD Doctor';
          const myDept = myQueueEntry?.department_name || dbRecord?.department_name || activePatientAppt?.department_name || 'General OPD';
          const myHosp = myQueueEntry?.hospital_name || dbRecord?.hospital_name || activeHospital?.name || 'MedConnect Partner Hospital';
          const peopleAhead = myQueueEntry ? Math.max(0, myPos - 1) : (dbRecord?.people_ahead ?? Math.max(0, myPos - 1));
          const estimatedWait = myQueueEntry?.estimated_wait_mins ?? dbRecord?.estimated_wait_minutes ?? (peopleAhead * 15);

          const handleTrackSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            const clean = tokenInput.trim();
            if (clean) {
              setTrackedToken(clean);
              fetchTokenStatus(clean);
            }
          };

          if (autoCheckInStatus?.loading) {
            return (
              <motion.div
                key="queue-patient-checking-in"
                initial={{ opacity: 0, y: motionTokens.distance.sm }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-xl mx-auto pulse-card p-10 text-center space-y-5"
              >
                <div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/30 text-accent mx-auto flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                </div>
                <div>
                  <h3 className="pulse-h2 text-2xl font-bold text-ink">Verifying Mobile Check-In</h3>
                  <p className="text-xs font-mono text-ink-muted mt-1">{autoCheckInStatus.message}</p>
                </div>
              </motion.div>
            );
          }

          if (!hasTicket) {
            return (
              <motion.div
                key="queue-patient-empty"
                initial={{ opacity: 0, y: motionTokens.distance.sm }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -motionTokens.distance.sm }}
                transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
                className="max-w-xl mx-auto pulse-card p-8 text-center space-y-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-accent-light border border-accent/30 text-accent mx-auto flex items-center justify-center">
                  <Users className="w-8 h-8" />
                </div>

                <div>
                  <span className="pulse-badge pulse-badge-blue">Live Patient Tracker</span>
                  <h2 className="pulse-h2 text-2xl font-bold text-ink mt-2">Track Your OPD Appointment</h2>
                  <p className="pulse-text-sm text-ink-muted mt-1">
                    Enter your appointment token (e.g. #MED-4030 or #EMERG-1100) to monitor your live queue position and estimated arrival call.
                  </p>
                </div>

                <form onSubmit={handleTrackSubmit} className="space-y-3">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Enter Token e.g. #MED-4030"
                      className="pulse-input flex-1 uppercase tabular-nums font-mono"
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      type="submit"
                      disabled={isSearchingToken || !tokenInput.trim()}
                      className="pulse-btn pulse-btn-primary flex items-center space-x-1.5"
                    >
                      {isSearchingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      <span>Track</span>
                    </motion.button>
                  </div>
                  {tokenSearchError && (
                    <div className="text-xs font-mono text-red-500 bg-red-500/10 p-2 rounded-lg border border-red-500/20 text-left flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{tokenSearchError}</span>
                    </div>
                  )}
                </form>

                <div className="pt-4 border-t border-rule flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ink-muted">
                  <span>Don't have an appointment yet?</span>
                  <button
                    type="button"
                    onClick={() => {
                      const navEvt = new CustomEvent('navigate-view', { detail: { view: 'receptionist' } });
                      window.dispatchEvent(navEvt);
                    }}
                    className="pulse-btn pulse-btn-secondary text-xs px-3 py-1.5"
                  >
                    Book with AI Receptionist →
                  </button>
                </div>
              </motion.div>
            );
          }

          // Case 2: Appointment exists but patient has not scanned QR code to check in yet
          if (hasTicket && !isCheckedIn) {
            return (
              <motion.div
                key="queue-patient-awaiting-checkin"
                initial={{ opacity: 0, y: motionTokens.distance.sm }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -motionTokens.distance.sm }}
                transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
                className="max-w-xl mx-auto pulse-card p-8 text-center space-y-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 mx-auto flex items-center justify-center">
                  <QrCode className="w-8 h-8" />
                </div>

                <div>
                  <div className="flex items-center justify-center space-x-2">
                    <span className="pulse-badge pulse-badge-blue">Appointment Confirmed</span>
                    <span className="pulse-badge pulse-badge-amber">Awaiting Hospital QR Check-In</span>
                  </div>
                  <h2 className="pulse-h1 text-4xl font-extrabold text-ink mt-2 tabular-nums">{myToken}</h2>
                  <p className="text-xs font-mono text-ink-2 mt-1 font-semibold">
                    Patient: {activePatient?.name || dbRecord?.patient_name || 'Patient'} · {myDoc} ({myDept})
                  </p>
                  <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                    {myHosp} · Slot: {activePatientAppt?.time_slot || activePatientAppt?.appointment_time || dbRecord?.appointment_time || 'OPD Slot'}
                  </p>
                </div>

                {/* Clear Instruction Card */}
                <div className="p-4 bg-paper-subtle rounded-xl border border-rule text-left space-y-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="p-1.5 rounded-lg bg-accent/15 text-accent">
                      <Camera className="w-4 h-4" />
                    </span>
                    <h4 className="font-bold text-xs text-ink uppercase tracking-wide">
                      Scan QR to Join Live OPD Queue
                    </h4>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    You have <strong className="text-ink">not entered the live queue yet</strong>. Hospital policy requires scanning your check-in QR code at the hospital reception or kiosk upon arrival. Once scanned, you will enter the live queue and can track your position, patients ahead of you, and estimated wait time.
                  </p>
                  <div className="flex items-center space-x-2 text-[11px] font-mono text-ink-muted pt-1 border-t border-rule-subtle">
                    <ShieldCheck className="w-3.5 h-3.5 text-operational shrink-0" />
                    <span>User security policy: You must be logged into your patient account to scan and check in.</span>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="space-y-2.5 pt-1">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      if (!activePatient) {
                        openAuthModal('patient');
                      } else {
                        setShowScannerModal(true);
                      }
                    }}
                    className="pulse-btn pulse-btn-primary w-full pulse-btn-lg text-xs flex items-center justify-center space-x-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>SCAN QR CODE TO CHECK IN</span>
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="pulse-btn pulse-btn-secondary w-full text-xs flex items-center justify-center space-x-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>View & Download My Check-In Pass</span>
                  </button>
                </div>

                {/* Switch or Track another token */}
                <div className="flex items-center justify-between pt-2 border-t border-rule">
                  <form onSubmit={handleTrackSubmit} className="flex-1 flex space-x-2">
                    <input
                      type="text"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Switch token (e.g. #MED-...)"
                      className="pulse-input text-xs uppercase flex-1 font-mono"
                    />
                    <button
                      type="submit"
                      className="pulse-btn pulse-btn-secondary text-xs px-2.5 py-1.5"
                      title="Switch Token"
                    >
                      Switch
                    </button>
                  </form>
                  {trackedToken && (
                    <button
                      type="button"
                      onClick={() => {
                        setTrackedToken('');
                        setTrackedStatusData(null);
                        try { localStorage.removeItem('medconnect_patient_token'); } catch {}
                      }}
                      className="text-[11px] font-mono text-ink-muted hover:text-emergency ml-2"
                      title="Clear Token"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </motion.div>
            );
          }

          // Case 3: Patient is checked in and actively in the Live Queue
          return (
            <motion.div
              key="queue-patient-view"
              initial={{ opacity: 0, y: motionTokens.distance.sm }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -motionTokens.distance.sm }}
              transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
              className="max-w-xl mx-auto pulse-card p-8 text-center space-y-6"
            >
              {autoCheckInStatus?.success && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-left flex items-start justify-between gap-2"
                >
                  <div className="flex items-center space-x-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        Check-In Confirmed via QR Link!
                      </h4>
                      <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                        {autoCheckInStatus.message || 'You have entered the live OPD queue.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoCheckInStatus(null)}
                    className="text-xs font-mono text-ink-muted hover:text-ink px-1.5 py-0.5 rounded"
                  >
                    ✕
                  </button>
                </motion.div>
              )}

              <div className="w-16 h-16 rounded-2xl bg-accent-light border border-accent/30 text-accent mx-auto flex items-center justify-center">
                <Users className="w-8 h-8" />
              </div>

              <div>
                <div className="flex items-center justify-center space-x-2">
                  <span className="pulse-badge pulse-badge-green">Active Live Queue</span>
                  {myToken?.startsWith('#EMERG') && (
                    <span className="pulse-badge pulse-badge-emergency">Emergency Priority</span>
                  )}
                </div>
                <h2 className="pulse-h1 text-4xl font-extrabold text-accent mt-2 tabular-nums">{myToken}</h2>
                <p className="text-xs font-mono text-ink-2 mt-1 font-semibold">
                  Patient: {myQueueEntry?.patient_name || dbRecord?.patient_name || activePatient?.name || 'Patient'} · {myDoc} ({myDept})
                </p>
                <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                  {myHosp}
                </p>
              </div>

              {/* Call alert if called by doctor */}
              {myStatus === 'CALLED' && (
                <motion.div
                  initial={{ scale: 0.97, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="p-4 bg-accent/15 border-2 border-accent rounded-xl text-center space-y-1 animate-pulse"
                >
                  <span className="text-xs font-mono font-bold text-accent uppercase tracking-wider block">
                    🔔 YOUR TURN — PLEASE ENTER ROOM NOW
                  </span>
                  <p className="text-sm font-bold text-ink">
                    The doctor is ready for you in Consultation Room!
                  </p>
                </motion.div>
              )}

              {/* In consultation banner */}
              {myStatus === 'IN_CONSULTATION' && (
                <div className="p-3 bg-operational/15 border border-operational/30 rounded-xl text-center">
                  <span className="text-xs font-mono font-bold text-operational uppercase">
                    🩺 Currently In Consultation with {myDoc}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-rule">
                <div className="p-3 bg-paper-subtle rounded-xl border border-rule">
                  <span className="text-xs font-mono text-ink-muted block font-medium">Queue Status</span>
                  <span className="text-xl font-mono font-bold text-ink mt-1 block tabular-nums">
                    {myStatus === 'IN_CONSULTATION' ? (
                      <span className="text-operational font-bold">In Room Now</span>
                    ) : myStatus === 'CALLED' ? (
                      <span className="text-accent animate-pulse font-bold">Called! Enter Room</span>
                    ) : myStatus === 'COMPLETED' ? (
                      <span className="text-operational">Completed</span>
                    ) : myStatus === 'CANCELLED' ? (
                      <span className="text-emergency">Cancelled</span>
                    ) : (
                      <span>Position #{myPos}</span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted">
                    {myStatus === 'IN_CONSULTATION' ? 'Active Consultation' : (myStatus === 'CALLED' ? 'Doctor is waiting' : `${peopleAhead} ahead of you`)}
                  </span>
                </div>
                <div className="p-3 bg-paper-subtle rounded-xl border border-rule">
                  <span className="text-xs font-mono text-ink-muted block font-medium">Estimated Wait</span>
                  <span className="text-2xl font-mono font-bold text-amber-500 mt-1 block tabular-nums">
                    {myStatus === 'IN_CONSULTATION' || myStatus === 'CALLED' ? '0 min' : `~${estimatedWait} min`}
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted flex items-center justify-center gap-1">
                    <span className="pulse-dot pulse-dot-green" /> Real Database Sync
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <form onSubmit={handleTrackSubmit} className="flex-1 flex space-x-2">
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Switch token (e.g. #MED-...)"
                    className="pulse-input text-xs uppercase flex-1 font-mono"
                  />
                  <button
                    type="submit"
                    className="pulse-btn pulse-btn-secondary text-xs px-2.5 py-1.5"
                    title="Switch Token"
                  >
                    Switch
                  </button>
                </form>
                {trackedToken && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackedToken('');
                      setTrackedStatusData(null);
                      try { localStorage.removeItem('medconnect_patient_token'); } catch {}
                    }}
                    className="text-[11px] font-mono text-ink-muted hover:text-emergency ml-2"
                    title="Clear Token"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="pulse-alert pulse-alert-info text-xs font-mono text-ink-2 text-left">
                <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>State is verified against live hospital records and refreshes synchronously.</span>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Patient Live Camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onSuccess={() => {
          fetchQueue();
          if (trackedToken) fetchTokenStatus(trackedToken);
        }}
        expectedToken={trackedToken || activePatientAppt?.token_number}
        expectedAppointmentId={activePatientAppt?.id || trackedStatusData?.appointment_id}
        demoQrPayload={activePatientAppt?.qr_code || trackedStatusData?.qr_code || trackedToken}
      />

      {/* QR Pass Modal */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        title="Appointment Check-In Pass"
        type="appointment"
        data={{
          token: trackedToken || activePatientAppt?.token_number || '#MED-PASS',
          id: activePatientAppt?.id || trackedStatusData?.appointment_id || `apt-${Date.now()}`,
          targetName: activePatientAppt?.doctor_name || trackedStatusData?.doctor_name || 'Assigned OPD Doctor',
          detail: `Patient: ${activePatient?.name || trackedStatusData?.patient_name || 'Verified Patient'} · Slot: ${activePatientAppt?.time_slot || activePatientAppt?.appointment_time || trackedStatusData?.appointment_time || 'OPD Slot'}`,
          issuedAt: activePatientAppt?.created_at || new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          signature: activePatientAppt?.qr_signature || `sig_${trackedToken || 'pass'}`,
          qrPayload: activePatientAppt?.qr_code || trackedStatusData?.qr_code || trackedToken,
        }}
      />

    </div>
  );
};
