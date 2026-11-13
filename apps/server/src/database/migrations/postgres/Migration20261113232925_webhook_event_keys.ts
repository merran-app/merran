import { Migration } from '@mikro-orm/migrations';

export class Migration20261113232925_webhook_event_keys extends Migration {

  override name = 'Migration20261113232925_webhook_event_keys';

  override up(): void | Promise<void> {
    this.addSql(`alter table "webhook_events" add "key" varchar(255) null;`);
    this.addSql(`alter table "webhook_events" add constraint "webhook_events_household_id_key_unique" unique ("household_id", "key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "webhook_events" drop constraint "webhook_events_household_id_key_unique";`);
    this.addSql(`alter table "webhook_events" drop column "key";`);
  }

}
