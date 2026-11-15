import { Migration } from '@mikro-orm/migrations';

export class Migration20261111004829_webhooks extends Migration {

  override name = 'Migration20261111004829_webhooks';

  override up(): void | Promise<void> {
    this.addSql(`create table \`webhooks\` (\`id\` text not null primary key, \`household_id\` text not null, \`name\` text not null, \`host\` text not null, \`address_id\` text null, \`secret_id\` text null, \`previous_secret_id\` text null, \`previous_secret_until\` datetime null, \`headers_id\` text null, \`header_names\` json not null, \`events\` json not null, \`everything\` integer not null default false, \`state\` text check (\`state\` in ('active', 'paused')) not null default 'active', \`paused_reason\` text check (\`paused_reason\` in ('gave_up', 'gone', 'by_hand')) null, \`paused_at\` datetime null, \`failing_since\` datetime null, \`last_delivered_at\` datetime null, \`last_error\` text null, \`created_by_id\` text null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`webhooks_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`webhooks_address_id_foreign\` foreign key (\`address_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`webhooks_secret_id_foreign\` foreign key (\`secret_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`webhooks_previous_secret_id_foreign\` foreign key (\`previous_secret_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`webhooks_headers_id_foreign\` foreign key (\`headers_id\`) references \`secrets\` (\`id\`) on delete set null, constraint \`webhooks_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`webhooks_household_id_index\` on \`webhooks\` (\`household_id\`);`);
    this.addSql(`create index \`webhooks_address_id_index\` on \`webhooks\` (\`address_id\`);`);
    this.addSql(`create index \`webhooks_secret_id_index\` on \`webhooks\` (\`secret_id\`);`);
    this.addSql(`create index \`webhooks_previous_secret_id_index\` on \`webhooks\` (\`previous_secret_id\`);`);
    this.addSql(`create index \`webhooks_headers_id_index\` on \`webhooks\` (\`headers_id\`);`);
    this.addSql(`create index \`webhooks_created_by_id_index\` on \`webhooks\` (\`created_by_id\`);`);

    this.addSql(`create table \`webhook_events\` (\`id\` text not null primary key, \`household_id\` text not null, \`type\` text not null, \`payload\` json not null, \`created_at\` datetime not null, constraint \`webhook_events_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`webhook_events_household_id_index\` on \`webhook_events\` (\`household_id\`);`);
    this.addSql(`create index \`webhook_events_household_id_created_at_index\` on \`webhook_events\` (\`household_id\`, \`created_at\`);`);

    this.addSql(`create table \`webhook_deliveries\` (\`id\` text not null primary key, \`household_id\` text not null, \`webhook_id\` text not null, \`event_id\` text not null, \`state\` text check (\`state\` in ('waiting', 'delivered', 'failed', 'stopped')) not null default 'waiting', \`tries\` integer not null default 0, \`status_code\` integer null, \`answer\` text null, \`duration_ms\` integer null, \`error\` text null, \`last_tried_at\` datetime null, \`delivered_at\` datetime null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`webhook_deliveries_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`webhook_deliveries_webhook_id_foreign\` foreign key (\`webhook_id\`) references \`webhooks\` (\`id\`) on delete cascade, constraint \`webhook_deliveries_event_id_foreign\` foreign key (\`event_id\`) references \`webhook_events\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`webhook_deliveries_household_id_index\` on \`webhook_deliveries\` (\`household_id\`);`);
    this.addSql(`create index \`webhook_deliveries_webhook_id_index\` on \`webhook_deliveries\` (\`webhook_id\`);`);
    this.addSql(`create index \`webhook_deliveries_event_id_index\` on \`webhook_deliveries\` (\`event_id\`);`);
    this.addSql(`create index \`webhook_deliveries_webhook_id_created_at_index\` on \`webhook_deliveries\` (\`webhook_id\`, \`created_at\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`webhooks\`;`);
    this.addSql(`drop table if exists \`webhook_events\`;`);
    this.addSql(`drop table if exists \`webhook_deliveries\`;`);
  }

}
