import { Migration } from '@mikro-orm/migrations';

export class Migration20261124212538_job_handed_over extends Migration {

  override name = 'Migration20261124212538_job_handed_over';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`jobs\` add column \`handed_over_at\` datetime null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`jobs\` drop column \`handed_over_at\`;`);
  }

}
