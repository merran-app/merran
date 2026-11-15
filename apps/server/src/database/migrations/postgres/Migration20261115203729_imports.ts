import { Migration } from '@mikro-orm/migrations';

export class Migration20261115203729_imports extends Migration {

  override name = 'Migration20261115203729_imports';

  override up(): void | Promise<void> {
    this.addSql(`create table "imports" ("id" uuid not null, "household_id" uuid not null, "kind" text not null, "source" text null, "listed" boolean not null default true, "status" text not null default 'queued', "total" int not null default 0, "added" int not null default 0, "already" int not null default 0, "failed" int not null default 0, "error" text null, "created_by_id" uuid null, "created_at" timestamptz not null, "finished_at" timestamptz null, "undone_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "imports_household_id_index" on "imports" ("household_id");`);
    this.addSql(`create index "imports_created_by_id_index" on "imports" ("created_by_id");`);
    this.addSql(`create index "imports_household_id_listed_created_at_index" on "imports" ("household_id", "listed", "created_at");`);

    this.addSql(`create table "import_items" ("id" uuid not null, "household_id" uuid not null, "import_id" uuid not null, "position" int not null, "label" text not null, "ref" text null, "state" text not null default 'waiting', "recipe_id" uuid null, "error" text null, "undone" boolean not null default false, primary key ("id"));`);
    this.addSql(`create index "import_items_household_id_index" on "import_items" ("household_id");`);
    this.addSql(`create index "import_items_import_id_index" on "import_items" ("import_id");`);
    this.addSql(`create index "import_items_recipe_id_index" on "import_items" ("recipe_id");`);
    this.addSql(`alter table "import_items" add constraint "import_items_import_id_position_unique" unique ("import_id", "position");`);

    this.addSql(`alter table "imports" add constraint "imports_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "imports" add constraint "imports_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "imports" add constraint "imports_kind_check" check ("kind" in ('link', 'video', 'links', 'collection', 'mealie', 'paprika', 'merran'));`);
    this.addSql(`alter table "imports" add constraint "imports_status_check" check ("status" in ('queued', 'running', 'done', 'failed', 'cancelled'));`);

    this.addSql(`alter table "import_items" add constraint "import_items_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "import_items" add constraint "import_items_import_id_foreign" foreign key ("import_id") references "imports" ("id") on delete cascade;`);
    this.addSql(`alter table "import_items" add constraint "import_items_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete set null;`);
    this.addSql(`alter table "import_items" add constraint "import_items_state_check" check ("state" in ('waiting', 'added', 'already', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "import_items" drop constraint "import_items_import_id_foreign";`);

    this.addSql(`drop table if exists "imports" cascade;`);
    this.addSql(`drop table if exists "import_items" cascade;`);
  }

}
