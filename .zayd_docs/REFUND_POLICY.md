# Refund & Cancellation Policy — Z-SeHealth

**Document Title:** Refund & Cancellation Policy
**Version:** 1.0
**Effective Date:** Effective upon publication
**Last Updated:** September 2026
**Owner / Contact:** Z-SeHealth Development & Compliance Team — support.zsehealth@gmail.com
**Scope:** All users who purchase paid subscription plans on Z-SeHealth at https://z-sehealth.vercel.app.

---

## 1. Plan Overview

Z-SeHealth offers a free tier and three paid monthly subscription plans:

| Plan | Price | Scans/Month | Billing Cycle |
|---|---|---|---|
| **Z-Free** | ₹0 | 20 | N/A (Free) |
| **Z-Starter** | ₹366/month | 80 | Monthly (12-month subscription period) |
| **Z-Pro** | ₹732/month | 200 | Monthly (12-month subscription period) |
| **Z-Elite** | ₹998/month | 500 | Monthly (12-month subscription period) |

All prices are in Indian Rupees (INR). GST may apply as per applicable law.

All paid plans are recurring monthly subscriptions processed through Razorpay, with a total subscription period of up to 12 billing cycles.

---

## 2. Digital Service Nature

Z-SeHealth is a digital service. Each food label scan consumes computational resources, including:

- Image upload and preprocessing
- AI/OCR processing by one or more third-party vision models (Sarvam AI, NVIDIA NIM, Google Gemini)
- Backend safety scoring and allergen flagging
- Database operations

Once a scan has been processed and results delivered, the computational resources consumed cannot be recovered. This is relevant to the refund eligibility criteria described below.

---

## 3. Refund Eligibility

### 3.1 Situations Where Refunds Are Available

Z-SeHealth will process refunds in the following circumstances:

| Situation | Refund Basis |
|---|---|
| **Duplicate charge** | Full refund of the duplicate amount |
| **Unauthorised or erroneous charge** | Full refund upon verification |
| **Payment succeeded but entitlement not credited** | Full refund or manual entitlement crediting, at Z-SeHealth's discretion |
| **Webhook processing failure** | Full refund or manual entitlement crediting if the payment was received but the subscription was not activated due to a technical failure on Z-SeHealth's side |
| **Technical failure attributable to Z-SeHealth** | Proportional or full refund, assessed on a case-by-case basis |
| **Accidental duplicate subscription** | Refund of the second subscription if no scans were consumed under it |

### 3.2 Situations Where Refunds May Be Limited

| Situation | Treatment |
|---|---|
| **Partially consumed scan quota** | See Section 4 below |
| **Dissatisfaction with AI accuracy** | Not automatically eligible for refund; the Terms of Service and Medical Disclaimer explain the inherent limitations of AI analysis. However, genuine service failures will be reviewed on a case-by-case basis |
| **Change of mind after subscription activation** | See Section 4 below |

### 3.3 Situations Not Eligible for Refund

| Situation | Reason |
|---|---|
| **Fully consumed scan quota** | All purchased scans have been used and the service has been delivered |
| **Account suspended or terminated for Terms of Service violation** | Refunds are not available for accounts suspended due to abuse, fraud, or violation of the Acceptable Use policy |
| **Fraudulent refund request** | Subject to account suspension; see Section 12 |

---

## 4. Unconsumed Quota Refunds

If you have purchased a paid plan and wish to request a refund for unconsumed scans:

- **Within 48 hours of subscription activation:** If no scans have been consumed on the paid plan, you may request a full refund. This is a Z-SeHealth commercial policy, not a statutory or RBI-mandated requirement.
- **After 48 hours but before the end of the billing cycle:** Refund requests will be assessed on a case-by-case basis. Partial refunds may be issued proportional to the unused scan quota, at Z-SeHealth's discretion.

To request a refund, contact support.zsehealth@gmail.com with:

- Your registered email address
- Razorpay payment or subscription ID (if available)
- Reason for the refund request
- Number of scans consumed

---

## 5. Completed Scans

Scans that have been successfully processed and for which results have been delivered are considered consumed. Consumed scans are generally not refundable, as the computational resources required to process them have been expended.

However, if a scan produced no usable results due to a verified technical failure on Z-SeHealth's side (e.g., complete AI pipeline failure resulting in no analysis output), that scan may be excluded from the consumed count for refund calculation purposes, upon review.

---

## 6. Cancellation

### 6.1 How to Cancel

You may cancel your subscription at any time through one of the following methods:

1. **Via the Application:** Navigate to your Profile/Subscription settings and select "Cancel Subscription." This triggers a cancellation request to Razorpay with `cancel_at_cycle_end: true`.
2. **Via email:** Send a cancellation request to support.zsehealth@gmail.com from your registered email address.

