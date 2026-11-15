import { Migration } from '@mikro-orm/migrations';

export class Migration20261111004831_webhooks extends Migration {

  override name = 'Migration20261111004831_webhooks';

  override up(): void | Promise<void> {
    this.addSql(`create table "webhooks" ("id" uuid not null, "household_id" uuid not null, "name" varchar(255) not null, "host" varchar(255) not null, "address_id" uuid null, "secret_id" uuid null, "previous_secret_id" uuid null, "previous_secret_until" timestamptz null, "headers_id" uuid null, "header_names" jsonb not null, "events" jsonb not null, "everything" boolean not null default false, "state" text not null default 'active', "paused_reason" text null, "paused_at" timestamptz null, "failing_since" timestamptz null, "last_delivered_at" timestamptz null, "last_error" text null, "created_by_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "webhooks_household_id_index" on "webhooks" ("household_id");`);

    this.addSql(`create table "webhook_events" ("id" uuid not null, "household_id" uuid not null, "type" varchar(255) not null, "payload" jsonb not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "webhook_events_household_id_index" on "webhook_events" ("household_id");`);
    this.addSql(`create index "webhook_events_household_id_created_at_index" on "webhook_events" ("household_id", "created_at");`);

    this.addSql(`create table "webhook_deliveries" ("id" uuid not null, "household_id" uuid not null, "webhook_id" uuid not null, "event_id" uuid not null, "state" text not null default 'waiting', "tries" smallint not null default 0, "status_code" smallint null, "answer" text null, "duration_ms" int null, "error" text null, "last_tried_at" timestamptz null, "delivered_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "webhook_deliveries_household_id_index" on "webhook_deliveries" ("household_id");`);
    this.addSql(`create index "webhook_deliveries_webhook_id_index" on "webhook_deliveries" ("webhook_id");`);
    this.addSql(`create index "webhook_deliveries_event_id_index" on "webhook_deliveries" ("event_id");`);
    this.addSql(`create index "webhook_deliveries_webhook_id_created_at_index" on "webhook_deliveries" ("webhook_id", "created_at");`);

    this.addSql(`alter table "webhooks" add constraint "webhooks_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_address_id_foreign" foreign key ("address_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_secret_id_foreign" foreign key ("secret_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_previous_secret_id_foreign" foreign key ("previous_secret_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_headers_id_foreign" foreign key ("headers_id") references "secrets" ("id") on delete set null;`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_state_check" check ("state" in ('active', 'paused'));`);
    this.addSql(`alter table "webhooks" add constraint "webhooks_paused_reason_check" check ("paused_reason" in ('gave_up', 'gone', 'by_hand'));`);

    this.addSql(`alter table "webhook_events" add constraint "webhook_events_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);

    this.addSql(`alter table "webhook_deliveries" add constraint "webhook_deliveries_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "webhook_deliveries" add constraint "webhook_deliveries_webhook_id_foreign" foreign key ("webhook_id") references "webhooks" ("id") on delete cascade;`);
    this.addSql(`alter table "webhook_deliveries" add constraint "webhook_deliveries_event_id_foreign" foreign key ("event_id") references "webhook_events" ("id") on delete cascade;`);
    this.addSql(`alter table "webhook_deliveries" add constraint "webhook_deliveries_state_check" check ("state" in ('waiting', 'delivered', 'failed', 'stopped'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "webhook_deliveries" drop constraint "webhook_deliveries_webhook_id_foreign";`);
    this.addSql(`alter table "webhook_deliveries" drop constraint "webhook_deliveries_event_id_foreign";`);

    this.addSql(`drop table if exists "webhooks" cascade;`);
    this.addSql(`drop table if exists "webhook_events" cascade;`);
    this.addSql(`drop table if exists "webhook_deliveries" cascade;`);
  }

}
