import { Migration } from "@mikro-orm/migrations"

export class Migration20261019210804_OAuthConnections extends Migration {
  override name = "Migration20261019210804_OAuthConnections"

  override up(): void | Promise<void> {
    this.addSql(
      `create table \`oauth_client_assertions\` (\`id\` text not null primary key, \`expires_at\` datetime not null);`
    )

    this.addSql(
      `create table \`oauth_resources\` (\`id\` text not null primary key, \`identifier\` text not null, \`name\` text not null, \`access_token_ttl\` integer null, \`refresh_token_ttl\` integer null, \`signing_algorithm\` text null, \`signing_key_id\` text null, \`allowed_scopes\` json null, \`custom_claims\` json null, \`dpop_bound_access_tokens_required\` integer null default false, \`disabled\` integer null default false, \`created_at\` datetime null, \`updated_at\` datetime null, \`policy_version\` integer null default 1, \`metadata\` json null);`
    )
    this.addSql(
      `create unique index \`oauth_resources_identifier_unique\` on \`oauth_resources\` (\`identifier\`);`
    )

    this.addSql(
      `create table \`oauth_clients\` (\`id\` text not null primary key, \`client_id\` text not null, \`client_secret\` text null, \`client_discovery_id\` text null, \`disabled\` integer null default false, \`skip_consent\` integer null, \`enable_end_session\` integer null, \`subject_type\` text null, \`scopes\` json null, \`client_credentials_scopes\` json null default '[]', \`user_id\` text null, \`created_at\` datetime null, \`updated_at\` datetime null, \`name\` text null, \`uri\` text null, \`icon\` text null, \`contacts\` json null, \`tos\` text null, \`policy\` text null, \`software_id\` text null, \`software_version\` text null, \`software_statement\` text null, \`redirect_uris\` json not null, \`post_logout_redirect_uris\` json null, \`backchannel_logout_uri\` text null, \`backchannel_logout_session_required\` integer null, \`token_endpoint_auth_method\` text null, \`application_type\` text null, \`jwks\` text null, \`jwks_uri\` text null, \`grant_types\` json null, \`response_types\` json null, \`require_pkce\` integer null, \`dpop_bound_access_tokens\` integer null default false, \`reference_id\` text null, \`metadata\` json null, constraint \`oauth_clients_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`
    )
    this.addSql(
      `create unique index \`oauth_clients_client_id_unique\` on \`oauth_clients\` (\`client_id\`);`
    )
    this.addSql(
      `create index \`oauth_clients_user_id_index\` on \`oauth_clients\` (\`user_id\`);`
    )

    this.addSql(
      `create table \`oauth_refresh_tokens\` (\`id\` text not null primary key, \`token\` text not null, \`client_id\` text not null, \`session_id\` text null, \`user_id\` text not null, \`reference_id\` text null, \`authorization_code_id\` text null, \`resources\` json null, \`requested_user_info_claims\` json null, \`expires_at\` datetime not null, \`created_at\` datetime not null, \`revoked\` datetime null, \`rotated_at\` datetime null, \`rotation_replay_response\` text null, \`rotation_replay_expires_at\` datetime null, \`auth_time\` datetime null, \`confirmation\` json null, \`scopes\` json not null, constraint \`oauth_refresh_tokens_client_id_foreign\` foreign key (\`client_id\`) references \`oauth_clients\` (\`client_id\`) on delete cascade, constraint \`oauth_refresh_tokens_session_id_foreign\` foreign key (\`session_id\`) references \`sessions\` (\`id\`) on delete set null, constraint \`oauth_refresh_tokens_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`
    )
    this.addSql(
      `create unique index \`oauth_refresh_tokens_token_unique\` on \`oauth_refresh_tokens\` (\`token\`);`
    )
    this.addSql(
      `create index \`oauth_refresh_tokens_client_id_index\` on \`oauth_refresh_tokens\` (\`client_id\`);`
    )
    this.addSql(
      `create index \`oauth_refresh_tokens_session_id_index\` on \`oauth_refresh_tokens\` (\`session_id\`);`
    )
    this.addSql(
      `create index \`oauth_refresh_tokens_user_id_index\` on \`oauth_refresh_tokens\` (\`user_id\`);`
    )
    this.addSql(
      `create index \`oauth_refresh_tokens_authorization_code_id_index\` on \`oauth_refresh_tokens\` (\`authorization_code_id\`);`
    )

    this.addSql(
      `create table \`oauth_consents\` (\`id\` text not null primary key, \`client_id\` text not null, \`user_id\` text null, \`reference_id\` text null, \`resources\` json null, \`requested_user_info_claims\` json null, \`scopes\` json not null, \`created_at\` datetime not null, \`updated_at\` datetime not null, constraint \`oauth_consents_client_id_foreign\` foreign key (\`client_id\`) references \`oauth_clients\` (\`client_id\`) on delete cascade, constraint \`oauth_consents_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade);`
    )
    this.addSql(
      `create index \`oauth_consents_client_id_index\` on \`oauth_consents\` (\`client_id\`);`
    )
    this.addSql(
      `create index \`oauth_consents_user_id_index\` on \`oauth_consents\` (\`user_id\`);`
    )

    this.addSql(
      `create table \`oauth_client_resources\` (\`id\` text not null primary key, \`client_id\` text not null, \`resource_id\` text not null, \`metadata\` json null, \`created_at\` datetime null, constraint \`oauth_client_resources_client_id_foreign\` foreign key (\`client_id\`) references \`oauth_clients\` (\`client_id\`) on delete cascade, constraint \`oauth_client_resources_resource_id_foreign\` foreign key (\`resource_id\`) references \`oauth_resources\` (\`identifier\`) on delete cascade);`
    )
    this.addSql(
      `create index \`oauth_client_resources_client_id_index\` on \`oauth_client_resources\` (\`client_id\`);`
    )
    this.addSql(
      `create index \`oauth_client_resources_resource_id_index\` on \`oauth_client_resources\` (\`resource_id\`);`
    )
    this.addSql(
      `create unique index \`oauth_client_resources_client_id_resource_id_unique\` on \`oauth_client_resources\` (\`client_id\`, \`resource_id\`);`
    )

    this.addSql(
      `create table \`oauth_access_tokens\` (\`id\` text not null primary key, \`token\` text not null, \`client_id\` text not null, \`session_id\` text null, \`user_id\` text null, \`reference_id\` text null, \`authorization_code_id\` text null, \`resources\` json null, \`requested_user_info_claims\` json null, \`refresh_id\` text null, \`expires_at\` datetime not null, \`created_at\` datetime not null, \`revoked\` datetime null, \`confirmation\` json null, \`scopes\` json not null, constraint \`oauth_access_tokens_client_id_foreign\` foreign key (\`client_id\`) references \`oauth_clients\` (\`client_id\`) on delete cascade, constraint \`oauth_access_tokens_session_id_foreign\` foreign key (\`session_id\`) references \`sessions\` (\`id\`) on delete set null, constraint \`oauth_access_tokens_user_id_foreign\` foreign key (\`user_id\`) references \`users\` (\`id\`) on delete cascade, constraint \`oauth_access_tokens_refresh_id_foreign\` foreign key (\`refresh_id\`) references \`oauth_refresh_tokens\` (\`id\`) on delete cascade);`
    )
    this.addSql(
      `create unique index \`oauth_access_tokens_token_unique\` on \`oauth_access_tokens\` (\`token\`);`
    )
    this.addSql(
      `create index \`oauth_access_tokens_client_id_index\` on \`oauth_access_tokens\` (\`client_id\`);`
    )
    this.addSql(
      `create index \`oauth_access_tokens_session_id_index\` on \`oauth_access_tokens\` (\`session_id\`);`
    )
    this.addSql(
      `create index \`oauth_access_tokens_user_id_index\` on \`oauth_access_tokens\` (\`user_id\`);`
    )
    this.addSql(
      `create index \`oauth_access_tokens_authorization_code_id_index\` on \`oauth_access_tokens\` (\`authorization_code_id\`);`
    )
    this.addSql(
      `create index \`oauth_access_tokens_refresh_id_index\` on \`oauth_access_tokens\` (\`refresh_id\`);`
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`oauth_client_assertions\`;`)
    this.addSql(`drop table if exists \`oauth_resources\`;`)
    this.addSql(`drop table if exists \`oauth_clients\`;`)
    this.addSql(`drop table if exists \`oauth_refresh_tokens\`;`)
    this.addSql(`drop table if exists \`oauth_consents\`;`)
    this.addSql(`drop table if exists \`oauth_client_resources\`;`)
    this.addSql(`drop table if exists \`oauth_access_tokens\`;`)
  }
}
