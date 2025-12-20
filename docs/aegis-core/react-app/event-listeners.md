### Event Listeners

If your React components attach event listeners (for example: `window`, `document`, or socket subscriptions), make sure to **clean them up** when the window closes.

React’s `useEffect` cleanup return handles this:

```tsx
useEffect(() => {
    const handler = () => console.log("resize");
    window.addEventListener("resize", handler);

    return () => window.removeEventListener("resize", handler);
}, []);
```

Without cleanup, stale listeners may remain active after the window is closed, causing bugs or performance issues.

Always use `useEffect` cleanup for any listener or subscription tied to your component’s lifecycle.
