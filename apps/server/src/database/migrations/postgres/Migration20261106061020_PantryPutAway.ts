import { Migration } from '@mikro-orm/migrations';

export class Migration20261106061020_PantryPutAway extends Migration {

  override name = 'Migration20261106061020_PantryPutAway';

  override up(): void | Promise<void> {
    this.addSql(`alter table "shopping_items" add "put_away" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "shopping_items" drop column "put_away";`);
  }

}
