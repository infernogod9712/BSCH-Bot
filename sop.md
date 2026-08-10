# BSCH Staff SOP

**Full Specification - Beanz's Server Creating Helpers**

> Internal reference document. Staff only.
> This is to be distributed AFTER a trainee has passed the application phase.

---

## What Each Section Is For

- **Hiring SOP** - what to do for hiring tickets (a client asking BSCH to build them a server).
- **Support SOP** - what to do for support tickets (general questions, learning help, bug reports).
- **Moderation SOP** - what to do when someone breaks the rules.
- **Onboarding** - how a member joins staff after their application is accepted.
- **Expectations** - what BSCH expects from you as a staff member.
- **Contacts and Help** - who to contact in case of questions or an emergency.
- **Glossary / Reference** - every term and command used in this document, defined.

---

## Server Context

BSCH ("Beanz's Server Creating Helpers") builds exclusively SCP roleplay Discord servers. The service is completely free of charge; donations are optional and never required. Staff is one team split into departments - Moderation and Building - both joined via application followed by the onboarding drill process (see Onboarding section).

The BSCH bot is a custom Node.js/discord.js bot. It previously ran on Discloud but was removed from that host; it now runs on an 8GB Canakit Raspberry Pi 5, at the owner's house.

### Role Hierarchy (top to bottom)

1. Owner
2. Co-Owner
3. Admin
4. Head Staff
5. Moderator
6. Builder
7. Staff Team (general staff role, held alongside a department role)
8. Trainee
9. Member

> **Note:** this replaced an earlier, more granular hierarchy (Head Moderator / Senior Moderator / Moderator and Head Builder / Senior Builder / Builder). The current hierarchy above is the correct, up-to-date version.

**Senior Staff**, referenced throughout this section for dispute escalation and claim overrides, is defined as **Head Staff and above** (Head Staff, Admin, Co-Owner, Owner).

---

## Section 1 - Hiring SOP (Client Flow v4)

This section governs every BSCH case from the moment a client opens a ticket to the moment it closes. A **case** is the full record of one client's hire request, identified by a unique **ticketId** generated the instant the ticket opens. Every command operates on whichever case corresponds to the channel it is run in - the bot resolves this automatically from channel context, no command ever requires typing or pasting a case ID by hand. If a case-related command is run outside a valid ticket channel, the bot rejects it.

Every stage of a case produces two synchronized effects: a plain-language message posted into the ticket announcing what just happened, and a live edit to the case's tracked embeds - both inside the ticket and in the mirrored embed(s) in that case's forum post. Ticket and case file must always agree, and every logged action is timestamped.

### Channel Structure (Hiring-specific)

Clients open cases through the **hire-us** entry point, which creates a private ticket channel. In parallel, the bot creates one forum post per case inside the **hire-bsch-case-logs** forum channel (also referred to as **hire-bsch-files**), tagged with that case's ticket ID.

- The **ticket channel** is where live conversation between the client and BSCH staff happens.
- The **forum post** is not a conversation space - it's a structured, bot-maintained case file that accumulates every field of record for that case, from the client's original intake answers through final paperwork. The forum post is the canonical, searchable archive; the ticket is transient and may eventually be deleted/archived once a case closes, but the forum post persists.

### Case Data Model

Each case is a single record keyed by **ticketId**, containing at minimum:

- Client's Discord ID and original intake answers
- Ordered list of Extra Info entries
- Roster (Lead plus any self-added helper builders)
- Contract status and the exact contract text/timestamp accepted
- Admin-access-granted timestamp
- Build-started and build-finished timestamps
- Client's rating/review response
- Paperwork contents (server name, attached images, other fields)
- Database-copy decision chain (Lead's answer, client's consent, confirmation the copy was performed)
- Final close confirmation

This record is what both the ticket embeds and the case file post render from - two views of the same data, not independently maintained.

### Step 1 - Ticket Opens

When a member opens a hire ticket, the bot immediately generates a new **ticketId** and creates the matching forum post in **hire-bsch-case-logs**, and names the ticket channel `hire-[clientuser]-[ticketid]` (e.g. `hire-coolbeanz-999`). The first embed the bot posts in the new ticket displays two things automatically: the client's intake information, and that client's past build history, pulled by looking up their Discord ID against prior closed cases (equivalent to a manual `!buildlogs @client` lookup). Whoever claims the case already has full context before they say a word.

