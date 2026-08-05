import nodemailer from 'nodemailer';
import config from '../config';

export const sendEmail = async (to: string, subject: string, html: string) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', // 'smtp.gmail.com',
    port: 587,
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
