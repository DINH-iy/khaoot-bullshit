# Product style

Visual standards for player phones, the host, the shared display, the editor, and their previews.

## Visual direction

Put one strong visual at the center of each round. A chart, board, gesture surface, or illustration should carry the state at a glance. Use a quiet background, a consistent type scale, and an accent for the current action or outcome. GuessDash is the reference for clarity, restraint, and the way a game has a recognizable visual idea. Match that level of clarity with our own layout, graphics, and identity. [GuessDash](https://guessdash.com/) · [Extraplot](https://guessdash.com/extraplot)

Keep the editor neutral and use the active game's theme in play. Theme choices can change colors and typography within the same layout budget. Keep touch targets, safe areas, and critical controls consistent. [Editor visual references](README.md)

## Layout and space

- Center the game area, the main graphic, the action group, and short state messages. Keep equal gutters on both sides. Align labels within forms and table cells so values are easy to scan.
- Start with **12–16 px** outer phone padding, **8–12 px** between related elements, and **16–24 px** between groups at default text size. Separate neighboring boxes and account for borders, outlines, and focus rings. Prefer a single main surface with breathing room.
- The entire active round fits in the visible area. The player can see the prompt, play surface, current state, and submit or restart action together. The shared screen fits its whole board and primary result above the fold. Host tools and editor popup actions stay inside their window.
- Budget for browser bars, the keyboard, safe areas, the room controls, and the editor dock. Size the main visual against the **remaining height and width**. Keep a drawing canvas square and a chart or board in its intended proportions as it shrinks.
- When space is tight, shorten copy, collapse decorative chrome, reduce padding to the small spacing step, and move supplementary content behind an explicit control. Then resize the visual. Keep primary buttons reachable at the new size. Keep keyboard focus visible and preserve browser text zoom.
- Use categories for finding a game. Paginate a category or a long results list when all items cannot fit. Keep Previous, Next, and the current page reachable and keyboard operable. Art and controls stay within the visible page. Page height depends on the actual layout and text size. The editor canvas may pan, and dedicated help or reference content may scroll within its own view. [GOV.UK pagination](https://design-system.service.gov.uk/components/pagination/) · [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

## Text and results

- **Underlined UI text is forbidden.** This includes links, button labels, headings, and text on hover or focus. Make inline links recognizable with a contrasting color and a non-color cue such as a link icon. Use a button with a clear label for standalone navigation such as **Back to host menu**. Keep a visible focus outline for keyboard users.

| Element | Default phone sizing and limits |
| --- | --- |
| Round question or title | 18–24 px at default text size. Aim for one line, with room for two. |
| Instruction | One short sentence, typically 15–16 px. Put scoring rules and examples behind the info button. |
| Button label | Usually one to three words, typically 15–16 px. Use the action name, such as **Lock in**. |
| Status or secondary label | 14–16 px. Use a short phrase such as **Paused**, **Saved**, or **Time up**. |
| Highlighted metric | Up to 32 px for a single short value. Keep the number and unit together. Put its explanation on a separate short label at normal size. |

These are visual bounds at default zoom. Relative font units support larger text settings. Words and value–unit pairs stay intact, and headings and scores leave room for controls. Use tabular numerals for values that change. [MDN clamp and text sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp)

Show the personal outcome once on phones. Give the TV or host one compact group result, with rank, name, measurement, and points combined where practical. Keep public results paged when the full list cannot fit. Show the most useful outcome first. Use a bounded icon and a short action for waiting, timeout, and error states. Save detail for the info button or a secondary view.

## Icons, buttons, and gestures

- Use a recognizable icon, diagram, or original illustration when it communicates faster than a sentence. Use one icon family and consistent weight for controls. Use a fixed, centered square for game badges. Keep longer game names in their own text column. Decorative icons are hidden from assistive technology.
- Pair an unfamiliar symbol with a short label. Every interactive icon needs an accessible name and a visible focus indicator. Use shape, a checkmark, or a short label alongside color for selection and game cues.
- **Browser-default disclosure triangles are forbidden.** Use a labeled control with an explicit open and closed state, a styled indicator, and a visible keyboard focus ring.
- Keep one primary action per state. Align related controls and make destructive actions distinct, with a confirmation that explains the effect. **Remove and delete buttons are always outlined in red**: red border and red icon or label on the normal background, with a light red tint on hover. This includes icon-only trash buttons. The final confirm button in a confirmation dialog is solid red. In the editor, use `danger-icon` for icon buttons and `danger-outline` for buttons with a label. Provide **44 × 44 CSS px** touch targets as the project default, with at least 8 px of separation between neighboring actions. The visual icon may be smaller. Text and controls have sufficient contrast in light and dark themes. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- Prefer native range inputs for sliders and style the visible rail, thumb, and focus ring. Keep a full-height touch target around the smaller rail. Sliders support touch, dragging, arrow keys, and Home and End. In **Cut the Line**, always show the left endpoint as **0%** and the right as **100%**. Keep the target percent near the rail. Keep the internal scale and current percent out of the visual layout while guessing and preserve accessible range feedback. Show the target and cut at reveal. [MDN range input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/range) · [W3C slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- For sliders where the exact value is useful, show it in a badge and offer one-step **− / +** controls. Limit tick labels to the ones that fit at the current width. In results, spell out units when an abbreviation would be unclear. Show **percentage points** for the distance between two percentages.

## Motion

Use motion for a game cue, direct feedback, or a reveal. Keep small responses around 120–200 ms and ordinary transitions around 200–300 ms. A graph reveal or coin toss can take longer when the result is the focus. Keep the surface and controls in place throughout, and keep the game state correct if playback is skipped or interrupted. Respect `prefers-reduced-motion` with instant or lower-motion feedback. Give the host playback controls for reveals they need to show again. [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)

## CSS starting point

Use shared tokens and room/editor patterns. The measurements below illustrate how to give the focal visual the remaining space. Scope a fullscreen shell to the active surface. Inside an existing host, editor, or bench layout, use the parent’s allocated height.

```css
.round-shell {
  --round-gap: .75rem;
  box-sizing: border-box;
  block-size: 100dvh;
  min-block-size: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: var(--round-gap);
  padding: calc(var(--round-gap) + env(safe-area-inset-top))
    calc(var(--round-gap) + env(safe-area-inset-right))
    calc(var(--round-gap) + env(safe-area-inset-bottom))
    calc(var(--round-gap) + env(safe-area-inset-left));
}

.round-play-area {
  min-inline-size: 0;
  min-block-size: 0;
  container-type: size;
  display: grid;
  place-items: center;
}

.round-board {
  inline-size: min(100cqi, calc(100cqb * var(--board-ratio, 1)));
  aspect-ratio: var(--board-ratio, 1);
}

.round-title {
  margin: 0;
  font-size: clamp(1.125rem, 1rem + 1cqi, 1.5rem);
  line-height: 1.2;
  text-wrap: balance;
}

.round-action {
  min-inline-size: 44px;
  min-block-size: 44px;
}

.round-value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
```

Use `minmax(0, 1fr)` and `min-inline-size: 0` in nested grids so content can shrink. Use a scoped height/container query to switch to compact spacing and smaller illustrations. Allocate a permanent row for primary actions and the pager. Use `object-fit: contain` for media. Content and visible keyboard focus stay within the bounds of the surface. [MDN viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length) · [MDN container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)

## Phone previews (required)

Every phone preview must provide a visible **Phone model** picker whenever a phone is shown. Use the shared phone models and picker in `apps/web/src/ui/phone-devices.tsx` so the choice follows the user across the editor, preview dialogs, Look & feel, and Test Bench.

Use the chosen model’s exact logical screen dimensions and aspect ratio at every viewport size. Use the native CSS screen size when space allows and scale the entire viewport uniformly when space is tight. Keep the frame and its safe areas. A narrow or short window still shows the selected phone in its correct proportions. The picker stays outside the scaled screen.

## Reference viewport sizes

| Surface | CSS viewport sizes |
| --- | --- |
| Phone | 320 × 568, 360 × 640, and 390 × 844. Landscape reference of 667 × 375. |
| Host and editor | Compact desktop reference of 1024 × 600. Embedded panels use their allocated width and height. |
| Shared screen | 1280 × 720 and 1920 × 1080. Editor and Test Bench frames can allocate less space. |
