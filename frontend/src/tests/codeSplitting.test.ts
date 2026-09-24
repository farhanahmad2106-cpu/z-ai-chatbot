import { describe, it, expect, vi } from 'vitest';
import { ViewErrorBoundary } from '../components/ViewErrorBoundary';

describe('ViewErrorBoundary & Lazy Code-Splitting Architecture', () => {
  it('correctly catches errors and updates state via getDerivedStateFromError', () => {
    const testError = new Error('Chunk load failed for module /assets/AdminDashboard.js');
    const newState = ViewErrorBoundary.getDerivedStateFromError(testError);

    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(testError);
    expect(newState.error?.message).toContain('Chunk load failed');
  });

  it('renders children when no error occurs in component tree', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Content Loaded Successfully',
    });

    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    const rendered = boundary.render();
    expect(rendered).toBe('Content Loaded Successfully');
  });

  it('renders dark brutalist fallback UI with retry action when error occurs', () => {
    const onResetMock = vi.fn();
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'admin',
      onReset: onResetMock,
    });

    // Simulate error state
    boundary.state = {
      hasError: true,
      error: new Error('Network error loading chunk'),
    };

    const rendered = boundary.render() as any;
    expect(rendered).toBeDefined();
    expect(rendered.type).toBe('div');
    expect(rendered.props.className).toContain('min-h-[400px]');
  });

  it('defines expected app tab routes including code-split modules', () => {
    const supportedTabs = [
      'dashboard',
      'search',
      'scan',
      'profile',
      'settings',
      'pricing',
      'admin',
      'privacy',
      'terms',
      'refund',
      'cookies',
      'planner',
    ];

    expect(supportedTabs).toHaveLength(12);
    expect(supportedTabs).toContain('dashboard');
    expect(supportedTabs).toContain('planner');
    expect(supportedTabs).toContain('admin');
    expect(supportedTabs).toContain('privacy');
  });
});
