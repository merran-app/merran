import { Migration } from '@mikro-orm/migrations';

export class Migration20261019035142_shopping_meal_variants extends Migration {

  override name = 'Migration20261019035142_shopping_meal_variants';

  override up(): void | Promise<void> {
    this.addSql(`alter table "plan_entries" add "variants" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "plan_entries" drop column "variants";`);
  }

}