### 6.2 Effect of Cancellation

Upon cancellation:

- **Your premium access continues** until the end of the current billing period
- **No further charges** will be made after the cancellation takes effect
- **Your tier reverts to Z-Free** (20 scans/month) after the billing period ends
- **Unused scans from the current billing period** do not carry over to the free tier

### 6.3 Cancellation Confirmation

You will receive confirmation of your cancellation via the Application interface. The subscription status will be updated to "cancellation_requested" and subsequently to "cancelled" upon the Razorpay webhook confirmation.

---

## 7. Failed Payments

If a monthly subscription renewal payment fails:

- Razorpay will attempt to process the payment according to its retry schedule
- If the payment ultimately fails, the `subscription.charged.failed` webhook event will trigger an automatic downgrade to the free tier (20 scans/month)
- Z-SeHealth will not charge penalty fees for failed payments
- You may re-subscribe at any time by selecting a new plan from the Pricing page

---

## 8. Webhook Processing Delays

Z-SeHealth's subscription activation and renewal rely on Razorpay webhook events. In rare cases:

- Webhook delivery may be delayed due to network issues, server unavailability, or Razorpay infrastructure delays
- During a webhook delay, your subscription status may temporarily appear as "pending" even though payment has been successfully processed by Razorpay

If your payment was successful but your subscription has not been activated within a reasonable time (typically within a few minutes, but potentially longer in exceptional circumstances), please contact support.zsehealth@gmail.com with your Razorpay payment ID. We will manually verify and credit your entitlement.

---

## 9. Refund Method

Approved refunds will be processed through Razorpay and will normally be returned to the original payment method used for the transaction (e.g., the same bank account, UPI ID, card, or wallet from which the payment was made), subject to Razorpay's refund processing capabilities and any limitations of the payment network.

Z-SeHealth does not process refunds in cash, cryptocurrency, or through payment methods other than the original payment instrument, unless technically required by the payment network.

---

## 10. Processing Timeline

Refund processing involves multiple parties, each with its own processing timeline:

| Stage | Estimated Timeline |
|---|---|
| **Z-SeHealth internal review and approval** | Within 5 business days of receiving a valid refund request with complete information |
| **Razorpay refund processing** | Subject to Razorpay's standard processing timeline for the relevant payment method |
| **Bank / payment network credit** | Subject to the user's bank or payment provider's processing timeline (this may range from a few days to several weeks depending on the payment method and bank) |

**Important:** The total time from refund request to credit in your account depends on all three stages. Z-SeHealth controls only the first stage. The timelines for Razorpay processing and bank crediting are determined by those respective entities and are outside Z-SeHealth's control.

These timelines are estimates, not guarantees. They are Z-SeHealth's commercial processing targets and are not mandated by any specific RBI regulation for this type of transaction.

---

## 11. Chargebacks and Payment Disputes

If you believe a charge is incorrect or unauthorised, we encourage you to contact Z-SeHealth first at support.zsehealth@gmail.com so that we can attempt to resolve the issue directly.

However, **you are not legally required to contact Z-SeHealth before exercising any dispute rights available to you through your payment provider, card network (e.g., Visa/Mastercard dispute processes), or bank.** Your statutory and contractual rights under applicable law, RBI circulars, and payment network rules are preserved.

If a chargeback or dispute is initiated:

- Z-SeHealth will cooperate with Razorpay in the dispute resolution process
- Z-SeHealth will provide relevant transaction records and evidence as requested
- If the chargeback is resolved in your favour, the refund will be processed through the dispute mechanism
- If a chargeback is found to be fraudulent, Z-SeHealth reserves the right to suspend the associated account

---

## 12. Fraud and Abuse

Z-SeHealth reserves the right to deny refund requests and suspend accounts in cases of:

- Repeated refund requests with fully consumed scan quotas
- Pattern of subscribing, consuming scans, and immediately requesting refunds
- Use of stolen or unauthorised payment instruments
- Initiating fraudulent chargebacks
- Any other conduct that constitutes payment fraud or abuse

---

## 13. Contact

For refund requests, cancellation assistance, or payment-related queries:

**Z-SeHealth Development & Compliance Team**
Email: support.zsehealth@gmail.com
Secondary contact: farhanahmad2106@gmail.com

Please include your registered email address and Razorpay payment/subscription ID (if available) in all payment-related communications.

---

*This Refund & Cancellation Policy was drafted as part of the Z-SeHealth compliance framework. It does not constitute legal advice. Independent legal review is recommended before deployment.*
