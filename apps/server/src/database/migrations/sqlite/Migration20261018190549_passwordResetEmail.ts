import { Migration } from '@mikro-orm/migrations';

export class Migration20261018190549_passwordResetEmail extends Migration {

  override name = 'Migration20261018190549_passwordResetEmail';

  override up(): void | Promise<void> {
    this.addSql(`create table \`password_resets\` (\`id\` text not null primary key, \`token_hash\` text not null, \`user_id\` text null, \`credential_version\` text null, \`delivery_id\` text null, \`job_id\` text null, \`expires_at\` datetime not null, \`sent_at\` datetime null, \`used_at\` datetime null, \`created_at\` datetime not null, constraint \`password_resets_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade, constraint \`password_resets_delivery_id_foreign\` foreign key (\`delivery_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`password_resets_job_id_foreign\` foreign key (\`job_id\`) references \`jobs\` (\`id\`) on delete set null);`);
    this.addSql(`create unique index \`password_resets_token_hash_unique\` on \`password_resets\` (\`token_hash\`);`);
    this.addSql(`create index \`password_resets_user_id_index\` on \`password_resets\` (\`user_id\`);`);
    this.addSql(`create index \`password_resets_delivery_id_index\` on \`password_resets\` (\`delivery_id\`);`);
    this.addSql(`create index \`password_resets_job_id_index\` on \`password_resets\` (\`job_id\`);`);
    this.addSql(`create index \`password_resets_expires_at_index\` on \`password_resets\` (\`expires_at\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`password_resets\`;`);
  }

}
