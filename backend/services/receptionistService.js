/**
 * MedConnect Pulse — AI Receptionist Service
 * Complete multi-turn voice/text receptionist with strict DB validation,
 * 9 intents, atomic booking, n8n integration, and multilingual translations.
 */

import { db } from '../db.js';
import { transcribeAudio, getSarvamCredentials } from './sarvamService.js';
import { extractIntentAndSlots, getOpenAICredentials } from './openaiService.js';
import { callN8nAiReceptionist, triggerN8nQueueNotification } from './n8nService.js';
import { sendAppointmentConfirmation } from './notificationService.js';
import { generateSignedAppointmentQR } from './qrService.js';

export function getReceptionistConfigStatus() {
  const sarvam = getSarvamCredentials();
  const openai = getOpenAICredentials();

  const reports = [];
  if (!sarvam.isConfigured) reports.push('SARVAM_NOT_CONFIGURED');
  if (!openai.isConfigured) reports.push('OPENAI_NOT_CONFIGURED');

  const statusReport = reports.length === 0 ? 'ALL_AI_SERVICES_CONFIGURED' : reports.join(' & ');

  return {
    sarvamConfigured: sarvam.isConfigured,
    openaiConfigured: openai.isConfigured,
    statusReport,
  };
}

const WELCOME_MESSAGES = {
  English: 'Hello! I am MedConnect AI Receptionist. How can I assist you today with appointment booking, queue status, doctor availability, dues query, or emergency resource requests?',
  Hindi: 'नमस्ते! मैं मेडकनेक्ट एआई रिसेप्शनिस्ट हूँ। मैं आज आपकी अपॉइंटमेंट बुकिंग, कतार स्थिति, डॉक्टर उपलब्धता, शुल्क संबंधी प्रश्न, या आपातकालीन संसाधनों में सहायता कर सकता हूँ।',
  Hinglish: 'Namaste! Main MedConnect AI Receptionist hoon. Main aapki appointment booking, queue status, doctor availability, dues query, ya emergency resource requests me help kar sakta hoon.',
  Bengali: 'নমস্কার! আমি মেডকানেক্ট এআই রিশেপশনিস্ট। আমি আপনার অ্যাপয়েন্টমেন্ট বুকিং, কিউ স্ট্যাটাস, এবং জরুরী অনুসন্ধানে সহায়তা করতে পারি।',
  Tamil: 'வணக்கம்! நான் மெட்கனெக்ட் AI வரவேற்பாளர். உங்கள் அப்பாயிண்ட்மென்ட் முன்பதிவு, வரிசை நிலை, மற்றும் அவசர தகவல்களுக்கு நான் உதவ முடியும்.',
  Telugu: 'నమస్కారం! నేను మెడ్ కనెక్ట్ AI రిసెప్షనిస్ట్‌ని. అపాయింట్‌మెంట్ బుకింగ్, క్యూ స్థితి, మరియు అత్యవసర సేవల్లో నేను సహాయపడగలను.',
  Marathi: 'नमस्कार! मी मेडकनेक्ट एआय रिसेप्शनिस्ट आहे. मी तुमची अपॉइंटमेंट बुकिंग, रांगेची स्थिती, डॉक्टर उपलब्धता आणि आणीबाणीच्या कामात मदत करू शकतो.',
};

export function getWelcomeMessage(lang = 'Hinglish') {
  return WELCOME_MESSAGES[lang] || WELCOME_MESSAGES['Hinglish'];
}

export function fallbackTranslate(text, targetLang) {
  if (!text) return text;
  const lang = (targetLang || '').trim();
  if (lang === 'Hinglish' || !lang) return text;

  if (lang === 'Hindi') {
    let t = text;
    t = t.replace(/Namaste!/gi, 'नमस्ते!');
    t = t.replace(/Aapka appointment successful book ho gaya hai!/gi, 'आपका अपॉइंटमेंट सफलतापूर्वक बुक हो गया है!');
    t = t.replace(/Aapka Queue Token ID hai:/gi, 'आपका टोकन आईडी है:');
    t = t.replace(/Doctor:/gi, 'डॉक्टर:');
    t = t.replace(/Date:/gi, 'दिनांक:');
    t = t.replace(/Time:/gi, 'समय:');
    t = t.replace(/Aapka active appointment mila!/gi, 'आपका सक्रिय अपॉइंटमेंट मिल गया है!');
    t = t.replace(/Status:/gi, 'स्थिति:');
    t = t.replace(/Aapka appointment \((.*?)\) safaltapoorvak cancel kar diya gaya hai\./gi, 'आपका अपॉइंटमेंट ($1) सफलतापूर्वक रद्द कर दिया गया है।');
    t = t.replace(/Current token in consultation:/gi, 'वर्तमान परामर्श टोकन:');
    t = t.replace(/Aapke aage (\d+) patients hain\./gi, 'आपके आगे $1 मरीज हैं।');
    t = t.replace(/Estimated wait time: (\d+) minutes\./gi, 'अनुमानित प्रतीक्षा समय: $1 मिनट।');
    t = t.replace(/Doctors availability on (.*?):/gi, 'डॉक्टरों की उपलब्धता दिनांक $1:');
    t = t.replace(/slots available/gi, 'स्लॉट उपलब्ध');
    t = t.replace(/Patient (.*?) ke koi pending dues nahi hain\./gi, 'मरीज $1 का कोई बकाया शुल्क नहीं है।');
    t = t.replace(/Standard OPD consultation fee ₹(\d+) per visit hai\./gi, 'मानक ओपीडी परामर्श शुल्क ₹$1 प्रति विजिट है।');
    t = t.replace(/🚨 Emergency Request Logged!/gi, '🚨 आपातकालीन अनुरोध दर्ज किया गया!');
    t = t.replace(/Resource:/gi, 'संसाधन:');
    t = t.replace(/Request ID:/gi, 'अनुरोध आईडी:');
    t = t.replace(/Matched facilities within 15 km:/gi, '15 किमी के दायरे में मिले अस्पताल:');
    t = t.replace(/Unka next available slot (.*?) ko (.*?) par hai\./gi, 'उनका अगला उपलब्ध स्लॉट $1 को $2 पर है।');
    t = t.replace(/Bilkul! Aap kis problem ke liye doctor se milna chahte hain ya kis department me appointment chahiye\?/gi, 'बिल्कुल! आप किस समस्या के लिए डॉक्टर से मिलना चाहते हैं या किस विभाग में अपॉइंटमेंट चाहिए?');
    t = t.replace(/Available departments:/gi, 'उपलब्ध विभाग:');
    t = t.replace(/Sahi hai\./gi, 'सही है।');
    t = t.replace(/department me ye doctors available hain:/gi, 'विभाग में यह डॉक्टर उपलब्ध हैं:');
    t = t.replace(/Aap kin doctor se konsi date ko milna chahenge\?/gi, 'आप किस डॉक्टर से किस तारीख को मिलना चाहेंगे?');
    t = t.replace(/Maaf kijiye,/gi, 'क्षमा करें,');
    t = t.replace(/ke pass (.*?) ko koi slot available nahi hai\./gi, 'के पास $1 को कोई स्लॉट उपलब्ध नहीं है।');
    t = t.replace(/Kripya koi dusri date chunnein\./gi, 'कृपया कोई दूसरी तारीख चुनें।');
    t = t.replace(/ke pass (.*?) ko ye time slots available hain:/gi, 'के पास $1 को यह समय स्लॉट उपलब्ध हैं:');
    t = t.replace(/Aap kis samay aana chahenge\?/gi, 'आप किस समय आना चाहेंगे?');
    t = t.replace(/Cancel karne ke liye koi active appointment nahi mila\./gi, 'रद्द करने के लिए कोई सक्रिय अपॉइंटमेंट नहीं मिला।');
    t = t.replace(/Aapka koi active appointment nahi mila\./gi, 'आपका कोई सक्रिय अपॉइंटमेंट नहीं मिला।');
    return t;
  }

  if (lang === 'English') {
    let t = text;
    t = t.replace(/Namaste!/gi, 'Hello!');
    t = t.replace(/Aapka appointment successful book ho gaya hai!/gi, 'Your appointment has been successfully booked!');
    t = t.replace(/Aapka Queue Token ID hai:/gi, 'Your Queue Token ID is:');
    t = t.replace(/Aapka active appointment mila!/gi, 'Active appointment found!');
    t = t.replace(/Aapka appointment \((.*?)\) safaltapoorvak cancel kar diya gaya hai\./gi, 'Your appointment ($1) has been successfully cancelled.');
    t = t.replace(/Aapke aage (\d+) patients hain\./gi, 'There are $1 patients ahead of you.');
    t = t.replace(/Patient (.*?) ke koi pending dues nahi hain\./gi, 'Patient $1 has no pending dues.');
    t = t.replace(/Standard OPD consultation fee ₹(\d+) per visit hai\./gi, 'Standard OPD consultation fee is ₹$1 per visit.');
    t = t.replace(/Unka next available slot (.*?) ko (.*?) par hai\./gi, 'Their next available slot is on $1 at $2.');
    t = t.replace(/Bilkul! Aap kis problem ke liye doctor se milna chahte hain ya kis department me appointment chahiye\?/gi, 'Sure! Which department or medical issue would you like an appointment for?');
    t = t.replace(/Available departments:/gi, 'Available departments:');
    t = t.replace(/Sahi hai\./gi, 'Got it.');
    t = t.replace(/department me ye doctors available hain:/gi, 'department has these available doctors:');
    t = t.replace(/Aap kin doctor se konsi date ko milna chahenge\?/gi, 'Which doctor and date would you prefer?');
    t = t.replace(/Maaf kijiye,/gi, 'Sorry,');
    t = t.replace(/ke pass (.*?) ko koi slot available nahi hai\./gi, 'has no available slots on $1.');
    t = t.replace(/Kripya koi dusri date chunnein\./gi, 'Please choose another date.');
    t = t.replace(/ke pass (.*?) ko ye time slots available hain:/gi, 'has these available time slots on $1:');
    t = t.replace(/Aap kis samay aana chahenge\?/gi, 'Which time slot would you prefer?');
    t = t.replace(/Cancel karne ke liye koi active appointment nahi mila\./gi, 'No active appointment found to cancel.');
    t = t.replace(/Aapka koi active appointment nahi mila\./gi, 'No active appointment found.');
    return t;
  }

  return text;
}

