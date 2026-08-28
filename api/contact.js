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
const SUCCESS_URL = process.env.CONTACT_SUCCESS_URL || 'https://www.chinawheely.com/contact.html';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://www.chinawheely.com').split(',').map(s => s.trim()).filter(Boolean);

function setCorsHeaders(res, req) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*') || origin.endsWith('chinawheely.com');
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://www.chinawheely.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function sendViaSendGrid({ subject, html, plain, replyTo }) {
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
    if (replyTo) payload.reply_to = { email: replyTo };

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

async function sendViaSMTP({ subject, html, plain, replyTo }) {
  if (!nodemailer) throw new Error('nodemailer not available');
  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD }
  });
  await transporter.sendMail({
    from: `Chinawheely <${SENDGRID_FROM_EMAIL}>`,
    to: RECIPIENT_EMAIL,
    replyTo: replyTo || undefined,
    subject,
    text: plain,
    html
  });
}

async function sendEmail({ subject, html, plain, replyTo, res, req }) {
  try {
    if (SENDGRID_API_KEY) {
      await sendViaSendGrid({ subject, html, plain, replyTo });
    } else if (EMAIL_HOST && EMAIL_USER && EMAIL_PASSWORD) {
      await sendViaSMTP({ subject, html, plain, replyTo });
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

  if ((data.website && String(data.website).trim())) {
    setCorsHeaders(res, req);
    res.writeHead(302, { Location: SUCCESS_URL });
    return res.end();
  }

  const required = ['firstName', 'lastName', 'email', 'message'];
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

  const firstName = escapeHtml(data.firstName);
  const lastName = escapeHtml(data.lastName);
  const email = String(data.email).toLowerCase().trim();
  const phone = escapeHtml(data.phone);
  const subject = escapeHtml(data.subject || 'General inquiry');
  const message = escapeHtml(data.message);

  const plain = `New Chinawheely Contact Message

Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone || '-'}
Subject: ${subject}
Message:
${message}
`;

  const html = `<h2>New Chinawheely Contact Message</h2>
<table border="1" cellpadding="6" style="border-collapse:collapse">
  <tr><td><strong>Name</strong></td><td>${firstName} ${lastName}</td></tr>
  <tr><td><strong>Email</strong></td><td>${email}</td></tr>
  <tr><td><strong>Phone</strong></td><td>${phone || '-'}</td></tr>
  <tr><td><strong>Subject</strong></td><td>${subject}</td></tr>
  <tr><td><strong>Message</strong></td><td>${message.replace(/\n/g, '<br>')}</td></tr>
</table>`;

  await sendEmail({
    subject: `【Chinawheely】Contact: ${subject} — ${firstName} ${lastName}`,
    html,
    plain,
    replyTo: email,
    res,
    req
  });
};
