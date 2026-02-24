## ADDED Requirements

### Requirement: Multipart file upload with validation
The server SHALL handle multipart file uploads with the same validation rules as the Node.js server.

#### Scenario: Valid file upload
- **WHEN** a supported file type (JPEG, PNG, GIF, WebP, PDF, TXT, CSV, JSON) under 10MB is uploaded
- **THEN** the server SHALL store it (R2 if configured, local disk otherwise) and create an attachment record

#### Scenario: Invalid file type
- **WHEN** an unsupported file type is uploaded
- **THEN** the server SHALL reject with 400

#### Scenario: File too large
- **WHEN** a file exceeding MAX_FILE_SIZE is uploaded
- **THEN** the server SHALL reject with 413

#### Scenario: Magic number validation
- **WHEN** a file is uploaded
- **THEN** the server SHALL verify the file content matches the declared type via magic number checking
