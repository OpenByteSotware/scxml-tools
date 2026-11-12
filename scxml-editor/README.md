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
