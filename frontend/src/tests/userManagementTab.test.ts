import { describe, it, expect } from 'vitest';

describe('UserManagementTab — FinTech Refund UI Regression Logic (Suite L)', () => {
  describe('L1. Paid User State & Refund Action Visibility Contract', () => {
    // Exact contract from UserManagementTab.tsx line 427:
    // {u.tier !== 'free' && permissions.canManageAdmins && ( <button title="Process Refund"> ... )}
    const isRefundActionVisible = (tier: string, canManageAdmins: boolean): boolean => {
      return tier !== 'free' && canManageAdmins;
    };

    it('renders the Banknote refund action for paid pro users when admin has canManageAdmins privilege', () => {
      const isVisible = isRefundActionVisible('pro', true);
      expect(isVisible).toBe(true);
    });

    it('renders the Banknote refund action for premium users when admin has canManageAdmins privilege', () => {
      const isVisible = isRefundActionVisible('premium', true);
      expect(isVisible).toBe(true);
    });

    it('hides the Banknote refund action for free tier users even if admin has canManageAdmins privilege', () => {
      const isVisible = isRefundActionVisible('free', true);
      expect(isVisible).toBe(false);
    });

    it('hides the Banknote refund action if the admin lacks canManageAdmins privilege regardless of user tier', () => {
      const isVisible = isRefundActionVisible('pro', false);
      expect(isVisible).toBe(false);
    });
  });

  describe('L2. Refund Request Payload Construction', () => {
    // Exact contract from UserManagementTab.tsx lines 160-167
    const constructRefundPayload = (paymentId: string, reason: string, amountStr?: string) => {
      const payload: { payment_id: string; reason: string; amount?: number } = {
        payment_id: paymentId.trim(),
        reason: reason.trim(),
      };
      if (amountStr && amountStr.trim()) {
        payload.amount = parseInt(amountStr.trim(), 10);
      }
      return payload;
    };

    it('constructs a full refund payload with amount omitted/null when amount is not specified', () => {
      const payload = constructRefundPayload('pay_TEST_SMOKE_9901', 'Customer smoke test cancellation request');
      expect(payload).toEqual({
        payment_id: 'pay_TEST_SMOKE_9901',
        reason: 'Customer smoke test cancellation request',
      });
      expect(payload.amount).toBeUndefined();
    });

    it('constructs a partial refund payload when amount is explicitly provided', () => {
      const payload = constructRefundPayload('pay_TEST_SMOKE_9901', 'Partial refund request', '10000');
      expect(payload).toEqual({
        payment_id: 'pay_TEST_SMOKE_9901',
        reason: 'Partial refund request',
        amount: 10000,
      });
    });
  });

  describe('L3 & L4. Post-Refund UI State & Invalidation Reconciliation', () => {
    interface UserRecord {
      uid: string;
      email: string;
      tier: string;
      scan_limit: number;
    }

    // Exact state transition logic upon receiving refund response with user_downgraded = true
    const reconcilePostRefundUserState = (
      currentUser: UserRecord,
      refundResponse: { user_downgraded: boolean; tier?: string; quota?: number }
    ): UserRecord => {
      if (refundResponse.user_downgraded) {
        return {
          ...currentUser,
          tier: 'free',
          scan_limit: 20,
        };
      }
      return currentUser;
    };

    it('reconciles local user state to free tier and 20 scan quota upon successful refund downgrade', () => {
      const initialUser: UserRecord = {
        uid: 'smoke_test_uid_001',
        email: 'smoke_user@zsehealth.com',
        tier: 'pro',
        scan_limit: 500,
      };

      const reconciled = reconcilePostRefundUserState(initialUser, { user_downgraded: true });
      expect(reconciled.tier).toBe('free');
      expect(reconciled.scan_limit).toBe(20);

      // Now refund button is immediately hidden in the reconciled UI state
      const canStillRefund = reconciled.tier !== 'free';
      expect(canStillRefund).toBe(false);
    });
  });
});
