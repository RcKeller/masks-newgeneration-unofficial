### Basic Usage

At the core, a React app is just a component that manages state and rendering.

Example `DocsApp` component:

```tsx
export default function DocsApp({ moduleId }: { moduleId: string }) {
    const [docs, setDocs] = useState<DocNode[]>([]);
    const [activeDoc, setActiveDoc] = useState<DocNode | null>(null);
    const [content, setContent] = useState("");

    useEffect(() => {
        loadDocs(moduleId).then((loaded) => {
            setDocs(loaded);
            const firstDoc = findFirstDoc(loaded);
            if (firstDoc) setActiveDoc(firstDoc);
        });
    }, [moduleId]);

    useEffect(() => {
        if (!activeDoc?.load) return setContent("");
        activeDoc
            .load()
            .then(setContent)
            .catch((err) => setContent(`Error: ${err}`));
    }, [activeDoc]);

    return (
        <main>
            <Sidebar>{/* … */}</Sidebar>
            <MarkdownRenderer>{content}</MarkdownRenderer>
        </main>
    );
}
```

This example loads documentation, tracks the currently active doc, and renders its contents with a sidebar and markdown renderer.
