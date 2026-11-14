import { Migration } from '@mikro-orm/migrations';

export class Migration20261113232918_webhook_event_keys extends Migration {

  override name = 'Migration20261113232918_webhook_event_keys';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`webhook_events\` add column \`key\` text null;`);
    this.addSql(`create unique index \`webhook_events_household_id_key_unique\` on \`webhook_events\` (\`household_id\`, \`key\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`webhook_events_household_id_key_unique\`;`);
    this.addSql(`alter table \`webhook_events\` drop column \`key\`;`);
  }

}
