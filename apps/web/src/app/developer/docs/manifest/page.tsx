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

function FieldRow({
  name,
  type,
  required,
  children,
}: {
  name: string;
  type: string;
  required: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <code className="text-sm font-semibold text-blue-400">{name}</code>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-muted-foreground">
          {type}
        </span>
        {required ? (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-400">
            required
          </span>
        ) : (
          <span className="rounded bg-neutral-500/10 px-1.5 py-0.5 text-xs text-neutral-400">
            optional
          </span>
        )}
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export default function ManifestReferencePage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/developer/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Manifest Reference</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Manifest Reference</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Complete reference for <InlineCode>manifest.json</InlineCode> -- the
          configuration file that defines your app&apos;s metadata, permissions,
          UI, and capabilities.
        </p>
      </div>

      {/* Table of Contents */}
      <div className="mb-10 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <nav className="space-y-1.5">
          {[
            ["Overview", "#overview"],
            ["Full Example", "#full-example"],
            ["Field Reference", "#field-reference"],
            ["Permission Tiers", "#permission-tiers"],
            ["Validation Rules", "#validation-rules"],
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

      {/* Overview */}
      <section className="mb-12" id="overview">
        <h2 className="mb-4 text-2xl font-bold">Overview</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Every Arinova App must include a <InlineCode>manifest.json</InlineCode>{" "}
            file at the root of its package. This file tells the platform
            everything it needs to know about your app: what it is called, what
            it can do, what permissions it needs, and how agents should interact
            with it.
          </p>
          <p>
            The manifest is validated against a strict schema when you submit
            your app. If validation fails, the submission is rejected with
            specific error messages pointing to the invalid fields.
          </p>
        </div>
      </section>

      {/* Full Example */}
      <section className="mb-12" id="full-example">
        <h2 className="mb-4 text-2xl font-bold">Full Example</h2>
        <p className="mb-4 text-muted-foreground">
          A complete manifest with all required fields and common optional
          fields:
        </p>
        <CodeBlock title="manifest.json">{`{
  "manifest_version": 1,
  "id": "my-awesome-app",
  "name": "My Awesome App",
  "version": "1.0.0",
  "description": "An interactive app that demonstrates the Arinova platform",
  "author": {
    "name": "Jane Developer",
    "url": "https://janedeveloper.com"
  },
  "category": "game",
  "tags": ["puzzle", "multiplayer", "strategy"],
  "icon": "assets/icon.png",
  "screenshots": ["assets/screenshot1.png", "assets/screenshot2.png"],
  "sdkVersion": "1.0.0",

  "ui": {
    "entry": "index.html",
    "viewport": {
      "minWidth": 320,
      "maxWidth": 800,
      "aspectRatio": "16:9",
      "orientation": "landscape"
    }
  },

  "platforms": {
    "web": true,
    "ios": true,
    "android": true
  },

  "players": {
    "min": 1,
    "max": 4
  },

  "roles": {
    "player": {
      "prompt": "You are playing as a player in this game. Make strategic moves.",
      "state": {
        "score": { "type": "number" },
        "board": { "type": "array" }
      },
      "actions": [
        {
          "name": "make_move",
          "description": "Place a piece on the board",
          "params": {
            "row": { "type": "number", "description": "Row index (0-2)" },
            "col": { "type": "number", "description": "Column index (0-2)" }
          }
        }
      ],
      "events": [
        {
          "name": "move_made",
          "description": "A move was made on the board",
          "payload": { "row": { "type": "number" }, "col": { "type": "number" } }
        }
      ]
    },
    "shared": {
      "events": [
        {
          "name": "game_over",
          "description": "The game has ended",
          "payload": { "winner": { "type": "string" } }
        }
      ]
    }
  },

  "agentInterface": {
    "mode": "dynamic",
    "description": "A turn-based strategy game. Use make_move to place pieces.",
    "maxStateSize": 4096,
    "maxActions": 10
  },

  "interaction": {
    "controlModes": ["agent", "human", "copilot"],
    "defaultMode": "copilot",
    "humanInput": "both"
  },

  "monetization": {
    "model": "freemium",
    "virtualGoods": true,
    "externalPayments": false
  },

  "rating": {
    "age": "4+",
    "descriptors": []
  },

  "permissions": ["storage"],

  "network": {
    "allowed": []
  }
}`}</CodeBlock>
      </section>

      {/* Field Reference */}
      <section className="mb-12" id="field-reference">
        <h2 className="mb-4 text-2xl font-bold">Field Reference</h2>

        {/* Top-level fields */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">Top-level fields</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="manifest_version" type="number" required>
            Schema version number. Must be a positive integer. Currently{" "}
            <InlineCode>1</InlineCode>.
          </FieldRow>
          <FieldRow name="id" type="string" required>
            Unique app identifier. Must be lowercase kebab-case (
            <InlineCode>a-z</InlineCode>, <InlineCode>0-9</InlineCode>,{" "}
            <InlineCode>-</InlineCode>). Max 100 characters. Examples:{" "}
            <InlineCode>tic-tac-toe</InlineCode>,{" "}
            <InlineCode>weather-dashboard</InlineCode>. Must match the regex{" "}
            <InlineCode>{`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`}</InlineCode>.
          </FieldRow>
          <FieldRow name="name" type="string" required>
            Human-readable display name. 1 to 100 characters.
          </FieldRow>
          <FieldRow name="version" type="string" required>
            Semantic version string. Must match the format{" "}
            <InlineCode>MAJOR.MINOR.PATCH</InlineCode> (e.g.{" "}
            <InlineCode>1.0.0</InlineCode>, <InlineCode>2.3.1</InlineCode>).
          </FieldRow>
          <FieldRow name="description" type="string" required>
            App description displayed in the marketplace. 1 to 1000 characters.
          </FieldRow>
          <FieldRow name="author" type="object" required>
            Author information.{" "}
            <InlineCode>name</InlineCode> (string, required): author display name.{" "}
            <InlineCode>url</InlineCode> (string, optional): author website URL.
          </FieldRow>
          <FieldRow name="category" type="enum" required>
            App category. Must be one of:{" "}
            <InlineCode>game</InlineCode>,{" "}
            <InlineCode>shopping</InlineCode>,{" "}
            <InlineCode>tool</InlineCode>,{" "}
            <InlineCode>social</InlineCode>,{" "}
            <InlineCode>other</InlineCode>.
          </FieldRow>
          <FieldRow name="tags" type="string[]" required>
            Searchable tags. Each tag 1-50 characters. Maximum 10 tags.
          </FieldRow>
          <FieldRow name="icon" type="string" required>
            Path to the app icon within the package (e.g.{" "}
            <InlineCode>assets/icon.png</InlineCode>).
          </FieldRow>
          <FieldRow name="screenshots" type="string[]" required={false}>
            Paths to screenshot images within the package. Maximum 5.
          </FieldRow>
          <FieldRow name="sdkVersion" type="string" required={false}>
            Version of <InlineCode>@arinova/app-sdk</InlineCode> used.
          </FieldRow>
        </div>

        {/* UI */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>ui</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Defines how the app is rendered inside the conversation iframe.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="ui.entry" type="string" required>
            Path to the HTML entry point file (e.g. <InlineCode>index.html</InlineCode>). This file must exist in your package.
          </FieldRow>
          <FieldRow name="ui.viewport.minWidth" type="number" required>
            Minimum width in pixels. Must be a positive integer.
          </FieldRow>
          <FieldRow name="ui.viewport.maxWidth" type="number" required>
            Maximum width in pixels. Must be a positive integer.
          </FieldRow>
          <FieldRow name="ui.viewport.aspectRatio" type="string" required>
            Aspect ratio constraint. Examples: <InlineCode>1:1</InlineCode>,{" "}
            <InlineCode>16:9</InlineCode>, <InlineCode>4:3</InlineCode>,{" "}
            <InlineCode>flexible</InlineCode>.
          </FieldRow>
          <FieldRow name="ui.viewport.orientation" type="enum" required>
            Preferred orientation. One of: <InlineCode>portrait</InlineCode>,{" "}
            <InlineCode>landscape</InlineCode>, <InlineCode>any</InlineCode>.
          </FieldRow>
        </div>

        {/* Platforms */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>platforms</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Declares which platforms the app supports. At least one must be{" "}
          <InlineCode>true</InlineCode>.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="platforms.web" type="boolean" required>
            Whether the app runs on web.
          </FieldRow>
          <FieldRow name="platforms.ios" type="boolean" required>
            Whether the app runs on iOS.
          </FieldRow>
          <FieldRow name="platforms.android" type="boolean" required>
            Whether the app runs on Android.
          </FieldRow>
        </div>

        {/* Players */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>players</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Declares the player count range. <InlineCode>max</InlineCode> must be{" "}
          greater than or equal to <InlineCode>min</InlineCode>.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="players.min" type="number" required>
            Minimum number of players. Must be at least 1.
          </FieldRow>
          <FieldRow name="players.max" type="number" required>
            Maximum number of players. Must be at least 1 and &gt;= min.
          </FieldRow>
        </div>

        {/* Roles */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>roles</InlineCode> (required)
        </h3>
        <div className="space-y-3 text-sm text-muted-foreground mb-3">
          <p>
            A dictionary mapping role names to their definitions. Each role defines
            what state it sees, what actions it can take, and what events it emits.
          </p>
          <p>
            There are two types of role definitions:
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="roles.[name].prompt" type="string" required>
            System prompt for the agent in this role (role-specific definition).
          </FieldRow>
          <FieldRow name="roles.[name].state" type="Record&lt;string, unknown&gt;" required>
            JSON Schema describing the state visible to this role (role-specific definition).
          </FieldRow>
          <FieldRow name="roles.[name].actions" type="ActionDefinition[]" required>
            Actions available to this role. Each action has:{" "}
            <InlineCode>name</InlineCode> (required),{" "}
            <InlineCode>description</InlineCode> (required),{" "}
            <InlineCode>params</InlineCode> (optional, JSON Schema),{" "}
            <InlineCode>humanOnly</InlineCode> (optional, boolean),{" "}
            <InlineCode>agentOnly</InlineCode> (optional, boolean).
          </FieldRow>
          <FieldRow name="roles.[name].events" type="EventDefinition[]" required={false}>
            Events this role can emit. Each event has:{" "}
            <InlineCode>name</InlineCode> (required),{" "}
            <InlineCode>description</InlineCode> (required),{" "}
            <InlineCode>payload</InlineCode> (optional, JSON Schema).
          </FieldRow>
        </div>
        <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-blue-400">Tip:</strong> Use a{" "}
            <InlineCode>shared</InlineCode> role key for actions and events
            that apply to all roles. The shared definition only has optional{" "}
            <InlineCode>events</InlineCode> and <InlineCode>actions</InlineCode>{" "}
            arrays (no prompt or state).
          </p>
        </div>

        {/* Agent Interface */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>agentInterface</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Configures how AI agents interact with the app.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="agentInterface.mode" type="enum" required>
            Agent interface mode. <InlineCode>static</InlineCode>: actions and
            state are fixed (defined entirely in the manifest).{" "}
            <InlineCode>dynamic</InlineCode>: actions and state are pushed at
            runtime via the SDK.
          </FieldRow>
          <FieldRow name="agentInterface.description" type="string" required>
            Human-readable description of the app for agents. Helps agents
            understand what the app does and how to use it.
          </FieldRow>
          <FieldRow name="agentInterface.maxStateSize" type="number" required={false}>
            Maximum state size in bytes. Required when mode is{" "}
            <InlineCode>dynamic</InlineCode>.
          </FieldRow>
          <FieldRow name="agentInterface.maxActions" type="number" required={false}>
            Maximum number of concurrent actions. Required when mode is{" "}
            <InlineCode>dynamic</InlineCode>.
          </FieldRow>
        </div>

        {/* Interaction */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>interaction</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Defines how humans and agents share control of the app.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="interaction.controlModes" type="ControlMode[]" required>
            Supported control modes. At least one required. Values:{" "}
            <InlineCode>agent</InlineCode>, <InlineCode>human</InlineCode>,{" "}
            <InlineCode>copilot</InlineCode>.
          </FieldRow>
          <FieldRow name="interaction.defaultMode" type="enum" required>
            The default control mode when the app launches. Must be one of the
            values in <InlineCode>controlModes</InlineCode>.
          </FieldRow>
          <FieldRow name="interaction.humanInput" type="enum" required>
            How humans interact with the app. <InlineCode>direct</InlineCode>:
            via the app UI only. <InlineCode>chat</InlineCode>: via the
            conversation only. <InlineCode>both</InlineCode>: via either.
          </FieldRow>
        </div>

        {/* Monetization */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>monetization</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Declares the app&apos;s monetization model.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="monetization.model" type="enum" required>
            Monetization model. One of:{" "}
            <InlineCode>free</InlineCode>,{" "}
            <InlineCode>paid</InlineCode>,{" "}
            <InlineCode>freemium</InlineCode>,{" "}
            <InlineCode>subscription</InlineCode>.
          </FieldRow>
          <FieldRow name="monetization.virtualGoods" type="boolean" required>
            Whether the app sells virtual goods via Arinova Coins.
          </FieldRow>
          <FieldRow name="monetization.externalPayments" type="boolean" required>
            Whether the app uses external payment systems. Must be{" "}
            <InlineCode>false</InlineCode> for most apps.
          </FieldRow>
        </div>

        {/* Rating */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>rating</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Age rating and content descriptors.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="rating.age" type="enum" required>
            Age rating. One of: <InlineCode>4+</InlineCode>,{" "}
            <InlineCode>9+</InlineCode>, <InlineCode>12+</InlineCode>,{" "}
            <InlineCode>17+</InlineCode>.
          </FieldRow>
          <FieldRow name="rating.descriptors" type="string[]" required>
            Content descriptors (e.g. &quot;mild violence&quot;, &quot;in-app
            purchases&quot;). Can be an empty array.
          </FieldRow>
        </div>

        {/* Permissions */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>permissions</InlineCode> (required)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Array of platform permissions the app requires. Valid values:
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-semibold text-blue-400">storage</code>
              <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-400">
                Tier 1
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Access to persistent local storage for saving app state across sessions.
            </p>
          </div>
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-semibold text-blue-400">audio</code>
              <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-400">
                Tier 1
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Ability to play audio (sound effects, music) within the app.
            </p>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-semibold text-blue-400">network</code>
              <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-xs text-orange-400">
                Tier 2
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Make network requests to external domains. Requires{" "}
              <InlineCode>network.allowed</InlineCode> to list all allowed domains.
              Triggers manual review.
            </p>
          </div>
        </div>

        {/* Network */}
        <h3 className="mb-3 mt-8 text-xl font-semibold">
          <InlineCode>network</InlineCode> (conditional)
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Required when the <InlineCode>network</InlineCode> permission is
          declared in the permissions array.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <FieldRow name="network.allowed" type="string[]" required>
            List of allowed domains the app can make network requests to. Must
            contain at least one entry when the network permission is used.
          </FieldRow>
        </div>
      </section>

      {/* Permission Tiers */}
      <section className="mb-12" id="permission-tiers">
        <h2 className="mb-4 text-2xl font-bold">Permission Tiers</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            The permissions you declare in your manifest determine which review
            tier your app falls into. This directly affects how quickly your
            app gets published.
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Permissions
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Review Process
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                      Tier 0
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    None (empty array)
                  </td>
                  <td className="px-4 py-3">
                    Auto-published after static analysis scan passes
                  </td>
                  <td className="px-4 py-3 text-foreground">Instant</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400">
                      Tier 1
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <InlineCode>storage</InlineCode>,{" "}
                    <InlineCode>audio</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Auto-published after static analysis scan passes
                  </td>
                  <td className="px-4 py-3 text-foreground">Instant</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <span className="rounded bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
                      Tier 2
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <InlineCode>network</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Requires manual review -- a human reviewer inspects your
                    network.allowed list and app behavior
                  </td>
                  <td className="px-4 py-3 text-foreground">1-3 business days</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm">
              <strong className="text-blue-400">Recommendation:</strong> Keep
              your permissions minimal. If your app does not need network
              access, do not request it. Tier 0 and Tier 1 apps are published
              instantly, while Tier 2 apps must wait for manual review.
            </p>
          </div>
        </div>
      </section>

      {/* Validation Rules */}
      <section className="mb-12" id="validation-rules">
        <h2 className="mb-4 text-2xl font-bold">Validation Rules</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            The following rules are enforced when validating your manifest. A
            manifest that violates any of these rules will be rejected.
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Rule
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">ID format</td>
                  <td className="px-4 py-3">
                    Must be lowercase kebab-case matching{" "}
                    <InlineCode>{`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`}</InlineCode>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">Version format</td>
                  <td className="px-4 py-3">
                    Must be semver: <InlineCode>{`^\\d+\\.\\d+\\.\\d+$`}</InlineCode>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">
                    Platform requirement
                  </td>
                  <td className="px-4 py-3">
                    At least one platform (<InlineCode>web</InlineCode>,{" "}
                    <InlineCode>ios</InlineCode>, or{" "}
                    <InlineCode>android</InlineCode>) must be{" "}
                    <InlineCode>true</InlineCode>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">
                    Player count
                  </td>
                  <td className="px-4 py-3">
                    <InlineCode>players.max</InlineCode> must be{" "}
                    &gt;= <InlineCode>players.min</InlineCode>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">
                    Network permission
                  </td>
                  <td className="px-4 py-3">
                    If <InlineCode>network</InlineCode> is in permissions,{" "}
                    <InlineCode>network.allowed</InlineCode> must exist and
                    contain at least one domain
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">
                    Dynamic mode requirements
                  </td>
                  <td className="px-4 py-3">
                    If <InlineCode>agentInterface.mode</InlineCode> is{" "}
                    <InlineCode>dynamic</InlineCode>, both{" "}
                    <InlineCode>maxStateSize</InlineCode> and{" "}
                    <InlineCode>maxActions</InlineCode> must be provided
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">Tags limit</td>
                  <td className="px-4 py-3">
                    Maximum 10 tags, each 1-50 characters
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-foreground">
                    Entry point existence
                  </td>
                  <td className="px-4 py-3">
                    The file referenced by <InlineCode>ui.entry</InlineCode>{" "}
                    must exist in the submitted package
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Link
          href="/developer/docs/getting-started"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Getting Started
        </Link>
        <Link
          href="/developer/docs/sdk"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          SDK Reference &rarr;
        </Link>
      </div>
    </div>
  );
}
