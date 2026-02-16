"use client";

import Link from "next/link";
import { Rocket, FileJson, Code, Upload, Coins } from "lucide-react";

const sections = [
  {
    title: "Getting Started",
    description:
      "Build your first Arinova App in minutes. Learn the project structure, SDK basics, and how to create an interactive Hello World app.",
    href: "/developer/docs/getting-started",
    icon: Rocket,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    title: "Manifest Reference",
    description:
      "Complete reference for manifest.json — every field, validation rule, permission tier, and category explained with examples.",
    href: "/developer/docs/manifest",
    icon: FileJson,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    title: "SDK Reference",
    description:
      "Full API reference for @arinova/app-sdk. State management, action handlers, events, lifecycle hooks, and monetization methods.",
    href: "/developer/docs/sdk",
    icon: Code,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    title: "Submission Guide",
    description:
      "Everything you need to know before submitting: forbidden APIs, allowed file types, the review process, and how to update your app.",
    href: "/developer/docs/submission",
    icon: Upload,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
  {
    title: "Monetization",
    description:
      "Set up in-app purchases with Arinova Coins. Revenue splits, product registration, purchase flows, and the earnings dashboard.",
    href: "/developer/docs/monetization",
    icon: Coins,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
];

export default function DocsIndexPage() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-10">
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          Developer Console / Documentation
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Everything you need to build, test, and publish apps on the Arinova
          Chat platform.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground/40 hover:bg-neutral-800/50"
            >
              <div
                className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${section.bg}`}
              >
                <Icon className={`h-5 w-5 ${section.color}`} />
              </div>
              <h2 className="mb-2 text-lg font-semibold group-hover:text-white">
                {section.title}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {section.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 text-lg font-semibold">Quick Links</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/developer"
            className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            Developer Dashboard
          </Link>
          <Link
            href="/developer/test"
            className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            Test Sandbox
          </Link>
        </div>
      </div>
    </div>
  );
}
