import { FaIcon, type IconName } from '../presentation/icons.js';

export function JoinOption({ icon, title, detail, expandable = false }: {
  icon: IconName; title: string; detail?: string; expandable?: boolean;
}) {
  return <>
    <span className="join-option-icon"><FaIcon name={icon} /></span>
    <span className="join-option-text">{title}{detail && <small>{detail}</small>}</span>
    <FaIcon className="join-option-arrow" name={expandable ? 'chevron-down' : 'arrow-right'} />
  </>;
}
