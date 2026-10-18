import { Migration } from '@mikro-orm/migrations';

export class Migration20261018183508_emailInvitations extends Migration {

  override name = 'Migration20261018183508_emailInvitations';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`invite_links\` add column \`email\` text null;`);
    this.addSql(`alter table \`invite_links\` add column \`delivery_token_id\` text null constraint \`invite_links_delivery_token_id_foreign\` references \`secrets\` (\`id\`) on delete set null;`);
    this.addSql(`alter table \`invite_links\` add column \`delivery_job_id\` text null constraint \`invite_links_delivery_job_id_foreign\` references \`jobs\` (\`id\`) on delete set null;`);
    this.addSql(`alter table \`invite_links\` add column \`queued_at\` datetime null;`);
    this.addSql(`alter table \`invite_links\` add column \`sent_at\` datetime null;`);
    this.addSql(`create index \`invite_links_delivery_token_id_index\` on \`invite_links\` (\`delivery_token_id\`);`);
    this.addSql(`create index \`invite_links_delivery_job_id_index\` on \`invite_links\` (\`delivery_job_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`invite_links_delivery_token_id_index\`;`);
    this.addSql(`drop index \`invite_links_delivery_job_id_index\`;`);
    this.addSql(`alter table \`invite_links\` drop column \`email\`;`);
    this.addSql(`alter table \`invite_links\` drop column \`delivery_token_id\`;`);
    this.addSql(`alter table \`invite_links\` drop column \`delivery_job_id\`;`);
    this.addSql(`alter table \`invite_links\` drop column \`queued_at\`;`);
    this.addSql(`alter table \`invite_links\` drop column \`sent_at\`;`);
  }

}
