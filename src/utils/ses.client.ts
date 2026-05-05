import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '../config/env';

const sesClient = new SESClient({ region: env.AWS_REGION });

export async function sendOtpEmail(
  toEmail: string,
  otp: string,
): Promise<void> {
  if (process.env.SKIP_SES === 'true') {
    console.log(`[DEV] OTP for ${toEmail}: ${otp}`);
    return;
  }

  const fromEmail = env.AWS_SES_FROM_EMAIL ?? 'noreply@hashira.io';

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'Your Hashira login code' },
      Body: {
        Text: {
          Data: `Your one-time login code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
        },
      },
    },
  });

  await sesClient.send(command);
}

export async function sendPasswordResetEmail(
  toEmail: string,
  otp: string,
): Promise<void> {
  if (process.env.SKIP_SES === 'true') {
    console.log(`[DEV] Password reset OTP for ${toEmail}: ${otp}`);
    return;
  }

  const fromEmail = env.AWS_SES_FROM_EMAIL ?? 'noreply@hashira.io';

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'Reset your Hashira password' },
      Body: {
        Text: {
          Data: `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nIf you did not request a password reset, you can safely ignore this email.`,
        },
      },
    },
  });

  await sesClient.send(command);
}
