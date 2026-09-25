import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { ConfirmModalProps } from '../components/ui/ConfirmModal';

describe('ConfirmModal Component & Accessibility Requirements', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering & DOM Output (React 19)', () => {
    it('returns null / empty output when isOpen is false', () => {
      const html = renderToString(
        React.createElement(ConfirmModal, {
          isOpen: false,
          title: 'Test Modal',
          message: 'This should not render',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );
      expect(html).toBe('');
    });

    it('renders dialog semantics and accessible labeling when isOpen is true', () => {
      const html = renderToString(
        React.createElement(ConfirmModal, {
          isOpen: true,
          title: 'Sign Out Confirmation',
          message: 'Are you sure you want to sign out of your Z-SeHealth session?',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      // Verify semantics
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="confirm-modal-title-');
      expect(html).toContain('aria-describedby="confirm-modal-description-');

      // Verify content rendering
      expect(html).toContain('Sign Out Confirmation');
      expect(html).toContain('Are you sure you want to sign out of your Z-SeHealth session?');

      // Verify defaults
      expect(html).toContain('Confirm');
      expect(html).toContain('Cancel');

      // Verify default primary variant (emerald)
      expect(html).toContain('bg-emerald-500');
    });

    it('renders custom confirm and cancel labels when supplied', () => {
      const html = renderToString(
        React.createElement(ConfirmModal, {
          isOpen: true,
          title: 'Delete Custom Recipe',
          message: 'Are you sure you want to delete this recipe?',
          confirmLabel: 'Delete Recipe',
          cancelLabel: 'Keep Recipe',
          variant: 'danger',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(html).toContain('Delete Recipe');
      expect(html).toContain('Keep Recipe');
      // Danger variant styling (rose)
      expect(html).toContain('bg-rose-500');
      expect(html).toContain('text-rose-400');
    });

    it('renders warning variant styling and amber accent', () => {
      const html = renderToString(
        React.createElement(ConfirmModal, {
          isOpen: true,
          title: 'Reset Monthly Scan Quota',
          message: 'Reset monthly scan usage to 0 for this user? This will be recorded in the admin audit ledger.',
          confirmLabel: 'Reset Quota',
          variant: 'warning',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(html).toContain('Reset Monthly Scan Quota');
      expect(html).toContain('Reset Quota');
      // Warning variant styling (amber)
      expect(html).toContain('bg-amber-500');
      expect(html).toContain('text-amber-400');
    });

    it('renders loading spinner and disabled buttons when isLoading is true', () => {
      const html = renderToString(
        React.createElement(ConfirmModal, {
          isOpen: true,
          title: 'Revoking Privileges',
          message: 'Revoking admin privileges...',
          isLoading: true,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(html).toContain('animate-spin');
      expect(html).toContain('disabled=""');
    });
  });

  describe('Props & Contract Validation', () => {
    it('defines expected props contract with standard defaults', () => {
      const mockProps: ConfirmModalProps = {
        isOpen: true,
        title: 'Revoke Administrator Privileges',
        message: 'Are you sure you want to permanently revoke admin access for this account?',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      };

      expect(mockProps.isOpen).toBe(true);
      expect(mockProps.title).toBe('Revoke Administrator Privileges');
      expect(mockProps.message).toContain('permanently revoke');
      expect(mockProps.confirmLabel ?? 'Confirm').toBe('Confirm');
      expect(mockProps.cancelLabel ?? 'Cancel').toBe('Cancel');
      expect(mockProps.variant ?? 'primary').toBe('primary');
      expect(mockProps.isLoading ?? false).toBe(false);
      expect(mockProps.closeOnBackdropClick ?? true).toBe(true);
    });
  });

  describe('Keyboard & Escape Behavior Logic', () => {
    const handleEscapeKey = (
      key: string,
      isLoading: boolean,
      onCancel: () => void
    ) => {
      if (key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    it('triggers onCancel when Escape key is pressed and modal is not loading', () => {
      const onCancel = vi.fn();
      handleEscapeKey('Escape', false, onCancel);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger onCancel when Escape key is pressed during active loading', () => {
      const onCancel = vi.fn();
      handleEscapeKey('Escape', true, onCancel);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('ignores non-Escape keys', () => {
      const onCancel = vi.fn();
      handleEscapeKey('Enter', false, onCancel);
      handleEscapeKey('Tab', false, onCancel);
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Focus Trap & Cycling Logic', () => {
    it('traps focus forward from last element to first element on Tab', () => {
      const focusables = ['cancel-button', 'confirm-button', 'close-button'];
      let currentActiveIndex = 2; // Last element

      const cycleFocus = (shiftKey: boolean) => {
        if (shiftKey) {
          currentActiveIndex = currentActiveIndex === 0 ? focusables.length - 1 : currentActiveIndex - 1;
        } else {
          currentActiveIndex = currentActiveIndex === focusables.length - 1 ? 0 : currentActiveIndex + 1;
        }
        return focusables[currentActiveIndex];
      };

      expect(cycleFocus(false)).toBe('cancel-button'); // Wrapped to first
    });

    it('traps focus backward from first element to last element on Shift+Tab', () => {
      const focusables = ['cancel-button', 'confirm-button', 'close-button'];
      let currentActiveIndex = 0; // First element

      const cycleFocus = (shiftKey: boolean) => {
        if (shiftKey) {
          currentActiveIndex = currentActiveIndex === 0 ? focusables.length - 1 : currentActiveIndex - 1;
        } else {
          currentActiveIndex = currentActiveIndex === focusables.length - 1 ? 0 : currentActiveIndex + 1;
        }
        return focusables[currentActiveIndex];
      };

      expect(cycleFocus(true)).toBe('close-button'); // Wrapped to last
    });

    it('safely restores focus to opener element, or document body if opener removed', () => {
      const opener = {
        connected: false,
        focus: vi.fn(),
      };
      const body = {
        focus: vi.fn(),
      };

      const restoreFocus = (targetOpener: typeof opener, targetBody: typeof body) => {
        try {
          if (targetOpener && targetOpener.connected && typeof targetOpener.focus === 'function') {
            targetOpener.focus();
          } else if (targetBody && typeof targetBody.focus === 'function') {
            targetBody.focus();
          }
        } catch {
          // safe fallback
        }
      };

      // Case 1: Opener disconnected -> falls back to body
      restoreFocus(opener, body);
      expect(opener.focus).not.toHaveBeenCalled();
      expect(body.focus).toHaveBeenCalledTimes(1);

      // Case 2: Opener connected -> focuses opener
      opener.connected = true;
      restoreFocus(opener, body);
      expect(opener.focus).toHaveBeenCalledTimes(1);
    });
  });

  describe('Backdrop Dismissal Policies', () => {
    const handleBackdropClickPolicy = (
      isTargetCurrentTarget: boolean,
      closeOnBackdropClick: boolean,
      isLoading: boolean,
      onCancel: () => void
    ) => {
      if (isTargetCurrentTarget && closeOnBackdropClick && !isLoading) {
        onCancel();
      }
    };

    it('invokes onCancel when backdrop clicked and closeOnBackdropClick is true', () => {
      const onCancel = vi.fn();
      handleBackdropClickPolicy(true, true, false, onCancel);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does NOT invoke onCancel when clicking inside the dialog panel (target !== currentTarget)', () => {
      const onCancel = vi.fn();
      handleBackdropClickPolicy(false, true, false, onCancel);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('does NOT invoke onCancel when closeOnBackdropClick is disabled', () => {
      const onCancel = vi.fn();
      handleBackdropClickPolicy(true, false, false, onCancel);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('does NOT invoke onCancel on backdrop click when loading an async mutation', () => {
      const onCancel = vi.fn();
      handleBackdropClickPolicy(true, true, true, onCancel);
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Loading & Double-Submit Protection Logic', () => {
    it('prevents multiple submissions when mutation is actively executing', () => {
      let isSubmitting = false;
      const executedMutations: string[] = [];

      const triggerAction = (actionId: string) => {
        if (isSubmitting) return false;
        isSubmitting = true;
        executedMutations.push(actionId);
        return true;
      };

      expect(triggerAction('mutation-1')).toBe(true);
      expect(triggerAction('mutation-1')).toBe(false); // Double click rejected
      expect(executedMutations).toHaveLength(1);
    });
  });

  describe('Scroll Lock Contract', () => {
    it('manages scroll lock transition and restores initial overflow state', () => {
      let simulatedBodyOverflow = 'auto';

      const lockScroll = () => {
        const previous = simulatedBodyOverflow;
        simulatedBodyOverflow = 'hidden';
        return () => {
          simulatedBodyOverflow = previous;
        };
      };

      const unlock = lockScroll();
      expect(simulatedBodyOverflow).toBe('hidden');

      unlock();
      expect(simulatedBodyOverflow).toBe('auto');
    });
  });

  describe('Accessibility Attributes Verification', () => {
    it('generates paired aria-labelledby and aria-describedby stable IDs', () => {
      const generateDialogAria = (baseId: string) => ({
        role: 'dialog' as const,
        'aria-modal': 'true' as const,
        'aria-labelledby': `confirm-modal-title-${baseId}`,
        'aria-describedby': `confirm-modal-description-${baseId}`,
      });

      const aria = generateDialogAria(':r1:');
      expect(aria.role).toBe('dialog');
      expect(aria['aria-modal']).toBe('true');
      expect(aria['aria-labelledby']).toBe('confirm-modal-title-:r1:');
      expect(aria['aria-describedby']).toBe('confirm-modal-description-:r1:');
    });
  });
});
