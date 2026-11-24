import { Migration } from '@mikro-orm/migrations';

export class Migration20261115043924_speed_indexes extends Migration {

  override name = 'Migration20261115043924_speed_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index \`site_recipes_classic_opened_at_index\` on \`site_recipes\` (\`classic\`, \`opened_at\`);`);

    this.addSql(`drop index \`recipes_deleted_at_index\`;`);
    this.addSql(`create index \`recipes_household_id_created_at_index\` on \`recipes\` (\`household_id\`, \`created_at\`) where \`deleted_at\` is null;`);
    this.addSql(`create index \`recipes_deleted_at_index\` on \`recipes\` (\`deleted_at\`) where \`deleted_at\` is not null;`);

    this.addSql(`drop index \`jobs_status_index\`;`);
    this.addSql(`create index \`jobs_status_run_at_created_at_index\` on \`jobs\` (\`status\`, \`run_at\`, \`created_at\`);`);
    this.addSql(`create index \`jobs_for_household_id_kind_status_index\` on \`jobs\` (\`for_household_id\`, \`kind\`, \`status\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`jobs_status_run_at_created_at_index\`;`);
    this.addSql(`drop index \`jobs_for_household_id_kind_status_index\`;`);
    this.addSql(`create index \`jobs_status_index\` on \`jobs\` (\`status\`);`);

    this.addSql(`drop index \`recipes_household_id_created_at_index\`;`);
    this.addSql(`drop index \`recipes_deleted_at_index\`;`);
    this.addSql(`create index \`recipes_deleted_at_index\` on \`recipes\` (\`deleted_at\`);`);

    this.addSql(`drop index \`site_recipes_classic_opened_at_index\`;`);
  }

}
