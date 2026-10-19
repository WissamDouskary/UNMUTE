# Calendar sync rules

Google Calendar is a pull, plus a push when UNMUTE creates a block. It is not a live two-way merge.

## What is proven

- A webhook with the wrong channel token returns 200 and does not list events. Google will not retry a 200.
- The `sync` handshake does not list events.
- A matching `exists` notification lists once and publishes `calendar.updated`.
- A second identical `exists` notification lists again. Duplicate deliveries are not collapsed.
- A 410 from Google clears the stored sync token and lists the visible window once more.
- An access token inside its expiry window is reused. An expired token is refreshed, the new access token and any rotated refresh token are stored, and a newly constructed token service reads that stored refresh token. That is the recovery path after the process restarts, as long as the calendar account row is still in Postgres.
- Stored events are returned when a pull fails. The failure is logged by exception class.

## What is not proven

These need a Google account and a running watch channel. They are not covered by the current tests.

- Simultaneous edits. `apply` writes the Google payload onto the row with the same user and Google event id. The latest successful pull wins. A local change that was not pushed is overwritten. There is no field-level merge.
- Recurring events and daylight-saving changes. Rows store a start and an end instant. Expansion of a recurrence rule is not implemented here.
- Deleting an event on one side while the other side edits it. A payload with status `cancelled` deletes the stored row and clears the linked task's schedule. An edit that arrives later recreates the row.
- Restart of the Google watch itself. The account row keeps the channel id, but this suite does not prove that a new process receives the next webhook or renews the channel.
- Server-sent event reconnect after the browser drops the stream.

## How to test the unproven cases

1. Connect a Google account that is not a production calendar.
2. Create one event in Google and one block in UNMUTE. Change the title in both places before the next pull. Record which title remains after the pull.
3. Send the same `X-Goog-Channel-ID` and token twice. Confirm the agenda does not duplicate the event id.
4. Revoke the Google refresh token, restart the backend, and open the agenda. The page should keep the last stored events and show that Calendar is not connected or that refresh failed, without deleting those rows.
