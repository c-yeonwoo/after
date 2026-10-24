---
name: "After — Sunset Companion"
description: "따뜻한 코럴 행동과 라일락 비서 발화로 읽는 개인적인 만남 준비."
colors:
  primary: "oklch(0.58015 0.19245 31.57)"
  primary-hover: "oklch(0.52784 0.18076 31.3)"
  primary-strong: "oklch(0.51977 0.17762 31.17)"
  primary-foreground: "oklch(0.998 0.001 305)"
  selection: "oklch(0.35 0.085 310)"
  selection-foreground: "oklch(0.98482 0.01128 71.9)"
  assistant-surface: "oklch(0.944 0.025 305)"
  assistant-ink: "oklch(0.35 0.085 310)"
  background: "oklch(0.986 0.005 60)"
  foreground: "oklch(0.28 0.018 305)"
  card: "oklch(0.998 0.001 305)"
  muted: "oklch(0.957 0.012 305)"
  muted-foreground: "oklch(0.47 0.02 305)"
  border: "oklch(0.89 0.012 305)"
  input: "oklch(0.62 0.025 305)"
  bubble-mine: "oklch(0.946 0.029 45)"
  destructive: "oklch(0.493 0.1674 359)"
  destructive-foreground: "oklch(1 0 0)"
  success: "oklch(0.45766 0.08285 169.76)"
  warning: "oklch(0.508 0.089 80)"
  dark-primary: "oklch(0.76707 0.14186 38.38)"
  dark-primary-hover: "oklch(0.80044 0.11845 39.92)"
  dark-primary-strong: "oklch(0.81823 0.10615 40.04)"
  dark-primary-foreground: "oklch(0.215 0.018 305)"
  dark-selection: "oklch(0.87 0.06 305)"
  dark-selection-foreground: "oklch(0.28 0.05 305)"
  dark-assistant-surface: "oklch(0.32 0.04 305)"
  dark-assistant-ink: "oklch(0.9 0.045 305)"
  dark-background: "oklch(0.215 0.018 305)"
  dark-foreground: "oklch(0.98482 0.01128 71.9)"
  dark-card: "oklch(0.275 0.025 305)"
  dark-muted: "oklch(0.33 0.025 305)"
  dark-muted-foreground: "oklch(0.83 0.022 305)"
  dark-border: "oklch(0.35 0.025 305)"
  dark-input: "oklch(0.66 0.025 305)"
  dark-bubble-mine: "oklch(0.38 0.035 45)"
  dark-destructive: "oklch(0.80379 0.12131 0.43)"
  dark-success: "oklch(0.77 0.07 158)"
  dark-warning: "oklch(0.82 0.08 82)"
typography:
  display:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  onboarding-headline:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(1.5rem, 7vw, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.03em"
  title:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 750
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "-0.005em"
  supporting:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: '"Wanted Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  control: "0.75rem"
  field: "0.75rem"
  surface: "1rem"
  item: "0.5rem"
  assistant-mark: "14px 14px 14px 5px"
  assistant-speech: "16px 16px 16px 5px"
  assistant-reply: "4px 16px 16px"
  question: "12px 12px 12px 4px"
  answer: "16px 4px 16px 16px"
spacing:
  compact: "0.5rem"
  related: "0.75rem"
  body: "1rem"
  gutter: "1.25rem"
  section: "1.5rem"
  separation: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-secondary:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary-strong}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.field}"
    padding: "0.5rem 0.875rem"
    height: "3rem"
  chip-selected:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.selection-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  navigation:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "1rem 1rem 0 0"
  assistant-speech:
    backgroundColor: "{colors.assistant-surface}"
    textColor: "{colors.assistant-ink}"
    rounded: "{rounded.assistant-speech}"
    padding: "1.5rem"
  assistant-dock:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.surface}"
    padding: "1.25rem"
---

# Design System: After

## Overview

**Creative North Star: "Sunset Companion"**

After feels like a composed companion at the end of a working day. Warm coral identifies the next consequential action; plum and lilac identify the assistant and selected state. Korean, Latin text, and numbers share one clear type family, with strong titles and comfortable conversational body copy.

The visual system separates a speaker from a person's answer through tone and corner direction. It uses compact mobile proportions, honest state labels, and restrained depth. Existing profile photography stays human and contextual; the assistant's identity is a code-rendered speech mark, not a generated portrait.

**Key Characteristics:**

- Coral actions, plum selection, and lilac assistant speech.
- A single Korean-capable variable sans family.
- Directional speech corners and quieter answer surfaces.
- A mobile frame with stable chrome and an independently scrolling body.
- Brief tactile feedback that respects reduced motion.

