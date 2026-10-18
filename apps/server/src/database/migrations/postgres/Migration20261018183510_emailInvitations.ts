import { Migration } from '@mikro-orm/migrations';

export class Migration20261018183510_emailInvitations extends Migration {

  override name = 'Migration20261018183510_emailInvitations';

  override up(): void | Promise<void> {
    this.addSql(`alter table "invite_links" add "email" varchar(255) null, add "delivery_token_id" uuid null, add "delivery_job_id" uuid null, add "queued_at" timestamptz null, add "sent_at" timestamptz null;`);
    this.addSql(`alter table "invite_links" add constraint "invite_links_delivery_token_id_foreign" foreign key ("delivery_token_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "invite_links" add constraint "invite_links_delivery_job_id_foreign" foreign key ("delivery_job_id") references "jobs" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "invite_links" drop constraint "invite_links_delivery_token_id_foreign";`);
    this.addSql(`alter table "invite_links" drop constraint "invite_links_delivery_job_id_foreign";`);

    this.addSql(`alter table "invite_links" drop column "email", drop column "delivery_token_id", drop column "delivery_job_id", drop column "queued_at", drop column "sent_at";`);
  }

}
