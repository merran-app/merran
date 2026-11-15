import { Migration } from '@mikro-orm/migrations';

export class Migration20261115043940_speed_indexes extends Migration {

  override name = 'Migration20261115043940_speed_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index "pantry_items_aisle_id_index" on "pantry_items" ("aisle_id");`);

    this.addSql(`create index "followed_sites_site_id_index" on "followed_sites" ("site_id");`);

    this.addSql(`create index "shopping_items_aisle_id_index" on "shopping_items" ("aisle_id");`);

    this.addSql(`create index "food_placements_aisle_id_index" on "food_placements" ("aisle_id");`);
    this.addSql(`create index "food_placements_list_id_index" on "food_placements" ("list_id");`);

    this.addSql(`create index "site_recipes_classic_opened_at_index" on "site_recipes" ("classic", "opened_at");`);

    this.addSql(`create index "store_connections_account_id_index" on "store_connections" ("account_id");`);
    this.addSql(`create index "store_connections_linked_by_id_index" on "store_connections" ("linked_by_id");`);
    this.addSql(`create index "store_connections_pending_user_id_index" on "store_connections" ("pending_user_id");`);

    this.addSql(`create index "sessions_active_household_id_index" on "sessions" ("active_household_id");`);

    this.addSql(`create index "server_settings_secret_id_index" on "server_settings" ("secret_id");`);
    this.addSql(`create index "server_settings_updated_by_id_index" on "server_settings" ("updated_by_id");`);

    this.addSql(`drop index "recipes_deleted_at_index";`);
    this.addSql(`create index "recipes_created_by_id_index" on "recipes" ("created_by_id");`);
    this.addSql(`create index "recipes_household_id_created_at_index" on "recipes" ("household_id", "created_at") where "deleted_at" is null;`);
    this.addSql(`create index "recipes_deleted_at_index" on "recipes" ("deleted_at") where "deleted_at" is not null;`);

    this.addSql(`create index "recipe_versions_created_by_id_index" on "recipe_versions" ("created_by_id");`);

    this.addSql(`create index "recipe_shares_created_by_id_index" on "recipe_shares" ("created_by_id");`);

    this.addSql(`create index "recipe_pairings_paired_recipe_id_index" on "recipe_pairings" ("paired_recipe_id");`);

    this.addSql(`create index "recipe_not_duplicates_created_by_id_index" on "recipe_not_duplicates" ("created_by_id");`);

    this.addSql(`create index "plan_entries_recipe_id_index" on "plan_entries" ("recipe_id");`);
    this.addSql(`create index "plan_entries_with_recipe_id_index" on "plan_entries" ("with_recipe_id");`);

    this.addSql(`create index "receipts_user_id_index" on "receipts" ("user_id");`);

    this.addSql(`create index "proposals_created_by_id_index" on "proposals" ("created_by_id");`);
    this.addSql(`create index "proposals_resolved_by_id_index" on "proposals" ("resolved_by_id");`);

    this.addSql(`drop index "jobs_status_index";`);
    this.addSql(`create index "jobs_created_by_id_index" on "jobs" ("created_by_id");`);
    this.addSql(`create index "jobs_status_run_at_created_at_index" on "jobs" ("status", "run_at", "created_at");`);
    this.addSql(`create index "jobs_for_household_id_kind_status_index" on "jobs" ("for_household_id", "kind", "status");`);

    this.addSql(`create index "password_resets_delivery_id_index" on "password_resets" ("delivery_id");`);
    this.addSql(`create index "password_resets_job_id_index" on "password_resets" ("job_id");`);

    this.addSql(`create index "invite_links_delivery_token_id_index" on "invite_links" ("delivery_token_id");`);
    this.addSql(`create index "invite_links_delivery_job_id_index" on "invite_links" ("delivery_job_id");`);
    this.addSql(`create index "invite_links_created_by_id_index" on "invite_links" ("created_by_id");`);
    this.addSql(`create index "invite_links_used_by_id_index" on "invite_links" ("used_by_id");`);

    this.addSql(`create index "household_settings_secret_id_index" on "household_settings" ("secret_id");`);
    this.addSql(`create index "household_settings_updated_by_id_index" on "household_settings" ("updated_by_id");`);

    this.addSql(`create index "email_invitations_inviter_id_index" on "email_invitations" ("inviter_id");`);

    this.addSql(`create index "discoveries_user_id_index" on "discoveries" ("user_id");`);

    this.addSql(`create index "cook_notes_user_id_index" on "cook_notes" ("user_id");`);

    this.addSql(`create index "cooking_sessions_cook_id_index" on "cooking_sessions" ("cook_id");`);

