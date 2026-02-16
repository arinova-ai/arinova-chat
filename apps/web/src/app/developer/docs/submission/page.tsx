"use client";

import Link from "next/link";
import { ChevronRight, CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";

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

function StepCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex shrink-0 flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {number}
        </div>
        <div className="mt-2 w-px flex-1 bg-border" />
      </div>
      <div className="pb-8">
        <h4 className="mb-2 text-lg font-semibold text-foreground">{title}</h4>
        <div className="text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SubmissionGuidePage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/developer/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Submission Guide</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Submission Guide</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          How to prepare, package, and submit your app for publishing on the
          Arinova marketplace.
        </p>
      </div>

      {/* Table of Contents */}
      <div className="mb-10 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <nav className="space-y-1.5">
          {[
            ["Preparation Checklist", "#preparation-checklist"],
            ["Forbidden APIs", "#forbidden-apis"],
            ["Allowed File Types", "#allowed-file-types"],
            ["Submission Process", "#submission-process"],
            ["Review Process", "#review-process"],
            ["Updating Your App", "#updating-your-app"],
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

      {/* Preparation Checklist */}
      <section className="mb-12" id="preparation-checklist">
        <h2 className="mb-4 text-2xl font-bold">Preparation Checklist</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Before submitting your app, go through this checklist to avoid
            common rejection reasons:
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="space-y-0 divide-y divide-border">
              {[
                [
                  "manifest.json is valid",
                  "Follows the schema, all required fields present, valid category, correct semver format.",
                ],
                [
                  "Entry point exists",
                  "The file referenced in ui.entry exists in the package root.",
                ],
                [
                  "No forbidden APIs",
                  "Your JavaScript/TypeScript code does not use eval(), new Function(), dynamic import(), etc.",
                ],
                [
                  "Only allowed file extensions",
                  "Every file in your package uses an allowed extension (see list below).",
                ],
                [
                  "Package under 50 MB",
                  "Your .zip file must not exceed 50 MB in total size.",
                ],
                [
                  "manifest.json at zip root",
                  "When unzipped, manifest.json must be at the root — not nested inside a subdirectory.",
                ],
                [
                  "Network domains declared",
                  'If you use the "network" permission, your network.allowed array lists all domains.',
                ],
                [
                  "Dynamic mode configured",
                  "If agentInterface.mode is \"dynamic\", both maxStateSize and maxActions are specified.",
                ],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {title}
                    </p>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Forbidden APIs */}
      <section className="mb-12" id="forbidden-apis">
        <h2 className="mb-4 text-2xl font-bold">Forbidden APIs</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Arinova runs a static analysis scanner on all JavaScript and
            TypeScript files (<InlineCode>.js</InlineCode>,{" "}
            <InlineCode>.jsx</InlineCode>, <InlineCode>.ts</InlineCode>,{" "}
            <InlineCode>.tsx</InlineCode>, <InlineCode>.mjs</InlineCode>,{" "}
            <InlineCode>.cjs</InlineCode>) in your package. The following
            patterns will cause your submission to be rejected:
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Pattern
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Why it is forbidden
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Alternative
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">eval()</code>
                  </td>
                  <td className="px-4 py-3">
                    Executes arbitrary code strings, enabling code injection attacks.
                  </td>
                  <td className="px-4 py-3">
                    Use <InlineCode>JSON.parse()</InlineCode> for data, or refactor to avoid dynamic code execution.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">new Function()</code>
                  </td>
                  <td className="px-4 py-3">
                    Creates functions from strings, same risks as eval().
                  </td>
                  <td className="px-4 py-3">
                    Define functions statically in your code.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">import()</code>
                  </td>
                  <td className="px-4 py-3">
                    Dynamic imports could load external code not included in the package.
                  </td>
                  <td className="px-4 py-3">
                    Use static <InlineCode>import</InlineCode> statements. Bundle all dependencies.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">document.cookie</code>
                  </td>
                  <td className="px-4 py-3">
                    Cookie access could be used for tracking or data exfiltration.
                  </td>
                  <td className="px-4 py-3">
                    Use the SDK&apos;s storage permission for persistence.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">top.location</code>
                  </td>
                  <td className="px-4 py-3">
                    Could navigate the parent frame away from Arinova, enabling phishing.
                  </td>
                  <td className="px-4 py-3">
                    Apps should never navigate outside their iframe.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">parent.location</code>
                  </td>
                  <td className="px-4 py-3">
                    Same as top.location -- could redirect the parent page.
                  </td>
                  <td className="px-4 py-3">
                    Apps should never navigate outside their iframe.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">window.open()</code>
                  </td>
                  <td className="px-4 py-3">
                    Opening new windows/tabs could be used for pop-up spam or phishing.
                  </td>
                  <td className="px-4 py-3">
                    Keep all interactions within the app iframe.
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3">
                    <code className="text-red-400">{`setTimeout("string")`}</code>
                  </td>
                  <td className="px-4 py-3">
                    Passing a string to setTimeout acts like eval().
                  </td>
                  <td className="px-4 py-3">
                    Pass a function reference instead:{" "}
                    <InlineCode>{`setTimeout(() => { ... }, 1000)`}</InlineCode>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <code className="text-red-400">{`setInterval("string")`}</code>
                  </td>
                  <td className="px-4 py-3">
                    Passing a string to setInterval acts like eval().
                  </td>
                  <td className="px-4 py-3">
                    Pass a function reference instead:{" "}
                    <InlineCode>{`setInterval(() => { ... }, 1000)`}</InlineCode>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-sm">
              <strong className="text-yellow-400">Note:</strong> The scanner
              checks for these patterns using regex matching on each line of
              your source files. Even commented-out code containing these
              patterns may trigger a violation. Remove any dead code that uses
              forbidden APIs before submitting.
            </p>
          </div>
        </div>
      </section>

      {/* Allowed File Types */}
      <section className="mb-12" id="allowed-file-types">
        <h2 className="mb-4 text-2xl font-bold">Allowed File Types</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Every file in your zip package must have one of the following
            extensions. Files with unrecognized extensions will cause the
            submission to be rejected.
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Extensions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Code &amp; Markup
                  </td>
                  <td className="px-4 py-3">
                    <code>.html</code>, <code>.htm</code>, <code>.css</code>,{" "}
                    <code>.js</code>, <code>.jsx</code>, <code>.ts</code>,{" "}
                    <code>.tsx</code>, <code>.mjs</code>, <code>.cjs</code>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Data
                  </td>
                  <td className="px-4 py-3">
                    <code>.json</code>, <code>.txt</code>, <code>.md</code>,{" "}
                    <code>.csv</code>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Images
                  </td>
                  <td className="px-4 py-3">
                    <code>.png</code>, <code>.jpg</code>, <code>.jpeg</code>,{" "}
                    <code>.gif</code>, <code>.webp</code>, <code>.svg</code>,{" "}
                    <code>.ico</code>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Fonts
                  </td>
                  <td className="px-4 py-3">
                    <code>.woff</code>, <code>.woff2</code>,{" "}
                    <code>.ttf</code>, <code>.eot</code>, <code>.otf</code>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    Audio &amp; Video
                  </td>
                  <td className="px-4 py-3">
                    <code>.mp3</code>, <code>.ogg</code>, <code>.wav</code>,{" "}
                    <code>.mp4</code>, <code>.webm</code>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-foreground">
                    3D Models
                  </td>
                  <td className="px-4 py-3">
                    <code>.glb</code>, <code>.gltf</code>, <code>.obj</code>,{" "}
                    <code>.fbx</code>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground">
                    WebAssembly
                  </td>
                  <td className="px-4 py-3">
                    <code>.wasm</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm">
              <strong className="text-blue-400">Tip:</strong> If your build
              tool generates files with extensions not on this list (e.g.{" "}
              <InlineCode>.map</InlineCode> source maps or{" "}
              <InlineCode>.d.ts</InlineCode> declaration files), exclude them
              from your zip package before submitting.
            </p>
          </div>
        </div>
      </section>

      {/* Submission Process */}
      <section className="mb-12" id="submission-process">
        <h2 className="mb-4 text-2xl font-bold">Submission Process</h2>
        <div className="space-y-2 text-muted-foreground leading-relaxed">
          <p className="mb-6">
            The submission process follows a pipeline of automated checks,
            followed by optional manual review depending on your permission
            tier.
          </p>

          {/* Visual pipeline */}
          <div className="mb-8 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs font-medium">
            <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-400">
              Upload .zip
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-400">
              Validate Manifest
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-400">
              Check File Types
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-400">
              Static Analysis
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-400">
              Tier Check
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded bg-green-500/10 px-2 py-1 text-green-400">
              Published / In Review
            </span>
          </div>

          <StepCard number={1} title="Zip your project">
            <p>
              Create a .zip file of your project directory. The{" "}
              <InlineCode>manifest.json</InlineCode> must be at the root of the
              archive, not inside a subdirectory.
            </p>
            <CodeBlock title="Terminal">{`# From your project directory
zip -r my-app.zip . -x "node_modules/*" ".git/*" "*.map"`}</CodeBlock>
          </StepCard>

          <StepCard number={2} title="Navigate to Submit App">
            <p>
              Go to the{" "}
              <Link
                href="/developer"
                className="text-blue-400 hover:underline"
              >
                Developer Dashboard
              </Link>{" "}
              and click the <strong className="text-foreground">Submit App</strong> button.
            </p>
          </StepCard>

          <StepCard number={3} title="Upload your zip">
            <p>
              Select your .zip file in the upload dialog. The maximum file size
              is 50 MB. Only <InlineCode>.zip</InlineCode> files are accepted.
            </p>
          </StepCard>

          <StepCard number={4} title="Automatic validation">
            <p>
              The server performs four automated checks in sequence:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>
                <strong className="text-foreground">Manifest validation</strong>
                {" -- "}Checks that manifest.json exists, is valid JSON, and passes
                schema validation.
              </li>
              <li>
                <strong className="text-foreground">Entry point check</strong>
                {" -- "}Verifies that the file referenced by{" "}
                <InlineCode>ui.entry</InlineCode> exists in the package.
              </li>
              <li>
                <strong className="text-foreground">File type check</strong>
                {" -- "}Ensures every file has an allowed extension.
              </li>
              <li>
                <strong className="text-foreground">Static analysis scan</strong>
                {" -- "}Scans all JS/TS files for forbidden API patterns.
              </li>
            </ul>
          </StepCard>

          <StepCard number={5} title="Permission tier classification">
            <p>
              Based on the permissions you declared, your app is classified into
              a tier:
            </p>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                  Tier 0
                </span>
                <span>No permissions</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400">
                  Tier 1
                </span>
                <span>
                  <InlineCode>storage</InlineCode> or{" "}
                  <InlineCode>audio</InlineCode>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
                  Tier 2
                </span>
                <span>
                  <InlineCode>network</InlineCode>
                </span>
              </div>
            </div>
          </StepCard>

          <StepCard number={6} title="Auto-publish or manual review">
            <p>
              <strong className="text-foreground">Tier 0 and Tier 1:</strong>{" "}
              Your app is auto-published immediately after passing all
              automated checks. It appears in the marketplace right away.
            </p>
            <p className="mt-2">
              <strong className="text-foreground">Tier 2:</strong> Your app
              enters the <InlineCode>in_review</InlineCode> state. A human
              reviewer will inspect your network.allowed domains and app
              behavior before publishing.
            </p>
          </StepCard>
        </div>
      </section>

      {/* Review Process */}
      <section className="mb-12" id="review-process">
        <h2 className="mb-4 text-2xl font-bold">Review Process</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Manual review applies to Tier 2 apps (those requesting the{" "}
            <InlineCode>network</InlineCode> permission). Here is what to
            expect:
          </p>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            What reviewers check
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="space-y-0 divide-y divide-border">
              <div className="flex gap-3 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                <p className="text-sm">
                  <strong className="text-foreground">Network domains</strong>{" "}
                  -- Are the domains in network.allowed legitimate and
                  necessary? Are they first-party APIs or well-known services?
                </p>
              </div>
              <div className="flex gap-3 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                <p className="text-sm">
                  <strong className="text-foreground">Data handling</strong>{" "}
                  -- Does the app handle user data appropriately? No
                  unnecessary data collection.
                </p>
              </div>
              <div className="flex gap-3 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                <p className="text-sm">
                  <strong className="text-foreground">Content quality</strong>{" "}
                  -- Does the app work as described? Is it functional and
                  not misleading?
                </p>
              </div>
              <div className="flex gap-3 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                <p className="text-sm">
                  <strong className="text-foreground">Security</strong> -- No
                  attempts to circumvent the sandbox, no obfuscated malicious
                  code.
                </p>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Timeline
          </h3>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm">
              Manual reviews typically take <strong className="text-foreground">1 to 3 business days</strong>.
              You will be notified in the Developer Dashboard when the review
              is complete.
            </p>
          </div>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
            Common rejection reasons
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="space-y-0 divide-y divide-border">
              {[
                [
                  "Overly broad network access",
                  "Requesting access to domains not used by the app, or wildcard patterns.",
                ],
                [
                  "Misleading description",
                  "App behavior does not match the manifest description.",
                ],
                [
                  "Non-functional app",
                  "App crashes, fails to load, or is a placeholder.",
                ],
                [
                  "Privacy violations",
                  "Collecting user data without disclosure or necessity.",
                ],
                [
                  "Inappropriate content",
                  "Content that violates community guidelines or is rated incorrectly.",
                ],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3 px-4 py-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {title}
                    </p>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Updating Your App */}
      <section className="mb-12" id="updating-your-app">
        <h2 className="mb-4 text-2xl font-bold">Updating Your App</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            To update an existing app, submit a new zip package with the same{" "}
            <InlineCode>id</InlineCode> in manifest.json but a bumped{" "}
            <InlineCode>version</InlineCode>.
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Field
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">
                    Behavior
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">
                    Same <InlineCode>id</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Updates the existing app (you must be the original owner)
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 text-foreground">
                    New <InlineCode>version</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Creates a new version record for the app
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-foreground">
                    New <InlineCode>id</InlineCode>
                  </td>
                  <td className="px-4 py-3">
                    Creates an entirely new app listing
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            The update goes through the same validation pipeline. If it passes
            and your permission tier is 0 or 1, the new version is
            auto-published and the app&apos;s <InlineCode>currentVersionId</InlineCode>{" "}
            is updated to point to the new version.
          </p>

          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
            <p className="text-sm">
              <strong className="text-yellow-400">Important:</strong> If your
              update adds the <InlineCode>network</InlineCode> permission (moving
              from Tier 0/1 to Tier 2), the update will require manual review
              before the new version goes live. The previous version remains
              published in the meantime.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Link
          href="/developer/docs/sdk"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; SDK Reference
        </Link>
        <Link
          href="/developer/docs/monetization"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Monetization &rarr;
        </Link>
      </div>
    </div>
  );
}
