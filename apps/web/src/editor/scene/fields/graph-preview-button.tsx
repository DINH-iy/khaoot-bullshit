import { MINIGAMES, type GraphData } from '@party/contracts';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTexts } from '../../../i18n/texts.js';
import { GRAPH_TEXTS } from '../../../minigames/draw-the-graph/graph.text.js';
import { Icon } from '../../controls/icons.js';
import { uniqueKey, type Definition, type Node } from '../../model.js';
import { FIELDS_TEXTS } from '../fields.text.js';
import { ScenePreviewDialog } from '../scene-preview.js';

type GraphPreview = { definition: Definition; graph: GraphData; question?: string | undefined };

export function GraphPreviewDialog({ definition, graph, question, root, onClose }: GraphPreview & { root: Element; onClose: () => void }) {
  const graphText = useTexts(GRAPH_TEXTS);
  const node: Node = {
    key: uniqueKey('graph-preview', definition.nodes.map(node => node.key)),
    stages: [{
      key: 'main', kind: 'minigame', game: 'draw-the-graph', settings: { graph },
      prompt: question?.trim() || graphText('trendQuestion'),
      durationMs: MINIGAMES['draw-the-graph'].defaultSeconds * 1000,
    }],
  };
  return createPortal(<ScenePreviewDialog definition={{ ...definition, nodes: [...definition.nodes, node] }} node={node} index={0}
    initialDevice="phone" compactIntro onClose={onClose} />, root);
}

export function GraphPreviewButton(props: GraphPreview) {
  const t = useTexts(FIELDS_TEXTS);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const root = open ? trigger.current?.closest('.editor') : null;
  return <>
    <button ref={trigger} type="button" className="small-button with-icon graph-preview-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Icon name="eye" size={16} />{t('preview')}
    </button>
    {root && <GraphPreviewDialog {...props} root={root} onClose={() => setOpen(false)} />}
  </>;
}
