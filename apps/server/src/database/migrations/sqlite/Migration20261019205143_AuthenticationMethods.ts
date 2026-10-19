import { Migration } from "@mikro-orm/migrations"

export class Migration20261019205143_AuthenticationMethods extends Migration {
  override name = "Migration20261019205143_AuthenticationMethods"

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`two_factors\` (\`id\` text not null primary key, \`secret\` text not null, \`backup_codes\` text not null, \`user_id\` text not null, \`verified\` integer not null default true, \`failed_verification_count\` integer not null default 0, \`locked_until\` datetime null, constraint \`two_factors_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`
    )
    this.addSql(
      `create index \`two_factors_secret_index\` on \`two_factors\` (\`secret\`);`
    )
    this.addSql(
      `create index \`two_factors_user_id_index\` on \`two_factors\` (\`user_id\`);`
    )
    this.addSql(
      `create unique index \`two_factors_user_id_unique\` on \`two_factors\` (\`user_id\`);`
    )

    this.addSql(
      `create table \`passkeys\` (\`id\` text not null primary key, \`name\` text null, \`public_key\` text not null, \`user_id\` text not null, \`credential_id\` text not null, \`counter\` integer not null, \`device_type\` text not null, \`backed_up\` integer not null, \`transports\` text null, \`created_at\` datetime null, \`aaguid\` text null, constraint \`passkeys_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`
    )
    this.addSql(
      `create index \`passkeys_user_id_index\` on \`passkeys\` (\`user_id\`);`
    )
    this.addSql(
      `create unique index \`passkeys_credential_id_unique\` on \`passkeys\` (\`credential_id\`);`
    )

    this.addSql(
      `alter table \`users\` add column \`two_factor_enabled\` integer not null default false;`
    )

    this.addSql(
      `alter table \`sessions\` add column \`strong_auth_at\` datetime null;`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`two_factors\`;`)
    this.addSql(`drop table if exists \`passkeys\`;`)

    this.addSql(`alter table \`sessions\` drop column \`strong_auth_at\`;`)

    this.addSql(`alter table \`users\` drop column \`two_factor_enabled\`;`)
  }
}
