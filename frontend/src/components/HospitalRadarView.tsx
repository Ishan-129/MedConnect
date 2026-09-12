import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Hospital, EmergencyRequest } from '../types';
import { calculateDistanceKm } from '../lib/haversine';
import { Radio, MapPin, Compass, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface HospitalRadarViewProps {
  selectedHospital: Hospital;
  allHospitals: Hospital[];
  radiusKm?: number;
  activeRequests?: EmergencyRequest[];
  onSelectHospital?: (hospital: Hospital) => void;
}

export const HospitalRadarView: React.FC<HospitalRadarViewProps> = ({
  selectedHospital,
  allHospitals,
  radiusKm = 15.0,
  activeRequests = [],
  onSelectHospital,
}) => {
  const [hoveredHospital, setHoveredHospital] = useState<Hospital | null>(null);

  const radarSize = 420;
  const center = radarSize / 2; // 210px
  const maxDisplayRadiusKm = 15.0; // 15km corresponds to full radar radius
  const radarInnerRadiusPx = 180;

  // Provide defensive fallback if selectedHospital is not yet resolved
  const safeSelected: Hospital = useMemo(() => {
    if (selectedHospital && typeof selectedHospital.latitude === 'number' && typeof selectedHospital.longitude === 'number') {
      return selectedHospital;
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
  }, [selectedHospital, allHospitals]);

  // Calculate radar positions for all hospitals relative to selected hospital
  const plottedHospitals = useMemo(() => {
    return (allHospitals || []).map((hosp) => {
      if (!hosp || typeof hosp.latitude !== 'number' || typeof hosp.longitude !== 'number') {
        return null;
      }
      const distance = calculateDistanceKm(
        safeSelected.latitude,
        safeSelected.longitude,
        hosp.latitude,
        hosp.longitude
      );

      const isCenter = hosp.hospital_id === safeSelected.hospital_id;
      const inRange = distance <= radiusKm;

      const hasActiveSOS = activeRequests.some(
        (r) => r.requesting_hospital_id === hosp.hospital_id && (r.status === 'OPEN' || r.status === 'CREATED' || (r.status as any) === 'BROADCASTED')
      );

      let x = center;
      let y = center;

      if (!isCenter) {
        const dLat = hosp.latitude - safeSelected.latitude;
        const dLng =
          (hosp.longitude - safeSelected.longitude) *
          Math.cos(((safeSelected.latitude + hosp.latitude) / 2) * (Math.PI / 180));

        const angleRad = Math.atan2(dLng, dLat); // 0 = North
        const rPx = Math.min(
          radarInnerRadiusPx,
          (distance / maxDisplayRadiusKm) * radarInnerRadiusPx
        );

        x = center + rPx * Math.sin(angleRad);
        y = center - rPx * Math.cos(angleRad);
      }

      return {
        ...hosp,
        distance,
        isCenter,
        inRange,
        hasActiveSOS,
        radarX: Math.round(x * 10) / 10,
        radarY: Math.round(y * 10) / 10,
      };
    }).filter(Boolean) as any[];
  }, [safeSelected, allHospitals, radiusKm, activeRequests, center, radarInnerRadiusPx, maxDisplayRadiusKm]);

  const ring5KmPx = (5.0 / maxDisplayRadiusKm) * radarInnerRadiusPx;
  const ring10KmPx = (10.0 / maxDisplayRadiusKm) * radarInnerRadiusPx;
  const ring15KmPx = (15.0 / maxDisplayRadiusKm) * radarInnerRadiusPx;

  return (
    <div className="pulse-card space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-rule-subtle">
        <div className="flex items-center space-x-2">
          <Radio className="w-5 h-5 text-emergency animate-pulse" />
          <h3 className="pulse-h4 text-sm font-bold text-ink">
            15km Haversine Proximity Radar
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="pulse-badge pulse-badge-green text-xs">
            <span className="pulse-dot pulse-dot-green"></span> Live 15km Scan
          </span>
          <span className="text-xs font-mono text-ink-muted">
            {plottedHospitals.filter((h) => !h.isCenter && h.inRange).length} in Range
          </span>
        </div>
      </div>

      {/* Circular Radar Visualizer */}
      <div className="relative w-full aspect-square max-w-[420px] mx-auto bg-slate-950 rounded-2xl border border-rule flex items-center justify-center overflow-hidden shadow-card">
        {/* Distance Rings */}
        <div
          style={{ width: `${ring15KmPx * 2}px`, height: `${ring15KmPx * 2}px` }}
          className="absolute rounded-full border border-slate-700/60 pointer-events-none"
        />
        <div
          style={{ width: `${ring10KmPx * 2}px`, height: `${ring10KmPx * 2}px` }}
          className="absolute rounded-full border border-slate-800/80 border-dashed pointer-events-none"
        />
        <div
          style={{ width: `${ring5KmPx * 2}px`, height: `${ring5KmPx * 2}px` }}
          className="absolute rounded-full border border-slate-800/60 pointer-events-none"
        />

        {/* Distance Labels */}
        <span
          style={{ top: `${center - ring15KmPx + 6}px` }}
          className="absolute text-[9px] font-mono text-slate-500 select-none"
        >
          15 km
        </span>
        <span
          style={{ top: `${center - ring10KmPx + 6}px` }}
          className="absolute text-[9px] font-mono text-slate-500 select-none"
        >
          10 km
        </span>
        <span
          style={{ top: `${center - ring5KmPx + 6}px` }}
          className="absolute text-[9px] font-mono text-slate-500 select-none"
        >
          5 km
        </span>

        {/* Crosshair Grid */}
        <div className="absolute w-full h-[1px] bg-slate-900 pointer-events-none" />
        <div className="absolute h-full w-[1px] bg-slate-900 pointer-events-none" />

        {/* Compass Cardinal Points */}
        <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-slate-500">
          N
        </span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-slate-500">
          S
        </span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-500">
          E
        </span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-500">
          W
        </span>

        {/* Sweeping Radar Beam */}
        <div className="absolute inset-0 origin-center animate-radar-sweep pointer-events-none">
          <div className="w-1/2 h-1/2 bg-gradient-to-br from-emergency/25 via-emergency/5 to-transparent transform -rotate-45 origin-bottom-right" />
        </div>

        {/* Hospital Blips */}
        {plottedHospitals.map((hosp) => {
          const isSelected = hosp.isCenter;
          const isHovered = hoveredHospital?.hospital_id === hosp.hospital_id;

          return (
            <div
              key={hosp.hospital_id}
              style={{
                left: `${(hosp.radarX / radarSize) * 100}%`,
                top: `${(hosp.radarY / radarSize) * 100}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
              onMouseEnter={() => setHoveredHospital(hosp)}
              onMouseLeave={() => setHoveredHospital(null)}
              onClick={() => onSelectHospital && onSelectHospital(hosp)}
            >
              {isSelected ? (
                // Center / Origin Hospital Node
                <div className="flex flex-col items-center group">
                  <div className="w-4 h-4 rounded-full bg-emergency ring-4 ring-emergency/40 animate-pulse-gentle flex items-center justify-center shadow-lg shadow-emergency/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div className="mt-1 px-2 py-0.5 rounded bg-slate-900/95 border border-slate-700 text-[10px] font-mono font-bold text-white whitespace-nowrap shadow-md">
                    {hosp.name.split(' ')[0]} (You)
                  </div>
                </div>
              ) : (
                // Nearby Target Hospital Nodes
                <motion.div
                  whileHover={{ scale: 1.25 }}
                  className="flex flex-col items-center group"
                >
                  <div
                    className={`w-3 h-3 rounded-full flex items-center justify-center transition-all ${
                      hosp.hasActiveSOS
                        ? 'bg-amber-400 ring-4 ring-amber-400/40 animate-ping'
                        : hosp.inRange
                        ? 'bg-operational ring-2 ring-operational/40'
                        : 'bg-slate-600 ring-1 ring-slate-700 opacity-60'
                    }`}
                  >
                    <div className="w-1 h-1 rounded-full bg-white" />
                  </div>
                  <div
                    className={`mt-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold whitespace-nowrap transition-all shadow ${
                      isHovered
                        ? 'bg-accent text-white scale-110 z-30'
                        : 'bg-slate-900/90 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {hosp.name.split(' ')[0]} ({hosp.distance.toFixed(1)}km)
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}

        {/* Hover Information Tooltip Overlay */}
        {hoveredHospital && (
          <div className="absolute bottom-3 right-3 bg-slate-900/95 border border-slate-700 p-2.5 rounded-xl text-xs font-mono text-white shadow-xl max-w-[210px] z-30 backdrop-blur-sm pointer-events-none">
            <div className="font-bold text-ink-light flex items-center space-x-1.5 text-white">
              <MapPin className="w-3.5 h-3.5 text-emergency" />
              <span className="truncate">{hoveredHospital.name}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400 space-y-0.5">
              <div>Distance: <span className="text-operational font-bold">{calculateDistanceKm(selectedHospital.latitude, selectedHospital.longitude, hoveredHospital.latitude, hoveredHospital.longitude).toFixed(2)} km</span></div>
              <div>Contact: <span className="text-slate-200">{hoveredHospital.contact}</span></div>
              <div className="text-[10px] text-accent mt-1">Click to inspect node</div>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Telemetry Bar */}
      <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
        <div className="p-2 bg-paper-subtle rounded-lg border border-rule">
          <div className="text-[10px] text-ink-muted">Requester Center</div>
          <div className="font-bold text-emergency flex items-center justify-center space-x-1 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emergency inline-block"></span>
            <span className="truncate">{selectedHospital.name.split(' ')[0]}</span>
          </div>
        </div>
        <div className="p-2 bg-paper-subtle rounded-lg border border-rule">
          <div className="text-[10px] text-ink-muted">Scan Coverage</div>
          <div className="font-bold text-operational mt-0.5">15.0 km Radius</div>
        </div>
        <div className="p-2 bg-paper-subtle rounded-lg border border-rule">
          <div className="text-[10px] text-ink-muted">Network Targets</div>
          <div className="font-bold text-accent mt-0.5">
            {plottedHospitals.filter((h) => !h.isCenter && h.inRange).length} Hospitals
          </div>
        </div>
      </div>
    </div>
  );
};
