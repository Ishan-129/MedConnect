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
  unlockAudioContext,
} from '../services/speechSynthesisService';
import {
  processReceptionistTurn,
  ConversationContext,
  ReceptionistResponse,
} from '../services/receptionistService';
import type { Doctor } from '../types';

export const ReceptionistView: React.FC = () => {
  const { activePatient, activeHospital, openAuthModal } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi-IN' | 'en-IN' | 'ta-IN' | 'te-IN'>('hi-IN');
  const [transcript, setTranscript] = useState('');
  const [patientName, setPatientName] = useState(activePatient?.name || '');
  const [patientPhone, setPatientPhone] = useState(activePatient?.phone || '');
  const [aiSpeechMessage, setAiSpeechMessage] = useState<string>('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [conversationContext, setConversationContext] = useState<ConversationContext>({});

  // Doctor / slot / department state from live backend
  const [departments, setDepartments] = useState<string[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [symptoms, setSymptoms] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('Cardiology');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [bookedAppointmentId, setBookedAppointmentId] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);

  const speechControllerRef = useRef<SpeechRecognitionController | null>(null);

  // Resolve hospital ID: prefer live activeHospital, fall back to known Supabase seed ID
  const hospitalId = activeHospital?.hospital_id || '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0';

  // Keep patient fields synced with AuthContext active patient
  useEffect(() => {
    if (activePatient) {
      setPatientName(activePatient.name);
      setPatientPhone(activePatient.phone);
    }
  }, [activePatient]);

  // ---------------------------------------------------------------
  // LOAD REAL DEPARTMENTS FROM BACKEND
  // ---------------------------------------------------------------
  const fetchDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    try {
      const res = await fetch(`/api/departments?hospitalId=${hospitalId}`);
      if (res.ok) {
        const data = await res.json();
        const list: string[] = (data.departments || []).map((d: any) => d.name).filter(Boolean);
        if (list.length > 0) {
          setDepartments(list);
          if (!list.includes(selectedDepartment)) {
            setSelectedDepartment(list[0]);
          }
        }
      }
    } catch (err) {
      console.warn('[ReceptionistView] Department fetch error:', err);
    } finally {
      setLoadingDepartments(false);
    }
  }, [hospitalId, selectedDepartment]);

  // ---------------------------------------------------------------
  // LOAD REAL DOCTORS FROM BACKEND
  // ---------------------------------------------------------------
  const fetchDoctors = useCallback(async (department: string) => {
    setLoadingDoctors(true);
    try {
      // Map department display name → encoded query param
      const params = new URLSearchParams({ hospitalId });
      if (department) params.set('departmentName', department);

      const res = await fetch(`/api/doctors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const fetched: Doctor[] = data.doctors || [];
        setDoctors(fetched);
        // Auto-select first doctor in department if available
        const deptDoctors = fetched.filter(d =>
          d.department_name?.toLowerCase() === department.toLowerCase()
        );
        const first = deptDoctors[0] || fetched[0];
        if (first) {
          setSelectedDoctorId(first.doctor_id);
        }
      } else {
        console.warn('[ReceptionistView] Failed to load doctors:', res.status);
      }
    } catch (err) {
      console.warn('[ReceptionistView] Doctor fetch error:', err);
    } finally {
      setLoadingDoctors(false);
    }
  }, [hospitalId]);

  // ---------------------------------------------------------------
  // LOAD REAL AVAILABLE SLOTS FROM BACKEND
  // ---------------------------------------------------------------
  const fetchSlots = useCallback(async (doctorId: string) => {
    if (!doctorId) return;
    setLoadingSlots(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/appointments/slots?doctorId=${doctorId}&date=${date}`);
      if (res.ok) {
        const data = await res.json();
        const rawSlots: any[] = data.slots || [];
        // Map backend slot format to display strings
        const displaySlots = rawSlots
          .filter(s => s.status === 'AVAILABLE' || !s.status)
          .map(s => s.display_time || s.start_time || s.time)
          .filter(Boolean)
          .slice(0, 6);
        setAvailableSlots(displaySlots);
        if (displaySlots.length > 0 && !selectedSlot) {
          setSelectedSlot(displaySlots[0]);
        }
      } else {
        console.warn('[ReceptionistView] Failed to load slots:', res.status);
        setAvailableSlots([]);
      }
    } catch (err) {
      console.warn('[ReceptionistView] Slot fetch error:', err);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedSlot]);

  // Initial load on mount
  useEffect(() => {
    fetchDepartments();
    fetchDoctors(selectedDepartment);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload doctors when department changes
  useEffect(() => {
    fetchDoctors(selectedDepartment);
    setSelectedSlot('');
    setAvailableSlots([]);
  }, [selectedDepartment]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load slots when doctor changes
  useEffect(() => {
    if (selectedDoctorId) {
      fetchSlots(selectedDoctorId);
    }
  }, [selectedDoctorId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    unlockAudioContext();

    const langName = getLanguageLabel(selectedLanguage);
    const spoken = await speakText(textToSpeak, langName, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: (err: any) => {
        console.warn('[ReceptionistView] Speech synthesis error:', err);
        setIsSpeaking(false);
      },
    });
    if (!spoken) {
      setIsSpeaking(false);
    }
  }, [selectedLanguage, getLanguageLabel]);

  // Cancel/Stop speaking audio
  const handleStopSpeaking = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  // Replay the AI speech message
  const handleReplayVoice = () => {
    unlockAudioContext();
    if (aiSpeechMessage) {
      playAiVoice(aiSpeechMessage);
    }
  };

  // Real Microphone Capture & Sarvam AI STT + Turn Processing Pipeline
  const handleToggleVoice = async () => {
    unlockAudioContext();
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
          hospitalId,
          patientName: patientName || undefined,
          patientPhone: patientPhone || undefined,
        });

        setIsProcessing(false);

        if (turnResponse.success || turnResponse.status === 'ACTION_COMPLETED' || turnResponse.status === 'NEEDS_MORE_INFO') {
          const finalWords = turnResponse.transcript || spokenText;
          if (finalWords) {
            setTranscript(finalWords);
            setSymptoms(finalWords);
          }

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
              // Match against live doctor list
              const matchedDoc = doctors.find(
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
                             turnResponse.actionPayload?.appointment?.token_number;
            const aptId = turnResponse.actionPayload?.appointment?.appointment_id ||
                          turnResponse.actionPayload?.appointment?.id ||
                          `apt-${Date.now()}`;
            if (tokenNum) {
              setGeneratedToken(tokenNum);
              setBookedAppointmentId(aptId);
              setBookingConfirmed(true);
              setShowQrModal(true);
              if (selectedDoctorId) {
                fetchSlots(selectedDoctorId);
              }
            }
          }

          playAudioCue('success');

          const messageToSpeak = turnResponse.spokenText || turnResponse.aiMessage;
          if (messageToSpeak) {
            setAiSpeechMessage(messageToSpeak);
            await playAiVoice(messageToSpeak);
          }
        } else {
          const errorMsg = turnResponse.aiMessage || turnResponse.error || 'Failed to process voice request.';
          setSpeechError(errorMsg);
          setTranscript(turnResponse.transcript || spokenText || 'Voice intake failed.');
          if (turnResponse.aiMessage) {
            setAiSpeechMessage(turnResponse.aiMessage);
          }
        }
      } catch (err: any) {
        setIsProcessing(false);
        setSpeechError(`Voice intake error: ${err.message || 'Unknown network error'}`);
        setTranscript('Unable to connect to AI Receptionist engine.');
      }
    }
  };

  // Interactive typed question handler — routes directly to AI Receptionist turn engine
  const handleAskQuestion = async (queryText?: string) => {
    unlockAudioContext();
    const textToSend = (queryText || symptoms).trim();
    if (!textToSend || isProcessing) return;

    if (isSpeaking) {
      handleStopSpeaking();
    }

    setIsProcessing(true);
    setSpeechError(null);
    setTranscript(textToSend);

    try {
      const turnResponse: ReceptionistResponse = await processReceptionistTurn({
        channel: 'text',
        text: textToSend,
        language: getLanguageLabel(selectedLanguage),
        context: conversationContext,
        hospitalId,
        patientName: patientName || undefined,
        patientPhone: patientPhone || undefined,
      });

      setIsProcessing(false);

      if (turnResponse.success || turnResponse.status === 'ACTION_COMPLETED' || turnResponse.status === 'NEEDS_MORE_INFO') {
        const finalWords = turnResponse.transcript || textToSend;
        setTranscript(finalWords);
        setSymptoms(finalWords);

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
            const matchedDoc = doctors.find(
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

        // If booking completed via turn
        const tokenNum = turnResponse.actionPayload?.token?.token_number ||
                         turnResponse.actionPayload?.appointment?.token_number;
        const aptId = turnResponse.actionPayload?.appointment?.appointment_id ||
                      turnResponse.actionPayload?.appointment?.id ||
                      `apt-${Date.now()}`;
        if (tokenNum) {
          setGeneratedToken(tokenNum);
          setBookedAppointmentId(aptId);
          setBookingConfirmed(true);
          setShowQrModal(true);
          if (selectedDoctorId) {
            fetchSlots(selectedDoctorId);
          }
        }

        playAudioCue('success');

        const messageToSpeak = turnResponse.spokenText || turnResponse.aiMessage;
        if (messageToSpeak) {
          setAiSpeechMessage(messageToSpeak);
          await playAiVoice(messageToSpeak);
        }
      } else {
        const errorMsg = turnResponse.aiMessage || turnResponse.error || 'Failed to process request.';
        setSpeechError(errorMsg);
        setTranscript(turnResponse.transcript || textToSend);
        if (turnResponse.aiMessage) {
          setAiSpeechMessage(turnResponse.aiMessage);
        }
      }
    } catch (err: any) {
      setIsProcessing(false);
      setSpeechError(`Receptionist error: ${err.message || 'Unknown network error'}`);
      setTranscript('Unable to connect to AI Receptionist engine.');
    }
  };

  // Manual booking handler — real backend only, zero mock/random fallback
  const handleBookSlot = async () => {
    if (!currentDoctor) {
      setSpeechError('No doctor selected. Please wait for the doctor list to load or select a department.');
      return;
    }
    if (!selectedSlot) {
      setSpeechError('No time slot selected. Please choose an available slot.');
      return;
    }
    setIsBooking(true);
    setSpeechError(null);

    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: patientName || 'Walk-in Patient',
          patientPhone: patientPhone || '+91 00000 00000',
          hospitalId,
          doctorId: currentDoctor.doctor_id,
          doctorName: currentDoctor.name,
          departmentName: selectedDepartment,
          date: new Date().toISOString().split('T')[0],
          timeSlot: selectedSlot,
          symptomsSummary: symptoms,
          source: 'voice_receptionist',
        }),
      });

      const data = await res.json();

      if (res.ok && (data.success || data.token)) {
        const tokenNum = data.token?.token_number || data.appointment?.token_number || data.token_number;
        const aptId = data.appointment?.appointment_id || data.appointment?.id || data.appointment_id || `apt-${Date.now()}`;

        if (!tokenNum) {
          setIsBooking(false);
          setSpeechError('Booking failed: No valid token was issued by the backend.');
          return;
        }

        setGeneratedToken(tokenNum);
        setBookedAppointmentId(aptId);
        setIsBooking(false);
        setBookingConfirmed(true);
        setShowQrModal(true);

        playAudioCue('success');
        const confirmSpeech = selectedLanguage === 'hi-IN'
          ? `आपका अपॉइंटमेंट ${currentDoctor.name} के साथ सफलतापूर्वक बुक हो गया है। आपका टोकन नंबर ${tokenNum} है।`
          : `Your appointment with ${currentDoctor.name} has been successfully booked. Your token number is ${tokenNum}.`;
        setAiSpeechMessage(confirmSpeech);
        playAiVoice(confirmSpeech);

        // Refresh slots after booking (one slot just got consumed)
        fetchSlots(selectedDoctorId);
      } else {
        // Real error — no silent demo fallback
        setIsBooking(false);
        const errorMsg = data?.message || data?.error || `Booking failed (HTTP ${res.status}). Please try again.`;
        setSpeechError(errorMsg);
      }
    } catch (e: any) {
      setIsBooking(false);
      setSpeechError(`Network error: Unable to reach booking service. ${e.message || ''}`);
    }
  };

  // Resolved current doctor from live list
  const currentDoctor: Doctor | undefined = doctors.find(d => d.doctor_id === selectedDoctorId) || doctors[0];

  // Departments from live database, falling back to deduplicated doctor departments
  const liveDepartments = Array.from(
    new Set([
      ...departments,
      ...doctors.map(d => d.department_name).filter(Boolean),
    ])
  );
  // Fallback departments if API hasn't returned data yet
  const displayDepartments = liveDepartments.length > 0
    ? liveDepartments
    : ['Cardiology', 'Orthopedics', 'General Medicine', 'Neurology', 'Dermatology'];

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
          <strong className="text-ink font-bold">{patientName || 'Walk-in Patient'}</strong>
          {activePatient && (
            <span className="px-1.5 py-0.2 rounded bg-accent-light text-accent text-[10px] font-bold">
              Blood {activePatient.blood_group}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-ink-muted text-[11px]">{patientPhone || 'No phone on file'}</span>
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

            {/* Real AI Receptionist Live Response Display */}
            {aiSpeechMessage && (
              <div className="mt-3 space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <label className="pulse-label flex items-center space-x-1.5 text-accent">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Receptionist Live Response:</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReplayVoice}
                      className="px-2.5 py-0.5 rounded-md bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-mono font-medium flex items-center gap-1.5 transition-colors border border-accent/20 cursor-pointer"
                      title={isSpeaking ? 'AI is currently speaking (click to restart)' : 'Play AI voice aloud'}
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse text-accent' : ''}`} />
                      <span>{isSpeaking ? 'Speaking...' : 'Play Voice'}</span>
                    </button>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Backend Engine
                    </span>
                  </div>
                </div>
                <div className="p-3.5 bg-paper-subtle rounded-xl border border-accent/30 font-mono text-xs text-ink shadow-hairline">
                  <p className="leading-relaxed whitespace-pre-wrap">{aiSpeechMessage}</p>
                </div>
              </div>
            )}

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
                <label className="pulse-label flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Ask AI Receptionist / Reason for Visit</span>
                  </div>
                  <span className="text-[10px] text-ink-muted font-mono">Press Enter or click Ask AI</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAskQuestion();
                      }
                    }}
                    className="pulse-input flex-1"
                    placeholder="Ask anything, e.g. What doctors are available today? or When is Dr. Rajesh Sharma free?"
                  />
                  <button
                    type="button"
                    onClick={() => handleAskQuestion()}
                    disabled={isProcessing || !symptoms.trim()}
                    className="pulse-btn pulse-btn-primary pulse-btn-sm text-xs font-mono px-3.5 whitespace-nowrap disabled:opacity-50 flex items-center space-x-1"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <span>Ask AI</span>
                        <ArrowRight className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
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
                {displayDepartments.map((dept) => (
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
              {loadingDoctors ? (
                <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule flex items-center space-x-2 text-xs font-mono text-ink-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  <span>Loading doctors from database...</span>
                </div>
              ) : currentDoctor ? (
                <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule flex items-center justify-between">
                  <div>
                    <h4 className="pulse-h4 text-sm text-ink">{currentDoctor.name}</h4>
                    <p className="text-xs font-mono text-accent font-semibold">{currentDoctor.specialty || currentDoctor.specialization || currentDoctor.department_name}</p>
                    <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                      {activeHospital?.name || 'Yashoda Hospital'} · OPD
                    </p>
                  </div>
                  <span className="pulse-badge pulse-badge-green text-[10px]">
                    {currentDoctor.available_today ? 'Available Today' : 'Check Availability'}
                  </span>
                </div>
              ) : (
                <div className="p-3.5 bg-paper-subtle rounded-xl border border-rule text-xs font-mono text-ink-muted">
                  No doctors found for {selectedDepartment}. Backend may be unreachable.
                </div>
              )}

              {/* Doctor selector if multiple doctors in department */}
              {doctors.filter(d => d.department_name?.toLowerCase() === selectedDepartment.toLowerCase()).length > 1 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {doctors
                    .filter(d => d.department_name?.toLowerCase() === selectedDepartment.toLowerCase())
                    .map(d => (
                      <button
                        key={d.doctor_id}
                        onClick={() => setSelectedDoctorId(d.doctor_id)}
                        className={`py-1 px-2 text-[11px] font-mono rounded border transition-colors ${
                          selectedDoctorId === d.doctor_id
                            ? 'bg-accent-light border-accent text-accent font-bold'
                            : 'bg-paper-2 border-rule text-ink-2 hover:border-ink-muted'
                        }`}
                      >
                        {d.name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Available Real Slots */}
            <div>
              <label className="pulse-label mb-2 flex items-center justify-between">
                <span>Available OPD Slots:</span>
                <span className="text-[10px] text-ink-muted font-normal flex items-center gap-1">
                  {loadingSlots ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Loading...</>
                  ) : (
                    'Live DB Verified'
                  )}
                </span>
              </label>
              {availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot) => (
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
              ) : loadingSlots ? (
                <div className="flex items-center gap-2 text-xs font-mono text-ink-muted py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  Fetching live availability...
                </div>
              ) : (
                <div className="text-xs font-mono text-ink-muted py-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {currentDoctor ? `No slots available today for ${currentDoctor.name}.` : 'Select a doctor to see slots.'}
                </div>
              )}
            </div>

            {/* Action Button: Book & Generate Token */}
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBookSlot}
                disabled={isBooking || !currentDoctor || !selectedSlot}
                className="pulse-btn pulse-btn-primary w-full pulse-btn-lg text-xs disabled:opacity-60 disabled:cursor-not-allowed"
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
                    Confirmation sent to {patientPhone || 'patient'}. Patient can show QR at hospital reception for direct check-in.
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
          id: bookedAppointmentId || `apt-${Date.now()}`,
          targetName: currentDoctor ? `${currentDoctor.name} (${selectedDepartment})` : selectedDepartment,
          detail: `Slot: ${selectedSlot} · Patient: ${patientName || 'Walk-in Patient'}`,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          signature: `hmac_sha256_medconnect_${bookedAppointmentId || 'live'}`
        }}
      />

    </div>
  );
};

export default ReceptionistView;
