import React from 'react';
import { Radio, Users, Cpu, HeartPulse, UserCheck, Building2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export type PortalType = 'landing' | 'patient' | 'hospital';

interface NavbarProps {
  activePortal: PortalType;
  setActivePortal: (portal: PortalType) => void;
  patientTab: 'receptionist' | 'queue';
  setPatientTab: (tab: 'receptionist' | 'queue') => void;
  hospitalTab: 'emergency' | 'queue';
  setHospitalTab: (tab: 'emergency' | 'queue') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePortal,
  setActivePortal,
  patientTab,
  setPatientTab,
  hospitalTab,
  setHospitalTab,
}) => {
  const { activeHospital, activePatient, openAuthModal } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper-2 shadow-hairline">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Platform Name */}
          <div 
            className="flex items-center space-x-3 cursor-pointer group select-none"
            onClick={() => setActivePortal('landing')}
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
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-ink-muted font-mono tracking-tight hidden sm:block">
                Hospital AI Automation Engine
              </p>
            </div>
          </div>

          {/* Center Navigation: Portals Switcher */}
          <nav className="hidden md:flex items-center space-x-1.5 relative">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActivePortal('landing')}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activePortal === 'landing' ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activePortal === 'landing' && (
                <motion.div
                  layoutId="nav-pill-portal"
                  className="absolute inset-0 bg-paper-subtle border border-rule shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">Overview</span>
            </motion.button>

            {/* Patient Portal Switcher */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActivePortal('patient')}
              className={`relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activePortal === 'patient' ? 'text-accent font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activePortal === 'patient' && (
                <motion.div
                  layoutId="nav-pill-portal"
                  className="absolute inset-0 bg-accent-light border border-accent/30 shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <UserCheck className="w-3.5 h-3.5 text-accent relative z-10" />
              <span className="relative z-10">Patient Portal</span>
            </motion.button>

            {/* Hospital Portal (ED) Switcher */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActivePortal('hospital')}
              className={`relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                activePortal === 'hospital' ? 'text-emergency font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {activePortal === 'hospital' && (
                <motion.div
                  layoutId="nav-pill-portal"
                  className="absolute inset-0 bg-emergency-light border border-emergency/30 shadow-hairline rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Radio className="w-3.5 h-3.5 text-emergency animate-pulse relative z-10" />
              <span className="relative z-10">Hospital Portal (ED)</span>
            </motion.button>
          </nav>

          {/* Right Status & Active Auth Profile */}
          <div className="flex items-center space-x-3">
            <div className="hidden xl:flex items-center space-x-2 bg-paper-subtle px-3 py-1.5 rounded-full border border-rule shadow-hairline">
              <span className="pulse-dot pulse-dot-green animate-pulse-gentle" />
              <span className="text-xs font-mono text-ink-muted">n8n Engine:</span>
              <span className="text-xs font-mono text-operational font-bold">ONLINE</span>
            </div>

            {/* Hospital Portal Active Auth Status */}
            {activePortal === 'hospital' && (
              <>
                {activeHospital ? (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openAuthModal('hospital', 'login')}
                      className="px-2.5 py-1 text-xs font-mono rounded-xl bg-emergency-light text-emergency border border-emergency/30 font-semibold flex items-center space-x-1.5 hover:bg-emergency-light/80 transition-colors"
                      title="Click to Switch Hospital Desk or Register"
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="max-w-[140px] truncate">{activeHospital.name.split(' ')[0]}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-operational shrink-0"></span>
                    </button>
                    <button
                      onClick={() => openAuthModal('hospital', 'signup')}
                      className="text-[11px] font-mono text-ink-muted hover:text-ink hover:underline hidden sm:inline"
                    >
                      + Add Facility
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openAuthModal('hospital', 'login')}
                    className="pulse-btn pulse-btn-emergency pulse-btn-sm text-xs font-mono"
                  >
                    Hospital Sign In
                  </button>
                )}
              </>
            )}

            {/* Patient Portal Active Auth Status */}
            {activePortal === 'patient' && (
              <>
                {activePatient ? (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openAuthModal('patient', 'login')}
                      className="px-2.5 py-1 text-xs font-mono rounded-xl bg-accent-light text-accent border border-accent/30 font-semibold flex items-center space-x-1.5 hover:bg-accent-light/80 transition-colors"
                      title="Click to Switch Patient Profile or Sign Out"
                    >
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="max-w-[120px] truncate">{activePatient.name.split(' ')[0]}</span>
                      <span className="px-1 py-0.2 text-[9px] bg-accent/20 rounded font-bold">
                        {activePatient.blood_group}
                      </span>
                    </button>
                    <button
                      onClick={() => openAuthModal('patient', 'signup')}
                      className="text-[11px] font-mono text-ink-muted hover:text-ink hover:underline hidden sm:inline"
                    >
                      + New Patient
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openAuthModal('patient', 'login')}
                    className="pulse-btn pulse-btn-primary pulse-btn-sm text-xs font-mono"
                  >
                    Patient Sign In
                  </button>
                )}
              </>
            )}

            {/* Landing Overview Auth Trigger */}
            {activePortal === 'landing' && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => openAuthModal('hospital', 'login')}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-paper-subtle border border-rule hover:border-emergency text-ink font-semibold flex items-center space-x-1"
                >
                  <Building2 className="w-3 h-3 text-emergency" />
                  <span className="hidden sm:inline">Hospital Desk</span>
                  <span className="sm:hidden">Hospital</span>
                </button>
                <button
                  onClick={() => openAuthModal('patient', 'login')}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-accent-light text-accent border border-accent/30 font-semibold flex items-center space-x-1 hover:bg-accent-light/80"
                >
                  <UserCheck className="w-3 h-3" />
                  <span className="hidden sm:inline">Patient Portal</span>
                  <span className="sm:hidden">Patient</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Sub-Navigation Strip when inside a portal */}
        {activePortal === 'patient' && (
          <div className="flex items-center space-x-2 py-2 border-t border-rule-subtle bg-paper-subtle/50 px-2">
            <span className="text-[11px] font-mono text-ink-muted mr-2 font-medium">Patient Services:</span>
            <button
              onClick={() => setPatientTab('receptionist')}
              className={`flex items-center space-x-1 px-3 py-1 rounded text-xs font-mono transition-colors ${
                patientTab === 'receptionist' ? 'bg-accent text-white font-bold shadow-hairline' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Cpu className="w-3 h-3" />
              <span>Voice AI Booking</span>
            </button>
            <button
              onClick={() => setPatientTab('queue')}
              className={`flex items-center space-x-1 px-3 py-1 rounded text-xs font-mono transition-colors ${
                patientTab === 'queue' ? 'bg-accent text-white font-bold shadow-hairline' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>My Live Queue & Token</span>
            </button>
          </div>
        )}

        {activePortal === 'hospital' && (
          <div className="flex items-center space-x-2 py-2 border-t border-rule-subtle bg-paper-subtle/50 px-2">
            <span className="text-[11px] font-mono text-ink-muted mr-2 font-medium">Emergency Services:</span>
            <button
              onClick={() => setHospitalTab('emergency')}
              className={`flex items-center space-x-1 px-3 py-1 rounded text-xs font-mono transition-colors ${
                hospitalTab === 'emergency' ? 'bg-emergency text-white font-bold shadow-hairline' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>Emergency Dispatch Center</span>
            </button>
            <button
              onClick={() => setHospitalTab('queue')}
              className={`flex items-center space-x-1 px-3 py-1 rounded text-xs font-mono transition-colors ${
                hospitalTab === 'queue' ? 'bg-emergency text-white font-bold shadow-hairline' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Hospital OPD Desk</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Portal Navigation Strip */}
      <div className="md:hidden flex items-center justify-around border-t border-rule-subtle bg-paper-subtle px-2 py-2 overflow-x-auto">
        <button
          onClick={() => setActivePortal('landing')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activePortal === 'landing' ? 'bg-paper-2 text-ink font-bold' : 'text-ink-muted'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActivePortal('patient')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activePortal === 'patient' ? 'bg-accent text-white font-bold' : 'text-ink-muted'}`}
        >
          Patient
        </button>
        <button
          onClick={() => setActivePortal('hospital')}
          className={`px-2.5 py-1 text-xs font-mono rounded ${activePortal === 'hospital' ? 'bg-emergency text-white font-bold' : 'text-ink-muted'}`}
        >
          Hospital (ED)
        </button>
      </div>
    </header>
  );
};

