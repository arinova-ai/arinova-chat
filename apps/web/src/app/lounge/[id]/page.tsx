"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mic, Users, Loader2, Plus, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthGuard } from "@/components/auth-guard";
import { DefaultAvatarPicker } from "@/components/ui/default-avatar-picker";

interface LoungeDetail {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  subscriberCount: number;
  voiceModelStatus: string;
  creatorId?: string;
}

function LoungeDetailInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: session } = authClient.useSession();

  const [lounge, setLounge] = useState<LoungeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileNickname, setProfileNickname] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [joinedConvId, setJoinedConvId] = useState<string | null>(null);

  useEffect(() => {
    api<LoungeDetail>(`/api/lounge/${id}`)
      .then(setLounge)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await api<{ conversationId: string }>(`/api/lounge/${id}/join`, { method: "POST" });
      setJoinedConvId(res.conversationId);
      setShowProfile(true);
    } catch {
      try {
        const res = await api<{ conversationId: string }>(`/api/lounge/${id}/start-chat`, { method: "POST" });
        setJoinedConvId(res.conversationId);
        setShowProfile(true);
      } catch { /* toast handled by api */ }
    }
    setJoining(false);
  };

  const handleProfileDone = async () => {
    if (!joinedConvId) return;
    // Get community ID for identity update
    try {
      const comm = await api<{ id: string }>(`/api/communities/by-conversation/${joinedConvId}`);
      if (comm.id && (profileNickname.trim() || profileAvatar)) {
        await api(`/api/communities/${comm.id}/identity`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: profileNickname.trim() || "Anonymous",
            avatarUrl: profileAvatar || null,
          }),
        });
      }
    } catch { /* ignore */ }
    router.push(`/?c=${joinedConvId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lounge) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back")}
        </Button>
      </div>
    );
  }

  // Profile setup dialog after join
  if (showProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background px-6 gap-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t("community.setupProfile")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("community.setupProfileDesc")}</p>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <div>
            <label className="text-sm font-medium">{t("community.nickname")}</label>
            <Input
              value={profileNickname}
              onChange={(e) => setProfileNickname(e.target.value)}
              placeholder={t("community.nicknamePlaceholder")}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("community.avatar")}</label>
            <DefaultAvatarPicker
              onSelect={setProfileAvatar}
              selected={profileAvatar}
              className="mt-1"
            />
          </div>
          <Button className="w-full" onClick={handleProfileDone}>
            {t("community.startChatting")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
     <div className="max-w-2xl mx-auto w-full">
      {/* Cover / Header */}
      <div className="relative shrink-0">
        {lounge.coverImageUrl ? (
          <img src={lounge.coverImageUrl} alt="" className="w-full h-48 object-cover" />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Mic className="h-16 w-16 text-purple-500/30" />
          </div>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute top-3 left-3 rounded-full bg-background/80 backdrop-blur p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Avatar + Info */}
      <div className="px-4 -mt-8 relative">
        <div className="h-16 w-16 rounded-full border-4 border-background bg-purple-500/10 flex items-center justify-center overflow-hidden">
          {lounge.avatarUrl ? (
            <img src={lounge.avatarUrl} alt={lounge.name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <Mic className="h-8 w-8 text-purple-500" />
          )}
        </div>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3">
        <div>
          <h1 className="text-xl font-bold">{lounge.name}</h1>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
            <Users className="h-3.5 w-3.5" />
            <span>{lounge.subscriberCount} {t("explore.subscribers")}</span>
          </div>
        </div>

        {lounge.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{lounge.description}</p>
        )}

        {lounge.creatorId === session?.user?.id ? (
          /* Owner: management buttons */
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" variant="outline" onClick={() => router.push(`/lounge/${id}/dashboard`)}>
              {t("lounge.dashboard")}
            </Button>
            <Button className="flex-1 gap-2" variant="outline" onClick={() => router.push(`/lounge/${id}/settings`)}>
              {t("lounge.settings")}
            </Button>
          </div>
        ) : (
          /* Fan: join or continue */
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {t("lounge.joinChat")}
          </Button>
        )}
      </div>

      {/* Posts Feed */}
      <LoungePosts loungeId={id} isOwner={lounge.creatorId === session?.user?.id} />
     </div>
    </div>
  );
}

interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  authorName: string;
  authorImage: string | null;
  createdAt: string;
}

function LoungePosts({ loungeId, isOwner }: { loungeId: string; isOwner: boolean }) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchPosts = useCallback(() => {
    api<{ posts: Post[] }>(`/api/lounge/${loungeId}/posts`)
      .then((d) => setPosts(d.posts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loungeId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ url: string }>(`/api/lounge/${loungeId}/posts/upload`, { method: "POST", body: formData });
      setNewImageUrl(res.url);
    } catch { /* toast */ }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!newContent.trim() && !newImageUrl) return;
    setSubmitting(true);
    try {
      await api(`/api/lounge/${loungeId}/posts`, {
        method: "POST",
        body: JSON.stringify({ content: newContent.trim(), imageUrl: newImageUrl }),
      });
      setNewContent("");
      setNewImageUrl(null);
      setCreating(false);
      fetchPosts();
    } catch { /* toast */ }
    setSubmitting(false);
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">{t("lounge.posts")}</h3>
        {isOwner && !creating && (
          <Button variant="default" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t("lounge.newPost")}
          </Button>
        )}
      </div>

      {/* Create form */}
      {isOwner && creating && (
        <div className="rounded-xl border border-brand/30 p-3 space-y-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t("lounge.postPlaceholder")}
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none outline-none focus:border-brand"
          />
          {newImageUrl && (
            <div className="relative">
              <img src={newImageUrl} alt="" className="w-full rounded-lg object-cover max-h-48" />
              <button type="button" onClick={() => setNewImageUrl(null)} className="absolute top-1 right-1 rounded-full bg-background/80 p-1">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadImage(f); e.target.value = ""; }} />
              <span className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {t("lounge.addImage")}
              </span>
            </label>
            <div className="flex-1" />
            <Button size="sm" className="h-7 text-xs" onClick={() => { setCreating(false); setNewContent(""); setNewImageUrl(null); }} variant="ghost">{t("common.cancel")}</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={submitting || (!newContent.trim() && !newImageUrl)}>{t("lounge.publish")}</Button>
          </div>
        </div>
      )}

      {/* Posts list */}
      {posts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">{t("lounge.noPosts")}</p>
      ) : posts.map((post) => (
        <div key={post.id} className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-purple-500/10 overflow-hidden flex items-center justify-center shrink-0">
              {post.authorImage ? (
                <img src={post.authorImage} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <Mic className="h-4 w-4 text-purple-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{post.authorName}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          {post.content && <p className="text-sm">{post.content}</p>}
          {post.imageUrl && (
            <img src={post.imageUrl} alt="" className="w-full rounded-lg object-cover max-h-64" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function LoungeDetailPage() {
  return (
    <AuthGuard>
      <LoungeDetailInner />
    </AuthGuard>
  );
}
