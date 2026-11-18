import { ArcadeHome } from './arcade-home.js';
import { ArcadeLobby } from './arcade-lobby.js';
import './arcade.css';

/** `/?arcade`: the arcade's front page; `/?arcade=<lobby>`: one lobby (also what an invite link opens). */
export function ArcadePage({ lobbyId }: { lobbyId: string | null }) {
  return lobbyId && /^[0-9a-f-]{36}$/i.test(lobbyId) ? <ArcadeLobby lobbyId={lobbyId.toLowerCase()} /> : <ArcadeHome />;
}
