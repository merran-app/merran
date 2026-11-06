import { Migration } from '@mikro-orm/migrations';

// Ratings can be half stars, so they're doubles now. Written by hand: the
// generator rebuilt both tables and dropped the old ones, and a migration runs
// in a transaction, where SQLite ignores `pragma foreign_keys = off`. Dropping
// `recipes` then deleted every recipe's ingredients, steps, tags and notes
// along with it. A new column, copied and renamed, leaves every row alone.

export class Migration20261106043840_half_star_ratings extends Migration {

  override name = 'Migration20261106043840_half_star_ratings';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`recipes\` add column \`rating_halves\` double null;`);
    this.addSql(`update \`recipes\` set \`rating_halves\` = \`rating\`;`);
    this.addSql(`alter table \`recipes\` drop column \`rating\`;`);
    this.addSql(`alter table \`recipes\` rename column \`rating_halves\` to \`rating\`;`);

    this.addSql(`alter table \`cook_notes\` add column \`rating_halves\` double null;`);
    this.addSql(`update \`cook_notes\` set \`rating_halves\` = \`rating\`;`);
    this.addSql(`alter table \`cook_notes\` drop column \`rating\`;`);
    this.addSql(`alter table \`cook_notes\` rename column \`rating_halves\` to \`rating\`;`);
  }

  override down(): void | Promise<void> {
    // Back to whole stars, which loses the halves: a half star rounds up.
    this.addSql(`alter table \`cook_notes\` add column \`rating_whole\` integer null;`);
    this.addSql(`update \`cook_notes\` set \`rating_whole\` = cast(round(\`rating\`) as integer);`);
    this.addSql(`alter table \`cook_notes\` drop column \`rating\`;`);
    this.addSql(`alter table \`cook_notes\` rename column \`rating_whole\` to \`rating\`;`);

    this.addSql(`alter table \`recipes\` add column \`rating_whole\` integer null;`);
    this.addSql(`update \`recipes\` set \`rating_whole\` = cast(round(\`rating\`) as integer);`);
    this.addSql(`alter table \`recipes\` drop column \`rating\`;`);
    this.addSql(`alter table \`recipes\` rename column \`rating_whole\` to \`rating\`;`);
  }

}
