import { Migration } from '@mikro-orm/migrations';

export class Migration20261113170508_cooking_sessions extends Migration {

  override name = 'Migration20261113170508_cooking_sessions';

  override up(): void | Promise<void> {
    this.addSql(`create table \`cooking_sessions\` (\`id\` text not null primary key, \`household_id\` text not null, \`cook_id\` text null, \`recipe_id\` text not null, \`paired_id\` text null, \`entry_id\` text null, \`servings\` double null, \`started_at\` datetime not null, \`heard_at\` datetime not null, \`left_at\` datetime null, \`closing_at\` datetime null, \`ended_at\` datetime null, \`outcome\` text check (\`outcome\` in ('made', 'stopped', 'timed_out')) null, \`updated_at\` datetime not null, constraint \`cooking_sessions_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`cooking_sessions_cook_id_foreign\` foreign key (\`cook_id\`) references \`users\` (\`id\`) on delete set null, constraint \`cooking_sessions_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`cooking_sessions_paired_id_foreign\` foreign key (\`paired_id\`) references \`recipes\` (\`id\`) on delete set null, constraint \`cooking_sessions_entry_id_foreign\` foreign key (\`entry_id\`) references \`plan_entries\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`cooking_sessions_household_id_index\` on \`cooking_sessions\` (\`household_id\`);`);
    this.addSql(`create index \`cooking_sessions_cook_id_index\` on \`cooking_sessions\` (\`cook_id\`);`);
    this.addSql(`create index \`cooking_sessions_recipe_id_index\` on \`cooking_sessions\` (\`recipe_id\`);`);
    this.addSql(`create index \`cooking_sessions_paired_id_index\` on \`cooking_sessions\` (\`paired_id\`);`);
    this.addSql(`create index \`cooking_sessions_entry_id_index\` on \`cooking_sessions\` (\`entry_id\`);`);
    this.addSql(`create index \`cooking_sessions_household_id_ended_at_index\` on \`cooking_sessions\` (\`household_id\`, \`ended_at\`);`);

    this.addSql(`create table \`cooking_timers\` (\`id\` text not null primary key, \`household_id\` text not null, \`session_id\` text not null, \`timer_id\` text not null, \`label\` text not null, \`seconds\` integer not null, \`ends_at\` datetime not null, \`state\` text check (\`state\` in ('running', 'finished', 'cancelled')) not null default 'running', \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`cooking_timers_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`cooking_timers_session_id_foreign\` foreign key (\`session_id\`) references \`cooking_sessions\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`cooking_timers_household_id_index\` on \`cooking_timers\` (\`household_id\`);`);
    this.addSql(`create index \`cooking_timers_session_id_index\` on \`cooking_timers\` (\`session_id\`);`);
    this.addSql(`create unique index \`cooking_timers_session_id_timer_id_unique\` on \`cooking_timers\` (\`session_id\`, \`timer_id\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`cooking_sessions\`;`);
    this.addSql(`drop table if exists \`cooking_timers\`;`);
  }

}
