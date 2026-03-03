use regex_lite::Regex;
use serde::Serialize;
use sqlx::PgPool;
use std::net::IpAddr;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct OgMeta {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub favicon_url: Option<String>,
    pub domain: Option<String>,
}

/// Extract up to `limit` HTTP(S) URLs from text content.
pub fn extract_urls(content: &str, limit: usize) -> Vec<String> {
    let re = Regex::new(r#"https?://[^\s<>\)\]\}\\"'`,]+"#).unwrap();
    let mut urls: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for m in re.find_iter(content) {
        let url = m.as_str().trim_end_matches(|c: char| ".,:;!?)".contains(c));
        if seen.insert(url.to_string()) {
            urls.push(url.to_string());
            if urls.len() >= limit {
                break;
            }
        }
    }
    urls
}

/// Check if an IP address is private/reserved (SSRF protection).
fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()                        // 127.0.0.0/8
                || v4.is_private()                   // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
                || v4.is_link_local()                // 169.254.0.0/16 (includes AWS metadata 169.254.169.254)
                || v4.is_broadcast()                 // 255.255.255.255
                || v4.is_unspecified()               // 0.0.0.0
                || v4.octets()[0] == 100 && v4.octets()[1] >= 64 && v4.octets()[1] <= 127  // 100.64.0.0/10 (CGNAT)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()                         // ::1
                || v6.is_unspecified()               // ::
                // IPv4-mapped IPv6: check the embedded v4 address
                || v6.to_ipv4_mapped().map(|v4| {
                    v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
                }).unwrap_or(false)
        }
    }
}

/// Validate that a URL is safe to fetch (not targeting internal resources).
fn validate_url_safe(target_url: &str) -> Option<()> {
    let parsed = url::Url::parse(target_url).ok()?;

    let host = parsed.host_str()?;

    // Block obvious localhost variants
    if host == "localhost" || host == "0.0.0.0" || host == "127.0.0.1" || host == "::1" || host == "[::1]" {
        return None;
    }

    // DNS resolve and check all IPs
    use std::net::ToSocketAddrs;
    let port = parsed.port().unwrap_or(if parsed.scheme() == "https" { 443 } else { 80 });
    let addrs = format!("{}:{}", host, port).to_socket_addrs().ok()?;
    for addr in addrs {
        if is_private_ip(&addr.ip()) {
            return None;
        }
    }

    Some(())
}

/// Fetch OG metadata from a URL. Returns None on failure.
pub async fn fetch_og_metadata(target_url: &str) -> Option<OgMeta> {
    // SSRF protection: block private/internal IPs
    validate_url_safe(target_url)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .ok()?;

    let resp = client
        .get(target_url)
        .header("User-Agent", "ArinovaBot/1.0 (link preview)")
        .send()
        .await
        .ok()?;

    // After redirect, verify the final URL is also safe
    let final_url = resp.url().as_str();
    if final_url != target_url {
        if validate_url_safe(final_url).is_none() {
            return None;
        }
    }

    if !resp.status().is_success() {
        return None;
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") {
        return None;
    }

    // Limit body to 256KB to avoid huge pages
    let body = resp.text().await.ok()?;
    let body = if body.len() > 256_000 {
        &body[..256_000]
    } else {
        &body
    };

    let domain = url::Url::parse(target_url)
        .ok()
        .and_then(|u| u.host_str().map(String::from));

    let title = extract_og_tag(body, "og:title")
        .or_else(|| extract_html_title(body));
    let description = extract_og_tag(body, "og:description")
        .or_else(|| extract_meta_name(body, "description"));
    let image_url = extract_og_tag(body, "og:image");
    let favicon_url = extract_favicon(body, target_url);

    Some(OgMeta {
        url: target_url.to_string(),
        title,
        description,
        image_url,
        favicon_url,
        domain,
    })
}

fn extract_og_tag(html: &str, property: &str) -> Option<String> {
    // Match <meta property="og:title" content="..." />
    let pattern = format!(
        r#"<meta[^>]*property\s*=\s*["']{property}["'][^>]*content\s*=\s*["']([^"']*)["']"#
    );
    let re = Regex::new(&pattern).ok()?;
    re.captures(html).map(|c| html_decode(&c[1]))
        .or_else(|| {
            // Also try reversed attribute order: content before property
            let pattern2 = format!(
                r#"<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']{property}["']"#
            );
            Regex::new(&pattern2).ok()?.captures(html).map(|c| html_decode(&c[1]))
        })
}

