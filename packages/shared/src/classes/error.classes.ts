export class NotFoundError extends Error {
  resource = '';

  constructor (message: string, resource: string) {
    super(message)

    this.resource = resource

    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

export class ConflictError extends Error {
  resource = '';

  constructor (message: string, resource: string) {
    super(message)

    this.resource = resource

    Object.setPrototypeOf(this, ConflictError.prototype)
  }
}

export class AuthorizationError extends Error {
  resource = ''

  constructor (message: string, resource: string) {
    super(message)

    this.resource = resource

    Object.setPrototypeOf(this, AuthorizationError.prototype)
  }
}

export class AuthenticationError extends Error {
  credential = {};

  constructor (message: string, credential: object) {
    super(message)

    this.credential = credential

    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

export class AzureError extends Error {
  context = {};

  constructor (message: string, context: object) {
    super(message)

    this.context = context

    Object.setPrototypeOf(this, AzureError.prototype)
  }
}

export class DataError extends Error {
  resource = '';

  constructor (message: string, resource: string) {
    super(message)

    this.resource = resource

    Object.setPrototypeOf(this, DataError.prototype)
  }
}
