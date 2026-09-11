/**
 * Hospital Service (MedConnect Pulse)
 * Manages hospital profiles, departments, and doctor directories.
 */

import { db } from '../db.js';

export async function getHospitals() {
  return db.getHospitals();
}

export async function getDepartments(hospitalId) {
  return db.getDepartments(hospitalId);
}

export async function getDoctors(hospitalId, departmentId) {
  return db.getDoctors(hospitalId, departmentId);
}

export async function searchDoctors(query, hospitalId) {
  const allDocs = await db.getDoctors(hospitalId);
  if (!query) return allDocs;

  const q = query.toLowerCase().trim();
  return allDocs.filter(d =>
    d.name.toLowerCase().includes(q) ||
    (d.specialization && d.specialization.toLowerCase().includes(q))
  );
}

export default {
  getHospitals,
  getDepartments,
  getDoctors,
  searchDoctors,
};
