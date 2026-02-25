-- Seed: Demo marketplace data
-- Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING)

-- Demo creator user
INSERT INTO "user" (id, name, email, email_verified, image, username)
VALUES (
    'demo-creator-001',
    'Arinova Demo',
    'demo@arinova.ai',
    TRUE,
    NULL,
    'arinova_demo'
) ON CONFLICT (id) DO NOTHING;

-- Demo reviewer users
INSERT INTO "user" (id, name, email, email_verified, image, username)
VALUES
    ('demo-reviewer-001', 'Alex Chen', 'alex@example.com', TRUE, NULL, 'alexchen'),
    ('demo-reviewer-002', 'Sarah Kim', 'sarah@example.com', TRUE, NULL, 'sarahkim'),
    ('demo-reviewer-003', 'Mike Johnson', 'mike@example.com', TRUE, NULL, 'mikejohnson')
ON CONFLICT (id) DO NOTHING;

-- ===== Agent Listings =====

-- 1. Writing Assistant (OpenAI GPT-4)
INSERT INTO agent_listings (
    id, creator_id, agent_name, description, category, avatar_url,
    system_prompt, api_key_encrypted, model_id, model_provider,
    price_per_message, free_trial_messages, status,
    sales_count, avg_rating, review_count, total_messages, total_revenue,
    welcome_message
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'demo-creator-001',
    'WriteCraft Pro',
    'Professional writing assistant that helps with essays, articles, emails, and creative writing. Provides grammar corrections, style suggestions, and content structuring.',
    'productivity',
    NULL,
    'You are WriteCraft Pro, a professional writing assistant. Help users with:
- Writing and editing essays, articles, blog posts, and emails
- Grammar and style improvements
- Content structuring and outlining
- Tone adjustments (formal, casual, persuasive, etc.)
- Creative writing prompts and feedback
Always be constructive and explain your suggestions. Format output with clear headings when appropriate.',
    'demo-encrypted-key-not-real-001',
    'gpt-4',
    'openai',
    2, 3, 'active',
    42, 4.5, 8, 156, 224,
    'Hello! I''m WriteCraft Pro. Whether you need help with an essay, email, article, or creative piece, I''m here to help. What would you like to write today?'
) ON CONFLICT (id) DO NOTHING;

-- 2. Code Reviewer (Anthropic Claude)
INSERT INTO agent_listings (
    id, creator_id, agent_name, description, category, avatar_url,
    system_prompt, api_key_encrypted, model_id, model_provider,
    price_per_message, free_trial_messages, status,
    sales_count, avg_rating, review_count, total_messages, total_revenue,
    welcome_message
) VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'demo-creator-001',
    'CodeReview AI',
    'Expert code reviewer that analyzes your code for bugs, security issues, performance problems, and best practices. Supports Python, JavaScript, TypeScript, Rust, Go, and more.',
    'development',
    NULL,
    'You are CodeReview AI, an expert code reviewer. When reviewing code:
- Identify bugs, logic errors, and edge cases
- Flag security vulnerabilities (injection, XSS, auth issues)
- Suggest performance optimizations
- Check adherence to language-specific best practices
- Recommend cleaner patterns and refactoring opportunities
- Rate severity: CRITICAL, WARNING, INFO
Format reviews with clear sections. Be specific about line numbers and provide fixed code snippets.',
    'demo-encrypted-key-not-real-002',
    'claude-3-opus-20240229',
    'anthropic',
    3, 2, 'active',
    67, 4.8, 12, 289, 621,
    'Hi! I''m CodeReview AI. Paste your code and I''ll review it for bugs, security issues, performance, and best practices. What language are we working with today?'
) ON CONFLICT (id) DO NOTHING;

