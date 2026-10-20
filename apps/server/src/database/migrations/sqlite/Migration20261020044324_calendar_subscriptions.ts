import { Migration } from '@mikro-orm/migrations';

export class Migration20261020044324_calendar_subscriptions extends Migration {

  override name = 'Migration20261020044324_calendar_subscriptions';

  override up(): void | Promise<void> {
    this.addSql(`create table \`plan_slot_times\` (\`id\` text not null primary key, \`household_id\` text not null, \`date\` text not null, \`meal\` text check (\`meal\` in ('breakfast', 'lunch', 'dinner', 'snack')) not null, \`start\` text not null, \`minutes\` integer not null, \`updated_at\` datetime not null, constraint \`plan_slot_times_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`plan_slot_times_household_id_index\` on \`plan_slot_times\` (\`household_id\`);`);
    this.addSql(`create unique index \`plan_slot_times_household_id_date_meal_unique\` on \`plan_slot_times\` (\`household_id\`, \`date\`, \`meal\`);`);

    this.addSql(`create table \`calendar_subscriptions\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text not null, \`token_hash\` text not null, \`created_at\` datetime not null, \`revoked_at\` datetime null, constraint \`calendar_subscriptions_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`calendar_subscriptions_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`calendar_subscriptions_household_id_index\` on \`calendar_subscriptions\` (\`household_id\`);`);
    this.addSql(`create index \`calendar_subscriptions_user_id_index\` on \`calendar_subscriptions\` (\`user_id\`);`);
    this.addSql(`create unique index \`calendar_subscriptions_token_hash_unique\` on \`calendar_subscriptions\` (\`token_hash\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`plan_slot_times\`;`);
    this.addSql(`drop table if exists \`calendar_subscriptions\`;`);
  }

}
