### Writing Documentation Pages

All documentation pages are written in **Markdown**. Aeris Core supports [GitHub-flavored Markdown (GFM)](https://github.github.com/gfm/), so you can use the same syntax you’d expect on GitHub.

#### Supported Features

You can freely use:

-   Headings:

    ```md
    # Title

    ## Subtitle

    ### Section
    ```

-   Emphasis: `**bold**`, `*italic*`, `~~strikethrough~~`
-   Lists:

    ```md
    -   Item
    -   Item
        -   Nested
    ```

-   Links & images:

    ```md
    [Aeris Core](https://example.com)  
    ![Alt text](image.png)
    ```

-   Tables:

    ```md
    | Feature | Support |
    | ------- | ------- |
    | Tables  | Yes     |
    | Code    | Yes     |
    ```

-   Task lists:

    ```md
    -   [x] Done
    -   [ ] Todo
    ```

-   Code blocks with syntax highlighting:

    <pre>
    ```ts
    function hello() {
      console.log("world");
    }
    ```
    </pre>

This way, your module’s docs stay lightweight, readable, and version-controllable in plain Markdown files.
