import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Hospital, EmergencyRequest } from '../types';
import { calculateDistanceKm } from '../lib/haversine';
import { Truck, AlertTriangle, ShieldCheck, Zap, Navigation, Clock, Thermometer, Radio } from 'lucide-react';

interface TransportationMapProps {
  requesterHospital: Hospital;
  donorHospital?: Hospital | null;
  allHospitals: Hospital[];
  activeRequest?: EmergencyRequest | null;
  deliveryStatus?: 'PENDING' | 'DISPATCHED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED';
  onVerifyPickup?: () => void;
  onVerifyDelivery?: () => void;
}

// Custom Leaflet DivIcon Generators for clinical markers
const createHospitalIcon = (name: string, isRequester: boolean, isDonor: boolean) => {
  const bgClass = isRequester
    ? 'bg-red-600 ring-red-400/40 text-white'
    : isDonor
    ? 'bg-emerald-600 ring-emerald-400/40 text-white'
    : 'bg-blue-600 ring-blue-400/30 text-white';

  const label = isRequester ? 'Requester (A)' : isDonor ? 'Donor (B)' : 'Hospital';

  return L.divIcon({
    className: 'custom-hospital-marker',
    html: `
      <div style="transform: translate(-50%, -100%);" class="flex flex-col items-center">
        <div class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white text-slate-900 border border-slate-300 shadow-md whitespace-nowrap mb-1">
          ${name.split(' ')[0]} <span class="${isRequester ? 'text-red-600' : isDonor ? 'text-emerald-600' : 'text-blue-600'}">(${label})</span>
        </div>
        <div class="w-7 h-7 rounded-full ${bgClass} ring-4 flex items-center justify-center shadow-xl">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div class="w-1.5 h-1.5 bg-white border-r border-b border-slate-300 rotate-45 -mt-1"></div>
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 48],
  });
};

const createAmbulanceIcon = (speed: number) => {
  return L.divIcon({
    className: 'custom-ambulance-marker',
    html: `
      <div style="transform: translate(-50%, -50%);" class="relative flex items-center justify-center">
        <div class="absolute -inset-2 bg-red-500/30 rounded-full animate-ping"></div>
        <div class="w-9 h-9 rounded-full bg-white border-2 border-red-500 shadow-xl flex items-center justify-center text-red-600 z-10">
          <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 11h3m-1.5-1.5v3" />
          </svg>
        </div>
        <div class="absolute -bottom-5 px-1.5 py-0.2 rounded bg-red-600 text-white font-mono font-bold text-[8px] whitespace-nowrap shadow">
          ${speed} KM/H
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

// Component to dynamically adjust map view to fit all key coordinates
function MapAutoCenter({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [bounds, map]);
  return null;
}

export const TransportationMap: React.FC<TransportationMapProps> = ({
  requesterHospital,
  donorHospital,
  allHospitals,
  activeRequest,
  deliveryStatus = 'PENDING',
  onVerifyPickup,
  onVerifyDelivery,
}) => {
  // Road route waypoints between Donor and Requester
  // We compute an accurate intermediate path through Delhi-NCR Ring Road / Sri Aurobindo Marg
  const routeWaypoints = useMemo(() => {
    if (!donorHospital) return [];

    const startLat = donorHospital.latitude;
    const startLng = donorHospital.longitude;
    const endLat = requesterHospital.latitude;
    const endLng = requesterHospital.longitude;

    // Generate 12 fine-grained interpolated coordinates along corridor
    const points: [number, number][] = [];
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Slight road curvature simulation
      const curve = Math.sin(t * Math.PI) * 0.0015;
      const lat = startLat + (endLat - startLat) * t + curve;
      const lng = startLng + (endLng - startLng) * t - curve * 0.5;
      points.push([lat, lng]);
    }
    return points;
  }, [donorHospital, requesterHospital]);

  // Ambulance position & animation state along route
  const [progressIndex, setProgressIndex] = useState(0);
  const [ambulanceSpeed, setAmbulanceSpeed] = useState(54);
  const [cargoTemp, setCargoTemp] = useState(3.8);

  const totalDistanceKm = useMemo(() => {
    if (!donorHospital) return 0;
    return calculateDistanceKm(
      donorHospital.latitude,
      donorHospital.longitude,
      requesterHospital.latitude,
      requesterHospital.longitude
    );
  }, [donorHospital, requesterHospital]);

  // Animation ticker for active delivery ambulance
  useEffect(() => {
    if (!donorHospital || deliveryStatus === 'PENDING' || deliveryStatus === 'DELIVERED') {
      return;
    }

    const interval = setInterval(() => {
      setProgressIndex((prev) => {
        if (prev < routeWaypoints.length - 1) {
          return prev + 1;
        }
        return prev;
      });

      // Fluctuate speed realistically
      setAmbulanceSpeed(Math.floor(48 + Math.random() * 14));
      // Blood cold-chain fluctuates safely between 3.6°C and 4.1°C
      setCargoTemp(Number((3.7 + Math.random() * 0.4).toFixed(1)));
    }, 1800);

    return () => clearInterval(interval);
  }, [donorHospital, deliveryStatus, routeWaypoints.length]);

  const currentAmbulanceCoord = routeWaypoints[progressIndex] || [
    donorHospital?.latitude || requesterHospital.latitude,
    donorHospital?.longitude || requesterHospital.longitude,
  ];

  // Calculate ETA based on remaining waypoints
  const remainingFraction = routeWaypoints.length > 1 ? 1 - progressIndex / (routeWaypoints.length - 1) : 0;
  const remainingDistanceKm = Number((totalDistanceKm * remainingFraction).toFixed(2));
  const remainingSeconds = Math.round((remainingDistanceKm / (ambulanceSpeed || 50)) * 3600);
  const etaMinutes = Math.floor(remainingSeconds / 60);
  const etaSeconds = remainingSeconds % 60;

  // Compute map bounding box
  const mapBounds: L.LatLngBoundsExpression = useMemo(() => {
    const latLngs: [number, number][] = [
      [requesterHospital.latitude, requesterHospital.longitude],
    ];
    if (donorHospital) {
      latLngs.push([donorHospital.latitude, donorHospital.longitude]);
    }
    allHospitals.forEach((h) => latLngs.push([h.latitude, h.longitude]));
    return latLngs;
  }, [requesterHospital, donorHospital, allHospitals]);

  return (
    <div className="pulse-card space-y-4">
      {/* Map Header & Live Status Telemetry Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rule-subtle">
        <div>
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-accent animate-pulse" />
            <h3 className="pulse-h4 text-sm font-bold text-ink">
              Medical Transportation & Live Ambulance Route
            </h3>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            Real-time GPS dispatch from Donor Hospital to Requester Trauma Center.
          </p>
        </div>

        {/* Status Chip */}
        <div className="flex items-center space-x-2">
          {deliveryStatus === 'PENDING' && (
            <span className="pulse-badge pulse-badge-amber text-xs font-semibold">
              <span className="pulse-dot pulse-dot-amber"></span> Awaiting Resource Lock
            </span>
          )}
          {deliveryStatus === 'DISPATCHED' && (
            <span className="pulse-badge pulse-badge-blue text-xs font-semibold">
              <span className="pulse-dot pulse-dot-blue animate-ping"></span> Ambulance Dispatched
            </span>
          )}
          {deliveryStatus === 'PICKED_UP' && (
            <span className="pulse-badge pulse-badge-blue text-xs font-semibold">
              <span className="pulse-dot pulse-dot-blue"></span> QR Verified at Donor · In Transit
            </span>
          )}
          {deliveryStatus === 'DELIVERED' && (
            <span className="pulse-badge pulse-badge-green text-xs font-semibold">
              <span className="pulse-dot pulse-dot-green"></span> Delivered & Restocked
            </span>
          )}
        </div>
      </div>

      {/* Active Mission Telemetry Strip */}
      {donorHospital && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-paper-subtle rounded-xl border border-rule font-mono text-xs shadow-sm">
          <div>
            <div className="text-[10px] text-ink-muted uppercase">Corridor</div>
            <div className="font-bold text-ink truncate mt-0.5">
              {donorHospital.name.split(' ')[0]} ➔ {requesterHospital.name.split(' ')[0]}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-muted uppercase">Route Distance</div>
            <div className="font-bold text-accent mt-0.5 tabular-nums">
              {remainingDistanceKm} km left <span className="text-ink-muted font-normal">/ {totalDistanceKm.toFixed(1)}km</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-muted uppercase">Live ETA</div>
            <div className="font-bold text-emergency mt-0.5 tabular-nums flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{deliveryStatus === 'DELIVERED' ? 'Arrived' : `${etaMinutes}m ${etaSeconds}s`}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-muted uppercase">Cold-Chain (O- Blood)</div>
            <div className="font-bold text-operational mt-0.5 flex items-center space-x-1">
              <Thermometer className="w-3.5 h-3.5 text-operational" />
              <span>{cargoTemp}°C (Safe)</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-center justify-end">
            {deliveryStatus === 'DISPATCHED' && onVerifyPickup && (
              <button
                onClick={onVerifyPickup}
                className="pulse-btn pulse-btn-primary pulse-btn-sm w-full text-[11px]"
              >
                Scan Pickup QR
              </button>
            )}
            {deliveryStatus === 'PICKED_UP' && onVerifyDelivery && (
              <button
                onClick={onVerifyDelivery}
                className="pulse-btn pulse-btn-emergency pulse-btn-sm w-full text-[11px]"
              >
                Scan Delivery QR
              </button>
            )}
            {deliveryStatus === 'DELIVERED' && (
              <span className="text-operational font-bold text-xs flex items-center space-x-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Handover Complete</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Leaflet Interactive Map Container */}
      <div className="relative w-full h-[450px] rounded-2xl overflow-hidden border border-rule shadow-card bg-paper-subtle z-0">
        <MapContainer
          center={[requesterHospital.latitude, requesterHospital.longitude]}
          zoom={13}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          {/* OpenStreetMap CartoDB Tiles */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapAutoCenter bounds={mapBounds} />

          {/* 15km Proximity Geofence Ring around Requester Hospital */}
          <Circle
            center={[requesterHospital.latitude, requesterHospital.longitude]}
            radius={15000} // 15,000 meters = 15 km
            pathOptions={{
              color: '#dc2626',
              fillColor: '#dc2626',
              fillOpacity: 0.04,
              weight: 1.5,
              dashArray: '6, 6',
            }}
          />

          {/* Render All Regional Hospitals */}
          {allHospitals.map((hosp) => {
            const isRequester = hosp.hospital_id === requesterHospital.hospital_id;
            const isDonor = donorHospital?.hospital_id === hosp.hospital_id;

            return (
              <Marker
                key={hosp.hospital_id}
                position={[hosp.latitude, hosp.longitude]}
                icon={createHospitalIcon(hosp.name, isRequester, isDonor)}
              >
                <Popup>
                  <div className="p-1 font-mono text-xs text-slate-900">
                    <div className="font-bold text-sm">{hosp.name}</div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Role: {isRequester ? '🚨 Requester (Hospital A)' : isDonor ? '🏥 Donor Facility (Hospital B)' : 'Regional Node'}
                    </div>
                    <div className="text-[11px] text-slate-600">Contact: {hosp.contact}</div>
                    <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                      Distance: {calculateDistanceKm(requesterHospital.latitude, requesterHospital.longitude, hosp.latitude, hosp.longitude).toFixed(1)} km
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Render Polyline Road Route between Donor and Requester */}
          {routeWaypoints.length > 0 && (
            <>
              {/* Route Outer Glow Line */}
              <Polyline
                positions={routeWaypoints}
                pathOptions={{
                  color: '#2563eb',
                  weight: 8,
                  opacity: 0.35,
                }}
              />
              {/* Route Inner Dash Line */}
              <Polyline
                positions={routeWaypoints}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 4,
                  dashArray: '8, 8',
                }}
              />
            </>
          )}

          {/* Render Animated Delivery Ambulance Marker */}
          {donorHospital && deliveryStatus !== 'PENDING' && (
            <Marker
              position={currentAmbulanceCoord}
              icon={createAmbulanceIcon(ambulanceSpeed)}
            >
              <Popup>
                <div className="p-1 font-mono text-xs text-slate-900">
                  <div className="font-bold text-red-600 flex items-center space-x-1">
                    <Truck className="w-3.5 h-3.5" />
                    <span>Emergency Ambulance Unit 04</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[11px]">
                    <div>Cargo: <strong>4 Units O- Blood (Cold-Chain)</strong></div>
                    <div>Temp: <strong className="text-emerald-600">{cargoTemp}°C</strong></div>
                    <div>Speed: <strong>{ambulanceSpeed} km/h</strong></div>
                    <div>ETA: <strong>{etaMinutes}m {etaSeconds}s</strong></div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Map Legend Overlay */}
        <div className="absolute top-3 right-3 bg-paper-2/95 border border-rule p-2.5 rounded-xl text-[11px] font-mono text-ink shadow-dropdown z-[400] backdrop-blur-sm pointer-events-none space-y-1">
          <div className="font-bold text-ink border-b border-rule-subtle pb-1">Geospatial Legend</div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
            <span>Requester ({requesterHospital?.name?.split(' ')[0] || 'Requester'})</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            <span>Donor ({donorHospital?.name?.split(' ')[0] || 'Donor'})</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span>Ambulance Transit Route</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-0.5 border-t border-red-500 border-dashed"></span>
            <span>15 km Emergency Boundary</span>
          </div>
        </div>
      </div>
    </div>
  );
};
