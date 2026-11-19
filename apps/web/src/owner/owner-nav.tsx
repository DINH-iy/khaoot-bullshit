import { useEffect, useId, useRef, useState } from 'react';
import { HostMenuSchema } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { rememberOwner } from './owner-session.js';
import { openFeedback } from '../feedback/open-feedback.js';
import { FEEDBACK_UI } from '../feedback/describe-element.js';
import { FaIcon, type IconName } from '../presentation/icons.js';
import { useTexts, type Translate } from '../i18n/texts.js';
import { LanguagePicker } from '../i18n/language-picker.js';
import { OWNER_TEXTS } from './owner.text.js';
import './owner-nav.css';

export type OwnerSection = 'play' | 'host' | 'editor' | 'admin' | 'people' | 'packs' | 'look';
/** Who is working here: the owner, a person with editor rights, or nobody (null). */
export type HostRole = 'owner' | 'editor';
type Text = Parameters<Translate<keyof typeof OWNER_TEXTS.en>>[0];
type Link = { key: OwnerSection; label: Text; href: string; icon: IconName };
// The main places, for everyone allowed (editors: Play and Editor). The editor opens per game, so "Editor" leads
// to the list of games on the host menu.
const MAIN: (Link & { editor: boolean })[] = [
  { key: 'play', label: 'play', href: '/', icon: 'play', editor: true },
  { key: 'host', label: 'host', href: '/?host=1', icon: 'tv', editor: false },
  { key: 'editor', label: 'editor', href: '/?host=1#my-games', icon: 'diamond', editor: true },
];
// The owner's own pages, in the menu on the right.
const OWNER: Link[] = [
  { key: 'admin', label: 'feedbackReports', href: '/?admin', icon: 'flag' },
  { key: 'people', label: 'people', href: '/?admin=people', icon: 'users' },
  { key: 'packs', label: 'packs', href: '/?admin=packs', icon: 'star' },
  { key: 'look', label: 'joinScreen', href: '/?admin=look', icon: 'circle-info' },
];

/** Asks the host endpoint once who this browser is. Never used on the player screen. */
export function useHostRole() {
  const [role, setRole] = useState<HostRole | null>(null);
  useEffect(() => {
    let mounted = true;
    roomApi('/api/host').then(data => {
      const found = HostMenuSchema.shape.role.parse((data as { role?: unknown }).role);
      rememberOwner(found === 'owner'); if (mounted) setRole(found);
    }, (cause: unknown) => {
      // Only a definite "not signed in" forgets the hint; a network hiccup says nothing.
      if (cause instanceof Error && cause.message === 'UNAUTHORIZED') rememberOwner(false);
    });
    return () => { mounted = false; };
  }, []);
  return role;
}

/** A small menu that closes on Escape, a click outside or picking an item. */
function useMenu() {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (box.current?.contains(document.activeElement)) box.current.querySelector('button')?.focus();
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); };
  }, [open]);
  return { open, setOpen, box };
}
const menuLink = (link: Link, current: OwnerSection, t: Translate<keyof typeof OWNER_TEXTS.en>) => <li key={link.key}><a role="menuitem" href={link.href} aria-current={link.key === current ? 'page' : undefined}><FaIcon name={link.icon} />{t(link.label)}</a></li>;

/**
 * The header of the host menu and the admin pages (as most sites do it): the logo and the main places (Play, Host,
 * Editor) on the left for everyone allowed; Feedback and, for the owner, a menu with the owner's own pages on the
 * right. Nothing for anyone else. The editor has its own header with the same links behind its logo (AppMenu).
 */
export function OwnerNav({ current, role }: { current: OwnerSection; role: HostRole | null }) {
  const menu = useMenu(); const t = useTexts(OWNER_TEXTS);
  if (!role) return null;
  const ownerPage = OWNER.find(link => link.key === current);
  return <header className="app-header">
    <a className="app-brand" href="/" aria-label={t('brand')}>party<span>.</span></a>
    <nav className="app-main" aria-label={t('main')}><ul>{MAIN.filter(link => role === 'owner' || link.editor).map(link =>
      <li key={link.key}><a href={link.href} aria-current={link.key === current ? 'page' : undefined}>{t(link.label)}</a></li>)}</ul></nav>
    <div className="app-end">
      <LanguagePicker label={t('language')} />
      <button type="button" className="app-feedback" {...{ [FEEDBACK_UI]: '' }} onClick={openFeedback}><FaIcon name="flag" /><span>{t('feedback')}</span></button>
      {role === 'owner' && <div className="app-owner" ref={menu.box}>
        <button type="button" className={`app-owner-button${ownerPage ? ' here' : ''}`} aria-haspopup="menu" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)}>
          <span className="app-avatar" aria-hidden="true"><FaIcon name="star" /></span><span>{ownerPage ? t(ownerPage.label) : t('owner')}</span><span className="app-caret" aria-hidden="true">▾</span></button>
        {menu.open && <ul className="app-menu" role="menu" aria-label={t('owner')}>{OWNER.map(link => menuLink(link, current, t))}</ul>}
      </div>}
    </div>
  </header>;
}

/** In the editor's own header: its "p." logo opens the same places (and, for the owner, the owner's pages). */
export function AppMenu({ role, current = 'editor' }: { role: HostRole | null; current?: OwnerSection }) {
  const menu = useMenu(); const t = useTexts(OWNER_TEXTS); const id = useId();
  const links = (items: Link[]) => <ul className="app-navigation-links">{items.map(link =>
    <li key={link.key}><a href={link.href} aria-current={link.key === current ? 'page' : undefined} onClick={() => menu.setOpen(false)}>
      <FaIcon name={link.icon} /><span>{t(link.label)}</span>{link.key === current && <FaIcon className="app-current-mark" name="check" />}
    </a></li>)}</ul>;
  return <div className="app-logo-menu" ref={menu.box}>
    <button type="button" className="editor-logo app-logo-button" aria-label={`p. ${t('logoMenu')}`} aria-expanded={menu.open} aria-controls={menu.open ? id : undefined}
      onClick={() => menu.setOpen(!menu.open)}>
      <span className="app-logo-mark" aria-hidden="true">p.</span><FaIcon className="app-logo-caret" name="chevron-down" />
    </button>
    {menu.open && <nav id={id} className="app-menu app-navigation" aria-labelledby={`${id}-heading`}>
      <p className="app-navigation-heading" id={`${id}-heading`}>{t('goTo')}</p>
      {links(MAIN.filter(link => role === 'owner' || link.editor))}
      {role === 'owner' && <><p className="app-navigation-heading owner-heading">{t('owner')}</p>{links(OWNER)}</>}
      <div className="app-menu-language"><span aria-hidden="true">{t('language')}</span><LanguagePicker label={t('language')} /></div>
    </nav>}
  </div>;
}