fn extract_meta_name(html: &str, name: &str) -> Option<String> {
    let pattern = format!(
        r#"<meta[^>]*name\s*=\s*["']{name}["'][^>]*content\s*=\s*["']([^"']*)["']"#
    );
    let re = Regex::new(&pattern).ok()?;
    re.captures(html).map(|c| html_decode(&c[1]))
        .or_else(|| {
            let pattern2 = format!(
                r#"<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']{name}["']"#
            );
            Regex::new(&pattern2).ok()?.captures(html).map(|c| html_decode(&c[1]))
        })
}

fn extract_html_title(html: &str) -> Option<String> {
    let re = Regex::new(r"(?i)<title[^>]*>([^<]+)</title>").ok()?;
    re.captures(html).map(|c| html_decode(c[1].trim()))
}

fn extract_favicon(html: &str, base_url: &str) -> Option<String> {
    let re = Regex::new(r#"<link[^>]*rel\s*=\s*["'](?:shortcut )?icon["'][^>]*href\s*=\s*["']([^"']+)["']"#).ok()?;
    let href = re.captures(html).map(|c| c[1].to_string());
    match href {
        Some(h) if h.starts_with("http") => Some(h),
        Some(h) => {
            let base = url::Url::parse(base_url).ok()?;
            base.join(&h).ok().map(|u| u.to_string())
        }
        None => {
            let base = url::Url::parse(base_url).ok()?;
            Some(format!("{}://{}/favicon.ico", base.scheme(), base.host_str()?))
        }
    }
}

fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
}

/// Lookup cached preview from DB, or fetch and cache.
pub async fn get_or_fetch(db: &PgPool, target_url: &str) -> Option<OgMeta> {
    // Check cache (TTL: 24 hours)
    let cached: Option<(Uuid, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT id, title, description, image_url, favicon_url, domain FROM link_previews WHERE url = $1 AND fetched_at > NOW() - INTERVAL '24 hours'"
        )
        .bind(target_url)
        .fetch_optional(db)
        .await
        .ok()?;

    if let Some((_id, title, description, image_url, favicon_url, domain)) = cached {
        return Some(OgMeta {
            url: target_url.to_string(),
            title,
            description,
            image_url,
            favicon_url,
            domain,
        });
    }

    // Fetch fresh
    let meta = fetch_og_metadata(target_url).await?;

    // Upsert into cache
    let _ = sqlx::query(
        "INSERT INTO link_previews (url, title, description, image_url, favicon_url, domain, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (url) DO UPDATE SET title = $2, description = $3, image_url = $4, favicon_url = $5, domain = $6, fetched_at = NOW()"
    )
    .bind(&meta.url)
    .bind(&meta.title)
    .bind(&meta.description)
    .bind(&meta.image_url)
    .bind(&meta.favicon_url)
    .bind(&meta.domain)
    .execute(db)
    .await;

    Some(meta)
}

/// Extract URLs from message content, fetch/cache their OG metadata,
/// and insert into message_link_previews. Designed to be spawned as a
/// background task so it doesn't block message delivery.
pub async fn attach_link_previews(db: &PgPool, message_id: &str, content: &str) {
    let urls = extract_urls(content, 3);
    if urls.is_empty() {
        return;
    }
    for (idx, url) in urls.iter().enumerate() {
        if get_or_fetch(db, url).await.is_some() {
            // Get the cached preview ID
            let preview_id: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM link_previews WHERE url = $1"
            )
            .bind(url)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            if let Some((pid,)) = preview_id {
                let _ = sqlx::query(
                    "INSERT INTO message_link_previews (message_id, preview_id, sort_order) VALUES ($1::uuid, $2, $3) ON CONFLICT DO NOTHING"
                )
                .bind(message_id)
                .bind(pid)
                .bind(idx as i32)
                .execute(db)
                .await;
            }
        }
    }
}
