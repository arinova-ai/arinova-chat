## ADDED Requirements

### Requirement: File upload magic number validation
The server SHALL validate uploaded file content by checking magic numbers (file signatures) in addition to the MIME type header. Files whose content does not match the declared MIME type SHALL be rejected.

#### Scenario: Valid file accepted
- **WHEN** user uploads a PNG file with correct magic number and `image/png` MIME type
- **THEN** server accepts and stores the file

#### Scenario: Spoofed MIME type rejected
- **WHEN** user uploads an executable file with `image/png` MIME type but non-image magic number
- **THEN** server rejects with 400 and message "File content does not match declared type"

#### Scenario: Unknown file type handled
- **WHEN** user uploads a file with unrecognized magic number
- **THEN** server rejects with 400 and message "Unsupported file type"
