import { Migration } from '@mikro-orm/migrations';

export class Migration20261106161647_FoodPlacementStoredIn extends Migration {

  override name = 'Migration20261106161647_FoodPlacementStoredIn';

  override up(): void | Promise<void> {
    this.addSql(`alter table "food_placements" add "stored_in" text null;`);
    this.addSql(`alter table "food_placements" add constraint "food_placements_stored_in_check" check ("stored_in" in ('fridge', 'freezer', 'cupboard'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "food_placements" drop constraint "food_placements_stored_in_check";`);
    this.addSql(`alter table "food_placements" drop column "stored_in";`);
  }

}
