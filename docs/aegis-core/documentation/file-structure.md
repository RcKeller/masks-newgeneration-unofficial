### File Structure

Your module should keep documentation files in a dedicated `docs/` directory.
This keeps everything consistent and easy for Aeris Core to resolve.

#### Example Layout

```
my-module/
├─ module.json
├─ docs/
│  ├─ config.json
│  ├─ getting-started/
│  │  ├─ intro.md
│  ├─ react-app/
│  │  ├─ introduction.md
│  │  ├─ basic-usage.md
│  │  ├─ integration.md
│  │  ├─ event-listeners.md
│  │  └─ tailwind.md
│  ├─ documentation/
│  │  ├─ introduction.md
│  │  ├─ docs-manifest.md
│  │  ├─ file-structure.md
│  │  └─ writing-pages.md
│  └─ api/
│     └─ register-docs-menu.md
```

-   `config.json`
    Contains your `docs` manifest describing groups and pages.

-   `docs/`
    Root folder for all Markdown files.

-   `docs/<file>.md`
    Individual documentation pages referenced by the manifest.

-   Subdirectories (`react-app/`, `api/`, etc.)
    Optional — useful for grouping related pages while keeping the manifest readable.

This mirrors the structure defined in your `docs` manifest.
As long as the paths in `file` match the actual locations inside `docs/`, the system will load them automatically.
