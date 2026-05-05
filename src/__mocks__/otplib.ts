export const verify = jest.fn().mockResolvedValue({ valid: true });
export const generateSecret = jest
  .fn()
  .mockReturnValue('MOCK_TOTP_SECRET_BASE32');
export const generateURI = jest
  .fn()
  .mockReturnValue(
    'otpauth://totp/test?secret=MOCK_TOTP_SECRET_BASE32&issuer=Hashira',
  );
