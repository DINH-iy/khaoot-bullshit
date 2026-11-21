import type { ReactNode } from 'react';

export type ResultFact = [label: string, reading: ReactNode];

export function ResultFacts({ facts }: { facts: ResultFact[] }) {
  return <dl className="mg-result-facts">{facts.map(([label, reading]) => <div key={label}>
    <dt>{label}</dt><dd>{reading}</dd>
  </div>)}</dl>;
}
