import { Hospital, Doctor, QueueEntry, EmergencyRequest } from '../types';
import { calculateDistanceKm } from './haversine';

// Base coordinates: AIIMS New Delhi (Requesting Node)
export const AIIMS_COORDS = {
  lat: 28.5672,
  lon: 77.2100
};

export const INITIAL_HOSPITALS: Hospital[] = [
  {
    hospital_id: '11111111-1111-4111-a111-111111111111',
    name: 'AIIMS New Delhi (Main Campus)',
    latitude: 28.5672,
    longitude: 77.2100,
    contact: '+91-11-26588500',
    telegram_chat_id: '-1002345678901',
    active_status: true,
    distance_km: 0.0,
    supported_resources: ['O_NEG_BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR', 'AMBULANCE']
  },
  {
    hospital_id: '22222222-2222-4222-a222-222222222222',
    name: 'VMM & Safdarjung Hospital',
    latitude: 28.5700,
    longitude: 77.2078,
    contact: '+91-11-26165060',
    telegram_chat_id: '-1002345678902',
    active_status: true,
    distance_km: calculateDistanceKm(AIIMS_COORDS.lat, AIIMS_COORDS.lon, 28.5700, 77.2078),
    supported_resources: ['O_NEG_BLOOD', 'O_POS_BLOOD', 'OXYGEN', 'ICU_BED', 'VENTILATOR']
  },
  {
    hospital_id: '33333333-3333-4333-a333-333333333333',
    name: 'Max Super Speciality Hospital, Saket',
    latitude: 28.5283,
    longitude: 77.2114,
    contact: '+91-11-26515050',
    telegram_chat_id: '-1002345678903',
    active_status: true,
    distance_km: calculateDistanceKm(AIIMS_COORDS.lat, AIIMS_COORDS.lon, 28.5283, 77.2114),
    supported_resources: ['O_NEG_BLOOD', 'ICU_BED', 'VENTILATOR', 'MEDICINE']
  },
  {
    hospital_id: '44444444-4444-4444-a444-444444444444',
    name: 'Fortis Escorts Heart Institute, Okhla',
    latitude: 28.5603,
    longitude: 77.2764,
    contact: '+91-11-47135000',
    telegram_chat_id: '-1002345678904',
    active_status: true,
    distance_km: calculateDistanceKm(AIIMS_COORDS.lat, AIIMS_COORDS.lon, 28.5603, 77.2764),
    supported_resources: ['OXYGEN', 'VENTILATOR', 'ICU_BED', 'AMBULANCE']
  },
  {
    hospital_id: '55555555-5555-4555-a555-555555555555',
    name: 'Indraprastha Apollo Hospital, Sarita Vihar',
    latitude: 28.5398,
    longitude: 77.2832,
    contact: '+91-11-26925858',
    telegram_chat_id: '-1002345678905',
    active_status: true,
    distance_km: calculateDistanceKm(AIIMS_COORDS.lat, AIIMS_COORDS.lon, 28.5398, 77.2832),
    supported_resources: ['O_NEG_BLOOD', 'O_POS_BLOOD', 'OXYGEN', 'ICU_BED']
  }
];

export const INITIAL_DOCTORS: Doctor[] = [
  {
    doctor_id: 'doc-1',
    hospital_id: 'hosp-aiims',
    department_id: 'dept-cardio',
    department_name: 'Cardiology',
    name: 'Dr. Rajesh Sharma',
    specialty: 'Senior Interventional Cardiologist',
    available_today: true
  },
  {
    doctor_id: 'doc-2',
    hospital_id: 'hosp-aiims',
    department_id: 'dept-derma',
    department_name: 'Dermatology',
    name: 'Dr. Priya Nair',
    specialty: 'Clinical & Cosmetic Dermatologist',
    available_today: true
  },
  {
    doctor_id: 'doc-3',
    hospital_id: 'hosp-aiims',
    department_id: 'dept-ortho',
    department_name: 'Orthopedics',
    name: 'Dr. Amitav Sen',
    specialty: 'Joint Replacement & Trauma Specialist',
    available_today: true
  },
  {
    doctor_id: 'doc-4',
    hospital_id: 'hosp-aiims',
    department_id: 'dept-general',
    department_name: 'General Medicine',
    name: 'Dr. Sunita Verma',
    specialty: 'Internal Medicine Consultant',
    available_today: true
  }
];

export const INITIAL_QUEUE: QueueEntry[] = [
  {
    queue_id: 'q-101',
    appointment_id: 'apt-001',
    patient_id: 'pat-1',
    patient_name: 'Ramesh Chandra (Token #MED-4021)',
    doctor_id: 'doc-2',
    doctor_name: 'Dr. Priya Nair',
    department_name: 'Dermatology',
    token: '#MED-4021',
    position: 0,
    check_in_at: '2026-09-09T09:15:00Z',
    status: 'IN_CONSULTATION',
    estimated_wait_mins: 0
  },
  {
    queue_id: 'q-102',
    appointment_id: 'apt-002',
    patient_id: 'pat-2',
    patient_name: 'Ananya Deshmukh',
    doctor_id: 'doc-2',
    doctor_name: 'Dr. Priya Nair',
    department_name: 'Dermatology',
    token: '#MED-4022',
    position: 1,
    check_in_at: '2026-09-09T09:30:00Z',
    status: 'CALLED',
    estimated_wait_mins: 5
  },
  {
    queue_id: 'q-103',
    appointment_id: 'apt-003',
    patient_id: 'pat-3',
    patient_name: 'Harpreet Singh',
    doctor_id: 'doc-2',
    doctor_name: 'Dr. Priya Nair',
    department_name: 'Dermatology',
    token: '#MED-4025',
    position: 2,
    check_in_at: '2026-09-09T09:42:00Z',
    status: 'WAITING',
    estimated_wait_mins: 15
  },
  {
    queue_id: 'q-104',
    appointment_id: 'apt-004',
    patient_id: 'pat-4',
    patient_name: 'Meenakshi Iyer',
    doctor_id: 'doc-2',
    doctor_name: 'Dr. Priya Nair',
    department_name: 'Dermatology',
    token: '#MED-4029',
    position: 3,
    check_in_at: '2026-09-09T10:02:00Z',
    status: 'WAITING',
    estimated_wait_mins: 25
  }
];

export const INITIAL_EMERGENCY_REQUESTS: EmergencyRequest[] = [
  {
    request_id: 'ER-1042',
    requesting_hospital_id: 'hosp-aiims',
    requesting_hospital_name: 'AIIMS New Delhi',
    resource_type: 'O_NEG_BLOOD',
    quantity: 4,
    priority: 'CRITICAL',
    status: 'OPEN',
    created_at: new Date(Date.now() - 45 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 135 * 1000).toISOString(), // 180s timeout
  }
];