### Step 2 - Claiming

The first embed carries a **Claim** button. Any Builder may claim an unclaimed case - no availability toggle or pre-qualification step, since BSCH's builder pool is small and scoped entirely to SCP roleplay builds. When a Builder clicks Claim, the bot edits that same first embed in place to add a roster section showing that Builder as **Lead**. The identical roster embed state is mirrored into the case file post at the same moment.

**Exception - unclaimed case timers:** if no Builder claims within 24 hours, the bot pings all Builders requesting a claim. If still unclaimed 24 hours after that (48 hours total), the bot sends the client an apology message and asks them to try again later, then closes the case. At any point before a claim, Senior Staff may force-claim or reassign the case immediately, bypassing both timers.

### Step 3 - Roster & Extra Info

Additional Builders join a case themselves, at will, by running `/addtocase` inside the ticket - no approval step; running the command in a valid ticket channel is sufficient. A Builder is removed from the roster via `/removefromcase`, run by the Lead. The roster embed updates in both locations exactly as it did on claim.

There is no fixed script of questions a Lead must ask a client - every case is different. Whenever a client's answer needs to be captured as a permanent requirement, the Builder runs `/extrainfo [text]`. Each use appends a new, numbered "Extra Info" field to the case embed (Extra Info #1, #2, #3...) in both the ticket and the case file post - a running, ordered list of everything the client has asked for, in the order it was captured.

### Step 4 - Contract

When the Lead is ready to move forward, they run `/contract`. BSCH maintains exactly one hiring contract - no version-numbering system. The bot sends the current contract text as an embed with two buttons, **Accept** and **Decline**, and that exact text is snapshotted into the case's record at the moment it's sent, so if the master contract is edited later, this case is unaffected and continues to reference the terms it was actually shown.

- **Accept:** the bot posts "Contract Accepted" as a message in the ticket and logs the acceptance timestamp to both the ticket embed and the case file post.
- **Decline:** the bot presents a short form asking their reason, logs it to the case file post, and closes the ticket - a declined case does not proceed further.

### Step 5 - Server Access & Build Start

After acceptance, the client grants BSCH's assigned Builder(s) admin access directly in their own server. Because the bot has no visibility into permission changes on a server it isn't managing, this step is confirmed manually: the Builder runs `/admingranted` once access has actually been granted. This single command serves two purposes at once - it logs the access-granted timestamp to both the ticket and case file, and it marks the build as started. There is no separate "start build" command.

### Step 6 - Build Finish & Rating

When the build is complete, the Lead runs `/buildfinished`. This immediately pings the client with a Yes/No button asking "Would you like to leave a rating and/or review?"

- **No:** nothing further happens and the flow proceeds to Step 7.
- **Yes:** the bot presents a form with two fields: a rating entered as any number 1-10, and a free-text review. Whatever the client submits is logged to both the ticket and the case file post once received.

### Step 7 - Paperwork

After the client has responded, the Builder files `/paperwork` - a slash command, not a modal, since Discord modals cannot accept file attachments. Server name, screenshots, and any other closing details are supplied as command parameters directly, with images attached the same way any file is attached to a slash command. This step is independent of the roster; it does not re-derive or auto-fill builder credit from roster data.

### Step 8 - Template Bank Consideration

Once paperwork is filed, the bot pings the Lead asking whether this build is worth preserving in BSCH's reusable template bank. If the Lead says yes, the bot then pings the client with an explanatory embed asking their consent to have their design reused in future projects. Only if the client also agrees does the bot ping a Builder to go copy the server into BSCH's database. A no at either checkpoint - Lead or client - simply skips the copy; nothing else in the flow depends on this outcome. There is no separate command to confirm the copy was completed - `/copyphasedone` (Step 9) covers both closing out this decision and confirming the copy is done, whichever applies.

### Step 9 - Close

Regardless of which way the template-bank decision went, the Lead (or the Builder who performed the copy) runs `/copyphasedone` to close out this stage. The bot then sends one final embed to the client: a reminder to revoke BSCH's admin access from their server, a pointer to the help desk, the donation link, and a final question - is it clear to close the ticket?

