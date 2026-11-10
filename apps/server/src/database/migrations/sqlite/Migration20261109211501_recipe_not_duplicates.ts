import { Migration } from '@mikro-orm/migrations';

export class Migration20261109211501_recipe_not_duplicates extends Migration {

  override name = 'Migration20261109211501_recipe_not_duplicates';

  override up(): void | Promise<void> {
    this.addSql(`create table \`recipe_not_duplicates\` (\`id\` text not null primary key, \`household_id\` text not null, \`first_id\` text not null, \`second_id\` text not null, \`created_by_id\` text null, \`created_at\` datetime not null, constraint \`recipe_not_duplicates_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`recipe_not_duplicates_first_id_foreign\` foreign key (\`first_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`recipe_not_duplicates_second_id_foreign\` foreign key (\`second_id\`) references \`recipes\` (\`id\`) on delete cascade, constraint \`recipe_not_duplicates_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`recipe_not_duplicates_household_id_index\` on \`recipe_not_duplicates\` (\`household_id\`);`);
    this.addSql(`create index \`recipe_not_duplicates_first_id_index\` on \`recipe_not_duplicates\` (\`first_id\`);`);
    this.addSql(`create index \`recipe_not_duplicates_second_id_index\` on \`recipe_not_duplicates\` (\`second_id\`);`);
    this.addSql(`create index \`recipe_not_duplicates_created_by_id_index\` on \`recipe_not_duplicates\` (\`created_by_id\`);`);
    this.addSql(`create unique index \`recipe_not_duplicates_first_id_second_id_unique\` on \`recipe_not_duplicates\` (\`first_id\`, \`second_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`recipe_not_duplicates\`;`);
  }

}
