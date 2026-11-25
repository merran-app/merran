import { Migration } from '@mikro-orm/migrations';

export class Migration20261124221158_receipt_status extends Migration {

  override name = 'Migration20261124221158_receipt_status';

  override up(): void | Promise<void> {
    this.addSql(`alter table "receipts" add "status" text not null default 'ready', add "error" text null;`);
    this.addSql(`alter table "receipts" add constraint "receipts_status_check" check ("status" in ('reading', 'ready', 'recipe', 'none', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "receipts" drop constraint "receipts_status_check";`);
    this.addSql(`alter table "receipts" drop column "status", drop column "error";`);
  }

}