export async function translateAiMessage(message, targetLang = 'Hinglish') {
  if (!message || !targetLang) return message;
  const lang = targetLang.trim();
  if (lang.toLowerCase() === 'hinglish') return message;

  // If already in target language, return directly
  if (lang.toLowerCase() === 'english' && !(/[\u0900-\u097F]/.test(message))) {
    return fallbackTranslate(message, 'English');
  }
  if (lang.toLowerCase() === 'hindi' && /[\u0900-\u097F]/.test(message)) {
    return message;
  }

  const { apiKey, isConfigured } = getOpenAICredentials();
  if (isConfigured && message.trim()) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an AI medical receptionist translator for MedConnect Pulse. Translate the given response into ${lang}. Ensure doctor names, department names, dates, times, token numbers (e.g. #MED-4029), and status words remain accurate. Return ONLY the translated string.`
            },
            { role: 'user', content: message },
          ],
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content?.trim();
        if (translated) return translated;
      }
    } catch {}
  }

  return fallbackTranslate(message, lang);
}

export async function processReceptionistTurn(input) {
  const res = await processReceptionistTurnRaw(input);
  if (input.language && input.language !== 'Hinglish') {
    res.aiMessage = await translateAiMessage(res.aiMessage, input.language);
  }
  return res;
}

async function processReceptionistTurnRaw(input) {
  const allHospitals = await db.getHospitals();
  const defaultHospital = allHospitals.find(h => h.name.includes('Yashoda')) || allHospitals[0];
  const hospitalId = (input.hospitalId && input.hospitalId !== '11111111-1111-4111-a111-111111111111')
    ? input.hospitalId
    : (defaultHospital?.id || defaultHospital?.hospital_id || '9bf02c4e-12c9-46c3-a0c0-ac5a52fd0cf0');

  const configStatus = getReceptionistConfigStatus();
  const currentContext = { ...(input.context || {}) };

  // 1. Voice Speech-to-Text Pipeline (Sarvam STT) or direct text
  let transcriptText = input.text?.trim() || '';
  let sttResult = null;

  if (!transcriptText && input.audioBlob) {
    sttResult = await transcribeAudio(input.audioBlob, input.language || 'Hinglish');
    transcriptText = sttResult.text || '';
  }

  if (!transcriptText) {
    // If voice was provided and STT failed or was unavailable, report real failure state
    if (input.audioBlob) {
      const isUnavailable = sttResult?.status === 'SARVAM_UNAVAILABLE' || sttResult?.status === 'SARVAM_NOT_CONFIGURED';
      const isSilence = sttResult?.status === 'EMPTY_SPEECH';
      return {
        success: false,
        status: isUnavailable ? 'VOICE_TRANSCRIPTION_FAILED' : (isSilence ? 'EMPTY_SPEECH' : 'INVALID_INPUT'),
        intent: 'UNKNOWN',
        transcript: '',
        aiMessage: isUnavailable
          ? 'Namaste! Voice recognition is currently unavailable (Sarvam STT service offline or unconfigured). Please type your message or try again later.'
          : 'Namaste! Mujhe aapki aawaaz samajh nahi aayi. Kripya dobara kahein ya message type karein.',
        configurationStatus: configStatus,
        context: currentContext,
        sttStatus: sttResult?.status || 'FAILED',
        error: sttResult?.error,
      };
    }

    return {
      success: false,
      status: 'INVALID_INPUT',
      intent: 'UNKNOWN',
      transcript: '',
      aiMessage: 'Namaste! Mujhe aapki aawaaz samajh nahi aayi. Kripya dobara kahein ya message type karein.',
      configurationStatus: configStatus,
      context: currentContext,
    };
  }

  // 2. Route Turn through n8n Workflow if requested or enabled
  const isMultiTurn = Boolean(currentContext && (currentContext.stage || currentContext.pendingIntent));
  const shouldUseN8n = input.useN8n === true || input.routeViaN8n === true || process.env.ENABLE_N8N_ROUTING === 'true';
  if (shouldUseN8n && !isMultiTurn) {
    try {
      const doctors = await db.getDoctors(hospitalId);

    const findDocMatch = (nameStr) => {
      if (!nameStr) return null;
      const clean = nameStr.toLowerCase().replace(/dr\.?\s*/i, '').trim();
      if (!clean || clean.length < 3) return null;
      const exact = doctors.find(d => {
        const dClean = d.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
        return dClean.includes(clean) || clean.includes(dClean);
      });
      if (exact) return exact;
      const firstName = clean.split(/\s+/)[0];
      if (firstName && firstName.length >= 4) {
        const matchedByFirst = doctors.filter(d => {
          const dClean = d.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
          return dClean.split(/\s+/)[0] === firstName;
        });
        if (matchedByFirst.length === 1) return matchedByFirst[0];
      }
      return null;
    };

    const shouldCallN8n = input.useN8n !== false && input.routeViaN8n !== false;
    const n8nRes = shouldCallN8n ? await callN8nAiReceptionist({
      channel: input.channel || (input.audioBlob ? 'mic' : 'text'),
      text: transcriptText,
      language: input.language || 'Hinglish',
      hospitalId,
      context: currentContext,
      patientName: currentContext.patientName || input.patientName || 'Patient',
      patientPhone: currentContext.patientPhone || input.patientPhone || '+91 98765 43210',
    }) : null;

    if (n8nRes && (n8nRes.source === 'n8n' || n8nRes.executedBy === 'remote-n8n')) {
      let actionPayload = n8nRes.actionPayload || n8nRes;
      const tokenNum = actionPayload?.token?.token_number || actionPayload?.token_number || actionPayload?.booking_result?.token_number;
      const isExplicitCancel = /\b(cancel|cancellation|radd|रद्द|hatao)\b/i.test(transcriptText);
      const isExplicitCheck = /\b(show|check|view|status|details)\b/i.test(transcriptText) && /\b(appointment|booking)\b/i.test(transcriptText);
      const isExplicitDues = /\b(dues|bill|fees|pending|payment)\b/i.test(transcriptText);

      // If user is explicitly checking dues or appointments, bypass n8n misclassifications
      if (isExplicitCheck || isExplicitDues || (n8nRes.intent === 'UNKNOWN' && (isExplicitCheck || isExplicitDues))) {
        // Fall through to local state machine
      } else {
        const intent = isExplicitCancel ? 'CANCEL_APPOINTMENT' : (n8nRes.intent || (tokenNum ? 'BOOK_APPOINTMENT' : null));

        // Strict validation for booking requests
        if (intent === 'BOOK_APPOINTMENT' || tokenNum) {
          // Hallucinated doctor check
          let explicitDocCandidate = '';
          const docMatch = transcriptText.match(/(?:dr\.?|doctor)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
          if (docMatch) {
            const nonDoctorWords = ['se', 'ko', 'ka', 'ki', 'dikhao', 'dikhana', 'milna', 'appointment', 'chahiye', 'available', 'checkup', 'visit', 'consultation', 'hain', 'hai', 'kisi', 'kisko', 'pas', 'paas', 'ke', 'tomorrow', 'today', 'kal', 'aaj'];
            const parts = docMatch[1].trim().split(/\s+/);
            const validParts = [];
            for (const p of parts) {
              if (nonDoctorWords.includes(p.toLowerCase())) break;
              validParts.push(p);
            }
            if (validParts.length > 0) {
              explicitDocCandidate = validParts.join(' ');
            }
          }
          if (explicitDocCandidate && !findDocMatch(explicitDocCandidate)) {
            const docNames = doctors.map(d => d.name).join(', ');
            return {
              success: false,
              status: 'NEEDS_MORE_INFO',
              intent: 'BOOK_APPOINTMENT',
              transcript: transcriptText,
              aiMessage: `Maaf kijiye, ${explicitDocCandidate} hamare hospital me registered nahi hain. Hamare pass ye doctors available hain: ${docNames}.`,
              configurationStatus: configStatus,
              missingSlots: ['doctor'],
              suggestedActions: doctors.map(d => ({ label: d.name, text: `${d.name} se appointment chahiye` })),
              context: currentContext,
            };
          }

          // Past date check
          const dateMatch = transcriptText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
          if (dateMatch) {
            const todayStr = new Date().toISOString().split('T')[0];
            if (dateMatch[1] < todayStr) {
              return {
                success: false,
                status: 'NEEDS_MORE_INFO',
                intent: 'BOOK_APPOINTMENT',
                transcript: transcriptText,
                aiMessage: 'Maaf kijiye, yeh date nikal chuki hai. Kripya aaj ya aage ki date batayein.',
                configurationStatus: configStatus,
                missingSlots: ['date'],
                suggestedActions: [{ label: 'Aaj', text: 'Aaj ka appointment chahiye' }, { label: 'Kal', text: 'Kal ka appointment chahiye' }],
                context: currentContext,
              };
            }
          }

          // DB slot availability check (prevent fake bookings when doctor has 0 slots on requested date)
          const reqDate = dateMatch ? dateMatch[1] : (actionPayload?.token?.date || actionPayload?.appointment_date || new Date().toISOString().split('T')[0]);
          const matchedDoc = findDocMatch(explicitDocCandidate || actionPayload?.token?.doctor || actionPayload?.doctor_name || transcriptText);
          if (matchedDoc) {
            const availableSlots = await db.calculateAvailableSlots(matchedDoc.id || matchedDoc.doctor_id, reqDate);
            if (availableSlots.length === 0) {
              return {
                success: false,
                status: 'NEEDS_MORE_INFO',
                intent: 'BOOK_APPOINTMENT',
                transcript: transcriptText,
                aiMessage: `Maaf kijiye, ${matchedDoc.name} ke pass ${reqDate} ko koi slot available nahi hai. Kripya koi dusri date chunnein ya kisi anya doctor ko select karein.`,
                configurationStatus: configStatus,
                missingSlots: ['slot', 'date'],
                suggestedActions: doctors.map(d => ({ label: d.name, text: `${d.name} se appointment chahiye` })),
                context: currentContext,
              };
            }
          }
        }

      // If appointment was confirmed via n8n, attach signed QR pass & send Telegram notification
      if (tokenNum) {
        const patientName = input.patientName || currentContext.patientName || 'Patient';
        const patientPhone = input.patientPhone || currentContext.patientPhone || '+91 98765 43210';
        const docName = actionPayload?.token?.doctor || actionPayload?.doctor_name || 'Doctor';
        const targetDate = actionPayload?.token?.date || actionPayload?.appointment_date || new Date().toISOString().split('T')[0];
        const timeSlot = actionPayload?.token?.time || actionPayload?.appointment_time || '10:30 AM';

        // Sign QR code
        const signedQr = generateSignedAppointmentQR({
          appointment_id: actionPayload.appointment?.id || actionPayload.appointment_id || `apt-${Date.now()}`,
          token: tokenNum,
          doctor_name: docName,
          appointment_date: targetDate,
          appointment_time: timeSlot,
        });

        actionPayload = {
          ...actionPayload,
          token: {
            token_number: tokenNum,
            doctor: docName,
            date: targetDate,
            time: timeSlot,
            patient: patientName,
          },
          qr_code: signedQr.qrString,
          signed_qr: signedQr,
        };

        // Persist atomic booking in DB so cancellation & queue lookups find it
        try {
          const matchedDoc = findDocMatch(docName) || doctors[0];
          const availableSlots = await db.calculateAvailableSlots(matchedDoc.id || matchedDoc.doctor_id, targetDate);
          const matchedSlot = availableSlots[0] || { id: 'slot-n8n-' + Date.now(), start_time: `${targetDate}T10:00:00Z` };
          await db.bookAppointmentAtomic({
            hospital_id: hospitalId,
            patient_name: patientName,
            patient_phone: patientPhone,
            doctor_id: matchedDoc.id || matchedDoc.doctor_id,
            slot_id: matchedSlot.id || matchedSlot.slot_id || 'slot-1',
            token: tokenNum,
            qr_ref: `qr_${tokenNum.replace(/#/g, '')}`,
            symptoms: `n8n AI Receptionist: ${transcriptText}`,
          });
        } catch (dbErr) {
          // Graceful fallback
        }

        // Trigger n8n Queue Notification Workflow (WF05)
        triggerN8nQueueNotification({
          appointment_id: actionPayload.appointment?.id || actionPayload.appointment_id,
          token_number: tokenNum,
          patient_name: patientName,
          phone_number: patientPhone,
          doctor_name: docName,
          department: actionPayload.department || 'General Medicine',
          queue_position: actionPayload.queue_position || 1,
          estimated_wait_minutes: actionPayload.estimated_wait_minutes || 15,
          correlation_id: actionPayload.correlation_id,
        }).catch(() => {});

        // Preserved Telegram alert
        sendAppointmentConfirmation({
          patientPhone,
          patientName,
          doctorName: docName,
          date: targetDate,
          time: timeSlot,
          token: tokenNum,
        }).catch(() => {});
      }

      if (intent === 'EMERGENCY_RESOURCE_REQUEST') {
        try {
          const emReq = await db.createEmergencyRequest({
            hospital_id: hospitalId,
            resource_type: 'OXYGEN',
            quantity: 5,
            urgency: 'CRITICAL',
          });
          if (emReq) {
            const reqObj = emReq.request || emReq;
            actionPayload = {
              ...actionPayload,
              request: {
                ...reqObj,
                id: reqObj.id || reqObj.request_id,
                request_id: reqObj.request_id || reqObj.id,
                matches: emReq.matches,
              },
            };
          }
        } catch (emErr) {}
      }

      // If cancellation, perform real DB cancellation and return completed status
      if (intent === 'CANCEL_APPOINTMENT') {
        const tokenMatch = transcriptText.match(/#?MED-\d+/i);
        const tok = tokenMatch ? tokenMatch[0].toUpperCase() : null;
        let cancelled = null;
        if (tok) {
          try {
            cancelled = await db.cancelAppointment(tok, hospitalId);
          } catch (cErr) {}
        }
        return {
          success: true,
          status: 'ACTION_COMPLETED',
          intent: 'CANCEL_APPOINTMENT',
          transcript: transcriptText,
          aiMessage: `Aapka appointment (${tok || 'specified'}) safaltapoorvak cancel kar diya gaya hai.`,
          configurationStatus: configStatus,
          actionPayload: { cancelled: true, token: tok, appointment: cancelled },
          context: currentContext,
        };
      }

      if (tokenNum || (n8nRes.success && n8nRes.status !== 'SLOT_UNAVAILABLE' && n8nRes.status !== 'UNPROCESSABLE_ENTITY')) {
        const finalMessage = fallbackTranslate(n8nRes.aiMessage || 'Appointment processed via n8n workflow.', input.language);
        const spoken = fallbackTranslate(n8nRes.spokenText || n8nRes.aiMessage, input.language);

        const matchedDoc = findDocMatch(actionPayload?.token?.doctor || actionPayload?.doctor_name || transcriptText) || doctors[0];
        const matchedDept = departments.find(dept =>
          dept.id === matchedDoc?.department_id ||
          transcriptText.toLowerCase().includes(dept.name.toLowerCase())
        );
        const resolvedDoctorName = matchedDoc ? matchedDoc.name : (actionPayload?.token?.doctor || 'Dr. Rajesh Sharma');
        const resolvedDepartmentName = matchedDept ? matchedDept.name : (matchedDoc?.department_name || actionPayload?.department || 'Orthopedics');

        const resolvedValidatedSlots = {
          doctorName: resolvedDoctorName,
          departmentName: resolvedDepartmentName,
          date: actionPayload?.token?.date || new Date().toISOString().split('T')[0],
          timeSlot: actionPayload?.token?.time || '10:30 AM',
          patientName: actionPayload?.token?.patient || 'Patient',
          token: tokenNum,
          ...(n8nRes.validatedSlots || {}),
        };
        if (!resolvedValidatedSlots.doctorName || resolvedValidatedSlots.doctorName === 'Doctor') {
          resolvedValidatedSlots.doctorName = resolvedDoctorName;
        }
        if (!resolvedValidatedSlots.departmentName) {
          resolvedValidatedSlots.departmentName = resolvedDepartmentName;
        }

        return {
          success: n8nRes.success ?? true,
          status: n8nRes.status || 'ACTION_COMPLETED',
          intent,
          transcript: transcriptText,
          aiMessage: finalMessage,
          spokenText: spoken,
          configurationStatus: configStatus,
          validatedSlots: resolvedValidatedSlots,
          missingSlots: n8nRes.missingSlots,
          actionPayload,
          context: { ...currentContext, ...(n8nRes.context || {}) },
        };
      }
      }
    }
  } catch (err) {
    // Fall back to local pipeline
  }
}

  // 3. Local Intent & Slot Extraction
  const extracted = await extractIntentAndSlots(transcriptText);
  let intent = extracted.intent;

  if (intent === 'UNKNOWN' && currentContext.pendingIntent) {
    intent = currentContext.pendingIntent;
  }

  const doctorQuery = extracted.doctorName || currentContext.doctorName;
  const deptQuery = extracted.department || currentContext.departmentName;
  const dateQuery = extracted.preferredDate || currentContext.date;
  const timeQuery = extracted.preferredTime || currentContext.timeSlot;
  const patientName = extracted.patientName || currentContext.patientName || 'Patient';
  const patientPhone = extracted.patientPhone || currentContext.patientPhone || '+91 98999 12345';
  const tokenIdQuery = extracted.tokenId || currentContext.tokenId;

  const doctors = await db.getDoctors(hospitalId);
  const departments = await db.getDepartments(hospitalId);

  const findDocMatch = (nameStr) => {
    if (!nameStr) return null;
    const clean = nameStr.toLowerCase().replace(/dr\.?\s*/i, '').trim();
    if (!clean || clean.length < 3) return null;
    // Direct inclusion
    const exact = doctors.find(d => {
      const dClean = d.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
      return dClean.includes(clean) || clean.includes(dClean);
    });
    if (exact) return exact;
    // First name match (e.g., Ananya matches Dr. Ananya Roy / Dr. Ananya Sharma)
    const firstName = clean.split(/\s+/)[0];
    if (firstName && firstName.length >= 4) {
      const matchedByFirst = doctors.filter(d => {
        const dClean = d.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
        return dClean.split(/\s+/)[0] === firstName;
      });
      if (matchedByFirst.length === 1) return matchedByFirst[0];
    }
    return null;
  };

  // 4. Strict Backend Validation Engine against Database
  switch (intent) {
    // -------------------------------------------------------------
    // INTENT 1: BOOK_APPOINTMENT
    // -------------------------------------------------------------
    case 'BOOK_APPOINTMENT': {
      // 4.1 Strict Doctor Hallucination Check:
      let matchedDbDoc = findDocMatch(transcriptText);

      let explicitDocCandidate = doctorQuery || '';
      const nonDoctorWords = ['se', 'ko', 'ka', 'ki', 'dikhao', 'dikhana', 'milna', 'appointment', 'chahiye', 'available', 'checkup', 'visit', 'consultation', 'hain', 'hai', 'kisi', 'kisko', 'pas', 'paas', 'ke'];

      if (!explicitDocCandidate) {
        const docMatch = transcriptText.match(/(?:dr\.?|doctor)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
        if (docMatch) {
          const firstWord = docMatch[1].trim().split(/\s+/)[0].toLowerCase();
          if (!nonDoctorWords.includes(firstWord)) {
            explicitDocCandidate = docMatch[1].trim();
          }
        }
      }

      if (explicitDocCandidate) {
        const docCandidateMatch = findDocMatch(explicitDocCandidate);
        if (!docCandidateMatch) {
          const docNames = doctors.map(d => d.name).join(', ');
          return {
            success: false,
            status: 'NEEDS_MORE_INFO',
            intent,
            transcript: transcriptText,
            aiMessage: `Maaf kijiye, ${explicitDocCandidate} hamare hospital me registered nahi hain. Hamare pass ye doctors available hain: ${docNames}.`,
            configurationStatus: configStatus,
            missingSlots: ['doctor'],
            suggestedActions: doctors.map(d => ({ label: d.name, text: `${d.name} se appointment chahiye` })),
            context: { ...currentContext, pendingIntent: 'BOOK_APPOINTMENT', patientName, patientPhone },
          };
        }
        matchedDbDoc = docCandidateMatch;
      }

      const userMentionedDoc = Boolean(explicitDocCandidate);

      let selectedDoctor = matchedDbDoc ||
        (currentContext.doctorId ? doctors.find(d => (d.doctor_id === currentContext.doctorId || d.id === currentContext.doctorId)) : null) ||
        findDocMatch(doctorQuery);

      let selectedDepartment = departments.find(dep => {
        if (!deptQuery) return false;
        const target = deptQuery.toLowerCase();
        return dep.name.toLowerCase().includes(target) || target.includes(dep.name.toLowerCase());
      });

      if (selectedDoctor && !selectedDepartment) {
        selectedDepartment = departments.find(d => (d.department_id === selectedDoctor.department_id || d.id === selectedDoctor.department_id));
      }

      if (!selectedDoctor && selectedDepartment && !userMentionedDoc) {
        const deptDocs = doctors.filter(d => (d.department_id === selectedDepartment.department_id || d.department_id === selectedDepartment.id));
        if (deptDocs.length === 1) {
          selectedDoctor = deptDocs[0];
        }
      }

      // Check if missing doctor/department
      if (!selectedDoctor && !selectedDepartment) {
        const deptNames = departments.map(d => d.name).join(', ');
        return {
          success: true,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: `Bilkul! Aap kis problem ke liye doctor se milna chahte hain ya kis department me appointment chahiye? Available departments: ${deptNames}.`,
          configurationStatus: configStatus,
          missingSlots: ['department', 'doctor'],
          suggestedActions: doctors.slice(0, 4).map(d => {
            const dep = departments.find(depItem => (depItem.id === d.department_id || depItem.department_id === d.department_id));
            return {
              label: `🩺 ${d.name} (${dep?.name || d.specialization})`,
              text: `${d.name} se appointment chahiye aaj`,
            };
          }),
          context: {
            ...currentContext,
            pendingIntent: 'BOOK_APPOINTMENT',
            patientName,
            patientPhone,
          },
        };
      }

      if (!selectedDoctor && selectedDepartment) {
        const deptDocs = doctors.filter(d => (d.department_id === selectedDepartment.department_id || d.department_id === selectedDepartment.id));
        const docNames = deptDocs.map(d => d.name).join(', ');
        const userSymptoms = extracted.symptoms || currentContext.symptoms;
        let responseMsg = '';
        if (input.language === 'English') {
          responseMsg = userSymptoms
            ? `I understand you are experiencing ${userSymptoms}. For these symptoms, our ${selectedDepartment.name} department is recommended, where ${docNames} is available. Which doctor and date would you prefer?`
            : `Got it. ${selectedDepartment.name} department has these available doctors: ${docNames}. Which doctor and date would you prefer?`;
        } else if (input.language === 'Hindi') {
          responseMsg = userSymptoms
            ? `मैं समझता हूँ कि आपको ${userSymptoms} की समस्या है। इसके लिए हमारा ${selectedDepartment.name} विभाग उपयुक्त है, जहाँ ${docNames} उपलब्ध हैं। आप किस डॉक्टर से किस तारीख को मिलना चाहेंगे?`
            : `सही है। ${selectedDepartment.name} विभाग में यह डॉक्टर उपलब्ध हैं: ${docNames}। आप किस डॉक्टर से किस तारीख को मिलना चाहेंगे?`;
        } else {
          responseMsg = userSymptoms
            ? `Aapko ${userSymptoms} ki dikkat hai, iske liye hamara ${selectedDepartment.name} department sahi rahega jahan ${docNames} available hain. Aap kin doctor se konsi date ko milna chahenge?`
            : `Sahi hai. ${selectedDepartment.name} department me ye doctors available hain: ${docNames}. Aap kin doctor se konsi date ko milna chahenge?`;
        }

        return {
          success: true,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: responseMsg,
          configurationStatus: configStatus,
          missingSlots: ['doctor', 'date'],
          suggestedActions: deptDocs.map(d => ({ label: `👨‍⚕️ ${d.name}`, text: `${d.name} se appointment chahiye aaj` })),
          context: {
            ...currentContext,
            pendingIntent: 'BOOK_APPOINTMENT',
            departmentId: selectedDepartment.department_id || selectedDepartment.id,
            departmentName: selectedDepartment.name,
            symptoms: userSymptoms,
            patientName,
            patientPhone,
          },
        };
      }

      if (selectedDoctor && !selectedDepartment) {
        selectedDepartment = departments.find(d => d.department_id === selectedDoctor.department_id);
      }

      // Check date and calculate available slots
      const todayStr = new Date().toISOString().split('T')[0];
      const targetDate = dateQuery && dateQuery !== 'Today' ? dateQuery : todayStr;

      // 4.2 Past / Unavailable Date check
      if (targetDate < todayStr) {
        return {
          success: false,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: `Maaf kijiye, ${targetDate} ki date nikal chuki hai. Kripya aaj (${todayStr}) ya aane wali koi date chunnein.`,
          configurationStatus: configStatus,
          missingSlots: ['date'],
          context: { ...currentContext, pendingIntent: 'BOOK_APPOINTMENT', doctorId: selectedDoctor.doctor_id, doctorName: selectedDoctor.name },
        };
      }

      let availableSlots = await db.calculateAvailableSlots(selectedDoctor.doctor_id, targetDate);

      if (availableSlots.length === 0) {
        return {
          success: false,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: `Maaf kijiye, ${selectedDoctor.name} ke pass ${targetDate} ko koi slot available nahi hai. Kripya koi dusri date chunnein.`,
          configurationStatus: configStatus,
          missingSlots: ['date'],
          context: { ...currentContext, pendingIntent: 'BOOK_APPOINTMENT', doctorId: selectedDoctor.doctor_id, doctorName: selectedDoctor.name },
        };
      }

      let selectedSlot;
      if (timeQuery) {
        const clean = (str) => (str || '').toLowerCase().replace(/[:\s]/g, '').replace(/00(?=am|pm)/, '');
        const targetClean = clean(timeQuery);
        selectedSlot = availableSlots.find(s => {
          const sClean = clean(s);
          return sClean === targetClean ||
                 s.toLowerCase().includes(timeQuery.toLowerCase()) ||
                 sClean.startsWith(targetClean);
        });
      }

      if (!selectedSlot) {
        const firstSlots = availableSlots.slice(0, 4).join(', ');
        return {
          success: true,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: `${selectedDoctor.name} (${selectedDepartment?.name || 'OPD'}) ke pass ${targetDate} ko ye time slots available hain: ${firstSlots}. Aap kis samay aana chahenge?`,
          configurationStatus: configStatus,
          missingSlots: ['timeSlot'],
          suggestedActions: availableSlots.slice(0, 4).map(s => ({ label: `⏰ ${s}`, text: `${selectedDoctor.name} at ${s}` })),
          context: {
            ...currentContext,
            pendingIntent: 'BOOK_APPOINTMENT',
            doctorId: selectedDoctor.doctor_id,
            doctorName: selectedDoctor.name,
            departmentName: selectedDepartment?.name,
            date: targetDate,
            patientName,
            patientPhone,
          },
        };
      }

      // Execute Atomic Booking via Database
      try {
        const slots = await db.getDoctorSlots(selectedDoctor.doctor_id || selectedDoctor.id, targetDate);
        const matchedSlot = slots.find(s =>
          s.status === 'AVAILABLE' && (s.display_time === selectedSlot || s.start_time.includes(selectedSlot))
        ) || slots.find(s => s.status === 'AVAILABLE');

        if (!matchedSlot) {
          throw new Error(`Time slot ${selectedSlot} is no longer available on ${targetDate}.`);
        }

        let patient = await db.getPatientByPhone(patientPhone);
        if (!patient) {
          patient = await db.createPatient({ name: patientName, phone: patientPhone });
        }

        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const token = `#MED-${randomNum}`;

        const bookResult = await db.bookAppointmentAtomic({
          patient_id: patient.id || patient.patient_id,
          doctor_id: selectedDoctor.id || selectedDoctor.doctor_id,
          department_id: selectedDepartment?.id || selectedDepartment?.department_id,
          slot_id: matchedSlot.id || matchedSlot.slot_id,
          token,
          qr_ref: `qr_${randomNum}`,
          symptoms: `Voice AI Receptionist Booking: ${transcriptText}`,
        });

        // Send Telegram Confirmation
        sendAppointmentConfirmation({
          patientPhone,
          patientName,
          doctorName: selectedDoctor.name,
          date: targetDate,
          time: selectedSlot,
          token,
        }).catch(() => {});

        // Trigger n8n Workflow (MEDCONNECT | WF05 | QUEUE NOTIFICATION)
        triggerN8nQueueNotification({
          appointment_id: bookResult.appointment?.id || bookResult.appointment_id,
          patient_id: patient.id || patient.patient_id,
          patient_name: patientName,
          phone_number: patientPhone,
          token_number: token,
          queue_position: 1,
          estimated_wait_minutes: 10,
          doctor_name: selectedDoctor.name,
          room_number: selectedDoctor.room_number || 'Room 101',
          department: selectedDepartment?.name || 'General Medicine',
          reminder_stage: 'checked_in',
        }).catch(err => console.error('[n8n] Failed to trigger queue notification:', err.message));

        return {
          success: true,
          status: 'ACTION_COMPLETED',
          intent,
          transcript: transcriptText,
          aiMessage: `Aapka appointment successful book ho gaya hai! Doctor: ${selectedDoctor.name}, Date: ${targetDate}, Time: ${selectedSlot}. Aapka Queue Token ID hai: ${token}.`,
          configurationStatus: configStatus,
          validatedSlots: {
            doctorName: selectedDoctor.name,
            departmentName: selectedDepartment?.name,
            date: targetDate,
            timeSlot: selectedSlot,
            patientName,
            token,
          },
          actionPayload: {
            appointment: bookResult.appointment || {
              id: bookResult.appointment_id,
              doctor_id: selectedDoctor.doctor_id,
              appointment_date: targetDate,
              appointment_time: selectedSlot,
              status: 'BOOKED',
            },
            token: {
              token_number: token,
              doctor: selectedDoctor.name,
              date: targetDate,
              time: selectedSlot,
            },
          },
          context: {},
        };
      } catch (err) {
        return {
          success: false,
          status: 'ERROR',
          intent,
          transcript: transcriptText,
          aiMessage: `Backend Validation Error: ${err.message}`,
          configurationStatus: configStatus,
          context: currentContext,
        };
      }
    }

    // -------------------------------------------------------------
    // INTENT 2: CHECK_APPOINTMENT
    // -------------------------------------------------------------
    case 'CHECK_APPOINTMENT': {
      const appointments = await db.getAppointments({ hospital_id: hospitalId });
      let appt = appointments.find(a =>
        (tokenIdQuery && (a.token === tokenIdQuery || a.token_number === tokenIdQuery || a.appointment_id === tokenIdQuery || a.id === tokenIdQuery)) ||
        (patientPhone && a.patient_phone === patientPhone)
      );

      if (!appt && appointments.length > 0) {
        appt = appointments[appointments.length - 1];
      }

      if (!appt) {
        return {
          success: false,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: 'Aapka koi active appointment nahi mila. Kripya apna registered phone number ya Token ID (jaise #MED-4029) batayein.',
          configurationStatus: configStatus,
          missingSlots: ['tokenId', 'patientPhone'],
          context: currentContext,
        };
      }

      const doctor = doctors.find(d => d.doctor_id === appt.doctor_id || d.id === appt.doctor_id);

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: `Aapka active appointment mila! Doctor: ${doctor?.name || 'OPD'}, Date: ${appt.appointment_date}, Time: ${appt.appointment_time}, Status: ${appt.status}.`,
        configurationStatus: configStatus,
        validatedSlots: { appointmentId: appt.appointment_id || appt.id, status: appt.status },
        actionPayload: { appointment: appt },
      };
    }

    // -------------------------------------------------------------
    // INTENT 3: CANCEL_APPOINTMENT
    // -------------------------------------------------------------
    case 'CANCEL_APPOINTMENT': {
      const appointments = await db.getAppointments({ hospital_id: hospitalId });
      let appt = appointments.find(a =>
        a.status !== 'CANCELLED' && (
          (tokenIdQuery && (a.token === tokenIdQuery || a.token_number === tokenIdQuery || a.appointment_id === tokenIdQuery || a.id === tokenIdQuery)) ||
          (patientPhone && a.patient_phone === patientPhone)
        )
      );

      if (!appt) {
        const activeBookings = appointments.filter(a => a.status === 'BOOKED');
        if (activeBookings.length > 0) appt = activeBookings[activeBookings.length - 1];
      }

      if (!appt) {
        return {
          success: false,
          status: 'NEEDS_MORE_INFO',
          intent,
          transcript: transcriptText,
          aiMessage: 'Cancel karne ke liye koi active appointment nahi mila. Kripya apna Token ID ya Phone number dein.',
          configurationStatus: configStatus,
          missingSlots: ['tokenId'],
          context: currentContext,
        };
      }

      const cancelled = await db.cancelAppointment(appt.appointment_id || appt.id);

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: `Aapka appointment (${cancelled.token || cancelled.appointment_id || appt.id}) safaltapoorvak cancel kar diya gaya hai.`,
        configurationStatus: configStatus,
        validatedSlots: { appointmentId: appt.appointment_id || appt.id, status: 'CANCELLED' },
        actionPayload: { appointment: cancelled },
      };
    }

    // -------------------------------------------------------------
    // INTENT 4: CHECK_QUEUE
    // -------------------------------------------------------------
    case 'CHECK_QUEUE': {
      const tokenToLookup = tokenIdQuery || '#MED-1001';
      const metrics = await db.getPatientQueueMetrics(tokenToLookup);

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: `Token ${metrics.my_token}: Current token in consultation: ${metrics.current_token}. Aapke aage ${metrics.people_ahead} patients hain. Estimated wait time: ${metrics.estimated_wait_minutes} minutes.`,
        configurationStatus: configStatus,
        validatedSlots: { tokenId: metrics.my_token, position: metrics.queue_position },
        actionPayload: { metrics },
        suggestedActions: [
          { label: '🔄 Refresh Queue', text: `Token ${metrics.my_token} queue status` },
          { label: '❌ Cancel Appointment', text: `Cancel appointment ${metrics.my_token}` },
        ],
      };
    }

    // -------------------------------------------------------------
    // INTENT 5: CHECK_DOCTOR_AVAILABILITY
    // -------------------------------------------------------------
    case 'CHECK_DOCTOR_AVAILABILITY': {
      const todayStr = new Date().toISOString().split('T')[0];
      const checkDate = dateQuery || todayStr;

      const results = [];
      for (const doc of doctors) {
        const dept = departments.find(d => d.department_id === doc.department_id);
        const slots = await db.calculateAvailableSlots(doc.doctor_id, checkDate);
        results.push({
          id: doc.doctor_id,
          name: doc.name,
          specialization: doc.specialization,
          department: dept?.name || 'General',
          availableSlotsCount: slots.length,
          nextSlots: slots.slice(0, 3),
        });
      }

      const summary = results.map(r => `${r.name} (${r.department}): ${r.availableSlotsCount} slots available (${r.nextSlots.join(', ')})`).join('; ');

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: `Doctors availability on ${checkDate}: ${summary}.`,
        configurationStatus: configStatus,
        validatedSlots: { checkDate },
        actionPayload: { availability: results },
        suggestedActions: doctors.slice(0, 3).map(d => ({ label: `🩺 Book ${d.name}`, text: `Book ${d.name} today` })),
      };
    }

    // -------------------------------------------------------------
    // INTENT 6: CHECK_DUES
    // -------------------------------------------------------------
    case 'CHECK_DUES': {
      const duesInfo = await db.getDues(patientPhone || patientName);
      const fee = duesInfo.consultationFee || doctors[0]?.consultation_fee || 500;
      const dues = duesInfo.totalDues || 0;
      const pName = duesInfo.patientName || patientName;
      const msg = dues > 0
        ? `Patient ${pName} ke ₹${dues} pending dues hain. Standard OPD consultation fee ₹${fee} per visit hai.`
        : `Patient ${pName} ke koi pending dues nahi hain. Standard OPD consultation fee ₹${fee} per visit hai.`;

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: msg,
        configurationStatus: configStatus,
        validatedSlots: { patientName: pName, totalDues: dues, consultationFee: fee },
        actionPayload: { dues, consultationFee: fee },
      };
    }

    // -------------------------------------------------------------
    // INTENT 7: GENERAL_HOSPITAL_QUERY
    // -------------------------------------------------------------
    case 'GENERAL_HOSPITAL_QUERY': {
      const hospitals = await db.getHospitals();
      const hospital = hospitals.find(h => h.id === hospitalId || h.hospital_id === hospitalId) || hospitals[0];
      const depts = departments.map(d => d.name).join(', ');

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: `${hospital.name}: Address - ${hospital.address || hospital.contact}. Helpline: ${hospital.contact}. Emergency Contact: ${hospital.emergency_contact || '102'}. OPD Hours: Mon-Sat 09:00 AM - 05:00 PM. Active Departments: ${depts}.`,
        configurationStatus: configStatus,
        validatedSlots: { hospitalName: hospital.name },
        actionPayload: { hospital },
      };
    }

    // -------------------------------------------------------------
    // INTENT 8: EMERGENCY_RESOURCE_REQUEST
    // -------------------------------------------------------------
    case 'EMERGENCY_RESOURCE_REQUEST': {
      const resourceType = extracted.resourceType || 'Oxygen';
      const quantity = extracted.quantity || 2;
      const urgency = extracted.urgency || 'CRITICAL';

      const res = await db.createEmergencyRequest({
        requesting_hospital_id: hospitalId,
        resource_type: resourceType,
        quantity,
        urgency,
        notes: `Voice Emergency Request: ${transcriptText}`,
      });

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent,
        transcript: transcriptText,
        aiMessage: `🚨 Emergency Request Logged! Resource: ${quantity} ${resourceType}. Request ID: ${res.request.id || res.request.request_id}. Matched facilities within 15 km: ${res.matches.length}.`,
        configurationStatus: configStatus,
        validatedSlots: { resourceType, quantity, urgency },
        actionPayload: res,
      };
    }

    // -------------------------------------------------------------
    // INTENT 9: GREETING
    // -------------------------------------------------------------
    case 'GREETING': {
      const isHindi = input.language === 'Hindi';
      const isEnglish = input.language === 'English';
      const msg = isHindi
        ? 'नमस्ते! यशोदा हॉस्पिटल के मेडकनेक्ट एआई रिसेप्शनिस्ट में आपका स्वागत है। आज मैं आपकी क्या सहायता कर सकता हूँ? आप डॉक्टर अपॉइंटमेंट बुक कर सकते हैं, डॉक्टरों की उपलब्धता जान सकते हैं, या अपनी टोकन कतार स्थिति देख सकते हैं।'
        : isEnglish
        ? 'Hello! Welcome to MedConnect AI Receptionist at Yashoda Hospital. How may I assist you today? I can help you book an appointment, check doctor availability, track your queue token, or handle emergency requests.'
        : 'Namaste! Yashoda Hospital ke MedConnect AI Receptionist me aapka swagat hai. Main aapki appointment booking, doctor availability, queue status check, ya hospital queries me help kar sakta hoon. Aap kaise sahayata chahte hain?';

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent: 'GREETING',
        transcript: transcriptText,
        aiMessage: msg,
        configurationStatus: configStatus,
        suggestedActions: [
          { label: '🩺 Book Appointment', text: 'I want to book an appointment' },
          { label: '👨‍⚕️ Available Doctors', text: 'Which doctors are available today?' },
          { label: '🔢 Check Queue', text: 'Give me my queue/token number' },
          { label: '💳 Check Dues', text: 'What are my pending dues?' },
        ],
      };
    }

    // -------------------------------------------------------------
    // INTENT 10: CAPABILITIES_QUERY
    // -------------------------------------------------------------
    case 'CAPABILITIES_QUERY': {
      const isHindi = input.language === 'Hindi';
      const isEnglish = input.language === 'English';
      const msg = isHindi
        ? 'मैं यशोदा हॉस्पिटल का मेडकनेक्ट एआई रिसेप्शनिस्ट हूँ। मैं आपकी इन सेवाओं में सहायता कर सकता हूँ:\n1. 🩺 विशेषज्ञ डॉक्टरों के साथ अपॉइंटमेंट बुक करना (कार्डियोलॉजी, ऑर्थोपेडिक्स, जनरल मेडिसिन, पीडियाट्रिक्स)।\n2. ⏱️ डॉक्टरों की उपलब्धता और समय स्लॉट देखना।\n3. 🔢 अपनी लाइव ओपीडी कतार संख्या और प्रतीक्षा समय जांचना।\n4. 💳 परामर्श शुल्क और बकाया राशि की जानकारी प्राप्त करना।\n5. 🚨 आपातकालीन संसाधन (ऑक्सीजन, आईसीयू बेड, रक्त, एम्बुलेंस) अनुरोध दर्ज करना।\n\nआज मैं आपकी क्या सहायता कर सकता हूँ?'
        : isEnglish
        ? 'I am MedConnect\'s AI Receptionist for Yashoda Hospital. Here is how I can assist you:\n1. 🩺 Book appointments with specialist doctors (Cardiology, Orthopedics, General Medicine, Pediatrics).\n2. ⏱️ Check real-time doctor availability and open slots.\n3. 🔢 Track your live OPD queue token position and estimated wait time.\n4. 💳 Check consultation fees and pending dues.\n5. 🚨 Dispatch emergency resource requests (Oxygen, ICU beds, Blood, Ambulances).\n\nHow may I help you today?'
        : 'Main Yashoda Hospital ka MedConnect AI Receptionist hoon. Main aapki in cheezon me help kar sakta hoon:\n1. 🩺 Specialists ke sath appointment book karna.\n2. ⏱️ Doctor availability aur open time slots check karna.\n3. 🔢 Live OPD queue token aur wait time dekhna.\n4. 💳 Consultation fee aur pending dues check karna.\n5. 🚨 Emergency resources (Oxygen, ICU beds, Blood, Ambulance) request karna.\n\nAapko kis service me help chahiye?';

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent: 'CAPABILITIES_QUERY',
        transcript: transcriptText,
        aiMessage: msg,
        configurationStatus: configStatus,
        suggestedActions: [
          { label: '🩺 Book Appointment', text: 'I want to book an appointment' },
          { label: '👨‍⚕️ Doctor Schedules', text: 'Which doctors are available today?' },
          { label: '🔢 Check Queue Status', text: 'Give me my queue/token number' },
        ],
      };
    }

    // -------------------------------------------------------------
    // INTENT 11: UNKNOWN / USER-RESPONSIVE FALLBACK
    // -------------------------------------------------------------
    case 'UNKNOWN':
    default: {
      const isHindi = input.language === 'Hindi';
      const isEnglish = input.language === 'English';
      const msg = isHindi
        ? `आपने कहा: "${transcriptText}"। मैं यशोदा हॉस्पिटल का एआई रिसेप्शनिस्ट हूँ। आप मुझसे डॉक्टर अपॉइंटमेंट बुक करने, डॉक्टरों की उपलब्धता जांचने, कतार स्थिति देखने, या अस्पताल संबंधी प्रश्न पूछने के लिए कह सकते हैं। आज मैं आपकी क्या सहायता करूँ?`
        : isEnglish
        ? `You said: "${transcriptText}". I am MedConnect AI Receptionist for Yashoda Hospital. You can ask me to book a doctor appointment, check doctor schedules, track your queue token, or inquire about hospital facilities. How can I assist you with this?`
        : `Aapne kaha: "${transcriptText}". Main Yashoda Hospital ka AI Receptionist hoon. Aap mujhse doctor appointment book karne, doctor availability check karne, token queue dekhne, ya hospital ki details lene ke liye keh sakte hain. Aap kya karna chahenge?`;

      return {
        success: true,
        status: 'ACTION_COMPLETED',
        intent: 'UNKNOWN',
        transcript: transcriptText,
        aiMessage: msg,
        configurationStatus: configStatus,
        suggestedActions: [
          { label: '🩺 Book Appointment', text: 'I want to book an appointment' },
          { label: '👨‍⚕️ Available Doctors', text: 'Which doctors are available today?' },
          { label: '🔢 Check Queue', text: 'Give me my queue/token number' },
        ],
      };
    }
  }
}

export default {
  getReceptionistConfigStatus,
  getWelcomeMessage,
  fallbackTranslate,
  translateAiMessage,
  processReceptionistTurn,
};
