
## Text Editor Types

-  #### Rich Text Editor
	- text + image
	- e.g. Microsoft Word, Libre Office
- #### Code Editor
	- IDE
	- code highlight, code suggestion
	- doesn't support image
	- e.g. JetBrains IDE, Visual Studio
- #### Hybrid Layout Editor
	- WYSIWYG Markdown editor
	- e.g. Typora
- #### Block-level Text Editor
	- similar to rich text formatting capabilities, yet possessing interactive functionality
	- e.g. Notion

## Aim

- WYSIWYG Markdown + Code Editor.
- Support Markdown syntax, code blocks are executable by configuring interpreter / compiler.
- E.g. ***This is Text***
``` python
# this is executable code block
print("Hello, world!")
---------------------------------------------------------------------
/> Hello, world!
```

- Avalonia + WebView2
![[Text Editor Structure.png]]