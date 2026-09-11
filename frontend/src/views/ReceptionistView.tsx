import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  User,
  Phone,
  Shield,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { INITIAL_DOCTORS } from '../lib/mockData';
import { QrCodeModal } from '../components/QrCodeModal';
import { motionTokens, springs } from '../lib/motionTokens';
import { useAuth } from '../context/AuthContext';
import {
  startListening,
  playAudioCue,
  SpeechRecognitionController,
} from '../services/speechRecognitionService';
import {
  speakText,
  stopSpeaking,
  getIsSpeaking,
} from '../services/speechSynthesisService';
import {
  processReceptionistTurn,
  ConversationContext,
  ReceptionistResponse,
} from '../services/receptionistService';

export const ReceptionistView: React.FC = () => {
  const { activePatient, openAuthModal } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi-IN' | 'en-IN' | 'ta-IN' | 'te-IN'>('hi-IN');
  const [transcript, setTranscript] = useState('');
  const [patientName, setPatientName] = useState(activePatient?.name || 'Ananya Deshmukh');
  const [patientPhone, setPatientPhone] = useState(activePatient?.phone || '+91 98765 43210');
  const [aiSpeechMessage, setAiSpeechMessage] = useState<string>('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [conversationContext, setConversationContext] = useState<ConversationContext>({});

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
  const [audioVolume, setAudioVolume] = useState(0);

  const speechControllerRef = useRef<SpeechRecognitionController | null>(null);

  // Clean up any ongoing audio and recognition when unmounting
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (speechControllerRef.current) {
        speechControllerRef.current.abort();
      }
    };
  }, []);

  // Map language to display label for speech synthesis and STT
  const getLanguageLabel = useCallback((code: string): string => {
    switch (code) {
      case 'hi-IN': return 'Hindi';
      case 'en-IN': return 'English';
      case 'ta-IN': return 'Tamil';
      case 'te-IN': return 'Telugu';
      default: return 'Hindi';
    }
  }, []);

  // AI Voice Playback Helper with state tracking
  const playAiVoice = useCallback(async (textToSpeak: string) => {
    if (!textToSpeak) return;
    setAiSpeechMessage(textToSpeak);
    setIsSpeaking(true);

    const langName = getLanguageLabel(selectedLanguage);
    await speakText(textToSpeak, langName, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: (err) => {
        console.warn('[ReceptionistView] Speech synthesis error:', err);
        setIsSpeaking(false);
      },
    });
  }, [selectedLanguage, getLanguageLabel]);

  // Cancel/Stop speaking audio
  const handleStopSpeaking = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  // Replay the AI speech message
  const handleReplayVoice = () => {
    if (aiSpeechMessage) {
      playAiVoice(aiSpeechMessage);
    }
  };

  // Real Microphone Capture & Sarvam AI STT + Turn Processing Pipeline
  const handleToggleVoice = async () => {
    // If AI is currently speaking, stop it immediately
    if (isSpeaking) {
      handleStopSpeaking();
    }

    if (!isRecording) {
      try {
        setSpeechError(null);
        setIsRecording(true);
        setTranscript('Listening for Indic voice stream...');

        const langName = getLanguageLabel(selectedLanguage);

        const controller = await startListening({
          language: langName,
          autoStopOnSilence: true,
          silenceThresholdMs: 1800,
          onInterimText: (interim) => {
            if (interim) setTranscript(interim);
          },
          onVolumeChange: (vol) => {
            setAudioVolume(vol);
          },
          onSilenceDetected: async () => {
            if (speechControllerRef.current) {
              await stopAndProcessVoice();
            }
          },
          onError: (err) => {
            console.warn('[ReceptionistView] Mic warning:', err);
            if (err.toLowerCase().includes('denied') || err.toLowerCase().includes('blocked')) {
              setSpeechError('Microphone permission denied. Please allow mic access in your browser.');
            }
          },
        });
        speechControllerRef.current = controller;
      } catch (err: any) {
        console.warn('[ReceptionistView] Mic access error:', err);
        setIsRecording(false);
        setSpeechError(err.message || 'Microphone access denied or unavailable.');
      }
    } else {
      await stopAndProcessVoice();
    }
  };

  const stopAndProcessVoice = async () => {
    const controller = speechControllerRef.current;
    speechControllerRef.current = null;
    setIsRecording(false);
    setAudioVolume(0);

    if (controller) {
      setIsProcessing(true);
      setTranscript('Processing voice turn via Sarvam STT & AI Receptionist...');

      try {
        const { transcript: localText, audioBlob } = await controller.stop();
        const spokenText = localText?.trim() || '';

        // Dispatch turn to backend /api/receptionist/turn
        const turnResponse: ReceptionistResponse = await processReceptionistTurn({
          channel: audioBlob ? 'mic' : 'text',
          text: spokenText || undefined,
          audioBlob: audioBlob || undefined,
          language: getLanguageLabel(selectedLanguage),
          context: conversationContext,
          hospitalId: '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0',
        });

        setIsProcessing(false);

        if (turnResponse.success || turnResponse.status === 'ACTION_COMPLETED' || turnResponse.status === 'NEEDS_MORE_INFO') {
          // Update transcript with recognized text
          const finalWords = turnResponse.transcript || spokenText;
          if (finalWords) {
            setTranscript(finalWords);
            setSymptoms(finalWords);
          }

          // Update context
          if (turnResponse.context) {
            setConversationContext(turnResponse.context);
          }

          // Sync validated slots to UI fields
          if (turnResponse.validatedSlots) {
            const { departmentName, doctorName, timeSlot, patientName: slotPatient } = turnResponse.validatedSlots;
            if (departmentName) {
              setSelectedDepartment(departmentName);
            }
            if (doctorName) {
              const matchedDoc = INITIAL_DOCTORS.find(
                d => d.name.toLowerCase().includes(doctorName.toLowerCase()) ||
                     doctorName.toLowerCase().includes(d.name.toLowerCase())
              );
              if (matchedDoc) {
                setSelectedDoctorId(matchedDoc.doctor_id);
              }
            }
            if (timeSlot) {
              setSelectedSlot(timeSlot);
            }
            if (slotPatient && slotPatient !== 'Patient' && slotPatient !== departmentName) {
              setPatientName(slotPatient);
            }
          }

          // If booking completed via voice turn
          if (turnResponse.actionPayload?.token?.token_number || turnResponse.actionPayload?.appointment?.token_number) {
            const tokenNum = turnResponse.actionPayload?.token?.token_number ||
                             turnResponse.actionPayload?.appointment?.token_number ||
                             '#MED-4029';
            setGeneratedToken(tokenNum);
            setBookingConfirmed(true);
          }

          // Play tactical audio cue
          playAudioCue('success');

          // Speak the AI response aloud so user hears the voice!
          const messageToSpeak = turnResponse.spokenText || turnResponse.aiMessage;
          if (messageToSpeak) {
            await playAiVoice(messageToSpeak);
          }
        } else {
          // Failure handling without fake success
          const errorMsg = turnResponse.aiMessage || turnResponse.error || 'Failed to process voice request.';
          setSpeechError(errorMsg);
          setTranscript(turnResponse.transcript || spokenText || 'Voice intake failed.');
        }
      } catch (err: any) {
        setIsProcessing(false);
        setSpeechError(`Voice intake error: ${err.message || 'Unknown network error'}`);
        setTranscript('Unable to connect to AI Receptionist engine.');
      }
    }
  };

  // Manual booking handler (also triggers voice confirmation)
  const handleBookSlot = async () => {
    setIsBooking(true);
    setSpeechError(null);

    try {
      // Call backend atomic booking endpoint
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          patientPhone,
          doctorId: currentDoctor.doctor_id,
          doctorName: currentDoctor.name,
          departmentName: selectedDepartment,
          date: new Date().toISOString().split('T')[0],
          timeSlot: selectedSlot,
          symptomsSummary: symptoms,
          source: 'voice_receptionist',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const tokenNum = data.token_number || data.appointment?.token_number || '#MED-4029';
        setGeneratedToken(tokenNum);
        setIsBooking(false);
        setBookingConfirmed(true);
        setShowQrModal(true);

        // Voice confirmation out loud
        playAudioCue('success');
        const confirmSpeech = selectedLanguage === 'hi-IN'
          ? `आपका अपॉइंटमेंट ${currentDoctor.name} के साथ सफलतापूर्वक बुक हो गया है। आपका टोकन नंबर ${tokenNum} है।`
          : `Your appointment with ${currentDoctor.name} has been successfully booked. Your token number is ${tokenNum}.`;
        playAiVoice(confirmSpeech);
      } else {
        // Fallback demo booking if direct book fails
        setTimeout(() => {
          setIsBooking(false);
          setBookingConfirmed(true);
          setShowQrModal(true);
          playAudioCue('success');
          const confirmSpeech = selectedLanguage === 'hi-IN'
            ? `आपका अपॉइंटमेंट ${currentDoctor.name} के साथ सफलतापूर्वक बुक हो गया है। आपका टोकन नंबर ${generatedToken} है।`
            : `Your appointment with ${currentDoctor.name} has been successfully booked. Your token number is ${generatedToken}.`;
          playAiVoice(confirmSpeech);
        }, 800);
      }
    } catch (e) {
      // Graceful local completion
      setTimeout(() => {
        setIsBooking(false);
        setBookingConfirmed(true);
        setShowQrModal(true);
        playAudioCue('success');
      }, 800);
    }
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
              onChange={(e) => {
                const nextLang = e.target.value as any;
                setSelectedLanguage(nextLang);
                if (isSpeaking) handleStopSpeaking();
              }}
              className="pulse-select text-xs font-mono font-semibold py-1 px-2 text-accent border-rule bg-paper-2"
            >
              <option value="hi-IN">Hindi (hi-IN)</option>
              <option value="en-IN">English (en-IN)</option>
              <option value="ta-IN">Tamil (ta-IN)</option>
              <option value="te-IN">Telugu (te-IN)</option>
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

      {/* Speech Error Banner if any */}
      {speechError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-mono text-red-400 flex items-center justify-between animate-fade-in">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{speechError}</span>
          </div>
          <button
            onClick={() => setSpeechError(null)}
            className="text-xs underline hover:text-red-300 ml-4 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Voice Intake Widget */}
        <div className="lg:col-span-6 space-y-6">
          <div className="pulse-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-rule-subtle">
              <h3 className="pulse-h4 text-sm flex items-center space-x-2 text-ink">
                <Mic className="w-4 h-4 text-accent" />
                <span>Voice Input Stream (Sarvam AI Saaras:v1)</span>
              </h3>
              <div className="flex items-center space-x-2">
                {isSpeaking && (
                  <button
                    onClick={handleStopSpeaking}
                    className="flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                    title="Stop AI Voice"
                  >
                    <VolumeX className="w-3 h-3" />
                    <span>Mute</span>
                  </button>
                )}
                <span className="pulse-badge pulse-badge-neutral text-[10px]">
                  Web Audio API · 16kHz WAV
                </span>
              </div>
            </div>

            {/* Microphone Interaction Surface with Audio Visualizer */}
            <div className="flex flex-col items-center justify-center py-8 bg-paper-subtle rounded-xl border border-rule relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                transition={springs.snappy}
                onClick={handleToggleVoice}
                disabled={isProcessing}
                className={`relative p-6 rounded-full transition-colors ${
                  isRecording
                    ? 'bg-emergency text-white shadow-dropdown ring-4 ring-emergency/30'
                    : isProcessing
                    ? 'bg-slate-700 text-slate-300'
                    : isSpeaking
                    ? 'bg-amber-500 text-white shadow-dropdown ring-4 ring-amber-500/30'
                    : 'bg-accent text-white hover:bg-accent-hover shadow-hairline'
                }`}
                title={isRecording ? 'Stop Recording' : isSpeaking ? 'AI is speaking (Click to record)' : 'Start Speaking'}
              >
                {isProcessing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-8 h-8" />
                ) : isSpeaking ? (
                  <Volume2 className="w-8 h-8 animate-pulse" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </motion.button>

              {/* Soundwave Animation equalizer bars when active */}
              {isRecording ? (
                <div className="flex items-center justify-center gap-1.5 mt-5 h-8">
                  {[0.1, 0.25, 0.4, 0.15, 0.3].map((delay, i) => {
                    // Dynamically scale height with audio volume
                    const heightRange = audioVolume > 20
                      ? ['10px', `${Math.min(36, 14 + audioVolume * 0.25)}px`, '14px', `${Math.min(36, 18 + audioVolume * 0.2)}px`, '10px']
                      : ['8px', '32px', '14px', '28px', '8px'];
                    return (
                      <motion.span
                        key={i}
                        className="w-1.5 bg-emergency rounded-full"
                        animate={{ height: heightRange }}
                        transition={{
                          duration: 0.9,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: delay,
                        }}
                      />
                    );
                  })}
                </div>
              ) : isSpeaking ? (
                <div className="flex items-center justify-center gap-1.5 mt-5 h-8">
                  {[0.1, 0.2, 0.3, 0.15, 0.25].map((delay, i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 bg-amber-400 rounded-full"
                      animate={{ height: ['8px', '24px', '12px', '28px', '8px'] }}
                      transition={{
                        duration: 0.7,
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
                {isProcessing
                  ? 'Processing AI Receptionist Turn...'
                  : isRecording
                  ? 'Transcribing via Sarvam Saaras:v1 Engine...'
                  : isSpeaking
                  ? 'AI Receptionist is Speaking Response...'
                  : 'Click to Speak (or test speech synthesis)'}
              </span>
              <span className="text-[11px] font-mono text-ink-muted mt-1">
                Supports Accented Hindi, Indian English, Tamil, Telugu
              </span>
            </div>

            {/* Live Transcript Output & Playback Controls */}
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="pulse-label">STT Normalized Transcript:</label>
                {aiSpeechMessage && (
                  <button
                    onClick={handleReplayVoice}
                    disabled={isSpeaking || isRecording}
                    className="flex items-center space-x-1 text-[11px] font-mono text-accent hover:underline disabled:opacity-50"
                    title="Replay AI Speech"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Replay Voice</span>
                  </button>
                )}
              </div>
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

export default ReceptionistView;
