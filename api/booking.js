const https = require('https');
const querystring = require('querystring');
let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) { nodemailer = null; }

const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || '15527771775@qq.com';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@chinawheely.com';
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 465;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const SUCCESS_URL = process.env.SUCCESS_URL || '/thank-you.html';
const REPLY_TO_FIELD = process.env.REPLY_TO_FIELD || 'email';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);

const serviceLabels = {
  'airport': 'Airport Pickup',
  'city': 'City Transfer',
  'intercity': 'Intercity Transfer',
  'hourly': 'Hourly Charter',
  'airport-transfer': 'Airport Transfer',
  'intercity-transfer': 'Intercity Transfer',
  'hourly-charter': 'Hourly Charter',
  'point-to-point': 'Point-to-Point',
  'disposal': 'Disposal'
};

const vehicleLabels = {
  'economy': 'Economy Sedan',
  'business': 'Business Sedan',
  'mpv': 'MPV / Van',
  'luxury': 'Luxury Vehicle'
};

function getOrigin(req) {
  const requestOrigin = req.headers.origin || req.headers.referer || '';
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0] || '*';
}

function setCorsHeaders(res, req) {
  res.setHeader('Access-Control-Allow-Origin', getOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/\u0026/g, '\u0026amp;')
    .replace(/\u003c/g, '\u0026lt;')
    .replace(/\u003e/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#039;');
}

function formatLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function getSubmitterName(data) {
  const first = data.firstName || '';
  const last = data.lastName || '';
  return `${first} ${last}`.trim();
}

function buildSubject(data) {
  const parts = [];
  const serviceLabel = (data.serviceTypeLabel && String(data.serviceTypeLabel).trim()) ||
                       serviceLabels[data.serviceType] ||
                       formatLabel(data.serviceType) ||
                       '';
  if (serviceLabel) parts.push(serviceLabel);
  if (data.routeSummary && String(data.routeSummary).trim()) parts.push(String(data.routeSummary).trim());
  const name = getSubmitterName(data);
  if (name) parts.push(`from ${name}`);
  if (parts.length === 0) return 'New Chinawheely Booking';
  return `${parts.join(' ')} - Chinawheely`;
}

function buildEmail(data, meta = {}) {
  const hidden = new Set(['website', '_honey', '_subject', '_next', '_template', '_captcha', '_replyto', '_cc']);
  const entries = Object.entries(data).filter(([k, v]) => {
    if (hidden.has(k)) return false;
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
  });

  const importantFields = new Set(['routeSummary', 'serviceTypeLabel', 'price', 'totalPrice', 'vehicleLabel', 'date', 'time', 'pickupDate', 'pickupTime']);

  const rows = entries.map(([k, v]) => {
    const label = formatLabel(k);
    const value = Array.isArray(v) ? v.join(', ') : String(v);
    const important = importantFields.has(k) ? 'background:#E8F5E9;font-weight:600;' : '';
    return `<tr style="${important}"><td style="padding:8px 12px;border:1px solid #ddd;background:${important ? '#E8F5E9' : '#f8f8f8'}"><strong>${escapeHtml(label)}</strong></td><td style="padding:8px 12px;border:1px solid #ddd;${important}">${escapeHtml(value)}</td></tr>`;
  }).join('');

  const metaRows = [];
  if (meta.reference) {
    metaRows.push(`<tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f8f8f8"><strong>Booking Reference</strong></td><td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(meta.reference)}</td></tr>`);
  }
  if (meta.submittedAt) {
    metaRows.push(`<tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f8f8f8"><strong>Submitted At</strong></td><td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(meta.submittedAt)}</td></tr>`);
  }
  if (meta.submitterIP) {
    metaRows.push(`<tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f8f8f8"><strong>Submitter IP</strong></td><td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(meta.submitterIP)}</td></tr>`);
  }

  const html = `<h2 style="color:#1B4D3E">New Chinawheely Booking Request</h2>
<p style="color:#555">Booking Reference: <strong>${escapeHtml(meta.reference || 'N/A')}</strong></p>
<table style="border-collapse:collapse;width:100%;max-width:600px">${metaRows.join('')}${rows}</table>`;

  const plainMeta = [
    meta.submittedAt ? `Submitted At: ${meta.submittedAt}` : '',
    meta.submitterIP ? `Submitter IP: ${meta.submitterIP}` : ''
  ].filter(Boolean).join('\n');

  const plain = ['New Chinawheely Booking Request', `Booking Reference: ${meta.reference || 'N/A'}`, plainMeta, '']
    .filter(Boolean)
    .concat(entries.map(([k, v]) => {
      const label = formatLabel(k);
      const value = Array.isArray(v) ? v.join(', ') : String(v);
      return `${label}: ${value}`;
    }))
    .join('\n');
  return { html, plain };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, req);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    setCorsHeaders(res, req);
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const body = await getBody(req);
  if (body.length > 100 * 1024) {
    setCorsHeaders(res, req);
    res.statusCode = 413;
    return res.end('Payload too large');
  }

  const data = querystring.parse(body);

  // Honeypot: silently succeed if filled
  if ((data.website && String(data.website).trim()) || (data._honey && String(data._honey).trim())) {
    setCorsHeaders(res, req);
    res.writeHead(302, { Location: SUCCESS_URL });
    return res.end();
  }

  const required = ['firstName', 'lastName', 'email', 'phone'];
  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      setCorsHeaders(res, req);
      res.statusCode = 400;
      return res.end('Missing required field: ' + field);
    }
  }

  if (!isValidEmail(data.email)) {
    setCorsHeaders(res, req);
    res.statusCode = 400;
    return res.end('Invalid email address');
  }

  const submitterIP = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '';
  const submittedAt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai', timeZoneName: 'short' });
  const reference = 'CWC-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  const baseSubject = buildSubject(data);
  const subject = reference ? `${baseSubject} [${reference}]` : baseSubject;
  const { html, plain } = buildEmail(data, { reference, submittedAt, submitterIP });

  const replyEmail = data[REPLY_TO_FIELD] && String(data[REPLY_TO_FIELD]).trim();
  await sendEmail({ subject, html, plain, replyEmail, res, req });
};

