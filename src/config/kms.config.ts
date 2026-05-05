import { KMSClient } from '@aws-sdk/client-kms';

export function createKmsClient(): KMSClient {
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION environment variable is not set');
  }
  return new KMSClient({ region: process.env.AWS_REGION });
}
