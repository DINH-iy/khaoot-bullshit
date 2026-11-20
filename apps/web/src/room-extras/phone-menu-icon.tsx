import { PHONE_MENU_DEFAULTS, type PhoneMenuAction, type PhoneMenuIcons } from '@party/contracts';
import { Icon } from '../presentation/line-icons.js';

export function PhoneMenuIcon({ action, icons, muted = false, breakMark }: {
  action: PhoneMenuAction; icons?: PhoneMenuIcons | undefined; muted?: boolean; breakMark?: string | undefined;
}) {
  const override = icons?.[action];
  const name = override ?? (action === 'sound' && muted ? 'muted' : PHONE_MENU_DEFAULTS[action]);
  return <span className="phone-menu-icon" aria-hidden="true" data-menu-icon={name}>
    {action === 'break' && breakMark && !override ? breakMark : <Icon name={name} size={22} />}
  </span>;
}
