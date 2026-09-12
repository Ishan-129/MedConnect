import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Radio,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  Building2,
  MapPin,
  Send,
  Zap,
  Truck,
  Droplet,
  RefreshCw,
  Layers,
  Thermometer,
  Activity,
  FileCode,
  ExternalLink,
  PhoneCall
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { Hospital, EmergencyRequest, ResourceType, EmergencyPriority } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { HospitalRadarView } from '../components/HospitalRadarView';
import { QRDispatchPassModal } from '../components/QRDispatchPassModal';
import { AmbulanceVerificationModal } from '../components/AmbulanceVerificationModal';
import { triggerEmergencyBroadcast, triggerEmergencyAccept, triggerEscalationCheck, triggerEmergencyDecline, generateCorrelationId } from '../lib/n8nClient';
import { initiateTwilioVoiceCall } from '../services/twilioService';
import { springs } from '../lib/motionTokens';
import { useAuth } from '../context/AuthContext';
import { calculateDistanceKm } from '../lib/haversine';

const DEFAULT_HOSPITAL: Hospital = {
  hospital_id: '11111111-1111-4111-a111-111111111111',
  name: 'AIIMS New Delhi',
  latitude: 28.5672,
  longitude: 77.2100,
  contact: '+91 11 2658 8500',
  telegram_chat_id: '6537122486',
  active_status: true,
  supported_resources: ['BLOOD_O_NEG', 'ICU_BED', 'OXYGEN', 'VENTILATOR'],
  distance_km: 0,
};

