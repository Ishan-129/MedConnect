import React, { useState } from 'react';
import { Navbar, PortalType } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './views/LandingPage';
import { ReceptionistView } from './views/ReceptionistView';
import { QueueView } from './views/QueueView';
import { EmergencyView } from './views/EmergencyView';

import { AnimatePresence, motion } from 'motion/react';
import { pageTransitionVariants } from './lib/motionTokens';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';

import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';

function MainAppContent() {
  const [activePortal, setActivePortal] = useState<PortalType>('landing');
  const [patientTab, setPatientTab] = useState<'receptionist' | 'queue'>('receptionist');
  const [hospitalTab, setHospitalTab] = useState<'emergency' | 'queue'>('emergency');

  const handleSelectPortal = (portal: 'patient' | 'hospital', subView?: 'receptionist' | 'queue' | 'emergency') => {
    setActivePortal(portal);
    if (portal === 'patient') {
      if (subView === 'queue') setPatientTab('queue');
      else setPatientTab('receptionist');
    } else if (portal === 'hospital') {
      if (subView === 'queue') setHospitalTab('queue');
      else setHospitalTab('emergency');
    }
  };

  const getActiveKey = () => {
    if (activePortal === 'landing') return 'landing';
    if (activePortal === 'patient') return `patient-${patientTab}`;
    return `hospital-${hospitalTab}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink font-sans">
      <Navbar 
        activePortal={activePortal} 
        setActivePortal={setActivePortal}
        patientTab={patientTab}
        setPatientTab={setPatientTab}
        hospitalTab={hospitalTab}
        setHospitalTab={setHospitalTab}
      />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={getActiveKey()}
            variants={pageTransitionVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="w-full"
          >
            <ErrorBoundary>
              {activePortal === 'landing' && (
                <LandingPage onSelectPortal={handleSelectPortal} />
              )}

              {activePortal === 'patient' && (
                <>
                  {patientTab === 'receptionist' && (
                    <ReceptionistView onBackToHome={() => setActivePortal('landing')} />
                  )}
                  {patientTab === 'queue' && (
                    <AuthGate role="patient" title="Patient Queue & Token Tracker">
                      <QueueView defaultRole="patient" hideRoleSwitcher={true} />
                    </AuthGate>
                  )}
                </>
              )}

              {activePortal === 'hospital' && (
                <AuthGate role="hospital" title="Hospital Emergency & Desk Command Center">
                  {hospitalTab === 'emergency' && <EmergencyView />}
                  {hospitalTab === 'queue' && (
                    <QueueView defaultRole="reception" hideRoleSwitcher={false} />
                  )}
                </AuthGate>
              )}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />
      <AuthModal />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

export default App;
