/**
 * Effect-based FileSystem service
 *
 * Provides pure Effect wrappers around Node.js fs operations
 */

import { Context, Effect, Layer } from 'effect'
import { readFile, access } from 'fs/promises'
import { existsSync } from 'fs'
import { constants } from 'fs'
import { FsError } from '../errors.js'

/**
 * FileSystem service interface
 */
export interface FileSystem {
  /**
   * Read file contents as UTF-8 string
   */
  readonly readFile: (path: string) => Effect.Effect<string, FsError>

  /**
   * Check if file exists
   */
  readonly exists: (path: string) => Effect.Effect<boolean, never>

  /**
   * Check if file is readable
   */
  readonly isReadable: (path: string) => Effect.Effect<boolean, never>
}

/**
 * FileSystem service tag
 */
export const FileSystem = Context.GenericTag<FileSystem>('@atrim/FileSystem')

/**
 * Live implementation of FileSystem service
 */
export const FileSystemLive = Layer.succeed(
  FileSystem,
  FileSystem.of({
    readFile: (path: string) =>
      Effect.tryPromise({
        try: () => readFile(path, 'utf-8'),
        catch: (error) =>
          new FsError({
            message: `Failed to read file: ${path}`,
            path,
            cause: error
          })
      }),

    exists: (path: string) => Effect.sync(() => existsSync(path)),

    isReadable: (path: string) =>
      Effect.tryPromise({
        try: async () => {
          try {
            await access(path, constants.R_OK)
            return true
          } catch {
            return false
          }
        },
        catch: () => false
      }).pipe(Effect.orElseSucceed(() => false))
  })
)
