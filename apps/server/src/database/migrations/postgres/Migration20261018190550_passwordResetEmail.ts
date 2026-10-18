import { Migration } from '@mikro-orm/migrations';

export class Migration20261018190550_passwordResetEmail extends Migration {

  override name = 'Migration20261018190550_passwordResetEmail';

  override up(): void | Promise<void> {
    this.addSql(`create table "password_resets" ("id" uuid not null, "token_hash" varchar(64) not null, "user_id" uuid null, "credential_version" varchar(64) null, "delivery_id" uuid null, "job_id" uuid null, "expires_at" timestamptz not null, "sent_at" timestamptz null, "used_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "password_resets" add constraint "password_resets_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "password_resets_user_id_index" on "password_resets" ("user_id");`);
    this.addSql(`create index "password_resets_expires_at_index" on "password_resets" ("expires_at");`);

    this.addSql(`alter table "password_resets" add constraint "password_resets_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
    this.addSql(`alter table "password_resets" add constraint "password_resets_delivery_id_foreign" foreign key ("delivery_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "password_resets" add constraint "password_resets_job_id_foreign" foreign key ("job_id") references "jobs" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "password_resets" cascade;`);
  }

}
