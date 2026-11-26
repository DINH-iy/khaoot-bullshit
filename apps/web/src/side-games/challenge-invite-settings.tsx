import { BRICK_MAPS, BRICK_PRESETS, DEFAULT_POOL_FELT, DEFAULT_POOL_SHOT_SECONDS, DEFAULT_POOL_START, type Challenge } from '@party/contracts';
import { CREATURE_TEXTS } from '../head-to-head/creature-board.js';
import { POOL_BEHAVIOR_TEXTS } from '../head-to-head/eight-ball/behavior-fields.js';
import { POOL_FELT_TEXTS } from '../head-to-head/eight-ball/felt-fields.js';
import { HOSTED_POOL_TEXTS } from '../head-to-head/eight-ball/hosted.text.js';
import { POOL_START_TEXTS } from '../head-to-head/eight-ball/start-fields.js';
import { useTexts } from '../i18n/texts.js';
import { BRICK_TEXTS } from '../minigames/brick-rally/brick-rally.text.js';
import { st } from './side-api.js';

export function InviteSettings({ challenge }: { challenge: Challenge }) {
  const creature = useTexts(CREATURE_TEXTS);
  const brick = useTexts(BRICK_TEXTS);
  const pool = useTexts(HOSTED_POOL_TEXTS);
  const felt = useTexts(POOL_FELT_TEXTS);
  const start = useTexts(POOL_START_TEXTS);
  const behavior = useTexts(POOL_BEHAVIOR_TEXTS);

  if (challenge.game === 'brick-rally') {
    const { map } = challenge.view;
    const preset = BRICK_PRESETS.find(key => BRICK_MAPS[key].length === map.length
      && BRICK_MAPS[key].every((row, index) => row === map[index]));
    return <SettingsRows rows={[[brick('map'), brick(preset ?? 'custom')]]} />;
  }

  const { board } = challenge.view;
  switch (board.game) {
    case 'rps':
      return <SettingsRows rows={[[st('firstTo'), st(board.firstTo === 1 ? 'win' : 'wins', { count: board.firstTo })]]} />;
    case 'creature-duel':
      return <SettingsRows rows={[[creature('teamSize'), creature(board.teams[0].length === 3 ? 'team' : 'solo')]]} />;
    case 'eight-ball': {
      const settings = challenge.poolSettings;
      const opening = settings?.start ?? board.start ?? DEFAULT_POOL_START;
      const physics = settings?.ballBehavior ?? board.ballBehavior ?? { preset: 'arcade' };
      const seconds = settings ? settings.shotSeconds ?? DEFAULT_POOL_SHOT_SECONDS : board.shotClock?.seconds ?? 0;
      const rows: [string, string][] = [
        [felt('felt'), felt(settings?.felt ?? board.felt ?? DEFAULT_POOL_FELT)],
        [pool('shotClock'), seconds ? pool('shotSeconds', { seconds }) : pool('shotOff')],
        [start('side'), start(opening.side)],
        [start('lineShort'), `${opening.percent}%`],
        [behavior('behavior'), behavior(physics.preset)],
      ];
      if (physics.preset === 'custom') rows.push(
        [behavior('rollingResistance'), String(physics.rollingResistance)],
        [behavior('railBounce'), String(physics.railBounce)],
        [behavior('stopSpeed'), String(physics.stopSpeed)],
      );
      return <SettingsRows rows={rows} />;
    }
    default:
      return null;
  }
}

function SettingsRows({ rows }: { rows: [string, string][] }) {
  return <dl className="challenge-invite-settings" aria-label={st('gameSettings')}>
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}
