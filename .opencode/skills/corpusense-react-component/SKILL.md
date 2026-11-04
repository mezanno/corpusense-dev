---
name: corpusense-react-component
description: Use when creating a new React component in Corpusense. Follow the repository's UI, localization, accessibility, testing, and component-composition conventions.
---

# Create a React Component in Corpusense

Use this workflow for new components. Keep the change local to the requested component, its directly necessary tests, translations, and exports. Leave page or feature integration out unless requested.

## 1. Inspect before designing

Inspect the closest components and tests, their callers, `src/components/ui`, relevant locale entries, `components.json`, and `package.json` scripts. Use the repository as the source of truth for file placement, exports, naming, providers, test setup, and available primitives. Read more broadly only when the nearby examples do not answer a design question.

Classify the component by responsibility:

- Put a generic, reusable primitive in `src/components/ui` when that matches existing usage.
- Put application-wide but domain-neutral components in the established shared location.
- Keep domain-specific components near their feature under `src/components/features`.
- Follow the nearest established pattern rather than introducing a new folder or export convention.

Ask only for missing requirements that materially affect the component's behavior or API. Otherwise choose the simplest design consistent with nearby code, and report meaningful assumptions afterward.

## 2. Design a composed, focused component

Apply the principles in [React Component Composition Best Practices](https://namastedev.com/topics/ep-03-laying-the-foundation/component-composition-react-best-practices):

- **Compose, don't inherit.** Build focused function components and combine them; don't create class hierarchies or a generic base component for reuse.
- **Use `children` for caller-owned content.** When callers need to supply arbitrary nested UI, expose `children` or a project-established slot pattern instead of hardcoding content or adding a prop for every nested element.
- **Keep the API focused.** Add only props needed by real use cases. If the API accumulates unrelated options or many independent props, reconsider the component boundary or split distinct responsibilities. Treat prop count as a design signal, not a rigid numeric limit.
- **Keep state close to its owner.** Keep state local unless multiple children genuinely need to coordinate; then lift it to their nearest common parent. Reuse existing feature hooks or contexts for domain state instead of promoting state globally without a real shared use case.
- **Extract on evidence.** Create subcomponents when there is meaningful repeated JSX, a distinct responsibility, or a readability boundary. Avoid speculative one-off abstractions.
- **Name by intent.** Choose clear names that describe the component's responsibility and fit the feature vocabulary.

Keep generic UI components driven by props and callbacks. Feature components may use existing domain hooks and contexts according to the surrounding architecture. Prefer native semantic HTML for simple controls and existing accessible primitives for complex interactions.

## 3. Reuse the UI system

- Reuse local components from `src/components/ui` and existing project components before creating new primitives.
- For a missing Shadcn/ui primitive, consult the official [Shadcn/ui component docs](https://ui.shadcn.com/docs/components) and use the Shadcn CLI configured by the repository's `components.json`. Add only the needed primitive. Inspect every generated change; retain only changes relevant to the request. Ask before accepting a new dependency or configuration change.
- Use Tailwind CSS first and the existing `cn()` helper when conditionally combining classes. Use design tokens rather than hardcoded colors, support light and dark themes, and account for mobile layouts. Add dedicated CSS only when utilities and existing patterns are insufficient.
- Reuse installed icon and animation libraries where appropriate; avoid adding dependencies by default.
- Expose styling props such as `className` when the component's layer and nearby components support that customization; don't add them mechanically to every feature component.

## 4. Cover behavior and accessibility

Implement the states that follow from the component's role, such as loading, empty, error, disabled, or selected states. Don't add unrelated variants. Keep interactions predictable and preserve controlled/uncontrolled patterns used by comparable components.

Accessibility is part of the implementation: use semantic elements, associate labels with controls, support keyboard interaction and visible focus, and expose relevant state and descriptions to assistive technology. Prefer the behavior of an established accessible primitive over a hand-built imitation.

## 5. Localize user-facing text

Use the existing `react-i18next` patterns for visible UI text. Add corresponding entries to both `public/locales/fr/translation.json` and `public/locales/en/translation.json`, following nearby key organization and wording conventions. Do not hardcode user-facing copy in JSX. Leave non-UI identifiers and domain data untranslated.

## 6. Add behavior-focused tests

Use Vitest and Testing Library. Test observable behavior through accessible roles, names, state, and user interactions rather than implementation details or snapshots. Cover the meaningful states and callbacks for the component. Reuse `renderWithProviders` from `src/__tests__/utils.tsx` when the component needs the application's providers; otherwise use Testing Library's regular render helper and existing test conventions.

Add a story or usage documentation only when the repository already supports it or when the component's variants need an example to be understandable.

## 7. Verify and report

Run the targeted Vitest test file(s) for the new component. When visual accuracy matters or a mockup is supplied, start the app and inspect the component in the browser at relevant viewport sizes when the environment makes that feasible.

Finish with a concise report naming the created files, notable composition/API decisions, tests run and their result, and any visual check or limitation. State any unresolved assumption; do not claim a check that was not run.
