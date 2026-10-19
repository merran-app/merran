import { Migration } from "@mikro-orm/migrations"

export class Migration20261019212806_OAuthLastUsed extends Migration {
  override name = "Migration20261019212806_OAuthLastUsed"

  override up(): void | Promise<void> {
    this.addSql(
      `alter table \`oauth_consents\` add column \`last_used_at\` datetime null;`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`oauth_consents\` drop column \`last_used_at\`;`)
  }
}
