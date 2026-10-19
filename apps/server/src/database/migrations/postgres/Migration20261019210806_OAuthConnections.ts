import { Migration } from "@mikro-orm/migrations"

export class Migration20261019210806_OAuthConnections extends Migration {
  override name = "Migration20261019210806_OAuthConnections"

  override up(): void | Promise<void> {
    this.addSql(
      `create table "oauth_client_assertions" ("id" uuid not null, "expires_at" timestamptz not null, primary key ("id"));`
    )

    this.addSql(
      `create table "oauth_resources" ("id" uuid not null, "identifier" text not null, "name" text not null, "access_token_ttl" int null, "refresh_token_ttl" int null, "signing_algorithm" text null, "signing_key_id" text null, "allowed_scopes" jsonb null, "custom_claims" jsonb null, "dpop_bound_access_tokens_required" boolean null default false, "disabled" boolean null default false, "created_at" timestamptz null, "updated_at" timestamptz null, "policy_version" int null default 1, "metadata" jsonb null, primary key ("id"));`
    )
    this.addSql(
      `alter table "oauth_resources" add constraint "oauth_resources_identifier_unique" unique ("identifier");`
    )

    this.addSql(
      `create table "oauth_clients" ("id" uuid not null, "client_id" text not null, "client_secret" text null, "client_discovery_id" text null, "disabled" boolean null default false, "skip_consent" boolean null, "enable_end_session" boolean null, "subject_type" text null, "scopes" jsonb null, "client_credentials_scopes" jsonb null default '[]', "user_id" uuid null, "created_at" timestamptz null, "updated_at" timestamptz null, "name" text null, "uri" text null, "icon" text null, "contacts" jsonb null, "tos" text null, "policy" text null, "software_id" text null, "software_version" text null, "software_statement" text null, "redirect_uris" jsonb not null, "post_logout_redirect_uris" jsonb null, "backchannel_logout_uri" text null, "backchannel_logout_session_required" boolean null, "token_endpoint_auth_method" text null, "application_type" text null, "jwks" text null, "jwks_uri" text null, "grant_types" jsonb null, "response_types" jsonb null, "require_pkce" boolean null, "dpop_bound_access_tokens" boolean null default false, "reference_id" text null, "metadata" jsonb null, primary key ("id"));`
    )
    this.addSql(
      `alter table "oauth_clients" add constraint "oauth_clients_client_id_unique" unique ("client_id");`
    )
    this.addSql(
      `create index "oauth_clients_user_id_index" on "oauth_clients" ("user_id");`
    )

    this.addSql(
      `create table "oauth_refresh_tokens" ("id" uuid not null, "token" text not null, "client_id" text not null, "session_id" uuid null, "user_id" uuid not null, "reference_id" text null, "authorization_code_id" text null, "resources" jsonb null, "requested_user_info_claims" jsonb null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "revoked" timestamptz null, "rotated_at" timestamptz null, "rotation_replay_response" text null, "rotation_replay_expires_at" timestamptz null, "auth_time" timestamptz null, "confirmation" jsonb null, "scopes" jsonb not null, primary key ("id"));`
    )
    this.addSql(
      `alter table "oauth_refresh_tokens" add constraint "oauth_refresh_tokens_token_unique" unique ("token");`
    )
    this.addSql(
      `create index "oauth_refresh_tokens_client_id_index" on "oauth_refresh_tokens" ("client_id");`
    )
    this.addSql(
      `create index "oauth_refresh_tokens_session_id_index" on "oauth_refresh_tokens" ("session_id");`
    )
    this.addSql(
      `create index "oauth_refresh_tokens_user_id_index" on "oauth_refresh_tokens" ("user_id");`
    )
    this.addSql(
      `create index "oauth_refresh_tokens_authorization_code_id_index" on "oauth_refresh_tokens" ("authorization_code_id");`
    )

    this.addSql(
      `create table "oauth_consents" ("id" uuid not null, "client_id" text not null, "user_id" uuid null, "reference_id" text null, "resources" jsonb null, "requested_user_info_claims" jsonb null, "scopes" jsonb not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`
    )
    this.addSql(
      `create index "oauth_consents_client_id_index" on "oauth_consents" ("client_id");`
    )
    this.addSql(
      `create index "oauth_consents_user_id_index" on "oauth_consents" ("user_id");`
    )

    this.addSql(
      `create table "oauth_client_resources" ("id" uuid not null, "client_id" text not null, "resource_id" text not null, "metadata" jsonb null, "created_at" timestamptz null, primary key ("id"));`
    )
    this.addSql(
      `create index "oauth_client_resources_client_id_index" on "oauth_client_resources" ("client_id");`
    )
    this.addSql(
      `create index "oauth_client_resources_resource_id_index" on "oauth_client_resources" ("resource_id");`
    )
    this.addSql(
      `alter table "oauth_client_resources" add constraint "oauth_client_resources_client_id_resource_id_unique" unique ("client_id", "resource_id");`
    )

    this.addSql(
      `create table "oauth_access_tokens" ("id" uuid not null, "token" text not null, "client_id" text not null, "session_id" uuid null, "user_id" uuid null, "reference_id" text null, "authorization_code_id" text null, "resources" jsonb null, "requested_user_info_claims" jsonb null, "refresh_id" uuid null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "revoked" timestamptz null, "confirmation" jsonb null, "scopes" jsonb not null, primary key ("id"));`
    )
    this.addSql(
      `alter table "oauth_access_tokens" add constraint "oauth_access_tokens_token_unique" unique ("token");`
    )
    this.addSql(
      `create index "oauth_access_tokens_client_id_index" on "oauth_access_tokens" ("client_id");`
    )
    this.addSql(
      `create index "oauth_access_tokens_session_id_index" on "oauth_access_tokens" ("session_id");`
    )
    this.addSql(
      `create index "oauth_access_tokens_user_id_index" on "oauth_access_tokens" ("user_id");`
    )
    this.addSql(
      `create index "oauth_access_tokens_authorization_code_id_index" on "oauth_access_tokens" ("authorization_code_id");`
    )
    this.addSql(
      `create index "oauth_access_tokens_refresh_id_index" on "oauth_access_tokens" ("refresh_id");`
    )

    this.addSql(
      `alter table "oauth_clients" add constraint "oauth_clients_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`
    )

    this.addSql(
      `alter table "oauth_refresh_tokens" add constraint "oauth_refresh_tokens_client_id_foreign" foreign key ("client_id") references "oauth_clients" ("client_id") on delete cascade;`
    )
    this.addSql(
      `alter table "oauth_refresh_tokens" add constraint "oauth_refresh_tokens_session_id_foreign" foreign key ("session_id") references "sessions" ("id") on delete set null;`
    )
    this.addSql(
      `alter table "oauth_refresh_tokens" add constraint "oauth_refresh_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`
    )

    this.addSql(
      `alter table "oauth_consents" add constraint "oauth_consents_client_id_foreign" foreign key ("client_id") references "oauth_clients" ("client_id") on delete cascade;`
    )
    this.addSql(
      `alter table "oauth_consents" add constraint "oauth_consents_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`
    )

    this.addSql(
      `alter table "oauth_client_resources" add constraint "oauth_client_resources_client_id_foreign" foreign key ("client_id") references "oauth_clients" ("client_id") on delete cascade;`
    )
    this.addSql(
      `alter table "oauth_client_resources" add constraint "oauth_client_resources_resource_id_foreign" foreign key ("resource_id") references "oauth_resources" ("identifier") on delete cascade;`
    )

    this.addSql(
      `alter table "oauth_access_tokens" add constraint "oauth_access_tokens_client_id_foreign" foreign key ("client_id") references "oauth_clients" ("client_id") on delete cascade;`
    )
    this.addSql(
      `alter table "oauth_access_tokens" add constraint "oauth_access_tokens_session_id_foreign" foreign key ("session_id") references "sessions" ("id") on delete set null;`
    )
    this.addSql(
      `alter table "oauth_access_tokens" add constraint "oauth_access_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`
    )
    this.addSql(
      `alter table "oauth_access_tokens" add constraint "oauth_access_tokens_refresh_id_foreign" foreign key ("refresh_id") references "oauth_refresh_tokens" ("id") on delete cascade;`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "oauth_client_resources" drop constraint "oauth_client_resources_resource_id_foreign";`
    )
    this.addSql(
      `alter table "oauth_refresh_tokens" drop constraint "oauth_refresh_tokens_client_id_foreign";`
    )
    this.addSql(
      `alter table "oauth_consents" drop constraint "oauth_consents_client_id_foreign";`
    )
    this.addSql(
      `alter table "oauth_client_resources" drop constraint "oauth_client_resources_client_id_foreign";`
    )
    this.addSql(
      `alter table "oauth_access_tokens" drop constraint "oauth_access_tokens_client_id_foreign";`
    )
    this.addSql(
      `alter table "oauth_access_tokens" drop constraint "oauth_access_tokens_refresh_id_foreign";`
    )

    this.addSql(`drop table if exists "oauth_client_assertions" cascade;`)
    this.addSql(`drop table if exists "oauth_resources" cascade;`)
    this.addSql(`drop table if exists "oauth_clients" cascade;`)
    this.addSql(`drop table if exists "oauth_refresh_tokens" cascade;`)
    this.addSql(`drop table if exists "oauth_consents" cascade;`)
    this.addSql(`drop table if exists "oauth_client_resources" cascade;`)
    this.addSql(`drop table if exists "oauth_access_tokens" cascade;`)
  }
}
