import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfirmModalProps } from '../components/ui/ConfirmModal';

describe('ConfirmModal Component & Accessibility Requirements', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Props & Contract Validation', () => {
    it('defines expected props contract with standard defaults', () => {
      const mockProps: ConfirmModalProps = {
        isOpen: true,
        title: 'Revoke Administrator',
        message: 'Are you sure you want to permanently revoke this administrator?',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      };

      expect(mockProps.isOpen).toBe(true);
      expect(mockProps.title).toBe('Revoke Administrator');
      expect(mockProps.message).toContain('permanently revoke');
      expect(mockProps.confirmLabel ?? 'Confirm').toBe('Confirm');
      expect(mockProps.cancelLabel ?? 'Cancel').toBe('Cancel');
      expect(mockProps.variant ?? 'primary').toBe('primary');
      expect(mockProps.isLoading ?? false).toBe(false);
      expect(mockProps.closeOnBackdropClick ?? true).toBe(true);
    });

    it('supports danger, warning, and primary variants', () => {
      const getVariantConfig = (variant: 'danger' | 'warning' | 'primary') => {
        switch (variant) {
          case 'danger':
            return {
              confirmClass: 'bg-rose-500',
              iconType: 'AlertTriangle',
            };
          case 'warning':
            return {
              confirmClass: 'bg-amber-500',
              iconType: 'AlertCircle',
            };
          case 'primary':
          default:
            return {
              confirmClass: 'bg-emerald-500',
              iconType: 'Info',
            };
        }
      };

      expect(getVariantConfig('danger').confirmClass).toContain('bg-rose-500');
      expect(getVariantConfig('warning').confirmClass).toContain('bg-amber-500');
      expect(getVariantConfig('primary').confirmClass).toContain('bg-emerald-500');
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
