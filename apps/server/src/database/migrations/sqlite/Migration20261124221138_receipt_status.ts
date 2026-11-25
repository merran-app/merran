import { Migration } from '@mikro-orm/migrations';

export class Migration20261124221138_receipt_status extends Migration {

  override name = 'Migration20261124221138_receipt_status';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`receipts\` add column \`status\` text check (\`status\` in ('reading', 'ready', 'recipe', 'none', 'failed')) not null default 'ready';`);
    this.addSql(`alter table \`receipts\` add column \`error\` text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`receipts\` drop column \`error\`;`);
    this.addSql(`alter table \`receipts\` drop column \`status\`;`);
  }

}
