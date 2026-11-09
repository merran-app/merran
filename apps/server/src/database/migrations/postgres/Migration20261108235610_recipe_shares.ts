import { Migration } from '@mikro-orm/migrations';

export class Migration20261108235610_recipe_shares extends Migration {

  override name = 'Migration20261108235610_recipe_shares';

  override up(): void | Promise<void> {
    this.addSql(`create table "recipe_shares" ("id" uuid not null, "household_id" uuid not null, "recipe_id" uuid not null, "token" varchar(255) not null, "created_by_id" uuid null, "created_at" timestamptz not null, "opened_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "recipe_shares_household_id_index" on "recipe_shares" ("household_id");`);
    this.addSql(`alter table "recipe_shares" add constraint "recipe_shares_recipe_id_unique" unique ("recipe_id");`);
    this.addSql(`alter table "recipe_shares" add constraint "recipe_shares_token_unique" unique ("token");`);

    this.addSql(`alter table "recipe_shares" add constraint "recipe_shares_household_id_foreign" foreign key ("household_id") references "households" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_shares" add constraint "recipe_shares_recipe_id_foreign" foreign key ("recipe_id") references "recipes" ("id") on delete cascade;`);
    this.addSql(`alter table "recipe_shares" add constraint "recipe_shares_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "recipe_shares" cascade;`);
  }

}
