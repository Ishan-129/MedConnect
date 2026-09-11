/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React from 'react';
import { 
  Activity, 
  Cpu, 
  Radio, 
  Users, 
  ShieldCheck, 
  ArrowRight, 
  Clock, 
  MapPin, 
  Sparkles,
  QrCode,
  PhoneCall,
  CheckCircle2,
  HeartPulse,
  Share2,
  Building2,
  UserCheck,
  Zap,
  Truck
} from 'lucide-react';
import { motion } from 'motion/react';
import { motionTokens, springs } from '../lib/motionTokens';

interface LandingPageProps {
  onSelectPortal: (portal: 'patient' | 'hospital', subView?: 'receptionist' | 'queue' | 'emergency') => void;
  setActiveTab?: (tab: 'landing' | 'receptionist' | 'queue' | 'emergency') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectPortal, setActiveTab }) => {
  const handleNavigate = (portal: 'patient' | 'hospital', subView?: 'receptionist' | 'queue' | 'emergency') => {
    if (onSelectPortal) {
      onSelectPortal(portal, subView);
    } else if (setActiveTab && subView) {
      setActiveTab(subView);
    }
  };

  return (
    <div className="space-y-12 py-4 animate-fade-in-up">
      
      {/* 1. HERO SECTION */}
      <section className="pulse-card p-8 sm:p-12 lg:p-14 relative overflow-hidden">
        <div className="relative z-10 max-w-4xl space-y-6">
          
          {/* Live Platform Badge */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.xs }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal }}
            className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-accent-light border border-accent/25 text-accent text-xs font-mono font-semibold shadow-hairline"
          >
            <span className="pulse-dot pulse-dot-green animate-pulse-gentle" />
            <span>Live Healthcare Automation Platform • n8n & Supabase Orchestrated</span>
          </motion.div>

          {/* Main Display Headline */}
          <motion.h1 
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.05 }}
            className="pulse-h1 text-3xl sm:text-5xl lg:text-6xl font-extrabold text-ink tracking-tight leading-[1.12]"
          >
            Connecting Care When <span className="text-accent">Seconds Count</span>
          </motion.h1>

          {/* Value Proposition */}
          <motion.p
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.1 }}
            className="pulse-text-body text-base sm:text-lg text-ink-2 max-w-3xl leading-relaxed"
          >
            MedConnect Pulse unites patients and regional hospital networks into an intelligent, event-driven ecosystem. Multilingual voice triage streamlines routine OPD bookings, while an automated 15km radar network coordinates emergency supplies during the critical Golden Hour.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.15 }}
            className="pulse-text-sm text-ink-muted max-w-3xl leading-relaxed"
          >
            Select your dedicated portal below to access patient outpatient services or hospital emergency operations:
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.2 }}
            className="flex flex-wrap items-center gap-3 pt-2"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNavigate('patient', 'receptionist')}
              className="pulse-btn pulse-btn-primary pulse-btn-lg text-xs"
            >
              <UserCheck className="w-4 h-4" />
              <span>ENTER PATIENT PORTAL</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleNavigate('hospital', 'emergency')}
              className="pulse-btn pulse-btn-emergency pulse-btn-lg text-xs"
            >
              <Radio className="w-4 h-4 text-white" />
              <span>HOSPITAL EMERGENCY PORTAL (ED)</span>
            </motion.button>
          </motion.div>

        </div>

        {/* Telemetry Proof Strip with Tabular Numerals */}
        <div className="mt-12 pt-8 border-t border-rule grid grid-cols-2 md:grid-cols-4 gap-6 font-mono">
          {[
            { value: '<45s', label: 'ER Match Latency', color: 'text-ink' },
            { value: '15 km', label: 'Haversine Radar Proximity', color: 'text-accent' },
            { value: '180s', label: 'Auto-Escalation Call', color: 'text-amber-500' },
            { value: '4 Langs', label: 'Sarvam AI Indic STT', color: 'text-operational' }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: motionTokens.duration.normal }}
              whileHover={{ y: -2 }}
              className="p-3.5 bg-paper-subtle rounded-xl border border-rule shadow-hairline"
            >
              <span className={`text-2xl sm:text-3xl font-bold block tabular-nums ${stat.color}`}>
                {stat.value}
              </span>
              <span className="text-xs text-ink-muted font-medium">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 2. DEDICATED PORTAL ACCESS CARDS */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-mono uppercase text-accent font-bold tracking-wider">
            Portal Selection
          </span>
          <h2 className="pulse-h2 text-2xl sm:text-3xl font-bold text-ink">
            Two Independent Portals, Tailored For Purpose
          </h2>
          <p className="pulse-text-sm text-ink-muted">
            Patients access outpatient care without emergency clutter. Hospital emergency logistics operate in a dedicated, secure control center.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* PORTAL 1: PATIENT PORTAL */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.lg }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="pulse-card space-y-6 border-accent/40 hover:border-accent transition-colors shadow-sm flex flex-col justify-between"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-accent-light border border-accent/30 text-accent flex items-center justify-center">
                  <UserCheck className="w-6 h-6" />
                </div>
                <span className="pulse-badge pulse-badge-blue">
                  PATIENT ACCESS
                </span>
              </div>

              <div>
                <h3 className="pulse-h3 text-xl font-bold text-ink">
                  Patient Care Portal
                </h3>
                <p className="pulse-text-sm text-ink-muted mt-1.5 leading-relaxed">
                  Book OPD appointments effortlessly using voice in Hindi or English, download your instant QR token, and monitor your live waiting position in real time.
                </p>
              </div>

              <ul className="space-y-3 font-mono text-xs text-ink-2">
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Multilingual Voice Intake:</strong> Sarvam AI Saaras:v1 STT listens and extracts symptoms in natural Hindi or English.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Smart Doctor Routing:</strong> Matches clinical symptoms directly to verified department specialists and real OPD slots.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Digital QR Token:</strong> Receive an instant check-in pass e.g. <code className="text-accent font-bold tabular-nums">#MED-4029</code> on your screen.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Live Queue Status:</strong> View your live wait queue position and get notified when it is your turn to see the doctor.</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-rule-subtle">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate('patient', 'receptionist')}
                className="pulse-btn pulse-btn-primary flex-1 pulse-btn-sm justify-center"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Voice AI Booking →</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate('patient', 'queue')}
                className="pulse-btn pulse-btn-secondary flex-1 pulse-btn-sm justify-center"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Track Live Queue →</span>
              </motion.button>
            </div>
          </motion.div>

          {/* PORTAL 2: HOSPITAL & EMERGENCY (ED) PORTAL */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.lg }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.1, ease: motionTokens.easing.smooth }}
            className="pulse-card space-y-6 border-emergency/40 hover:border-emergency transition-colors shadow-sm flex flex-col justify-between"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-emergency-light border border-emergency/30 text-emergency flex items-center justify-center">
                  <Radio className="w-6 h-6 animate-pulse" />
                </div>
                <span className="pulse-badge pulse-badge-emergency">
                  HOSPITAL STAFF & ER
                </span>
              </div>

              <div>
                <h3 className="pulse-h3 text-xl font-bold text-ink">
                  Hospital Emergency Portal (ED)
                </h3>
                <p className="pulse-text-sm text-ink-muted mt-1.5 leading-relaxed">
                  Inter-hospital emergency resource exchange for blood units (O-), oxygen cylinders, and ICU beds with live 15km radar tracking and ambulance QR handover.
                </p>
              </div>

              <ul className="space-y-3 font-mono text-xs text-ink-2">
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink">15km Haversine Radar:</strong> Automatically queries nearby regional hospitals with real-time distance calculations.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Instant Telegram Alert:</strong> Direct push alerts to hospital ER coordinators with 1-click accept actions.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Atomic Supply Lock:</strong> Concurrency-safe PostgreSQL RPC prevents duplicate allocation of scarce resources.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink">Ambulance QR Handshake:</strong> Cryptographically signed digital pass for verified 2-step physical pickup & delivery.</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-rule-subtle">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate('hospital', 'emergency')}
                className="pulse-btn pulse-btn-emergency flex-1 pulse-btn-sm justify-center"
              >
                <Radio className="w-3.5 h-3.5 text-white" />
                <span>Emergency Dispatch Center →</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate('hospital', 'queue')}
                className="pulse-btn pulse-btn-secondary flex-1 pulse-btn-sm justify-center"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Hospital OPD Desk →</span>
              </motion.button>
            </div>
          </motion.div>

        </div>
      </section>

      {/* 3. PLATFORM CAPABILITIES OVERVIEW */}
      <section className="pulse-card p-8 sm:p-10 space-y-6">
        <div className="max-w-2xl space-y-2">
          <span className="text-xs font-mono uppercase text-accent font-bold tracking-wider">
            System Capabilities
          </span>
          <h2 className="pulse-h2 text-2xl font-bold text-ink">
            End-to-End Automated Healthcare Operations
          </h2>
          <p className="pulse-text-sm text-ink-muted">
            Engineered for high reliability, atomic concurrency safety, and rapid response during critical medical windows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="p-5 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent-light text-accent flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-ink">Event-Driven Automation</h4>
            <p className="text-xs text-ink-muted leading-relaxed font-mono">
              Live n8n webhook pipelines orchestrate appointment check-in, queue notifications, emergency broadcasts, and auto-escalation timeouts.
            </p>
          </div>

          <div className="p-5 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
            <div className="w-9 h-9 rounded-lg bg-operational-light text-operational flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-ink">Zero Double-Allocation</h4>
            <p className="text-xs text-ink-muted leading-relaxed font-mono">
              PostgreSQL row-level locking ensures that when emergency supplies or doctor slots are claimed, conflicts are atomically prevented.
            </p>
          </div>

          <div className="p-5 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
            <div className="w-9 h-9 rounded-lg bg-emergency-light text-emergency flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-ink">Physical Chain-of-Custody</h4>
            <p className="text-xs text-ink-muted leading-relaxed font-mono">
              Digital QR passes verify ambulance transit between donor and recipient hospitals with temperature and cold-chain checkpoints.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
};
