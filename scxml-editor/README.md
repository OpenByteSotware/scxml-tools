# SCXML State Chart Editor

Initial VS Code extension milestone:

- Registers `.scxml` as an SCXML language.
- Validates XML, duplicate state IDs, initial states, and transition targets.
- Opens a read-only state-chart diagram through **SCXML: Open State Chart Diagram**.
- Creates a starter chart through **SCXML: Create State Chart**.

## Run

```bash
npm install
npm run compile
```

Open this folder in VS Code, press **F5**, open `samples/door.scxml`, and run **SCXML: Open State Chart Diagram** from the Command Palette.

## Current limitation

The first milestone intentionally keeps the XML text as the source of truth and the diagram read-only. Diagram editing, nested-state layout, undo/redo edits, completion, go-to-target, and formatting are planned next.

## Interactive layout

Drag any state in the diagram to reposition it. Transition paths update while dragging. The layout is saved in VS Code workspace storage and does not modify the SCXML document. Use **Reset Layout** to return to automatic placement.

## Property editing and history

Select a state in the diagram to edit its ID, kind, initial-state status, and existing transitions. State renames update `initial` and `target` references. Each Apply operation uses a VS Code WorkspaceEdit, so the toolbar Undo and Redo buttons and the normal VS Code undo/redo commands restore document changes.

## Creating and deleting chart elements

Use **Add State** to create a top-level state. Select a state to add, edit, or delete its transitions, or to delete the state. Deleting a state removes matching targets from remaining transitions. All create/delete operations use VS Code document edits and participate in undo/redo.

## Context menus and new SCXML files

- Right-click empty diagram space to create a state at that position.
- Right-click a state to edit its properties, add a transition, or delete it.
- Right-click a transition line to select its properties or delete it.
- Run **SCXML: New Empty State Chart** to create a valid empty `.scxml` file. The `.scxml` file association now opens the graphical editor by default, while **Show XML Source** opens the editable XML text.

### Add State dialog fix

The Add State toolbar and empty-space context action now use an in-webview modal form rather than browser `prompt()`. VS Code webviews do not reliably support blocking prompt dialogs. The form validates the ID, supports all state kinds and the initial-state option, and displays host-side edit errors.

### Drag-to-create transitions

Each state has a connector handle on its right edge. Drag the handle onto another state to open the Add Transition dialog with source and target preselected. The state context-menu **Add transition** action opens the same dialog. Event and condition are optional; one or more valid target state IDs are required. Applying the dialog edits the SCXML document through WorkspaceEdit, so undo and redo remain supported.

#### Transition drop detection fix

Transition drops are now resolved in SVG chart coordinates against each state's saved bounding box. This avoids pointer-capture behavior where DOM hit testing could continue to report the source connector instead of the state under the pointer. The destination state highlights while dragging, and releasing anywhere inside its state rectangle opens the transition dialog.

##### First transition dialog race fix

The connector pointer-up can generate a synthetic state click immediately afterward. That click previously sent `selectState` to the extension host, which rebuilt the webview and closed the newly opened transition dialog. Connector completion now stops propagation and suppresses that one synthetic click before opening the dialog.

###### Transition target parsing fix

The transition dialog now preserves the whitespace regular expression inside the generated webview script. Previously, the outer TypeScript template consumed the backslash, turning `\s+` into `s+`; a target such as `state2` was therefore split into an empty value and `tate2`. Targets are now normalized, empty entries are removed, and valid IDs are written back with single-space separators.

## Stage 1: compound states and substates

A normal state can now be expanded into a compound state by adding nested substates. Select or right-click a state and choose **Add substate**. The child can be marked initial, which writes the parent's `initial` attribute. Compound states automatically render as larger containers with their child states inside. Final and history states reject children. Parallel-region authoring is intentionally reserved for Stage 2.

## Stage 2: parallel regions and recursive hierarchy

Parallel states now support explicit region creation. Select a parallel state and choose **Add region**, supplying a region ID and its initial child ID. Regions are rendered side by side, while ordinary compound-state children are rendered vertically. Recursive state nesting is supported to a maximum editor depth of 64, with focused coverage for 30 nested levels. Moving a compound or parallel container moves all descendants. Validation reports malformed parallel regions, invalid initial children, and depth overflow.

### Parallel-region robustness and drag containment

Parallel-region input is now normalized before XML generation, preventing undefined-value `.replace()` failures and routing errors back to the region dialog. A state can now be dragged into another state or parallel container. The deepest eligible destination under the dragged state's center glows green. Final and history states glow as invalid destinations. Dropping on a valid destination reparents the complete SCXML subtree through a WorkspaceEdit, preserving undo/redo and recursive descendants.

### Nested-state drag/drop fix

Nested SVG state groups propagate pointer events to ancestor groups. That caused the parent state handler to overwrite the actual dragged state, so the reparent message was never reliably sent for the intended state. State drag handlers now stop propagation, only the pointer-capturing state may complete the drop, the pointer location is used as the containment probe, and overlapping containers are resolved by deepest hierarchy level. The destination glows green while eligible.

#### State movement regression fix

State dragging now uses one SVG-level pointer-move and pointer-up controller instead of per-state move/up handlers. Pointer capture is held by the SVG canvas, ordinary movement updates the selected state and descendants continuously, and reparenting is evaluated only when the drag ends over a valid glowing destination. This restores free state movement while retaining drag-to-reparent behavior.

###### Pointer-capture correction

The SVG canvas was attempting to capture a pointer whose pointer-down target was the state group. Chromium can reject that capture, preventing the drag lifecycle from continuing. Pointer capture is now requested from the source state itself, guarded against unsupported capture, while move/up/cancel tracking runs at the window capture phase. This keeps ordinary state dragging active even when the pointer leaves the state or SVG viewport.

######## State drag mouse-event fallback

State movement now uses `mousedown`, window-capture `mousemove`, and window-capture `mouseup` rather than pointer capture. Transition connector dragging continues to use pointer events independently. This removes the Chromium/VS Code webview pointer-capture dependency that prevented existing SVG states from moving on some Windows installations.

######### Explicit state drag surface

Each state now has a transparent SVG drag surface over its 66-pixel header. A single delegated canvas handler starts state movement only from that surface. This removes ambiguity from nested SVG groups, compound-state backgrounds, text, transition handles, and browser hit-testing. Transition handles remain separate and continue to create transitions.
