import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Calendar,
  Clock,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  HeartPulse,
  ChevronDown,
  User,
  Phone,
  Shield,
  RotateCcw,
  Loader2,
  Zap,
  AlertTriangle,
  PhoneCall,
  RefreshCw,
  QrCode,
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

// Helper to format local date as YYYY-MM-DD (avoids UTC timezone shift issues)
export const getLocalIsoDate = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface ReceptionistViewProps {
  onBackToHome?: () => void;
}

export const ReceptionistView: React.FC<ReceptionistViewProps> = ({ onBackToHome }) => {
  const { activePatient, activeHospital, allHospitals, openAuthModal, getAuthHeader } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi-IN' | 'en-IN' | 'ta-IN' | 'te-IN'>('hi-IN');
  const [transcript, setTranscript] = useState('');
  const [patientName, setPatientName] = useState<string>(
    () => activePatient?.name || ''
  );
  const [patientPhone, setPatientPhone] = useState<string>(
    () => activePatient?.phone || ''
  );
  const [suggestedActions, setSuggestedActions] = useState<{ label: string; text: string }[]>([]);

  // Keep patient credentials in sync with real authenticated user profile
  useEffect(() => {
    if (activePatient) {
      if (activePatient.name) {
        setPatientName(activePatient.name);
        try { localStorage.setItem('medconnect_patient_name', activePatient.name); } catch {}
      }
      if (activePatient.phone) {
        setPatientPhone(activePatient.phone);
        try { localStorage.setItem('medconnect_patient_phone', activePatient.phone); } catch {}
      }
    } else {
      setPatientName('');
      setPatientPhone('');
      setMyAppointments([]);
    }
  }, [activePatient]);
  const [aiSpeechMessage, setAiSpeechMessage] = useState<string>(
    'नमस्ते! मेडकनेक्ट एआई रिसेप्शनिस्ट में आपका स्वागत है। आप डॉक्टर अपॉइंटमेंट बुक कर सकते हैं या अपनी कतार स्थिति देख सकते हैं।'
  );
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [conversationContext, setConversationContext] = useState<ConversationContext>({});

  // Doctor / slot / department state from live backend
  const [departments, setDepartments] = useState<string[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Date and slot selection state
  const [selectedDate, setSelectedDate] = useState(() => getLocalIsoDate());
  const [selectedSlotId, setSelectedSlotId] = useState('');
  interface SlotItem {
    slot_id: string;
    id?: string;
    doctor_id?: string;
    date?: string;
    start_time: string;
    end_time?: string;
    display_time: string;
    status: 'AVAILABLE' | 'BOOKED';
    available: boolean;
  }
  const [detailedSlots, setDetailedSlots] = useState<SlotItem[]>([]);
  const [slotCounts, setSlotCounts] = useState<{ available: number; booked: number; total: number }>({
    available: 0,
    booked: 0,
    total: 0,
  });

  const [symptoms, setSymptoms] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [bookedAppointmentId, setBookedAppointmentId] = useState('');
  const [bookedQrCode, setBookedQrCode] = useState('');
  const [bookedQrSignature, setBookedQrSignature] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);

  // Confirmed database appointments for active patient
  interface ConfirmedAppointment {
    id: string;
    token_number: string;
    status: string;
    date: string;
    time_slot: string;
    doctor_name?: string;
    department_name?: string;
    hospital_name?: string;
    created_at: string;
  }
  const [myAppointments, setMyAppointments] = useState<ConfirmedAppointment[]>([]);
  const [loadingMyAppointments, setLoadingMyAppointments] = useState(false);

  // Emergency One-Click Booking State
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [emergencyRationale, setEmergencyRationale] = useState('');
  const [isEmergencyBooking, setIsEmergencyBooking] = useState(false);
  const [emergencyFallback, setEmergencyFallback] = useState<{
    emergency_contact?: string;
    action?: string;
    alternate_hospitals_url?: string;
  } | null>(null);

  const speechControllerRef = useRef<SpeechRecognitionController | null>(null);

  // Extract token string reliably from any backend response structure
  const extractTokenString = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      if (typeof val.token_number === 'string') return val.token_number;
      if (typeof val.token === 'string') return val.token;
      if (typeof val.token_number === 'object') return extractTokenString(val.token_number);
      if (typeof val.token === 'object') return extractTokenString(val.token);
      if (typeof val.appointment_id === 'string') return val.appointment_id;
      if (typeof val.id === 'string') return val.id;
    }
    return String(val || '');
  };

  // Resolve hospital ID: prefer live activeHospital, fall back to first database hospital
  const hospitalId = activeHospital?.hospital_id || allHospitals[0]?.hospital_id || '';

  // Format date helper
  const formatDisplayDate = useCallback((dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }, []);

  // Generate upcoming 7 days for quick date chips using local calendar dates
  const upcomingDates = useMemo(() => {
    const dates = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const iso = getLocalIsoDate(d);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const subLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dates.push({ iso, label, subLabel, isToday: i === 0 });
    }
    return dates;
  }, []);



  // ---------------------------------------------------------------
  // LOAD REAL DEPARTMENTS FROM BACKEND
  // ---------------------------------------------------------------
  const fetchDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    try {
      let res = await fetch(`/api/departments?hospitalId=${hospitalId}`);
      let list: string[] = [];
      if (res.ok) {
        const data = await res.json();
        list = (data.departments || []).map((d: any) => d.name).filter(Boolean);
      }
      if (list.length === 0) {
        const allRes = await fetch('/api/departments');
        if (allRes.ok) {
          const allData = await allRes.json();
          list = (allData.departments || []).map((d: any) => d.name).filter(Boolean);
        }
      }
      if (list.length > 0) {
        setDepartments(list);
        if (!list.includes(selectedDepartment)) {
          setSelectedDepartment(list[0]);
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
  const fetchDoctors = useCallback(async (targetDepartment?: string) => {
    setLoadingDoctors(true);
    try {
      const params = new URLSearchParams();
      if (hospitalId) params.set('hospitalId', hospitalId);

      let res = await fetch(`/api/doctors?${params.toString()}`);
      let fetched: Doctor[] = [];
      if (res.ok) {
        const data = await res.json();
        fetched = data.doctors || [];
      }

      // If specific hospital/department filter returned 0, fallback to general doctors
      if (fetched.length === 0) {
        const allRes = await fetch('/api/doctors');
        if (allRes.ok) {
          const allData = await allRes.json();
          fetched = allData.doctors || [];
        }
      }

      setDoctors(fetched);
      // Auto-select first doctor in department if available
      const dept = targetDepartment || selectedDepartment;
      const deptDoctors = fetched.filter(d =>
        !dept ||
        d.department_name?.toLowerCase().includes(dept.toLowerCase()) ||
        d.specialization?.toLowerCase().includes(dept.toLowerCase())
      );
      const first = deptDoctors[0] || fetched[0];
      if (first) {
        setSelectedDoctorId(first.doctor_id);
      }
    } catch (err) {
      console.warn('[ReceptionistView] Doctor fetch error:', err);
    } finally {
      setLoadingDoctors(false);
    }
  }, [hospitalId, selectedDepartment]);

  // ---------------------------------------------------------------
  // LOAD REAL AVAILABLE & DETAILED SLOTS FROM BACKEND
  // ---------------------------------------------------------------
  const fetchSlots = useCallback(async (doctorId: string, targetDate?: string) => {
    if (!doctorId) return;
    const dateToQuery = targetDate || selectedDate;
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/appointments/slots?doctorId=${doctorId}&date=${dateToQuery}`);
      if (res.ok) {
        const data = await res.json();
        const rawDetailed: any[] = data.detailedSlots || [];

        let parsedDetailed: SlotItem[] = [];
        if (rawDetailed.length > 0) {
          parsedDetailed = rawDetailed.map((s: any) => ({
            slot_id: s.slot_id || s.id || `slot-${s.display_time}`,
            id: s.slot_id || s.id,
            doctor_id: s.doctor_id,
            date: s.date || dateToQuery,
            start_time: s.start_time,
            end_time: s.end_time,
            display_time: s.display_time || s.start_time || '',
            status: (s.status || '').toUpperCase() === 'AVAILABLE' ? 'AVAILABLE' : 'BOOKED',
            available: s.available ?? ((s.status || '').toUpperCase() === 'AVAILABLE'),
          }));
        } else if (Array.isArray(data.slots)) {
          parsedDetailed = data.slots.map((s: any) => {
            const timeStr = typeof s === 'string' ? s : (s.display_time || s.start_time || '');
            const isAvail = typeof s === 'string' ? true : (s.status === 'AVAILABLE' || !s.status);
            return {
              slot_id: typeof s === 'object' ? (s.slot_id || s.id) : `slot-${timeStr}`,
              start_time: timeStr,
              display_time: timeStr,
              status: isAvail ? 'AVAILABLE' : 'BOOKED',
              available: isAvail,
            };
          });
        }

        setDetailedSlots(parsedDetailed);
        const availList = parsedDetailed.filter(s => s.available).map(s => s.display_time);
        setAvailableSlots(availList);

        const availCount = parsedDetailed.filter(s => s.available).length;
        const bookedCount = parsedDetailed.filter(s => !s.available).length;
        setSlotCounts({
          available: availCount,
          booked: bookedCount,
          total: parsedDetailed.length,
        });

        // Validate currently selected slot against refreshed list
        setSelectedSlot(prev => {
          if (!prev) return '';
          const match = parsedDetailed.find(s => s.display_time === prev && s.available);
          return match ? prev : '';
        });
        setSelectedSlotId(prevId => {
          if (!prevId) return '';
          const match = parsedDetailed.find(s => (s.slot_id === prevId || s.id === prevId) && s.available);
          return match ? prevId : '';
        });
      } else {
        console.warn('[ReceptionistView] Failed to load slots:', res.status);
        setDetailedSlots([]);
        setAvailableSlots([]);
        setSlotCounts({ available: 0, booked: 0, total: 0 });
      }
    } catch (err) {
      console.warn('[ReceptionistView] Slot fetch error:', err);
      setDetailedSlots([]);
      setAvailableSlots([]);
      setSlotCounts({ available: 0, booked: 0, total: 0 });
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedDate]);

  // Synchronous selection handlers ensuring immediate UI & slot state sync
  const handleSelectDepartment = useCallback((dept: string) => {
    setSelectedDepartment(dept);
    setSelectedSlot('');
    setSelectedSlotId('');
    const match = doctors.filter(d =>
      (d.department_name && d.department_name.toLowerCase().includes(dept.toLowerCase())) ||
      (d.specialization && d.specialization.toLowerCase().includes(dept.toLowerCase()))
    );
    const targetDoc = match[0] || doctors[0];
    if (targetDoc) {
      setSelectedDoctorId(targetDoc.doctor_id);
      fetchSlots(targetDoc.doctor_id, selectedDate);
    } else {
      setSelectedDoctorId('');
      setDetailedSlots([]);
      setAvailableSlots([]);
      setSlotCounts({ available: 0, booked: 0, total: 0 });
    }
  }, [doctors, selectedDate, fetchSlots]);

  const handleSelectDoctor = useCallback((docId: string) => {
    setSelectedDoctorId(docId);
    setSelectedSlot('');
    setSelectedSlotId('');
    fetchSlots(docId, selectedDate);
  }, [selectedDate, fetchSlots]);

  const handleSelectDate = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot('');
    setSelectedSlotId('');
    if (selectedDoctorId) {
      fetchSlots(selectedDoctorId, dateStr);
    }
  }, [selectedDoctorId, fetchSlots]);

  // Load patient's confirmed appointments directly from real database (only for logged-in patients)
  const fetchMyAppointments = useCallback(async () => {
    if (!activePatient) {
      setMyAppointments([]);
      return;
    }

    const targetPatientId = activePatient.patient_id;
    const targetPhone = activePatient.phone;

    setLoadingMyAppointments(true);
    try {
      const params = new URLSearchParams();
      if (targetPatientId) params.set('patientId', targetPatientId);
      if (targetPhone) params.set('phone', targetPhone);

      const res = await fetch(`/api/appointments?${params.toString()}`, {
        headers: { ...getAuthHeader() },
      });
      let formatted: ConfirmedAppointment[] = [];
      if (res.ok) {
        const data = await res.json();
        const rawList = data.appointments || [];
        formatted = rawList.map((a: any) => ({
          id: a.appointment_id || a.id,
          token_number: a.token_number,
          status: a.status || 'CONFIRMED',
          date: a.appointment_date || a.date,
          time_slot: a.time_slot || a.slot_time || (a.slots?.start_time ? `${a.slots.start_time.slice(0, 5)}` : ''),
          doctor_name: a.doctors?.name || a.doctor_name,
          department_name: a.departments?.name || a.department_name,
          hospital_name: a.hospitals?.name || a.hospital_name,
          created_at: a.created_at,
        }));
      }

      setMyAppointments(formatted);
    } catch (err) {
      console.warn('[ReceptionistView] Failed to fetch patient appointments:', err);
    } finally {
      setLoadingMyAppointments(false);
    }
  }, [activePatient, getAuthHeader]);

  useEffect(() => {
    fetchMyAppointments();
  }, [fetchMyAppointments]);

  // Initial load on mount
  useEffect(() => {
    fetchDepartments();
    fetchDoctors();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load slots when doctor or date changes
  useEffect(() => {
    if (selectedDoctorId) {
      fetchSlots(selectedDoctorId, selectedDate);
    }
  }, [selectedDoctorId, selectedDate, fetchSlots]);

  // Clean up any ongoing audio and recognition when unmounting, and pre-prime audio on mount
  useEffect(() => {
    unlockAudioContext();
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

    // Stop any stale speech, prime audio pipeline, and set speaking indicator
    stopSpeaking();
    unlockAudioContext();
    setIsSpeaking(true);

    const langName = getLanguageLabel(selectedLanguage);
    try {
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
    } catch {
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
    // Reset any existing voice state so the first click runs cleanly
    stopSpeaking();
    setIsSpeaking(false);
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
      setTranscript('Processing voice turn with AI Receptionist...');

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

          // Sync validated slots or context to UI fields
          const validated = turnResponse.validatedSlots || turnResponse.context;
          if (validated) {
            const departmentName = (validated as any).departmentName || (validated as any).department;
            const doctorName = (validated as any).doctorName || (validated as any).doctor;
            const timeSlot = (validated as any).timeSlot || (validated as any).time_slot;
            const slotPatient = (validated as any).patientName || (validated as any).patient;
            const docId = (validated as any).doctorId || (validated as any).doctor_id;

            if (departmentName) {
              handleSelectDepartment(departmentName);
            }
            if (docId) {
              handleSelectDoctor(docId);
            } else if (doctorName) {
              const matchedDoc = doctors.find(
                d => d.name.toLowerCase().includes(doctorName.toLowerCase()) ||
                     doctorName.toLowerCase().includes(d.name.toLowerCase())
              );
              if (matchedDoc) {
                handleSelectDoctor(matchedDoc.doctor_id);
              }
            }
            if (timeSlot) {
              setSelectedSlot(timeSlot);
            }
            if (slotPatient && slotPatient !== 'Patient' && slotPatient !== departmentName) {
              setPatientName(slotPatient);
            }
          }

          if (turnResponse.suggestedActions && Array.isArray(turnResponse.suggestedActions)) {
            setSuggestedActions(turnResponse.suggestedActions);
          }

          // If booking completed via voice turn
          if (turnResponse.actionPayload?.token?.token_number || turnResponse.actionPayload?.appointment?.token_number || turnResponse.actionPayload?.token || turnResponse.actionPayload?.token_number) {
            const rawTok = turnResponse.actionPayload?.token_number ||
                           turnResponse.actionPayload?.token?.token_number ||
                           turnResponse.actionPayload?.token ||
                           turnResponse.actionPayload?.appointment?.token_number ||
                           turnResponse.actionPayload?.appointment?.token;
            const tokenNum = extractTokenString(rawTok);
            const aptId = turnResponse.actionPayload?.appointment?.appointment_id ||
                          turnResponse.actionPayload?.appointment?.id ||
                          turnResponse.actionPayload?.appointment_id ||
                          `apt-${Date.now()}`;
            if (tokenNum) {
              setGeneratedToken(tokenNum);
              try { localStorage.setItem('medconnect_patient_token', tokenNum); } catch {}
              setBookedAppointmentId(aptId);
              const qrPayload = turnResponse.actionPayload?.qr_code || turnResponse.actionPayload?.qr_reference || turnResponse.actionPayload?.appointment?.qr_code || turnResponse.actionPayload?.appointment?.qr_reference;
              if (qrPayload) setBookedQrCode(typeof qrPayload === 'string' ? qrPayload : JSON.stringify(qrPayload));
              if (turnResponse.actionPayload?.qr_data?.sig) setBookedQrSignature(turnResponse.actionPayload.qr_data.sig);
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
            await playAiVoice(turnResponse.aiMessage);
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

        // Sync validated slots or context to UI fields
        const validated = turnResponse.validatedSlots || turnResponse.context;
        if (validated) {
          const departmentName = (validated as any).departmentName || (validated as any).department;
          const doctorName = (validated as any).doctorName || (validated as any).doctor;
          const timeSlot = (validated as any).timeSlot || (validated as any).time_slot;
          const slotPatient = (validated as any).patientName || (validated as any).patient;
          const docId = (validated as any).doctorId || (validated as any).doctor_id;

          if (departmentName) {
            handleSelectDepartment(departmentName);
          }
          if (docId) {
            handleSelectDoctor(docId);
          } else if (doctorName) {
            const matchedDoc = doctors.find(
              d => d.name.toLowerCase().includes(doctorName.toLowerCase()) ||
                   doctorName.toLowerCase().includes(d.name.toLowerCase())
            );
            if (matchedDoc) {
              handleSelectDoctor(matchedDoc.doctor_id);
            }
          }
          if (timeSlot) {
            setSelectedSlot(timeSlot);
          }
          if (slotPatient && slotPatient !== 'Patient' && slotPatient !== departmentName) {
            setPatientName(slotPatient);
          }
        }

        if (turnResponse.suggestedActions && Array.isArray(turnResponse.suggestedActions)) {
          setSuggestedActions(turnResponse.suggestedActions);
        }

        // If booking completed via turn
        const rawTurnTok = turnResponse.actionPayload?.token_number ||
                           turnResponse.actionPayload?.token?.token_number ||
                           turnResponse.actionPayload?.token ||
                           turnResponse.actionPayload?.appointment?.token_number ||
                           turnResponse.actionPayload?.appointment?.token;
        const tokenNum = extractTokenString(rawTurnTok);
        const aptId = turnResponse.actionPayload?.appointment?.appointment_id ||
                      turnResponse.actionPayload?.appointment?.id ||
                      turnResponse.actionPayload?.appointment_id ||
                      `apt-${Date.now()}`;
        if (tokenNum) {
          setGeneratedToken(tokenNum);
          try {
            localStorage.setItem('medconnect_patient_token', tokenNum);
            if (patientPhone) localStorage.setItem('medconnect_patient_phone', patientPhone);
          } catch {}
          setBookedAppointmentId(aptId);
          const qrPayload = turnResponse.actionPayload?.qr_code || turnResponse.actionPayload?.qr_reference || turnResponse.actionPayload?.appointment?.qr_code || turnResponse.actionPayload?.appointment?.qr_reference;
          if (qrPayload) setBookedQrCode(typeof qrPayload === 'string' ? qrPayload : JSON.stringify(qrPayload));
          if (turnResponse.actionPayload?.qr_data?.sig) setBookedQrSignature(turnResponse.actionPayload.qr_data.sig);
          setBookingConfirmed(true);
          setShowQrModal(true);
          if (selectedDoctorId) {
            fetchSlots(selectedDoctorId);
          }
          fetchMyAppointments();
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
          await playAiVoice(turnResponse.aiMessage);
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
    const finalPhone = (activePatient?.phone || patientPhone || (typeof localStorage !== 'undefined' ? localStorage.getItem('medconnect_patient_phone') : null) || '').trim();
    const finalName = (activePatient?.name || patientName || (typeof localStorage !== 'undefined' ? localStorage.getItem('medconnect_patient_name') : null) || 'Patient').trim();

    if (!finalPhone) {
      setSpeechError('Please enter a patient contact phone number in the intake form above to confirm your appointment booking.');
      return;
    }
    if (!currentDoctor) {
      setSpeechError('No doctor selected. Please wait for the doctor list to load or select a department.');
      return;
    }
    if (!selectedSlot) {
      setSpeechError('No time slot selected. Please choose an available slot.');
      return;
    }

    // Verify that the chosen slot in detailedSlots is actually available
    const chosenSlotItem = detailedSlots.find(s => s.display_time === selectedSlot || s.slot_id === selectedSlotId);
    if (chosenSlotItem && !chosenSlotItem.available) {
      setSpeechError(`⚠️ The ${selectedSlot} slot has already been booked. Please pick another available slot.`);
      fetchSlots(currentDoctor.doctor_id, selectedDate);
      return;
    }

    setIsBooking(true);
    setSpeechError(null);

    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          patientName: finalName,
          patientPhone: finalPhone,
          patientId: activePatient?.patient_id,
          hospitalId,
          doctorId: currentDoctor.doctor_id,
          doctorName: currentDoctor.name,
          departmentName: selectedDepartment,
          date: selectedDate,
          timeSlot: selectedSlot,
          slotId: chosenSlotItem?.slot_id || selectedSlotId || undefined,
          symptomsSummary: symptoms,
          source: 'voice_receptionist',
        }),
      });

      const data = await res.json();

      if (res.ok && (data.success || data.token)) {
        const rawToken = data.token_number || data.token?.token_number || data.token || data.appointment?.token_number || data.appointment?.token;
        const tokenNum = extractTokenString(rawToken) || `#MED-${Date.now().toString().slice(-4)}`;
        const aptId = data.appointment?.appointment_id || data.appointment?.id || data.appointment_id || `apt-${Date.now()}`;

        if (!tokenNum) {
          setIsBooking(false);
          setSpeechError('Booking failed: No valid token was issued by the backend.');
          return;
        }

        // Immediately mark the booked slot as unavailable in the UI state
        setDetailedSlots(prev => prev.map(s => {
          if (s.display_time === selectedSlot || s.slot_id === selectedSlotId || s.slot_id === chosenSlotItem?.slot_id) {
            return { ...s, status: 'BOOKED', available: false };
          }
          return s;
        }));
        setAvailableSlots(prev => prev.filter(t => t !== selectedSlot));
        setSlotCounts(prev => ({
          ...prev,
          available: Math.max(0, prev.available - 1),
          booked: prev.booked + 1,
        }));

        setGeneratedToken(tokenNum);
        try {
          localStorage.setItem('medconnect_patient_token', tokenNum);
          if (finalPhone) localStorage.setItem('medconnect_patient_phone', finalPhone);
          if (finalName) localStorage.setItem('medconnect_patient_name', finalName);
        } catch {}
        setBookedAppointmentId(aptId);
        const qrPayload = data.qr_code || data.qr_reference || data.appointment?.qr_reference;
        if (qrPayload) setBookedQrCode(typeof qrPayload === 'string' ? qrPayload : JSON.stringify(qrPayload));
        if (data.qr_data?.sig) setBookedQrSignature(data.qr_data.sig);
        setIsBooking(false);
        setBookingConfirmed(true);
        setShowQrModal(true);

        playAudioCue('success');
        const confirmSpeech = selectedLanguage === 'hi-IN'
          ? `आपका अपॉइंटमेंट ${currentDoctor.name} के साथ ${formatDisplayDate(selectedDate)} को ${selectedSlot} बजे सफलतापूर्वक बुक हो गया है। आपका टोकन नंबर ${tokenNum} है।`
          : `Your appointment with ${currentDoctor.name} on ${formatDisplayDate(selectedDate)} at ${selectedSlot} has been successfully booked. Your token number is ${tokenNum}.`;
        setAiSpeechMessage(confirmSpeech);
        playAiVoice(confirmSpeech);

        // Refresh slots after booking (one slot just got consumed)
        fetchSlots(currentDoctor.doctor_id, selectedDate);
        fetchMyAppointments();
      } else {
        // Real error — no silent demo fallback
        setIsBooking(false);
        const errorMsg = data?.message || data?.error || `Booking failed (HTTP ${res.status}). Please try again.`;

        // Handle slot conflicts / double booking gracefully
        if (
          errorMsg.toLowerCase().includes('already been booked') ||
          errorMsg.toLowerCase().includes('unavailable') ||
          errorMsg.toLowerCase().includes('slot')
        ) {
          setSpeechError(`⚠️ Conflict: The ${selectedSlot} slot is no longer available. It was just booked by another patient. We've refreshed the schedule — please pick another available slot.`);
          setSelectedSlot('');
          setSelectedSlotId('');
          fetchSlots(selectedDoctorId, selectedDate);
        } else {
          setSpeechError(errorMsg);
        }
      }
    } catch (e: any) {
      setIsBooking(false);
      setSpeechError(`Network error: Unable to reach booking service. ${e.message || ''}`);
    }
  };

  // Real Emergency One-Click Booking Handler — Auto-allocates earliest available specialist slot
  const handleEmergencyBookSlot = async () => {
    const emergPhone = activePatient?.phone || patientPhone || (typeof localStorage !== 'undefined' ? localStorage.getItem('medconnect_patient_phone') : null);
    if (!emergPhone) {
      setSpeechError('Please sign in or enter your contact mobile number to book an emergency OPD slot.');
      openAuthModal('patient', 'login');
      return;
    }
    const emergName = activePatient?.name || patientName || (typeof localStorage !== 'undefined' ? localStorage.getItem('medconnect_patient_name') : null) || 'Emergency Patient';

    setIsEmergencyBooking(true);
    setSpeechError(null);
    setEmergencyFallback(null);

    try {
      const res = await fetch('/api/appointments/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          patientName: emergName,
          patientPhone: emergPhone,
          patientId: activePatient?.patient_id,
          hospitalId,
          department: selectedDepartment || liveDepartments[0] || '',
          departmentName: selectedDepartment || liveDepartments[0] || '',
          symptoms: symptoms || 'Urgent Emergency OPD Request',
          source: 'emergency_one_click',
        }),
      });

      const data = await res.json();

      if (res.ok && (data.success || data.token)) {
        const rawToken = data.token_number || data.token?.token_number || data.token || data.appointment?.token_number || data.appointment?.token;
        const tokenNum = extractTokenString(rawToken) || `#EMERG-${Date.now().toString().slice(-4)}`;
        const aptId = data.appointment?.appointment_id || data.appointment?.id || data.appointment_id || `emerg-apt-${Date.now()}`;
        const docInfo = data.doctor;
        const slotInfo = data.slot;

        if (docInfo?.doctor_id) {
          setSelectedDoctorId(docInfo.doctor_id);
        }
        if (slotInfo?.display_time) {
          setSelectedSlot(slotInfo.display_time);
        }
        if (slotInfo?.slot_id) {
          setSelectedSlotId(slotInfo.slot_id);
        }

        const rationaleMsg = data.selection_rationale || `Emergency slot auto-allocated with ${docInfo?.name || 'Specialist'}.`;
        setEmergencyRationale(rationaleMsg);
        setGeneratedToken(tokenNum);
        try {
          localStorage.setItem('medconnect_patient_token', tokenNum);
          localStorage.setItem('medconnect_patient_phone', emergPhone);
        } catch {}
        setBookedAppointmentId(aptId);
        const qrPayload = data.qr_code || data.qr_reference || data.appointment?.qr_reference;
        if (qrPayload) setBookedQrCode(typeof qrPayload === 'string' ? qrPayload : JSON.stringify(qrPayload));
        if (data.qr_data?.sig) setBookedQrSignature(data.qr_data.sig);
        setIsEmergencyBooking(false);
        setBookingConfirmed(true);
        setShowQrModal(true);

        playAudioCue('success');
        const confirmSpeech = `Emergency appointment confirmed! Allocated ${docInfo?.name || 'doctor'} for ${selectedDepartment}. Your token number is ${tokenNum}.`;
        setAiSpeechMessage(confirmSpeech);
        playAiVoice(confirmSpeech);

        // Refresh slots for allocated doctor
        if (docInfo?.doctor_id) {
          fetchSlots(docInfo.doctor_id, selectedDate);
        }
        fetchMyAppointments();
      } else {
        setIsEmergencyBooking(false);
        const errorMsg = data?.message || data?.error || 'No suitable emergency slot currently available.';
        setSpeechError(`⚠️ Emergency Allocation: ${errorMsg}`);
        if (data?.fallback) {
          setEmergencyFallback(data.fallback);
        } else {
          setEmergencyFallback({
            emergency_contact: '102',
            action: 'CONTACT_EMERGENCY_DESK',
            alternate_hospitals_url: '/api/hospitals/nearby',
          });
        }
      }
    } catch (e: any) {
      setIsEmergencyBooking(false);
      setSpeechError(`Network error: Unable to reach emergency booking service. ${e.message || ''}`);
      setEmergencyFallback({
        emergency_contact: '102',
        action: 'CONTACT_EMERGENCY_DESK',
        alternate_hospitals_url: '/api/hospitals/nearby',
      });
    }
  };

  // Real doctors belonging to the selected department
  const departmentDoctors = useMemo(() => {
    if (!selectedDepartment) return doctors;
    const match = doctors.filter(d =>
      (d.department_name && d.department_name.toLowerCase().includes(selectedDepartment.toLowerCase())) ||
      (d.specialization && d.specialization.toLowerCase().includes(selectedDepartment.toLowerCase()))
    );
    return match.length > 0 ? match : doctors;
  }, [doctors, selectedDepartment]);

  // Resolved current doctor: prefer selected in this department, else first in this department, else first in doctors
  const currentDoctor: Doctor | undefined = useMemo(() => {
    return (
      departmentDoctors.find(d => d.doctor_id === selectedDoctorId) ||
      doctors.find(d => d.doctor_id === selectedDoctorId) ||
      departmentDoctors[0] ||
      doctors[0]
    );
  }, [departmentDoctors, doctors, selectedDoctorId]);

  // Departments from live database, falling back to deduplicated doctor departments
  const liveDepartments = Array.from(
    new Set([
      ...departments,
      ...doctors.map(d => d.department_name).filter(Boolean),
    ])
  );
  // Live departments from database
  const displayDepartments = liveDepartments;

  const languageOptions: { code: 'en-IN' | 'hi-IN' | 'ta-IN' | 'te-IN'; label: string; nativeLabel: string }[] = [
    { code: 'en-IN', label: 'English', nativeLabel: 'English' },
    { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिंदी' },
    { code: 'ta-IN', label: 'Tamil', nativeLabel: 'தமிழ்' },
    { code: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు' },
  ];

  const handleLanguageChange = (nextLang: 'hi-IN' | 'en-IN' | 'ta-IN' | 'te-IN') => {
    setSelectedLanguage(nextLang);
    if (isSpeaking) handleStopSpeaking();
    const greetings: Record<string, string> = {
      'hi-IN': 'नमस्ते! यशोदा हॉस्पिटल के मेडकनेक्ट एआई रिसेप्शनिस्ट में आपका स्वागत है। आप डॉक्टर अपॉइंटमेंट बुक कर सकते हैं या अपनी कतार स्थिति देख सकते हैं।',
      'en-IN': 'Hello! Welcome to Yashoda Hospital MedConnect AI Receptionist. You can book doctor appointments or track your token queue status.',
      'ta-IN': 'வணக்கம்! மெட்கனெக்ட் ஏஐ வரவேற்பாளருக்கு வரவேற்கிறோம். மருத்துவர் சந்திப்பை பதிவு செய்ய பேசவும் அல்லது தட்டச்சு செய்யவும்.',
      'te-IN': 'నమస్కారం! మెడ్‌కనెక్ట్ ఏఐ రిసెప్షనిస్ట్‌కు స్వాగతం. డాక్టర్ అపాయింట్‌మెంట్ బుక్ చేయడానికి మాట్లాడండి లేదా టైప్ చేయండి.',
    };
    if (Object.values(greetings).includes(aiSpeechMessage) || !aiSpeechMessage) {
      setAiSpeechMessage(greetings[nextLang] || greetings['hi-IN']);
    }
  };

  const quickPrompts = [
    { text: 'Book an appointment', query: 'I want to book an appointment with a doctor' },
    { text: 'Check my reports', query: 'How can I check my reports and test results?' },
    { text: 'Find nearest hospital', query: 'Find the nearest hospital with available OPD and emergency' },
  ];

  const handleQuickPromptClick = (prompt: { text: string; query: string }) => {
    setSymptoms(prompt.text);
    handleAskQuestion(prompt.query);
  };

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
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-paper-subtle px-3 py-1.5 rounded-lg border border-rule">
            <span className="text-xs font-mono text-ink-muted font-medium">Language:</span>
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value as any)}
              className="pulse-select text-xs font-mono font-semibold py-1 px-2 text-accent border-rule bg-paper-2"
            >
              <option value="en-IN">English (en-IN)</option>
              <option value="hi-IN">Hindi (hi-IN)</option>
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

      {/* Confirmed Appointments from Database Section */}
      {activePatient && myAppointments.length > 0 && (
        <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl shadow-hairline space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Your Confirmed Appointments in Database ({myAppointments.length})
              </h4>
            </div>
            <button
              onClick={() => fetchMyAppointments()}
              disabled={loadingMyAppointments}
              className="text-[10px] font-mono text-ink-muted hover:text-ink flex items-center space-x-1"
              title="Refresh from Database"
            >
              <RefreshCw className={`w-3 h-3 ${loadingMyAppointments ? 'animate-spin' : ''}`} />
              <span>Sync DB</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {myAppointments.map((apt) => (
              <div
                key={apt.id}
                className="p-3 bg-paper rounded-xl border border-rule shadow-sm hover:border-emerald-500/50 transition-all flex flex-col justify-between space-y-2"
              >
                <div className="flex items-start justify-between">
                  <span className="px-2 py-0.5 rounded-md bg-accent-light text-accent text-xs font-mono font-bold">
                    {apt.token_number}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    apt.status === 'CONFIRMED' || apt.status === 'BOOKED'
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                      : apt.status === 'IN_CONSULTATION'
                      ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                      : apt.status === 'COMPLETED'
                      ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                  }`}>
                    {apt.status}
                  </span>
                </div>

                <div className="text-xs font-mono">
                  <p className="font-bold text-ink">{apt.doctor_name || 'Specialist'}</p>
                  <p className="text-[11px] text-ink-muted">{apt.department_name || 'OPD'} · {apt.hospital_name || 'Hospital'}</p>
                  <p className="text-[11px] text-ink-2 mt-1">
                    📅 {apt.date} {apt.time_slot ? `at ${apt.time_slot}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setGeneratedToken(apt.token_number);
                    setBookedAppointmentId(apt.id);
                    setShowQrModal(true);
                  }}
                  className="w-full py-1 px-2 rounded-lg bg-paper-subtle border border-rule hover:bg-accent-light hover:text-accent hover:border-accent/40 text-[11px] font-mono font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>View QR Pass</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
        
        {/* Left Column: Voice Intake Widget (Styled to match Image 1, 2, 3 references) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="pulse-card relative overflow-hidden p-6 rounded-2xl bg-paper-2 border border-rule shadow-sm">
            
            {/* Top Navigation Bar matching Image 1 */}
            <div className="flex items-center justify-between pb-4 border-b border-rule-subtle gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                  <HeartPulse className="w-4 h-4 text-accent animate-pulse-gentle" />
                </div>
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-ink font-display">
                  MedConnect <span className="text-accent">Pulse</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => onBackToHome ? onBackToHome() : window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex items-center space-x-1.5 text-xs sm:text-sm font-semibold text-ink-muted hover:text-accent transition-colors cursor-pointer py-1 px-2.5 rounded-lg hover:bg-paper-subtle"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Home</span>
              </button>

              <div className="relative">
                <select
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value as any)}
                  className="appearance-none bg-paper-subtle border border-rule hover:border-accent/40 rounded-xl px-3 py-1.5 pr-7 text-xs sm:text-sm font-semibold text-ink cursor-pointer outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="en-IN">English</option>
                  <option value="hi-IN">हिंदी</option>
                  <option value="ta-IN">தமிழ்</option>
                  <option value="te-IN">తెలుగు</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Main Stage: Glowing Mic Button, Title & Language Pills (Image 1) */}
            <div className="flex flex-col items-center justify-center pt-8 pb-4 text-center">
              
              {/* Concentric Soft Glowing Ripple Rings around Mic Button */}
              <div className="relative flex items-center justify-center my-3">
                <div className={`absolute w-44 h-44 rounded-full transition-all duration-700 pointer-events-none ${
                  isRecording
                    ? 'bg-emergency/10 ring-8 ring-emergency/15 animate-ping'
                    : isSpeaking
                    ? 'bg-amber-500/10 ring-8 ring-amber-500/15 animate-pulse'
                    : 'bg-blue-500/5 ring-8 ring-blue-500/10'
                }`} />
                <div className={`absolute w-36 h-36 rounded-full transition-all pointer-events-none ${
                  isRecording
                    ? 'bg-emergency/15'
                    : isSpeaking
                    ? 'bg-amber-500/15'
                    : 'bg-blue-500/10'
                }`} />
                <div className={`absolute w-28 h-28 rounded-full transition-all pointer-events-none ${
                  isRecording
                    ? 'bg-emergency/20'
                    : isSpeaking
                    ? 'bg-amber-500/20'
                    : 'bg-blue-500/15'
                }`} />

                {/* Central Interactive Mic Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  transition={springs.snappy}
                  onClick={handleToggleVoice}
                  disabled={isProcessing}
                  className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                    isRecording
                      ? 'bg-emergency text-white shadow-emergency/40 ring-4 ring-emergency/30'
                      : isProcessing
                      ? 'bg-slate-700 text-slate-300'
                      : isSpeaking
                      ? 'bg-amber-500 text-white shadow-amber-500/40 ring-4 ring-amber-500/30'
                      : 'bg-accent hover:bg-accent-hover text-white shadow-accent/30 hover:shadow-accent/50 ring-4 ring-accent/20'
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
              </div>

              {/* Title & Subtitle from Image 1 */}
              <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight mt-5">
                How can I help you today?
              </h2>
              <p className="text-sm sm:text-base text-ink-muted mt-1.5 font-normal">
                Speak naturally in your preferred language
              </p>

              {/* Language Selection Pills from Image 1 */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                {languageOptions.map((lang) => {
                  const isActive = selectedLanguage === lang.code;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-accent text-white shadow-sm ring-2 ring-accent/30'
                          : 'bg-paper-2 border border-rule text-ink-2 hover:border-accent/50 hover:bg-paper-subtle'
                      }`}
                    >
                      {lang.nativeLabel}
                    </button>
                  );
                })}
              </div>

              {/* Quick Query Suggestion Pills from Image 1 */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt.text}
                    type="button"
                    onClick={() => handleQuickPromptClick(prompt)}
                    className="px-4 py-2 rounded-2xl bg-accent-light/50 hover:bg-accent-light text-accent border border-accent/20 hover:border-accent/40 text-xs sm:text-sm font-medium transition-all cursor-pointer shadow-xs hover:scale-[1.02] active:scale-[0.98]"
                  >
                    "{prompt.text}"
                  </button>
                ))}
              </div>

              {/* Symmetrical Audio Waveform Visualizer from Image 1 */}
              <div className="flex items-center justify-center gap-1 mt-6 h-8">
                {[4, 6, 8, 10, 14, 18, 24, 30, 24, 18, 14, 10, 8, 6, 4].map((baseHeight, idx) => {
                  const activeHeight = isRecording
                    ? Math.min(32, Math.max(6, (audioVolume > 15 ? audioVolume * 0.35 : baseHeight) * (idx % 2 === 0 ? 1.2 : 0.8)))
                    : isSpeaking
                    ? Math.min(28, baseHeight * (idx % 2 === 0 ? 1.1 : 0.7))
                    : baseHeight * 0.45;
                  return (
                    <motion.span
                      key={idx}
                      className={`w-1 rounded-full transition-colors ${
                        isRecording
                          ? 'bg-emergency'
                          : isSpeaking
                          ? 'bg-amber-400'
                          : 'bg-accent'
                      }`}
                      animate={{
                        height: isRecording || isSpeaking ? [`${baseHeight * 0.4}px`, `${activeHeight}px`, `${baseHeight * 0.4}px`] : `${baseHeight * 0.4}px`,
                      }}
                      transition={{
                        duration: isRecording ? 0.6 : 0.85,
                        repeat: isRecording || isSpeaking ? Infinity : 0,
                        ease: 'easeInOut',
                        delay: idx * 0.04,
                      }}
                    />
                  );
                })}
              </div>

              {/* Live Status Label */}
              <div className="mt-3 text-xs font-mono text-ink-muted font-medium">
                {isProcessing
                  ? 'Processing AI Receptionist Turn...'
                  : isRecording
                  ? 'Transcribing your voice stream...'
                  : isSpeaking
                  ? 'AI Receptionist is Speaking Response...'
                  : 'Click the microphone to speak or type below'}
              </div>
            </div>

            {/* Live Transcript Output & Playback Controls (Image 2) */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  STT Normalized Transcript:
                </label>
                {aiSpeechMessage && (
                  <button
                    type="button"
                    onClick={handleReplayVoice}
                    disabled={isSpeaking || isRecording}
                    className="flex items-center space-x-1 text-xs font-medium text-accent hover:underline disabled:opacity-50 cursor-pointer"
                    title="Replay AI Speech"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Replay Voice</span>
                  </button>
                )}
              </div>
              <div className="p-4 bg-paper-2 rounded-2xl border border-rule font-mono text-xs sm:text-sm text-ink min-h-[58px] flex items-center shadow-xs">
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
              <div className="mt-4 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider flex items-center space-x-1.5 text-accent">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Receptionist Live Response:</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReplayVoice}
                      className="px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium flex items-center gap-1.5 transition-colors border border-accent/20 cursor-pointer"
                      title={isSpeaking ? 'AI is currently speaking (click to restart)' : 'Play AI voice aloud'}
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse text-accent' : ''}`} />
                      <span>{isSpeaking ? 'Speaking...' : 'Play Voice'}</span>
                    </button>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Backend Engine
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-paper-subtle rounded-2xl border border-accent/30 text-xs sm:text-sm text-ink shadow-xs">
                  <p className="leading-relaxed whitespace-pre-wrap">{aiSpeechMessage}</p>
                </div>

                {suggestedActions && suggestedActions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-ink-muted font-medium">Available Slots (1-Click Select):</span>
                    {suggestedActions.map((action, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const raw = action.text || action.label;
                          const match = raw.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
                          const chosen = match ? match[1] : raw;
                          setSelectedSlot(chosen);
                          handleAskQuestion(chosen);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all hover:scale-105 active:scale-95 flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        {action.label || action.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Patient Details & Chat Input Block (Image 3) */}
            <div className="mt-8 pt-6 border-t border-rule space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink flex items-center space-x-1.5">
                    <User className="w-4 h-4 text-ink-muted" />
                    <span>Patient Full Name</span>
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => {
                      setPatientName(e.target.value);
                      try { localStorage.setItem('medconnect_patient_name', e.target.value); } catch {}
                    }}
                    className="w-full px-3.5 py-2.5 bg-paper-2 rounded-xl border border-rule focus:border-accent focus:ring-2 focus:ring-accent/20 text-sm text-ink placeholder:text-ink-muted/50 transition-all outline-none"
                    placeholder="e.g. Ananya Deshmukh"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink flex items-center space-x-1.5">
                    <Phone className="w-4 h-4 text-ink-muted" />
                    <span>Phone Number</span>
                  </label>
                  <input
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => {
                      setPatientPhone(e.target.value);
                      try { localStorage.setItem('medconnect_patient_phone', e.target.value); } catch {}
                    }}
                    className="w-full px-3.5 py-2.5 bg-paper-2 rounded-xl border border-rule focus:border-accent focus:ring-2 focus:ring-accent/20 text-sm text-ink placeholder:text-ink-muted/50 transition-all outline-none"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              {/* Chat Block with "ask your query" */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span>Ask AI Receptionist / Reason for Visit</span>
                  </label>
                  <span className="text-[11px] text-ink-muted">Press Enter or click Ask AI</span>
                </div>
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
                    className="flex-1 px-4 py-2.5 bg-paper-2 rounded-xl border border-rule focus:border-accent focus:ring-2 focus:ring-accent/20 text-sm text-ink placeholder:text-ink-muted/60 transition-all outline-none"
                    placeholder="Ask your query, e.g. What doctors are available today? or When is Dr. Rajesh Sharma free?"
                  />
                  <button
                    type="button"
                    onClick={() => handleAskQuestion()}
                    disabled={isProcessing || !symptoms.trim()}
                    className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs sm:text-sm font-semibold shadow-sm flex items-center space-x-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Ask AI</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Clinical Safety Disclaimer */}
              <div className="p-3 rounded-xl bg-paper-subtle border border-rule text-xs text-ink-muted flex items-start space-x-2.5 leading-relaxed">
                <Shield className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span>Administrative safety rules: AI handles doctor scheduling only. It does not diagnose, prescribe, or provide clinical triage.</span>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: AI Routing, Doctor Slot Lookup & Atomic Booking (Image 5) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="pulse-card p-6 rounded-2xl bg-paper-2 border border-rule shadow-sm space-y-6">
            
            {/* Header with Emergency Toggle */}
            <div className="flex items-center justify-between pb-3 border-b border-rule-subtle">
              <h3 className="text-base font-bold text-ink flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-accent" />
                <span>Doctor Routing & Verified OPD Slots</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEmergencyMode(!isEmergencyMode);
                  setEmergencyFallback(null);
                  setSpeechError(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isEmergencyMode
                    ? 'bg-emergency text-white shadow-sm ring-2 ring-emergency/30'
                    : 'bg-paper-subtle border border-rule text-ink-2 hover:border-emergency hover:text-emergency'
                }`}
                title="Toggle Emergency Mode for one-click doctor allocation"
              >
                <AlertTriangle className={`w-3.5 h-3.5 ${isEmergencyMode ? 'text-white animate-pulse' : 'text-emergency'}`} />
                <span>{isEmergencyMode ? 'Emergency Active' : 'Emergency Mode'}</span>
              </button>
            </div>

            {/* Emergency Mode Banner */}
            {isEmergencyMode && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-emergency/10 border border-emergency/30 rounded-xl space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emergency flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 animate-pulse text-emergency" />
                    FAST-TRACK EMERGENCY ONE-CLICK APPOINTMENT
                  </span>
                  <span className="pulse-badge pulse-badge-red text-[10px] py-0.5">Auto-Allocation</span>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">
                  One-click triage automatically finds the earliest available specialist slot in real time. No manual doctor browsing or slot picking required.
                </p>
              </motion.div>
            )}

            {/* 1. Department Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                  1. Select Department:
                </label>
                <span className="text-[11px] font-medium text-ink-muted">
                  {displayDepartments.length} Medical Specialties
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {displayDepartments.map((dept) => {
                  const isSelected = selectedDepartment.toLowerCase() === dept.toLowerCase();
                  return (
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      whileHover={{ scale: 1.01 }}
                      key={dept}
                      type="button"
                      onClick={() => handleSelectDepartment(dept)}
                      className={`py-2.5 px-3.5 text-xs sm:text-sm rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-accent-light/50 border-accent text-accent font-bold shadow-xs ring-2 ring-accent/20'
                          : 'bg-paper-2 border-rule text-ink hover:border-accent/40 hover:bg-paper-subtle'
                      }`}
                    >
                      <span>{dept}</span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {isEmergencyMode ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-xl border border-emergency/30 bg-emergency/5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emergency flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 animate-pulse text-emergency" />
                    Automated Priority Triage
                  </span>
                  <span className="pulse-badge pulse-badge-red text-[10px] py-0.5">Fast-Track OPD Allocation</span>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">
                  System will automatically query real database doctors in <strong>{selectedDepartment}</strong>, identify the earliest available urgent slot, and lock it in one atomic transaction.
                </p>
                <div className="p-3 bg-paper rounded-xl border border-rule text-xs space-y-1.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Target Specialty:</span>
                    <strong className="text-ink">{selectedDepartment}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Doctor Selection:</span>
                    <strong className="text-accent">Auto (Active Specialists: {departmentDoctors.length})</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Slot Priority:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">Earliest Live Available</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Concurrency Safety:</span>
                    <strong className="text-ink">Atomic Lock (Anti-Double-Booking)</strong>
                  </div>
                </div>
              </motion.div>
            ) : (
              <>
                {/* 2. Real Doctor Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                      2. Select Doctor ({selectedDepartment}):
                    </label>
                    <span className="text-[11px] font-medium text-ink-muted">
                      {loadingDoctors ? 'Loading...' : `${departmentDoctors.length} Specialists`}
                    </span>
                  </div>

                  {loadingDoctors ? (
                    <div className="p-4 bg-paper-subtle rounded-xl border border-rule flex items-center space-x-2 text-xs font-medium text-ink-muted">
                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                      <span>Loading doctors from database...</span>
                    </div>
                  ) : departmentDoctors.length > 0 ? (
                    <div className="space-y-2.5">
                      {departmentDoctors.map((doc) => {
                        const isSelected = selectedDoctorId === doc.doctor_id;
                        return (
                          <motion.div
                            key={doc.doctor_id}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => handleSelectDoctor(doc.doctor_id)}
                            className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-accent-light/40 border-accent shadow-xs ring-2 ring-accent/20'
                                : 'bg-paper-subtle border-rule hover:border-accent/40 hover:bg-paper-2'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className={`text-sm font-bold ${isSelected ? 'text-accent' : 'text-ink'}`}>
                                    {doc.name}
                                  </h4>
                                  {isSelected && (
                                    <span className="px-2 py-0.5 rounded-full bg-accent text-white text-[10px] font-bold">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-ink-2 font-medium mt-0.5">
                                  {doc.specialization || doc.specialty || doc.department_name}
                                </p>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-muted">
                                  <span>Room: <strong className="text-ink font-semibold">{doc.room_number || 'OPD 101'}</strong></span>
                                  <span>·</span>
                                  <span>Fee: <strong className="text-ink font-semibold">₹{doc.consultation_fee || 500}</strong></span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Live Slots
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-paper-subtle rounded-xl border border-rule text-xs text-ink-muted">
                      No specialists found for {selectedDepartment}. Backend may be unreachable.
                    </div>
                  )}
                </div>

                {/* 3. Date Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                      3. Select Appointment Date:
                    </label>
                    <div className="flex items-center gap-1 text-xs font-semibold text-accent">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDisplayDate(selectedDate)}</span>
                    </div>
                  </div>

                  {/* Quick Date Chips */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {upcomingDates.map((item) => {
                      const isSelected = selectedDate === item.iso;
                      return (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          key={item.iso}
                          type="button"
                          onClick={() => handleSelectDate(item.iso)}
                          className={`flex-shrink-0 px-3.5 py-2 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-accent border-accent text-white font-bold shadow-sm ring-2 ring-accent/20'
                              : 'bg-paper-2 border-rule text-ink hover:border-accent/40 hover:bg-paper-subtle'
                          }`}
                        >
                          <div className="text-xs font-semibold">{item.label}</div>
                          <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-ink-muted'}`}>
                            {item.subLabel}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Custom Date Input for manual picking */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 p-2.5 bg-paper-subtle rounded-xl border border-rule text-xs">
                    <span className="text-ink-muted flex items-center gap-1.5 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-ink-muted" />
                      Custom Date:
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      min={getLocalIsoDate()}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleSelectDate(e.target.value);
                        }
                      }}
                      className="bg-paper-2 border border-rule rounded-lg px-2.5 py-1 text-xs font-medium text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* 4. Slot Selection with Available vs Booked distinction */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                      4. Select Time Slot:
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      {loadingSlots ? (
                        <span className="text-ink-muted flex items-center gap-1 font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> Loading slots...
                        </span>
                      ) : (
                        <span className="text-ink-muted flex items-center gap-2 font-medium">
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {slotCounts.available} Available
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 text-ink-muted">
                            <Lock className="w-3 h-3" />
                            {slotCounts.booked} Booked
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {detailedSlots.length > 0 && slotCounts.available === 0 && (
                    <div className="p-3 mb-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>All slots fully reserved for {formatDisplayDate(selectedDate)}</span>
                      </div>
                      <p className="text-ink-2 text-xs">
                        Pick another date above or use Fast-Track Emergency Allocation below.
                      </p>
                    </div>
                  )}

                  {detailedSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2.5">
                      {detailedSlots.map((slot) => {
                        const isSelected = selectedSlot === slot.display_time;
                        const isAvailable = slot.available;

                        return (
                          <motion.button
                            key={slot.slot_id}
                            type="button"
                            disabled={!isAvailable}
                            whileTap={isAvailable ? { scale: 0.96 } : undefined}
                            whileHover={isAvailable ? { scale: 1.02 } : undefined}
                            onClick={() => {
                              if (isAvailable) {
                                setSelectedSlot(slot.display_time);
                                setSelectedSlotId(slot.slot_id);
                              }
                            }}
                            className={`py-2.5 px-2 text-xs rounded-xl border text-center transition-all tabular-nums relative cursor-pointer ${
                              !isAvailable
                                ? 'bg-paper-subtle/80 border-dashed border-rule text-ink-muted/50 cursor-not-allowed line-through select-none'
                                : isSelected
                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-200 font-bold shadow-xs ring-2 ring-emerald-500/30'
                                : 'bg-paper-2 border-rule text-ink hover:border-emerald-500/50 hover:bg-paper-subtle'
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm">{slot.display_time}</div>
                            <div className="text-[10px] mt-0.5">
                              {isAvailable ? (
                                <span className={isSelected ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                                  ● Open
                                </span>
                              ) : (
                                <span className="text-ink-muted flex items-center justify-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Booked
                                </span>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : loadingSlots ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-ink-muted py-3">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                      Fetching live availability from database...
                    </div>
                  ) : (
                    <div className="text-xs text-ink-muted py-3.5 px-4 bg-paper-subtle rounded-xl border border-rule flex flex-col sm:flex-row items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-ink-muted shrink-0" />
                        <span>No OPD slots scheduled for this date.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const tomorrow = upcomingDates[1]?.iso;
                          if (tomorrow) handleSelectDate(tomorrow);
                        }}
                        className="pulse-btn pulse-btn-sm text-xs border border-rule hover:border-accent cursor-pointer"
                      >
                        Check Tomorrow →
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 5. Booking Confirmation Preview Card */}
            {!isEmergencyMode && currentDoctor && selectedSlot && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-accent-light/40 rounded-xl border border-accent/30 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted font-medium">Booking Selection:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    Ready to Book
                  </span>
                </div>
                <div className="text-xs sm:text-sm text-ink font-bold flex items-center justify-between">
                  <span>{currentDoctor.name} ({currentDoctor.department_name})</span>
                  <span className="text-accent font-extrabold">₹{currentDoctor.consultation_fee || 500}</span>
                </div>
                <div className="text-xs text-ink-2 flex items-center gap-2 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span>{formatDisplayDate(selectedDate)}</span>
                  <span>·</span>
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span className="font-bold text-accent">{selectedSlot}</span>
                  <span>·</span>
                  <span>{currentDoctor.room_number || 'OPD 101'}</span>
                </div>
              </motion.div>
            )}

            {/* 6. Action Button: Book & Generate Token */}
            <div className="pt-2">
              {isEmergencyMode ? (
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleEmergencyBookSlot}
                  disabled={isEmergencyBooking}
                  className="w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm bg-emergency hover:bg-emergency/90 text-white font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isEmergencyBooking ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Executing Atomic Emergency Slot Allocation...
                    </span>
                  ) : (
                    <div className="flex items-center justify-center gap-2 w-full">
                      <Zap className="w-4 h-4" />
                      <span>ONE-CLICK EMERGENCY APPOINTMENT ({selectedDepartment.toUpperCase()})</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </motion.button>
              ) : (
                <>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleBookSlot}
                    disabled={isBooking || !currentDoctor || !selectedSlot}
                    className="pulse-btn pulse-btn-primary w-full py-3.5 rounded-xl text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isBooking ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executing Atomic Slot Reservation...
                      </span>
                    ) : (
                      <div className="flex items-center justify-center gap-2 w-full">
                        <span>
                          {selectedSlot
                            ? `CONFIRM: ${currentDoctor?.name?.split(' ')[0] || ''} · ${formatDisplayDate(selectedDate)} ${selectedSlot}`
                            : 'SELECT AN AVAILABLE TIME SLOT TO PROCEED'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEmergencyBookSlot}
                    disabled={isEmergencyBooking}
                    className="mt-3 w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm bg-emergency/10 hover:bg-emergency text-emergency hover:text-white border border-emergency/40 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs"
                    title="Direct 1-click allocation of earliest available emergency slot"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>⚡ ONE-CLICK EMERGENCY APPOINTMENT ({selectedDepartment.toUpperCase()})</span>
                  </motion.button>
                </>
              )}
            </div>

            {/* Emergency Fallback Banner when no slots available (Zero Fake Success) */}
            {emergencyFallback && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2.5"
              >
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-700 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>No Suitable Emergency Slot Currently Available</span>
                </div>
                <p className="text-[11px] font-mono text-ink-2">
                  All direct urgent slots for <strong>{selectedDepartment}</strong> are currently committed. Immediate fallback actions:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={`tel:${emergencyFallback.emergency_contact || '102'}`}
                    className="px-3 py-1.5 rounded-lg bg-emergency text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-hairline"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    Call Hospital Emergency ({emergencyFallback.emergency_contact || '102'})
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDepartment('General Medicine');
                      setEmergencyFallback(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-paper-2 border border-rule text-ink text-xs font-mono font-semibold hover:border-ink-muted flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3 text-accent" />
                    Try General Medicine Desk
                  </button>
                </div>
              </motion.div>
            )}

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
                      {typeof generatedToken === 'string' ? generatedToken : extractTokenString(generatedToken)}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-ink-2">
                    Confirmation sent to {patientPhone || 'patient'}. Patient can show QR at hospital reception for direct check-in.
                  </p>

                  {/* Explainable Doctor & Slot Allocation Rationale */}
                  {emergencyRationale && (
                    <div className="p-2.5 bg-paper-subtle border border-accent/20 rounded-lg text-xs font-mono space-y-1 mt-1">
                      <div className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-accent" />
                        Explainable Doctor & Slot Allocation Rationale:
                      </div>
                      <p className="text-[11px] text-ink-2 font-medium">{emergencyRationale}</p>
                    </div>
                  )}

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
          token: extractTokenString(generatedToken),
          id: bookedAppointmentId || `apt-${Date.now()}`,
          targetName: currentDoctor ? `${currentDoctor.name} (${selectedDepartment})` : selectedDepartment,
          detail: `Slot: ${selectedSlot} · Patient: ${patientName || 'Walk-in Patient'}`,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          signature: (typeof bookedQrSignature === 'string' ? bookedQrSignature : '') || `sig_${bookedAppointmentId || 'live'}`,
          qrPayload: bookedQrCode,
        }}
      />

    </div>
  );
};

export default ReceptionistView;
