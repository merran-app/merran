import { Migration } from '@mikro-orm/migrations';

// Ratings can be half stars, so they're doubles now. Written by hand, as the
// generator would, because no Postgres was at hand to compare against.

export class Migration20261106043842_half_star_ratings extends Migration {

  override name = 'Migration20261106043842_half_star_ratings';

  override up(): void | Promise<void> {
    this.addSql(`alter table "cook_notes" alter column "rating" type double precision using ("rating"::double precision);`);

    this.addSql(`alter table "recipes" alter column "rating" type double precision using ("rating"::double precision);`);
  }

  override down(): void | Promise<void> {
    // Back to whole stars, which loses the halves: Postgres rounds them to even.
    this.addSql(`alter table "cook_notes" alter column "rating" type smallint using ("rating"::smallint);`);

    this.addSql(`alter table "recipes" alter column "rating" type smallint using ("rating"::smallint);`);
  }

}
