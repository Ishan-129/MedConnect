// MedConnect Pulse Shared Domain Types

export type UserRole = 'PATIENT' | 'RECEPTIONIST' | 'DOCTOR' | 'EMERGENCY_MANAGER' | 'ADMIN';

export type AppointmentStatus = 
  | 'BOOKED' 
  | 'CHECKED_IN' 
  | 'IN_CONSULTATION' 
  | 'COMPLETED' 
  | 'CANCELLED' 
  | 'NO_SHOW';

export type QueueStatus = 
  | 'BOOKED'
  | 'WAITING' 
  | 'CALLED' 
  | 'IN_CONSULTATION' 
  | 'COMPLETED' 
  | 'SKIPPED';

export type ResourceType = 
  | 'O_NEG_BLOOD' 
  | 'O_POS_BLOOD' 
  | 'A_NEG_BLOOD' 
  | 'A_POS_BLOOD' 
  | 'B_NEG_BLOOD' 
  | 'B_POS_BLOOD' 
  | 'AB_NEG_BLOOD' 
  | 'AB_POS_BLOOD' 
  | 'BLOOD_O_NEG'
  | 'BLOOD_O_POS'
  | 'BLOOD_A_NEG'
  | 'BLOOD_A_POS'
  | 'BLOOD_B_NEG'
  | 'BLOOD_B_POS'
  | 'BLOOD_AB_NEG'
  | 'BLOOD_AB_POS'
  | 'OXYGEN' 
  | 'OXYGEN_CYLINDER'
  | 'ICU_BED' 
  | 'VENTILATOR' 
  | 'MEDICINE' 
  | 'EQUIPMENT' 
  | 'AMBULANCE';

export type EmergencyPriority = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'URGENT' | 'EMERGENCY';

export type EmergencyStatus = 'OPEN' | 'CREATED' | 'BROADCASTED' | 'ACCEPTED' | 'DISPATCHED' | 'FULFILLED' | 'COMPLETED' | 'ESCALATED' | 'CANCELLED';

export interface Hospital {
  hospital_id: string;
  name: string;
  latitude: number;
  longitude: number;
  contact: string;
  telegram_chat_id?: string;
  active_status: boolean;
  distance_km?: number;
  supported_resources: ResourceType[];
}

export interface Doctor {
  doctor_id: string;
  hospital_id: string;
  department_id: string;
  department_name: string;
  name: string;
  specialty: string;
  specialization?: string; // Backend column alias for specialty
  available_today: boolean;
  room_number?: string;
  consultation_fee?: number;
}

export interface DoctorSlot {
  slot_id: string;
  doctor_id: string;
  start_time: string;
  end_time: string;
  status: 'AVAILABLE' | 'LOCKED' | 'BOOKED';
}

export interface Appointment {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  doctor_id: string;
  doctor_name: string;
  department_name: string;
  slot_start: string;
  slot_end: string;
  token: string;
  qr_reference: string;
  status: AppointmentStatus;
  created_at: string;
}

export interface QueueEntry {
  queue_id: string;
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  doctor_id: string;
  doctor_name: string;
  department_name: string;
  token: string;
  position: number;
  check_in_at: string;
  status: QueueStatus;
  estimated_wait_mins?: number;
  patient_phone?: string;
  hospital_name?: string;
}

export interface EmergencyRequest {
  id?: string;
  request_id: string;
  requesting_hospital_id: string;
  requesting_hospital_name: string;
  resource_type: ResourceType;
  quantity: number;
  priority: EmergencyPriority;
  urgency?: string;
  notes?: string;
  status: EmergencyStatus;
  created_at: string;
  expires_at: string;
  timeout_at?: string;
  supplying_hospital_id?: string;
  supplying_hospital_name?: string;
  dispatch_id?: string;
  qr_reference?: string;
}

export interface EmergencyPassPayload {
  type: 'emergency_dispatch';
  dispatch_id: string;
  request_id: string;
  supplying_hospital: string;
  receiving_hospital: string;
  resource_type: ResourceType;
  quantity: number;
  issued_at: string;
  exp: string;
  signature: string;
}

export interface AppointmentPassPayload {
  type: 'appointment_checkin';
  appointment_id: string;
  patient_name: string;
  token: string;
  doctor_name: string;
  issued_at: string;
  exp: string;
  signature: string;
}

export interface HospitalUser {
  hospital_id: string;
  name: string;
  contact: string;
  telegram_chat_id: string;
  latitude: number;
  longitude: number;
  address?: string;
  contact_email?: string;
  contact_person?: string;
  verification_status: 'VERIFIED' | 'PENDING' | 'REJECTED';
  supported_resources: ResourceType[];
}

export interface PatientUser {
  patient_id: string;
  name: string;
  phone: string;
  email?: string;
  blood_group: string;
  age?: number;
  gender?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  address?: string;
}

