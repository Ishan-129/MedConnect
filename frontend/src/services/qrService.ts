/**
 * QR Service for Frontend
 * Generates cryptographic data URL QR codes for appointment passes.
 */

import QRCode from 'qrcode';

export async function generateQRCodeDataUrl(payload: any): Promise<string> {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.warn('[qrService] Failed to generate canvas QR, falling back to SVG string:', err);
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="20">QR: ${encodeURIComponent(text)}</text></svg>`;
  }
}

export default {
  generateQRCodeDataUrl,
};
