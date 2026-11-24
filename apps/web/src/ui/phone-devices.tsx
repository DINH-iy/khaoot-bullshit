import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Dropdown } from './dropdown.js';

/**
 * Popular phones, at their screen size in CSS pixels (what a web page lays out on), so a preview has the real shape
 * and, where there is room, the real width. `cutout`: the camera in the screen; `top`/`bottom`: the strips a page
 * should keep clear (status bar, home bar). Used by the editor's phone previews and the test bench's phones; the
 * choice is shared by both and remembered in this browser.
 */
export interface PhoneDevice { id: string; name: string; width: number; height: number; cutout: 'island' | 'notch' | 'punch' | 'none'; top: number; bottom: number }
export const PHONE_DEVICES: PhoneDevice[] = [
  { id: 'iphone-16', name: 'iPhone 16 / 15', width: 393, height: 852, cutout: 'island', top: 54, bottom: 34 },
  { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', width: 440, height: 956, cutout: 'island', top: 54, bottom: 34 },
  { id: 'iphone-13', name: 'iPhone 14 / 13', width: 390, height: 844, cutout: 'notch', top: 47, bottom: 34 },
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, cutout: 'none', top: 20, bottom: 0 },
  { id: 'galaxy-s24', name: 'Samsung Galaxy S24', width: 360, height: 780, cutout: 'punch', top: 28, bottom: 16 },
  { id: 'galaxy-s24-ultra', name: 'Samsung Galaxy S24 Ultra', width: 384, height: 832, cutout: 'punch', top: 28, bottom: 16 },
  { id: 'galaxy-a', name: 'Samsung Galaxy A15 / A25', width: 360, height: 800, cutout: 'punch', top: 28, bottom: 16 },
  { id: 'pixel-8', name: 'Google Pixel 8 / 9', width: 412, height: 915, cutout: 'punch', top: 28, bottom: 16 },
];
// The bench's size from before there was a choice (390 × 844), still one of the most common phones.
const DEFAULT = PHONE_DEVICES.find(device => device.id === 'iphone-13')!;
const KEY = 'party-phone-device'; const EVENT = 'party:phone-device';
const read = () => { try { return localStorage.getItem(KEY) ?? DEFAULT.id; } catch { return DEFAULT.id; } };
const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify); window.addEventListener('storage', notify);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', notify); };
};
export const phoneDevice = (id: string) => PHONE_DEVICES.find(device => device.id === id) ?? DEFAULT;
/** The chosen phone, and a way to choose another (every preview follows). */
export function usePhoneDevice(): [PhoneDevice, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, read, () => DEFAULT.id);
  const choose = (next: string) => { try { localStorage.setItem(KEY, next); } catch { /* this page only */ } window.dispatchEvent(new Event(EVENT)); };
  return [phoneDevice(id), choose];
}
/**
 * The device's size (unitless) and its safe strips as CSS variables. The strips are a share of the screen's width
 * (padding percentages are), so they shrink with the phone when it is shown smaller than real.
 */
export const phoneStyle = (device: PhoneDevice): CSSProperties => ({ '--phone-w': device.width, '--phone-h': device.height,
  '--phone-top': `${(device.top / device.width * 100).toFixed(2)}%`, '--phone-bottom': `${(device.bottom / device.width * 100).toFixed(2)}%` } as CSSProperties);
export function PhoneDevicePicker({ label, className }: { label: string; className?: string }) {
  const [device, choose] = usePhoneDevice();
  return <Dropdown className={`phone-device-picker${className ? ` ${className}` : ''}`} label={label} title={label} value={device.id} onChange={choose}
    options={PHONE_DEVICES.map(entry => ({ value: entry.id, label: entry.name }))} />;
}
/**
 * A phone preview: a caption with the model picker, and the chosen model's body (its proportions, camera cutout and
 * home bar) around `children`, the page. The page keeps clear of the status bar and home bar with
 * `var(--phone-top)` and `var(--phone-bottom)`.
 */
export function PhoneFrame({ caption, pickerLabel, picker = true, className, children }: { caption: string; pickerLabel: string; picker?: boolean; className?: string; children: ReactNode }) {
  const [device] = usePhoneDevice(); const body = useRef<HTMLDivElement>(null); const maxHeight = useFit(body);
  return <figure className={`phone${className ? ` ${className}` : ''}`} style={{ ...phoneStyle(device), ...(maxHeight ? { '--phone-max-h': `${maxHeight}px` } : {}) } as CSSProperties}>
    <figcaption><span>{caption}</span>{picker && <PhoneDevicePicker label={pickerLabel} />}</figcaption>
    <div ref={body} className="phone-device" data-cutout={device.cutout} title={device.name}>{children}</div>
  </figure>;
}

/**
 * How tall the phone may be so it never runs off the screen: from its top to the bottom of the window or of the
 * scrolling area it is in, and above the editor's floating tabs when they are over it. It is made smaller to fit,
 * never cut off (down to a phone that is still readable).
 */
function useFit(body: React.RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const element = body.current; if (!element) return;
    let frame = 0;
    const measure = () => {
      const box = element.getBoundingClientRect(); let bottom = window.innerHeight;
      const dialog = element.closest('dialog, [role=dialog]');
      if (dialog) {
        // A popup grows with the phone, so it is measured against the window: whatever is below the phone in the
        // popup (buttons, notes) stays on screen too.
        bottom -= 12 + Math.max(0, dialog.getBoundingClientRect().bottom - box.bottom);
      } else for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) { bottom = Math.min(bottom, parent.getBoundingClientRect().bottom); break; }
      }
      // The floating editor tabs sit over the bottom of the page (not over a popup, which is above them).
      const tabs = dialog ? null : document.querySelector('.editor-tabs')?.getBoundingClientRect();
      if (tabs && tabs.left < box.right && tabs.right > box.left && tabs.top < bottom) bottom = Math.min(bottom, tabs.top);
      const next = Math.max(260, Math.floor(bottom - box.top - 2 * 7 - 4));
      setHeight(current => current !== undefined && Math.abs(current - next) < 2 ? current : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule); observer.observe(document.documentElement); if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); };
  }, [body]);
  return height;
}
