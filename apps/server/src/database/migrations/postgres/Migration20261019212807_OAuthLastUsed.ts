import { Migration } from "@mikro-orm/migrations"

export class Migration20261019212807_OAuthLastUsed extends Migration {
  override name = "Migration20261019212807_OAuthLastUsed"

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "oauth_consents" add "last_used_at" timestamptz null;`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "oauth_consents" drop column "last_used_at";`)
  }
}
