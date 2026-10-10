import { assert, assertEquals, assertNotEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { EMAIL_KINDS, renderEmail, resolveEmailLanguage } from './index.ts';
import { escapeHtml } from './layout.ts';

const LINK = 'http://127.0.0.1:54321/auth/v1/verify?token=pkce_1&type=magiclink&redirect_to=x';

Deno.test('escapeHtml neutralises markup and quotes', () => {
  assertEquals(
    escapeHtml(`<b a="1">'&'</b>`),
    '&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;',
  );
});

Deno.test('resolveEmailLanguage keeps supported languages and falls back to English', () => {
  assertEquals(resolveEmailLanguage('pt'), 'pt');
  assertEquals(resolveEmailLanguage('en'), 'en');
  assertEquals(resolveEmailLanguage('fr'), 'en');
  assertEquals(resolveEmailLanguage(undefined), 'en');
});

Deno.test('every email kind renders in English and Portuguese with the brand name', () => {
  for (const kind of EMAIL_KINDS) {
    const vars = { actionUrl: LINK, code: '123456', name: 'Nina', newEmail: 'n@x.io' };
    const en = renderEmail(kind, 'en', vars);
    const pt = renderEmail(kind, 'pt', vars);
    assertNotEquals(en.subject, pt.subject, `${kind} subjects must differ by language`);
    for (const email of [en, pt]) {
      assertStringIncludes(email.html, 'Travelist');
      assertStringIncludes(email.text, 'Travelist');
      assert(email.subject.length > 0);
    }
  }
});

Deno.test('the magic link email keeps both the link and the 6-digit code', () => {
  const email = renderEmail('magiclink', 'pt', { actionUrl: LINK, code: '654321' });
  assertStringIncludes(email.html, 'href="http://127.0.0.1:54321/auth/v1/verify?token=pkce_1&amp;');
  assertStringIncludes(email.html, '654321');
  assertStringIncludes(email.text, LINK);
  assertStringIncludes(email.text, '654321');
  assertStringIncludes(email.subject, 'Travelist');
});

Deno.test('the recovery email links to the reset page in the chosen language', () => {
  const pt = renderEmail('recovery', 'pt', { actionUrl: LINK });
  assertStringIncludes(pt.subject.toLowerCase(), 'palavra-passe');
  assertStringIncludes(pt.text, LINK);
  const en = renderEmail('recovery', 'en', { actionUrl: LINK });
  assertStringIncludes(en.subject.toLowerCase(), 'password');
});

Deno.test('interpolated values are escaped in the HTML part', () => {
  const email = renderEmail('welcome', 'en', { name: '<script>x</script>' });
  assertEquals(email.html.includes('<script>'), false);
  assertStringIncludes(email.html, '&lt;script&gt;');
  assertStringIncludes(email.text, '<script>x</script>');
});

Deno.test('the welcome email greets by name and links to the app when known', () => {
  const email = renderEmail('welcome', 'pt', { name: 'Nina', appUrl: 'https://travelist.app' });
  assertStringIncludes(email.html, 'Nina');
  assertStringIncludes(email.html, 'href="https://travelist.app"');
  const anonymous = renderEmail('welcome', 'en', {});
  assertEquals(anonymous.html.includes('href='), false);
});
