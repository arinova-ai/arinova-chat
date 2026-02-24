## ADDED Requirements

### Requirement: Group creator is admin
The system SHALL assign the "admin" role to the group creator. There is exactly one admin per group.

#### Scenario: Group created with admin
- **WHEN** User A creates a group
- **THEN** User A's role in `conversation_user_members` is "admin"

### Requirement: Admin powers
The admin SHALL be able to: kick users and agents, change group settings (name, history visibility, invite permissions), promote/demote vice-admins, regenerate/disable invite link.

#### Scenario: Admin kicks a user
- **WHEN** admin kicks User B from the group
- **THEN** User B and all agents owned by User B are removed from the group

#### Scenario: Admin changes group settings
- **WHEN** admin updates group name or history_visible setting
- **THEN** the settings are saved and visible to all members

#### Scenario: Admin promotes vice-admin
- **WHEN** admin promotes User B to vice-admin
- **THEN** User B's role changes to "vice_admin"

#### Scenario: Admin demotes vice-admin
- **WHEN** admin demotes User B from vice-admin
- **THEN** User B's role changes to "member"

### Requirement: Vice-admin powers
Vice-admins SHALL be able to: kick members (not admin or other vice-admins), invite users. Vice-admins SHALL NOT be able to change group settings.

#### Scenario: Vice-admin kicks member
- **WHEN** vice-admin kicks a member
- **THEN** the member and their agents are removed from the group

#### Scenario: Vice-admin cannot kick admin
- **WHEN** vice-admin attempts to kick the admin
- **THEN** system rejects with error "Cannot kick the group admin"

#### Scenario: Vice-admin cannot change settings
- **WHEN** vice-admin attempts to change group settings
- **THEN** system rejects with error "Only the admin can change group settings"

### Requirement: Admin cannot leave without delegation
The admin SHALL NOT be able to leave the group without first transferring admin role to another member.

#### Scenario: Admin attempts to leave
- **WHEN** admin tries to leave the group
- **THEN** system rejects with error "Transfer admin role before leaving"

#### Scenario: Admin transfers and leaves
- **WHEN** admin transfers admin role to User B, then leaves
- **THEN** User B becomes admin and the previous admin leaves the group

### Requirement: Kick removes user's agents
When a user is kicked from a group, all agents owned by that user SHALL be automatically removed.

#### Scenario: User kicked with agents
- **WHEN** admin kicks User B who has 2 agents in the group
- **THEN** User B and both agents are removed from the group

### Requirement: Agent owner can withdraw agent
An agent's owner SHALL be able to remove their own agent from any group.

#### Scenario: Owner withdraws agent
- **WHEN** User A removes their agent from a group
- **THEN** the agent is removed from the group

### Requirement: Invite link
The system SHALL support invite links for groups. The link is a random URL-safe token. Admin can regenerate (invalidates old link) or disable invites.

#### Scenario: Invite link generated
- **WHEN** admin enables invites for a group
- **THEN** a random invite token is generated and stored in `group_settings`

#### Scenario: User joins via invite link
- **WHEN** a user clicks a valid invite link
- **THEN** the user joins the group as "member" (friendship not required)

#### Scenario: Invite link regenerated
- **WHEN** admin regenerates the invite link
- **THEN** old link is invalidated and a new token is generated

#### Scenario: Invites disabled
- **WHEN** admin disables invites
- **THEN** the invite link stops working until re-enabled
