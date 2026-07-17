# WATI WhatsApp Webhooks — Integration Specification

This document details the integration specification for WATI (WhatsApp Business Solution Provider) webhooks, based on the official WATI API developer portal.

---

## 1. Webhook Endpoint Configuration

Webhooks are configured inside the WATI dashboard:
1. Log in to your **WATI Dashboard**.
2. Navigate to **Connectors** (or select **More > Webhooks** in the top navigation).
3. Click **Add Webhook**.
4. Enter your callback URL (e.g. `https://engageos.com/api/webhooks/wati`). Note that the endpoint must be exposed over **HTTPS** in production.
5. Set the webhook status to **Enabled**.
6. Check the boxes next to the events you want to subscribe to.
7. Click **Save**. You can trigger a test event using the **Trigger sample callback** button.

---

## 2. Supported Webhook Events

WATI supports the following core events through its webhook callback system:

| Event Type | Trigger Condition |
| :--- | :--- |
| `messageReceived` | Customer sends an incoming message to your WhatsApp number. |
| `sentMessage` | An outbound message is sent from WATI (Session or Template). |
| `sentMessageSENT` | Meta successfully accepts the message and registers the "Sent" status. |
| `sentMessageDELIVERED` | The message is successfully delivered to the customer's device. |
| `sentMessageREAD` | The customer opens and reads the message. |
| `templateMessageFailed` | The template message fails to deliver (e.g., undeliverable, invalid number, blocked). |
| `templateStatusUpdated` | Meta changes the approval status of an authored template (e.g., APPROVED, REJECTED). |

---

## 3. Payload Schemas

### A. Message Received (`messageReceived`)
Sent when a customer sends a message to your WhatsApp number.

```json
{
  "eventType": "messageReceived",
  "statusString": "Received",
  "localMessageId": "fd29c1f-9033-59b2-7d72-5ac964c4c8a7",
  "whatsappMessageId": "wamid.HBgMOAE4NjY4NDkzNjAxFAIAERgSOTEENzFCNjEwMkNDNENGQUJGAA==",
  "text": "Hello, I want to redeem my coupon!",
  "timestamp": "1665645642",
  "phone": "918848772371",
  "senderName": "Goutham P",
  "watiConversationId": "6c4e2c9ac95dfc3838bb85e1",
  "operatorEmail": null
}
```

### B. Message Status Update (`sentMessageDELIVERED` / `sentMessageREAD`)
Sent when the status of an outbound message changes to delivered or read.

```json
{
  "eventType": "sentMessageDELIVERED",
  "statusString": "Delivered",
  "localMessageId": "coupon_delivery_ONAM-WIN-777",
  "whatsappMessageId": "wamid.HBgLOTE4ODQ4NzcyMzcxFQIAERgSRDFGNjFDQ0NBRUJENTg0MzkzAA==",
  "text": "🎉 Congratulations Goutham P! You won 10% OFF Special Gift.",
  "timestamp": "1665645680",
  "phone": "918848772371",
  "senderName": "Goutham P",
  "watiConversationId": "6c4e2c9ac95dfc3838bb85e1",
  "operatorEmail": "system@engageos.com"
}
```

### C. Message Delivery Failure (`templateMessageFailed`)
Sent when a template message fails to deliver.

```json
{
  "eventType": "templateMessageFailed",
  "statusString": "Failed",
  "localMessageId": "coupon_delivery_ONAM-WIN-777",
  "whatsappMessageId": "wamid.HBgLOTE4ODQ4NzcyMzcxFQIAERgSRDFGNjFDQ0NBRUJENTg0MzkzAA==",
  "failedCode": "131026",
  "failedDetail": "Message undeliverable - Recipient phone number is not registered on WhatsApp.",
  "timestamp": "1665645695",
  "phone": "918848772371",
  "senderName": "Goutham P",
  "watiConversationId": "6c4e2c9ac95dfc3838bb85e1"
}
```

---

## 4. Security & Authentication

*   **No Native Signatures**: Unlike Meta Cloud API, WATI does **not** natively hash or sign its webhook payloads using an HMAC signature header (like `X-Hub-Signature-256`).
*   **Authentication Recommendations**:
    1.  **Secret Token in URL**: Secure your endpoint by appending a unique, random token as a query parameter when registering the callback URL in WATI:
        *   `https://engageos.com/api/webhooks/wati?secret=your_secure_random_token`
        *   Your endpoint must parse and validate this query parameter before processing the payload.
    2.  **Basic Authentication**: You can include credentials directly in the URL endpoint:
        *   `https://username:password@engageos.com/api/webhooks/wati`

---

## 5. Retry Policy

*   **HTTP 200 OK Requirement**: WATI expects your webhook server to respond with a `200` HTTP status code within a reasonable timeout.
*   **Retry Interval**: If your server returns a non-200 code or fails to respond, WATI will automatically retry the event delivery:
    *   **Up to 144 retry attempts**
    *   **At 10-minute intervals**
    *   This provides exactly **24 hours** of delivery persistence for each webhook event.

---

## 6. Idempotency Recommendations

Due to WATI's retry policy, the same webhook event may be delivered multiple times. To maintain database integrity:
1.  **Event Deduplication**: Log the `whatsappMessageId` (or `localMessageId` where applicable) along with the `eventType` and `timestamp` inside a deduplication ledger (e.g. `wati_webhook_deliveries`).
2.  **State Transition Guards**: Ensure status updates cannot regress the message status (e.g., do not overwrite `Read` status back to `Delivered` if an older delivery status report is re-delivered out of order).
