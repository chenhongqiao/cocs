import { Client } from 'minio'

import { ConnectionStringParser } from 'connection-string-parser'

let minio: Client

export async function connectMinIO (url: string): Promise<void> {
  const minioConnectionString = new ConnectionStringParser({
    scheme: 'minio',
    hosts: []
  })

  if (url == null) {
    throw new Error('Missing MinIO URL')
  }

  const minioConfig = minioConnectionString.parse(url)

  if (minioConfig.hosts[0].host == null || minioConfig.username == null || minioConfig.password == null) {
    throw new Error('MinIO URL missing required information')
  }

  minio = new Client({
    endPoint: minioConfig.hosts[0].host,
    accessKey: minioConfig.username,
    secretKey: minioConfig.password,
    useSSL: false,
    port: minioConfig.hosts[0].port
  })

  if (!await minio.bucketExists('testcases')) {
    await minio.makeBucket('testcases')
  }
  if (!await minio.bucketExists('binaries')) {
    await minio.makeBucket('binaries')
  }
  if (!await minio.bucketExists('checkers')) {
    await minio.makeBucket('checkers')
  }
  await minio.setBucketVersioning('testcases', { Status: 'Enabled' })
  await minio.setBucketVersioning('checkers', { Status: 'Enabled' })
}

export { minio }
