## ADDED Requirements

### Requirement: Guest game-selection landing page

The system SHALL serve a guest-facing game-selection page at `/` that lets a guest choose which game to enter, and SHALL route the existing poker guest experience to `/poker` and the Emoji word-guessing guest experience to `/emoji`.

#### Scenario: Landing page lists available games

- **WHEN** a guest navigates to `/`
- **THEN** the page displays the available games (扑克猜心 and Emoji 猜词) as selectable entries

#### Scenario: Entering the poker game

- **WHEN** a guest selects 扑克猜心 from the landing page
- **THEN** the browser navigates to `/poker` and renders the poker guest page

#### Scenario: Entering the emoji game

- **WHEN** a guest selects Emoji 猜词 from the landing page
- **THEN** the browser navigates to `/emoji` and renders the emoji guest page

#### Scenario: Root no longer renders poker directly

- **WHEN** a guest navigates to `/`
- **THEN** the poker game is NOT rendered directly; the selection page is shown instead

### Requirement: Admin game-selection page

The system SHALL serve an admin game-selection page at `/admin` (behind the existing admin auth flow) that routes to `/admin/poker` and `/admin/emoji`.

#### Scenario: Admin selection routes to poker admin

- **WHEN** an authenticated admin selects 扑克猜心 on `/admin`
- **THEN** the browser navigates to `/admin/poker` and renders the poker admin UI

#### Scenario: Admin selection routes to emoji admin

- **WHEN** an authenticated admin selects Emoji 猜词 on `/admin`
- **THEN** the browser navigates to `/admin/emoji` and renders the emoji admin UI

### Requirement: Global single-active-game mutual exclusion

The system SHALL allow at most one game to be active at any time across all game types. An active game is an open poker round OR an active emoji game. The system SHALL prevent starting a game of either type while any game is active.

#### Scenario: Starting emoji blocked while poker round open

- **WHEN** an admin attempts to start an emoji game while a poker round is open
- **THEN** the system rejects the request and indicates that a poker game is in progress

#### Scenario: Starting poker blocked while emoji game active

- **WHEN** an admin attempts to open a poker round while an emoji game is active
- **THEN** the system rejects the request and indicates that an emoji game is in progress

#### Scenario: Both games selectable when none active

- **WHEN** no poker round is open and no emoji game is active
- **THEN** an admin may start either a poker round or an emoji game

#### Scenario: Selection pages surface in-progress game

- **WHEN** a guest or admin views a selection page while a game is active
- **THEN** the page indicates which game is currently in progress

#### Scenario: Mutual exclusion clears when game ends

- **WHEN** the active game finishes (poker round revealed or emoji game over)
- **THEN** the system allows a new game of either type to be started
