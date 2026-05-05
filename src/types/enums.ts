export enum OrgStatus {
  PAYMENT_PENDING = 'payment_pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum UserRole {
  MEMBER = 'member',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  REMOVED = 'removed',
}

export enum EventStatus {
  PROCESSING = 'processing',
  ANCHORING = 'anchoring',
  ANCHORED = 'anchored',
  ANCHOR_FAILED = 'anchor_failed',
}

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
}

export enum ApiKeyPermission {
  EVENTS_WRITE = 'events:write',
  EVENTS_READ = 'events:read',
  VERIFICATION_READ = 'verification:read',
}
