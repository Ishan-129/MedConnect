/**
 * Queue Service (MedConnect Pulse)
 * Manages live OPD patient queue status, wait-time estimation, and token tracking.
 */

import { db } from '../db.js';

export async function getQueueStatus(tokenIdOrApptId) {
  return db.getPatientQueueMetrics(tokenIdOrApptId);
}

export async function getQueueEntries(hospitalId) {
  return db.inMemory.queue_entries.filter(q => !hospitalId || q.hospital_id === hospitalId);
}

export default {
  getQueueStatus,
  getQueueEntries,
};
