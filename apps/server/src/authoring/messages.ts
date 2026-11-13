// Plain-language problem messages for game authors. `code` keeps the
// validator's exact rule so tools and tests can rely on it.
const RULES: Record<string, string> = {
  'Unreachable node': 'Nothing leads to this scene. Connect a scene to it, or delete it.',
  'Unconnected route option': 'A route option is not connected to a scene yet.',
  'Unknown route option': 'A connection belongs to a route option that no longer exists.',
  'Duplicate route option': 'A route option has more than one connection.',
  'Route options must lead to different scenes': 'Two route options lead to the same scene. Give each option its own scene.',
  'Route choice must be its own node': 'A party choice must be a scene on its own.',
  'Only route choices branch': 'Only a party choice can lead to more than one scene.',
  'Branching requires a later definition format': 'This game uses an older format. Add a party choice to switch it to branching.',
  'Route choices require format 2': 'This game uses an older format without party choices.',
  'Cycle or invalid route': 'The connections go round in a circle. A game must always move forward.',
  'Self connection': 'A scene is connected to itself.',
  'Duplicate connection': 'Two connections join the same two scenes.',
  'Invalid default route': 'The default route is missing, not one of the options, or not needed.',
  'Host route choice has no timer': 'When the host decides the route, the choice cannot have a timer.',
  'Invalid vote source': 'This vote needs a writing or upload round, without points, that comes before it on every route.',
  'Vote source may never be revealed': 'On some routes these answers are never voted on, so they would never be shown with names.',
  'Game teams are used before they are defined': 'This round uses the game’s teams, but on some route no teams have been made yet.',
  'Captain vote needs teams earlier on every path': 'A captain vote needs teams to be made earlier on every route.',
  'Missing start node': 'Choose the scene the game starts with.',
  'Missing edge endpoint': 'A connection points to a scene that no longer exists.',
  'Duplicate node key': 'Two scenes have the same name.',
  'Duplicate stage key': 'Two parts of this scene have the same name.',
  'Duplicate edge key': 'Two connections have the same name.',
  'Invalid correct choice': 'The correct answer is not one of the options.',
  'Invalid correct order': 'The correct order must use every item exactly once.',
  'Too many stages': 'This game has too many rounds (at most 200).',
  'Too many route choices': 'This game has too many party choices (at most 20).',
  'Too many connections': 'This game has too many connections.',
  'Route options must be unique': 'Two route options have the same name.',
  'Give every team a unique name': 'Every team needs its own name.',
  'Choice keys must be unique': 'Two answer options have the same name.',
  'Item keys must be unique': 'Two items have the same name.',
  'At most one team takes the rest': 'Only one team can take “the rest” of the players.',
  'Choose a minigame': 'Choose which minigame is played here. The game can be published once every minigame scene has one.',
  'This scene spins a wheel that does not exist': 'This scene spins a wheel that was removed. Choose another wheel or switch the wheel off for this scene.',
  'Duplicate wheel': 'Two wheels have the same name. Rename one.', 'Wheel entries must be unique': 'A wheel has the same entry twice.',
  'This minigame needs teams': 'Pass the pencil is played in teams. Set this round (or the game) to play in teams.',
  'Minigame settings are not valid': 'The minigame settings do not fit together. Check the times and points.',
};
const FIELDS: Record<string, string> = {
  prompt: 'The text is empty or too long.', title: 'The title is empty or too long.', label: 'An option name is empty or too long.',
  options: 'This needs a different number of options.', items: 'This needs a different number of items.', durationMs: 'The timer must be between 1 second and 1 hour.',
  key: 'A name is missing or uses characters that are not allowed.', startNodeKey: 'Choose the scene the game starts with.',
  awardMilli: 'The points are not a valid number.', maxAwardMilli: 'The points are not a valid number.', awardPerVoteMilli: 'The points are not a valid number.',
  game: 'Choose which minigame this is.', stages: 'A scene needs at least one part.', nodes: 'A game needs at least one scene.', edges: 'There are too many connections.',
};
export function friendlyMessage(code: string, path: string[]): string {
  if (RULES[code]) return RULES[code];
  const field = [...path].reverse().find(part => !/^\d+$/.test(part));
  return (field && FIELDS[field]) ?? 'Something in this scene is not filled in correctly.';
}