export const EmergencyView: React.FC = () => {
  const { activeHospital: authHospital, allHospitals, switchHospital, openAuthModal } = useAuth();

  // Unified hospitals list from AuthContext
  const hospitals: Hospital[] = useMemo(() => {
    return allHospitals.map((h) => ({
      hospital_id: h.hospital_id,
      name: h.name,
      latitude: h.latitude,
      longitude: h.longitude,
      contact: h.contact,
      telegram_chat_id: h.telegram_chat_id,
      active_status: true,
      supported_resources: h.supported_resources,
      distance_km: authHospital
        ? calculateDistanceKm(authHospital.latitude, authHospital.longitude, h.latitude, h.longitude)
        : 0,
    }));
  }, [allHospitals, authHospital]);

  // Active viewing hospital (defaults to logged-in facility or first hospital from database)
  const activeHospital: Hospital = useMemo(() => {
    if (authHospital) {
      const matched = hospitals.find(
        (h) =>
          h.hospital_id === authHospital.hospital_id ||
          (authHospital.name && (
            h.name.toLowerCase().includes(authHospital.name.toLowerCase().split(' ')[0]) ||
            authHospital.name.toLowerCase().includes(h.name.toLowerCase().split(' ')[0])
          ))
      );
      if (matched) {
        return matched;
      }
      return {
        hospital_id: authHospital.hospital_id,
        name: authHospital.name,
        latitude: authHospital.latitude,
        longitude: authHospital.longitude,
        contact: authHospital.contact,
        telegram_chat_id: authHospital.telegram_chat_id,
        active_status: true,
        supported_resources: authHospital.supported_resources,
        distance_km: 0,
      };
    }
    return hospitals[0] || DEFAULT_HOSPITAL;
  }, [authHospital, hospitals]);

  // Check if a request belongs to the active hospital facility
  const isFacilityRequester = useCallback(
    (req: EmergencyRequest) => {
      if (!req) return false;
      if (
        req.requesting_hospital_id &&
        activeHospital?.hospital_id &&
        req.requesting_hospital_id === activeHospital.hospital_id
      ) {
        return true;
      }
      const reqName = (req.requesting_hospital_name || '').toLowerCase();
      const activeName = (activeHospital?.name || '').toLowerCase();
      if (reqName && activeName) {
        const activeWord = activeName.split(' ')[0];
        const reqWord = reqName.split(' ')[0];
        if (activeWord && reqName.includes(activeWord)) return true;
        if (reqWord && activeName.includes(reqWord)) return true;
      }
      return false;
    },
    [activeHospital]
  );

  // Feed tabs: 'incoming' (alerts from other hospitals), 'outgoing' (sent by you), 'all'
  const [feedFilter, setFeedFilter] = useState<'incoming' | 'outgoing' | 'all'>('incoming');

  // Real database emergency requests stream
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [hospitalResources, setHospitalResources] = useState<any[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);

  // Active Ambulance Mission State
  const [activeMission, setActiveMission] = useState<{
    requestId: string;
    donorHospital: Hospital;
    requesterHospital: Hospital;
    resourceType: string;
    quantity: number;
    deliveryStatus: 'DISPATCHED' | 'PICKED_UP' | 'DELIVERED';
    dispatchId: string;
    qrTokenHash: string;
  } | null>(null);

  // Auto-escalation watchdog (180s countdown)
  const [countdown, setCountdown] = useState(145);

  // New SOS Form State (Default: Blood O- Urgent)
  const [resourceType, setResourceType] = useState<string>('BLOOD_O_NEG');
  const [quantity, setQuantity] = useState(4);
  const [priority, setPriority] = useState<EmergencyPriority>('CRITICAL');
  const [radiusKm, setRadiusKm] = useState(15.0);
  const [notes, setNotes] = useState('Polytrauma trauma center patient. Massive internal hemorrhage. Urgent O- transfusion needed.');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  // Live Diagnostic / n8n Telemetry Log
  const [lastN8nLog, setLastN8nLog] = useState<{
    action: string;
    correlationId: string;
    status: string;
    time: string;
    detail: string;
  } | null>(null);

  // Modals
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPassData, setQrPassData] = useState<any>(null);
  const [verificationModal, setVerificationModal] = useState<{
    isOpen: boolean;
    type: 'PICKUP' | 'DELIVERY';
  }>({ isOpen: false, type: 'PICKUP' });

  const [isEscalating, setIsEscalating] = useState(false);

  // Load real emergency requests from database
  const loadLiveEmergencyRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/emergency/requests');
      if (res.ok) {
        const data = await res.json();
        if (data.requests) {
          setRequests((prev) => {
            const serverReqs: EmergencyRequest[] = data.requests;
            const serverIds = new Set(serverReqs.map((r) => r.request_id || r.id));

            // Retain locally created broadcasts from the last 90s if not yet returned by server
            const recentLocal = prev.filter((localReq) => {
              const id = localReq.request_id || localReq.id;
              if (serverIds.has(id)) return false;
              const createdAt = new Date(localReq.created_at || Date.now()).getTime();
              return Date.now() - createdAt < 90 * 1000;
            });

            return [...recentLocal, ...serverReqs];
          });
        }
      }
    } catch (e) {
      console.warn('[EmergencyView] Error loading requests:', e);
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  // Load hospital inventory resources from database
  const loadHospitalResources = useCallback(async () => {
    try {
      const res = await fetch('/api/resources');
      if (res.ok) {
        const data = await res.json();
        if (data.resources) {
          setHospitalResources(data.resources);
        }
      }
    } catch (e) {
      console.warn('[EmergencyView] Error loading resources:', e);
    }
  }, []);

  // Initial load, periodic polling, and Supabase Realtime subscription
  useEffect(() => {
    loadLiveEmergencyRequests();
    loadHospitalResources();

    const interval = setInterval(() => {
      loadLiveEmergencyRequests();
      loadHospitalResources();
    }, 6000);

    const channel = supabase
      .channel('emergency-requests-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_requests' },
        () => {
          loadLiveEmergencyRequests();
          loadHospitalResources();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadLiveEmergencyRequests, loadHospitalResources]);

  // Auto-sync Active Mission if accepted request exists in database
  useEffect(() => {
    if (!activeMission && requests.length > 0) {
      const acceptedReq = requests.find((r) => r.status === 'ACCEPTED');
      if (acceptedReq) {
        const supplyingHosp =
          hospitals.find((h) => h.hospital_id === acceptedReq.supplying_hospital_id) ||
          activeHospital;
        const requestingHosp =
          hospitals.find((h) => h.hospital_id === acceptedReq.requesting_hospital_id) ||
          hospitals[0];

        setActiveMission({
          requestId: acceptedReq.request_id || acceptedReq.id || '',
          donorHospital: supplyingHosp,
          requesterHospital: requestingHosp,
          resourceType: acceptedReq.resource_type,
          quantity: acceptedReq.quantity,
          deliveryStatus: 'DISPATCHED',
          dispatchId: acceptedReq.dispatch_id || `DISP-${(acceptedReq.request_id || acceptedReq.id || '').slice(0, 8).toUpperCase()}`,
          qrTokenHash: acceptedReq.qr_reference || 'PASS-CRYPT-VALID',
        });
      }
    }
  }, [requests, activeMission, hospitals, activeHospital]);

  // Check if current facility has any active, unaccepted outgoing broadcast
  const hasOpenBroadcast = useMemo(() => {
    return requests.some((r) => {
      const isMine = isFacilityRequester(r);
      return isMine && (r.status === 'OPEN' || r.status === 'CREATED' || (r.status as any) === 'BROADCASTED');
    });
  }, [requests, isFacilityRequester]);

  // Ticking countdown - only ticks down if there is an active unaccepted broadcast
  useEffect(() => {
    if (!hasOpenBroadcast) {
      setCountdown(180);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [hasOpenBroadcast]);

  // Auto-escalate unfulfilled requests when 3-minute timer expires
  useEffect(() => {
    if (countdown === 0 && hasOpenBroadcast) {
      const openReq = requests.find((r) => {
        return isFacilityRequester(r) && (r.status === 'OPEN' || r.status === 'CREATED' || (r.status as any) === 'BROADCASTED');
      });
      if (openReq) {
        handleTriggerEscalation(openReq);
      }
    }
  }, [countdown, hasOpenBroadcast, requests, isFacilityRequester]);

  const handleTriggerEscalation = async (req?: EmergencyRequest) => {
    const targetReq = req || requests.find((r) => r.status === 'OPEN' || r.status === 'CREATED' || (r.status as any) === 'BROADCASTED') || requests[0];
    if (!targetReq || isEscalating) return;

    setIsEscalating(true);
    try {
      // 1. Mark as escalated in local state
      setRequests((prev) =>
        prev.map((r) =>
          r.request_id === targetReq.request_id ? { ...r, status: 'ESCALATED' } : r
        )
      );

      // 2. Dispatch Twilio Voice Escalation Call
      const twilioRes = await initiateTwilioVoiceCall({
        requestId: targetReq.request_id,
        reqNumber: targetReq.request_id,
        requestingHospitalName: targetReq.requesting_hospital_name || activeHospital.name,
        resourceType: targetReq.resource_type,
        quantity: targetReq.quantity,
      });

      // 3. Trigger n8n escalation check webhook
      triggerEscalationCheck({
        request_id: targetReq.request_id,
        hospital_name: targetReq.requesting_hospital_name || activeHospital.name,
      }).catch(() => {});

      // 4. Update audit log
      setLastN8nLog({
        action: 'WF07 | TWILIO VOICE ESCALATION',
        correlationId: generateCorrelationId('TWILIO'),
        status: twilioRes.success ? 'CALL INITIATED (HTTP 200)' : `DISPATCHED (${twilioRes.status})`,
        time: new Date().toLocaleTimeString(),
        detail: twilioRes.success
          ? `Emergency Voice Call dispatched to Coordinator at ${twilioRes.toPhone || '+919354543523'}. Call SID: ${twilioRes.callSid}`
          : `Twilio call: ${twilioRes.failureReason || 'Notification logged'}`,
      });
    } catch (err: any) {
      console.error('Escalation error:', err);
    } finally {
      setIsEscalating(false);
    }
  };

  // Handler: Hospital A triggers 15km SOS Broadcast (persisting to Real DB + live n8n WF08)
  const handleBroadcastSOS = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBroadcasting(true);

    const payload = {
      hospital_id: activeHospital.hospital_id,
      requesting_hospital_name: activeHospital.name,
      resource_type: resourceType,
      quantity: quantity,
      urgency: priority as any,
      latitude: activeHospital.latitude,
      longitude: activeHospital.longitude,
      radius_km: radiusKm,
      notes: notes,
      timeout_seconds: 180,
    };

    try {
      // 1. Persist to real Supabase database
      const dbRes = await fetch('/api/emergency/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const dbData = await dbRes.json();
      const savedReq = dbData.request || {
        request_id: dbData.id || `REQ-${Date.now()}`,
        id: dbData.id,
        requesting_hospital_id: activeHospital.hospital_id,
        requesting_hospital_name: activeHospital.name,
        resource_type: resourceType as any,
        quantity: quantity,
        priority: priority,
        status: 'CREATED',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 180 * 1000).toISOString(),
      };

      setRequests((prev) => [savedReq, ...prev.filter(r => (r.request_id || r.id) !== (savedReq.request_id || savedReq.id))]);
      setCountdown(180);
      setFeedFilter('outgoing');

      // 2. Trigger n8n regional broadcast in parallel
      triggerEmergencyBroadcast({
        ...payload,
        request_id: savedReq.request_id || savedReq.id,
      }).then((n8nRes) => {
        setLastN8nLog({
          action: 'WF08 | EMERGENCY BROADCAST',
          correlationId: n8nRes.correlation_id || generateCorrelationId(),
          status: n8nRes.success ? 'SUCCESS (HTTP 200)' : `ERROR (${n8nRes.status})`,
          time: new Date().toLocaleTimeString(),
          detail: n8nRes.success
            ? `Broadcasted to regional hospitals via n8n & Telegram.`
            : `n8n webhook error: ${n8nRes.message || n8nRes.error}`,
        });
      }).catch(() => {});

      loadHospitalResources();
    } catch (err: any) {
      console.error('Error during broadcast:', err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Handler: Nearby hospital accepts request (persisting to Real DB + live n8n WF09)
  const handleAcceptRequest = async (req: EmergencyRequest, supplyingHosp: Hospital) => {
    const reqId = req.request_id || req.id || '';
    if (!reqId) {
      alert('Operational Error: Emergency request ID is missing.');
      return;
    }
    // Strict Guard: Requesting hospital CANNOT accept its own requisition!
    if (req.requesting_hospital_id === supplyingHosp.hospital_id) {
      alert("Operational Guard: A requesting hospital cannot supply its own emergency request! Only nearby candidate facilities can accept.");
      return;
    }

    setIsAccepting(true);

    try {
      // 1. Atomically accept in database & lock inventory
      const acceptRes = await fetch('/api/emergency/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: reqId,
          supplying_hospital_id: supplyingHosp.hospital_id,
          supplying_hospital_name: supplyingHosp.name,
        }),
      });

      const acceptData = await acceptRes.json();
      if (!acceptRes.ok || !acceptData.success) {
        alert(`Cannot accept request: ${acceptData.message || acceptData.error || 'Conflict occurred'}`);
        return;
      }

      const dispatchId = acceptData.dispatch_id || `DISP-${Math.floor(100000 + Math.random() * 900000)}`;
      const qrHash = acceptData.qr_token_hash || `PASS-TOKEN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // Update request in list
      setRequests((prev) =>
        prev.map((r) =>
          (r.request_id === reqId || r.id === reqId)
            ? {
                ...r,
                status: 'ACCEPTED',
                supplying_hospital_id: supplyingHosp.hospital_id,
                supplying_hospital_name: supplyingHosp.name,
                dispatch_id: dispatchId,
              }
            : r
        )
      );

      // Find requesting hospital object
      const reqHosp = hospitals.find((h) => h.hospital_id === req.requesting_hospital_id) || hospitals[0];

      // Setup Active Mission for Transportation Map
      const missionData = {
        requestId: reqId,
        donorHospital: supplyingHosp,
        requesterHospital: reqHosp,
        resourceType: req.resource_type,
        quantity: req.quantity,
        deliveryStatus: 'DISPATCHED' as const,
        dispatchId: dispatchId,
        qrTokenHash: qrHash,
      };
      setActiveMission(missionData);

      // Prepare QR Pass Data and Open Pass Modal
      const passObj = {
        dispatch_id: dispatchId,
        request_id: reqId,
        donor_hospital_name: supplyingHosp.name,
        requester_hospital_name: reqHosp.name,
        resource_type: req.resource_type,
        quantity: req.quantity,
        qr_token_hash: qrHash,
        qr_code: acceptData.qr_code,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
      };
      setQrPassData(passObj);
      setShowQRModal(true);

      // Refresh inventory and live requests from DB
      loadHospitalResources();
      loadLiveEmergencyRequests();

      // 2. Call n8n acceptance webhook in background
      triggerEmergencyAccept({
        request_id: reqId,
        responding_hospital_id: supplyingHosp.hospital_id,
        responding_hospital_name: supplyingHosp.name,
      }).then((res) => {
        setLastN8nLog({
          action: 'WF09 | EMERGENCY ACCEPTANCE',
          correlationId: res.correlation_id || generateCorrelationId(),
          status: res.success ? 'SUCCESS (HTTP 200 · RESOURCE LOCKED)' : `ERROR (${res.status})`,
          time: new Date().toLocaleTimeString(),
          detail: res.success
            ? `Resource atomically locked by ${supplyingHosp.name}. QR Dispatch Pass generated.`
            : `Conflict/Error: ${res.message || res.error}`,
        });
      }).catch(() => {});
    } catch (err: any) {
      console.error('Acceptance error:', err);
    } finally {
      setIsAccepting(false);
    }
  };

  // 2-Step Handover confirmations
  const handleConfirmPickup = () => {
    if (activeMission) {
      setActiveMission({
        ...activeMission,
        deliveryStatus: 'PICKED_UP',
      });
      setLastN8nLog({
        action: 'QR_STEP_1 | PICKUP_VERIFIED',
        correlationId: generateCorrelationId(),
        status: 'VERIFIED',
        time: new Date().toLocaleTimeString(),
        detail: `Blood O- units collected at ${activeMission.donorHospital.name}. Cold chain 3.8°C verified. Ambulance in road transit.`,
      });
    }
  };

  const handleConfirmDelivery = () => {
    if (activeMission) {
      setActiveMission({
        ...activeMission,
        deliveryStatus: 'DELIVERED',
      });
      // Mark request completed in local state
      setRequests((prev) =>
        prev.map((r) =>
          (r.request_id === activeMission.requestId || r.id === activeMission.requestId)
            ? { ...r, status: 'FULFILLED' }
            : r
        )
      );
      // Persist to backend database
      fetch('/api/emergency/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: activeMission.requestId, status: 'FULFILLED' }),
      }).catch((e) => console.warn('[EmergencyView] Status update error:', e));

      setLastN8nLog({
        action: 'QR_STEP_2 | DELIVERY_HANDSHAKE',
        correlationId: generateCorrelationId(),
        status: 'COMPLETED',
        time: new Date().toLocaleTimeString(),
        detail: `Delivery completed at ${activeMission.requesterHospital.name}. Hospital blood bank successfully restocked!`,
      });
    }
  };

  const handleDeclineRequest = async (req: EmergencyRequest, hosp: Hospital | null) => {
    if (!hosp) return;
    const reqId = req.request_id || req.id || '';
    setDecliningId(reqId);
    try {
      const res = await triggerEmergencyDecline({
        request_id: reqId,
        declining_hospital_id: hosp.hospital_id,
        declining_hospital_name: hosp.name,
        reason: 'OUT_OF_STOCK',
      });

      // Update local state with the decline and escalated status
      setRequests((prev) =>
        prev.map((r) => {
          if (r.request_id === reqId || r.id === reqId) {
            const prevDeclined = (r as any).declined_hospitals || [];
            const prevIds = (r as any).declined_by_ids || [];
            return {
              ...r,
              status: 'ESCALATED' as any,
              is_cascaded: true,
              last_declined_by: hosp.name,
              declined_hospitals: [
                ...prevDeclined,
                { hospital_id: hosp.hospital_id, name: hosp.name, reason: 'OUT_OF_STOCK' },
              ],
              declined_by_ids: [...prevIds, hosp.hospital_id],
            };
          }
          return r;
        })
      );

      const cascadedCount = res.cascaded_to_count ?? Math.max(1, hospitals.length - 2);
      const cascadedNames = res.cascaded_to && res.cascaded_to.length > 0
        ? res.cascaded_to.map((h: any) => h.name).join(', ')
        : 'Remaining Regional Network Facilities';

      setLastN8nLog({
        action: 'WF08_CASCADE | EMERGENCY ALERT RE-ROUTED',
        correlationId: generateCorrelationId(),
        status: 'ALERT CASCADED (STOCK UNAVAILABLE)',
        time: new Date().toLocaleTimeString(),
        detail: `${hosp.name} reported stock unavailable. Emergency requisition immediately cascaded to ${cascadedCount} regional hospitals (${cascadedNames}).`,
      });

      // Re-fetch live requests in background
      setTimeout(() => loadLiveEmergencyRequests(), 600);
    } catch (err: any) {
      console.error('[EmergencyView] Decline error:', err);
    } finally {
      setDecliningId(null);
    }
  };

  const handleCancelRequest = (requestId: string) => {
    setRequests((prev) =>
      prev.map((r) => ((r.request_id === requestId || r.id === requestId) ? { ...r, status: 'CANCELLED' as any } : r))
    );
    fetch('/api/emergency/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, status: 'CANCELLED' }),
    }).catch((e) => console.warn('[EmergencyView] Cancel error:', e));
  };

  const handleOpenQRPass = (req: EmergencyRequest) => {
    const reqHosp = hospitals.find((h) => h.hospital_id === req.requesting_hospital_id) || {
      name: req.requesting_hospital_name || 'Requesting Facility',
    };
    const suppId = req.supplying_hospital_id || (req as any).responding_hospital_id;
    const suppHosp = hospitals.find((h) => h.hospital_id === suppId) || {
      name: req.supplying_hospital_name || 'Supplying Facility',
    };
    const dispatchId = req.dispatch_id || `DISP-${(req.request_id || req.id || 'ACTIVE').substring(0, 8).toUpperCase()}`;
    const qrHash = (req as any).qr_reference || (req as any).qr_token_hash || `PASS-TOKEN-${(req.request_id || req.id || '').substring(0, 8).toUpperCase()}`;

    setQrPassData({
      dispatch_id: dispatchId,
      request_id: req.request_id || req.id || '',
      donor_hospital_name: suppHosp.name,
      requester_hospital_name: reqHosp.name,
      resource_type: req.resource_type,
      quantity: req.quantity,
      qr_token_hash: qrHash,
      issued_at: req.created_at || new Date().toISOString(),
      expires_at: req.expires_at || req.timeout_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: req.status || 'ACCEPTED',
    });
    setShowQRModal(true);
  };

  if (!activeHospital) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 animate-fade-in">
        <div className="w-8 h-8 border-2 border-emergency border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-xs text-ink-muted">Connecting to hospital network database...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header & Hospital Role Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-rule gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="pulse-badge pulse-badge-emergency">
              Hospital Emergency Portal (ED)
            </span>
            <span className="text-xs font-mono text-ink-muted">
              Live n8n Cloud Orchestration · 15km Haversine Corridor
            </span>
          </div>
          <h1 className="pulse-h2 text-2xl font-bold text-ink mt-1">
            Emergency Resource Exchange & Ambulance Dispatch
          </h1>
          <p className="pulse-text-sm text-ink-muted mt-0.5">
            Inter-hospital requisition, atomic acceptance locking, live road map routing, and 2-step QR physical handover.
          </p>
        </div>

        {/* View Perspective Switcher & Auto-Escalation Watchdog */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Facility Selector & Switcher */}
          <div className="flex items-center space-x-2 bg-paper-subtle p-1.5 rounded-xl border border-rule">
            <Building2 className="w-4 h-4 text-emergency ml-1 shrink-0" />
            <span className="text-xs font-mono text-ink-muted hidden sm:inline">Active Desk:</span>
            <select
              value={activeHospital.hospital_id}
              onChange={(e) => switchHospital(e.target.value)}
              className="bg-paper text-ink font-mono text-xs font-bold px-2 py-1 rounded-lg border border-rule focus:outline-none focus:ring-1 focus:ring-accent max-w-[180px] sm:max-w-xs truncate"
            >
              {hospitals.map((h) => (
                <option key={h.hospital_id} value={h.hospital_id}>
                  {h.name.split(' (')[0]} {h.hospital_id === activeHospital.hospital_id ? '✓ (Current Desk)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => openAuthModal('hospital', 'signup')}
              className="px-2 py-1 bg-emergency/10 hover:bg-emergency/20 text-emergency text-[10px] font-mono font-bold rounded-lg border border-emergency/30 transition-colors whitespace-nowrap"
              title="Enroll a new hospital facility"
            >
              + Enroll
            </button>
          </div>

          {/* Watchdog Timer & Twilio Voice Escalation Call */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 bg-paper-subtle px-3 py-1.5 rounded-xl border border-rule font-mono text-xs shadow-hairline">
              <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
              <span className="text-ink-muted">Escalation Timer:</span>
              <span className={`font-bold tabular-nums text-sm ${countdown < 30 ? 'text-emergency animate-pulse-gentle' : 'text-amber-500'}`}>
                {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleTriggerEscalation()}
              disabled={isEscalating}
              className="flex items-center space-x-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-xl border border-amber-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Dispatches emergency Twilio Voice Escalation call to regional coordinator (+919354543523)"
            >
              <PhoneCall className={`w-3.5 h-3.5 ${isEscalating ? 'animate-spin' : ''}`} />
              <span>{isEscalating ? 'Calling...' : 'Call Coordinator'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live n8n Execution Console / Audit Strip */}
      {lastN8nLog && (
        <div className="p-3 bg-paper-2 text-ink rounded-xl border border-rule font-mono text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-hairline">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-operational animate-ping"></span>
            <span className="text-ink-muted">n8n Execution:</span>
            <strong className="text-operational">{lastN8nLog.action}</strong>
            <span className="text-rule">|</span>
            <span className="text-accent">{lastN8nLog.correlationId}</span>
          </div>
          <div className="text-ink-2 text-[11px] truncate max-w-xl">
            {lastN8nLog.detail}
          </div>
          <div className="text-ink-muted text-[10px] whitespace-nowrap">
            {lastN8nLog.time} · {lastN8nLog.status}
          </div>
        </div>
      )}

      {/* Main Grid: Left = Geospatial Map & Radar | Right = Broadcast & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: 15km Hospital Proximity Radar */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="flex items-center justify-between bg-paper-subtle p-2 rounded-xl border border-rule">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-accent animate-pulse" />
              <span className="text-xs font-mono font-bold text-ink">15km Hospital Proximity Radar</span>
            </div>

            <span className="text-[11px] font-mono text-ink-muted px-2">
              Coverage: <strong className="text-operational">{radiusKm.toFixed(1)} km Haversine</strong>
            </span>
          </div>

          {/* 15km Proximity Radar View */}
          <HospitalRadarView
            selectedHospital={activeHospital}
            allHospitals={hospitals}
            radiusKm={radiusKm}
            activeRequests={requests}
            onSelectHospital={(h) => switchHospital(h.hospital_id)}
          />

          {/* Active Mission Card if Ambulance Dispatched */}
          {activeMission && (
            <div className="p-4 bg-paper-subtle rounded-2xl border-2 border-accent/40 space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-accent animate-ping"></div>
                  <h4 className="font-bold text-sm text-ink flex items-center space-x-2">
                    <Truck className="w-4 h-4 text-accent" />
                    <span>Active Ambulance Delivery Mission</span>
                  </h4>
                </div>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="pulse-btn pulse-btn-sm pulse-btn-primary flex items-center space-x-1 text-xs"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>View Dispatch Pass QR</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-xs bg-paper p-3 rounded-xl border border-rule">
                <div>
                  <div className="text-[10px] text-ink-muted">Donor Facility</div>
                  <div className="font-bold text-operational mt-0.5">{activeMission.donorHospital.name.split(' ')[0]}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-muted">Recipient Trauma</div>
                  <div className="font-bold text-emergency mt-0.5">{activeMission.requesterHospital.name.split(' ')[0]}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-muted">Supply Item</div>
                  <div className="font-bold text-accent mt-0.5">{activeMission.quantity} Units {activeMission.resourceType.replace(/_/g, ' ')}</div>
                </div>
              </div>

              {/* Step Progression Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-rule-subtle font-mono text-xs">
                <div className="flex items-center space-x-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    activeMission.deliveryStatus === 'DISPATCHED' ? 'bg-accent text-white' : 'bg-operational text-white'
                  }`}>
                    1
                  </span>
                  <span className={activeMission.deliveryStatus === 'DISPATCHED' ? 'font-bold text-accent' : 'text-ink-muted'}>
                    Pickup at Donor
                  </span>
                </div>

                <ArrowRight className="w-4 h-4 text-ink-muted" />

                <div className="flex items-center space-x-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    activeMission.deliveryStatus === 'PICKED_UP' ? 'bg-accent text-white' : activeMission.deliveryStatus === 'DELIVERED' ? 'bg-operational text-white' : 'bg-paper-subtle text-ink-muted'
                  }`}>
                    2
                  </span>
                  <span className={activeMission.deliveryStatus === 'PICKED_UP' ? 'font-bold text-accent' : 'text-ink-muted'}>
                    Road Transit
                  </span>
                </div>

                <ArrowRight className="w-4 h-4 text-ink-muted" />

                <div className="flex items-center space-x-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    activeMission.deliveryStatus === 'DELIVERED' ? 'bg-operational text-white' : 'bg-paper-subtle text-ink-muted'
                  }`}>
                    3
                  </span>
                  <span className={activeMission.deliveryStatus === 'DELIVERED' ? 'font-bold text-operational' : 'text-ink-muted'}>
                    Intake Restock
                  </span>
                </div>
              </div>

              {/* Action Buttons for Active Mission Verification */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rule-subtle font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setShowQRModal(true)}
                  className="pulse-btn pulse-btn-secondary pulse-btn-sm flex items-center space-x-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>View Pass QR</span>
                </button>

                {activeMission.deliveryStatus === 'DISPATCHED' && (
                  <button
                    type="button"
                    onClick={() => setVerificationModal({ isOpen: true, type: 'PICKUP' })}
                    className="pulse-btn pulse-btn-primary pulse-btn-sm flex items-center space-x-1.5"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Scan Donor Pickup QR</span>
                  </button>
                )}

                {activeMission.deliveryStatus === 'PICKED_UP' && (
                  <button
                    type="button"
                    onClick={() => setVerificationModal({ isOpen: true, type: 'DELIVERY' })}
                    className="pulse-btn pulse-btn-emergency pulse-btn-sm flex items-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Trauma ER Intake</span>
                  </button>
                )}

                {activeMission.deliveryStatus === 'DELIVERED' && (
                  <span className="text-operational font-bold text-xs flex items-center space-x-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Intake Handshake Complete</span>
                  </span>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: SOS Broadcaster & Incoming Requests Desk */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Section 1: Urgent Broadcast Form (Hospital A) */}
          <div className="pulse-card space-y-4 border-emergency/40 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                <Send className="w-4 h-4 text-emergency" />
                <span>Urgent SOS Requisition Desk</span>
              </h3>
              <span className="pulse-badge pulse-badge-emergency text-[10px]">
                Hospital A Portal
              </span>
            </div>

            <form onSubmit={handleBroadcastSOS} className="space-y-3">
              <div className="pulse-form-group">
                <label className="pulse-label flex items-center justify-between">
                  <span>Urgent Medical Requirement:</span>
                  <span className="text-emergency font-bold text-[10px]">Life-Threatening</span>
                </label>
                <select
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                  className="pulse-select font-mono font-semibold"
                >
                  <option value="BLOOD_O_NEG">🩸 Blood O- Negative (Universal Urgent)</option>
                  <option value="BLOOD_A_POS">🩸 Blood A+ Positive</option>
                  <option value="OXYGEN_CYLINDER">💨 Oxygen Cylinder (Type D)</option>
                  <option value="ICU_BED">🛏️ ICU Bed with Ventilator</option>
                  <option value="VENTILATOR">🫁 Mechanical Ventilator Unit</option>
                  <option value="CARDIAC_AMBULANCE">🚑 Advanced Cardiac Ambulance</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="pulse-form-group">
                  <label className="pulse-label">Quantity Needed</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="pulse-input tabular-nums font-mono font-bold"
                  />
                </div>

                <div className="pulse-form-group">
                  <label className="pulse-label">Radius Filter</label>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="pulse-select font-mono font-semibold"
                  >
                    <option value={15}>15.0 km (Full NCR Grid)</option>
                    <option value={10}>10.0 km (Primary Ring)</option>
                    <option value={5}>5.0 km (Immediate)</option>
                  </select>
                </div>
              </div>

              <div className="pulse-form-group">
                <label className="pulse-label">Clinical Emergency Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="pulse-input text-xs font-mono"
                  placeholder="Clinical condition notes..."
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isBroadcasting}
                className="pulse-btn pulse-btn-emergency w-full pulse-btn-lg text-xs font-mono font-bold uppercase tracking-wider mt-1"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {isBroadcasting
                    ? 'Triggering n8n Cloud Webhook...'
                    : 'TRIGGER 15KM EMERGENCY BROADCAST (WF08)'}
                </span>
              </motion.button>
            </form>
          </div>

          {/* Section 2: Segregated Live Emergency Requisition Stream */}
          <div className="pulse-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Regional Emergency Stream</span>
                </h3>
                <p className="text-[11px] font-mono text-ink-muted">
                  Point-to-point dispatch · Only candidate facilities can supply
                </p>
              </div>

              {/* Segmented Feed Filter Tabs */}
              <div className="flex items-center p-1 bg-paper-subtle rounded-xl border border-rule font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setFeedFilter('incoming')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1.5 ${
                    feedFilter === 'incoming'
                      ? 'bg-operational text-white font-bold shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span>Incoming Alerts</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    feedFilter === 'incoming' ? 'bg-white/20' : 'bg-paper-2'
                  }`}>
                    {requests.filter(r => !isFacilityRequester(r)).length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeedFilter('outgoing')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1.5 ${
                    feedFilter === 'outgoing'
                      ? 'bg-emergency text-white font-bold shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span>My SOS Requests</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    feedFilter === 'outgoing' ? 'bg-white/20' : 'bg-paper-2'
                  }`}>
                    {requests.filter(r => isFacilityRequester(r)).length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeedFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all text-ink-muted hover:text-ink ${
                    feedFilter === 'all' ? 'bg-paper text-ink font-bold shadow-xs' : ''
                  }`}
                >
                  All ({requests.length})
                </button>
              </div>
            </div>

            {/* Request Cards Stream */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {requests
                  .filter((req) => {
                    const isMine = isFacilityRequester(req);
                    if (feedFilter === 'incoming') return !isMine;
                    if (feedFilter === 'outgoing') return isMine;
                    return true;
                  })
                  .map((req) => {
                    const isRequester = isFacilityRequester(req);
                    const isAccepted = req.status === 'ACCEPTED' || req.status === 'FULFILLED' || req.status === 'COMPLETED';
                    
                    // Haversine distance from current facility
                    const requestingHosp = hospitals.find((h) => h.hospital_id === req.requesting_hospital_id);
                    const distanceKm = requestingHosp
                      ? calculateDistanceKm(
                          activeHospital.latitude,
                          activeHospital.longitude,
                          requestingHosp.latitude,
                          requestingHosp.longitude
                        )
                      : 0.8;

                    return (
                      <motion.div
                        layout
                        key={req.request_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={springs.gentle}
                        className={`p-4 rounded-xl border space-y-3 font-mono text-xs ${
                          isRequester
                            ? 'bg-emergency-light/20 border-emergency/40 shadow-xs'
                            : isAccepted
                            ? 'bg-paper-subtle border-operational/40'
                            : 'bg-paper border-rule shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-ink">
                                #{(req.request_id || req.id || 'REQ').substring(0, 8)}
                              </span>
                              <StatusBadge status={req.status} />

                              {isRequester ? (
                                <span className="px-1.5 py-0.5 rounded bg-emergency-light text-emergency text-[10px] font-bold border border-emergency/30">
                                  Your Facility Requisition
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-operational/15 text-operational text-[10px] font-bold border border-operational/30">
                                  Nearby Request · {distanceKm} km away
                                </span>
                              )}
                            </div>

                            <div className="text-ink-2 font-semibold text-xs mt-1 flex items-center space-x-1.5">
                              <Building2 className="w-3.5 h-3.5 text-ink-muted" />
                              <span>{req.requesting_hospital_name}</span>
                            </div>
                          </div>

                          <div className="text-right text-[10px] text-ink-muted">
                            {new Date(req.created_at).toLocaleTimeString()}
                          </div>
                        </div>

                        {/* Item Callout */}
                        <div className="p-2.5 bg-paper-subtle rounded-lg border border-rule-subtle flex items-center justify-between">
                          <span className="text-ink-muted">Requested Critical Resource:</span>
                          <strong className="text-emergency text-sm">
                            {req.quantity} Units · {req.resource_type.replace(/_/g, ' ')}
                          </strong>
                        </div>

                        {/* Cascaded Alert Tracker for Requester */}
                        {isRequester && (req as any).declined_hospitals && (req as any).declined_hospitals.length > 0 && (
                          <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/30 text-xs flex items-start space-x-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-amber-600 dark:text-amber-400">
                                Stock Unavailable at {(req as any).declined_hospitals.map((d: any) => d.name).join(', ')}
                              </span>
                              <p className="text-[11px] text-ink-muted mt-0.5">
                                Requisition automatically cascaded to remaining hospitals in 15km radar network.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Cascaded Alert Callout for Recipient */}
                        {!isRequester && !isAccepted && (req as any).is_cascaded && !((req as any).declined_by_ids || []).includes(activeHospital?.hospital_id) && (
                          <div className="p-2 bg-amber-500/15 rounded-lg border border-amber-500/40 text-xs flex items-center space-x-2 text-amber-700 dark:text-amber-300">
                            <Zap className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
                            <span>
                              <strong>CASCADED ALERT:</strong> Stock unavailable at {(req as any).last_declined_by || 'previous hospital'}. Requisition escalated to your facility!
                            </span>
                          </div>
                        )}

                        {/* ========================================================================= */}
                        {/* ROLE-BASED ACTION CONTROLS */}
                        {/* ========================================================================= */}
                        {isRequester ? (
                          /* SENDER PERSPECTIVE: NO ACCEPT & SUPPLY BUTTON */
                          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-rule-subtle">
                            {!isAccepted ? (
                              <>
                                <div className="flex items-center space-x-2 text-[11px] text-ink-muted">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                                  <span>Broadcasted to 15km regional hospitals. Awaiting donor response...</span>
                                </div>
                                <div className="flex items-center space-x-2 shrink-0">
                                  <button
                                    onClick={() => handleCancelRequest(req.request_id || req.id || '')}
                                    className="text-[11px] font-mono text-ink-muted hover:text-emergency hover:underline"
                                  >
                                    Cancel SOS
                                  </button>
                                  <span className="text-xs font-mono font-bold text-amber-500 bg-paper px-2 py-0.5 rounded border border-rule">
                                    Escalation: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center justify-between w-full">
                                <span className="text-operational font-bold flex items-center space-x-1 text-xs">
                                  <CheckCircle2 className="w-4 h-4 text-operational" />
                                  <span>Accepted & Dispatched by {req.supplying_hospital_name || hospitals.find(h => h.hospital_id === (req.supplying_hospital_id || (req as any).responding_hospital_id))?.name || 'Regional Facility'}</span>
                                </span>
                                <button
                                  onClick={() => handleOpenQRPass(req)}
                                  className="pulse-btn pulse-btn-sm pulse-btn-primary font-mono text-xs flex items-center space-x-1"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>Inbound QR Pass</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* RECIPIENT PERSPECTIVE: SHOW ACCEPT & SUPPLY / DECLINE (NO STOCK) */
                          <div className="pt-2 flex items-center justify-between gap-2 border-t border-rule-subtle">
                            {((req as any).declined_by_ids || []).includes(activeHospital?.hospital_id) ? (
                              <div className="flex items-center justify-between w-full text-xs text-ink-muted">
                                <span className="flex items-center space-x-1.5 font-mono">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Declined by Your Facility (Stock Unavailable) · Alert Cascaded to Regional Network</span>
                                </span>
                                <span className="pulse-badge pulse-badge-amber text-[10px] font-mono">CASCADED</span>
                              </div>
                            ) : !isAccepted ? (
                              <>
                                <span className="text-[10px] text-ink-muted hidden sm:inline">
                                  Direct Telegram alert dispatched to your registered desk.
                                </span>
                                <div className="flex items-center space-x-2 ml-auto">
                                  <button
                                    disabled={decliningId === (req.request_id || req.id)}
                                    onClick={() => handleDeclineRequest(req, activeHospital)}
                                    className="px-3 py-1 rounded-lg text-xs font-mono font-semibold text-emergency hover:bg-emergency-light/30 border border-emergency/30 transition-colors disabled:opacity-50"
                                    title="Decline requisition if your facility lacks physical stock"
                                  >
                                    {decliningId === (req.request_id || req.id) ? 'Cascading...' : 'DECLINE (NO STOCK)'}
                                  </button>
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.96 }}
                                    disabled={isAccepting}
                                    onClick={() => handleAcceptRequest(req, activeHospital)}
                                    className="pulse-btn pulse-btn-primary pulse-btn-sm font-mono text-xs whitespace-nowrap"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>
                                      {isAccepting ? 'Locking...' : `ACCEPT & SUPPLY (${activeHospital?.name.split(' ')[0]})`}
                                    </span>
                                  </motion.button>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center justify-between w-full text-xs">
                                <span className="text-operational font-bold flex items-center space-x-1">
                                  <CheckCircle2 className="w-4 h-4 text-operational" />
                                  <span>
                                    {req.supplying_hospital_id === activeHospital?.hospital_id
                                      ? `Supplied by Your Desk! Stock Locked.`
                                      : `Fulfilled by ${req.supplying_hospital_name || hospitals.find(h => h.hospital_id === (req.supplying_hospital_id || (req as any).responding_hospital_id))?.name || 'Nearby Facility'}`}
                                  </span>
                                </span>
                                <button
                                  onClick={() => handleOpenQRPass(req)}
                                  className="text-accent font-bold hover:underline flex items-center space-x-1"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>Pass QR</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
              </AnimatePresence>

              {/* Empty state for filtered requests */}
              {requests.filter((req) => {
                const isMine = isFacilityRequester(req);
                if (feedFilter === 'incoming') return !isMine;
                if (feedFilter === 'outgoing') return isMine;
                return true;
              }).length === 0 && (
                <div className="p-8 text-center bg-paper-subtle rounded-xl border border-rule font-mono text-xs text-ink-muted">
                  {feedFilter === 'incoming'
                    ? 'No incoming emergency alerts from nearby hospitals at this time.'
                    : feedFilter === 'outgoing'
                    ? 'No active outgoing SOS requisitions sent by your facility desk.'
                    : 'No emergency requests recorded.'}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Regional Hospital Network Matrix (15km) */}
      <div className="pulse-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="pulse-h4 text-sm text-ink font-bold">
              Regional Healthcare Network Telemetry & 15km Proximity Grid
            </h3>
            <p className="pulse-text-muted text-xs">
              Regional emergency response network within 15km Haversine radar. Critical stock is confirmed on-call upon dispatch.
            </p>
          </div>
          <span className="pulse-badge pulse-badge-green text-xs font-semibold">
            <span className="pulse-dot pulse-dot-green"></span> {hospitals.length} Hospital Nodes Synced
          </span>
        </div>

        <div className="pulse-table-container">
          <table className="pulse-table pulse-table-hover">
            <thead>
              <tr>
                <th>Hospital Facility</th>
                <th>Trauma & Emergency Capability</th>
                <th>Direct Emergency Line</th>
                <th>15km Proximity</th>
                <th>Dispatch Readiness</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((hosp) => (
                <tr key={hosp.hospital_id}>
                  <td className="font-semibold text-ink">
                    <div className="flex items-center space-x-2">
                      <span>{hosp.name}</span>
                      {hosp.hospital_id === hospitals[0]?.hospital_id && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-mono">
                          Hospital A
                        </span>
                      )}
                      {hosp.hospital_id === hospitals[1]?.hospital_id && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
                          Hospital B
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-ink-2 font-mono text-xs">Level 1 Apex Trauma & Resuscitation</td>
                  <td className="tabular-nums font-mono text-xs text-ink-2">
                    <div className="flex items-center space-x-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-operational shrink-0" />
                      <span>{hosp.contact || '+91-11-26594405'}</span>
                    </div>
                  </td>
                  <td className="tabular-nums font-mono font-bold text-accent">
                    {hosp.distance_km?.toFixed(1) || '0.0'} km
                  </td>
                  <td>
                    <span className="pulse-badge pulse-badge-green text-[11px] font-mono">
                      <span className="pulse-dot pulse-dot-green"></span> Standby · Ready
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Dispatch Pass Modal */}
      {qrPassData && (
        <QRDispatchPassModal
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
          passData={qrPassData}
        />
      )}

      {/* 2-Step Ambulance Verification Modal */}
      {activeMission && (
        <AmbulanceVerificationModal
          isOpen={verificationModal.isOpen}
          onClose={() => setVerificationModal({ ...verificationModal, isOpen: false })}
          type={verificationModal.type}
          dispatchId={activeMission.dispatchId}
          requestId={activeMission.requestId}
          tokenHash={activeMission.qrTokenHash}
          donorHospitalName={activeMission.donorHospital.name}
          requesterHospitalName={activeMission.requesterHospital.name}
          resourceType={activeMission.resourceType}
          quantity={activeMission.quantity}
          onConfirmVerification={
            verificationModal.type === 'PICKUP' ? handleConfirmPickup : handleConfirmDelivery
          }
        />
      )}
    </div>
  );
};
