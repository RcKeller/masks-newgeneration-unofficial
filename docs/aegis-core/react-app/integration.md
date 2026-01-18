### Integration

You don’t usually mount React components directly.
Instead, you wrap them in a Foundry `ReactApplication`.

This gives you:

-   Automatic window lifecycle management
-   React component mounting and teardown
-   Integration with Foundry’s `Application` system

Example:

```ts
import ReactDOM from "react-dom/client";

class DocsWindow extends ReactApplication<typeof DocsApp> {
    constructor(moduleId: string) {
        super(
            ReactDOM,
            DocsApp,
            { moduleId },
            {
                title: "Documentation",
                window: { title: "Documentation", icon: "fa-solid fa-book" },
            }
        );
    }
}

class DocsWindowFactory extends DocsWindow {
    constructor() {
        super("aeris-core");
    }
}
```

Now `DocsWindowFactory` can be used anywhere Foundry expects an `Application`:

-   Settings menus (`game.settings.registerMenu`)
-   Custom buttons in your UI
-   Invoked directly with `new DocsWindowFactory().render({ force: true })`

### Why pass `ReactDOM`?

Every Foundry module that uses `ReactApplication` is expected to bundle its own React and ReactDOM.
This avoids cross-module coupling - each module runs in its own React runtime and doesn’t risk version mismatches with others.

By requiring `ReactDOM` as a constructor argument, we make that runtime **explicit**:

-   The module chooses which ReactDOM instance it wants to use.
-   No hidden imports — `ReactApplication` stays runtime-agnostic.
-   Multiple modules can coexist, each rendering React apps through their own ReactDOM.
