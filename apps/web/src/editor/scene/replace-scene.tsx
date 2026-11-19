import { useEffect, useRef, useState } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { ScenePalette, type SceneChoice } from '../controls/scene-palette.js';
import { addScene, isVotable, optionsOf, type Definition, type Node, type Stage } from '../model.js';

export const REPLACE_TEXTS = defineTexts('replaceScene', {
  action: 'Replace scene type', confirm: 'Replace scene',
  explanation: 'This resets the scene content and replaces its parts. You can undo this change.',
  votes: 'Change the source of the linked vote before replacing this scene.',
  routes: 'Keep at most one outgoing connection before changing this party choice.',
  back: 'Go back',
}, {
  nl: { action: 'Scènetype vervangen', confirm: 'Vervang scène', explanation: 'De inhoud en onderdelen worden vervangen. Je kunt dit ongedaan maken.', votes: 'Wijzig de bron van de gekoppelde stemming voordat je deze scène vervangt.', routes: 'Behoud maximaal één uitgaande verbinding voordat je deze keuze wijzigt.', back: 'Terug' },
  de: { action: 'Szenentyp ersetzen', confirm: 'Szene ersetzen', explanation: 'Inhalt und Teile werden ersetzt. Du kannst die Änderung rückgängig machen.', votes: 'Ändere vor dem Ersetzen die Quelle der verknüpften Abstimmung.', routes: 'Behalte höchstens eine ausgehende Verbindung, bevor du diese Auswahl änderst.', back: 'Zurück' },
  ro: { action: 'Înlocuiește tipul de scenă', confirm: 'Înlocuiește scena', explanation: 'Conținutul și părțile vor fi înlocuite. Poți anula această modificare.', votes: 'Schimbă sursa votului legat înainte de a înlocui scena.', routes: 'Păstrează cel mult o legătură de ieșire înainte de a schimba această alegere.', back: 'Înapoi' },
});

export function replaceScene(definition: Definition, node: Node, choice: SceneChoice): Definition | 'votes' | 'routes' {
  const outgoing = definition.edges.filter(edge => edge.from === node.key);
  if (outgoing.length > 1) return 'routes';
  const added = addScene(definition, choice.type, choice.variant);
  const template = added.definition.nodes.at(-1)!;
  const stage: Stage = { ...template.stages[0]!, key: node.stages[0]!.key };

  const referenced = definition.nodes.some(other => other.key !== node.key && other.stages.some(part => {
    const source = part['source'] as { nodeKey?: string; stageKey?: string } | undefined;
    return part.kind === 'vote' && source?.nodeKey === node.key && (source.stageKey !== stage.key || !isVotable(stage));
  }));
  if (referenced) return 'votes';
  // Never seed a vote from the answers it is itself replacing.
  const safeStage = stage.kind === 'vote' && (stage['source'] as { nodeKey?: string } | undefined)?.nodeKey === node.key
    ? { ...stage, source: { nodeKey: 'choose', stageKey: 'main' } } : stage;
  const option = optionsOf({ ...template, stages: [safeStage] })[0]?.key;
  return {
    ...added.definition,
    nodes: definition.nodes.map(candidate => candidate.key === node.key ? { ...candidate, stages: [safeStage] } : candidate),
    edges: definition.edges.map(edge => {
      if (edge.from !== node.key) return edge;
      const { option: _old, ...connection } = edge;
      return option ? { ...connection, option } : connection;
    }),
  };
}

export function ReplaceSceneDialog({ definition, node, onChange, onClose }: {
  definition: Definition; node: Node; onChange: (next: Definition) => void; onClose: () => void;
}) {
  const t = useTexts(REPLACE_TEXTS);
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<SceneChoice>();
  const next = choice && replaceScene(definition, node, choice);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="ed-dialog replace-scene-dialog" aria-label={t('action')} onCancel={event => { event.preventDefault(); onClose(); }}>
    {!choice ? <ScenePalette label={t('action')} inline onPick={setChoice} onCancel={onClose} /> : <>
      <h2>{t('action')}</h2>
      <p role={typeof next === 'string' ? 'alert' : undefined}>{t(typeof next === 'string' ? next : 'explanation')}</p>
      <div className="actions">
        <button type="button" autoFocus onClick={() => setChoice(undefined)}>{t('back')}</button>
        {next && typeof next !== 'string' && <button type="button" className="danger" onClick={() => { onChange(next); onClose(); }}>{t('confirm')}</button>}
      </div>
    </>}
  </dialog>;
}
