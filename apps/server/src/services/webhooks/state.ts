// What the webhooks module has set up, for the code that records and sends
// events to read without reaching into settings each time.

let enabled = true
let publicUrl: string | null = null

/** The webhooks module calls this at start, and when its settings change. */
export function configureWebhooks(options: {
  enabled: boolean
  publicUrl: string | null
}) {
  enabled = options.enabled
  publicUrl = options.publicUrl
}

/** False when the server's administrator has turned webhooks off. */
export function webhooksEnabled() {
  return enabled
}

/** Where Merran is on the web, for links to recipes in what it sends. */
export function linkBase() {
  return publicUrl
}
