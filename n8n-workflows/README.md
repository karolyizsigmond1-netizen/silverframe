# Silverframe n8n Workflows — Setup Guide

## Overview

| File | Workflow | Purpose |
|------|----------|---------|
| `5-chat-handler.json` | Silverframe Chat Handler | AI chatbot — answers questions, books via conversation |
| `6-booking-proposal.json` | Silverframe Booking Proposal | Receives bookings, creates tentative calendar event, emails photographer |
| `7-approval-actions.json` | Silverframe Approval Actions | Handles the 5 action buttons in the approval email |
| `8-inbox-watcher.json` | Silverframe Inbox Watcher | Polls inbox, detects booking requests, sends 2h digest |

---

## Import Order

Import in this order (later workflows reference earlier ones):
1. `6-booking-proposal.json`
2. `7-approval-actions.json`
3. `5-chat-handler.json`
4. `8-inbox-watcher.json`

After importing each, **activate it** before importing the next.

---

## Required Credentials

Create these in n8n → Settings → Credentials **before** importing:

| Credential Name (use exactly) | Type | Notes |
|-------------------------------|------|-------|
| `Silverframe Gmail` | Gmail OAuth2 | Photographer's info@silverframe.hu account |
| `Silverframe Google Calendar` | Google Calendar OAuth2 | Same Google account |
| `Silverframe Gemini` | Google PaLM API | Gemini API key from Google AI Studio |
| `Silverframe IMAP` | IMAP | info@silverframe.hu inbox, imap.gmail.com:993 |
| `Silverframe SMTP` | SMTP | smtp.gmail.com:465, or use Gmail node instead |

---

## Configuration After Import

### 1. HMAC Secret (IMPORTANT — Security)
In workflows `6-booking-proposal` and `7-approval-actions`, find the Code node named  
**"Generate Booking ID & Token"** and **"Validate Token"**.  
Change this line:
```js
const HMAC_SECRET = 'CHANGE_THIS_TO_YOUR_SECRET_KEY_MIN_32_CHARS';
```
Use the **same secret** in both workflows.

### 2. Photographer Email
Search all Code nodes for `info@silverframe.hu` — this is already set correctly.

### 3. Google Calendar ID
In workflow 6, find the Google Calendar node. Set the Calendar ID to the photographer's calendar  
(usually `primary` or the specific calendar email).

### 4. Gemini Model
In all AI nodes, the model is set to `gemini-2.0-flash`. Change to `gemini-1.5-pro` if you need  
longer/better responses (slower, costs more).

---

## How It Works

### Booking from Website
```
Website form → POST /webhook/book
  → Workflow 6: Create tentative calendar event
  → Gemini drafts client email
  → Approval email sent to photographer with 5 buttons
  → Client sees "Request sent" confirmation
```

### Booking from Chatbot
```
Chat message → POST /webhook/silverframe-chat
  → AI Agent (Workflow 5): Converses, collects booking details
  → When ready: calls POST /webhook/book internally
  → Same flow as website booking
```

### Approval Actions
Photographer clicks a button in the email:

| Button | What happens |
|--------|-------------|
| ✅ Jóváhagyás | Calendar event confirmed → Client gets confirmation email |
| ✏️ Szöveg szerkesztése | Browser opens edit form → Submit sends approval email again |
| 🔄 Újragenerálás | Browser opens instruction form → Gemini rewrites → New approval email |
| 📅 Elutasít + Új időpont | Calendar event deleted → Gemini proposes 2 new slots → New approval email |
| ❌ Teljes elutasítás | Calendar event deleted → Client gets polite rejection email |

### Inbox Watcher
```
IMAP Trigger (new email arrives)
  → Gemini: Is this a booking request?
  → If yes: Extract details + check calendar → Trigger Workflow 6
  → If no: ignored (handled by digest only)

Schedule (every 2 hours)
  → Fetch last 2h emails
  → Gemini summarizes them
  → Send digest to info@silverframe.hu
```

---

## Webhook URLs (already configured in website)

| Path | Workflow | Used by |
|------|----------|---------|
| `POST /webhook/silverframe-chat` | 5 | Chatbot on website |
| `POST /webhook/book` | 6 | Booking form, chatbot tool |
| `GET /webhook/action` | 7 | Approval email buttons |
| `POST /webhook/action-submit` | 7 | Edit/Regen form submissions |

---

## Testing

1. **Test booking flow**: Submit the booking form on the website → check photographer email
2. **Test approval**: Click "Jóváhagyás" in the approval email → check calendar + client email
3. **Test edit**: Click "Szöveg szerkesztése" → browser should show edit form
4. **Test chatbot**: Open chat, say "Fotózást szeretnék foglalni" → agent should ask for details
5. **Test inbox**: Send an email to info@silverframe.hu with a booking request → check if approval email arrives
