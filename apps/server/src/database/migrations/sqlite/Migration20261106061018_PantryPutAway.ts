import { Migration } from '@mikro-orm/migrations';

export class Migration20261106061018_PantryPutAway extends Migration {

  override name = 'Migration20261106061018_PantryPutAway';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`shopping_items\` add column \`put_away\` json null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`shopping_items\` drop column \`put_away\`;`);
  }

}