- **Yes:** the bot closes the ticket and writes the completed case to its final state in the case file post.
- **No:** the bot does not close the ticket - instead it asks the client what they need before closing, and the ticket stays open until that's resolved.

Nothing about this service requires payment at any stage; the donation link is offered once, here, and is entirely optional.

### Command Reference - Hiring

| Command | Run by | Effect |
| --- | --- | --- |
| `/addtocase` | Any Builder | Self-adds the Builder to the case roster. No approval required. |
| `/removefromcase` | Lead | Removes a Builder from the case roster. |
| `/extrainfo [text]` | Builder on the case | Appends a new numbered Extra Info field to the case record. |
| `/contract` | Lead | Sends the current hiring contract with Accept/Decline buttons; snapshots the text into the case. |
| `/admingranted` | Builder on the case | Confirms server access was granted; also marks the build as started. |
| `/buildfinished` | Lead | Marks the build complete; triggers the client rating/review ping. |
| `/paperwork` | Builder on the case | Files closing details (server name, images, etc.) as command parameters. |
| `/copyphasedone` | Lead, or the Builder who performed the copy | Closes out the template-bank decision (and confirms the copy is done, if applicable); triggers the final close-out embed. |
| `!buildlogs @client` | Any staff | Pulls a client's full case history from hire-bsch-case-logs. Also runs automatically on new-case intake. |

### Exceptions & Edge Cases - Hiring

- **Builder no-show:** if a Builder on the roster stops responding mid-build, the Lead removes them from the roster with `/removefromcase`.
- **Client disappears mid-build:** if the client goes quiet during an active build, the bot pings them after a set inactivity window. If still no response, the case is flagged inactive and archived.
- **Client cancels mid-build:** if the client actively cancels rather than disappearing, the ticket closes immediately with no paperwork or rating step - distinct from a disappearance, logged as a cancellation, not a timeout.
- **Disputes:** any disagreement between the Lead and a helper Builder on the same case that can't be resolved between them is escalated to Senior Staff, who make the final call.
- **Senior Staff override:** Senior Staff may force-claim or reassign a stuck case at any time, independent of the 24h/48h claim timers.
- **Roster visibility:** the current roster for a case is viewable by the client or any staff member at any time, not just at claim or add/remove moments.

---

## Section 2 - Support Ticket Handling

Support tickets are informal by design. No fixed resolution procedure, no required command sequence, and no roster, contract, or case file involved - a support ticket is simply a conversation until the member's question is answered or their issue is resolved, at which point whoever is handling it closes the ticket. Both Builders and Moderators can see and respond to every support ticket category; there is no division-specific restriction on who may pick one up.

Support tickets exist entirely separately from **Hire BSCH** (Section 1). Nothing opened here creates a case, generates a ticket ID for the hiring flow, or posts to hire-bsch-case-logs. If a support ticket turns into an actual hire request, staff should direct the member to open a new ticket through the hire-us entry point rather than continuing the work in place.

Support tickets are opened through the **help-desk** channel and fall into three categories. Each support ticket channel is named `[type]-[clientuser]` (e.g. `general-coolbeanz`, `bugreport-coolbeanz`) - no ticket ID is included, since only hire tickets carry one.

### General Questions

The catch-all category. Covers anything that doesn't cleanly belong in the other two - including questions about how the Moderator or Builder application process works, and partnership or affiliate requests from other servers wanting to cross-promote with BSCH. Application help and partnership requests were previously considered their own categories but are low-volume enough to fold into General Questions rather than add more ticket types for staff and members to sort between.

### Help Me Build / Learn

For members who want guidance, tips, or hands-on help improving a server they're building themselves. This is advice only - no Builder is assigned to their project, no roster is created, and no contract is involved. If what a member actually wants is for BSCH to build the thing for them, that's a Hire BSCH case, not this.

### Bug Report / Bot Issue

For anything the BSCH bot itself is doing wrong - a broken command, a missed ping, an embed that isn't updating correctly, timers not firing. This is a technical issue with the bot, not a person, which keeps it distinct from a staff report (handled through mod mail, not a ticket).

