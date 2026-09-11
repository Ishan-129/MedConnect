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
  | 'OXYGEN' 
  | 'ICU_BED' 
  | 'VENTILATOR' 
  | 'MEDICINE' 
  | 'EQUIPMENT' 
  | 'AMBULANCE';

export type EmergencyPriority = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'URGENT' | 'EMERGENCY';

export type EmergencyStatus = 'OPEN' | 'ACCEPTED' | 'DISPATCHED' | 'FULFILLED' | 'ESCALATED' | 'CANCELLED';

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
  available_today: boolean;
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
}

export interface EmergencyRequest {
  request_id: string;
  requesting_hospital_id: string;
  requesting_hospital_name: string;
  resource_type: ResourceType;
  quantity: number;
  priority: EmergencyPriority;
  status: EmergencyStatus;
  created_at: string;
  expires_at: string;
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
