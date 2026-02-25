use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub cors_origin: String,
    pub better_auth_secret: String,
    pub better_auth_url: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub upload_dir: String,
    pub max_file_size: usize,
    pub r2_endpoint: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_bucket: String,
    pub r2_public_url: String,
    pub admin_emails: Vec<String>,
    pub vapid_public_key: String,
    pub vapid_private_key: String,
    pub vapid_subject: String,
    pub sentry_dsn: String,
    /// Shared secret for the POST /api/office/event endpoint (plugin → server).
    pub office_event_token: String,
    /// AES-256-GCM key for encrypting API keys (64 hex chars = 32 bytes).
    pub encryption_key: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3501),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL is required"),
            redis_url: env::var("REDIS_URL").expect("REDIS_URL is required"),
            cors_origin: env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3500".into()),
            better_auth_secret: env::var("BETTER_AUTH_SECRET")
                .unwrap_or_else(|_| "arinova-dev-secret-change-in-production".into()),
            better_auth_url: env::var("BETTER_AUTH_URL")
                .unwrap_or_else(|_| "http://localhost:3501".into()),
            google_client_id: env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),
            github_client_id: env::var("GITHUB_CLIENT_ID").unwrap_or_default(),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET").unwrap_or_default(),
            upload_dir: env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".into()),
            max_file_size: env::var("MAX_FILE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10 * 1024 * 1024),
            r2_endpoint: env::var("R2_ENDPOINT").unwrap_or_default(),
            r2_access_key_id: env::var("R2_ACCESS_KEY_ID").unwrap_or_default(),
            r2_secret_access_key: env::var("R2_SECRET_ACCESS_KEY").unwrap_or_default(),
            r2_bucket: env::var("R2_BUCKET").unwrap_or_else(|_| "arinova-uploads".into()),
            r2_public_url: env::var("R2_PUBLIC_URL").unwrap_or_default(),
            admin_emails: env::var("ADMIN_EMAILS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            vapid_public_key: env::var("VAPID_PUBLIC_KEY").unwrap_or_default(),
            vapid_private_key: env::var("VAPID_PRIVATE_KEY").unwrap_or_default(),
            vapid_subject: env::var("VAPID_SUBJECT")
                .unwrap_or_else(|_| "mailto:admin@arinova.ai".into()),
            sentry_dsn: env::var("SENTRY_DSN").unwrap_or_default(),
            office_event_token: env::var("OFFICE_EVENT_TOKEN").unwrap_or_default(),
            encryption_key: {
                let key = env::var("ENCRYPTION_KEY")
                    .expect("ENCRYPTION_KEY is required");
                if !regex_lite::Regex::new(r"^[0-9a-fA-F]{64}$")
                    .unwrap()
                    .is_match(&key)
                {
                    panic!("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
                }
                key
            },
        }
    }

    pub fn is_r2_configured(&self) -> bool {
        !self.r2_endpoint.is_empty()
            && !self.r2_access_key_id.is_empty()
            && !self.r2_secret_access_key.is_empty()
    }

    pub fn is_push_enabled(&self) -> bool {
        !self.vapid_public_key.is_empty() && !self.vapid_private_key.is_empty()
    }

    pub fn cors_origins(&self) -> Vec<String> {
        self.cors_origin
            .split(',')
            .map(|s| s.trim().to_string())
            .collect()
    }
}
