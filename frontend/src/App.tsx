import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './views/LandingPage';
import { ReceptionistView } from './views/ReceptionistView';
import { QueueView } from './views/QueueView';
import { EmergencyView } from './views/EmergencyView';

import { AnimatePresence, motion } from 'motion/react';
import { pageTransitionVariants } from './lib/motionTokens';

export function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'receptionist' | 'queue' | 'emergency'>('landing');

  return (
    <div className="min-h-screen flex flex-col bg-clinical-950 text-slate-100 font-sans">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={pageTransitionVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="w-full"
          >
            {activeTab === 'landing' && <LandingPage setActiveTab={setActiveTab} />}
            {activeTab === 'receptionist' && <ReceptionistView />}
            {activeTab === 'queue' && <QueueView />}
            {activeTab === 'emergency' && <EmergencyView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}

export default App;
