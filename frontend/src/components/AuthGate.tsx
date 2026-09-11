import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, ShieldAlert, UserCheck, Building2, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { springs } from '../lib/motionTokens';

interface AuthGateProps {
  role: 'hospital' | 'patient';
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  role,
  title,
  description,
  children,
}) => {
  const { activeHospital, activePatient, isLoadingAuth, openAuthModal } = useAuth();

  // Show neutral loading state while session is being verified from storage
  if (isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] py-16 text-center">
        <div className="w-10 h-10 border-2 border-rule border-t-accent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono text-ink-muted">Verifying secure session...</p>
      </div>
    );
  }

  const isAuthorized = role === 'hospital' ? Boolean(activeHospital) : Boolean(activePatient);

  if (isAuthorized) {
    return <>{children}</>;
  }

  const defaultTitle =
    role === 'hospital'
      ? 'Hospital Desk Authentication Required'
      : 'Patient Care Authentication Required';

  const defaultDescription =
    role === 'hospital'
      ? 'The Emergency Dispatch Center, Resource Radar, and Hospital OPD Desk are restricted to authorized healthcare facility personnel. Please sign in to verify your facility credentials.'
      : 'Viewing your live queue position, consultation token, and digital emergency QR pass requires patient verification. Please sign in or register to access your profile.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="max-w-xl mx-auto my-12 p-8 bg-paper-2 border border-rule rounded-2xl shadow-modal text-center"
    >
      <div
        className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-5 ${
          role === 'hospital'
            ? 'bg-emergency-light text-emergency border border-emergency/30'
            : 'bg-accent-light text-accent border border-accent/30'
        }`}
      >
        {role === 'hospital' ? (
          <Building2 className="w-7 h-7" />
        ) : (
          <UserCheck className="w-7 h-7" />
        )}
      </div>

      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-paper border border-rule text-xs font-mono text-ink-muted mb-3">
        <Lock className="w-3.5 h-3.5 text-attention" />
        <span className="uppercase tracking-wider font-semibold">Protected Healthcare View</span>
      </div>

      <h2 className="pulse-h2 text-xl font-bold text-ink mb-2">
        {title || defaultTitle}
      </h2>

      <p className="text-sm text-ink-muted leading-relaxed mb-6 max-w-md mx-auto">
        {description || defaultDescription}
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => openAuthModal(role, 'login')}
          className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 shadow-hairline transition-all ${
            role === 'hospital'
              ? 'bg-emergency text-white hover:bg-emergency-hover'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          <span>Sign In to {role === 'hospital' ? 'Hospital Desk' : 'Patient Care'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => openAuthModal(role, 'signup')}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-mono text-xs font-medium text-ink bg-paper border border-rule hover:border-ink-muted hover:bg-paper-subtle transition-all"
        >
          {role === 'hospital' ? 'Enroll New Hospital' : 'Create Patient Account'}
        </button>
      </div>
    </motion.div>
  );
};
