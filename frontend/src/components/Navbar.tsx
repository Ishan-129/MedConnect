import React from 'react';
import { Activity, Radio, Users, Cpu, GitBranch, HeartPulse } from 'lucide-react';
import { motion } from 'motion/react';
import { motionTokens } from '../lib/motionTokens';

interface NavbarProps {
  activeTab: 'landing' | 'receptionist' | 'queue' | 'emergency';
  setActiveTab: (tab: 'landing' | 'receptionist' | 'queue' | 'emergency') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper-2 shadow-hairline">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Platform Name */}
          <div 
            className="flex items-center space-x-3 cursor-pointer group select-none"
            onClick={() => setActiveTab('landing')}
          >
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent group-hover:bg-accent/20 transition-colors">
              <HeartPulse className="w-5 h-5 text-accent animate-pulse-gentle" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-ink font-display">
                  MedConnect <span className="text-accent">Pulse</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-accent-light text-accent border border-accent/25 rounded font-semibold">
                  v2.0 Spec
                </span>
              </div>
              <p className="text-[11px] text-ink-muted font-mono tracking-tight hidden sm:block">
                Hospital AI Automation Engine
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1.5 relative">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab('landing')}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activeTab === 'landing' ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activeTab === 'landing' && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-paper-subtle border border-rule shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">Overview</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab('receptionist')}
              className={`relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activeTab === 'receptionist' ? 'text-accent' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activeTab === 'receptionist' && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-accent-light border border-accent/30 shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Cpu className="w-3.5 h-3.5 text-accent relative z-10" />
              <span className="relative z-10">AI Receptionist</span>
              <span className="relative z-10 text-[9px] bg-paper-subtle text-ink-muted px-1.5 py-0.5 rounded border border-rule">Dev 1</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab('queue')}
              className={`relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activeTab === 'queue' ? 'text-emerald-800 dark:text-emerald-300' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activeTab === 'queue' && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-operational-light border border-operational/30 shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Users className="w-3.5 h-3.5 text-operational relative z-10" />
              <span className="relative z-10">Live Queue</span>
              <span className="relative z-10 text-[9px] bg-paper-subtle text-ink-muted px-1.5 py-0.5 rounded border border-rule">Dev 2</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab('emergency')}
              className={`relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activeTab === 'emergency' ? 'text-emergency' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activeTab === 'emergency' && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-emergency-light border border-emergency/30 shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Radio className="w-3.5 h-3.5 text-emergency animate-pulse relative z-10" />
              <span className="relative z-10">Emergency Dispatch</span>
              <span className="relative z-10 text-[9px] bg-paper-subtle text-ink-muted px-1.5 py-0.5 rounded border border-rule">Dev 3 & 4</span>
            </motion.button>
          </nav>

          {/* System Telemetry & Heartbeat */}
          <div className="flex items-center space-x-3">
            <div className="hidden lg:flex items-center space-x-2 bg-paper-subtle px-3 py-1.5 rounded-full border border-rule shadow-hairline">
              <span className="pulse-dot pulse-dot-green animate-pulse-gentle" />
              <span className="text-xs font-mono text-ink-muted">n8n Engine:</span>
              <span className="text-xs font-mono text-operational font-bold">ONLINE</span>
            </div>

            <button
              onClick={() => setActiveTab('landing')}
              className="pulse-btn pulse-btn-secondary pulse-btn-sm"
              title="View Architecture Specification"
            >
              <GitBranch className="w-3.5 h-3.5 text-accent" />
              <span className="font-mono text-xs">Spec Guide</span>
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Sub-Navigation Strip */}
      <div className="md:hidden flex items-center justify-around border-t border-rule-subtle bg-paper-subtle px-2 py-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('landing')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activeTab === 'landing' ? 'bg-paper-2 text-ink font-bold' : 'text-ink-muted'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('receptionist')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activeTab === 'receptionist' ? 'bg-accent text-white font-bold' : 'text-ink-muted'}`}
        >
          Voice AI
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activeTab === 'queue' ? 'bg-operational text-white font-bold' : 'text-ink-muted'}`}
        >
          Queue
        </button>
        <button
          onClick={() => setActiveTab('emergency')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activeTab === 'emergency' ? 'bg-emergency text-white font-bold' : 'text-ink-muted'}`}
        >
          Emergency
        </button>
      </div>
    </header>
  );
};