    this.addSql(`create index "ai_usage_user_id_index" on "ai_usage" ("user_id");`);

    this.addSql(`create index "ai_keys_secret_id_index" on "ai_keys" ("secret_id");`);
    this.addSql(`create index "ai_keys_created_by_id_index" on "ai_keys" ("created_by_id");`);

    this.addSql(`create index "webhooks_address_id_index" on "webhooks" ("address_id");`);
    this.addSql(`create index "webhooks_secret_id_index" on "webhooks" ("secret_id");`);
    this.addSql(`create index "webhooks_previous_secret_id_index" on "webhooks" ("previous_secret_id");`);
    this.addSql(`create index "webhooks_headers_id_index" on "webhooks" ("headers_id");`);
    this.addSql(`create index "webhooks_created_by_id_index" on "webhooks" ("created_by_id");`);

    this.addSql(`create index "weekly_items_aisle_id_index" on "weekly_items" ("aisle_id");`);
    this.addSql(`create index "weekly_items_list_id_index" on "weekly_items" ("list_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "ai_keys_secret_id_index";`);
    this.addSql(`drop index "ai_keys_created_by_id_index";`);

    this.addSql(`drop index "ai_usage_user_id_index";`);

    this.addSql(`drop index "cook_notes_user_id_index";`);

    this.addSql(`drop index "cooking_sessions_cook_id_index";`);

    this.addSql(`drop index "discoveries_user_id_index";`);

    this.addSql(`drop index "email_invitations_inviter_id_index";`);

    this.addSql(`drop index "followed_sites_site_id_index";`);

    this.addSql(`drop index "food_placements_aisle_id_index";`);
    this.addSql(`drop index "food_placements_list_id_index";`);

    this.addSql(`drop index "household_settings_secret_id_index";`);
    this.addSql(`drop index "household_settings_updated_by_id_index";`);

    this.addSql(`drop index "invite_links_delivery_token_id_index";`);
    this.addSql(`drop index "invite_links_delivery_job_id_index";`);
    this.addSql(`drop index "invite_links_created_by_id_index";`);
    this.addSql(`drop index "invite_links_used_by_id_index";`);

    this.addSql(`drop index "jobs_created_by_id_index";`);
    this.addSql(`drop index "jobs_status_run_at_created_at_index";`);
    this.addSql(`drop index "jobs_for_household_id_kind_status_index";`);
    this.addSql(`create index "jobs_status_index" on "jobs" ("status");`);

    this.addSql(`drop index "pantry_items_aisle_id_index";`);

    this.addSql(`drop index "password_resets_delivery_id_index";`);
    this.addSql(`drop index "password_resets_job_id_index";`);

    this.addSql(`drop index "plan_entries_recipe_id_index";`);
    this.addSql(`drop index "plan_entries_with_recipe_id_index";`);

    this.addSql(`drop index "proposals_created_by_id_index";`);
    this.addSql(`drop index "proposals_resolved_by_id_index";`);

    this.addSql(`drop index "receipts_user_id_index";`);

    this.addSql(`drop index "recipe_not_duplicates_created_by_id_index";`);

    this.addSql(`drop index "recipe_pairings_paired_recipe_id_index";`);

    this.addSql(`drop index "recipe_shares_created_by_id_index";`);

    this.addSql(`drop index "recipe_versions_created_by_id_index";`);

    this.addSql(`drop index "recipes_created_by_id_index";`);
    this.addSql(`drop index "recipes_household_id_created_at_index";`);
    this.addSql(`drop index "recipes_deleted_at_index";`);
    this.addSql(`create index "recipes_deleted_at_index" on "recipes" ("deleted_at");`);

    this.addSql(`drop index "server_settings_secret_id_index";`);
    this.addSql(`drop index "server_settings_updated_by_id_index";`);

    this.addSql(`drop index "sessions_active_household_id_index";`);

    this.addSql(`drop index "shopping_items_aisle_id_index";`);

    this.addSql(`drop index "site_recipes_classic_opened_at_index";`);

    this.addSql(`drop index "store_connections_account_id_index";`);
    this.addSql(`drop index "store_connections_linked_by_id_index";`);
    this.addSql(`drop index "store_connections_pending_user_id_index";`);

    this.addSql(`drop index "webhooks_address_id_index";`);
    this.addSql(`drop index "webhooks_secret_id_index";`);
    this.addSql(`drop index "webhooks_previous_secret_id_index";`);
    this.addSql(`drop index "webhooks_headers_id_index";`);
    this.addSql(`drop index "webhooks_created_by_id_index";`);

    this.addSql(`drop index "weekly_items_aisle_id_index";`);
    this.addSql(`drop index "weekly_items_list_id_index";`);
  }

}
