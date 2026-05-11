/*
 * Seeds 4 demo orgs, each with 1 admin + 2 members. Safe to run multiple
 * times — uses upsert logic (finds by name / email before creating).
 *
 * Orgs:
 *   1. Vought Industries      — homelander / deep / noir
 *   2. Stark Industries       — tony / pepper / rhodey
 *   3. Wayne Enterprises      — bruce / alfred / lucius
 *   4. Umbrella Corporation   — wesker / jill / leon
 */
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/database';
import { Organisation } from '../entities/organisation.entity';
import { User } from '../entities/user.entity';
import {
  OrgStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
} from '../types/enums';

interface SeedUser {
  email: string;
  plain: string;
  role: UserRole;
}

interface SeedOrg {
  name: string;
  users: SeedUser[];
}

const ORGS: SeedOrg[] = [
  {
    name: 'Vought Industries',
    users: [
      { email: 'homelander@vought.com', plain: 'Homelander@123', role: UserRole.ADMIN },
      { email: 'deep@vought.com',        plain: 'Deep@123',        role: UserRole.MEMBER },
      { email: 'noir@vought.com',        plain: 'Noir@123',        role: UserRole.MEMBER },
    ],
  },
  {
    name: 'Stark Industries',
    users: [
      { email: 'tony@starkindustries.com',   plain: 'TonyStark@123', role: UserRole.ADMIN },
      { email: 'pepper@starkindustries.com', plain: 'Pepper@123',    role: UserRole.MEMBER },
      { email: 'rhodey@starkindustries.com', plain: 'Rhodey@123',    role: UserRole.MEMBER },
    ],
  },
  {
    name: 'Wayne Enterprises',
    users: [
      { email: 'bruce@wayneenterprises.com',  plain: 'BruceWayne@123', role: UserRole.ADMIN },
      { email: 'alfred@wayneenterprises.com', plain: 'Alfred@123',     role: UserRole.MEMBER },
      { email: 'lucius@wayneenterprises.com', plain: 'Lucius@123',     role: UserRole.MEMBER },
    ],
  },
  {
    name: 'Umbrella Corporation',
    users: [
      { email: 'wesker@umbrella.com', plain: 'Wesker@123', role: UserRole.ADMIN },
      { email: 'jill@umbrella.com',   plain: 'Jill@123',   role: UserRole.MEMBER },
      { email: 'leon@umbrella.com',   plain: 'Leon@123',   role: UserRole.MEMBER },
    ],
  },
];

async function seedOrg(
  orgRepo: ReturnType<typeof AppDataSource.getRepository<Organisation>>,
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  seed: SeedOrg,
): Promise<void> {
  let org = await orgRepo.findOne({ where: { name: seed.name } });
  if (!org) {
    org = await orgRepo.save(
      orgRepo.create({
        name: seed.name,
        status: OrgStatus.ACTIVE,
        subscription_status: SubscriptionStatus.ACTIVE,
        user_limit: 25,
      }),
    );
    console.log(`  [ORG  CREATED] ${org.name} (${org.org_id})`);
  } else {
    if (org.status !== OrgStatus.ACTIVE) {
      await orgRepo.update({ org_id: org.org_id }, { status: OrgStatus.ACTIVE });
    }
    console.log(`  [ORG  EXISTS ] ${org.name} (${org.org_id})`);
  }

  for (const u of seed.users) {
    const passwordHash = await bcrypt.hash(u.plain, 12);
    const existing = await userRepo.findOne({ where: { email: u.email } });

    if (!existing) {
      const saved = await userRepo.save(
        userRepo.create({
          org_id: org.org_id,
          email: u.email,
          password_hash: passwordHash,
          role: u.role,
          status: UserStatus.ACTIVE,
          mfa_enabled: false,
        }),
      );
      console.log(`  [USER CREATED] ${u.role.padEnd(6)} ${u.email} (${saved.user_id})`);
    } else {
      await userRepo.update(
        { user_id: existing.user_id },
        { password_hash: passwordHash, org_id: org.org_id, role: u.role, status: UserStatus.ACTIVE },
      );
      console.log(`  [USER UPDATED] ${u.role.padEnd(6)} ${u.email} — password reset`);
    }
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const orgRepo = AppDataSource.getRepository(Organisation);
  const userRepo = AppDataSource.getRepository(User);

  for (const seed of ORGS) {
    console.log(`\n── ${seed.name} ──`);
    await seedOrg(orgRepo, userRepo, seed);
  }

  console.log('\n\n════════════════════════════════════════');
  console.log(' DEMO ORGS READY');
  console.log('════════════════════════════════════════');

  for (const seed of ORGS) {
    const org = await orgRepo.findOne({ where: { name: seed.name } });
    console.log(`\n${seed.name} (${org!.org_id})`);
    for (const u of seed.users) {
      const label = u.role === UserRole.ADMIN ? 'Admin ' : 'Member';
      console.log(`  ${label}  ${u.email.padEnd(36)} / ${u.plain}`);
    }
  }

  console.log('');
  await AppDataSource.destroy();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