> **Note - Reports & Appeals:** Reporting a member, reporting a staff member (routed to Head Staff), and ban/mute/warning appeals do not go through the ticket system at all. These are handled through mod mail with the bot instead, kept deliberately separate from support tickets since they involve a person-to-person issue rather than a question to answer.

---

## Section 3 - Moderation Guidelines

Moderation is handled via the **Wick** bot for most actions, not the custom BSCH bot. Wick handles the mechanical side - warns, timeouts, quarantine, kicks, bans, channel locks, join-gate locks, and raid protection - so this section is about how BSCH's Moderator department uses it, and how staff are expected to escalate, log, and think about each action, not about building moderation tooling from scratch.

### Commands

| Action | Command | Usage |
| --- | --- | --- |
| Warn | `/warn` or `w!warn` | Lets a member know of a minor wrongdoing before it escalates further. |
| Timeout | `/timeout add` or `w!timeout` | Temporarily silences a member who is being disruptive to general chat and/or breaking communication rules. |
| Quarantine | `/quarantine add` or `w!quarantine` | Isolates a dangerous member from the rest of the server - effectively a holding area while they're under investigation. |
| Kick | `/kick` or `w!kick` | Removes a member from the server for being disruptive beyond a level the server can tolerate. |
| Ban | `/ban` or `w!ban` | Permanently removes someone from the server until the given duration passes (or forever, if permanent). Depending on severity, this can be either a last resort or a first resort. |
| Channel Lock | `/channel lock add` or `w!lock {channel}` | Locks a channel so nobody can speak in it - used when disruption from multiple members needs to be halted before it can be properly moderated. |
| Join Gate Lock | `/lock add joins` | Turns on the join gate, preventing new members from joining - used to stop more raiders getting in mid-raid. |
| Whois / Info User | `/info user` or `w!whois` | Looks up a user's permissions in the server and/or identifies them via Discord User ID - Wick will return an answer even if that user isn't in the server. |

### When to Warn

Warn a user if they've committed a very minor offense that doesn't need further escalation but still needs to be addressed. **Note:** people generally don't take warnings very seriously and may taunt a Moderator for issuing one - ignore the taunt rather than escalating further just to prove a point.

### When to Timeout

Timeout a user if they've committed a moderate offense that requires removing them from chat for a period, most commonly to cool off from a heated argument or to stop ongoing verbal harassment. **Note:** if verbal harassment continues past the first timeout, a kick is permitted.

### When to Quarantine

Quarantine a user if they've committed several rule violations and need to be kept away from the rest of the server while they're investigated. **Note:** users can evade quarantine by leaving and rejoining, so keep an eye on their status in the server for the duration of the investigation.

### When to Kick

Kick a user if they've been found guilty after investigation but the offense isn't severe enough for a ban. **Note:** a kicked user may simply rejoin and repeat the same behavior - if that happens, ban them.

### When to Ban

Ban a user if they've been found guilty of a major rule break, including but not limited to: a Discord Terms of Service breach, a Roblox Terms of Service breach (excluding chat bypass), NSFW content, or a compromised account. Also ban a user who has committed multiple escalated offenses that don't individually classify as major but stack up, or a user who was previously kicked, rejoined, and repeated the same offense.

### Punishment Escalation Ladder

`(M)` marks a mandatory action before the next step. `(x strikes)` marks how many times a user must receive that punishment before moving to the next step.

1. **Warning** - the first step to making someone aware of their incorrect actions. `(M)` `(2 strikes)`
2. **Timeout** - silencing them from chat to punish continued actions. `(3 strikes)`
3. **Kick** - removing them from the server to punish continued actions. `(M)` `(1 strike)`
4. **Ban** - for rejoining and repeating the same offense, or for committing a major offense outright. `(M)` `(1 strike)`
5. **Ban** - for committing many escalated offenses. `(M)` `(3 strikes)`
6. **Permanent Ban** - the user does not come back.

### Wick Permission Levels

- **Owner** - the highest management point in Wick's system; has control over all Wick operations and is bypassed by no one. (brooksy246 & coolbeanz02778)
- **Admin** - second-highest management; has near-full access over Wick's system and is bypassed only by Owner.
- **Head of Staff (HoS)** - has next to all permissions in the server and is bypassed only by Admin and Owner.
- **Mod** - moderation personnel; has access to all moderation commands and records.
- **Builder** - can use simple moderation commands if necessary.

