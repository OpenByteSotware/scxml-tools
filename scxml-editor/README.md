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

########## Containment and attached-transition correction

Containment is now selected from actual state-rectangle overlap rather than the mouse pointer alone. A destination must overlap at least 20 percent of the smaller state rectangle, and the deepest overlapping eligible state wins. Drop targeting is recomputed on mouse-up. Reparenting now clears saved positions for the entire moved subtree and sends the cleaned layout atomically with the SCXML reparent request.

Transition routes are recalculated after every drag from the current source and target rectangles. The router selects the nearest horizontal or vertical sides and keeps both endpoints attached while either state moves.

## Hierarchy moves are document edits

Dragging a state across a hierarchy boundary now changes the SCXML document immediately. Dropping a nested state on empty chart space moves it to the `<scxml>` root. Dropping it on a different compound or parallel state moves it beneath that state. Dropping within its current parent only changes the saved visual layout. If the moved state was the old parent's `initial` child, that stale `initial` attribute is removed. These operations use `WorkspaceEdit`, so they are dirty, saveable, and undoable like other XML changes.

## Dialog cancellation fix

Cancel buttons now use `type="button"` and explicit close handlers, so HTML required-field validation is not triggered. Cancel clears temporary IDs, errors, requested positions, and parent/transition context. Escape uses the same cleanup path for state, region, and transition dialogs.

## Parallel-state property and visualization

The state property panel now includes a **Parallel state** checkbox. Existing `<parallel>` elements load with the checkbox selected. Applying the property converts `<state>` to `<parallel>` or back while preserving the state body. Parallel states show an amber **E** badge in the top-right corner. When a parallel state contains two or more direct child regions, amber dashed divider bars are drawn between those regions.

## Initial-state scopes and marker

Initial states display a filled green circle with a white outline in the upper-left corner. The `<scxml>` root has at most one direct initial child. Each ordinary compound `<state>` independently has at most one direct initial child. A `<parallel>` has no single initial child because every direct region is entered, so each direct region displays the marker and its Initial checkbox is read-only. Each region can still define one nested initial child.

## Parent selection and confirmed drag reparenting

State properties now show the current parent in a **Parent** dropdown. The dropdown includes the SCXML root and every eligible state or parallel container, while excluding the selected state, its descendants, final states, and history states. Applying state changes reparents the state when the selected parent changes. Dragging across a hierarchy boundary now opens a confirmation dialog naming the proposed parent; cancel restores the previous rendered layout without modifying SCXML.

## Initial pseudostate tags

The diagram now renders SCXML `initial` references as initial pseudostates: a solid green circle above the target with an arrow entering the state. The root `<scxml initial="...">` marker appears at the top level of the state-machine diagram. Ordinary compound states also render a marker above their selected initial substate. Parallel states do not render a single initial pseudostate because all direct regions are entered.

## Left-click property selection

Left-clicking any state body or header selects it and shows its properties in the right panel. Left-clicking a transition line, its event/condition label, or the padded area around the label selects that transition and scrolls its property section into view. Transition hit testing uses a 16-pixel invisible path and a padded label rectangle; dragging remains independent.

## State left-click correction

A state press previously set the click-suppression flag immediately, so an ordinary left-click was treated as the end of a drag and never selected the state. Click suppression now starts only after the pointer actually moves. A press and release without movement selects the state and refreshes the property panel; a real drag continues to move the state without triggering selection afterward.

## Independent chart and property scrolling

The custom editor now locks the outer webview to the available VS Code editor height. The chart canvas and properties sidebar are separate scroll containers. The chart keeps both horizontal and vertical scrollbars, while the properties sidebar has its own vertical scrollbar. Scrolling one pane no longer moves the other pane away from the selected state or properties.

## Parallel divider coordinate fix

The amber dashed parallel-region separators were being emitted into the root SVG with coordinates calculated relative to the parallel state. Because the separator elements are not nested inside the state's translated SVG group, those relative values appeared as unrelated vertical background lines. Separators now use absolute chart coordinates and are bounded from the parallel state's header divider to its bottom edge.

## Parallel divider drag synchronization

Parallel-region separator coordinates are recalculated during every drag after transition routes update. Each separator stores its parallel-state ID and region-pair index and derives its endpoints from live parent and child positions, so moving a parallel state, an ancestor, or its regions keeps the dashed bars attached.