-- 3. Language Tutor (OpenAI GPT-4)
INSERT INTO agent_listings (
    id, creator_id, agent_name, description, category, avatar_url,
    system_prompt, api_key_encrypted, model_id, model_provider,
    price_per_message, free_trial_messages, status,
    sales_count, avg_rating, review_count, total_messages, total_revenue,
    welcome_message
) VALUES (
    'a0000000-0000-0000-0000-000000000003',
    'demo-creator-001',
    'LinguaBot',
    'Interactive language tutor supporting Spanish, French, Japanese, Korean, and Mandarin. Adaptive difficulty with grammar drills, conversation practice, and cultural tips.',
    'education',
    NULL,
    'You are LinguaBot, a friendly and patient language tutor. You support:
- Spanish, French, Japanese, Korean, and Mandarin Chinese
- Beginner to advanced levels
When teaching:
- Adapt to the user''s level based on their responses
- Use the target language progressively (start with translations, increase immersion)
- Explain grammar rules clearly with examples
- Correct mistakes gently and explain why
- Include cultural context and tips
- Use spaced repetition for vocabulary
Start by asking which language and their current level.',
    'demo-encrypted-key-not-real-003',
    'gpt-4',
    'openai',
    2, 5, 'active',
    35, 4.2, 6, 420, 700,
    'Welcome to LinguaBot! I can help you learn Spanish, French, Japanese, Korean, or Mandarin. Which language interests you, and what''s your current level?'
) ON CONFLICT (id) DO NOTHING;

-- 4. Creative Storyteller (Anthropic Claude)
INSERT INTO agent_listings (
    id, creator_id, agent_name, description, category, avatar_url,
    system_prompt, api_key_encrypted, model_id, model_provider,
    price_per_message, free_trial_messages, status,
    sales_count, avg_rating, review_count, total_messages, total_revenue,
    welcome_message
) VALUES (
    'a0000000-0000-0000-0000-000000000004',
    'demo-creator-001',
    'StoryForge',
    'Collaborative storytelling AI that creates immersive narratives. Choose your genre — fantasy, sci-fi, mystery, romance — and shape the story with your choices.',
    'creative',
    NULL,
    'You are StoryForge, a collaborative storytelling AI. Your role:
- Create vivid, immersive narratives with rich descriptions
- Offer the reader meaningful choices that affect the plot
- Maintain consistent world-building and character development
- Support genres: fantasy, sci-fi, mystery, romance, horror, historical fiction
- Write in second person ("You enter the dimly lit tavern...")
- End each response with 2-3 choices for the reader
- Track story state: characters met, items found, decisions made
- Vary sentence structure and pacing for dramatic effect
Keep responses between 200-400 words for good pacing.',
    'demo-encrypted-key-not-real-004',
    'claude-3-opus-20240229',
    'anthropic',
    1, 5, 'active',
    89, 4.7, 15, 1203, 1082,
    'Welcome to StoryForge! I create interactive stories where your choices shape the narrative. Pick a genre to begin: Fantasy, Sci-Fi, Mystery, Romance, or Horror?'
) ON CONFLICT (id) DO NOTHING;

-- 5. Data Analyst (OpenAI GPT-4)
INSERT INTO agent_listings (
    id, creator_id, agent_name, description, category, avatar_url,
    system_prompt, api_key_encrypted, model_id, model_provider,
    price_per_message, free_trial_messages, status,
    sales_count, avg_rating, review_count, total_messages, total_revenue,
    welcome_message
) VALUES (
    'a0000000-0000-0000-0000-000000000005',
    'demo-creator-001',
    'DataSense',
    'Data analysis assistant that helps interpret datasets, write SQL queries, create visualization recommendations, and explain statistical concepts in plain language.',
    'analytics',
    NULL,
    'You are DataSense, a data analysis assistant. You help with:
- Writing and optimizing SQL queries (PostgreSQL, MySQL, SQLite)
- Interpreting data patterns and trends
- Statistical analysis (mean, median, regression, correlation, hypothesis testing)
- Recommending chart types and visualization approaches
- Cleaning and transforming data (pandas, Excel formulas)
- Explaining statistical concepts in plain language
When given data, provide structured analysis with:
1. Summary statistics
2. Key observations
3. Potential insights
4. Recommended next steps
Use tables and formatted output for clarity.',
    'demo-encrypted-key-not-real-005',
    'gpt-4',
    'openai',
    3, 3, 'active',
    28, 4.3, 5, 98, 196,
    'Hi! I''m DataSense, your data analysis assistant. I can help with SQL queries, statistical analysis, data visualization, and more. What data challenge are you working on?'
) ON CONFLICT (id) DO NOTHING;

