import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Hospital, EmergencyRequest } from '../types';
import { calculateDistanceKm } from '../lib/haversine';
import {
  Truck,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Navigation,
  Clock,
  Thermometer,
  Radio,
  Layers,
  FastForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Compass,
  CheckCircle2,
  Package,
} from 'lucide-react';

interface TransportationMapProps {
  requesterHospital: Hospital;
  donorHospital?: Hospital | null;
  allHospitals: Hospital[];
  activeRequest?: EmergencyRequest | null;
  deliveryStatus?: 'PENDING' | 'DISPATCHED' | 'PICKED_UP' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED' | 'FULFILLED';
  onVerifyPickup?: () => void;
  onVerifyDelivery?: () => void;
  onOrderArrived?: () => void;
  className?: string;
  hideControls?: boolean;
}

// Map Tile Themes
type MapTheme = 'dark' | 'light' | 'osm';
const TILE_LAYERS: Record<MapTheme, { name: string; url: string; attribution: string }> = {
  dark: {
    name: 'Dark Ops Radar',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap',
  },
  light: {
    name: 'Clinical Crisp',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap',
  },
  osm: {
    name: 'Street Navigation',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
};

// Calculate direction heading (bearing) between two lat/lng points
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// Generate creative 3D-styled vehicle marker with strobe lights, headlight beam, and floating cargo hologram
const createCreativeAmbulanceIcon = (
  speed: number,
  bearing: number,
  cargoLabel: string,
  cargoEmoji: string,
  cargoTemp: number,
  isArrived: boolean = false
) => {
  const displaySpeed = isArrived ? 0 : speed;
  const badgeBorder = isArrived ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.8)]' : 'border-red-600 shadow-[0_0_20px_rgba(239,68,68,0.6)]';
  const tagBg = isArrived ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white';
  const tagText = isArrived ? 'ARRIVED · 0 KM/H' : `${displaySpeed} KM/H`;
  const holoBorder = isArrived ? 'border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.7)]' : 'border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.5)]';
  const holoTitle = isArrived ? 'ARRIVED · AT RECIPIENT ER' : cargoLabel;
  const holoSubtitle = isArrived
    ? `COLD CHAIN ${cargoTemp}°C · HANDOVER READY`
    : `COLD CHAIN ${cargoTemp}°C · ${displaySpeed} KM/H`;

  return L.divIcon({
    className: 'creative-ambulance-container',
    html: `
      <div style="transform: translate(-50%, -50%);" class="relative flex items-center justify-center select-none pointer-events-auto">
        
        <!-- Floating 3D Cargo Hologram Pod (Pinned Above Vehicle) -->
        <div style="transform: translate(-50%, -100%) translateY(-26px);" class="absolute left-1/2 top-0 pointer-events-none z-30 animate-hologram-float">
          <div class="flex flex-col items-center">
            <div class="px-2.5 py-1 rounded-xl bg-slate-950/90 text-white border ${holoBorder} backdrop-blur-md flex items-center space-x-2 text-[10px] font-mono whitespace-nowrap">
              <span class="text-sm leading-none">${isArrived ? '✅' : cargoEmoji}</span>
              <div class="flex flex-col">
                <span class="font-bold ${isArrived ? 'text-emerald-300' : 'text-cyan-300'} tracking-wider">${holoTitle}</span>
                <span class="text-[8px] text-emerald-400 font-bold flex items-center space-x-1">
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 ${isArrived ? 'animate-pulse' : 'animate-ping'} mr-1"></span>
                  ${holoSubtitle}
                </span>
              </div>
            </div>
            <!-- Hologram emitter triangle pin -->
            <div class="w-2 h-2 ${isArrived ? 'bg-emerald-400/80' : 'bg-cyan-400/80'} rotate-45 -mt-1 shadow-sm"></div>
          </div>
        </div>

        <!-- Dynamic Headlight Projection Beam (Rotated according to bearing) -->
        <div style="transform: rotate(${bearing}deg); transform-origin: center center;" class="absolute pointer-events-none w-28 h-28 flex items-center justify-center z-0">
          <div style="clip-path: polygon(50% 50%, 20% 0%, 80% 0%);" class="w-full h-full bg-gradient-to-t ${isArrived ? 'from-emerald-300/30 via-emerald-200/15' : 'from-yellow-300/30 via-yellow-200/15'} to-transparent blur-[1px]"></div>
        </div>

        <!-- Vehicle Body & Dual Strobe Beacon -->
        <div class="relative w-11 h-11 rounded-2xl bg-white border-2 ${badgeBorder} flex items-center justify-center z-10 transition-all">
          <!-- Dual Emergency Strobes -->
          <div class="absolute -top-1 left-2 w-2 h-2 rounded-full ${isArrived ? 'bg-emerald-500 animate-ping' : 'bg-red-500 animate-strobe-red'}"></div>
          <div class="absolute -top-1 right-2 w-2 h-2 rounded-full ${isArrived ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400 animate-strobe-blue'}"></div>

          <!-- Ambulance Center Graphic -->
          <svg class="w-6 h-6 ${isArrived ? 'text-emerald-600' : 'text-red-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 11h3m-1.5-1.5v3" />
          </svg>
        </div>

        <!-- Speed readout under vehicle -->
        <div class="absolute -bottom-4 px-1.5 py-0.2 rounded ${tagBg} font-mono font-black text-[8px] whitespace-nowrap shadow-md tracking-wider">
          ${tagText}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
};

// Custom Hospital Pin Icon Generator
const createCreativeHospitalIcon = (
  name: string,
  isRequester: boolean,
  isDonor: boolean,
  hasStock: boolean,
  isArrived: boolean = false
) => {
  const roleLabel = isRequester
    ? (isArrived ? 'Trauma ER (Order Arrived!)' : 'Trauma ER (Intake)')
    : isDonor
    ? 'Donor Hub (Stock Origin)'
    : 'Partner Facility';

  const badgeBg = isRequester
    ? (isArrived ? 'bg-emerald-600 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'bg-red-600 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]')
    : isDonor
    ? 'bg-emerald-600 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
    : 'bg-blue-600 border-blue-500';

  const haloRing = isRequester
    ? (isArrived ? 'border-emerald-400/90 animate-ping ring-4 ring-emerald-400/50' : 'border-red-500/40 animate-ping')
    : isDonor
    ? 'border-emerald-500/40 animate-pulse'
    : 'border-blue-500/20';

  return L.divIcon({
    className: 'custom-hospital-marker',
    html: `
      <div style="transform: translate(-50%, -100%);" class="flex flex-col items-center select-none">
        <div class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-white/95 text-slate-900 border ${isArrived ? 'border-emerald-400' : 'border-slate-300'} shadow-lg whitespace-nowrap mb-1 flex items-center space-x-1 backdrop-blur-sm">
          <span class="w-1.5 h-1.5 rounded-full ${isRequester ? (isArrived ? 'bg-emerald-600 animate-ping' : 'bg-red-600 animate-ping') : isDonor ? 'bg-emerald-600' : 'bg-blue-600'}"></span>
          <span>${name.split(' ')[0]}</span>
          <span class="${isRequester ? (isArrived ? 'text-emerald-600 font-black' : 'text-red-600') : isDonor ? 'text-emerald-600' : 'text-blue-600'}">(${roleLabel})</span>
        </div>

        <div class="relative w-8 h-8 rounded-full ${badgeBg} border-2 text-white flex items-center justify-center shadow-xl">
          <div class="absolute -inset-1 rounded-full border-2 ${haloRing} pointer-events-none"></div>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div class="w-1.5 h-1.5 bg-white border-r border-b border-slate-300 rotate-45 -mt-1"></div>
      </div>
    `,
    iconSize: [36, 52],
    iconAnchor: [18, 52],
  });
};

// Auto-Center & Camera Tracking Component
function MapCameraController({
  bounds,
  vehicleCoord,
  followVehicle,
}: {
  bounds: L.LatLngBoundsExpression;
  vehicleCoord?: [number, number];
  followVehicle: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (!followVehicle && bounds && Array.isArray(bounds) && bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [55, 55], maxZoom: 14 });
      } catch {}
    }
  }, [bounds, map, followVehicle]);

  useEffect(() => {
    if (followVehicle && vehicleCoord) {
      map.panTo(vehicleCoord, { animate: true, duration: 0.8 });
    }
  }, [followVehicle, vehicleCoord, map]);

  return null;
}

export const TransportationMap: React.FC<TransportationMapProps> = ({
  requesterHospital,
  donorHospital,
  allHospitals = [],
  activeRequest,
  deliveryStatus = 'PENDING',
  onVerifyPickup,
  onVerifyDelivery,
  onOrderArrived,
  className = '',
  hideControls = false,
}) => {
  // Map Customization State
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');
  const [simSpeed, setSimSpeed] = useState<1 | 3 | 8>(1);
  const [followVehicle, setFollowVehicle] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);

  // Fallback safe requester
  const safeRequester: Hospital = useMemo(() => {
    if (requesterHospital && typeof requesterHospital.latitude === 'number' && typeof requesterHospital.longitude === 'number') {
      return requesterHospital;
    }
    const candidate = allHospitals && allHospitals[0];
    if (candidate && typeof candidate.latitude === 'number') {
      return candidate;
    }
    return {
      hospital_id: 'default-aiims',
      name: 'All India Institute of Medical Sciences (AIIMS) New Delhi',
      latitude: 28.5672,
      longitude: 77.2100,
      contact: '+91-11-26588500',
      telegram_chat_id: '6537122486',
      active_status: true,
      supported_resources: ['O_NEG_BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'AMBULANCE'],
      distance_km: 0,
    };
  }, [requesterHospital, allHospitals]);

  // Coordinate Safeguard:
  const safeDonor: Hospital | null = useMemo(() => {
    if (!donorHospital) return null;
    const rawDist = calculateDistanceKm(
      donorHospital.latitude,
      donorHospital.longitude,
      safeRequester.latitude,
      safeRequester.longitude
    );

    if (rawDist < 0.25) {
      const isYashoda =
        donorHospital.name.toLowerCase().includes('yashoda') ||
        donorHospital.name.toLowerCase().includes('yahoda');

      return {
        ...donorHospital,
        latitude: isYashoda ? 28.6369 : safeRequester.latitude + 0.052,
        longitude: isYashoda ? 77.3195 : safeRequester.longitude + 0.064,
      };
    }
    return donorHospital;
  }, [donorHospital, safeRequester]);

  // Determine stock payload information
  const resourceLabel = useMemo(() => {
    const raw = activeRequest?.resource_type || 'BLOOD_O_NEG';
    if (raw.includes('BLOOD')) return 'O- Blood Units';
    if (raw.includes('OXYGEN')) return 'Oxygen Cylinders';
    if (raw.includes('VENTILATOR')) return 'Mobile Ventilator';
    if (raw.includes('ICU')) return 'ICU Trauma Bed';
    return raw.replace(/_/g, ' ');
  }, [activeRequest?.resource_type]);

  const stockQuantity = activeRequest?.quantity || 4;
  const stockEmoji = useMemo(() => {
    const raw = activeRequest?.resource_type || 'BLOOD_O_NEG';
    if (raw.includes('BLOOD')) return '🩸';
    if (raw.includes('OXYGEN')) return '💨';
    if (raw.includes('MEDICINE') || raw.includes('ANTIDOTE')) return '💊';
    return '📦';
  }, [activeRequest?.resource_type]);

  // Generate multi-waypoint road corridor between Donor and Requester
  const routeWaypoints: [number, number][] = useMemo(() => {
    if (!safeDonor) return [];

    const startLat = safeDonor.latitude;
    const startLng = safeDonor.longitude;
    const endLat = safeRequester.latitude;
    const endLng = safeRequester.longitude;

    const points: [number, number][] = [];
    const totalSteps = 30; // High resolution route

    for (let i = 0; i <= totalSteps; i++) {
      const t = i / totalSteps;
      const curve1 = Math.sin(t * Math.PI) * 0.0035;
      const curve2 = Math.sin(t * 2 * Math.PI) * 0.0018;
      const lat = startLat + (endLat - startLat) * t + curve1;
      const lng = startLng + (endLng - startLng) * t - curve2;
      points.push([lat, lng]);
    }
    return points;
  }, [safeDonor, safeRequester]);

  // Live Vehicle Position & Telemetry State
  const [progressIndex, setProgressIndex] = useState(0);
  const [ambulanceSpeed, setAmbulanceSpeed] = useState(58);
  const [cargoTemp, setCargoTemp] = useState(3.8);

  const totalDistanceKm = useMemo(() => {
    if (!safeDonor) return 0;
    return calculateDistanceKm(
      safeDonor.latitude,
      safeDonor.longitude,
      safeRequester.latitude,
      safeRequester.longitude
    );
  }, [safeDonor, safeRequester]);

  // Vehicle Arrived state calculation
  const isVehicleArrived = Boolean(
    safeDonor &&
    routeWaypoints.length > 0 &&
    (progressIndex >= routeWaypoints.length - 1 ||
      deliveryStatus === 'ARRIVED' ||
      deliveryStatus === 'DELIVERED' ||
      deliveryStatus === 'FULFILLED') &&
    deliveryStatus !== 'PENDING'
  );

  const hasNotifiedArrived = useRef(false);
  useEffect(() => {
    if (isVehicleArrived && !hasNotifiedArrived.current) {
      hasNotifiedArrived.current = true;
      setAmbulanceSpeed(0);
      onOrderArrived?.();
    } else if (!isVehicleArrived) {
      hasNotifiedArrived.current = false;
    }
  }, [isVehicleArrived, onOrderArrived]);

  // Reset progress when donor or status changes
  useEffect(() => {
    if (deliveryStatus === 'DELIVERED' || deliveryStatus === 'ARRIVED' || deliveryStatus === 'FULFILLED') {
      if (routeWaypoints.length > 0) {
        setProgressIndex(routeWaypoints.length - 1);
        setAmbulanceSpeed(0);
      }
    } else if (deliveryStatus === 'DISPATCHED' || deliveryStatus === 'PICKED_UP') {
      // Start moving along route
      if (progressIndex === 0) {
        setProgressIndex(1);
      }
    } else if (deliveryStatus === 'PENDING') {
      setProgressIndex(0);
    }
  }, [deliveryStatus, routeWaypoints.length]);

  // Animation ticker for vehicle along route
  useEffect(() => {
    if (!safeDonor || deliveryStatus === 'PENDING' || deliveryStatus === 'DELIVERED' || deliveryStatus === 'ARRIVED' || deliveryStatus === 'FULFILLED') {
      return;
    }

    const stepIntervalMs = Math.max(220, Math.floor(1800 / simSpeed));

    const interval = setInterval(() => {
      setProgressIndex((prev) => {
        if (prev < routeWaypoints.length - 1) {
          const next = prev + 1;
          if (next >= routeWaypoints.length - 1) {
            setAmbulanceSpeed(0);
          } else {
            setAmbulanceSpeed(Math.floor(52 + Math.random() * 16));
          }
          return next;
        }
        setAmbulanceSpeed(0);
        return prev;
      });

      // Medical cold chain fluctuation (3.6°C - 4.0°C)
      setCargoTemp(Number((3.7 + Math.random() * 0.3).toFixed(1)));
    }, stepIntervalMs);

    return () => clearInterval(interval);
  }, [safeDonor, deliveryStatus, simSpeed, routeWaypoints.length]);

  // Current vehicle coordinate (snaps directly to recipient hospital when arrived)
  const currentVehicleCoord: [number, number] = isVehicleArrived
    ? [safeRequester.latitude, safeRequester.longitude]
    : (routeWaypoints[progressIndex] || [
        safeDonor?.latitude || safeRequester.latitude,
        safeDonor?.longitude || safeRequester.longitude,
      ]);

  // Next waypoint for bearing angle calculation
  const nextCoord = routeWaypoints[Math.min(progressIndex + 1, routeWaypoints.length - 1)] || currentVehicleCoord;
  const currentBearing = useMemo(() => {
    return calculateBearing(
      currentVehicleCoord[0],
      currentVehicleCoord[1],
      nextCoord[0],
      nextCoord[1]
    );
  }, [currentVehicleCoord, nextCoord]);

  // Path segmentation (Traveled vs Remaining)
  const traveledPath = useMemo(() => {
    return routeWaypoints.slice(0, progressIndex + 1);
  }, [routeWaypoints, progressIndex]);

  const remainingPath = useMemo(() => {
    return routeWaypoints.slice(progressIndex);
  }, [routeWaypoints, progressIndex]);

  // Progress metrics
  const progressPercent = routeWaypoints.length > 1 ? Math.round((progressIndex / (routeWaypoints.length - 1)) * 100) : 0;
  const remainingFraction = routeWaypoints.length > 1 ? 1 - progressIndex / (routeWaypoints.length - 1) : 0;
  const remainingDistanceKm = isVehicleArrived ? 0 : Number((totalDistanceKm * remainingFraction).toFixed(1));
  const remainingSeconds = isVehicleArrived ? 0 : Math.round((remainingDistanceKm / (ambulanceSpeed || 55)) * 3600);
  const etaMinutes = isVehicleArrived ? 0 : Math.floor(remainingSeconds / 60);
  const etaSeconds = isVehicleArrived ? 0 : remainingSeconds % 60;
  const effectiveSpeed = (isVehicleArrived || deliveryStatus === 'DELIVERED') ? 0 : ambulanceSpeed;

  // Synthesized audio alert for transit (Web Audio API)
  const playSirenChirp = () => {
    if (isAudioMuted || typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1174, audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.36);
    } catch {}
  };

  // Replay trip function
  const handleReplay = () => {
    setProgressIndex(0);
    playSirenChirp();
  };

  // Compute map bounding box
  const mapBounds: L.LatLngBoundsExpression = useMemo(() => {
    const latLngs: [number, number][] = [
      [safeRequester.latitude, safeRequester.longitude],
    ];
    if (safeDonor) {
      latLngs.push([safeDonor.latitude, safeDonor.longitude]);
    }
    (allHospitals || []).forEach((h) => {
      if (h && typeof h.latitude === 'number' && typeof h.longitude === 'number') {
        latLngs.push([h.latitude, h.longitude]);
      }
    });
    return latLngs;
  }, [safeRequester, safeDonor, allHospitals]);

  const isStockEnRoute = Boolean(safeDonor && deliveryStatus !== 'PENDING' && deliveryStatus !== 'DELIVERED' && !isVehicleArrived);
  const isDelivered = deliveryStatus === 'DELIVERED';

  return (
    <div className={`pulse-card space-y-4 overflow-hidden border border-rule shadow-lg ${className}`}>
      {/* 1. Creative Stock Telemetry & Flow Status Bar */}
      <div className="space-y-3">
        {/* Main Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rule-subtle">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl">{stockEmoji}</span>
              <h3 className="pulse-h4 text-sm font-bold text-ink flex items-center space-x-2">
                <span>Medical Transportation & Live Stock Transit</span>
                {isStockEnRoute && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-600 text-white font-bold animate-pulse">
                    LIVE RADAR
                  </span>
                )}
                {isVehicleArrived && !isDelivered && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-600 text-white font-bold animate-pulse">
                    ARRIVED
                  </span>
                )}
              </h3>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Point-to-point GPS telemetry, cold-chain monitoring, and cryptographic handover corridor.
            </p>
          </div>

          {/* Delivery Status Badge */}
          <div className="flex items-center space-x-2">
            {!safeDonor || deliveryStatus === 'PENDING' ? (
              <span className="pulse-badge pulse-badge-amber text-xs font-semibold flex items-center space-x-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse text-amber-500" />
                <span>Radar Search Active · No Stock Dispatched</span>
              </span>
            ) : isDelivered ? (
              <span className="pulse-badge pulse-badge-green text-xs font-semibold flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Delivered · Restocked in ICU</span>
              </span>
            ) : isVehicleArrived ? (
              <span className="pulse-badge pulse-badge-green text-xs font-semibold flex items-center space-x-1.5 border border-emerald-500/50 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span>Order Has Arrived · Ready for Intake</span>
              </span>
            ) : (
              <span className="pulse-badge pulse-badge-blue text-xs font-semibold flex items-center space-x-1.5">
                <Truck className="w-3.5 h-3.5 text-blue-500 animate-bounce" />
                <span>Stock On The Move · Rapid Transit</span>
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Stock-in-Transit / Stock Arrived Notice Card */}
        {isVehicleArrived || isDelivered ? (
          <div className="p-3.5 bg-gradient-to-r from-emerald-900/20 via-teal-900/15 to-emerald-950/30 rounded-2xl border-2 border-emerald-500/70 font-mono text-xs space-y-2 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 font-bold text-ink">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-emerald-600 dark:text-emerald-400 font-black tracking-wide text-sm flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>ORDER HAS ARRIVED:</span>
                </span>
                <span className="text-ink font-bold">{stockQuantity} Units {resourceLabel}</span>
                <span className="text-emerald-700 dark:text-emerald-300 text-[10px] bg-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/40">
                  Arrived at {safeRequester.name.split(' ')[0]} (Trauma ER)
                </span>
              </div>
              <div className="flex items-center space-x-3 text-[11px]">
                <span className="text-operational font-bold flex items-center space-x-1">
                  <Thermometer className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{cargoTemp}°C (Safe)</span>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                  0 km left · Vehicle On Site
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{isDelivered ? 'Handover Complete' : 'Ready for Handover & ER Intake'}</span>
                </span>
              </div>
            </div>

            {/* Live Transit Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-paper-subtle rounded-full h-2.5 overflow-hidden border border-emerald-500/40">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 h-full w-full rounded-full shadow-[0_0_12px_rgba(16,185,129,0.7)]"
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">
                <span>Origin: {safeDonor?.name ? safeDonor.name.split(' ')[0] : 'Origin'} (Dispatched)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">100% Corridor Completed · Vehicle Arrived at Destination ER</span>
                <span>Destination: {safeRequester?.name ? safeRequester.name.split(' ')[0] : 'Destination'} (Trauma ER)</span>
              </div>
            </div>
          </div>
        ) : isStockEnRoute && safeDonor ? (
          <div className="p-3.5 bg-gradient-to-r from-blue-900/10 via-red-900/10 to-emerald-900/10 rounded-2xl border-2 border-accent/40 font-mono text-xs space-y-2 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 font-bold text-ink">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                <span className="text-emergency font-black">EN ROUTE:</span>
                <span className="text-ink">{stockQuantity} Units {resourceLabel}</span>
                <span className="text-ink-muted text-[10px]">({safeDonor.name.split(' ')[0]} ➔ {safeRequester.name.split(' ')[0]})</span>
              </div>
              <div className="flex items-center space-x-3 text-[11px]">
                <span className="text-operational font-bold flex items-center space-x-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  <span>{cargoTemp}°C (Safe)</span>
                </span>
                <span className="text-accent font-bold tabular-nums">
                  {remainingDistanceKm} km left
                </span>
                <span className="text-emergency font-bold tabular-nums flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{etaMinutes}m {etaSeconds}s ETA</span>
                </span>
              </div>
            </div>

            {/* Live Transit Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-paper-subtle rounded-full h-2 overflow-hidden border border-rule">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-blue-500 to-red-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-ink-muted">
                <span>Origin: {safeDonor.name.split(' ')[0]} (Blood Bank)</span>
                <span className="font-bold text-ink">{progressPercent}% Corridor Cleared</span>
                <span>Destination: {safeRequester.name.split(' ')[0]} (Trauma ER)</span>
              </div>
            </div>
          </div>
        ) : !safeDonor || deliveryStatus === 'PENDING' ? (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-mono text-amber-800 dark:text-amber-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-amber-500 animate-spin-slow" />
              <span>
                <strong>Awaiting Supply Partner:</strong> 15km Regional Emergency Broadcast active. Partner hospital acceptance will lock inventory and launch vehicle transit.
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 rounded font-bold uppercase tracking-wider">
              Scan Radar
            </span>
          </div>
        ) : (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-mono text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                <strong>Stock Delivered:</strong> {stockQuantity} Units {resourceLabel} successfully handed over at {safeRequester.name}. Inventory restocked!
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 rounded font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Verified Restocked
            </span>
          </div>
        )}
      </div>

      {/* 2. Interactive Map Viewport with Creative HUD Overlays */}
      <div className="relative w-full h-[480px] rounded-2xl overflow-hidden border border-rule shadow-inner bg-slate-950 z-0">
        {/* Leaflet Map */}
        <MapContainer
          center={[safeRequester.latitude, safeRequester.longitude]}
          zoom={13}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution={TILE_LAYERS[mapTheme].attribution}
            url={TILE_LAYERS[mapTheme].url}
          />

          <MapCameraController
            bounds={mapBounds}
            vehicleCoord={currentVehicleCoord}
            followVehicle={followVehicle}
          />

          {/* 15km Proximity Geofence Radar Circle */}
          <Circle
            center={[safeRequester.latitude, safeRequester.longitude]}
            radius={15000}
            pathOptions={{
              color: '#dc2626',
              fillColor: '#dc2626',
              fillOpacity: mapTheme === 'dark' ? 0.06 : 0.03,
              weight: 1.5,
              dashArray: '6, 6',
            }}
          />

          {/* All Regional Hospital Pins */}
          {(allHospitals || []).map((hosp) => {
            if (!hosp || typeof hosp.latitude !== 'number' || typeof hosp.longitude !== 'number') return null;
            const isRequester = hosp.hospital_id === safeRequester.hospital_id;
            const isDonor = safeDonor?.hospital_id === hosp.hospital_id;
            const hasStock = Array.isArray(hosp.supported_resources) && hosp.supported_resources.length > 0;

            return (
              <Marker
                key={hosp.hospital_id}
                position={[
                  isDonor ? safeDonor.latitude : hosp.latitude,
                  isDonor ? safeDonor.longitude : hosp.longitude,
                ]}
                icon={createCreativeHospitalIcon(hosp.name, isRequester, isDonor, hasStock, isRequester && isVehicleArrived)}
              >
                <Popup>
                  <div className="p-1 font-mono text-xs text-slate-900">
                    <div className="font-bold text-sm">{hosp.name}</div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Role: {isRequester ? (isVehicleArrived ? '🚨 Requester Trauma Center (ORDER ARRIVED!)' : '🚨 Requester Trauma Center') : isDonor ? '🏥 Confirmed Donor Facility' : 'Regional Candidate Node'}
                    </div>
                    <div className="text-[11px] text-slate-600">Contact: {hosp.contact}</div>
                    <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                      Distance: {calculateDistanceKm(safeRequester.latitude, safeRequester.longitude, hosp.latitude, hosp.longitude).toFixed(1)} km
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Dynamic Road Corridor Polylines */}
          {routeWaypoints.length > 0 && safeDonor && (
            <>
              {/* Outer Glow Route */}
              <Polyline
                positions={routeWaypoints}
                pathOptions={{
                  color: isVehicleArrived ? '#10b981' : '#2563eb',
                  weight: 8,
                  opacity: 0.35,
                }}
              />

              {/* Traveled Route Segment (Completed - Emerald Green) */}
              {traveledPath.length > 1 && (
                <Polyline
                  positions={traveledPath}
                  pathOptions={{
                    color: '#10b981',
                    weight: 4.5,
                    opacity: 0.9,
                  }}
                />
              )}

              {/* Remaining Route Segment (Active Transit - Pulsing Cyan) */}
              {remainingPath.length > 1 && !isVehicleArrived && (
                <Polyline
                  positions={remainingPath}
                  pathOptions={{
                    color: '#06b6d4',
                    weight: 4,
                    dashArray: '10, 10',
                    className: 'leaflet-route-flow',
                  }}
                />
              )}
            </>
          )}

          {/* Creative Moving Vehicle Marker */}
          {safeDonor && deliveryStatus !== 'PENDING' && (
            <Marker
              position={currentVehicleCoord}
              icon={createCreativeAmbulanceIcon(
                effectiveSpeed,
                currentBearing,
                `${stockQuantity}x ${resourceLabel}`,
                stockEmoji,
                cargoTemp,
                isVehicleArrived
              )}
            >
              <Popup>
                <div className="p-1.5 font-mono text-xs text-slate-900 min-w-[200px]">
                  <div className="font-bold text-red-600 flex items-center space-x-1.5 border-b pb-1">
                    <Truck className="w-4 h-4" />
                    <span>Emergency Ambulance Unit 04</span>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payload:</span>
                      <strong className="text-red-700 font-bold">{stockQuantity} Units {resourceLabel}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status:</span>
                      <strong className={isVehicleArrived ? 'text-emerald-700 font-bold' : 'text-blue-700 font-bold'}>
                        {isVehicleArrived ? 'ARRIVED AT DESTINATION ER' : 'TRANSIT EN ROUTE'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cold-Chain:</span>
                      <strong className="text-emerald-700 font-bold">{cargoTemp}°C (Safe)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Speed:</span>
                      <strong className="text-blue-700 font-bold">{effectiveSpeed} km/h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Remaining:</span>
                      <strong className="text-slate-900 font-bold">
                        {isVehicleArrived ? '0 km (On Site)' : `${remainingDistanceKm} km (${etaMinutes}m ${etaSeconds}s)`}
                      </strong>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Arrival Banner Overlay on Map */}
        {isVehicleArrived && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-slate-950/90 text-white border-2 border-emerald-500 px-4 py-2 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.7)] backdrop-blur-md flex items-center space-x-2 text-xs font-mono font-bold animate-bounce pointer-events-none">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="text-emerald-300">ORDER HAS ARRIVED AT {safeRequester.name.split(' ')[0].toUpperCase()}</span>
            <span className="text-[10px] text-slate-300 font-normal">· Trauma ER Intake Ready</span>
          </div>
        )}

        {/* Top-Right: Map Theme & Radar Controls */}
        {!hideControls && (
          <div className="absolute top-3 right-3 flex flex-col items-end space-y-2 z-[400]">
            {/* Map Theme Toggle */}
            <div className="bg-slate-950/85 backdrop-blur-md border border-white/20 p-1 rounded-xl shadow-2xl flex items-center space-x-1 text-[10px] font-mono text-white">
              {(['dark', 'light', 'osm'] as MapTheme[]).map((theme) => (
                <button
                  key={theme}
                  onClick={() => setMapTheme(theme)}
                  className={`px-2 py-1 rounded-lg transition-all capitalize font-bold ${
                    mapTheme === theme
                      ? 'bg-accent text-white shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {theme === 'dark' ? '🌙 Dark' : theme === 'light' ? '☀️ Day' : '🗺️ OSM'}
                </button>
              ))}
            </div>

            {/* Simulation Speed & Replay HUD */}
            {safeDonor && (
              <div className="bg-slate-950/85 backdrop-blur-md border border-white/20 p-1 rounded-xl shadow-2xl flex items-center space-x-1 text-[10px] font-mono text-white">
                <span className="px-1.5 text-slate-400 font-bold">Speed:</span>
                {([1, 3, 8] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSimSpeed(spd)}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                      simSpeed === spd
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
                <button
                  onClick={handleReplay}
                  title="Replay Transit Journey"
                  className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-white/10 ml-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setFollowVehicle(!followVehicle)}
                  title={followVehicle ? 'Camera Lock Active' : 'Lock Camera on Vehicle'}
                  className={`p-1 rounded-md transition-all ${
                    followVehicle ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>
                {!isVehicleArrived && (
                  <button
                    onClick={() => {
                      if (routeWaypoints.length > 0) {
                        setProgressIndex(routeWaypoints.length - 1);
                        setAmbulanceSpeed(0);
                        onOrderArrived?.();
                      }
                    }}
                    title="Simulate Vehicle Arrival at Trauma ER"
                    className="px-2 py-0.5 rounded-md font-bold bg-emerald-600/80 hover:bg-emerald-600 text-white transition-all ml-1 shadow-sm flex items-center space-x-1"
                  >
                    <span>🏁</span>
                    <span>Arrive</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom-Left: Live Telemetry Mini-Radar Widget */}
        <div className="absolute bottom-3 left-3 bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 p-2.5 rounded-xl text-[11px] font-mono text-white shadow-2xl z-[400] max-w-xs pointer-events-none space-y-1">
          <div className="flex items-center justify-between border-b border-white/15 pb-1">
            <span className="font-bold text-cyan-300 flex items-center space-x-1">
              <Compass className="w-3 h-3" />
              <span>Corridor Telemetry</span>
            </span>
            <span className={`text-[9px] font-bold uppercase ${isVehicleArrived ? 'text-emerald-400' : isStockEnRoute ? 'text-cyan-400' : 'text-slate-400'}`}>
              {isVehicleArrived ? 'ARRIVED ON SITE' : isStockEnRoute ? 'TRANSMITTING' : 'IDLE'}
            </span>
          </div>
          <div className="text-[10px] space-y-0.5 text-slate-300">
            <div>Origin: <strong className="text-white">{safeDonor?.name.split(' ')[0] || 'Awaiting Partner'}</strong></div>
            <div>Destination: <strong className="text-white">{safeRequester.name.split(' ')[0]}</strong></div>
            {(isStockEnRoute || isVehicleArrived) && (
              <div>Payload: <strong className="text-cyan-300">{stockQuantity}x {resourceLabel}</strong></div>
            )}
          </div>
        </div>

        {/* Bottom-Right: Geospatial Map Legend */}
        <div className="absolute bottom-3 right-3 bg-slate-950/90 backdrop-blur-md border border-white/20 p-2 rounded-xl text-[10px] font-mono text-white shadow-2xl z-[400] pointer-events-none space-y-1 hidden sm:block">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
            <span>Requester ER ({safeRequester.name.split(' ')[0]})</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            <span>Donor Facility ({safeDonor?.name.split(' ')[0] || 'Donor'})</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span>Active Vehicle Transit Path</span>
          </div>
        </div>
      </div>

      {/* 3. Verification Action Strip (If provided) */}
      {(onVerifyPickup || onVerifyDelivery) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-rule-subtle">
          <div className="text-xs font-mono text-ink-muted flex items-center space-x-1.5">
            {isVehicleArrived || isDelivered ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Ambulance has arrived at {safeRequester.name.split(' ')[0]} Trauma ER. Handover and intake verification ready.
                </span>
              </>
            ) : deliveryStatus === 'DISPATCHED' ? (
              <span>Ambulance is navigating to Donor Blood Bank.</span>
            ) : (
              <span>Cold-chain locked. En route to Requester Trauma Center.</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {(!isVehicleArrived || !onVerifyDelivery) && onVerifyPickup && (
              <button
                onClick={onVerifyPickup}
                className="pulse-btn pulse-btn-primary pulse-btn-sm text-xs font-mono"
              >
                Scan Donor Pickup QR
              </button>
            )}
            {(isVehicleArrived || onVerifyDelivery) && onVerifyDelivery && (
              <button
                onClick={onVerifyDelivery}
                className="pulse-btn pulse-btn-emergency pulse-btn-sm text-xs font-mono"
              >
                Confirm Trauma ER Intake
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
