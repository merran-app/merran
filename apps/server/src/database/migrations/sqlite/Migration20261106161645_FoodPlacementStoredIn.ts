import { Migration } from '@mikro-orm/migrations';

export class Migration20261106161645_FoodPlacementStoredIn extends Migration {

  override name = 'Migration20261106161645_FoodPlacementStoredIn';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`food_placements\` add column \`stored_in\` text check (\`stored_in\` in ('fridge', 'freezer', 'cupboard')) null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`food_placements\` drop column \`stored_in\`;`);
  }

}
