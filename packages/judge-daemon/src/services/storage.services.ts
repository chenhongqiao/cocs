import fs from 'node:fs/promises'
import { emptyDir } from 'fs-extra/esm'
import { LRUCache } from 'lru-cache'
import path from 'node:path'
import { minio } from '@argoncs/common'

let cache: LRUCache<string, string>
let cacheDir: string

const downloading = new Map<string, Promise<void>>()

export async function prepareStorage ({ dir }: { dir: string }): Promise<void> {
  cacheDir = dir
  await fs.access(dir)
  await emptyDir(dir)
  const { bsize, bavail } = await fs.statfs(dir)
  const availableSpace = Math.floor(bsize * bavail * 0.9)
  cache = new LRUCache({
    maxSize: availableSpace,
    dispose: (value, key): void => {
      void fs.rm(key)
    }
  })
}

async function cacheTestcase ({ objectName, versionId }: { objectName: string, versionId: string }): Promise<void> {
  const key = path.join(cacheDir, 'testcases', objectName, versionId)
  const size = (await minio.statObject('testcases', objectName, { versionId })).size
  // @ts-expect-error typing bug
  await minio.fGetObject('testcases', objectName, key, { versionId })
  cache.set(key, key, { size })
}

export async function fetchTestcase ({ objectName, versionId, destPath }: { objectName: string, versionId: string, destPath: string }): Promise<void> {
  const key = path.join(cacheDir, 'testcases', objectName, versionId)
  if (cache.get(key) != null) {
    await fs.copyFile(key, destPath); return
  }
  if (downloading.get(key) != null) {
    await downloading.get(key)
    if (cache.get(key) != null) {
      await fs.copyFile(key, destPath)
    }
  } else {
    downloading.set(key, cacheTestcase({ objectName, versionId }))
    await downloading.get(key)
    downloading.delete(key)
    await fs.copyFile(key, destPath)
  }
}

async function cacheBinary ({ objectName }: { objectName: string }): Promise<void> {
  const key = path.join(cacheDir, 'binaries', objectName)
  const size = (await minio.statObject('binaries', objectName)).size
  await minio.fGetObject('binaries', objectName, key)
  cache.set(key, key, { size })
}

export async function fetchBinary ({ objectName, destPath }: { objectName: string, destPath: string }): Promise<void> {
  const key = path.join(cacheDir, 'binaries', objectName)
  if (cache.get(key) != null) {
    await fs.copyFile(key, destPath); return
  }
  if (downloading.get(key) != null) {
    await downloading.get(key)
    if (cache.get(key) != null) {
      await fs.copyFile(key, destPath)
    }
  } else {
    downloading.set(key, cacheBinary({ objectName }))
    await downloading.get(key)
    downloading.delete(key)
    await fs.copyFile(key, destPath)
  }
}

async function cacheChecker ({ objectName, versionId }: { objectName: string, versionId: string }): Promise<void> {
  // TODO: try catch. checker may not exist, throw something.
  try {
    const key = path.join(cacheDir, 'checkers', objectName)
    const size = (await minio.statObject('checkers', objectName, { versionId })).size

    // @ts-expect-error typing bug
    await minio.fGetObject('checkers', objectName, key, { versionId })
    cache.set(key, key, { size })

  } catch (err) {
    console.log('cache checker error:', err)
    throw "none such checker"
  }
}

export async function fetchChecker ({ objectName, versionId, destPath }: { objectName: string, versionId: string, destPath: string }): Promise<void> {
  const key = path.join(cacheDir, 'checkers', objectName)
  if (cache.get(key) != null) {
    await fs.copyFile(key, destPath); return
  }
  if (downloading.get(key) != null) {
    await downloading.get(key)
    if (cache.get(key) != null) {
      await fs.copyFile(key, destPath)
    }
  } else {
    downloading.set(key, cacheChecker({ objectName, versionId }))
    await downloading.get(key)
    downloading.delete(key)
    await fs.copyFile(key, destPath)
  }
}