This record covers the implemented assistant world and its shared app primitives. Sources are `src/styles.css`, the assistant components, `AppScreen`, `StepShell`, `ProfileDetail`, the conversation-preparation route, and the shared button/input/chip implementations. Legacy surfaces may retain older treatments; their presence does not make them new system rules.

## Colors

The palette places warm action against softly violet conversational surfaces. The frontmatter preserves the exact OKLCH source values; dark-prefixed entries are the corresponding `.dark` overrides, not a separate brand palette. Runtime components use semantic CSS variables so theme switching preserves roles.

### Primary

- **Sunset Coral** (`primary`): the main action fill. Its dedicated hover token maintains text contrast rather than fading the fill.
- **Deep Coral** (`primary-strong`): small brand text, links, caret, and the focus ring. In dark mode the same role becomes a lighter coral.
- **Action Foreground** (`primary-foreground`): near-white on light-mode coral and dark background ink on dark-mode coral.

### Secondary

- **Plum Selection** (`selection` / `selection-foreground`): chosen chips, calendar options, switches, and active navigation icons.
- **Lilac Speech** (`assistant-surface` / `assistant-ink`): assistant utterances and question prompts. The mark reverses this pair.

### Neutral

- **Evening Ground** (`background`): the warm app canvas, becoming plum-black at night.
- **Answer Surface** (`card`): light answer/dock surfaces, becoming a distinct plum surface at night.
- **Plum Ink** (`foreground`) and **Quiet Ink** (`muted-foreground`): main and supporting text.
- **Quiet Surface** (`muted`), **Soft Edge** (`border`), and **Field Edge** (`input`): secondary fills, subtle structure, and the more visible input boundary.
- **Peach Reply** (`bubble-mine`): the user's conversation bubbles; keep it distinct from assistant speech.
- **Raspberry**, **Green**, and **Amber** (`destructive`, `success`, `warning`): error, success, and warning meaning.

**The Role Before Hue Rule.** Coral communicates an action; plum communicates an existing selection; lilac identifies assistant speech. Do not swap these roles for decorative variety.

## Typography

**Display and Body Font:** Wanted Sans Variable, with ui-sans-serif, system-ui, and sans-serif fallbacks.

The same family handles Korean, Latin, and numerals so mixed-language labels feel consistent. Titles use tighter tracking and purposeful weight; body text leaves enough line height for Korean sentences. Keep Korean words together where possible and permit emergency wrapping for long content.

The official font's Unicode-range WOFF2 subsets are self-hosted with `font-display: swap`. Provenance and license live in `public/fonts/wanted-sans/README.md` and `OFL.txt`. It is an OFL typeface, not an exclusively owned brand font. The pre-existing serif utility is reserved for a short quotation where already used; it is not the assistant's display face.

### Hierarchy

- **Display:** the profile-preparation welcome title.
- **Headline:** a status or conversation-preparation title.
- **Onboarding headline:** a responsive question title that reaches the same headline ceiling.
- **Title:** topic-card headings; the app chrome uses the same size with a quieter semibold weight.
- **Body:** profile answers and substantial human text.
- **Supporting:** assistant context, explanations, and controls.
- **Label:** compact navigation, status, and useful metadata. Labels name actual content; they are not ornamental kickers.

**The One Family Rule.** Use Wanted Sans for assistant titles, questions, answers, controls, and numerals.

## Layout

The customer app is a centered mobile column with a maximum width of 430px. Its frame height is `calc(100dvh - var(--keyboard-height))`; the document does not scroll. Headers, footers, and the tab bar stay in flex flow, while the main body owns scrolling. Full conversation screens delegate that scroll area to their message log. Admin layouts are outside this mobile constraint.

Align headers, body, and footers to the observed gutter token. Use the compact/related steps within a thought and section/separation steps between thoughts. Assistant speech has section padding; the dock and topic surfaces use gutter padding. Question-and-answer blocks indent the answer by 1rem after a 0.75rem gap.

Top safety space is `max(calc(env(safe-area-inset-top, 0px) + 0.5rem), 2.75rem)`; bottom safety space is `max(env(safe-area-inset-bottom, 0px), 2.125rem)`. At heights at or below 540px, conversation/form/onboarding screens relax these floors to the actual insets. Coarse-pointer fields retain at least 16px text. Onboarding hides its footer while the keyboard is open.

**The Stable Chrome Rule.** Put scrolling in the body and keep action areas in the app frame's flow; preserve the safe-area and keyboard calculations.

## Elevation & Depth

Tone carries most of the hierarchy. The card shadow token is explicitly `none`; assistant speech and profile answers read through color and shape. The dock and preparation-topic surfaces use the elevated shadow. Primary buttons carry a small ambient shadow that disappears on press; the tab bar has a soft upward shadow. Shadows are not hard offset outlines.

