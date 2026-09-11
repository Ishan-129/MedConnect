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
  GitBranch, 
  Terminal, 
  Sparkles,
  QrCode,
  PhoneCall,
  CheckCircle2,
  HeartPulse,
  Share2,
  Database
} from 'lucide-react';
import { motion } from 'motion/react';
import { motionTokens, springs } from '../lib/motionTokens';

interface LandingPageProps {
  setActiveTab: (tab: 'landing' | 'receptionist' | 'queue' | 'emergency') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ setActiveTab }) => {
  return (
    <div className="space-y-12 py-4 animate-fade-in-up">
      
      {/* 1. HERO SECTION */}
      <section className="pulse-card p-8 sm:p-12 lg:p-14 relative overflow-hidden">
        <div className="relative z-10 max-w-4xl space-y-6">
          
          {/* Hackathon Benchmark Pill */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.xs }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal }}
            className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-accent-light border border-accent/25 text-accent text-xs font-mono font-semibold"
          >
            <span className="pulse-dot pulse-dot-green animate-pulse-gentle" />
            <span>Hackathon Track: Best Use of n8n in Healthcare Automation</span>
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
            Hospitals operate as isolated silos: front desks drown in repetitive calls, patients wait blind in crowded OPDs, and ER doctors lose golden-hour minutes phoning around for blood, oxygen, and ICU beds.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.15 }}
            className="pulse-text-sm text-ink-muted max-w-3xl leading-relaxed"
          >
            <strong className="text-ink">MedConnect Pulse</strong> is an n8n-powered, event-driven automation platform pairing a multilingual voice AI receptionist with an inter-hospital emergency supply exchange.
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
              onClick={() => setActiveTab('receptionist')}
              className="pulse-btn pulse-btn-primary pulse-btn-lg text-xs"
            >
              <Cpu className="w-4 h-4" />
              <span>LAUNCH AI RECEPTIONIST (PILLAR 1)</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab('emergency')}
              className="pulse-btn pulse-btn-emergency pulse-btn-lg text-xs"
            >
              <Radio className="w-4 h-4 text-white" />
              <span>RADAR EMERGENCY DISPATCH (PILLAR 2)</span>
            </motion.button>
          </motion.div>

        </div>

        {/* Telemetry Proof Strip with Tabular Numerals */}
        <div className="mt-12 pt-8 border-t border-rule grid grid-cols-2 md:grid-cols-4 gap-6 font-mono">
          {[
            { value: '<45s', label: 'ER Match Latency', color: 'text-ink' },
            { value: '10 km', label: 'Haversine Radar Proximity', color: 'text-accent' },
            { value: '180s', label: 'Auto-Escalation to Twilio', color: 'text-amber-500' },
            { value: '4 Langs', label: 'Sarvam AI Indic STT', color: 'text-operational' }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, duration: motionTokens.duration.normal }}
              whileHover={{ y: -2 }}
              className="p-3 bg-paper-subtle rounded-xl border border-rule"
            >
              <span className={`text-2xl sm:text-3xl font-bold block tabular-nums ${stat.color}`}>
                {stat.value}
              </span>
              <span className="text-xs text-ink-muted font-medium">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 2. THE TWO CONNECTED PILLARS */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-mono uppercase text-accent font-bold tracking-wider">
            Architecture Blueprint
          </span>
          <h2 className="pulse-h2 text-2xl sm:text-3xl font-bold text-ink">
            One Platform, Two Connected Pillars
          </h2>
          <p className="pulse-text-sm text-ink-muted">
            Every step runs inside an automated n8n workflow connected to Supabase and Telegram.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Pillar 1 Card */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.lg }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="pulse-card space-y-6 border-accent/30"
          >
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-accent-light border border-accent/30 text-accent flex items-center justify-center">
                <Cpu className="w-6 h-6" />
              </div>
              <span className="pulse-badge pulse-badge-blue">
                PILLAR 1 · DEV 1 & DEV 2
              </span>
            </div>

            <div>
              <h3 className="pulse-h3 text-xl font-bold text-ink">
                AI Receptionist & Live Queue Engine
              </h3>
              <p className="pulse-text-sm text-ink-muted mt-1.5 leading-relaxed">
                Automating routine OPD inquiries and waiting room management through multilingual voice processing and real-time status tracking.
              </p>
            </div>

            <ul className="space-y-3 font-mono text-xs text-ink-2">
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span><strong className="text-ink">Multi-channel voice intake:</strong> Sarvam AI Saaras:v1 STT converts accented Hindi/English into normalized intent.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span><strong className="text-ink">Administrative OpenAI Agent:</strong> GPT-4o-mini routes to configured doctors & verified real OPD slots without diagnosis.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span><strong className="text-ink">Instant Booking & Token:</strong> Issues tamper-proof QR check-in token e.g. <code className="text-accent font-bold tabular-nums">#MED-4029</code> in seconds.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span><strong className="text-ink">Realtime Live Queue:</strong> Reception scans QR upon arrival; patient sees live queue position and turn alert.</span>
              </li>
            </ul>

            <div className="pt-2 flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveTab('receptionist')}
                className="pulse-btn pulse-btn-primary flex-1 pulse-btn-sm"
              >
                Open Voice Booking →
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveTab('queue')}
                className="pulse-btn pulse-btn-secondary flex-1 pulse-btn-sm"
              >
                Open Queue Tracker →
              </motion.button>
            </div>
          </motion.div>

          {/* Pillar 2 Card */}
          <motion.div
            initial={{ opacity: 0, y: motionTokens.distance.lg }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: motionTokens.duration.normal, delay: 0.1, ease: motionTokens.easing.smooth }}
            className="pulse-card space-y-6 border-emergency/30"
          >
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-emergency-light border border-emergency/30 text-emergency flex items-center justify-center">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <span className="pulse-badge pulse-badge-emergency">
                PILLAR 2 · DEV 3 & DEV 4
              </span>
            </div>

            <div>
              <h3 className="pulse-h3 text-xl font-bold text-ink">
                10km Emergency Supply Dispatch
              </h3>
              <p className="pulse-text-sm text-ink-muted mt-1.5 leading-relaxed">
                Connecting nearby hospitals during acute resource shortages (O- Blood, Oxygen, ICU beds) with zero manual phone tag.
              </p>
            </div>

            <ul className="space-y-3 font-mono text-xs text-ink-2">
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                <span><strong className="text-ink">Nearest Hospital Alert Engine:</strong> Targets registered hospitals within a configurable 10 km radius via Haversine math.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                <span><strong className="text-ink">1-Click Telegram Accept & Lock:</strong> Hospital ER managers accept via inline buttons; atomic RPC locks inventory.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                <span><strong className="text-ink">Digital QR Dispatch Pass:</strong> Ambulance receives signed HMAC QR pass for verified handover at supplying hospital.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-emergency shrink-0 mt-0.5" />
                <span><strong className="text-ink">180s Auto-Escalation Call:</strong> If unacknowledged within 3 minutes, n8n triggers an automated Twilio voice call.</span>
              </li>
            </ul>

            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveTab('emergency')}
                className="pulse-btn pulse-btn-emergency w-full pulse-btn-sm"
              >
                Launch Emergency Radar Center →
              </motion.button>
            </div>
          </motion.div>

        </div>
      </section>

      {/* 3. TEAM 4 BIT MINDS & WORKSPACE OWNERSHIP */}
      <section id="branch-guide" className="pulse-card p-8 sm:p-10 space-y-8">
        <div>
          <div className="flex items-center space-x-2">
            <GitBranch className="w-5 h-5 text-accent" />
            <span className="text-xs font-mono uppercase text-accent font-bold tracking-wider">
              Hackathon Team Allocation & Workspace Isolation
            </span>
          </div>
          <h2 className="pulse-h2 text-2xl font-bold text-ink mt-1">
            4 Developers · Modular Scope Boundaries
          </h2>
          <p className="pulse-text-sm text-ink-muted mt-1">
            To prevent merge conflicts and maintain zero downtime, every module is strictly bounded per team contracts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Member 1 */}
          <motion.div
            whileHover={{ y: -3 }}
            transition={springs.snappy}
            className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-ink">Ayank Kumar</span>
              <span className="pulse-badge pulse-badge-blue text-[10px]">
                Lead · Dev 1
              </span>
            </div>
            <p className="text-xs font-mono text-ink font-medium">
              AI Receptionist & Voice AI
            </p>
            <p className="text-[11px] font-mono text-ink-muted">
              Sarvam STT, OpenAI Agent, WF1 Booking, ReceptionistView.
            </p>
            <div className="pt-2 border-t border-rule-subtle">
              <span className="text-[10px] font-mono text-ink-muted block">Dedicated Branch:</span>
              <code className="text-[11px] font-mono text-accent font-semibold">
                feature/ai-receptionist
              </code>
            </div>
          </motion.div>

          {/* Member 2 */}
          <motion.div
            whileHover={{ y: -3 }}
            transition={springs.snappy}
            className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-ink">Ishan Varshney</span>
              <span className="pulse-badge pulse-badge-green text-[10px]">
                Dev 2
              </span>
            </div>
            <p className="text-xs font-mono text-ink font-medium">
              Live Queue & Supabase DB
            </p>
            <p className="text-[11px] font-mono text-ink-muted">
              QR Check-in, Queue State Machine, Migrations, WF2, WF3.
            </p>
            <div className="pt-2 border-t border-rule-subtle">
              <span className="text-[10px] font-mono text-ink-muted block">Dedicated Branch:</span>
              <code className="text-[11px] font-mono text-operational font-semibold">
                feature/live-queue
              </code>
            </div>
          </motion.div>

          {/* Member 3 */}
          <motion.div
            whileHover={{ y: -3 }}
            transition={springs.snappy}
            className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-ink">Ishaan Sama</span>
              <span className="pulse-badge pulse-badge-emergency text-[10px]">
                Dev 3
              </span>
            </div>
            <p className="text-xs font-mono text-ink font-medium">
              Emergency Dispatch UI
            </p>
            <p className="text-[11px] font-mono text-ink-muted">
              10km Radar Map, Alert Feed, 1-Click Supply, QR Pass UI.
            </p>
            <div className="pt-2 border-t border-rule-subtle">
              <span className="text-[10px] font-mono text-ink-muted block">Dedicated Branch:</span>
              <code className="text-[11px] font-mono text-emergency font-semibold">
                feature/emergency-dispatch-ui
              </code>
            </div>
          </motion.div>

          {/* Member 4 */}
          <motion.div
            whileHover={{ y: -3 }}
            transition={springs.snappy}
            className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-ink">Bhavya Gupta</span>
              <span className="pulse-badge pulse-badge-amber text-[10px]">
                Dev 4
              </span>
            </div>
            <p className="text-xs font-mono text-ink font-medium">
              Backend, QA & Escalation
            </p>
            <p className="text-[11px] font-mono text-ink-muted">
              Haversine RPCs, Concurrency Harness, WF4-WF7, Twilio.
            </p>
            <div className="pt-2 border-t border-rule-subtle">
              <span className="text-[10px] font-mono text-ink-muted block">Dedicated Branch:</span>
              <code className="text-[11px] font-mono text-amber-500 font-semibold">
                feature/emergency-dispatch-backend
              </code>
            </div>
          </motion.div>

        </div>

        {/* Copyable Terminal Commands */}
        <div className="p-4 bg-paper-subtle rounded-xl border border-rule space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-ink-muted">
            <span className="flex items-center space-x-1.5">
              <Terminal className="w-3.5 h-3.5 text-accent" />
              <span className="font-semibold text-ink">Git Branching Command Reference:</span>
            </span>
            <span className="text-[10px] text-ink-faint">Run in repository root</span>
          </div>
          <pre className="text-xs font-mono text-ink overflow-x-auto p-3 bg-paper-2 rounded-lg border border-rule">
{`# 1. Switch to your assigned feature branch:
git checkout -b feature/ai-receptionist             # Ayank Kumar (Dev 1)
git checkout -b feature/live-queue                  # Ishan Varshney (Dev 2)
git checkout -b feature/emergency-dispatch-ui       # Ishaan Sama (Dev 3)
git checkout -b feature/emergency-dispatch-backend  # Bhavya Gupta (Dev 4)`}
          </pre>
        </div>
      </section>

    </div>
  );
};
