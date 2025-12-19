### `aerisCore.docs.registerDocsMenu`

```ts
aerisCore.docs.registerDocsMenu(
  moduleId: string,
  options?: SettingsConfig
): void
```

Registers a **Documentation** button in Foundry’s **Module Settings** for the given module.
When clicked, it opens a docs window built from your `config.json`.

#### Parameters

-   **`moduleId`**:
    The string ID of your module (e.g. `"my-module"`).

-   **`options`** _(optional)_:
    Extra options merged into Foundry’s [`registerMenu`](https://foundryvtt.com/api/classes/foundry.helpers.ClientSettings.html#register).

    -   `name`: Display name in settings (default: `"Documentation"`).
    -   `hint`: Description under the menu option (default: `"Open this module’s documentation"`).
    -   `icon`: Font Awesome class (default: `"fa-solid fa-book"`).
    -   Any other `registerMenu` field is accepted.

#### Example

```ts
Hooks.once("ready", () => {
    aerisCore.docs.registerDocsMenu("my-module", {
        name: "My Module Docs",
        hint: "Learn how to use My Module",
    });
});
```

This creates a **My Module Docs** entry under _Module Settings → Documentation_.