### Shadow Vocabulary

- **Frame:** `0 0 70px -24px oklch(0.295 0.02 169 / 16%)`; separates the mobile frame from a wide viewport.
- **Elevated surface:** `0 8px 24px -12px oklch(0.30902 0.02966 167.48 / 24%)`; assistant dock and topic surfaces.
- **Primary control:** `0 5px 12px -6px oklch(0.2955 0.0198 169.4 / 48%)`; actionable main buttons.
- **Tab bar:** `0 -6px 24px -14px oklch(0.2955 0.0198 169.4 / 28%)`; stable bottom navigation.

The sidecar records dark frame/elevated counterparts. Do not infer a global no-shadow rule from the flat card token: the implemented system deliberately lifts a small number of functional surfaces.

## Shapes

Controls and fields share the control radius; regular surfaces use the surface radius. The assistant mark and speech use a shortened bottom-left corner. Profile questions repeat that direction at a smaller scale; answers shorten the opposite top-right corner. The asymmetry communicates voice and turn-taking without a decorative tail.

Circular back controls, progress tracks, and switch tracks remain valid functional shapes. Do not turn the standard control radius into a ban on those existing forms.

## Components

### Buttons

Tactile and clear. The six shared variants are primary, destructive, outline, secondary, ghost, and link. Default buttons have 14px semibold text and a 44px minimum target; the large size has a 48px minimum target, 24px horizontal padding, and 15px text. Outline uses the soft border; secondary uses the quiet surface; ghost and link reduce visual weight.

Press feedback scales to 0.98 using the 140ms feedback token and the shared ease-out curve. Focus uses a visible 2px ring with a 2px offset. Shared disabled buttons switch to muted fill/text and remove shadow, rather than fading coral. Preserve each variant's implemented hover treatment.

### Chips

Selected choices use plum fill, contrasting text, semibold weight, and a check icon. Unselected choices use the answer surface and soft border. The 44px minimum target and shared control radius apply even when the label is short.

### Cards / Containers

Assistant docks and conversation-preparation topics are the canonical elevated card examples: answer surface, surface radius, gutter padding. Evidence inside a topic is an indented quotation with readable text, not a second card. Profile answers use directional corners and body text without a shadow.

The generic legacy `Card` component still combines a border and framework shadow. That carryover is not the new assistant system's default surface treatment.

### Inputs / Fields

Shared inputs use a 48px height, field radius, answer surface, and visible field border. Focus shifts the border to the focus color and adds the same ring/offset language as buttons. Invalid input uses raspberry; disabled shared inputs retain their existing reduced opacity. The assistant composer is a quieter background surface with an inline field and plum submit control; that local control is not a selected option.

### Navigation

Four equal tabs sit on the answer surface with rounded top corners. Each tab has a 64px minimum height, a 20px line icon, and a 12px label. The active icon sits in a 48 × 32px plum selection tile; active labels use main ink and inactive labels use quiet ink. The active icon's stroke strengthens from 1.7 to 2.3. Preserve the bottom inset.

### Assistant Signature

The mark is a 40px plum speech shape containing the 20px Lucide MessageCircleHeart line icon (stroke 1.8). It identifies the assistant, not the counterpart. Status and welcome speech use lilac surfaces and the directional speech radius, with hierarchy carried by the title and short context.

The dock groups suggested intents, an optional assistant reply, and a composer. Suggestions keep a 44px minimum target. Replies arrive through a 5px vertical movement over 200ms only when reduced motion is not requested. Shared content arrival and active-tab motion retain their existing 260ms durations; do not describe every transition as 200ms. Reduced motion disables these arrival/press effects.

### Profile Question and Answer

Questions are compact lilac prompts at 14px/700, with keep-all wrapping. Answers are offset answer surfaces at the body size and line height, preserve line breaks, and remain selectable. This conversational distinction is reusable without making every section a chat transcript.

## Do's and Don'ts

### Do

- Do use semantic color variables so light and dark themes preserve the same roles.
- Do preserve visible keyboard focus, 44px control targets, and reduced-motion behavior.
- Do use tone and directional corners to distinguish assistant speech from a person's answer.
- Do keep the stable app chrome, safe areas, and keyboard-aware body scrolling.
- Do reuse the self-hosted Wanted Sans family and retain its provenance.

### Don't

- Don't use the action coral to mean an already selected option.
- Don't use assistant lilac and the assistant mark to impersonate a counterpart's message.
- Don't introduce decorative eyebrow labels above already clear titles.
- Don't wrap supporting evidence in another card inside a topic card.
- Don't promote legacy divider-heavy layouts or the generic Card's border-plus-shadow into assistant defaults.
