import { Migration } from '@mikro-orm/migrations';

export class Migration20261108235607_recipe_shares extends Migration {

  override name = 'Migration20261108235607_recipe_shares';

  override up(): void | Promise<void> {
    this.addSql(`create table \`recipe_shares\` (\`id\` text not null primary key, \`household_id\` text not null, \`recipe_id\` text not null, \`token\` text not null, \`created_by_id\` text null, \`created_at\` datetime not null, \`opened_at\` datetime null, constraint \`recipe_shares_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_shares_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`recipe_shares_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`recipe_shares_household_id_index\` on \`recipe_shares\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_shares_recipe_id_index\` on \`recipe_shares\` (\`recipe_id\`);`);
    this.addSql(`create unique index \`recipe_shares_recipe_id_unique\` on \`recipe_shares\` (\`recipe_id\`);`);
    this.addSql(`create unique index \`recipe_shares_token_unique\` on \`recipe_shares\` (\`token\`);`);
    this.addSql(`create index \`recipe_shares_created_by_id_index\` on \`recipe_shares\` (\`created_by_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`recipe_shares\`;`);
  }

}
