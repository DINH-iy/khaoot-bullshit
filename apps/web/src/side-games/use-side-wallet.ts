import { useLayoutEffect, useRef, useState } from 'react';
import { WalletSchema, type Wallet } from '@party/contracts';
import { sideApi, sideProblem } from './side-api.js';

/** Start preparing the wallet when the phone menu opens. A new visit reads the latest hand and balance. */
export function useSideWallet(sessionId: string, selfId: string | null, enabled: boolean, withChips: boolean) {
  const [result, setResult] = useState<{ request: number; wallet?: Wallet; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  useLayoutEffect(() => {
    setResult(undefined);
    if (!enabled || !selfId) return;
    const version = ++request.current;
    void sideApi(sessionId, '').then(data => {
      if (request.current === version) setResult({ request: version, wallet: WalletSchema.parse(data) });
    }).catch(cause => {
      if (request.current === version) setResult({ request: version, error: sideProblem(cause) });
    });
    return () => { request.current++; };
  }, [sessionId, selfId, enabled, withChips, attempt]);
  const update = (change: (wallet: Wallet) => Wallet) => setResult(current =>
    current?.wallet && current.request === result?.request ? { ...current, wallet: change(current.wallet) } : current);
  return { ...result, update, retry: () => setAttempt(value => value + 1) };
}
