/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React, { useState } from 'react';
import { Users, QrCode, Play, CheckCircle2, ChevronRight, Clock, AlertCircle, RefreshCw, UserCheck, Stethoscope } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { INITIAL_QUEUE } from '../lib/mockData';
import { QueueEntry, QueueStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { motionTokens, springs } from '../lib/motionTokens';

export const QueueView: React.FC = () => {
  const [roleView, setRoleView] = useState<'patient' | 'reception' | 'doctor'>('reception');
  const [queue, setQueue] = useState<QueueEntry[]>(INITIAL_QUEUE);
  const [checkInToken, setCheckInToken] = useState('');
  const [checkInMsg, setCheckInMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Call Next Patient (Reception Desk Primary Action)
  const handleCallNext = () => {
    setQueue((prevQueue) => {
      let foundCalled = false;
      return prevQueue.map((entry) => {
        if (entry.status === 'IN_CONSULTATION') {
          return { ...entry, status: 'COMPLETED' as QueueStatus };
        }
        if (entry.status === 'CALLED') {
          return { ...entry, status: 'IN_CONSULTATION' as QueueStatus };
        }
        if (!foundCalled && entry.status === 'WAITING') {
          foundCalled = true;
          return { ...entry, status: 'CALLED' as QueueStatus, position: 0 };
        }
        return entry;
      });
    });
  };

  // Simulate QR Check-In Scanner at Reception Desk
  const handleSimulateCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    const token = checkInToken.trim().toUpperCase();
    if (!token) return;

    const exists = queue.some((q) => q.token === token);
    if (exists) {
      setCheckInMsg({ text: `Patient ${token} is already checked in and in the queue.`, error: true });
      return;
    }

    const newEntry: QueueEntry = {
      queue_id: `q-${Date.now()}`,
      appointment_id: `apt-${Date.now()}`,
      patient_id: `pat-${Date.now()}`,
      patient_name: `Checked-In Patient (${token})`,
      doctor_id: 'doc-2',
      doctor_name: 'Dr. Priya Nair',
      department_name: 'Dermatology',
      token: token.startsWith('#') ? token : `#${token}`,
      position: queue.filter((q) => q.status === 'WAITING').length + 1,
      check_in_at: new Date().toISOString(),
      status: 'WAITING',
      estimated_wait_mins: (queue.filter((q) => q.status === 'WAITING').length + 1) * 10
    };

    setQueue([...queue, newEntry]);
    setCheckInMsg({ text: `Check-in verified! ${newEntry.token} enqueued at position ${newEntry.position}.` });
    setCheckInToken('');
  };

  const activeConsultation = queue.find((q) => q.status === 'IN_CONSULTATION');
  const calledPatient = queue.find((q) => q.status === 'CALLED');
  const waitingPatients = queue.filter((q) => q.status === 'WAITING');

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* View Header & Module Badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-rule gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="pulse-badge pulse-badge-green">
              Pillar 1 · Module 2
            </span>
            <span className="text-xs font-mono text-ink-muted">Assigned: Ishan Varshney (Dev 2)</span>
          </div>
          <h1 className="pulse-h2 text-2xl font-bold text-ink mt-1">
            Realtime Live Queue & Check-In Engine
          </h1>
          <p className="pulse-text-sm text-ink-muted mt-0.5">
            QR verification, dynamic FIFO position calculation, receptionist desk triggers & doctor room sync.
          </p>
        </div>

        {/* 3-Way Role Switcher with Animated Pill */}
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
            <span className="relative z-10">Patient Tracker</span>
          </motion.button>
        </div>
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

              {/* QR Scanner Check-in Simulator */}
              <div className="pulse-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                    <QrCode className="w-4 h-4 text-accent" />
                    <span>Reception QR Check-In Terminal</span>
                  </h3>
                  <span className="pulse-badge pulse-badge-neutral text-[10px]">Barcode / OCR</span>
                </div>

                <p className="pulse-text-sm text-ink-muted">
                  Scan patient's appointment QR token upon hospital arrival to enter them into the live queue.
                </p>

                <form onSubmit={handleSimulateCheckIn} className="space-y-3">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={checkInToken}
                      onChange={(e) => setCheckInToken(e.target.value)}
                      placeholder="Enter Token e.g. #MED-4030"
                      className="pulse-input flex-1 uppercase tabular-nums"
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      type="submit"
                      className="pulse-btn pulse-btn-secondary"
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
                  <span className="text-xs font-mono text-ink-muted tabular-nums font-semibold">
                    {queue.length} Active Records
                  </span>
                </div>

                <div className="pulse-table-container">
                  <table className="pulse-table pulse-table-hover">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Token</th>
                        <th>Patient</th>
                        <th>Arrival Time</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <motion.tbody>
                      <AnimatePresence mode="popLayout">
                        {queue.map((item, idx) => (
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
                                <span className="tabular-nums">#{idx + 1}</span>
                              )}
                            </td>
                            <td className="font-bold text-ink tabular-nums">{item.token}</td>
                            <td className="font-medium text-ink-2">{item.patient_name}</td>
                            <td className="text-ink-muted tabular-nums">
                              {new Date(item.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>
                              <StatusBadge status={item.status} />
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
        {roleView === 'patient' && (
          <motion.div
            key="queue-patient-view"
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
              <span className="pulse-badge pulse-badge-blue">Your Live Ticket</span>
              <h2 className="pulse-h1 text-4xl font-extrabold text-accent mt-2 tabular-nums">#MED-4029</h2>
              <p className="text-xs font-mono text-ink-2 mt-1 font-semibold">
                Patient: Meenakshi Iyer · Dr. Priya Nair (Dermatology)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-rule">
              <div className="p-3 bg-paper-subtle rounded-xl border border-rule">
                <span className="text-xs font-mono text-ink-muted block font-medium">Queue Position</span>
                <span className="text-2xl font-mono font-bold text-ink mt-1 block tabular-nums">
                  {waitingPatients.findIndex((p) => p.token === '#MED-4029') + 1 || 3}
                </span>
                <span className="text-[10px] font-mono text-ink-muted">Ahead of you</span>
              </div>
              <div className="p-3 bg-paper-subtle rounded-xl border border-rule">
                <span className="text-xs font-mono text-ink-muted block font-medium">Estimated Wait</span>
                <span className="text-2xl font-mono font-bold text-amber-500 mt-1 block tabular-nums">~15 min</span>
                <span className="text-[10px] font-mono text-ink-muted">Live Telegram sync</span>
              </div>
            </div>

            <div className="pulse-alert pulse-alert-info text-xs font-mono text-ink-2 text-left">
              <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>You will receive an automated Telegram notification when you are 1 patient away from your consultation.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
