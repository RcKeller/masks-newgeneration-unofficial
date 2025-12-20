### Basic Usage

React chat messages are created in two steps:
**first register the component**, then **create a chat message that uses it**.

#### 1. Registering Your Component

Aeris Core will call the `aeris-core.registerChatComponents` hook during setup.
You must add your component entry at that point:

```ts
import ReactDOM from "react-dom/client";
import { MyChatComponent } from "./MyChatComponent";

Hooks.on("aeris-core.registerChatComponents", (entries) => {
    entries.push({
        key: "my-module.MyChatComponent",
        component: MyChatComponent,
        reactDom: ReactDOM,
    });
});
```

-   `key` must be unique to your module.
-   `component` is the React component to render in chat.
-   `reactDom` is your module’s bundled `react-dom/client`.

At this stage you’re only telling Aeris Core **what components exist**.

#### 2. Creating a Chat Message

Later in your own code (for example, after resolving a roll), you can insert a message that renders your component:

```ts
await aerisCore.react.createChatMessage<typeof MyChatComponent>(
    "my-module.MyChatComponent",
    { text: "Hello world!" }
);
```

-   The first argument matches the `key` you registered.
-   The second argument is the props passed into your React component.

This call creates a `ChatMessage` with a placeholder `<div>`.
When Foundry renders that message, Aeris Core looks up the `key` in its registry and mounts your React component with the given props.

#### Flow Recap

1. **Aeris Core startup** → calls `aeris-core.registerChatComponents`
2. **Your module registers** its components in that hook
3. **Later, when needed** → call `createChatMessage` with the component `key` and props
4. **At render time** → Aeris Core mounts your React component into the chat log
5. **On message deletion** → Aeris Core unmounts your React component
