import nodemailer from 'nodemailer';
import config from '../config';

export const sendEmail = async (to: string, subject: string, html: string) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', // 'smtp.gmail.com',
    port: Number(config.email.port) || 587,
    secure: false, // TLS
    auth: {
      user: config.email.nodemailer_host_email, // Gmail address
      pass: config.email.nodemailer_host_pass, // Gmail App Password
    },
  });

  try {
    const info = await transporter.sendMail({
      from: 'support@skatrium.com', // Must match auth user
      to,
      subject,
      html,
    });

    console.log(`OTP email sent to: ${to}, MessageId: ${info.messageId}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

export const addContactToBrevo = async (email: string, fullName: string) => {
  if (!config.email.brevo_api_key) {
    console.warn('Brevo API key is not configured. Skipping adding contact.');
    return;
  }

  // Split fullName into FIRSTNAME and LASTNAME
  const nameParts = fullName.split(' ');
  const FIRSTNAME = nameParts[0] || '';
  const LASTNAME = nameParts.slice(1).join(' ') || '';

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': config.email.brevo_api_key,
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME,
          LASTNAME,
        },
        listIds: [9], // Default list ID (adjust if needed)
        updateEnabled: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to add contact to Brevo:', errorData);
    } else {
      console.log(`Successfully added/updated contact ${email} in Brevo.`);
    }
  } catch (error) {
    console.error('Error adding contact to Brevo:', error);
  }
};
