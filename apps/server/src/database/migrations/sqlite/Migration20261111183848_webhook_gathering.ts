import { Migration } from '@mikro-orm/migrations';

export class Migration20261111183848_webhook_gathering extends Migration {

  override name = 'Migration20261111183848_webhook_gathering';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`webhook_events\` add column \`gathered\` integer not null default false;`);
    this.addSql(`alter table \`webhook_events\` add column \`merged\` integer not null default false;`);
    this.addSql(`create index \`webhook_events_household_id_gathered_merged_index\` on \`webhook_events\` (\`household_id\`, \`gathered\`, \`merged\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`webhook_events_household_id_gathered_merged_index\`;`);
    this.addSql(`alter table \`webhook_events\` drop column \`gathered\`;`);
    this.addSql(`alter table \`webhook_events\` drop column \`merged\`;`);
  }

}
