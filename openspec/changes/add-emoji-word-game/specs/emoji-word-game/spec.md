## ADDED Requirements

### Requirement: Question bank import

The admin SHALL provide the question bank for an emoji game by pasting text, one question per line, in the format `emoji|答案|提示`. Each question is a triple of emoji, answer, and hint. The bank belongs to the game instance being started and is not a global reusable bank.

#### Scenario: Valid bank import

- **WHEN** an admin starts a game with text containing lines of the form `emoji|答案|提示`
- **THEN** the system creates one question per line, preserving line order as the serving order

#### Scenario: Blank lines ignored

- **WHEN** the pasted text contains blank or whitespace-only lines between questions
- **THEN** the system skips those lines and does not create empty questions

#### Scenario: Malformed line rejected

- **WHEN** a line does not contain exactly the three pipe-separated fields (emoji, answer, hint)
- **THEN** the system rejects the import and reports which line is malformed, creating no game

#### Scenario: Empty bank rejected

- **WHEN** an admin attempts to start a game with no valid question lines
- **THEN** the system rejects the request and no game is created

### Requirement: Starting an emoji game

The admin SHALL start an emoji game from a valid imported bank, subject to the global single-active-game rule. On start, the game becomes `active` and the first question is served.

#### Scenario: Game starts and first question served

- **WHEN** an admin starts a game with a valid bank and no other game is active
- **THEN** the system creates an `active` game, marks the first question `active`, and broadcasts `emoji:game_started` followed by the first `emoji:question`

#### Scenario: Question payload hides the answer

- **WHEN** a question is served to guests via `emoji:question` or the current-state API
- **THEN** the payload includes the emoji and hint but NEVER includes the answer

### Requirement: Answer matching

The system SHALL match a guest's submitted answer against the question's answer using normalized exact comparison: trim leading/trailing whitespace and lowercase both values, then compare for exact equality.

#### Scenario: Exact match after normalization

- **WHEN** a guest submits an answer that equals the question answer after trim and lowercase (e.g. "  Apple " vs "apple")
- **THEN** the system treats it as correct

#### Scenario: Non-matching answer

- **WHEN** a guest submits an answer that does not equal the question answer after normalization
- **THEN** the system treats it as incorrect

### Requirement: Buzz-in scoring and question locking

For the active question, the FIRST guest to submit a correct answer SHALL score +1 point and the question SHALL become locked. Submission handling is atomic so that exactly one guest can win a given question. After a question is locked, no further answers are accepted for it.

#### Scenario: First correct answer wins and locks

- **WHEN** a guest submits a correct answer for an `active` question that is not yet locked
- **THEN** the system awards that guest +1 point, marks the question `solved` (locked) recording the solver, and broadcasts `emoji:solved`

#### Scenario: Late correct answer rejected after lock

- **WHEN** a guest submits a correct answer for a question that has already been solved
- **THEN** the system rejects the submission indicating the question is already solved, and no additional point is awarded

#### Scenario: Solved broadcast reveals the answer

- **WHEN** a question becomes solved
- **THEN** the `emoji:solved` broadcast includes the solver's nickname, the revealed answer, and the solver's updated score

### Requirement: Retry until solved

Before a question is locked, a guest SHALL be allowed to submit incorrect answers repeatedly without penalty until someone solves it.

#### Scenario: Wrong guess allows retry

- **WHEN** a guest submits an incorrect answer for an unlocked active question
- **THEN** the system responds that the answer is incorrect and allows the guest to submit again

#### Scenario: No per-guest submission cap before lock

- **WHEN** a guest submits multiple incorrect answers for the same unlocked question
- **THEN** the system accepts each attempt and does not block the guest from retrying

### Requirement: Advancing to the next question

The admin SHALL advance the game to the next question. Advancing serves the next pending question in order, or ends the game when the bank is exhausted.

#### Scenario: Admin advances to next question

- **WHEN** the admin clicks 下一题 and pending questions remain and the game has not met its end condition
- **THEN** the system marks the next question `active` and broadcasts `emoji:question`

#### Scenario: Advancing past the last question ends the game

- **WHEN** the admin advances and no pending questions remain
- **THEN** the system ends the game (see end conditions)

### Requirement: Three-point promotion (watch-only)

A player who reaches 3 points SHALL be promoted: blocked from submitting further answers, but still able to view questions and game progress. The time of reaching 3 points SHALL be recorded to determine final ranking order.

#### Scenario: Promoted player cannot answer

- **WHEN** a player who has reached 3 points submits an answer
- **THEN** the system rejects the submission indicating the player is already promoted

#### Scenario: Promoted player still sees questions

- **WHEN** a promoted player views the game
- **THEN** the player can still see the current emoji, hint, and progress but the answer input is disabled

#### Scenario: Promotion time recorded

- **WHEN** a player reaches 3 points
- **THEN** the system records the timestamp at which 3 points was reached

### Requirement: Mid-game join

A guest SHALL be allowed to join an active emoji game at any time, starting with 0 points.

#### Scenario: New player joins mid-game

- **WHEN** a new guest enters an active emoji game after it has started
- **THEN** the system admits the player with a score of 0 and allows them to answer the current question

### Requirement: Game end conditions and final ranking

An emoji game SHALL end when 4 players have reached 3 points OR the question bank is exhausted. On end, the game becomes `finished` and a final ranking is produced.

#### Scenario: Game ends when four players reach three points

- **WHEN** a fourth player reaches 3 points
- **THEN** the system ends the game, marks it `finished`, and broadcasts `emoji:game_over` with the final ranking

#### Scenario: Game ends when bank exhausted

- **WHEN** the admin advances past the last question and fewer than 4 players have reached 3 points
- **THEN** the system ends the game, marks it `finished`, and broadcasts `emoji:game_over` with the final ranking

#### Scenario: Final ranking orders promoted players first

- **WHEN** the final ranking is produced
- **THEN** players who reached 3 points are ranked ahead of others, ordered by the time they reached 3 points (earlier first), followed by remaining players ordered by score
