// The trees Twinline draws. No $ here: register.tsx passes the surface's
// element table ($.ui.resolve(e)) and what the engine drew (await next(...)).

import type { Elements, RenderElement, RenderNode, RenderSurface } from 'claude-code'
import type { ReplyTranslation, SessionConfig } from '../../types'
import { bandLabel } from './config'

export type Els = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Markdown' | 'Button'>

export const EN_TAG = 'EN · '
export const PENDING_TEXT = '⇄ translating…'

/** The engine's row (already showing the original) with the English under it, dim. */
export function composeUser(els: Els, theirs: RenderNode, english: string): RenderElement {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      {theirs}
      <Text dimColor wrap="wrap">{EN_TAG + english}</Text>
    </Box>
  )
}

/** The engine's reply block with its translation (done) or a dim pending line under it. */
export function composeAssistant(els: Els, theirs: RenderElement, t: ReplyTranslation): RenderElement {
  const { Box, Text, Markdown } = els
  if (t.status === 'failed') return theirs
  return (
    <Box flexDirection="column">
      {theirs}
      {t.status === 'done'
        ? <Box borderStyle="quote"><Markdown text={t.text} /></Box>
        : <Text dimColor>{PENDING_TEXT}</Text>}
    </Box>
  )
}

export type Toggle = 'all' | 'input' | 'output'

/** At or under this many columns the band keeps only its name and the switch. */
export const NARROW_COLUMNS = 40

/** The band above the prompt; other plugins' bands (theirs) stay under it. */
export function composeBand(els: Els, theirs: RenderElement, s: SessionConfig, bodyColumns: number, onToggle: (which: Toggle) => void): RenderElement {
  const { Box, Text, Button } = els
  const toggle = <Button key="tl-toggle" label={s.enabled ? 'Off' : 'On'} hotkey="t" plain onPress={() => onToggle('all')} />
  const row = !s.enabled
    ? <Box flexDirection="row" columnGap={1}><Text dimColor>{bodyColumns <= NARROW_COLUMNS ? 'TL OFF' : bandLabel(s)}</Text>{toggle}</Box>
    : bodyColumns <= NARROW_COLUMNS
      ? <Box flexDirection="row" columnGap={1}><Text>TL ON</Text>{toggle}</Box>
      : (
        <Box flexDirection="row" columnGap={1}>
          <Text>{bandLabel(s)}</Text>
          {toggle}
          <Button key="tl-input" label={s.input ? 'in ✓' : 'in ✗'} dimColor={!s.input} hotkey="i" plain onPress={() => onToggle('input')} />
          <Button key="tl-output" label={s.output ? 'out ✓' : 'out ✗'} dimColor={!s.output} hotkey="o" plain onPress={() => onToggle('output')} />
        </Box>
      )
  return <Box flexDirection="column">{row}{theirs}</Box>
}
