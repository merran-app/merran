import { Migration } from '@mikro-orm/migrations';

export class Migration20261111183851_webhook_gathering extends Migration {

  override name = 'Migration20261111183851_webhook_gathering';

  override up(): void | Promise<void> {
    this.addSql(`alter table "webhook_events" add "gathered" boolean not null default false, add "merged" boolean not null default false;`);
    this.addSql(`create index "webhook_events_household_id_gathered_merged_index" on "webhook_events" ("household_id", "gathered", "merged");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "webhook_events_household_id_gathered_merged_index";`);
    this.addSql(`alter table "webhook_events" drop column "gathered", drop column "merged";`);
  }

}
