# Mermaid Diagram

This file contains a simple Mermaid flowchart. You can preview it in GitHub, VS Code (with Mermaid preview extensions), or any Markdown viewer that supports Mermaid.

```mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it]
    B -- No --> D[Fix it]
    D --> B
    C --> E[End]
```

## Notes
- Edit the diagram by modifying the Mermaid code block above.
- Change 'flowchart TD' to 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', or 'pie' for other diagram types.
