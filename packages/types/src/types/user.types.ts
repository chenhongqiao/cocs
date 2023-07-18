import { type Static, Type } from '@sinclair/typebox'

export const NewUserSchema = Type.Object({
  name: Type.String({ maxLength: 32 }),
  email: Type.String({ maxLength: 32, format: 'email' }),
  password: Type.String({ maxLength: 32, minLength: 8 }),
  username: Type.String({ maxLength: 16, pattern: '^[A-Za-z0-9_]*$' })
}, { additionalProperties: false })
export type NewUser = Static<typeof NewUserSchema>

export enum UserRole {
  User = 'User',
  Admin = 'Admin',
  Judger = 'Judger'
}

export const UserSchema = Type.Object({
  name: Type.String(),
  email: Type.String(),
  username: Type.String(),

  credential: Type.Object({
    hash: Type.String(),
    salt: Type.String()
  }),
  role: Type.Enum(UserRole),
  id: Type.String(),
  newEmail: Type.Optional(Type.String()),
  scopes: Type.Record(Type.String(), Type.Array(Type.String())),
  teams: Type.Record(Type.String(), Type.String())
})
export type User = Static<typeof UserSchema>

export const PublicUserProfileSchema = Type.Pick(UserSchema, ['username', 'name', 'id'])
export type PublicUserProfile = Static<typeof PublicUserProfileSchema>

export const PrivateUserProfileSchema = Type.Omit(UserSchema, ['credential'])
export type PrivateUserProfile = Static<typeof PrivateUserProfileSchema>
