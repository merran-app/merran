import { Migration } from '@mikro-orm/migrations';

export class Migration20261020044326_calendar_subscriptions extends Migration {

  override name = 'Migration20261020044326_calendar_subscriptions';

  override up(): void | Promise<void> {
    this.addSql(`create table "plan_slot_times" ("id" uuid not null, "household_id" uuid not null, "date" varchar(10) not null, "meal" text not null, "start" varchar(5) not null, "minutes" int not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "plan_slot_times_household_id_index" on "plan_slot_times" ("household_id");`);
    this.addSql(`alter table "plan_slot_times" add constraint "plan_slot_times_household_id_date_meal_unique" unique ("household_id", "date", "meal");`);

    this.addSql(`create table "calendar_subscriptions" ("id" uuid not null, "household_id" uuid not null, "user_id" uuid not null, "token_hash" varchar(255) not null, "created_at" timestamptz not null, "revoked_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "calendar_subscriptions_household_id_index" on "calendar_subscriptions" ("household_id");`);
    this.addSql(`create index "calendar_subscriptions_user_id_index" on "calendar_subscriptions" ("user_id");`);
    this.addSql(`alter table "calendar_subscriptions" add constraint "calendar_subscriptions_token_hash_unique" unique ("token_hash");`);

    this.addSql(`alter table "plan_slot_times" add constraint "plan_slot_times_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "plan_slot_times" add constraint "plan_slot_times_meal_check" check ("meal" in ('breakfast', 'lunch', 'dinner', 'snack'));`);

    this.addSql(`alter table "calendar_subscriptions" add constraint "calendar_subscriptions_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "calendar_subscriptions" add constraint "calendar_subscriptions_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "plan_slot_times" cascade;`);
    this.addSql(`drop table if exists "calendar_subscriptions" cascade;`);
  }

}
