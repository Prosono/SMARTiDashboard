# Home Assistant automations in SMARTi

SMARTi edits Home Assistant (HA) configuration; it does not run a separate automation engine. The flow, step list and configuration editor are views of the same source. HA remains responsible for validation, template evaluation, device behavior and execution.

## Authoritative configuration

- `backend/app/management.py` reads the editable file through HA's `config/automation/config/{id}` REST endpoint. Updates require the current content revision; concurrent changes produce a conflict instead of overwriting another editor.
- Normal automations normalize the outer singular/plural keys (`trigger`/`triggers`, `condition`/`conditions`, `action`/`actions`) and scalar/list forms for display. Nested values, unrelated fields, aliases and expressions remain intact.
- A runtime configuration from WebSocket `automation/config` is a **read-only preview**, not an editable replacement for the file. This distinction is essential for blueprints.

See HA's [automation YAML reference](https://www.home-assistant.io/docs/automation/yaml/) and [building-block model](https://www.home-assistant.io/docs/automation/building-blocks/).

## Mapping execution to a flow

The visual model follows HA's semantics:

| Configuration | Meaning shown in SMARTi |
| --- | --- |
| Several triggers | Any trigger can start a run; they are alternative starting points. |
| Top-level conditions | All must pass before actions begin. |
| Action sequence | Steps execute in order. A condition among actions stops the remainder of its own sequence when false. |
| `choose` | Only the first matching option executes. `default` runs only when no option matches and a default exists. |
| `if` / `then` / `else` | Conditions select the matching path; absence of `else` means continue without those actions. |
| `repeat` | Counted, per-item, while and until loops retain their original structure. While checks before each iteration; until checks afterwards and runs at least once. |
| `parallel` | Paths run concurrently; the following step waits for completion. Their relative execution order is not guaranteed. |
| `wait_for_trigger` / `wait_template` | Wait for a future event or a true expression. Timeout and continue/stop behavior are displayed explicitly. |
| AND / OR / NOT | All, at least one, or none of the nested requirements must match. Implicit condition arrays and `condition: [...]` mean AND. |
| `enabled: false` | Skip the step without deleting it. Template-based activation is displayed as conditional, not evaluated. |

These rules follow HA's [triggers](https://www.home-assistant.io/docs/automation/trigger/), [Choose](https://www.home-assistant.io/building-blocks/choose/), [Condition](https://www.home-assistant.io/building-blocks/condition/), [Repeat until](https://www.home-assistant.io/building-blocks/repeat_until/) and [Parallel](https://www.home-assistant.io/building-blocks/parallel/) documentation.

## Descriptions and editing

`flowNarrative.ts` describes the saved configuration without predicting its outcome. It resolves known entity/room names and keeps significant qualifiers visible: source/destination state, attribute, duration, exclusive numeric bounds, weekdays, offsets, action parameters and timeout behavior. Numeric triggers describe entering a range; numeric conditions describe the current value. Door and motion states use their device class. Templates remain expressions; the browser never executes them. Unknown integration-specific types retain their type and available details instead of becoming an unexplained “advanced block.”

`flowStructure.ts` projects branches with original string/number paths. Replacing a leaf copies its ancestors and preserves sibling fields. This includes nested trigger lists, shorthand conditions and nested sequences. Do not flatten branches or rebuild an entire HA block from only the visible form fields.

`FlowInspector.tsx` and `flowInspectorModel.ts` provide forms for common triggers, conditions, service targets and parameters, durations, waits, loops and branches. Existing scalar/list and numeric/string forms are preserved where possible. Invalid temporary input stays in the form and blocks applying/saving it; it must not silently become zero or erase the prior value. The full JSON editor remains available for fields without a dedicated control. This is not a complete HA schema editor. See [state triggers](https://www.home-assistant.io/triggers/state/) and [state conditions](https://www.home-assistant.io/conditions/state/) for distinctions that must survive future UI changes.

## Canvas boundaries

`flowCanvasModel.ts` derives edges from configuration. Card positions are temporary presentation state. Dragging a card does not change execution. Confirmed connection gestures are translated by `flowConnections.ts` into actual list reordering or HA `parallel` blocks; decorative edges must never imply behavior absent from the saved source.

Triggers remain alternative starts, all top-level requirements precede actions, and an active unconditional stop has no continuation. Parallel conversion is restricted to literal service actions/delays, including intervening steps: templates, waits, conditions, response variables or unknown fields can make scope changes unsafe. Nested branches are edited inside their subflow. Arbitrary graph cycles or unsupported connections are rejected.

## Blueprints and limits

`BlueprintPreview.tsx` keeps `use_blueprint.path` and inputs as the editable source. Existing scalar inputs can be changed; structured inputs remain visible and can be edited in full configuration. The expanded runtime flow is read-only and reflects the version currently loaded in HA, not unsaved input edits. Backend preview failures are explicit, and replacing a linked blueprint with its expanded preview is rejected.

The editor does not evaluate templates, simulate traces, discover every integration's field schema, or guarantee that a supported-looking device action succeeds physically. Newly introduced HA types receive a truthful fallback until dedicated controls exist. Keep the narrative, structure, inspector, canvas/connection and backend management tests in sync when extending support.
