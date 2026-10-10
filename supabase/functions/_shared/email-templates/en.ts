// English copy. Plain text only: the layout escapes it.
import { type CopyBook, optionalAction, optionalCode } from './copy.ts';

const IGNORE = "If you didn't ask for this email, you can ignore it.";
const CODE = 'Or enter this code in the app:';

export const EN: CopyBook = {
  welcome: (v) => ({
    subject: 'Welcome to Travelist',
    heading: v.name ? `Welcome to Travelist, ${v.name}!` : 'Welcome to Travelist!',
    paragraphs: [
      'Your account is ready. Pick a city to see what to know before you go, explore its ' +
      'attractions and plan a walking route.',
      'Save your favourite places in walk lists and share them with friends.',
    ],
    action: optionalAction('Start exploring', v.appUrl),
    footnote: 'You are receiving this email because you created a Travelist account.',
  }),
  signup: (v) => ({
    subject: 'Confirm your Travelist account',
    heading: 'Confirm your email',
    paragraphs: ['Tap the button to confirm your email and open Travelist.'],
    action: optionalAction('Confirm and open Travelist', v.actionUrl),
    code: optionalCode(CODE, v.code),
    footnote: IGNORE,
  }),
  recovery: (v) => ({
    subject: 'Reset your Travelist password',
    heading: 'Reset your password',
    paragraphs: [
      'We received a request to reset the password of your Travelist account.',
      'Tap the button to choose a new password. The link expires in 1 hour and works once.',
    ],
    action: optionalAction('Choose a new password', v.actionUrl),
    footnote: "If you didn't ask to reset your password, ignore this email: it stays the same.",
  }),
  magiclink: (v) => ({
    subject: 'Your Travelist sign-in link',
    heading: 'Sign in to Travelist',
    paragraphs: ['Tap the link to sign in.'],
    action: optionalAction('Sign in', v.actionUrl),
    code: optionalCode(CODE, v.code),
    footnote: IGNORE,
  }),
  invite: (v) => ({
    subject: "You've been invited to Travelist",
    heading: 'Join Travelist',
    paragraphs: ["You've been invited to create a Travelist account. Tap the button to accept."],
    action: optionalAction('Accept the invitation', v.actionUrl),
    footnote: IGNORE,
  }),
  email_change: (v) => ({
    subject: 'Confirm your new Travelist email',
    heading: 'Confirm the email change',
    paragraphs: [
      v.newEmail
        ? `Tap the button to confirm changing your Travelist email to ${v.newEmail}.`
        : 'Tap the button to confirm the change of your Travelist email.',
    ],
    action: optionalAction('Confirm the change', v.actionUrl),
    code: optionalCode(CODE, v.code),
    footnote: "If you didn't ask for this change, ignore this email and your email stays the same.",
  }),
  reauthentication: (v) => ({
    subject: 'Your Travelist confirmation code',
    heading: 'Confirm it is you',
    paragraphs: ['Enter this code in Travelist to continue.'],
    code: optionalCode('Code:', v.code),
    footnote: IGNORE,
  }),
};
