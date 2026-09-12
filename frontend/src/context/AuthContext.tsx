import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { HospitalUser, PatientUser, ResourceType } from '../types';
import { supabase } from '../lib/supabaseClient';

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
  token: string | null;
  isLoadingAuth: boolean;
  loginHospital: (identifier: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  signupHospital: (data: SignupHospitalPayload) => Promise<{ success: boolean; hospital?: HospitalUser; message?: string }>;
  logoutHospital: () => Promise<void>;
  switchHospital: (hospitalId: string) => void;
  loginPatient: (identifier: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  signupPatient: (data: SignupPatientPayload) => Promise<{ success: boolean; patient?: PatientUser; message?: string }>;
  logoutPatient: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalConfig: {
    tab: 'hospital' | 'patient';
    mode: 'login' | 'signup';
  };
  openAuthModal: (tab?: 'hospital' | 'patient', mode?: 'login' | 'signup') => void;
  closeAuthModal: () => void;
  getAuthHeader: () => Record<string, string>;
  setPatientSession: (patient: PatientUser, sessionToken?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allHospitals, setAllHospitals] = useState<HospitalUser[]>([]);
  const [activeHospital, setActiveHospital] = useState<HospitalUser | null>(null);
  const [activePatient, setActivePatient] = useState<PatientUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);

  // Modal controls
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState<{
    tab: 'hospital' | 'patient';
    mode: 'login' | 'signup';
  }>({
    tab: 'hospital',
    mode: 'login',
  });

  // Helper to build authorization headers for API calls
  const getAuthHeader = useCallback((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // Load hospitals from backend API or Supabase
  const loadLiveHospitals = useCallback(async () => {
    try {
      const res = await fetch('/api/hospitals');
      if (res.ok) {
        const data = await res.json();
        const liveHospitals: HospitalUser[] = (data.hospitals || []).map((h: any) => ({
          hospital_id: h.hospital_id || h.id,
          name: h.name,
          contact: h.contact || h.contact_phone || '',
          telegram_chat_id: h.telegram_chat_id || '',
          latitude: h.latitude || 0,
          longitude: h.longitude || 0,
          address: h.address || '',
          contact_email: h.contact_email || '',
          contact_person: h.contact_person || '',
          verification_status: h.verification_status || 'VERIFIED',
          supported_resources: h.supported_resources || [
            'O_NEG_BLOOD',
            'OXYGEN',
            'ICU_BED',
            'VENTILATOR',
            'AMBULANCE',
          ],
        }));
        if (liveHospitals.length > 0) {
          setAllHospitals(liveHospitals);
          setActiveHospital((prev) => {
            if (!prev) return null;
            const match = liveHospitals.find(
              (h) =>
                h.hospital_id === prev.hospital_id ||
                (prev.name && (
                  h.name.toLowerCase().includes(prev.name.toLowerCase().split(' ')[0]) ||
                  prev.name.toLowerCase().includes(h.name.toLowerCase().split(' ')[0])
                )) ||
                (prev.contact_email && h.contact_email && h.contact_email.toLowerCase() === prev.contact_email.toLowerCase())
            );
            if (match) {
              return {
                ...prev,
                hospital_id: match.hospital_id,
                name: match.name,
                latitude: match.latitude,
                longitude: match.longitude,
                contact: match.contact || prev.contact,
                telegram_chat_id: match.telegram_chat_id || prev.telegram_chat_id,
              };
            }
            return prev;
          });
        }
      }
    } catch (e) {
      console.warn('[AuthContext] Note loading live hospitals:', e);
    }
  }, []);

  // Sync Supabase Auth session with local state
  const syncUserFromSession = useCallback(async (session: any) => {
    if (!session || !session.user) {
      setActiveHospital(null);
      setActivePatient(null);
      setToken(null);
      return;
    }

    const currentToken = session.access_token;
    setToken(currentToken);

    const user = session.user;
    const role = user.user_metadata?.role?.toLowerCase() || 'patient';

    if (role === 'hospital') {
      const rawId = user.user_metadata?.hospital_id || user.id;
      const rawName = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.hospital_name || '';
      const email = user.email || '';

      const matched = allHospitals.find(
        (h) =>
          h.hospital_id === rawId ||
          (rawName && (
            h.name.toLowerCase().includes(rawName.toLowerCase().split(' ')[0]) ||
            rawName.toLowerCase().includes(h.name.toLowerCase().split(' ')[0])
          )) ||
          (email && h.contact_email && h.contact_email.toLowerCase() === email.toLowerCase())
      );

      const hospitalUser: HospitalUser = {
        hospital_id: matched?.hospital_id || rawId,
        name: matched?.name || rawName || 'Hospital Facility',
        contact: matched?.contact || user.user_metadata?.phone || user.user_metadata?.contact_phone || '',
        telegram_chat_id: matched?.telegram_chat_id || user.user_metadata?.telegram_chat_id || '6537122486',
        latitude: matched?.latitude || user.user_metadata?.latitude || 28.5672,
        longitude: matched?.longitude || user.user_metadata?.longitude || 77.21,
        address: matched?.address || user.user_metadata?.address || 'New Delhi',
        contact_email: matched?.contact_email || email,
        contact_person: user.user_metadata?.contact_person || 'Desk Officer',
        verification_status: 'VERIFIED',
        supported_resources: matched?.supported_resources || [
          'O_NEG_BLOOD',
          'OXYGEN',
          'ICU_BED',
          'VENTILATOR',
          'AMBULANCE',
        ],
      };
      setActiveHospital(hospitalUser);
      setActivePatient(null);
    } else {
      const patientUser: PatientUser = {
        patient_id: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.name || 'Registered Patient',
        phone: user.user_metadata?.phone || user.user_metadata?.phone_number || '',
        email: user.email || '',
        blood_group: user.user_metadata?.blood_group || 'O+',
        age: user.user_metadata?.age || 28,
        gender: user.user_metadata?.gender || 'Female',
        emergency_contact_name: user.user_metadata?.emergency_contact_name || '',
        emergency_contact_phone: user.user_metadata?.emergency_contact_phone || '',
        address: user.user_metadata?.address || '',
      };
      setActivePatient(patientUser);
      setActiveHospital(null);
    }
  }, []);

  // On mount: restore session from Supabase client and load hospitals
  useEffect(() => {
    loadLiveHospitals();

    async function initSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          await syncUserFromSession(data.session);
        }
      } catch (err) {
        console.warn('[AuthContext] Session retrieval error:', err);
      } finally {
        setIsLoadingAuth(false);
      }
    }

    initSession();

    // Listen for auth changes (token refresh, sign-in, sign-out)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await syncUserFromSession(session);
      } else {
        setActiveHospital(null);
        setActivePatient(null);
        setToken(null);
      }
      setIsLoadingAuth(false);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [loadLiveHospitals, syncUserFromSession]);

  const openAuthModal = (tab: 'hospital' | 'patient' = 'hospital', mode: 'login' | 'signup' = 'login') => {
    setAuthModalConfig({ tab, mode });
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const setPatientSession = useCallback((patient: PatientUser, sessionToken?: string) => {
    setActivePatient(patient);
    setActiveHospital(null);
    if (sessionToken) {
      setToken(sessionToken);
      try {
        localStorage.setItem('medconnect_auth_token', sessionToken);
      } catch {}
    }
  }, []);

  const switchHospital = (hospitalId: string) => {
    const found = allHospitals.find((h) => h.hospital_id === hospitalId);
    if (found) {
      setActiveHospital(found);
    }
  };

  // Hospital Login
  const loginHospital = async (identifier: string, password?: string) => {
    if (!password) {
      return { success: false, message: 'Desk security password is required.' };
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          role: 'hospital',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.message || 'Hospital authentication failed.' };
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      const hospUser: HospitalUser = {
        hospital_id: data.user.id || data.user.user_id,
        name: data.user.name,
        contact: data.user.phone,
        telegram_chat_id: data.user.profile?.telegram_chat_id || '6537122486',
        latitude: data.user.profile?.latitude || 28.5672,
        longitude: data.user.profile?.longitude || 77.21,
        address: data.user.profile?.address || 'New Delhi',
        contact_email: data.user.email,
        contact_person: data.user.profile?.contact_person || 'Desk Officer',
        verification_status: 'VERIFIED',
        supported_resources: [
          'O_NEG_BLOOD',
          'OXYGEN',
          'ICU_BED',
          'VENTILATOR',
          'AMBULANCE',
        ],
      };

      setActiveHospital(hospUser);
      setActivePatient(null);
      setToken(data.token || data.session?.access_token);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during hospital login.' };
    }
  };

  // Hospital Sign Up
  const signupHospital = async (data: SignupHospitalPayload) => {
    const email = data.contact_email?.trim();
    const password = data.password;

    if (!email || !email.includes('@')) {
      return { success: false, message: 'A valid email address is required for registration.' };
    }
    if (!password || password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          role: 'hospital',
          name: data.name.trim(),
          phone: data.contact.trim(),
          telegram_chat_id: data.telegram_chat_id.trim() || '6537122486',
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address,
          contact_person: data.contact_person,
          supported_resources: data.supported_resources,
        }),
      });

      const respData = await res.json();
      if (!res.ok) {
        return { success: false, message: respData.message || 'Registration failed.' };
      }

      if (respData.session) {
        await supabase.auth.setSession({
          access_token: respData.session.access_token,
          refresh_token: respData.session.refresh_token,
        });
      }

      const newHospital: HospitalUser = {
        hospital_id: respData.user.id,
        name: respData.user.name,
        contact: respData.user.phone,
        telegram_chat_id: data.telegram_chat_id.trim() || '6537122486',
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        contact_email: email,
        contact_person: data.contact_person || 'Desk Officer',
        verification_status: 'VERIFIED',
        supported_resources: data.supported_resources || [
          'O_NEG_BLOOD',
          'OXYGEN',
          'ICU_BED',
          'VENTILATOR',
          'AMBULANCE',
        ],
      };

      setAllHospitals((prev) => [newHospital, ...prev]);
      setActiveHospital(newHospital);
      setActivePatient(null);
      setToken(respData.session?.access_token || null);
      return { success: true, hospital: newHospital };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during hospital enrollment.' };
    }
  };

  // Hospital Logout
  const logoutHospital = async () => {
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      setActiveHospital(null);
      setToken(null);
    }
  };

  // Patient Login
  const loginPatient = async (identifier: string, password?: string) => {
    if (!password) {
      return { success: false, message: 'Password is required to sign in.' };
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          role: 'patient',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.message || 'Invalid credentials.' };
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      const patient: PatientUser = {
        patient_id: data.user.id || data.user.user_id,
        name: data.user.name,
        phone: data.user.phone,
        email: data.user.email,
        blood_group: data.user.profile?.blood_group || 'O+',
        age: data.user.profile?.age || 28,
        gender: data.user.profile?.gender || 'Female',
        emergency_contact_name: data.user.profile?.emergency_contact_name,
        emergency_contact_phone: data.user.profile?.emergency_contact_phone,
        address: data.user.profile?.address,
      };

      setActivePatient(patient);
      setActiveHospital(null);
      setToken(data.token || data.session?.access_token);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during patient login.' };
    }
  };

  // Patient Sign Up
  const signupPatient = async (data: SignupPatientPayload) => {
    const email = data.email?.trim();
    const password = data.password;

    if (!email || !email.includes('@')) {
      return { success: false, message: 'A valid email address is required.' };
    }
    if (!password || password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          role: 'patient',
          name: data.name.trim(),
          phone: data.phone.trim(),
          blood_group: data.blood_group || 'O+',
          age: data.age,
          gender: data.gender,
          emergency_contact_name: data.emergency_contact_name,
          emergency_contact_phone: data.emergency_contact_phone,
          address: data.address,
        }),
      });

      const respData = await res.json();
      if (!res.ok) {
        return { success: false, message: respData.message || 'Patient registration failed.' };
      }

      if (respData.session) {
        await supabase.auth.setSession({
          access_token: respData.session.access_token,
          refresh_token: respData.session.refresh_token,
        });
      }

      const newPatient: PatientUser = {
        patient_id: respData.user.id,
        name: respData.user.name,
        phone: respData.user.phone,
        email,
        blood_group: data.blood_group || 'O+',
        age: data.age || 28,
        gender: data.gender || 'Female',
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        address: data.address,
      };

      setActivePatient(newPatient);
      setActiveHospital(null);
      setToken(respData.session?.access_token || null);
      return { success: true, patient: newPatient };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during patient registration.' };
    }
  };

  // Patient Logout
  const logoutPatient = async () => {
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      try {
        localStorage.removeItem('medconnect_patient_token');
        localStorage.removeItem('medconnect_patient_phone');
        localStorage.removeItem('medconnect_patient_name');
      } catch {}
      setActivePatient(null);
      setToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        activeHospital,
        activePatient,
        allHospitals,
        token,
        isLoadingAuth,
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
        getAuthHeader,
        setPatientSession,
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
