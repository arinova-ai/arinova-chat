"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useAccountStore } from "@/store/account-store";
import { api } from "@/lib/api";

interface Account {
  id: string;
  name: string;
  personaAge: number | null;
  personaInterests: string;
  personaBackstory: string;
  personaIntro: string;
  personaTone: string;
  personaPersonality: string;
  personaCatchphrase: string;
  systemPrompt: string;
  personaForbiddenTopics: string;
}

interface TemplatePreset {
  key: string;
  tone: string;
  personality: string;
  catchphrase: string;
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "friendly",
    tone: "warm and friendly",
    personality: "Cheerful, empathetic, loves to listen",
    catchphrase: "Hey there! \u{1F495}",
  },
  {
    key: "cool",
    tone: "laid-back and casual",
    personality: "Chill, witty, effortlessly cool",
    catchphrase: "No worries~",
  },
  {
    key: "mysterious",
    tone: "enigmatic and alluring",
    personality: "Mysterious, thoughtful, speaks in riddles",
    catchphrase: "Hmm, interesting...",
  },
  {
    key: "cute",
    tone: "sweet and bubbly",
    personality: "Adorable, energetic, uses lots of emojis",
    catchphrase: "Hehe~ \u2728",
  },
  {
    key: "professional",
    tone: "polished and confident",
    personality: "Articulate, knowledgeable, supportive",
    catchphrase: "Let me help with that.",
  },
];

export default function PersonaPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { updateAccount } = useAccountStore();

  const accountId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [personaAge, setPersonaAge] = useState<number | null>(null);
  const [personaInterests, setPersonaInterests] = useState("");
  const [personaBackstory, setPersonaBackstory] = useState("");
  const [personaIntro, setPersonaIntro] = useState("");
  const [personaTone, setPersonaTone] = useState("");
  const [personaPersonality, setPersonaPersonality] = useState("");
  const [personaCatchphrase, setPersonaCatchphrase] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [personaForbiddenTopics, setPersonaForbiddenTopics] = useState("");

  useEffect(() => {
    async function loadAccount() {
      try {
        const account = await api<Account>(`/api/accounts/${accountId}`);
        setName(account.name ?? "");
        setPersonaAge(account.personaAge ?? null);
        setPersonaInterests(account.personaInterests ?? "");
        setPersonaBackstory(account.personaBackstory ?? "");
        setPersonaIntro(account.personaIntro ?? "");
        setPersonaTone(account.personaTone ?? "");
        setPersonaPersonality(account.personaPersonality ?? "");
        setPersonaCatchphrase(account.personaCatchphrase ?? "");
        setSystemPrompt(account.systemPrompt ?? "");
        setPersonaForbiddenTopics(account.personaForbiddenTopics ?? "");
      } catch (err) {
        console.error("Failed to load account:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAccount();
  }, [accountId]);

  const applyTemplate = useCallback((template: TemplatePreset) => {
    setActiveTemplate(template.key);
    setPersonaTone(template.tone);
    setPersonaPersonality(template.personality);
    setPersonaCatchphrase(template.catchphrase);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateAccount(accountId, {
        name,
        personaAge,
        personaInterests,
        personaBackstory,
        personaIntro,
        personaTone,
        personaPersonality,
        personaCatchphrase,
        systemPrompt,
        personaForbiddenTopics,
      });
    } catch (err) {
      console.error("Failed to save persona:", err);
    } finally {
      setSaving(false);
    }
  }, [
    accountId,
    name,
    personaAge,
    personaInterests,
    personaBackstory,
    personaIntro,
    personaTone,
    personaPersonality,
    personaCatchphrase,
    systemPrompt,
    personaForbiddenTopics,
    updateAccount,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold truncate flex-1">{t("lounge.persona.title")}</h1>
      </header>

      {/* Scrollable Form */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-2xl space-y-8 p-4">
          {/* Template Selection */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              {t("lounge.persona.templateSection")}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {TEMPLATE_PRESETS.map((template) => (
                <button
                  key={template.key}
                  onClick={() => applyTemplate(template)}
                  className={`flex-shrink-0 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTemplate === template.key
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-card text-card-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  {t(`lounge.persona.templates.${template.key}`)}
                </button>
              ))}
            </div>
          </section>

          {/* Basic Info Section */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("lounge.persona.basicInfo")}
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.title")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.age")}
              </label>
              <input
                type="number"
                value={personaAge ?? ""}
                onChange={(e) =>
                  setPersonaAge(
                    e.target.value ? parseInt(e.target.value, 10) : null
                  )
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.interests")}
              </label>
              <textarea
                value={personaInterests}
                onChange={(e) => setPersonaInterests(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.backstory")}
              </label>
              <textarea
                value={personaBackstory}
                onChange={(e) => setPersonaBackstory(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.intro")}
              </label>
              <textarea
                value={personaIntro}
                onChange={(e) => setPersonaIntro(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </section>

          {/* Personality Section */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("lounge.persona.personalitySection")}
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.tone")}
              </label>
              <input
                type="text"
                value={personaTone}
                onChange={(e) => setPersonaTone(e.target.value)}
                placeholder="e.g. cheerful"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.personality")}
              </label>
              <textarea
                value={personaPersonality}
                onChange={(e) => setPersonaPersonality(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.catchphrase")}
              </label>
              <input
                type="text"
                value={personaCatchphrase}
                onChange={(e) => setPersonaCatchphrase(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </section>

          {/* System Prompt Section */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("lounge.persona.systemPromptSection")}
            </h2>

            <div className="space-y-2">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
              <p className="text-xs text-muted-foreground">
                {t("lounge.persona.systemPromptHelp")}
              </p>
            </div>
          </section>

          {/* Safety Section */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("lounge.persona.safetySection")}
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("lounge.persona.forbiddenTopics")}
              </label>
              <textarea
                value={personaForbiddenTopics}
                onChange={(e) => setPersonaForbiddenTopics(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <p className="text-xs text-muted-foreground">
                {t("lounge.persona.forbiddenTopicsHelp")}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Sticky Save Button */}
      <div className="sticky bottom-0 border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "..." : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