-- 6. Customer Support Bot (OpenAI GPT-3.5 Turbo)
INSERT INTO agent_listings (
    id, creator_id, agent_name, description, category, avatar_url,
    system_prompt, api_key_encrypted, model_id, model_provider,
    price_per_message, free_trial_messages, status,
    sales_count, avg_rating, review_count, total_messages, total_revenue,
    welcome_message
) VALUES (
    'a0000000-0000-0000-0000-000000000006',
    'demo-creator-001',
    'SupportBot Template',
    'Ready-to-customize customer support agent template. Handles FAQs, troubleshooting, and ticket escalation. Great starting point for building your own support bot.',
    'support',
    NULL,
    'You are a friendly and helpful customer support agent. Follow these guidelines:
- Be empathetic and patient with every customer
- Ask clarifying questions before jumping to solutions
- Provide step-by-step troubleshooting instructions
- If you cannot resolve the issue, offer to escalate
- Use a warm, professional tone
- Summarize the resolution at the end of each interaction
- Common topics: account issues, billing questions, technical problems, feature requests
Always acknowledge the customer''s frustration before problem-solving.',
    'demo-encrypted-key-not-real-006',
    'gpt-3.5-turbo',
    'openai',
    1, 5, 'active',
    15, 3.8, 4, 67, 37,
    'Hello! I''m here to help. Whether you have a question, need troubleshooting, or want to report an issue, I''ll do my best to assist you. What can I help with?'
) ON CONFLICT (id) DO NOTHING;

-- ===== Demo Reviews =====

-- Reviews for CodeReview AI (listing 002)
INSERT INTO agent_reviews (id, listing_id, user_id, rating, comment)
VALUES
    ('b0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000002',
     'demo-reviewer-001', 5,
     'Caught a critical SQL injection vulnerability in my code that I completely missed. The severity ratings are super helpful.'),
    ('b0000000-0000-0000-0000-000000000002',
     'a0000000-0000-0000-0000-000000000002',
     'demo-reviewer-002', 5,
     'Best code reviewer I''ve used. Gives actionable feedback with code snippets, not just vague suggestions.'),
    ('b0000000-0000-0000-0000-000000000003',
     'a0000000-0000-0000-0000-000000000002',
     'demo-reviewer-003', 4,
     'Very thorough reviews. Occasionally over-flags minor style issues, but the security and logic checks are excellent.')
ON CONFLICT (id) DO NOTHING;

-- Reviews for StoryForge (listing 004)
INSERT INTO agent_reviews (id, listing_id, user_id, rating, comment)
VALUES
    ('b0000000-0000-0000-0000-000000000004',
     'a0000000-0000-0000-0000-000000000004',
     'demo-reviewer-001', 5,
     'Incredibly immersive! The branching storylines feel genuinely different. My fantasy adventure was 30+ messages and I didn''t want it to end.'),
    ('b0000000-0000-0000-0000-000000000005',
     'a0000000-0000-0000-0000-000000000004',
     'demo-reviewer-002', 4,
     'Great storytelling. The choices really matter. Only wish the responses were a bit longer sometimes.')
ON CONFLICT (id) DO NOTHING;

-- Reviews for WriteCraft Pro (listing 001)
INSERT INTO agent_reviews (id, listing_id, user_id, rating, comment)
VALUES
    ('b0000000-0000-0000-0000-000000000006',
     'a0000000-0000-0000-0000-000000000001',
     'demo-reviewer-001', 4,
     'Helped me rewrite my cover letter from scratch. The tone adjustment feature is really useful.'),
    ('b0000000-0000-0000-0000-000000000007',
     'a0000000-0000-0000-0000-000000000001',
     'demo-reviewer-003', 5,
     'Used this for my thesis editing. Grammar suggestions were spot-on and it helped restructure my argument flow.')
ON CONFLICT (id) DO NOTHING;
