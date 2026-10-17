import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import ts from "typescript"
import { format, resolveConfig } from "prettier"

const root = fileURLToPath(new URL("../../../", import.meta.url))
export const output = resolve(
  root,
  "apps/docs/src/content/docs/docs/run/settings-reference.md"
)

// Read syntax only: never boot the server, load its environment, or read saved
// settings. Paths let this run with only the docs workspace installed in CI.
export function readSettings() {
  const program = ts.createProgram(
    [
      resolve(root, "apps/server/src/core/config.ts"),
      resolve(root, "apps/server/src/modules/settings.ts"),
    ],
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      paths: {
        "@merran/shared": [resolve(root, "packages/shared/src/index.ts")],
      },
    }
  )
  const checker = program.getTypeChecker()
  function unwrap(node) {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
      return unwrap(node.expression)
    if (!ts.isIdentifier(node)) return node
    let symbol = checker.getSymbolAtLocation(node)
    if (symbol?.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol)
    const declaration = symbol?.valueDeclaration
    if (!declaration?.initializer)
      throw new Error(`Cannot resolve ${node.getText()}`)
    return unwrap(declaration.initializer)
  }
  function literal(node) {
    node = unwrap(node)
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
    throw new Error(`Unsupported settings metadata: ${node.getText()}`)
  }
  function variable(file, name) {
    const source = program.getSourceFile(resolve(root, file))
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.name.getText() === name)
          return unwrap(declaration.initializer)
      }
    }
    throw new Error(`Missing ${name}`)
  }
  const groups = [variable("apps/server/src/core/config.ts", "BOOT_SETTINGS")]
  const registry = variable(
    "apps/server/src/modules/settings.ts",
    "MODULE_SETTINGS"
  )
  for (const entry of registry.elements) {
    if (
      !ts.isSpreadElement(entry) ||
      !ts.isCallExpression(entry.expression) ||
      entry.expression.expression.getText() !== "Object.values"
    ) {
      throw new Error(`Unsupported settings registration: ${entry.getText()}`)
    }
    groups.push(unwrap(entry.expression.arguments[0]))
  }
  const settings = []
  for (const group of groups) {
    for (const property of group.properties) {
      const call = property.initializer
      if (!call || !ts.isCallExpression(call))
        throw new Error("Expected a setting constructor")
      const kind = call.expression.getText().replace(/Setting$/, "")
      if (
        ![
          "text",
          "secret",
          "number",
          "switch",
          "choice",
          "list",
          "json",
        ].includes(kind)
      )
        throw new Error(`Unknown setting kind ${kind}`)
      const fields = Object.fromEntries(
        call.arguments[0].properties.map((p) => [
          p.name.getText(),
          p.initializer,
        ])
      )
      if (fields.internal && literal(fields.internal)) continue
      const setting = { kind, level: "server", default: null }
      for (const key of [
        "key",
        "description",
        "level",
        "env",
        "envOnly",
        "default",
        "choices",
      ]) {
        if (fields[key]) setting[key] = literal(fields[key])
      }
      if (kind === "secret") setting.default = null
      setting.source = property
        .getSourceFile()
        .fileName.slice(root.length)
        .replaceAll("\\", "/")
        .replace(/^\//, "")
      settings.push(setting)
    }
  }
  if (new Set(settings.map((s) => s.key)).size !== settings.length)
    throw new Error("Duplicate setting keys")
  return settings
}

// Editorial corrections to source UI prose, not to generated defaults or scope.
// Keep costs variable and avoid suggesting AI works without configured access.
const descriptions = {
  "photos.enabled":
    "Enable optional AI photos for recipes without a photo. Requires eligible OpenAI or Google access; provider charges vary. Generated photos never replace a real photo.",
  "voice.provider":
    "Who reads cook steps aloud: the device, Kokoro, or OpenAI. OpenAI requires eligible AI access and incurs provider charges. Unset: Kokoro when its address is configured, otherwise the device.",
  "nutrition.usdaKey":
    "A USDA FoodData Central key for calculating nutrition from ingredients. Without one, AI estimates require configured AI access.",
  "updates.check":
    "Check GitHub every six hours for a newer release and show its notes to the server administrator. This does not install updates. GitHub receives the network request; see the privacy guide.",
}

export function renderSettings(settings) {
  const code = (value) =>
    `\`${typeof value === "string" ? value : JSON.stringify(value)}\``
  return `---
title: Settings reference
description: Server and household settings generated from Merran's source definitions.
sidebar:
  order: 6
editUrl: false
---

<!-- Generated by scripts/settings-reference.mjs. Do not edit by hand. -->

This reference is generated from the checked-out server's boot settings and registered module settings. It describes source defaults, not your running server's values or a verified release. Internal state is excluded. Dedicated account, household, AI policy, and connection screens also store preferences outside this registry; follow [configuration](../configuration/) and [AI setup](../ai-setup/) for those.

## How to read this reference

- Environment values take priority over saved values, then defaults. A value supplied by the environment locks the corresponding setting in the app. An empty environment variable counts as unset; removing an override can reveal an older saved value.
- **Environment only** settings require recreating the container after configuration changes. Other server settings belong to **Settings → This server**; household settings require a household owner or admin.
- **Unset** means no declared value. The description may explain a runtime fallback. Docker and Compose can override these defaults: for example, the image sets its data directory, version, and installation method.
- Switch environment values accept true, 1, yes, on or false, 0, no, off, ignoring case. Lists use commas between entries. Choices use the listed values. Invalid values are rejected; boot errors name the environment variable.
- Secret values are never included here. Back up the server secret with the data, and keep credentials out of logs and issues.

Compose variables such as MERRAN_PORT, MERRAN_IMAGE, and TZ are deployment controls, not entries in this server registry. See [configuration](../configuration/). Enabling a module does not supply its dependencies or credentials. Read [AI privacy](../../project/ai-privacy/) before enabling external processing.

${settings
  .map(
    (s) => `## ${s.key}

${descriptions[s.key] ?? s.description}

- **Scope:** ${s.level}${s.envOnly ? " (environment only)" : ""}
- **Type:** ${s.kind}
- **Default:** ${s.default === null ? "Unset" : code(s.default)}
- **Environment:** ${s.env ? code(s.env) : "None"}${s.choices ? `\n- **Choices:** ${s.choices.map(code).join(", ")}` : ""}

[Source definition](https://github.com/merran-app/merran/blob/main/${s.source})
`
  )
  .join("\n")}
## Next steps

Use [troubleshooting](../troubleshooting/) for startup errors and locked settings, [household roles](../household-roles/) for access rules, and [updating, backups, and recovery](../updating-and-backups/) before changing the installation.
`
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await format(renderSettings(readSettings()), {
    ...(await resolveConfig(output)),
    filepath: output,
  })
  if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== result)
      throw new Error(
        "Settings reference is stale. Run pnpm --filter @merran/docs settings:generate."
      )
  } else {
    await writeFile(output, result)
  }
}
