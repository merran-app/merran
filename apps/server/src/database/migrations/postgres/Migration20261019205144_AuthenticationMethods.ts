import { Migration } from "@mikro-orm/migrations"

export class Migration20261019205144_AuthenticationMethods extends Migration {
  override name = "Migration20261019205144_AuthenticationMethods"

  override up(): void | Promise<void> {
    this.addSql(
      `create table "two_factors" ("id" uuid not null, "secret" text not null, "backup_codes" text not null, "user_id" uuid not null, "verified" boolean not null default true, "failed_verification_count" int not null default 0, "locked_until" timestamptz null, primary key ("id"));`
    )
    this.addSql(
      `create index "two_factors_secret_index" on "two_factors" ("secret");`
    )
    this.addSql(
      `alter table "two_factors" add constraint "two_factors_user_id_unique" unique ("user_id");`
    )

    this.addSql(
      `create table "passkeys" ("id" uuid not null, "name" varchar(255) null, "public_key" text not null, "user_id" uuid not null, "credential_id" text not null, "counter" int not null, "device_type" varchar(255) not null, "backed_up" boolean not null, "transports" text null, "created_at" timestamptz null, "aaguid" varchar(255) null, primary key ("id"));`
    )
    this.addSql(
      `create index "passkeys_user_id_index" on "passkeys" ("user_id");`
    )
    this.addSql(
      `alter table "passkeys" add constraint "passkeys_credential_id_unique" unique ("credential_id");`
    )

    this.addSql(
      `alter table "users" add "two_factor_enabled" boolean not null default false;`
    )

    this.addSql(`alter table "sessions" add "strong_auth_at" timestamptz null;`)

    this.addSql(
      `alter table "two_factors" add constraint "two_factors_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`
    )

    this.addSql(
      `alter table "passkeys" add constraint "passkeys_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "two_factors" cascade;`)
    this.addSql(`drop table if exists "passkeys" cascade;`)

    this.addSql(`alter table "sessions" drop column "strong_auth_at";`)

    this.addSql(`alter table "users" drop column "two_factor_enabled";`)
  }
}
