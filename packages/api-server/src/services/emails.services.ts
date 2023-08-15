import { emailClient } from '../connections/email.connections.js'
import emailVerificationTemplate from '../templates/confirmEmail.js'

type EmailTemplates = Record<'confirmEmail', string>
const templates: EmailTemplates = {
  confirmEmail: emailVerificationTemplate
}

export async function sendEmail ({ to, subject, template, values }:
{
  to: string
  subject: string
  template: 'confirmEmail'
  values: Record<string, string>
}): Promise<void> {
  let content = templates[template]
  for (const [key, value] of Object.entries(values)) {
    content = content.replaceAll(`{{${key}}}`, value)
  }

  const email: emailClient.MailDataRequired = {
    to,
    from: { name: 'TeamsCode', email: process.env.EMAIL_SENDER_ADDRESS ?? 'noreply@contest.teamscode.org' },
    subject: `${subject}`,
    html: content
  }

  await emailClient.send(email)
}