function sendViaSendGrid({ subject, html, plain, replyEmail }) {
  return new Promise((resolve, reject) => {
    const payload = {
      personalizations: [{ to: [{ email: RECIPIENT_EMAIL }] }],
      from: { email: SENDGRID_FROM_EMAIL },
      subject,
      content: [
        { type: 'text/plain', value: plain },
        { type: 'text/html', value: html }
      ]
    };
    if (replyEmail) payload.reply_to = { email: replyEmail };

    const postData = JSON.stringify(payload);
    const request = https.request({
      hostname: 'api.sendgrid.com',
      port: 443,
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SENDGRID_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (response) => {
      let responseBody = '';
      response.on('data', chunk => responseBody += chunk);
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
        } else {
          reject(new Error('SendGrid error: ' + responseBody));
        }
      });
    });
    request.on('error', reject);
    request.write(postData);
    request.end();
  });
}

async function sendViaSMTP({ subject, html, plain, replyEmail }) {
  if (!nodemailer) throw new Error('nodemailer not available');
  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD }
  });
  await transporter.sendMail({
    from: SENDGRID_FROM_EMAIL,
    to: RECIPIENT_EMAIL,
    replyTo: replyEmail || undefined,
    subject,
    text: plain,
    html
  });
}

async function sendEmail({ subject, html, plain, replyEmail, res, req }) {
  try {
    if (SENDGRID_API_KEY) {
      await sendViaSendGrid({ subject, html, plain, replyEmail });
    } else if (EMAIL_HOST && EMAIL_USER && EMAIL_PASSWORD) {
      await sendViaSMTP({ subject, html, plain, replyEmail });
    } else {
      setCorsHeaders(res, req);
      res.statusCode = 503;
      return res.end('Email service is not configured. Set SENDGRID_API_KEY or EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD in the Vercel dashboard.');
    }
    setCorsHeaders(res, req);
    res.writeHead(302, { Location: SUCCESS_URL });
    return res.end();
  } catch (err) {
    setCorsHeaders(res, req);
    res.statusCode = 502;
    res.end('Email failed: ' + err.message);
  }
}
