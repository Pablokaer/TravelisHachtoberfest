// Portuguese (Portugal) copy, matching the app's pt strings. Plain text only: the layout escapes it.
import { type CopyBook, optionalAction, optionalCode } from './copy.ts';

const IGNORE = 'Se não pediu este email, pode ignorá-lo.';
const CODE = 'Ou introduza este código na app:';

export const PT: CopyBook = {
  welcome: (v) => ({
    subject: 'Bem-vindo ao Travelist',
    heading: v.name ? `Bem-vindo ao Travelist, ${v.name}!` : 'Bem-vindo ao Travelist!',
    paragraphs: [
      'A sua conta está pronta. Escolha uma cidade para saber o que precisa antes de ir, ' +
      'explorar as atrações e planear um percurso a pé.',
      'Guarde os seus locais favoritos em listas de passeios e partilhe-as com amigos.',
    ],
    action: optionalAction('Começar a explorar', v.appUrl),
    footnote: 'Recebe este email porque criou uma conta no Travelist.',
  }),
  signup: (v) => ({
    subject: 'Confirme a sua conta Travelist',
    heading: 'Confirme o seu email',
    paragraphs: ['Toque no botão para confirmar o seu email e abrir o Travelist.'],
    action: optionalAction('Confirmar e abrir o Travelist', v.actionUrl),
    code: optionalCode(CODE, v.code),
    footnote: IGNORE,
  }),
  recovery: (v) => ({
    subject: 'Redefinir a sua palavra-passe do Travelist',
    heading: 'Redefinir a palavra-passe',
    paragraphs: [
      'Recebemos um pedido para redefinir a palavra-passe da sua conta Travelist.',
      'Toque no botão para escolher uma nova palavra-passe. O link expira em 1 hora e só ' +
      'funciona uma vez.',
    ],
    action: optionalAction('Escolher nova palavra-passe', v.actionUrl),
    footnote: 'Se não pediu para redefinir a palavra-passe, ignore este email: ela não muda.',
  }),
  magiclink: (v) => ({
    subject: 'O seu link de acesso ao Travelist',
    heading: 'Entrar no Travelist',
    paragraphs: ['Toque no link para entrar.'],
    action: optionalAction('Entrar', v.actionUrl),
    code: optionalCode(CODE, v.code),
    footnote: IGNORE,
  }),
  invite: (v) => ({
    subject: 'Foi convidado para o Travelist',
    heading: 'Junte-se ao Travelist',
    paragraphs: ['Foi convidado para criar uma conta no Travelist. Toque no botão para aceitar.'],
    action: optionalAction('Aceitar o convite', v.actionUrl),
    footnote: IGNORE,
  }),
  email_change: (v) => ({
    subject: 'Confirme o seu novo email no Travelist',
    heading: 'Confirme a alteração de email',
    paragraphs: [
      v.newEmail
        ? `Toque no botão para confirmar a alteração do seu email no Travelist para ${v.newEmail}.`
        : 'Toque no botão para confirmar a alteração do seu email no Travelist.',
    ],
    action: optionalAction('Confirmar a alteração', v.actionUrl),
    code: optionalCode(CODE, v.code),
    footnote: 'Se não pediu esta alteração, ignore este email e o seu email não muda.',
  }),
  reauthentication: (v) => ({
    subject: 'O seu código de confirmação do Travelist',
    heading: 'Confirme que é você',
    paragraphs: ['Introduza este código no Travelist para continuar.'],
    code: optionalCode('Código:', v.code),
    footnote: IGNORE,
  }),
};
