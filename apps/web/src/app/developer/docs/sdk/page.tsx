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

function MethodSection({
  signature,
  returnType,
  description,
  children,
}: {
  signature: string;
  returnType: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-6 last:border-b-0">
      <div className="mb-2 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3">
        <code className="text-sm text-blue-400">{signature}</code>
      </div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Returns:</span>
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
          {returnType}
        </code>
      </div>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
      {children}
    </div>
  );
}

function ParamTable({
  params,
}: {
  params: { name: string; type: string; description: string }[];
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="px-3 py-2 text-left font-semibold text-foreground">
              Parameter
            </th>
            <th className="px-3 py-2 text-left font-semibold text-foreground">
              Type
            </th>
            <th className="px-3 py-2 text-left font-semibold text-foreground">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2">
                <code className="text-xs text-blue-400">{p.name}</code>
              </td>
              <td className="px-3 py-2">
                <code className="text-xs text-neutral-300">{p.type}</code>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {p.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SdkReferencePage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/developer/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">SDK Reference</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">SDK Reference</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Complete API reference for <InlineCode>@arinova/app-sdk</InlineCode>,
          the client library that connects your app to the Arinova platform.
        </p>
      </div>

      {/* Table of Contents */}
      <div className="mb-10 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <nav className="space-y-1.5">
          {[
            ["Installation", "#installation"],
            ["Quick Setup", "#quick-setup"],
            ["API Reference", "#api-reference"],
            ["Types", "#types"],
            ["Actions", "#actions"],
            ["Events", "#events"],
            ["State Management", "#state-management"],
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

      {/* Installation */}
      <section className="mb-12" id="installation">
        <h2 className="mb-4 text-2xl font-bold">Installation</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>Install via your preferred package manager:</p>
          <CodeBlock title="npm">{`npm install @arinova/app-sdk`}</CodeBlock>
          <CodeBlock title="pnpm">{`pnpm add @arinova/app-sdk`}</CodeBlock>
          <CodeBlock title="yarn">{`yarn add @arinova/app-sdk`}</CodeBlock>
          <p>
            Then import in your app code:
          </p>
          <CodeBlock>{`import { ArinovaApp } from '@arinova/app-sdk';`}</CodeBlock>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm">
              <strong className="text-blue-400">Bundler-free usage:</strong> If
              you are not using a bundler, you can include the SDK as a script
              tag from your package. Just make sure{" "}
              <InlineCode>ArinovaApp</InlineCode> is accessible in your scope.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Setup */}
      <section className="mb-12" id="quick-setup">
        <h2 className="mb-4 text-2xl font-bold">Quick Setup</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Initialize the SDK, set your app context, and register action
            handlers:
          </p>
          <CodeBlock title="Minimal setup">{`import { ArinovaApp } from '@arinova/app-sdk';

const app = new ArinovaApp();

// Tell the platform about your current state and available actions
app.setContext({
  state: { score: 0, turn: 'player1' },
  actions: [
    {
      name: 'make_move',
      description: 'Place a piece on the board',
      params: { row: { type: 'number' }, col: { type: 'number' } },
    },
  ],
});

// Handle actions from the agent
app.onAction('make_move', (params) => {
  const { row, col } = params;
  placePiece(row, col);
});

// Handle lifecycle events
app.onReady(() => {
  console.log('Connected to Arinova platform');
});`}</CodeBlock>
        </div>
      </section>

      {/* API Reference */}
      <section className="mb-12" id="api-reference">
        <h2 className="mb-4 text-2xl font-bold">API Reference</h2>

        {/* Constructor */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Constructor</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature="new ArinovaApp()"
            returnType="ArinovaApp"
            description="Creates a new ArinovaApp instance and begins listening for messages from the Arinova platform via the window.postMessage API. Call this once when your app initializes."
          >
            <CodeBlock>{`const app = new ArinovaApp();`}</CodeBlock>
          </MethodSection>
        </div>

        {/* State Management */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">State Management</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature="app.setContext(ctx: AppContext)"
            returnType="void"
            description="Push current state and available actions to the platform. This is the primary way to communicate your app's state to connected AI agents. Call this whenever your state changes so agents always have an up-to-date view."
          >
            <ParamTable
              params={[
                {
                  name: "ctx",
                  type: "AppContext",
                  description:
                    "Object with state (Record<string, unknown>), actions (ActionDefinition[]), and optional humanLabel (string).",
                },
              ]}
            />
            <CodeBlock>{`app.setContext({
  state: {
    board: [[null, null, null], [null, null, null], [null, null, null]],
    currentPlayer: 'X',
    gameOver: false,
  },
  actions: [
    {
      name: 'place_mark',
      description: 'Place X or O on the board',
      params: {
        row: { type: 'number', description: 'Row (0-2)' },
        col: { type: 'number', description: 'Column (0-2)' },
      },
    },
  ],
  humanLabel: 'Your turn — tap a cell to place X',
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.setStateForRole(role: string, ctx: AppContext)"
            returnType="void"
            description="Push state for a specific role. Use this in multi-role apps where different participants should see different state (partial observability). For example, in a card game, each player should only see their own hand."
          >
            <ParamTable
              params={[
                {
                  name: "role",
                  type: "string",
                  description: "The role name as defined in your manifest's roles field.",
                },
                {
                  name: "ctx",
                  type: "AppContext",
                  description:
                    "The context object with state, actions, and optional humanLabel for this specific role.",
                },
              ]}
            />
            <CodeBlock>{`// Show different state to different roles
app.setStateForRole('player1', {
  state: { hand: ['Ace', 'King', '10'], opponentCardCount: 3 },
  actions: [{ name: 'play_card', description: 'Play a card from your hand' }],
});

app.setStateForRole('player2', {
  state: { hand: ['Queen', '7', '3'], opponentCardCount: 3 },
  actions: [{ name: 'play_card', description: 'Play a card from your hand' }],
});`}</CodeBlock>
          </MethodSection>
        </div>

        {/* Action Handling */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Action Handling</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature="app.onAction(name: string, handler: (params: Record<string, unknown>) => void)"
            returnType="void"
            description="Register a handler for a specific action. When the platform sends an action with the given name (triggered by an agent or the platform), the handler is called with the action parameters."
          >
            <ParamTable
              params={[
                {
                  name: "name",
                  type: "string",
                  description: "The action name to listen for.",
                },
                {
                  name: "handler",
                  type: "(params: Record<string, unknown>) => void",
                  description: "Callback invoked with the action parameters.",
                },
              ]}
            />
            <CodeBlock>{`app.onAction('make_move', (params) => {
  const row = params.row as number;
  const col = params.col as number;
  placePiece(row, col);
  updateBoard();
});

app.onAction('reset_game', () => {
  resetBoard();
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.onAnyAction(handler: (params: Record<string, unknown>) => void)"
            returnType="void"
            description="Register a catch-all handler that is called for any action that does not have a specific handler registered via onAction(). Useful for logging, debugging, or handling dynamic actions."
          >
            <ParamTable
              params={[
                {
                  name: "handler",
                  type: "(params: Record<string, unknown>) => void",
                  description:
                    "Callback invoked for unhandled actions.",
                },
              ]}
            />
            <CodeBlock>{`app.onAnyAction((params) => {
  console.log('Unhandled action received:', params);
});`}</CodeBlock>
          </MethodSection>
        </div>

        {/* Events */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Events</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature="app.emit(eventName: string, payload?: Record<string, unknown>)"
            returnType="void"
            description="Emit an event to connected agents. Events are one-way notifications that inform agents about something that happened in the app. Unlike state updates, events represent discrete occurrences."
          >
            <ParamTable
              params={[
                {
                  name: "eventName",
                  type: "string",
                  description: "Name of the event.",
                },
                {
                  name: "payload",
                  type: "Record<string, unknown>",
                  description: "Optional data payload. Defaults to an empty object.",
                },
              ]}
            />
            <CodeBlock>{`// Notify the agent that a game ended
app.emit('game_over', {
  winner: 'player1',
  finalScore: 42,
  duration: 120,
});

// Simple event with no payload
app.emit('timer_expired');`}</CodeBlock>
          </MethodSection>
        </div>

        {/* Control Mode */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Control Mode</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature={`app.onControlModeChanged(handler: (mode: ControlMode) => void)`}
            returnType="void"
            description={`Listen for control mode changes. The platform calls this when the control mode switches between "agent", "human", or "copilot". Use this to enable/disable human UI controls appropriately.`}
          >
            <ParamTable
              params={[
                {
                  name: "handler",
                  type: '(mode: "agent" | "human" | "copilot") => void',
                  description: "Callback invoked with the new control mode.",
                },
              ]}
            />
            <CodeBlock>{`app.onControlModeChanged((mode) => {
  if (mode === 'agent') {
    // Disable all interactive elements
    document.querySelectorAll('button').forEach(b => b.disabled = true);
  } else {
    // Enable interactive elements
    document.querySelectorAll('button').forEach(b => b.disabled = false);
  }
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.reportHumanAction(name: string, params?: Record<string, unknown>)"
            returnType="void"
            description={`Report a human action taken directly on the app UI. This notifies the connected agent about what the user did, keeping the agent aware of all changes — essential in copilot mode.`}
          >
            <ParamTable
              params={[
                {
                  name: "name",
                  type: "string",
                  description: "The action name (should match a defined action).",
                },
                {
                  name: "params",
                  type: "Record<string, unknown>",
                  description: "Optional parameters describing the action. Defaults to empty object.",
                },
              ]}
            />
            <CodeBlock>{`// User clicked a cell in tic-tac-toe
cellElement.addEventListener('click', () => {
  placePiece(row, col);
  app.reportHumanAction('place_mark', { row, col });
});`}</CodeBlock>
          </MethodSection>
        </div>

        {/* Monetization */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Monetization</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature="app.registerProducts(products: ProductDefinition[])"
            returnType="void"
            description="Register purchasable products for this app session. Call this at startup to declare which in-app purchases are available. Products are paid with Arinova Coins."
          >
            <ParamTable
              params={[
                {
                  name: "products",
                  type: "ProductDefinition[]",
                  description:
                    "Array of products. Each has: id (string), name (string), price (number in coins), icon (optional string).",
                },
              ]}
            />
            <CodeBlock>{`app.registerProducts([
  {
    id: 'extra_lives_3',
    name: '3 Extra Lives',
    price: 50,
    icon: 'assets/heart.png',
  },
  {
    id: 'premium_skin',
    name: 'Gold Skin',
    price: 200,
    icon: 'assets/gold-skin.png',
  },
]);`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.requestPurchase(productId: string)"
            returnType="Promise<PurchaseReceipt>"
            description="Request a purchase of a registered product. The platform shows a confirmation dialog to the user. Returns a Promise that resolves with a PurchaseReceipt on success, or rejects with an Error if the purchase was cancelled or failed."
          >
            <ParamTable
              params={[
                {
                  name: "productId",
                  type: "string",
                  description: "The ID of the product to purchase (must match a registered product).",
                },
              ]}
            />
            <CodeBlock>{`try {
  const receipt = await app.requestPurchase('extra_lives_3');
  console.log('Purchase successful!', receipt.receiptId);
  console.log('Product:', receipt.productId);
  console.log('Timestamp:', receipt.timestamp);
  addLives(3);
} catch (err) {
  console.log('Purchase cancelled or failed:', err.message);
}`}</CodeBlock>
          </MethodSection>
        </div>

        {/* Lifecycle */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Lifecycle</h3>
        <div className="rounded-lg border border-border">
          <MethodSection
            signature="app.onReady(handler: () => void)"
            returnType="void"
            description="Called when the platform has finished loading the app and it is ready to receive actions. Use this to perform initial setup, send the first context update, and start any timers or animations."
          >
            <CodeBlock>{`app.onReady(() => {
  initializeGame();
  app.setContext({
    state: getGameState(),
    actions: getAvailableActions(),
  });
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.onPause(handler: () => void)"
            returnType="void"
            description="Called when the app is paused (e.g. the user scrolled away from the conversation, or the app is no longer visible). Pause animations, timers, and audio to save resources."
          >
            <CodeBlock>{`app.onPause(() => {
  pauseAnimations();
  pauseAudio();
  clearInterval(gameTimer);
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.onResume(handler: () => void)"
            returnType="void"
            description="Called when the app becomes visible again after being paused. Resume animations, timers, and audio."
          >
            <CodeBlock>{`app.onResume(() => {
  resumeAnimations();
  resumeAudio();
  gameTimer = setInterval(tick, 1000);
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.onDestroy(handler: () => void)"
            returnType="void"
            description="Called when the app is about to be removed from the DOM. Clean up all resources, event listeners, and call app.dispose(). After this callback, the app instance should not be used."
          >
            <CodeBlock>{`app.onDestroy(() => {
  saveGameState();
  clearInterval(gameTimer);
  app.dispose(); // Remove internal event listeners
});`}</CodeBlock>
          </MethodSection>

          <MethodSection
            signature="app.dispose()"
            returnType="void"
            description="Clean up the SDK's internal window.postMessage event listener. Call this in your onDestroy handler or when you no longer need the SDK instance."
          >
            <CodeBlock>{`// Typically called inside onDestroy
app.onDestroy(() => {
  app.dispose();
});`}</CodeBlock>
          </MethodSection>
        </div>
      </section>

      {/* Types */}
      <section className="mb-12" id="types">
        <h2 className="mb-4 text-2xl font-bold">Types</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            The SDK exports the following TypeScript types and interfaces:
          </p>

          <CodeBlock title="Exported types">{`// Action definition for setContext
interface ActionDefinition {
  name: string;
  description: string;
  params?: Record<string, unknown>;  // JSON Schema for parameters
  humanOnly?: boolean;               // Only humans can trigger
  agentOnly?: boolean;               // Only agents can trigger
}

// App context passed to setContext / setStateForRole
interface AppContext {
  state: Record<string, unknown>;    // Current app state
  actions: ActionDefinition[];       // Available actions
  humanLabel?: string;               // Optional label shown to human users
}

// Extended context with optional prompt (used internally for roles)
interface RoleContext extends AppContext {
  prompt?: string;
}

// Product for in-app purchases
interface ProductDefinition {
  id: string;
  name: string;
  price: number;          // Price in Arinova Coins
  icon?: string;          // Optional icon path
}

// Receipt returned after successful purchase
interface PurchaseReceipt {
  receiptId: string;      // Unique receipt identifier
  productId: string;      // Purchased product ID
  timestamp: number;      // Unix timestamp of purchase
}

// Control mode
type ControlMode = "agent" | "human" | "copilot";`}</CodeBlock>
        </div>
      </section>

      {/* Actions deep dive */}
      <section className="mb-12" id="actions">
        <h2 className="mb-4 text-2xl font-bold">Actions</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Actions are the primary way agents interact with your app. They are
            named commands with optional parameters that your app handles.
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Defining actions
          </h3>
          <p>
            Actions are defined in the <InlineCode>actions</InlineCode> array
            when calling <InlineCode>setContext()</InlineCode>. Each action has
            a name, description, and optional parameter schema:
          </p>
          <CodeBlock>{`const actions = [
  {
    name: 'place_piece',
    description: 'Place a piece on the board at the given position',
    params: {
      row: { type: 'number', description: 'Row index (0-2)' },
      col: { type: 'number', description: 'Column index (0-2)' },
    },
  },
  {
    name: 'forfeit',
    description: 'Give up the current game',
    // No params needed
  },
];`}</CodeBlock>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Access control flags
          </h3>
          <p>
            You can restrict who can trigger an action using the{" "}
            <InlineCode>humanOnly</InlineCode> and{" "}
            <InlineCode>agentOnly</InlineCode> flags:
          </p>
          <CodeBlock>{`const actions = [
  {
    name: 'hint',
    description: 'Request a hint from the AI',
    humanOnly: true,   // Only humans can trigger this
  },
  {
    name: 'analyze_position',
    description: 'Run deep analysis on current position',
    agentOnly: true,   // Only agents can trigger this
  },
  {
    name: 'make_move',
    description: 'Make a move',
    // Both humans and agents can trigger (default)
  },
];`}</CodeBlock>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Dynamic actions
          </h3>
          <p>
            When your agent interface mode is <InlineCode>dynamic</InlineCode>,
            you can change the available actions at any time by calling{" "}
            <InlineCode>setContext()</InlineCode> with a new actions array. The
            agent will always see the latest set of actions.
          </p>
          <CodeBlock>{`// After a game ends, change available actions
app.setContext({
  state: { gameOver: true, winner: 'X' },
  actions: [
    { name: 'new_game', description: 'Start a new game' },
    { name: 'view_stats', description: 'View game statistics' },
  ],
});`}</CodeBlock>
        </div>
      </section>

      {/* Events deep dive */}
      <section className="mb-12" id="events">
        <h2 className="mb-4 text-2xl font-bold">Events</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Events are one-way notifications from your app to connected agents.
            Unlike state (which represents the current snapshot), events
            represent discrete things that happened.
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Concept
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    State
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Events
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">Nature</td>
                  <td className="px-4 py-3">
                    Continuous snapshot of current app state
                  </td>
                  <td className="px-4 py-3">Discrete occurrence</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">Delivery</td>
                  <td className="px-4 py-3">
                    Latest value always available to agent
                  </td>
                  <td className="px-4 py-3">Fire-and-forget, may be missed</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-foreground">Example</td>
                  <td className="px-4 py-3">
                    <InlineCode>{`{ score: 42 }`}</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>score_changed</InlineCode>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <CodeBlock title="Event examples">{`// Game lifecycle events
app.emit('round_started', { roundNumber: 3 });
app.emit('player_scored', { player: 'X', points: 10 });
app.emit('game_over', { winner: 'X', finalScore: 42 });

// Error events
app.emit('invalid_move_attempted', { reason: 'Cell already occupied' });

// UI events
app.emit('user_opened_settings');
app.emit('animation_complete', { animation: 'victory_dance' });`}</CodeBlock>
        </div>
      </section>

      {/* State Management */}
      <section className="mb-12" id="state-management">
        <h2 className="mb-4 text-2xl font-bold">State Management</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            State is how your app communicates its current situation to AI
            agents. The agent reads your state to decide what action to take
            next.
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            State size limits
          </h3>
          <p>
            When using <InlineCode>dynamic</InlineCode> agent interface mode,
            your state is subject to the{" "}
            <InlineCode>maxStateSize</InlineCode> limit defined in your
            manifest&apos;s <InlineCode>agentInterface</InlineCode> section.
            This is measured in bytes when the state object is serialized to
            JSON.
          </p>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-sm">
              <strong className="text-yellow-400">Keep state lean.</strong>{" "}
              Only include information the agent needs to make decisions. Avoid
              sending raw pixel data, large arrays, or redundant information.
              A typical game state should be well under 4 KB.
            </p>
          </div>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Best practices
          </h3>
          <ul className="list-disc list-inside space-y-2">
            <li>
              Call <InlineCode>setContext()</InlineCode> after every meaningful
              state change
            </li>
            <li>
              Include only the state the agent needs -- not your entire internal
              app state
            </li>
            <li>
              Update the actions array when available actions change (e.g. game
              over means no more moves)
            </li>
            <li>
              Use <InlineCode>humanLabel</InlineCode> to give users a hint
              about what to do
            </li>
            <li>
              Use <InlineCode>setStateForRole()</InlineCode> for multi-player
              games with hidden information
            </li>
          </ul>
        </div>
      </section>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Link
          href="/developer/docs/manifest"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Manifest Reference
        </Link>
        <Link
          href="/developer/docs/submission"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Submission Guide &rarr;
        </Link>
      </div>
    </div>
  );
}
