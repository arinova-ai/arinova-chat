use rand::Rng;

/// Generate a permanent bot secret token: ari_ + 48 hex chars = 52 chars total
pub fn generate_secret_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..24).map(|_| rng.gen()).collect();
    format!("ari_{}", hex::encode(bytes))
}
