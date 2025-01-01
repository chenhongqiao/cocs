import { uploadPolygon, consumePolygonUploadSession } from '../services/polygon.services.js'

import { Type } from '@sinclair/typebox'
import multipart, { type MultipartFile } from '@fastify/multipart'
import { type FastifyTypeBox } from '../types.js' /*=*/
import { BadRequestError, badRequestSchema, PayloadTooLargeError, unauthorizedSchema } from 'http-errors-enhanced'

export async function polygonRoutes (routes: FastifyTypeBox): Promise<void> {
  await routes.register(multipart.default, {
    limits: {
      fileSize: 20971520,
      files: 1
    }
  })

  /**
   * Uploads a zipped Polygon package.
   * Unzips and parses the package, and update the problem.
   */
  routes.post(
    '/:uploadId',
    {
      schema: {
        params: Type.Object({ uploadId: Type.String() }),
        response: {
          201: Type.Object({ problemId: Type.String() }),
          400: badRequestSchema,
          401: unauthorizedSchema,
          413: Type.Object({ statusCode: Type.Number(), error: Type.String(), message: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { uploadId } = request.params
      const { contestId, replaceId } = await consumePolygonUploadSession(uploadId)

      try {
        const archive: MultipartFile | undefined = await request.file()
        if (archive === undefined) {
          throw new BadRequestError('No file found in request')
        }

        const problemId = await uploadPolygon({ contestId, replaceId, archive })

        return await reply.status(201).send({ problemId })
      } catch (err) {
        if (err instanceof routes.multipartErrors.InvalidMultipartContentTypeError) {
          throw new BadRequestError('Request must be multipart')
        } else if (err instanceof routes.multipartErrors.FilesLimitError) {
          throw new PayloadTooLargeError('Too many files in one request')
        } else if (err instanceof routes.multipartErrors.RequestFileTooLargeError) {
          throw new PayloadTooLargeError('Testcase too large to be processed')
        } else {
          throw err
        }
      }
    }
  )
}
