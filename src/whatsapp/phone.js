export function cleanPhone(phone) {
  if (!phone) {
    throw new Error('Phone number is required');
  }

  return String(phone).replace(/[\s+\-()]/g, '');
}

export function formatIndianPhoneToJid(phone) {
  const cleaned = cleanPhone(phone);

  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  let normalized = cleaned;

  if (cleaned.length === 10) {
    normalized = `91${cleaned}`;
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    normalized = cleaned;
  } else {
    throw new Error(`Invalid Indian phone number: ${phone}`);
  }

  return `${normalized}@s.whatsapp.net`;
}
