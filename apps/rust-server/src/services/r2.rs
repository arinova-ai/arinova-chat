use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;

use crate::config::Config;

/// Create an S3 client configured for Cloudflare R2.
/// Returns None if R2 is not configured.
pub fn create_s3_client(config: &Config) -> Option<S3Client> {
    if !config.is_r2_configured() {
        return None;
    }

    let credentials = Credentials::new(
        &config.r2_access_key_id,
        &config.r2_secret_access_key,
        None,
        None,
        "r2",
    );

    let s3_config = aws_sdk_s3::Config::builder()
        .behavior_version_latest()
        .region(Region::new("auto"))
        .endpoint_url(&config.r2_endpoint)
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    Some(S3Client::from_conf(s3_config))
}

/// Upload a file to R2. Returns the public URL.
/// If R2 is not configured, returns None (caller should fall back to local disk).
pub async fn upload_to_r2(
    s3: &S3Client,
    bucket: &str,
    key: &str,
    body: Vec<u8>,
    content_type: &str,
    public_url: &str,
) -> Result<String, anyhow::Error> {
    s3.put_object()
        .bucket(bucket)
        .key(key)
        .body(ByteStream::from(body))
        .content_type(content_type)
        .send()
        .await?;

    Ok(format!("{}/{}", public_url, key))
}
