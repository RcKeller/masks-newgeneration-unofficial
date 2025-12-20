### Docs Manifest (`/docs/config.json`)

Every module that uses Aeris Core documentation must include a `config.json` inside its `/docs` directory.
This manifest describes the structure and navigation of your documentation.

#### Example

```json
{
    "groups": [
        {
            "label": "Getting Started",
            "children": [
                {
                    "id": "intro",
                    "title": "Introduction",
                    "file": "getting-started/intro.md"
                }
            ]
        }
    ]
}
```

#### Schema

-   **groups**
    Array of sidebar groups. Each group renders a collapsible section in the docs window.

-   **group.label**
    The display name of the group (e.g. “Guides”).

-   **group.children**
    Array of doc entries belonging to this group.

-   **child.id**
    A unique identifier (string). Used for navigation and linking.

-   **child.title**
    The sidebar label for this page.

-   **child.file**
    Path to the Markdown file inside your module’s `docs/` directory.

This keeps navigation consistent across modules and ensures the docs window can render properly.
