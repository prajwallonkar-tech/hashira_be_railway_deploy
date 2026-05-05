import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToApiKeys1746374400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE api_keys
      ADD COLUMN IF NOT EXISTS user_id UUID NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE api_keys
      DROP COLUMN IF EXISTS user_id
    `);
  }
}
