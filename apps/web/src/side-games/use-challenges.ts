import { useCallback, useEffect, useRef, useState } from 'react';
import { ChallengeListSchema, type Challenge } from '@party/contracts';
import { sideApi, sideProblem, st } from './side-api.js';

const problems = { ALREADY_SUBMITTED: 'cAlready', INVALID_STATE: 'cChanged', INVALID_SUBMISSION: 'cNotAllowed', NOT_FOUND: 'cGone' } as const;
export function challengeProblem(cause: unknown) {
  const key = problems[(cause instanceof Error ? cause.message : '') as keyof typeof problems];
  return key ? st(key) : sideProblem(cause);
}

/** One challenge list powers the alert and the sheet. Room updates refresh it even while the sheet is closed. */
export function useChallenges(sessionId: string, selfId: string | null, enabled: boolean, withChips: boolean, tick: number) {
  const [data, setData] = useState<ReturnType<typeof ChallengeListSchema.parse>>();
  const [error, setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled || !selfId) return;
    const version = ++request.current;
    try {
      const next = ChallengeListSchema.parse(await sideApi(sessionId, '/challenges'));
      if (request.current === version) {
        setData(next);
        setError('');
      }
    } catch (cause) {
      if (request.current === version) setError(challengeProblem(cause));
    }
  }, [sessionId, selfId, enabled]);
  useEffect(() => {
    setData(undefined);
    setError('');
  }, [refresh]);
  useEffect(() => {
    void refresh();
    return () => { request.current++; };
  }, [refresh, tick, withChips]);
  const update = (challenge: Challenge) => {
    setData(current => current && { ...current, challenges: [challenge, ...current.challenges.filter(entry => entry.id !== challenge.id)] });
  };
  return { data, error, refresh, update };
}
