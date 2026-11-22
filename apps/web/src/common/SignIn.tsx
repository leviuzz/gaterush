import { t } from '@gateflow/i18n';
import type { Locale, MessageKey } from '@gateflow/i18n';
import type { StaffMemberResponse } from '@gateflow/contracts';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { api } from '../api';

/*
 * Staff sign in (S15): the session goes in a cookie the page cannot read. The lane station and the
 * supervisor's console (S17) share the form.
 */

type Member = StaffMemberResponse['member'];

export function SignIn({
  locale,
  prefix,
  onSignedIn,
}: {
  readonly locale: Locale;
  /** The prefix of the form's ids: `lane`, `supervisor`. */
  readonly prefix: string;
  readonly onSignedIn: (member: Member) => void;
}) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setBusy(true);
    const answer = await api<StaffMemberResponse>('/v1/auth/sign-in', {
      method: 'POST',
      body: { login: login.trim(), password },
      session: true,
    });
    setBusy(false);
    setPassword('');
    if (answer.ok) onSignedIn(answer.body.member);
    else
      setError(
        answer.status === 429
          ? 'lane.signIn.wait'
          : answer.status === 401
            ? 'lane.signIn.failed'
            : 'lane.error',
      );
  };
  return (
    <section className="card sign-in" id={`${prefix}-sign-in`}>
      <h1>{t(locale, 'lane.signIn.title')}</h1>
      <form onSubmit={(e) => void submit(e)}>
        <label htmlFor={`${prefix}-login`}>{t(locale, 'lane.signIn.login')}</label>
        <input
          id={`${prefix}-login`}
          value={login}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setLogin(e.target.value);
          }}
          required
        />
        <label htmlFor={`${prefix}-password`}>{t(locale, 'lane.signIn.password')}</label>
        <input
          id={`${prefix}-password`}
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          required
        />
        {error === null ? null : (
          <p className="form-error" role="alert" id={`${prefix}-sign-in-error`}>
            {t(locale, error)}
          </p>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={busy}
          id={`${prefix}-sign-in-submit`}
        >
          {t(locale, 'lane.signIn.submit')}
        </button>
      </form>
    </section>
  );
}
