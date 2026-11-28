import { existsSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Plugin } from "vite"

/** The parts of Rolldown's output chunk that the budget reads. */
export type BuiltChunk = {
  fileName: string
  isEntry: boolean
  facadeModuleId: string | null
  imports: string[]
  moduleIds: string[]
}

export type Budget = {
  /** The most files the first load may fetch. */
  files: number
  /** The most bytes they may come to, with Brotli. */
  brotliBytes: number
  /** A module path that must not be in the first load. */
  forbidden: RegExp
}

/** The route files signed-in people land on: the app's shell, and Today. */
export const TODAY_FIRST_LOAD = [
  "src/routes/_app.tsx?tsr-split=component",
  "src/routes/_app/index.tsx?tsr-split=component",
]

/**
 * What Today's first load may cost. The foods vocabulary is big and only
 * the pages that look foods up need it.
 */
export const FIRST_LOAD_BUDGET: Budget = {
  files: 70,
  brotliBytes: 380_000,
  forbidden: /packages[\\/]shared[\\/]src[\\/]foods[\\/]data[\\/]/,
}

/**
 * The chunks a page fetches before it draws: the entry, the chunks of the
 * given routes, and everything they import statically, each once.
 */
export function firstLoad(
  chunks: BuiltChunk[],
  routes: string[]
): BuiltChunk[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const load = new Map<string, BuiltChunk>()

  function add(chunk: BuiltChunk) {
    if (load.has(chunk.fileName)) return
    load.set(chunk.fileName, chunk)
    for (const name of chunk.imports) {
      const imported = byName.get(name)
      if (imported) add(imported)
    }
  }

  for (const chunk of chunks) {
    const facade = chunk.facadeModuleId?.replaceAll("\\", "/") ?? ""
    const isRoute = routes.some((route) => facade.endsWith(route))
    if (chunk.isEntry || isRoute) add(chunk)
  }
  return [...load.values()]
}

/** One sentence for each limit the load goes over. Empty when it's within. */
export function budgetProblems(
  load: BuiltChunk[],
  brotliSize: (fileName: string) => number,
  budget: Budget
): string[] {
  const problems: string[] = []

  if (load.length > budget.files) {
    problems.push(
      `The first load is ${load.length} files, over the limit of ${budget.files}.`
    )
  }

  const bytes = load.reduce(
    (total, chunk) => total + brotliSize(chunk.fileName),
    0
  )
  if (bytes > budget.brotliBytes) {
    problems.push(
      `The first load is ${bytes.toLocaleString("en-US")} bytes with Brotli, over the limit of ${budget.brotliBytes.toLocaleString("en-US")}.`
    )
  }

  for (const chunk of load) {
    if (chunk.moduleIds.some((id) => budget.forbidden.test(id))) {
      problems.push(
        `${chunk.fileName} is in the first load and holds the foods vocabulary, which only the pages that look foods up should load.`
      )
    }
  }
  return problems
}

/** Fails the build when Today's first load goes over its budget. */
export function budgetPlugin(): Plugin {
  let outDir = "dist"
  let chunks: BuiltChunk[] = []

  return {
    name: "merran:budget",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    generateBundle(_options, bundle) {
      chunks = Object.values(bundle).flatMap((item) => {
        if (item.type !== "chunk") return []
        return [
          {
            fileName: item.fileName,
            isEntry: item.isEntry,
            facadeModuleId: item.facadeModuleId,
            imports: item.imports,
            moduleIds: item.moduleIds,
          },
        ]
      })
    },
    // After precompressPlugin's, so the .br files are there to measure.
    closeBundle() {
      const load = firstLoad(chunks, TODAY_FIRST_LOAD)

      // Files under 1 KB get no .br, so their own size stands in.
      function brotliSize(fileName: string): number {
        const path = join(outDir, fileName)
        return statSync(existsSync(`${path}.br`) ? `${path}.br` : path).size
      }

      const bytes = load.reduce(
        (total, chunk) => total + brotliSize(chunk.fileName),
        0
      )
      console.log(
        `Today's first load: ${load.length} files, ${Math.round(bytes / 1000)} KB with Brotli`
      )

      const problems = budgetProblems(load, brotliSize, FIRST_LOAD_BUDGET)
      if (problems.length > 0) {
        throw new Error(problems.join("\n"))
      }
    },
  }
}
