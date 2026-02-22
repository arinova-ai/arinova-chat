## ADDED Requirements

### Requirement: Code syntax highlighting optimization
The frontend SHALL use a lighter-weight syntax highlighting solution or lazy-load highlight.js to reduce initial bundle size.

#### Scenario: Initial page load
- **WHEN** user loads the chat page without any code blocks visible
- **THEN** syntax highlighting library is NOT included in the initial bundle

#### Scenario: Code block rendered
- **WHEN** a message containing a code block is rendered
- **THEN** syntax highlighting is applied (may be lazy-loaded on first encounter)

### Requirement: Bundle analysis and monitoring
The build process SHALL include bundle analysis capability to track bundle size over time.

#### Scenario: Bundle size check
- **WHEN** developer runs bundle analysis
- **THEN** a report shows per-chunk sizes and largest dependencies
