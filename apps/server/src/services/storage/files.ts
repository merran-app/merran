import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"

/**
 * Where Merran keeps files, like recipe photos, by key:
 * "photos/<household>/<photo>/card.webp". Only the data folder for now;
 * other places (S3 and the like) can sit behind the same few calls.
 */
export type FileStore = {
  put(key: string, body: Buffer): Promise<void>
  /** The file, or null if there's no such file. */
  read(key: string): Promise<Buffer | null>
  /** Deletes a file, or a key's whole folder ("photos/<household>"). */
  remove(key: string): Promise<void>
}

const KEY = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i

/** Files in a folder on this machine: the data folder's `files`. */
export class LocalFileStore implements FileStore {
  readonly #root: string

  constructor(root: string) {
    this.#root = resolve(root)
  }

  #path(key: string) {
    if (!KEY.test(key) || key.split("/").includes("..")) {
      throw new Error(`Not a file key: ${key}`)
    }
    const path = resolve(join(this.#root, key))
    if (!path.startsWith(this.#root + sep)) {
      throw new Error(`Not a file key: ${key}`)
    }
    return path
  }

  async put(key: string, body: Buffer) {
    const path = this.#path(key)
    await mkdir(dirname(path), { recursive: true })
    // Write beside it and rename into place, so a reader (or a crash) never
    // meets half a file: a thumbnail made twice at once, or cut short, would
    // otherwise be served and kept by browsers for a year.
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, body)
      await rename(temporary, path)
    } catch (err) {
      await rm(temporary, { force: true })
      throw err
    }
  }

  async read(key: string) {
    try {
      return await readFile(this.#path(key))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
      throw err
    }
  }

  async remove(key: string) {
    await rm(this.#path(key), { recursive: true, force: true })
  }
}
