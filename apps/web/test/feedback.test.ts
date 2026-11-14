import { describe, expect, it } from 'vitest';
import type { FeedbackItem } from '@party/contracts';
import { tagSource } from '../tooling/source-tags.js';
import { safePage } from '../src/feedback/describe-element.js';
import { feedbackText } from '../src/admin/feedback-text.js';

describe('source tags for pointed-at elements', () => {
  it('tags plain elements with component, file and line, and leaves components and generics alone', () => {
    const code = [
      'export function Card({ items }: { items: Array<string> }) {',
      '  const [count] = useState<number>(0);',
      '  return <section className="card">',
      '    <Child value={count} />',
      '    <svg.g />',
      '    <input data-src="kept" /><br/>',
      '  </section>;',
      '}',
      'const Small = () => <p>hi</p>;',
      'const helper = () => <b />;',
    ].join('\n');
    const tagged = tagSource(code, 'cards/card.tsx');
    expect(tagged).toContain('<section data-src="Card@cards/card.tsx:3" className="card">');
    expect(tagged).toContain('<br data-src="Card@cards/card.tsx:6"/>');
    expect(tagged).toContain('<p data-src="Small@cards/card.tsx:9">');
    expect(tagged).toContain('<b data-src="cards/card.tsx:10" />');
    expect(tagged).toContain('<Child value={count} />');
    expect(tagged).toContain('<input data-src="kept" />');
    expect(tagged).toContain('Array<string>'); expect(tagged).toContain('useState<number>(0)');
    // Only text inside lines is added, so every line keeps its number.
    expect(tagged.split('\n')).toHaveLength(code.split('\n').length);
  });
});

describe('the page a report was made on', () => {
  it('never keeps the hash (owner or display keys) or unknown parameters', () => {
    expect(safePage('http://x.test/?host#owner=secretkey')).toBe('/?host');
    expect(safePage('http://x.test/?room=abc&display=1&token=zzz#access=k')).toBe('/?room=abc&display=1');
    expect(safePage('http://x.test/?edit=123&view=look')).toBe('/?edit=123&view=look');
    expect(safePage('http://x.test/')).toBe('/');
  });
});

describe('a report as text to hand on for fixing', () => {
  it('names the screen, the details and the files of the pointed-at elements', () => {
    const item: FeedbackItem = {
      id: '00000000-0000-4000-8000-000000000001', kind: 'bug', status: 'new', title: 'Start button does nothing', details: 'Pressed it twice.',
      reporterName: 'Sam', ownerNote: null, createdAt: '2026-11-13T20:15:00.000Z', updatedAt: '2026-11-13T20:15:00.000Z',
      context: { page: '/?room=abc', screen: 'host screen', viewport: { width: 390, height: 844 }, userAgent: 'Test', elements: [
        { source: 'RoomScreen@network/room-screen.tsx:150', sources: ['RoomScreen@network/room-screen.tsx:143'], selector: 'main.room > button', tag: 'button', text: 'Start', label: '' },
      ] },
    };
    const text = feedbackText(item);
    expect(text).toContain('## Bug: Start button does nothing (new)');
    expect(text).toContain('by Sam on the host screen (/?room=abc, 390×844)');
    expect(text).toContain('- "Start" <button> at RoomScreen in apps/web/src/network/room-screen.tsx:150');
    expect(text).toContain('inside: RoomScreen in apps/web/src/network/room-screen.tsx:143');
  });
});
