### Tailwind Support

Aeris Core includes a prefixed Tailwind build (``). This allows you to use utility classes like `flex`, `gap-2`, or `bg-gray-800` directly in your React components.

#### Important Limitations

Only the utilities compiled into Aeris Core are available. If you write something not included in the compiled set — for example:

```tsx
<div className="h-[60px]" />
```

...it won’t render correctly, because the `[60px]` height class wasn’t generated.

#### Extending Tailwind

If you need full Tailwind flexibility (arbitrary values, plugins, or safelisting), add a Tailwind build step to your own module.
Use the same prefix and layers as Aeris Core:

```css
@import "tailwindcss/theme.css" layer(theme) prefix(tw);
@import "tailwindcss/utilities.css" layer(utilities) prefix(tw);
```

This ensures your utilities don’t collide with Foundry’s core styles and remain consistent with Aeris Core’s setup.

#### Ensuring Correct Layer Order

Aeris Core applies its own resets and theme layers during initialization.
To make sure your module’s styles are loaded **after** those (so your utilities/components override correctly), you should inject your stylesheet dynamically when Aeris Core is ready:

```ts
Hooks.once("aeris-core.import-css", () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";

    const devPath = "modules/aeris-cinematic-crits/src/index.css";
    const prodPath = "modules/aeris-cinematic-crits/assets/main.css";

    link.href = import.meta.env.DEV ? devPath : prodPath;
    document.head.appendChild(link);
});
```

This guarantees your module’s CSS is layered after Aeris Core’s, preventing your utilities from being reset or overridden.
