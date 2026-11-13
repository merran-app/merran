import { Migration } from '@mikro-orm/migrations';

export class Migration20261113170510_cooking_sessions extends Migration {

  override name = 'Migration20261113170510_cooking_sessions';

  override up(): void | Promise<void> {
    this.addSql(`create table "cooking_sessions" ("id" uuid not null, "household_id" uuid not null, "cook_id" uuid null, "recipe_id" uuid not null, "paired_id" uuid null, "entry_id" uuid null, "servings" double precision null, "started_at" timestamptz not null, "heard_at" timestamptz not null, "left_at" timestamptz null, "closing_at" timestamptz null, "ended_at" timestamptz null, "outcome" text null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cooking_sessions_household_id_index" on "cooking_sessions" ("household_id");`);
    this.addSql(`create index "cooking_sessions_recipe_id_index" on "cooking_sessions" ("recipe_id");`);
    this.addSql(`create index "cooking_sessions_paired_id_index" on "cooking_sessions" ("paired_id");`);
    this.addSql(`create index "cooking_sessions_entry_id_index" on "cooking_sessions" ("entry_id");`);
    this.addSql(`create index "cooking_sessions_household_id_ended_at_index" on "cooking_sessions" ("household_id", "ended_at");`);

    this.addSql(`create table "cooking_timers" ("id" uuid not null, "household_id" uuid not null, "session_id" uuid not null, "timer_id" varchar(255) not null, "label" varchar(255) not null, "seconds" int not null, "ends_at" timestamptz not null, "state" text not null default 'running', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cooking_timers_household_id_index" on "cooking_timers" ("household_id");`);
    this.addSql(`create index "cooking_timers_session_id_index" on "cooking_timers" ("session_id");`);
    this.addSql(`alter table "cooking_timers" add constraint "cooking_timers_session_id_timer_id_unique" unique ("session_id", "timer_id");`);

    this.addSql(`alter table "cooking_sessions" add constraint "cooking_sessions_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "cooking_sessions" add constraint "cooking_sessions_cook_id_foreign" foreign key ("cook_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "cooking_sessions" add constraint "cooking_sessions_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "cooking_sessions" add constraint "cooking_sessions_paired_id_foreign" foreign key ("paired_id") references "recipes" ("id") on delete set null;`);
    this.addSql(`alter table "cooking_sessions" add constraint "cooking_sessions_entry_id_foreign" foreign key ("entry_id") references "plan_entries" ("id") on delete set null;`);
    this.addSql(`alter table "cooking_sessions" add constraint "cooking_sessions_outcome_check" check ("outcome" in ('made', 'stopped', 'timed_out'));`);

    this.addSql(`alter table "cooking_timers" add constraint "cooking_timers_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "cooking_timers" add constraint "cooking_timers_session_id_foreign" foreign key ("session_id") references "cooking_sessions" ("id") on delete cascade;`);
    this.addSql(`alter table "cooking_timers" add constraint "cooking_timers_state_check" check ("state" in ('running', 'finished', 'cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cooking_timers" drop constraint "cooking_timers_session_id_foreign";`);

    this.addSql(`drop table if exists "cooking_sessions" cascade;`);
    this.addSql(`drop table if exists "cooking_timers" cascade;`);
  }

}