## Initial pseudostate drag synchronization

Initial pseudostate circles and arrows are now recalculated during every state drag. Each marker follows its `data-target` state using the live layout position and dimensions. This covers root initial states, nested compound-state initial children, movement of an initial child itself, and movement of an ancestor containing the initial child.

## SCXML shallow and deep history

Compound and parallel states can now contain SCXML `<history>` pseudostates. Use **Add history** from the selected state's properties or context menu, choose `shallow` or `deep`, and optionally provide the history element's default transition target. Shallow history is rendered with an **H** badge; deep history uses **H***. The history properties panel can change the type and fallback target. History elements remain nested under their owning state, cannot contain child states, and may have at most one default transition.

### History command wiring correction

The history controls were present, but the webview called an undefined `openHistoryDialog` function and the extension host did not handle `createHistoryState` or `updateHistoryState`. The dialog, validation, webview message, WorkspaceEdit, selection, redraw, cancellation, and history-specific error routing are now connected end to end.

## Stage 1: root properties and explicit initial transitions

The **Document Properties** toolbar action edits the `<scxml>` root attributes: `name`, required `version`, SCXML namespace, `datamodel`, `binding`, `xml:base`, and initial target. Root and compound-state initial selection can use either the compact `initial="stateId"` attribute or an explicit `<initial><transition target="..." cond="..."/></initial>` element. Existing explicit initial transitions are parsed into the diagram, drive the initial pseudostate marker, and can be converted back to the attribute form without altering unrelated state content.

### Stage 2: entry, exit, and transition executable content

Ordinary, parallel, and final states now expose ordered **On entry actions** and **On exit actions** editors. Every existing transition exposes its own ordered executable-action editor. Stage 2 supports the standard `<raise>`, `<log>`, `<assign>`, and `<script>` actions plus namespaced extension actions. Shortcut buttons insert valid starter markup while the editable XML area preserves document order and expressions. Applying an empty action area removes the corresponding `<onentry>`, `<onexit>`, or transition body. Validation requires `raise@event` and `assign@location`, rejects mixed `script@src` and inline script content, checks balanced action elements, and preserves transition attributes while switching between empty and container transition forms.

##### Generated webview script newline escaping fix

The Stage 2 action shortcut was embedded in a generated webview script. Newline escapes were consumed by the outer TypeScript template and became literal line breaks inside a single-quoted browser JavaScript string. That ended the browser script early, displayed the remaining source below the diagram, and disabled editor interactions. Nested newlines are now escaped for the generated script.

###### Embedded script closing-token correction

Escaping the newline characters was necessary but not sufficient. HTML parsers recognize a literal `</script>` sequence even when that sequence appears inside a JavaScript string. The executable-content shortcut therefore still closed the webview's main script early. The shortcut now constructs the SCXML script element from split string fragments (`<scr` + `ipt>` and `</scr` + `ipt>`), ensuring the generated webview source never contains a nested literal closing-script token.

### Stage 3: conditional and iterative executable content

Executable-content editors now support SCXML `<if>`, `<elseif>`, `<else>`, and `<foreach>` structures in on-entry, on-exit, and transition actions. **+ if** inserts an ordered three-branch starter structure, while **+ foreach** inserts `array`, `item`, and optional `index` fields with a nested action. Validation requires `if@cond`, `elseif@cond`, `foreach@array`, and `foreach@item`; requires `elseif` and `else` to be direct children of `<if>`; prevents branches after `<else>`; and requires container forms for `<if>` and `<foreach>`. The script snippet continues to avoid a literal nested HTML closing-script token.

### State, history, and transition deletion correction

Deletion no longer relies on the browser `confirm()` API, which is not reliably available in VS Code webviews. Property-panel delete buttons and context-menu delete actions now open an in-webview confirmation dialog. Selecting a state or history and pressing **Delete** or **Backspace** opens the same dialog; selected transitions use the same keyboard workflow. Keyboard deletion is ignored while focus is in an input, textarea, select, content-editable area, or another modal dialog. Deleting a compound state removes its complete subtree, while deleting a history pseudostate removes only that history element and cleans transition targets that reference it.