### Logging

Upon issuing a moderation action, Wick's auto-logging system posts it into the server's **mod-logs** channel where it can be reviewed later. The Moderator is then required to file the moderation paperwork for that action by running `/modpwfill` and completing the required fields. This posts to a forum channel for easier review of records later on.

### Automod vs. Manual Actions

Automod filters out most rule-breaking activity automatically, but it won't catch everything. If Wick's automod has already handled something, leave it as is - don't touch it further. If a Moderator has to step in manually because automod missed something, that action is logged the same way as any other manual action, following the Logging process above.

### Appeals

When mod mail approves an appeal, the acting Moderator manually reverses the relevant action in Wick (e.g. unmute, unban) - there is no automatic reversal.

### Raid Protection

Wick's antiraid, antinuke, and join-gate systems are configured to remove most raiders and nukers before they can inflict serious harm. During a raid, a Moderator's job is to lock all social channels and ban any members who make it through despite Wick's protections due to ratelimiting.

---

## Section 4 - Onboarding (Trainee Drill Process)

BSCH onboarding follows an **apply -> train -> drill -> promote** pipeline, inspired by Fuel Rats-style verified-rescuer training mixed with BSCH's own approach. A new staff hire does not receive full Builder or Moderator permissions immediately after their application is accepted - they enter as a **Trainee** and must pass a simulated scenario, called a **drill**, before being promoted to their target department role.

### Application Intake

Applications are handled entirely in-Discord, not through an external form. A member picks Builder, Mod, or Both, and is sent to a private application channel, created by the bot. This channel is private and can be seen by Heads of Staff and above. Inside that channel, the bot asks questions one at a time, waiting for the applicant's answer before sending the next.

**General questions (asked of every applicant):**

- Discord Username and ID
- Timezone
- Roughly when are you usually online? (If you are in school or work, please consider that in your answer.)
- Why are you considering joining us?
- Have you had staff experience anywhere else? Please explain.
- Are you interested in joining the Building or Moderation divisions? (Moderation / Building / Both - this answer determines which set of questions below the bot asks next; if Both is selected, the bot asks all Building questions followed by all Moderation questions.)

**Building questions (asked if Building or Both selected):**

- Do you have prior server-building experience, especially SCP RP? If yes, provide server link(s) or image link(s) as examples.
- A client tells you "make it feel scary but professional" and nothing else. What do you ask them before building anything?
- Are you comfortable being given temporary admin access in a stranger's server and working live inside it?
- Explain the difference between advanced permissions and basic permissions when doing perms for a channel or category.
- A client keeps changing their mind during a build. How do you handle this?

**Moderation questions (asked if Moderation or Both selected):**

- Describe a real (or realistic) situation where two members are arguing and it's escalating. What do you actually do, step by step?
- How do you personally decide warning vs. immediate mute/kick?
- Are you comfortable enforcing rules on people you're friendly with?
- Have you ever had to de-escalate a situation where you were personally frustrated? How'd you handle it?
- What would you do if you disagreed with another Mod's punishment call in front of the member being punished?

Once the applicant has answered the last question, the bot immediately deletes the application channel and posts the full set of questions and answers to the **application-approval** forum channel for Senior Staff review. Senior Staff approve or deny directly from that forum post.

- **Approve** - the bot assigns the applicant the Trainee role. From here they proceed into the drill process below.
- **Deny** - a 2-week cooldown applies before that member may apply again.

After approving, the trainee is to be handed the link to this document. This document is their handbook to passing the drill.

### Roles Involved in a Drill

- **Trainee** - the applicant, holding the Trainee role, working toward promotion into either the Moderation or Building department.
- **Head** - a Head Staff member who runs and evaluates the drill. Whichever Head runs `/drillstart` is automatically the evaluator for that session; there is no separate evaluator parameter.
- **Client** - an existing staff member role-playing the client side of the simulated scenario, so the scenario feels like a real case rather than a scripted quiz.
- **Helpers** - additional existing staff assisting the Head in running the scenario.

### Requesting a Drill

