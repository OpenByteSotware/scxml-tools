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