### Final-state circle authoring and interaction
Final states are available from Add State and Add Substate by selecting `final`. They render as compact 96 by 96 dark-red double circles with centered IDs. The circular surface supports selection, dragging, saved layout, hierarchy moves, incoming transition routing, deletion, undo, and redo.

#### Final-state transition attachment correction
Final states now use a 96-by-96 routing box matching the rendered symbol. Transition routing is shape-aware: rectangular states attach at the nearest side, while final-state endpoints intersect the dark-red outer circle at its 42-pixel radius. The arrow remains attached during initial rendering and live dragging.

### Stage 4: final-state data and transition completion
Final states support `<donedata>` using expression, inline content, or parameter modes. Transition properties support default, internal, and external types, and an empty target creates a targetless transition. Final-state validation rejects children and outgoing transitions.

#### Stage 4 webview runtime correction
The malformed nested template expressions used for done-data initialization caused the browser to terminate the generated editor script, display script characters in the chart, and skip all selection and editing handlers. Done-data mode now uses an escaped HTML data attribute, and the selected final-state ID is read from the body data attribute.

###### Stage 4 generated regular-expression escaping correction

The done-data parameter parser placed `/\r?\n/` inside the outer TypeScript HTML template. The outer template converted those escapes into literal carriage-return and newline characters inside the generated browser JavaScript regular expression. That broke the webview script before its event handlers were installed and left punctuation fragments visible above the chart. The source now uses `/\\r?\\n/`, so the generated browser script receives the intended `/\r?\n/` expression.

### Stage 5: SCXML data models and data declarations

Document properties and ordinary/parallel state properties now edit ordered `<datamodel>` declarations. Rows use `id | expr|src|content | value`, supporting expression initialization, external sources, and inline XML/text content. Applying an empty editor removes the corresponding data model. Validation requires XML-compatible IDs, unique IDs within each scope, and a non-empty value. Existing declarations load in document order. Transition create/update now also writes `type="internal|external"`, completing the Stage 4 transition-type path. Generated webview line parsing uses double-escaped CR/LF expressions to avoid corrupting the browser script.

#### Stage 5 validator initialization correction

The Stage 5 parser invoked recursive state validation before the `validateData` function had been initialized. Because `validateData` was declared with `const`, opening any chart containing a state could throw from the temporal dead zone during document validation. The data validator is now initialized before state traversal. VS Code diagnostic updates are also guarded so malformed input is reported as an SCXML diagnostic instead of escaping through the workbench event handler, and malformed webview messages are rejected explicitly.

#### Selection scroll-position preservation
Selecting a state or transition rebuilds the webview to refresh the properties sidebar. The chart now stores its horizontal and vertical offsets with `acquireVsCodeApi().setState()` before selection and while scrolling, then restores those offsets after the rebuild. State selection resets only the properties sidebar to its top. Transition selection scrolls only the properties sidebar to the selected transition section. Left-click and context-menu selection use the same viewport-preserving path.

#### Bidirectional and parallel transition separation
Transitions sharing the same state pair now use separate cubic lanes. Reverse directions are placed on opposite sides of the center line, with 36 pixels between adjacent lanes. Additional transitions between the same states receive additional lanes. Labels move with the route, and separation is recalculated while states are dragged.

### Stage 6: send and cancel event communication

Executable-content editors now support SCXML `<send>` and `<cancel>` actions in on-entry, on-exit, and transition action lists. **+ send** inserts an internal delayed-event starter with `event`, `target`, `delay`, and `id`; **+ cancel** inserts a matching `sendid` cancellation starter. Validation supports literal/expression attribute pairs, requires an event form for send and a send-ID form for cancel, validates `<param name>` with exactly one of `expr` or `location`, and prevents combining `<content>` with `<param>` inside one send.

#### Stage 6 generated action-factory syntax correction

The Stage 6 shortcut factory omitted the closing quote after the generated `</if>` snippet when the new `foreach`, `send`, and `cancel` ternary branches were added. The extension-side TypeScript compiled because the defect was inside generated webview JavaScript, but the browser stopped parsing the webview script, displayed JavaScript punctuation above the chart, and never installed drag or selection handlers. The `if` string is now closed before the `foreach` branch, and a regression test checks all Stage 6 branch boundaries.
