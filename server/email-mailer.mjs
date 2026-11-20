import nodemailer from 'nodemailer';

let cachedTransporter = null;
let cachedConfigKey = '';

export function isEmailConfigured() {
  return Boolean(
    String(process.env.SMTP_USER || '').trim() &&
      String(process.env.SMTP_PASS || '').trim(),
  );
}

function getTransporter() {
  const host = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT || 465) || 465;
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const key = `${host}:${port}:${user}:${pass.length}`;

  if (!cachedTransporter || cachedConfigKey !== key) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 8000,
      pool: true,
      maxConnections: 2,
    });
    cachedConfigKey = key;
  }
  return cachedTransporter;
}

export function resetEmailTransporterForTests() {
  cachedTransporter = null;
  cachedConfigKey = '';
}

export async function sendEmail({ to, subject, html, text, transportOverride = null }) {
  const recipient = String(to || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return { sent: false, error: 'INVALID_RECIPIENT' };
  }
  if (!transportOverride && !isEmailConfigured()) {
    return { sent: false, error: 'SMTP_NOT_CONFIGURED' };
  }

  try {
    const transporter = transportOverride || getTransporter();
    const from =
      String(process.env.SMTP_FROM || '').trim() ||
      `CompanyGen <${String(process.env.SMTP_USER || 'no-reply@companygen.store').trim()}>`;

    const sendPromise = transporter.sendMail({
      from,
      to: recipient,
      subject: String(subject || 'Notificação CompanyGen').slice(0, 180),
      html: html || undefined,
      text: text || undefined,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 8500),
    );

    const info = await Promise.race([sendPromise, timeoutPromise]);
    return { sent: true, messageId: info?.messageId || null, error: null };
  } catch (err) {
    const code = String(err?.code || err?.message || 'SMTP_ERROR')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 120);
    return { sent: false, messageId: null, error: code };
  }
}
