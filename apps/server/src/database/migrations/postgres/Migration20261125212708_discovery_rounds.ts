import { Migration } from '@mikro-orm/migrations';

export class Migration20261125212708_discovery_rounds extends Migration {

  override name = 'Migration20261125212708_discovery_rounds';

  override up(): void | Promise<void> {
    this.addSql(`alter table "discoveries" drop constraint "discoveries_status_check";`);
    this.addSql(`alter table "discoveries" add "progress" jsonb null, add "job_id" varchar(255) null;`);
    this.addSql(`alter table "discoveries" add constraint "discoveries_status_check" check ("status" in ('searching', 'done', 'stopped', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "discoveries" drop constraint "discoveries_status_check";`);
    this.addSql(`alter table "discoveries" drop column "progress", drop column "job_id";`);
    this.addSql(`alter table "discoveries" add constraint "discoveries_status_check" check ("status" in ('searching', 'done', 'failed'));`);
  }

}
