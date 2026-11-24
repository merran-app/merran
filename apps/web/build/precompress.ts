import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"
import type { Plugin } from "vite"

const brotli = promisify(brotliCompress)
const gzipped = promisify(gzip)

/** Text files, which compress well. Images and fonts are compressed already. */
const COMPRESSIBLE = /\.(js|css|html|svg|json|webmanifest|txt|map)$/

/** Below this, compressing saves too little to matter. */
const MIN_BYTES = 1_024

/**
 * Writes a Brotli (.br) and a gzip (.gz) copy next to each text file in the
 * folder, at their strongest, which is too slow to do for each request.
 * The server sends whichever the browser takes. Returns how many files it
 * compressed.
 */
export async function precompress(dir: string): Promise<number> {
  const names = await readdir(dir, { recursive: true })
  let compressed = 0

  for (const name of names) {
    if (!COMPRESSIBLE.test(name)) continue
    const path = join(dir, name)
    const info = await stat(path)
    if (!info.isFile() || info.size < MIN_BYTES) continue

    const contents = await readFile(path)
    const [br, gz] = await Promise.all([
      brotli(contents, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: info.size,
        },
      }),
      gzipped(contents, { level: 9 }),
    ])
    await writeFile(`${path}.br`, br)
    await writeFile(`${path}.gz`, gz)
    compressed++
  }
  return compressed
}

/** Precompresses what `vite build` wrote, once it's all written. */
export function precompressPlugin(): Plugin {
  let outDir = "dist"

  return {
    name: "merran:precompress",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await precompress(outDir)
    },
  }
}
