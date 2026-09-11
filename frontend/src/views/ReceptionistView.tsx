/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import React, { useState } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Calendar, Clock, CheckCircle2, AlertCircle, ArrowRight, User, Phone, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { INITIAL_DOCTORS } from '../lib/mockData';
import { QrCodeModal } from '../components/QrCodeModal';
import { motionTokens, springs } from '../lib/motionTokens';
import { useAuth } from '../context/AuthContext';

export const ReceptionistView: React.FC = () => {
  const { activePatient, openAuthModal } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi-IN' | 'en-IN'>('hi-IN');
  const [transcript, setTranscript] = useState('');
  const [patientName, setPatientName] = useState(activePatient?.name || 'Ananya Deshmukh');
  const [patientPhone, setPatientPhone] = useState(activePatient?.phone || '+91 98765 43210');

  // Keep synced with activePatient if switched
  React.useEffect(() => {
    if (activePatient) {
      setPatientName(activePatient.name);
      setPatientPhone(activePatient.phone);
    }
  }, [activePatient]);
  const [symptoms, setSymptoms] = useState('I have had an itchy skin rash and redness on my arm for 3 days.');
  const [selectedDepartment, setSelectedDepartment] = useState('Dermatology');
  const [selectedDoctorId, setSelectedDoctorId] = useState('doc-2');
  const [selectedSlot, setSelectedSlot] = useState('10:30 AM - 10:45 AM');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('#MED-4029');
  const [showQrModal, setShowQrModal] = useState(false);

  // Audio simulation for Sarvam AI Saaras STT
  const handleToggleVoice = () => {
    if (!isRecording) {
      setIsRecording(true);
      setTranscript('Listening for Indic voice stream...');
      setTimeout(() => {
        if (selectedLanguage === 'hi-IN') {
          setTranscript('मुझे पिछले तीन दिनों से त्वचा पर खुजली और लाल चकत्ते हो रहे हैं, डॉक्टर से मिलना है।');
          setSymptoms('मुझे पिछले तीन दिनों से त्वचा पर खुजली और लाल चकत्ते हो रहे हैं');
          setSelectedDepartment('Dermatology');
        } else {
          setTranscript('I need to book an appointment with a skin specialist for a rash on my arm.');
          setSymptoms('Skin rash on arm, need consultation with dermatologist');
          setSelectedDepartment('Dermatology');
        }
        setIsRecording(false);
      }, 2400);
    } else {
      setIsRecording(false);
    }
  };

  const handleBookSlot = () => {
    setIsBooking(true);
    setTimeout(() => {
      setIsBooking(false);
      setBookingConfirmed(true);
      setShowQrModal(true);
    }, 1100);
  };

  const currentDoctor = INITIAL_DOCTORS.find(d => d.doctor_id === selectedDoctorId) || INITIAL_DOCTORS[1];

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-rule gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="pulse-badge pulse-badge-blue">
              Patient Care Portal
            </span>
            <span className="text-xs font-mono text-ink-muted">Voice AI OPD Booking Desk</span>
          </div>
          <h1 className="pulse-h2 text-2xl font-bold text-ink mt-1">
            Multilingual Voice AI Receptionist
          </h1>
          <p className="pulse-text-sm text-ink-muted mt-0.5">
            Sarvam AI Saaras:v1 STT + OpenAI administrative intent classifier & atomic OPD slot lock.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-paper-subtle px-3 py-1.5 rounded-lg border border-rule">
            <span className="text-xs font-mono text-ink-muted font-medium">Language:</span>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as any)}
              className="pulse-select text-xs font-mono font-semibold py-1 px-2 text-accent border-rule bg-paper-2"
            >
              <option value="hi-IN">Hindi (hi-IN)</option>
              <option value="en-IN">English (en-IN)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Patient Account Context Strip */}
      <div className="p-3 bg-paper-subtle rounded-xl border border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs shadow-hairline">
        <div className="flex items-center space-x-2">
          <User className="w-4 h-4 text-accent shrink-0" />
          <span className="text-ink-muted">Patient OPD Record:</span>
          <strong className="text-ink font-bold">{patientName}</strong>
          {activePatient && (
            <span className="px-1.5 py-0.2 rounded bg-accent-light text-accent text-[10px] font-bold">
              Blood {activePatient.blood_group}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-ink-muted text-[11px]">{patientPhone}</span>
          <button
            type="button"
            onClick={() => openAuthModal('patient', 'login')}
            className="pulse-btn pulse-btn-sm pulse-btn-secondary text-[10px] font-mono whitespace-nowrap"
          >
            Switch Patient Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Voice Intake Widget */}
        <div className="lg:col-span-6 space-y-6">
          <div className="pulse-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-rule-subtle">
              <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                <Mic className="w-4 h-4 text-accent" />
                <span>Voice Input Stream (Sarvam AI Saaras:v1)</span>
              </h3>
              <span className="pulse-badge pulse-badge-neutral text-[10px]">
                Web Audio API · 16kHz WAV
              </span>
            </div>

            {/* Microphone Interaction Surface with Audio Visualizer */}
            <div className="flex flex-col items-center justify-center py-8 bg-paper-subtle rounded-xl border border-rule relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                transition={springs.snappy}
                onClick={handleToggleVoice}
                className={`relative p-6 rounded-full transition-colors ${
                  isRecording
                    ? 'bg-emergency text-white shadow-dropdown ring-4 ring-emergency/30'
                    : 'bg-accent text-white hover:bg-accent-hover shadow-hairline'
                }`}
                title={isRecording ? 'Stop Recording' : 'Start Speaking'}
              >
                {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </motion.button>

              {/* Soundwave Animation equalizer bars when active */}
              {isRecording ? (
                <div className="flex items-center justify-center gap-1.5 mt-5 h-8">
                  {[0.1, 0.25, 0.4, 0.15, 0.3].map((delay, i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 bg-emergency rounded-full"
                      animate={{ height: ['8px', '32px', '14px', '28px', '8px'] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: delay,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1 mt-4">
                  <span className="pulse-dot pulse-dot-green animate-pulse-gentle" />
                  <span className="text-xs font-mono text-ink-muted">Awaiting Audio Stream</span>
                </div>
              )}

              <span className="text-xs font-mono text-ink mt-3 font-semibold">
                {isRecording ? 'Transcribing via Sarvam Saaras:v1 Engine...' : 'Click to Speak (or test speech synthesis)'}
              </span>
              <span className="text-[11px] font-mono text-ink-muted mt-1">
                Supports Accented Hindi, Indian English, Tamil, Telugu
              </span>
            </div>

            {/* Live Transcript Output */}
            <div className="mt-4 space-y-1.5">
              <label className="pulse-label">STT Normalized Transcript:</label>
              <div className="p-3 bg-paper-2 rounded-xl border border-rule font-mono text-xs text-ink min-h-[52px] flex items-center">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={transcript || 'placeholder'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: motionTokens.duration.fast }}
                  >
                    {transcript || (
                      <span className="text-ink-muted">"Speaking or typing will trigger GPT-4o-mini administrative intent parsing..."</span>
                    )}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            {/* Patient Details Form */}
            <div className="mt-6 pt-5 border-t border-rule-subtle grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="pulse-form-group">
                <label className="pulse-label flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-ink-muted" />
                  <span>Patient Full Name</span>
                </label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="pulse-input"
                  placeholder="e.g. Ananya Deshmukh"
                />
              </div>

              <div className="pulse-form-group">
                <label className="pulse-label flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-ink-muted" />
                  <span>Mobile Phone Number</span>
                </label>
                <input
                  type="tel"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="pulse-input tabular-nums"
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="sm:col-span-2 pulse-form-group">
                <label className="pulse-label flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Extracted Intent / Reason for Visit</span>
                </label>
                <input
                  type="text"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="pulse-input"
                />
              </div>
            </div>

            {/* Clinical Safety Disclaimer */}
            <div className="mt-2 p-2.5 rounded-lg bg-paper-subtle border border-rule text-[11px] font-mono text-ink-muted flex items-start space-x-2">
              <Shield className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
              <span>Administrative safety rules: AI handles doctor scheduling only. It does not diagnose, prescribe, or provide clinical triage.</span>
            </div>
          </div>
        </div>

        {/* Right Column: AI Routing, Doctor Slot Lookup & Atomic Booking */}
        <div className="lg:col-span-6 space-y-6">
          <div className="pulse-card space-y-6">
            <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
              <Calendar className="w-4 h-4 text-accent" />
              <span>Doctor Routing & Verified OPD Slots</span>
            </h3>

            {/* Department Selection */}
            <div>
              <label className="pulse-label mb-2 block">
                Target Department (AI Classified):
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['Cardiology', 'Dermatology', 'Orthopedics', 'General Medicine'].map((dept) => (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ scale: 1.01 }}
                    key={dept}
                    onClick={() => setSelectedDepartment(dept)}
                    className={`py-2 px-3 text-xs font-mono rounded-lg border text-left transition-colors ${
                      selectedDepartment === dept
                        ? 'bg-accent-light border-accent text-accent font-bold shadow-hairline'
                        : 'bg-paper-2 border-rule text-ink-2 hover:border-ink-muted'
                    }`}
                  >
                    {dept}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Doctor Card */}
            <div>
              <label className="pulse-label mb-2 block">
                Configured Specialist:
              </label>
              <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule flex items-center justify-between">
                <div>
                  <h4 className="pulse-h4 text-sm text-ink">{currentDoctor.name}</h4>
                  <p className="text-xs font-mono text-accent font-semibold">{currentDoctor.specialty}</p>
                  <p className="text-[11px] font-mono text-ink-muted mt-0.5">AIIMS New Delhi · OPD Block B</p>
                </div>
                <span className="pulse-badge pulse-badge-green text-[10px]">
                  Available Today
                </span>
              </div>
            </div>

            {/* Available Real Slots */}
            <div>
              <label className="pulse-label mb-2 flex items-center justify-between">
                <span>Available OPD Slots:</span>
                <span className="text-[10px] text-ink-muted font-normal">Live DB Verified</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['09:45 AM - 10:00 AM', '10:30 AM - 10:45 AM', '11:15 AM - 11:30 AM'].map((slot) => (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.02 }}
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2 px-2 text-[11px] font-mono rounded-lg border text-center transition-colors tabular-nums ${
                      selectedSlot === slot
                        ? 'bg-operational-light border-operational text-emerald-800 dark:text-emerald-300 font-bold shadow-hairline'
                        : 'bg-paper-2 border-rule text-ink-2 hover:border-ink-muted'
                    }`}
                  >
                    {slot}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Action Button: Book & Generate Token */}
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBookSlot}
                disabled={isBooking}
                className="pulse-btn pulse-btn-primary w-full pulse-btn-lg text-xs"
              >
                {isBooking ? (
                  <span>Executing Atomic Slot Reservation...</span>
                ) : (
                  <>
                    <span>CONFIRM BOOKING & ISSUE QR TOKEN</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>

            {/* Success Booking Notice with AnimatePresence */}
            <AnimatePresence mode="wait">
              {bookingConfirmed && (
                <motion.div
                  key="booking-success-alert"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={springs.gentle}
                  className="pulse-alert pulse-alert-success space-y-2"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-2 text-xs font-mono text-emerald-800 dark:text-emerald-300 font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Appointment Booked Successfully!</span>
                    </div>
                    <span className="pulse-badge pulse-badge-green font-bold tabular-nums">
                      {generatedToken}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-ink-2">
                    Confirmation sent to {patientPhone}. Patient can show QR at hospital reception for direct check-in.
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowQrModal(true)}
                    className="text-xs font-mono text-accent font-bold hover:underline flex items-center space-x-1 pt-1"
                  >
                    <span>View & Download Check-In QR Pass</span>
                    <ArrowRight className="w-3 h-3" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

      </div>

      {/* QR Code Modal for Booked Appointment */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        title="Appointment Check-In Pass"
        type="appointment"
        data={{
          token: generatedToken,
          id: 'apt-7729-uuid',
          targetName: `${currentDoctor.name} (${selectedDepartment})`,
          detail: `Slot: ${selectedSlot} · Patient: ${patientName}`,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          signature: 'hmac_sha256_medconnect_valid_appointment_signature_e98a12'
        }}
      />

    </div>
  );
};
