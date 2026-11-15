import { Migration } from '@mikro-orm/migrations';

export class Migration20261115204121_imports extends Migration {

  override name = 'Migration20261115204121_imports';

  override up(): void | Promise<void> {
    this.addSql(`create table \`imports\` (\`id\` text not null primary key, \`household_id\` text not null, \`kind\` text check (\`kind\` in ('link', 'video', 'links', 'collection', 'mealie', 'paprika', 'merran')) not null, \`source\` text null, \`listed\` integer not null default true, \`status\` text check (\`status\` in ('queued', 'running', 'done', 'failed', 'cancelled')) not null default 'queued', \`total\` integer not null default 0, \`added\` integer not null default 0, \`already\` integer not null default 0, \`failed\` integer not null default 0, \`tag\` text null, \`retry\` json null, \`error\` text null, \`created_by_id\` text null, \`created_at\` datetime not null, \`finished_at\` datetime null, \`undone_at\` datetime null, constraint \`imports_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`imports_created_by_id_foreign\` foreign key (\`created_by_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`imports_household_id_index\` on \`imports\` (\`household_id\`);`);
    this.addSql(`create index \`imports_created_by_id_index\` on \`imports\` (\`created_by_id\`);`);
    this.addSql(`create index \`imports_household_id_listed_created_at_index\` on \`imports\` (\`household_id\`, \`listed\`, \`created_at\`);`);

    this.addSql(`create table \`import_items\` (\`id\` text not null primary key, \`household_id\` text not null, \`import_id\` text not null, \`position\` integer not null, \`label\` text not null, \`ref\` text null, \`state\` text check (\`state\` in ('waiting', 'added', 'already', 'failed')) not null default 'waiting', \`recipe_id\` text null, \`error\` text null, \`undone\` integer not null default false, constraint \`import_items_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`import_items_import_id_foreign\` foreign key (\`import_id\`) references \`imports\` (\`id\`) on delete cascade, constraint \`import_items_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`recipes\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`import_items_household_id_index\` on \`import_items\` (\`household_id\`);`);
    this.addSql(`create index \`import_items_import_id_index\` on \`import_items\` (\`import_id\`);`);
    this.addSql(`create index \`import_items_recipe_id_index\` on \`import_items\` (\`recipe_id\`);`);
    this.addSql(`create unique index \`import_items_import_id_position_unique\` on \`import_items\` (\`import_id\`, \`position\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`imports\`;`);
    this.addSql(`drop table if exists \`import_items\`;`);
  }

}
