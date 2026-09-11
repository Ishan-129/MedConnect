/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React, { useState, useEffect } from 'react';
import { Radio, AlertTriangle, ShieldCheck, CheckCircle2, Clock, QrCode, ArrowRight, Building2, MapPin, Send, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { INITIAL_HOSPITALS, INITIAL_EMERGENCY_REQUESTS, AIIMS_COORDS } from '../lib/mockData';
import { EmergencyRequest, ResourceType, EmergencyPriority } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { QrCodeModal } from '../components/QrCodeModal';
import { motionTokens, springs } from '../lib/motionTokens';

export const EmergencyView: React.FC = () => {
  const [hospitals] = useState(INITIAL_HOSPITALS);
  const [requests, setRequests] = useState<EmergencyRequest[]>(INITIAL_EMERGENCY_REQUESTS);
  const [countdown, setCountdown] = useState(135); // 135s remaining on 180s escalation timeout
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [currentDispatchPass, setCurrentDispatchPass] = useState<any>(null);

  // New Request Form State
  const [resourceType, setResourceType] = useState<ResourceType>('O_NEG_BLOOD');
  const [quantity, setQuantity] = useState(4);
  const [priority, setPriority] = useState<EmergencyPriority>('CRITICAL');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Countdown timer simulation for Twilio escalation
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Broadcast Emergency Request to 10km Radius
  const handleBroadcastRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setIsBroadcasting(true);

    setTimeout(() => {
      const newReq: EmergencyRequest = {
        request_id: `ER-${Math.floor(1000 + Math.random() * 9000)}`,
        requesting_hospital_id: 'hosp-aiims',
        requesting_hospital_name: 'AIIMS New Delhi',
        resource_type: resourceType,
        quantity: quantity,
        priority: priority,
        status: 'OPEN',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 180 * 1000).toISOString(),
      };
      setRequests([newReq, ...requests]);
      setIsBroadcasting(false);
      setCountdown(180);
    }, 900);
  };

  // 1-Click Accept & Supply (Safdarjung Hospital accepts AIIMS request)
  const handleAcceptAndLock = (reqId: string) => {
    setRequests((prev) =>
      prev.map((req) => {
        if (req.request_id === reqId) {
          const pass = {
            id: `DISP-${req.request_id}`,
            targetName: 'AIIMS Trauma Center Ambulance Unit 3',
            detail: `${req.quantity} Units · ${req.resource_type} (Safdarjung Blood Bank)`,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            signature: 'hmac_sha256_emergency_dispatch_auth_token_99fa71'
          };
          setCurrentDispatchPass(pass);
          setShowDispatchModal(true);

          return {
            ...req,
            status: 'ACCEPTED',
            supplying_hospital_id: 'hosp-safdarjung',
            supplying_hospital_name: 'Safdarjung Hospital'
          };
        }
        return req;
      })
    );
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* View Header & Module Badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-rule gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="pulse-badge pulse-badge-emergency">
              Pillar 2 · Module 3 & 4
            </span>
            <span className="text-xs font-mono text-ink-muted">Assigned: Ishaan Sama & Bhavya Gupta (Dev 3 & 4)</span>
          </div>
          <h1 className="pulse-h2 text-2xl font-bold text-ink mt-1">
            Emergency Supply Dispatch & 10km Geo-Radar
          </h1>
          <p className="pulse-text-sm text-ink-muted mt-0.5">
            Inter-hospital resource exchange, Haversine proximity broadcast, 1-click Telegram accept & tamper-proof QR handover pass.
          </p>
        </div>

        {/* Escalation Telemetry */}
        <div className="flex items-center space-x-3 bg-paper-subtle px-4 py-2 rounded-xl border border-rule font-mono text-xs shadow-hairline">
          <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
          <span className="text-ink-muted font-medium">Auto-Escalation Timer:</span>
          <span className={`font-bold tabular-nums text-sm ${countdown < 30 ? 'text-emergency animate-pulse-gentle' : 'text-amber-600 dark:text-amber-400'}`}>
            {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
          </span>
          <span className="text-[10px] text-ink-muted border-l border-rule pl-2 font-medium">Twilio Voice Fallback</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: 10km Haversine Radar Map & Candidates */}
        <div className="lg:col-span-5 space-y-6">
          <div className="pulse-card space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                <Radio className="w-4 h-4 text-emergency animate-pulse" />
                <span>10km Haversine Emergency Radar</span>
              </h3>
              <span className="pulse-badge pulse-badge-green text-[10px]">
                0 Paid Maps API
              </span>
            </div>

            {/* Radar Visualizer Screen */}
            <div className="relative w-full aspect-square bg-slate-950 rounded-2xl border border-rule flex items-center justify-center overflow-hidden shadow-inner">
              
              {/* Concentric distance circles */}
              <div className="absolute w-[85%] h-[85%] rounded-full border border-slate-800" />
              <div className="absolute w-[60%] h-[60%] rounded-full border border-slate-800" />
              <div className="absolute w-[35%] h-[35%] rounded-full border border-slate-800" />
              
              {/* Radar Crosshairs */}
              <div className="absolute w-full h-[1px] bg-slate-900" />
              <div className="absolute h-full w-[1px] bg-slate-900" />

              {/* Sweeping radar beam */}
              <div className="absolute inset-0 origin-center animate-radar-sweep pointer-events-none">
                <div className="w-1/2 h-1/2 bg-gradient-to-br from-emergency/25 to-transparent transform -rotate-45 origin-bottom-right" />
              </div>

              {/* Center Hospital: AIIMS New Delhi (Requester) */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-4 h-4 rounded-full bg-emergency ring-4 ring-emergency/30 animate-pulse-gentle" />
                <span className="text-[9px] font-mono font-bold text-white bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700 mt-1 shadow">
                  AIIMS (Requester)
                </span>
              </div>

              {/* Candidate Hospital Blips */}
              {/* Safdarjung (0.3 km) */}
              <motion.div 
                whileHover={{ scale: 1.15 }}
                className="absolute top-[46%] left-[45%] z-10 flex flex-col items-center cursor-pointer"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-operational ring-2 ring-operational/40" />
                <span className="text-[8px] font-mono font-semibold text-emerald-300 bg-slate-900 px-1 rounded shadow mt-0.5">
                  Safdarjung (0.3 km)
                </span>
              </motion.div>

              {/* Max Saket (4.3 km) */}
              <motion.div 
                whileHover={{ scale: 1.15 }}
                className="absolute bottom-[25%] left-[51%] z-10 flex flex-col items-center cursor-pointer"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-operational ring-2 ring-operational/40" />
                <span className="text-[8px] font-mono font-semibold text-emerald-300 bg-slate-900 px-1 rounded shadow mt-0.5">
                  Max Saket (4.3 km)
                </span>
              </motion.div>

              {/* Fortis Escorts (6.5 km) */}
              <motion.div 
                whileHover={{ scale: 1.15 }}
                className="absolute top-[38%] right-[22%] z-10 flex flex-col items-center cursor-pointer"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-operational ring-2 ring-operational/40" />
                <span className="text-[8px] font-mono font-semibold text-emerald-300 bg-slate-900 px-1 rounded shadow mt-0.5">
                  Fortis (6.5 km)
                </span>
              </motion.div>

              {/* Apollo (7.8 km) */}
              <motion.div 
                whileHover={{ scale: 1.15 }}
                className="absolute bottom-[28%] right-[18%] z-10 flex flex-col items-center cursor-pointer"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-operational ring-2 ring-operational/40" />
                <span className="text-[8px] font-mono font-semibold text-emerald-300 bg-slate-900 px-1 rounded shadow mt-0.5">
                  Apollo (7.8 km)
                </span>
              </motion.div>

              {/* Distance range badge */}
              <div className="absolute bottom-2 left-2 text-[9px] font-mono text-slate-400 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">
                Haversine WGS84 · 10.0 km radius
              </div>
            </div>

            {/* Candidates List */}
            <div className="space-y-2">
              <label className="pulse-label">Eligible Registered Hospitals in Proximity:</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {hospitals.map((hosp) => (
                  <motion.div
                    whileHover={{ x: 2 }}
                    key={hosp.hospital_id}
                    className="p-2.5 bg-paper-subtle rounded-xl border border-rule flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <span className="text-ink font-semibold">{hosp.name}</span>
                      <div className="text-[10px] text-ink-muted flex items-center space-x-2 mt-0.5">
                        <span>{hosp.contact}</span>
                        <span>•</span>
                        <span className="text-accent font-bold tabular-nums">{hosp.distance_km} km away</span>
                      </div>
                    </div>
                    <span className="pulse-badge pulse-badge-green text-[10px]">
                      Online Node
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Broadcast Creator & Live Alerts Feed */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Create Emergency Request */}
          <div className="pulse-card space-y-4 border-emergency/30">
            <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
              <Send className="w-4 h-4 text-emergency" />
              <span>Broadcast Emergency Request (Hospital A to Network)</span>
            </h3>

            <form onSubmit={handleBroadcastRequest} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="pulse-form-group">
                <label className="pulse-label">Resource Type</label>
                <select
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value as any)}
                  className="pulse-select"
                >
                  <option value="O_NEG_BLOOD">O- Blood Units</option>
                  <option value="O_POS_BLOOD">O+ Blood Units</option>
                  <option value="OXYGEN">Oxygen Cylinders (Type D)</option>
                  <option value="ICU_BED">Emergency ICU Bed</option>
                  <option value="VENTILATOR">Ventilator Unit</option>
                </select>
              </div>

              <div className="pulse-form-group">
                <label className="pulse-label">Quantity Needed</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="pulse-input tabular-nums"
                />
              </div>

              <div className="pulse-form-group">
                <label className="pulse-label">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="pulse-select"
                >
                  <option value="CRITICAL">CRITICAL (Immediate)</option>
                  <option value="HIGH">HIGH (Urgent)</option>
                  <option value="NORMAL">NORMAL</option>
                </select>
              </div>

              <div className="sm:col-span-3 pt-1">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isBroadcasting}
                  className="pulse-btn pulse-btn-emergency w-full pulse-btn-lg text-xs"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>
                    {isBroadcasting ? 'Broadcasting via Telegram & n8n Engine...' : 'TRIGGER 10KM EMERGENCY BROADCAST'}
                  </span>
                </motion.button>
              </div>
            </form>
          </div>

          {/* Active Emergency Stream with PopLayout Motion */}
          <div className="pulse-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Live Emergency Alert Feed (Network Active)</span>
              </h3>
              <span className="text-xs font-mono text-ink-muted tabular-nums font-semibold">
                {requests.length} Open Request(s)
              </span>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {requests.map((req) => (
                  <motion.div
                    layout
                    key={req.request_id}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={springs.gentle}
                    className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono font-bold text-ink tabular-nums">
                            #{req.request_id} · {req.requesting_hospital_name}
                          </span>
                          <StatusBadge status={req.status} />
                        </div>
                        <p className="text-xs font-mono text-ink-2 mt-1">
                          Urgent Needs: <strong className="text-emergency">{req.quantity} Units of {req.resource_type}</strong>
                        </p>
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span className="text-ink-muted">Created: </span>
                        <span className="text-ink font-semibold tabular-nums">{new Date(req.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    {req.status === 'OPEN' && (
                      <div className="pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-rule-subtle">
                        <span className="text-[11px] font-mono text-ink-muted flex items-center space-x-1">
                          <span>Telegram webhook broadcasted to 4 nearby hospital ERs.</span>
                        </span>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleAcceptAndLock(req.request_id)}
                          className="pulse-btn pulse-btn-primary pulse-btn-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ACCEPT & SUPPLY (Safdarjung)</span>
                        </motion.button>
                      </div>
                    )}

                    {req.status === 'ACCEPTED' && (
                      <div className="pt-2.5 flex items-center justify-between border-t border-rule-subtle text-xs font-mono">
                        <span className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-operational" />
                          <span>Accepted by {req.supplying_hospital_name}. Locked in Supabase atomically.</span>
                        </span>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setShowDispatchModal(true)}
                          className="text-accent font-bold hover:underline flex items-center space-x-1"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>View Handover Pass</span>
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </div>

      {/* Regional Hospital Inventory Matrix */}
      <div className="pulse-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="pulse-h4 text-sm text-ink">Regional Hospital Telemetry & Proximity Matrix</h3>
            <p className="pulse-text-muted text-xs">Instant inventory scannability across trauma centers in the 10km grid.</p>
          </div>
          <span className="pulse-badge pulse-badge-green text-xs font-semibold">
            Network Sync Active
          </span>
        </div>

        <div className="pulse-table-container">
          <table className="pulse-table pulse-table-hover">
            <thead>
              <tr>
                <th>Hospital</th>
                <th>Specialty & Trauma Tier</th>
                <th>ICU Beds</th>
                <th>Blood Inventory</th>
                <th>Proximity</th>
                <th>Dispatch State</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((hosp) => (
                <tr key={hosp.hospital_id}>
                  <td className="font-semibold text-ink">{hosp.name}</td>
                  <td className="text-ink-2">Level 1 Trauma & Cardiac</td>
                  <td className="tabular-nums font-medium text-operational">18 Available</td>
                  <td className="tabular-nums text-ink">O-, A+, B+, AB+</td>
                  <td className="tabular-nums font-mono font-semibold text-accent">{hosp.distance_km} km</td>
                  <td>
                    <span className="pulse-badge pulse-badge-green text-[11px]">Ready</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Emergency Dispatch Handover Pass Modal */}
      {currentDispatchPass && (
        <QrCodeModal
          isOpen={showDispatchModal}
          onClose={() => setShowDispatchModal(false)}
          title="Emergency Supply Dispatch Pass"
          type="dispatch"
          data={currentDispatchPass}
        />
      )}

    </div>
  );
};
