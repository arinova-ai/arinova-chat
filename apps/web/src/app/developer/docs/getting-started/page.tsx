"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      {title && (
        <div className="border-b border-border bg-neutral-800 px-4 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto bg-neutral-900 p-4">
        <code className="text-sm leading-relaxed text-neutral-200">
          {children}
        </code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-sm text-neutral-200">
      {children}
    </code>
  );
}

export default function GettingStartedPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Link
            href="/developer/docs"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Getting Started</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Getting Started</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Build your first Arinova App from scratch. This guide walks you
          through everything you need to know to get up and running.
        </p>
      </div>

      {/* Table of Contents */}
      <div className="mb-10 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <nav className="space-y-1.5">
          {[
            ["What is an Arinova App?", "#what-is-an-arinova-app"],
            ["Prerequisites", "#prerequisites"],
            ["Project Structure", "#project-structure"],
            ["Quick Start: Hello World", "#quick-start"],
            ["Control Modes", "#control-modes"],
            ["Next Steps", "#next-steps"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* Section: What is an Arinova App? */}
      <section className="mb-12" id="what-is-an-arinova-app">
        <h2 className="mb-4 text-2xl font-bold">What is an Arinova App?</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Arinova Apps are interactive web applications that run inside{" "}
            <strong className="text-foreground">sandboxed iframes</strong>{" "}
            within Arinova Chat conversations. They bridge the gap between
            AI agents and humans, creating shared interactive experiences that
            either party -- or both -- can control.
          </p>
          <p>
            Unlike traditional chatbot integrations, Arinova Apps provide a{" "}
            <strong className="text-foreground">visual, stateful interface</strong>{" "}
            that agents can read and manipulate programmatically while users
            interact with it directly. Think of it as giving AI agents hands
            inside your conversation.
          </p>
          <div className="rounded-lg border border-border bg-neutral-900 p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">
              Example use cases
            </p>
            <ul className="space-y-1.5 text-sm">
              <li>
                <strong className="text-foreground">Games</strong> -- Tic-tac-toe, chess, trivia
                games where an agent plays against a human
              </li>
              <li>
                <strong className="text-foreground">Tools</strong> -- Calculators, form builders,
                code editors that agents can populate
              </li>
              <li>
                <strong className="text-foreground">Dashboards</strong> -- Data visualizations that
                agents update in real-time
              </li>
              <li>
                <strong className="text-foreground">Shopping</strong> -- Product catalogs where
                agents guide users through purchasing decisions
              </li>
              <li>
                <strong className="text-foreground">Interactive widgets</strong> -- Polls, surveys,
                collaborative whiteboards
              </li>
            </ul>
          </div>
          <p>
            Apps communicate with the Arinova platform via the{" "}
            <InlineCode>@arinova/app-sdk</InlineCode>, a lightweight library
            that handles all messaging between your app, the platform, and
            connected AI agents.
          </p>
        </div>
      </section>

      {/* Section: Prerequisites */}
      <section className="mb-12" id="prerequisites">
        <h2 className="mb-4 text-2xl font-bold">Prerequisites</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>Before you begin, make sure you have the following:</p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Requirement
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Node.js
                  </td>
                  <td className="px-4 py-3">
                    v18 or higher. Required for the SDK and build tools.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    npm, pnpm, or yarn
                  </td>
                  <td className="px-4 py-3">
                    Any package manager for installing the SDK.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    HTML/CSS/JS knowledge
                  </td>
                  <td className="px-4 py-3">
                    Apps are standard web apps. No framework required.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">
                    Developer account
                  </td>
                  <td className="px-4 py-3">
                    Register in the{" "}
                    <Link
                      href="/developer"
                      className="text-blue-400 hover:underline"
                    >
                      Developer Console
                    </Link>{" "}
                    to submit apps.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm">
              <strong className="text-blue-400">Tip:</strong> You do not need a
              framework like React or Vue. Arinova Apps can be plain HTML, CSS,
              and JavaScript. Use whatever you are comfortable with.
            </p>
          </div>
        </div>
      </section>

      {/* Section: Project Structure */}
      <section className="mb-12" id="project-structure">
        <h2 className="mb-4 text-2xl font-bold">Project Structure</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            An Arinova App is a directory of static web assets with a{" "}
            <InlineCode>manifest.json</InlineCode> at the root. Here is the
            minimal structure:
          </p>
          <CodeBlock title="Project structure">{`my-app/
├── manifest.json    # App metadata & configuration (required)
├── index.html       # Entry point (referenced in manifest.ui.entry)
├── app.js           # Your app logic + SDK initialization
├── style.css        # Styles
└── assets/          # Images, fonts, audio, etc.
    ├── icon.png
    └── logo.svg`}</CodeBlock>
          <p>
            The only hard requirement is that{" "}
            <InlineCode>manifest.json</InlineCode> exists at the root of your
            zip package and its <InlineCode>ui.entry</InlineCode> field points to
            a valid HTML file.
          </p>
          <p>
            You can use any directory structure you like inside the package.
            Build tools like Vite, Webpack, or Parcel all work -- just make sure
            the output includes the manifest and entry point.
          </p>
        </div>
      </section>

      {/* Section: Quick Start */}
      <section className="mb-12" id="quick-start">
        <h2 className="mb-4 text-2xl font-bold">Quick Start: Hello World</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Let us build a simple app that an AI agent can interact with. The
            app displays a greeting message, and the agent can trigger a
            &ldquo;say_hello&rdquo; action to change it.
          </p>

          {/* Step 1 */}
          <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
            Step 1: Create manifest.json
          </h3>
          <p>
            Every app needs a manifest. Here is a minimal working example:
          </p>
          <CodeBlock title="manifest.json">{`{
  "manifest_version": 1,
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A simple Hello World app to demonstrate the Arinova SDK",
  "author": {
    "name": "Your Name"
  },
  "category": "tool",
  "tags": ["demo", "hello-world"],
  "icon": "assets/icon.png",

  "ui": {
    "entry": "index.html",
    "viewport": {
      "minWidth": 300,
      "maxWidth": 600,
      "aspectRatio": "flexible",
      "orientation": "any"
    }
  },

  "platforms": {
    "web": true,
    "ios": true,
    "android": true
  },

  "players": {
    "min": 1,
    "max": 1
  },

  "roles": {
    "shared": {
      "actions": [
        {
          "name": "say_hello",
          "description": "Display a greeting message",
          "params": {
            "name": { "type": "string", "description": "Name to greet" }
          }
        }
      ],
      "events": [
        {
          "name": "greeting_shown",
          "description": "Emitted after a greeting is displayed"
        }
      ]
    }
  },

  "agentInterface": {
    "mode": "dynamic",
    "description": "A Hello World app. Use the say_hello action to greet someone.",
    "maxStateSize": 1024,
    "maxActions": 5
  },

  "interaction": {
    "controlModes": ["agent", "human", "copilot"],
    "defaultMode": "copilot",
    "humanInput": "both"
  },

  "monetization": {
    "model": "free",
    "virtualGoods": false,
    "externalPayments": false
  },

  "rating": {
    "age": "4+",
    "descriptors": []
  },

  "permissions": []
}`}</CodeBlock>

          {/* Step 2 */}
          <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
            Step 2: Create index.html
          </h3>
          <p>
            Create your entry point HTML file. We will include the SDK via a
            script tag and write our app logic inline for simplicity.
          </p>
          <CodeBlock title="index.html">{`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello World</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 16px;
    }
    #greeting {
      font-size: 1.25rem;
      color: #a3a3a3;
      margin-bottom: 24px;
    }
    input {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #e5e5e5;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 1rem;
      width: 100%;
      margin-bottom: 12px;
    }
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      width: 100%;
    }
    button:hover { background: #2563eb; }
    .mode-badge {
      margin-top: 16px;
      font-size: 0.75rem;
      color: #737373;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p id="greeting">Waiting for a greeting...</p>
    <input id="name-input" type="text" placeholder="Enter a name" />
    <button id="greet-btn">Say Hello</button>
    <p class="mode-badge">Mode: <span id="mode">loading...</span></p>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>`}</CodeBlock>

          {/* Step 3 */}
          <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
            Step 3: Create app.js with SDK
          </h3>
          <p>
            Install the SDK with npm, or include it from your bundler. Then
            initialize it and wire up your logic.
          </p>
          <CodeBlock title="Terminal">{`npm install @arinova/app-sdk`}</CodeBlock>
          <CodeBlock title="app.js">{`import { ArinovaApp } from '@arinova/app-sdk';

// Initialize the SDK
const app = new ArinovaApp();

// DOM elements
const greetingEl = document.getElementById('greeting');
const nameInput = document.getElementById('name-input');
const greetBtn = document.getElementById('greet-btn');
const modeEl = document.getElementById('mode');

// --- State ---
let currentGreeting = 'Waiting for a greeting...';
let currentMode = 'loading';

function updateUI() {
  greetingEl.textContent = currentGreeting;
  modeEl.textContent = currentMode;
}

function sayHello(name) {
  currentGreeting = name ? \`Hello, \${name}!\` : 'Hello, World!';
  updateUI();

  // Update the context so the agent can see current state
  app.setContext({
    state: { greeting: currentGreeting },
    actions: [
      {
        name: 'say_hello',
        description: 'Display a greeting message',
        params: { name: { type: 'string', description: 'Name to greet' } },
      },
    ],
  });

  // Emit an event so the agent knows a greeting was shown
  app.emit('greeting_shown', { greeting: currentGreeting });
}

// --- Handle actions from the agent ---
app.onAction('say_hello', (params) => {
  sayHello(params.name);
});

// --- Handle human input ---
greetBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  sayHello(name);

  // Report human action so the agent is aware
  app.reportHumanAction('say_hello', { name });
});

// --- Handle control mode changes ---
app.onControlModeChanged((mode) => {
  currentMode = mode;
  updateUI();

  // Optionally disable human input in agent-only mode
  const isHumanAllowed = mode === 'human' || mode === 'copilot';
  nameInput.disabled = !isHumanAllowed;
  greetBtn.disabled = !isHumanAllowed;
});

// --- Lifecycle ---
app.onReady(() => {
  console.log('App is ready!');

  // Set initial context
  app.setContext({
    state: { greeting: currentGreeting },
    actions: [
      {
        name: 'say_hello',
        description: 'Display a greeting message',
        params: { name: { type: 'string', description: 'Name to greet' } },
      },
    ],
  });
});

app.onPause(() => {
  console.log('App paused');
});

app.onResume(() => {
  console.log('App resumed');
});

app.onDestroy(() => {
  console.log('App destroyed — clean up resources');
  app.dispose();
});`}</CodeBlock>

          {/* Step 4 */}
          <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
            Step 4: Test locally
          </h3>
          <p>
            Use the{" "}
            <Link
              href="/developer/test"
              className="text-blue-400 hover:underline"
            >
              Test Sandbox
            </Link>{" "}
            in the Developer Console to load your app in a simulated environment
            and send test actions to it.
          </p>

          {/* Step 5 */}
          <h3 className="text-xl font-semibold text-foreground mt-8 mb-3">
            Step 5: Package and submit
          </h3>
          <p>
            When you are ready, zip your project directory (with{" "}
            <InlineCode>manifest.json</InlineCode> at the root) and submit it
            through the{" "}
            <Link
              href="/developer"
              className="text-blue-400 hover:underline"
            >
              Developer Dashboard
            </Link>
            . See the{" "}
            <Link
              href="/developer/docs/submission"
              className="text-blue-400 hover:underline"
            >
              Submission Guide
            </Link>{" "}
            for details.
          </p>
        </div>
      </section>

      {/* Section: Control Modes */}
      <section className="mb-12" id="control-modes">
        <h2 className="mb-4 text-2xl font-bold">Control Modes</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Every Arinova App operates in one of three control modes, which
            determine who can interact with the app at any given time:
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Mode
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Who controls?
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Use case
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>agent</InlineCode>
                  </td>
                  <td className="px-4 py-3">AI agent only</td>
                  <td className="px-4 py-3">
                    Fully automated apps, demos, AI showcases
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <InlineCode>human</InlineCode>
                  </td>
                  <td className="px-4 py-3">Human user only</td>
                  <td className="px-4 py-3">
                    User-driven tools, forms, direct interaction
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <InlineCode>copilot</InlineCode>
                  </td>
                  <td className="px-4 py-3">Both agent and human</td>
                  <td className="px-4 py-3">
                    Collaborative experiences, assisted workflows
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            The default mode is set in your manifest&apos;s{" "}
            <InlineCode>interaction.defaultMode</InlineCode> field. The platform
            or user can switch modes at runtime, and your app is notified via
            the <InlineCode>onControlModeChanged</InlineCode> callback:
          </p>

          <CodeBlock title="Handling mode changes">{`app.onControlModeChanged((mode) => {
  if (mode === 'agent') {
    // Disable all human UI controls
    disableUserInput();
  } else if (mode === 'human') {
    // Enable human controls, agent won't send actions
    enableUserInput();
  } else if (mode === 'copilot') {
    // Both can interact — keep everything enabled
    enableUserInput();
  }
});`}</CodeBlock>

          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-sm">
              <strong className="text-yellow-400">Important:</strong> Always
              handle all three modes. When in <InlineCode>agent</InlineCode>{" "}
              mode, you should visually disable or hide human input controls to
              clearly communicate that the agent is in charge.
            </p>
          </div>

          <p>
            When a human takes an action in <InlineCode>copilot</InlineCode>{" "}
            mode, use <InlineCode>app.reportHumanAction()</InlineCode> to notify
            the agent so it stays aware of what the user did:
          </p>

          <CodeBlock>{`// User clicks a button in the UI
greetBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  sayHello(name);

  // Let the agent know what happened
  app.reportHumanAction('say_hello', { name });
});`}</CodeBlock>
        </div>
      </section>

      {/* Section: Next Steps */}
      <section className="mb-12" id="next-steps">
        <h2 className="mb-4 text-2xl font-bold">Next Steps</h2>
        <div className="space-y-3">
          <Link
            href="/developer/docs/manifest"
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-neutral-800/50"
          >
            <div>
              <p className="font-semibold text-foreground">
                Manifest Reference
              </p>
              <p className="text-sm text-muted-foreground">
                Learn every field in manifest.json, including permissions,
                categories, and validation rules.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Link
            href="/developer/docs/sdk"
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-neutral-800/50"
          >
            <div>
              <p className="font-semibold text-foreground">SDK Reference</p>
              <p className="text-sm text-muted-foreground">
                Explore the full API for state management, actions, events, and
                lifecycle hooks.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Link
            href="/developer/docs/submission"
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-neutral-800/50"
          >
            <div>
              <p className="font-semibold text-foreground">Submission Guide</p>
              <p className="text-sm text-muted-foreground">
                How to package, validate, and submit your app for publishing.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </section>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Link
          href="/developer/docs"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Documentation Index
        </Link>
        <Link
          href="/developer/docs/manifest"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Manifest Reference &rarr;
        </Link>
      </div>
    </div>
  );
}
