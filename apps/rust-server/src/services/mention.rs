//! Resolve @name patterns in message content to agent IDs.

use sqlx::PgPool;

/// Agent member info for mention resolution.
struct AgentMember {
    id: String,
    name: String,
}

/// Parse `@word` patterns from content and resolve them to agent IDs
/// by matching against conversation member agents' names (case-insensitive).
///
/// Returns a deduplicated Vec of matched agent ID strings.
pub async fn resolve_mentions_from_content(
    db: &PgPool,
    conversation_id: &str,
    content: &str,
    exclude_agent_id: Option<&str>,
) -> Vec<String> {
    // Extract all @word patterns (\w covers [a-zA-Z0-9_])
    let re = regex_lite::Regex::new(r"@(\w+)").unwrap();
    let at_words: Vec<String> = re
        .captures_iter(content)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
        .collect();

    if at_words.is_empty() {
        return vec![];
    }

    // Fetch all agent members in this conversation
    let agents = sqlx::query_as::<_, (String, String)>(
        r#"SELECT cm.agent_id::text, a.name
           FROM conversation_members cm
           JOIN agents a ON a.id = cm.agent_id
           WHERE cm.conversation_id = $1::uuid AND cm.agent_id IS NOT NULL"#,
    )
    .bind(conversation_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let members: Vec<AgentMember> = agents
        .into_iter()
        .map(|(id, name)| AgentMember { id, name })
        .collect();

    let mut resolved: Vec<String> = Vec::new();

    for word in &at_words {
        let word_lower = word.to_lowercase();

        // Exact name match (case-insensitive)
        if let Some(agent) = members.iter().find(|a| a.name.to_lowercase() == word_lower) {
            if exclude_agent_id.map_or(true, |ex| ex != agent.id) && !resolved.contains(&agent.id)
            {
                resolved.push(agent.id.clone());
            }
        }
    }

    resolved
}
