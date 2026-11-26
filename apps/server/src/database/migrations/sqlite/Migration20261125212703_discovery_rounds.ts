import { Migration } from '@mikro-orm/migrations';

export class Migration20261125212703_discovery_rounds extends Migration {

  override name = 'Migration20261125212703_discovery_rounds';

  override up(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`discoveries__temp_alter\` (\`id\` text not null primary key, \`household_id\` text not null, \`user_id\` text null, \`theme\` text not null, \`collection\` text null, \`status\` text check (\`status\` in ('searching', 'done', 'stopped', 'failed')) not null, \`error\` text null, \`progress\` json null, \`job_id\` text null, \`recipes\` json not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`discoveries_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`discoveries_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`discoveries__temp_alter\` select \`id\`, \`household_id\`, \`user_id\`, \`theme\`, \`collection\`, \`status\`, \`error\`, null as \`progress\`, null as \`job_id\`, \`recipes\`, \`created_at\`, \`updated_at\` from \`discoveries\`;`);
    this.addSql(`drop table \`discoveries\`;`);
    this.addSql(`alter table \`discoveries__temp_alter\` rename to \`discoveries\`;`);
    this.addSql(`create index \`discoveries_household_id_index\` on \`discoveries\` (\`household_id\`);`);
    this.addSql(`create index \`discoveries_user_id_index\` on \`discoveries\` (\`user_id\`);`);
    this.addSql(`create index \`discoveries_household_id_created_at_index\` on \`discoveries\` (\`household_id\`, \`created_at\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`pragma foreign_keys = off;`);
    this.addSql(`create table \`discoveries__temp_alter\` (\`collection\` text null, \`created_at\` datetime not null, \`error\` text null, \`household_id\` text not null, \`id\` text not null primary key, \`recipes\` json not null, \`status\` text check (\`status\` in ('searching', 'done', 'failed')) not null, \`theme\` text not null, \`updated_at\` datetime not null, \`user_id\` text null, constraint \`discoveries_household_id_foreign\` foreign key (\`household_id\`) references \`households\` (\`id\`) on delete cascade, constraint \`discoveries_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete set null);`);
    this.addSql(`insert into \`discoveries__temp_alter\` select \`collection\`, \`created_at\`, \`error\`, \`household_id\`, \`id\`, \`recipes\`, \`status\`, \`theme\`, \`updated_at\`, \`user_id\` from \`discoveries\`;`);
    this.addSql(`drop table \`discoveries\`;`);
    this.addSql(`alter table \`discoveries__temp_alter\` rename to \`discoveries\`;`);
    this.addSql(`create index \`discoveries_household_id_created_at_index\` on \`discoveries\` (\`household_id\`, \`created_at\`);`);
    this.addSql(`create index \`discoveries_household_id_index\` on \`discoveries\` (\`household_id\`);`);
    this.addSql(`create index \`discoveries_user_id_index\` on \`discoveries\` (\`user_id\`);`);
    this.addSql(`pragma foreign_keys = on;`);
  }

}
