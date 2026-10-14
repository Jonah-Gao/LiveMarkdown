# LiveMarkdown

LiveMarkdown is a desktop Markdown editor for writing and running executable code blocks directly inside a document. It is designed to provide a notebook-like workflow: write Markdown, add code blocks, execute them, and view the output alongside the document.

> This project was created as a Computer Science NEA project.

## Key features

- Markdown editing with a live document workflow
- Execute code blocks directly from the document, similar to a Jupyter Notebook
- View code execution output alongside the relevant document content
- Desktop application built with Electron
- Monaco Editor integration for a capable code-editing experience
- Frontend and backend communication using SignalR
- Integrated terminal functionality

## Technology stack

- **Frontend:** Vue 3, TypeScript, Vite, Pinia
- **Desktop runtime:** Electron
- **Editor:** Monaco Editor
- **Backend:** C# and ASP.NET Core on .NET 9
- **Communication:** SignalR
- **Testing:** Vitest and xUnit

## Repository structure

```text
.
├── client/                 # Vue, TypeScript, Vite, and Electron application
│   ├── electron/           # Electron process code
│   ├── src/                # Frontend source code
│   └── tests/              # Frontend tests
├── kernel/                 # ASP.NET Core backend
│   ├── kernel/             # Backend project
│   └── kernel.Tests/       # Backend tests
├── docs/                   # Project documentation
└── LICENSE                 # MIT license
```

## Requirements

- Node.js and npm
- .NET SDK 9.0
- Git

## Getting started

Clone the repository and install the frontend dependencies:

```sh
git clone https://github.com/JonahGao786/LiveMarkdown.git
cd LiveMarkdown/client
npm install
```

Start the frontend development server:

```sh
npm run dev
```

Start the Electron application:

```sh
npm start
```

To run the backend separately from the repository root:

```sh
dotnet restore kernel/kernel.sln
dotnet run --project kernel/kernel/kernel.csproj
```

## Build and test

Build the client and Electron application:

```sh
cd client
npm run build
```

Run frontend tests:

```sh
cd client
npm test
```

Run backend tests:

```sh
dotnet test kernel/kernel.sln
```

## License

LiveMarkdown is licensed under the [MIT License](LICENSE).
