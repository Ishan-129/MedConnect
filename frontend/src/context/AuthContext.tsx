import React, { createContext, useContext, useState, useEffect } from 'react';
import { HospitalUser, PatientUser, ResourceType } from '../types';
import { INITIAL_HOSPITALS } from '../lib/mockData';
import { supabase, isLiveSupabase } from '../lib/supabaseClient';

export interface SignupHospitalPayload {
  name: string;
  contact: string;
  telegram_chat_id: string;
  latitude: number;
  longitude: number;
  address: string;
  contact_email?: string;
  contact_person?: string;
  password?: string;
  supported_resources?: ResourceType[];
}

export interface SignupPatientPayload {
  name: string;
  phone: string;
  email?: string;
  blood_group: string;
  age?: number;
  gender?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  address?: string;
  password?: string;
}

export interface AuthContextType {
  activeHospital: HospitalUser | null;
  activePatient: PatientUser | null;
  allHospitals: HospitalUser[];
  loginHospital: (identifier: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  signupHospital: (data: SignupHospitalPayload) => Promise<{ success: boolean; hospital?: HospitalUser; message?: string }>;
  logoutHospital: () => void;
  switchHospital: (hospitalId: string) => void;
  loginPatient: (phone: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  signupPatient: (data: SignupPatientPayload) => Promise<{ success: boolean; patient?: PatientUser; message?: string }>;
  logoutPatient: () => void;
  isAuthModalOpen: boolean;
  authModalConfig: {
    tab: 'hospital' | 'patient';
    mode: 'login' | 'signup';
  };
  openAuthModal: (tab?: 'hospital' | 'patient', mode?: 'login' | 'signup') => void;
  closeAuthModal: () => void;
}

const DEFAULT_HOSPITALS: HospitalUser[] = INITIAL_HOSPITALS.map((h) => ({
  hospital_id: h.hospital_id,
  name: h.name,
  contact: h.contact,
  telegram_chat_id: h.telegram_chat_id || '-1002345678901',
  latitude: h.latitude,
  longitude: h.longitude,
  verification_status: 'VERIFIED',
  address: 'Ansari Nagar, New Delhi',
  contact_email: 'emergency@hospital.gov.in',
  contact_person: 'Medical Superintendent',
  supported_resources: h.supported_resources,
}));

const DEFAULT_PATIENTS: PatientUser[] = [
  {
    patient_id: 'pat-1111-ananya',
    name: 'Ananya Deshmukh',
    phone: '+91 98765 43210',
    email: 'ananya.deshmukh@gmail.com',
    blood_group: 'O-',
    age: 29,
    gender: 'Female',
    emergency_contact_name: 'Rahul Deshmukh (Spouse)',
    emergency_contact_phone: '+91 98765 43219',
    address: 'Saket, New Delhi',
  },
  {
    patient_id: 'pat-2222-rohan',
    name: 'Rohan Verma',
    phone: '+91 98111 22334',
    email: 'rohan.verma@outlook.com',
    blood_group: 'B+',
    age: 42,
    gender: 'Male',
    emergency_contact_name: 'Meera Verma',
    emergency_contact_phone: '+91 98111 22335',
    address: 'Green Park Extension, New Delhi',
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // All hospitals (initial seeded + local additions)
  const [allHospitals, setAllHospitals] = useState<HospitalUser[]>(() => {
    try {
      const saved = localStorage.getItem('medconnect_all_hospitals');
      return saved ? JSON.parse(saved) : DEFAULT_HOSPITALS;
    } catch {
      return DEFAULT_HOSPITALS;
    }
  });

  // Active hospital session
  const [activeHospital, setActiveHospital] = useState<HospitalUser | null>(() => {
    try {
      const saved = localStorage.getItem('medconnect_active_hospital');
      if (saved) return JSON.parse(saved);
      return DEFAULT_HOSPITALS[0]; // Default: AIIMS New Delhi for instant demo readiness
    } catch {
      return DEFAULT_HOSPITALS[0];
    }
  });

  // Registered patients
  const [allPatients, setAllPatients] = useState<PatientUser[]>(() => {
    try {
      const saved = localStorage.getItem('medconnect_all_patients');
      return saved ? JSON.parse(saved) : DEFAULT_PATIENTS;
    } catch {
      return DEFAULT_PATIENTS;
    }
  });

  // Active patient session
  const [activePatient, setActivePatient] = useState<PatientUser | null>(() => {
    try {
      const saved = localStorage.getItem('medconnect_active_patient');
      if (saved) return JSON.parse(saved);
      return DEFAULT_PATIENTS[0]; // Default: Ananya Deshmukh
    } catch {
      return DEFAULT_PATIENTS[0];
    }
  });

  // Modal controls
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState<{
    tab: 'hospital' | 'patient';
    mode: 'login' | 'signup';
  }>({
    tab: 'hospital',
    mode: 'login',
  });

  // Persist changes
  useEffect(() => {
    try {
      localStorage.setItem('medconnect_all_hospitals', JSON.stringify(allHospitals));
    } catch (e) {
      console.warn('localStorage error', e);
    }
  }, [allHospitals]);

  useEffect(() => {
    try {
      if (activeHospital) {
        localStorage.setItem('medconnect_active_hospital', JSON.stringify(activeHospital));
      } else {
        localStorage.removeItem('medconnect_active_hospital');
      }
    } catch (e) {
      console.warn('localStorage error', e);
    }
  }, [activeHospital]);

  useEffect(() => {
    try {
      localStorage.setItem('medconnect_all_patients', JSON.stringify(allPatients));
    } catch (e) {
      console.warn('localStorage error', e);
    }
  }, [allPatients]);

  useEffect(() => {
    try {
      if (activePatient) {
        localStorage.setItem('medconnect_active_patient', JSON.stringify(activePatient));
      } else {
        localStorage.removeItem('medconnect_active_patient');
      }
    } catch (e) {
      console.warn('localStorage error', e);
    }
  }, [activePatient]);

  const openAuthModal = (tab: 'hospital' | 'patient' = 'hospital', mode: 'login' | 'signup' = 'login') => {
    setAuthModalConfig({ tab, mode });
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  // Switch hospital perspective instantly
  const switchHospital = (hospitalId: string) => {
    const found = allHospitals.find((h) => h.hospital_id === hospitalId);
    if (found) {
      setActiveHospital(found);
    }
  };

  // Hospital Login
  const loginHospital = async (identifier: string, _password?: string) => {
    const cleanId = identifier.trim().toLowerCase();
    const found = allHospitals.find(
      (h) =>
        h.hospital_id.toLowerCase() === cleanId ||
        h.name.toLowerCase().includes(cleanId) ||
        h.contact.includes(cleanId) ||
        h.telegram_chat_id.includes(cleanId) ||
        (h.contact_email && h.contact_email.toLowerCase() === cleanId)
    );

    if (found) {
      setActiveHospital(found);
      return { success: true };
    }

    return {
      success: false,
      message: 'Hospital not found with provided phone, Telegram Chat ID, or facility name.',
    };
  };

  // Hospital Sign Up
  const signupHospital = async (data: SignupHospitalPayload) => {
    const newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const newHospital: HospitalUser = {
      hospital_id: newId,
      name: data.name.trim(),
      contact: data.contact.trim(),
      telegram_chat_id: data.telegram_chat_id.trim() || `-100${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      contact_email: data.contact_email || 'desk@hospital.org',
      contact_person: data.contact_person || 'Emergency Officer',
      verification_status: 'VERIFIED',
      supported_resources: data.supported_resources || [
        'O_NEG_BLOOD',
        'OXYGEN',
        'ICU_BED',
        'VENTILATOR',
        'AMBULANCE',
      ],
    };

    // Attempt remote registration if Supabase is connected
    if (isLiveSupabase) {
      try {
        await supabase.from('hospitals').insert([
          {
            hospital_id: newHospital.hospital_id,
            name: newHospital.name,
            contact: newHospital.contact,
            telegram_chat_id: newHospital.telegram_chat_id,
            latitude: newHospital.latitude,
            longitude: newHospital.longitude,
            address: newHospital.address,
            contact_email: newHospital.contact_email,
            contact_person: newHospital.contact_person,
            active_status: true,
            verification_status: 'VERIFIED',
          },
        ]);
      } catch (err) {
        console.warn('Supabase remote insert fallback to local', err);
      }
    }

    setAllHospitals((prev) => [newHospital, ...prev]);
    setActiveHospital(newHospital);
    return { success: true, hospital: newHospital };
  };

  // Hospital Logout
  const logoutHospital = () => {
    setActiveHospital(null);
  };

  // Patient Login
  const loginPatient = async (phone: string, _password?: string) => {
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const found = allPatients.find((p) => p.phone.replace(/\s+/g, '').includes(cleanPhone));

    if (found) {
      setActivePatient(found);
      return { success: true };
    }

    return {
      success: false,
      message: 'No patient record found for this mobile number. Please sign up to register.',
    };
  };

  // Patient Sign Up
  const signupPatient = async (data: SignupPatientPayload) => {
    const newId = `pat-${Date.now()}`;
    const newPatient: PatientUser = {
      patient_id: newId,
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim(),
      blood_group: data.blood_group || 'O+',
      age: data.age || 30,
      gender: data.gender || 'Not Specified',
      emergency_contact_name: data.emergency_contact_name,
      emergency_contact_phone: data.emergency_contact_phone,
      address: data.address,
    };

    if (isLiveSupabase) {
      try {
        await supabase.from('patients').insert([
          {
            name: newPatient.name,
            phone: newPatient.phone,
            email: newPatient.email,
            consent_status: true,
          },
        ]);
      } catch (err) {
        console.warn('Supabase remote patient insert fallback to local', err);
      }
    }

    setAllPatients((prev) => [newPatient, ...prev]);
    setActivePatient(newPatient);
    return { success: true, patient: newPatient };
  };

  // Patient Logout
  const logoutPatient = () => {
    setActivePatient(null);
  };

  return (
    <AuthContext.Provider
      value={{
        activeHospital,
        activePatient,
        allHospitals,
        loginHospital,
        signupHospital,
        logoutHospital,
        switchHospital,
        loginPatient,
        signupPatient,
        logoutPatient,
        isAuthModalOpen,
        authModalConfig,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
