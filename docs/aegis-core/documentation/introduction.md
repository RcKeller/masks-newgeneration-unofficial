### Introduction

Aeris Core provides a simple API for modules to display their documentation directly inside Foundry.
This allows you to bundle Markdown files with your module and present them through a searchable, navigable docs window.

#### Registering the Docs Menu

To add a documentation entry for your module, call:

```ts
aerisCore.docs.registerDocsMenu("my-module");
```

This creates a **Documentation** button under **Module Settings**.
Clicking it opens a window showing your docs.

You can also customize the submenu by passing additional [`SettingsConfig`](https://foundryvtt.com/api/interfaces/foundry.types.SettingConfig.html) options:

```ts
aerisCore.docs.registerDocsMenu("my-module", {
    name: "My Module Docs",
    hint: "Learn how to use My Module",
});
```

Next, see **Docs Manifest** to define the structure of your docs, and **File Structure** for how to organize your Markdown files.
