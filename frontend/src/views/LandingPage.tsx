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
import { InteractiveNetworkGlobe } from '../components/InteractiveNetworkGlobe';

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
      <section className="pulse-card p-6 sm:p-10 lg:p-12 relative overflow-hidden">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* Left Column: Hero copy and CTAs */}
          <div className="lg:col-span-7 space-y-6">
            
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
              className="pulse-h1 text-3xl sm:text-5xl lg:text-5xl xl:text-6xl font-extrabold text-ink tracking-tight leading-[1.12]"
            >
              Connecting Care When <span className="text-accent">Seconds Count</span>
            </motion.h1>

            {/* Value Proposition */}
            <motion.p
              initial={{ opacity: 0, y: motionTokens.distance.sm }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: motionTokens.duration.normal, delay: 0.1 }}
              className="pulse-text-body text-base sm:text-lg text-ink-2 leading-relaxed"
            >
              MedConnect Pulse unites patients and regional hospital networks into an intelligent, event-driven ecosystem. Multilingual voice triage streamlines routine OPD bookings, while an automated 15km radar network coordinates emergency supplies during the critical Golden Hour.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: motionTokens.distance.sm }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: motionTokens.duration.normal, delay: 0.15 }}
              className="pulse-text-sm text-ink-muted leading-relaxed"
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

          {/* Right Column: Interactive Three.js 3D Geo-Radar Globe */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.2 }}
            className="lg:col-span-5 w-full flex justify-center"
          >
            <InteractiveNetworkGlobe />
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

              <ul className="space-y-3 text-xs sm:text-sm text-ink-2">
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Speak in Your Language:</strong> Book appointments easily by speaking in natural Hindi or English without typing.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Right Doctor, Right Care:</strong> Automatically connects your symptoms to the right department specialist and available OPD slot.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Instant Digital QR Token:</strong> Receive an instant check-in pass directly on your phone with zero paper or receptionist lines.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Live Wait Queue:</strong> Check your live waiting position in real time and get notified when it is your turn.</span>
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
                  Coordinate urgent medical resources across nearby hospitals for ICU beds, rare blood groups, and oxygen supplies during critical emergency hours.
                </p>
              </div>

              <ul className="space-y-3 text-xs sm:text-sm text-ink-2">
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Nearby Hospital Radar:</strong> Scans regional hospitals within 15 km to locate available ICU beds and emergency supplies in seconds.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Instant Emergency Alerts:</strong> Sends immediate SOS notifications to emergency response teams with 1-click confirmation.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Guaranteed Resource Locking:</strong> Automatically reserves critical beds and blood units so they are never double-booked.</span>
                </li>
                <li className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                  <span><strong className="text-ink font-semibold">Secure Ambulance Handover:</strong> Uses digital QR verification for ambulance staff to ensure safe, verified transfer between hospitals.</span>
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
            Core Benefits
          </span>
          <h2 className="pulse-h2 text-2xl font-bold text-ink">
            Fast, Reliable &amp; Connected Healthcare
          </h2>
          <p className="pulse-text-sm text-ink-muted">
            Designed to eliminate waiting delays, prevent booking conflicts, and coordinate life-saving care when every second counts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="p-5 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent-light text-accent flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-ink">Instant Automated Response</h4>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              From patient check-in to emergency hospital broadcasts, automated workflows trigger instant notifications and status updates without human delay.
            </p>
          </div>

          <div className="p-5 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
            <div className="w-9 h-9 rounded-lg bg-operational-light text-operational flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-ink">Guaranteed Bed &amp; Blood Booking</h4>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              Real-time locking ensures that once an ICU bed, blood unit, or doctor slot is confirmed, it is securely held for that patient with zero risk of double booking.
            </p>
          </div>

          <div className="p-5 bg-paper-subtle rounded-xl border border-rule space-y-2.5">
            <div className="w-9 h-9 rounded-lg bg-emergency-light text-emergency flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-sm text-ink">Verified Emergency Transit</h4>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              Digital QR passes track and verify critical medical transfers between ambulances and hospitals, ensuring safe, accountable delivery without paper delays.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
};