A Trainee who is ready runs `/drillrequest [trainee]`, which pings all Heads to ask whether one is available to run a drill.

### Running the Drill

A Head who picks up the request runs `/drillstart [department] [trainee] [client] [helpers]`. Department is either Builder or Moderation, and determines which scenario the Trainee is drilled on: a Builder Trainee is walked through a simulated Hiring SOP case, a Moderation Trainee through a simulated moderation scenario. This creates a dedicated ticket named `[team]-drill-[traineeuser]` (e.g. `mod-drill-coolbeanz` or `builder-drill-coolbeanz`), visually distinct from a real hire ticket so it's never confused with an actual case, and keeps simulated activity fully separate from real case data.

The scenario then plays out inside that ticket exactly as a real case or moderation situation would, with the named Client acting their part and Helpers assisting as needed, while the Head evaluates the Trainee's handling of it in real time.

### Ending the Drill

When the scenario concludes, the Head runs `/drillend [result] [reason]`. Result is a strict **Pass** or **Fail**, there is no partial or "needs practice" state. The outcome and reason are posted to the **drill-results** channel for the record.

- **Pass** - the bot automatically adds the appropriate full role (Builder or Moderator) to the Trainee. No manual role assignment is required.
- **Fail** - the reason is logged, and a one-week cooldown applies before that Trainee may run `/drillrequest` again.

### Command Reference - Onboarding

| Command | Run by | Effect |
| --- | --- | --- |
| Apply (Builder/Mod/Both) | Any member | Sends applicant to a private application channel; bot asks intake questions in sequence, then deletes the channel and posts the Q&A to application-approval for Senior Staff review. |
| `/drillrequest [trainee]` | Trainee | Pings all Heads requesting a drill session. |
| `/drillstart [department] [trainee] [client] [helpers]` | Head | Creates a `[team]-drill-[traineeuser]` ticket and begins the simulated scenario. The running Head is the evaluator. |
| `/drillend [result] [reason]` | Head | Closes the drill with a Pass/Fail result and reason, posted to drill-results. Pass auto-promotes; Fail applies a 1-week cooldown. |

---

## Section 5 - Staff Expectations & Conduct

Being on BSCH staff, in either department, means representing BSCH directly to real clients and real members. The following applies to every rank from Trainee upward.

### Activity & Response

Staff are expected to check their claimed cases and open tickets regularly enough that the 24h/48h claim timers and client-facing pings never lapse due to staff inactivity rather than genuine unavailability. If a staff member knows they'll be unreachable for an extended period, they should say so in staff-chat or mod-chat rather than leaving cases to time out silently. Going quiet on an active case you've claimed is the staff-side equivalent of the "builder no-show" exception in Section 1 - handled the same way, by removal from the roster, but repeated no-shows are a conduct issue, not just a scheduling one.

### Professionalism in Client Servers

Once admin access is granted (Section 1, Step 5), a Builder is operating inside someone else's server with real permissions. Builders must:

