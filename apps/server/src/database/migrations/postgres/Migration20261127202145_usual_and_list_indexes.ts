import { Migration } from '@mikro-orm/migrations';

export class Migration20261127202145_usual_and_list_indexes extends Migration {

  override name = 'Migration20261127202145_usual_and_list_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index "purchases_household_id_bought_on_index" on "purchases" ("household_id", "bought_on");`);

    this.addSql(`create index "shopping_items_household_id_food_key_index" on "shopping_items" ("household_id", "food_key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "purchases_household_id_bought_on_index";`);

    this.addSql(`drop index "shopping_items_household_id_food_key_index";`);
  }

}