- Stay within the scope defined by the case's intake info and Extra Info fields - anything outside that scope goes back to the client for confirmation before being built.
- Never use granted access for anything unrelated to the build (no browsing unrelated channels, no acting on the client's server outside the agreed work).
- Treat the client the way the Hiring Agreement represents BSCH as treating them - professionally, and without pressuring them toward a donation or rating.

### Conflict of Interest

A staff member should not claim or lead a case for a client they have an undisclosed personal relationship with. If a familiar client opens a ticket, the staff member should disclose that in the ticket before claiming, and let another Builder claim it if it would be a conflict.

### Consequences

Expectation violations are tracked the same way infractions are tracked elsewhere in the server (see the **infractions** channel under Staff | Info). Repeated or serious violations are escalated to Head Staff and can result in rank changes, up to and including removal from staff, following whatever process is defined for rank-change decisions.

---

## Section 6 - Contacts and Help

> **Note:** this section is drafted from context established elsewhere in this document. The specific named Head Staff roster still needs to be filled in - everything else here is a reasonable structure based on the role hierarchy already defined.

### Who To Contact

| Situation | Contact |
| --- | --- |
| Question about a specific hiring case | The case's Lead, or any Builder on the roster |
| Question about a support ticket | Whoever is currently handling that ticket |
| Dispute between Lead and a helper Builder that can't be resolved between them | Senior Staff |
| Stuck/unclaimed case needing an override | Senior Staff |
| Report on a member or another staff member | Mod mail (routed to Head Staff for staff reports) |
| Appeal of a moderation action | Mod mail |
| Bot malfunction (commands broken, embeds not updating) | Bug Report support ticket, or private-mod-bot-commands / private-admin-bot-commands for urgent cases |
| Bot or hosting completely down | Whoever administers the Raspberry Pi hosting the bot - currently the Owner |
| General staff question not covered above | staff-chat, or ask a Head Staff member directly |

### Emergency Path - Bot or Hosting Down Mid-Case

If the bot goes offline while cases are active (e.g. the server loses power or the bot process crashes), no case data should be lost, since the case record lives in the case's forum post in **hire-bsch-case-logs**, not only in bot memory. Staff should continue any in-progress conversation manually in the affected ticket and log manually what would normally be bot-logged, then run the corresponding command to catch the bot's record up once it's back online. Whoever administers hosting should be notified immediately via staff-chat or a direct ping.

### Definition - "Senior Staff"

Section 1 (Hiring SOP) references Senior Staff for dispute arbitration and claim overrides. Senior Staff is defined as **Head Staff and above**: Head Staff, Admin, Co-Owner, and Owner. This is the rank cutoff the bot should use for any permission checks tied to Senior Staff actions.

---

## Section 7 - Glossary / Reference

- **Case** - the full record of one client's hire request, from ticket open to close, identified by a ticketId.
- **ticketId** - a unique identifier generated the instant a hire ticket opens; every case-related command and log entry is tied to it.
- **hire-bsch-case-logs** (also called **hire-bsch-files**) - the forum channel where every hire case gets its own forum post acting as that case's permanent, structured record.
- **Lead** - the Builder who claimed a case; the primary point of contact and decision-maker for that case (e.g. runs `/contract`, `/buildfinished`, `/copyphasedone`).
- **Roster** - the list of Builders working a case (Lead plus any self-added helpers), used for tracking who worked on what and for future quota tracking.
- **Extra Info** - a numbered field on a case record capturing a specific client requirement, logged via `/extrainfo` as it comes up in conversation.
- **Template bank** - BSCH's internal database of past builds that can be reused for future clients, only added to with both Lead and client consent.
- **Senior Staff** - Head Staff and above (Head Staff, Admin, Co-Owner, Owner). Authorized to override claims, arbitrate disputes, and force-reassign stuck cases.
- **Trainee** - a staff applicant who has been accepted but has not yet passed their drill; holds limited permissions until promoted.
- **Drill** - a simulated scenario used to evaluate a Trainee before promoting them to full Builder or Moderator.
- **Head** - a Head Staff member, the rank responsible for running and evaluating drills.
- **Department** - either Builder or Moderation; determines which drill scenario a Trainee is tested on.
- **Wick** - the third-party moderation bot used for all moderation actions (warns, mutes, kicks, bans, raid protection); not the custom BSCH bot.
- **application-approval** - the forum channel where finished applications are posted for Senior Staff to approve or deny.
- **drill-results** - the channel where every drill's Pass/Fail outcome and reason is posted.
- **!buildlogs @client** - command that pulls a client's full case history from hire-bsch-case-logs.
- **Mod mail** - the bot-based reporting/appeals system, separate from tickets, used for reporting members, reporting staff (to Head Staff), and appealing moderation actions.

---

## Ending

This document is BSCH's Staff Standard Operating Procedures, version 4 of the client hiring flow specifically, with Support, Moderation, Onboarding, Expectations, and Contacts and Help all written out alongside it.

This is a living document. As BSCH's process changes, this file should change with it - a stale SOP is worse than none, since staff will trust it by default. Anyone on staff who spots something here that no longer matches reality should raise it in staff-chat rather than quietly working around it.

Feedback on this document itself, unclear wording, missing edge cases, anything that reads correct but doesn't match how BSCH actually operates, should go to whoever maintains it (currently the Owner) rather than being worked around silently.

Thanks,

**coolbeanz02778, Owner**

*Brooksy, CoOwner*
