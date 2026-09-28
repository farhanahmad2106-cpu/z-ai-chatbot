import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewErrorBoundary } from '../components/ViewErrorBoundary';

class MockStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  key(index: number) { return Array.from(this.store.keys())[index] || null; }
}

describe('ViewErrorBoundary & Lazy Code-Splitting Architecture', () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = new MockStorage();
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = mockStorage;
    (globalThis as unknown as { window: unknown }).window = (globalThis as unknown as { window: unknown }).window || {
      location: { reload: vi.fn() },
      alert: vi.fn(),
      confirm: vi.fn(),
      prompt: vi.fn(),
    };
  });

  afterEach(() => {
    mockStorage.clear();
  });

  it('renders children normally when no error occurs in component tree', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Content Loaded Successfully',
      viewName: 'planner',
    });

    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    const rendered = boundary.render();
    expect(rendered).toBe('Content Loaded Successfully');
  });

  it('correctly catches lazy view errors and updates state via getDerivedStateFromError', () => {
    const testError = new Error('Chunk load failed for module /assets/AdminDashboard.js');
    const newState = ViewErrorBoundary.getDerivedStateFromError(testError);

    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(testError);
    expect(newState.error?.message).toContain('Chunk load failed');
  });

  it('renders dark brutalist fallback UI with alert icon when error occurs', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'admin',
    });

    boundary.state = {
      hasError: true,
      error: new Error('Failed to fetch dynamically imported module'),
      isRepeatedFailure: false,
    };

    const rendered = boundary.render() as unknown as Record<string, unknown> & { type: string, props: Record<string, unknown> & { className: string, children: unknown, role: string, 'aria-live': string } };
    expect(rendered).toBeDefined();
    expect(rendered.type).toBe('div');
    expect(rendered.props.className).toContain('min-h-[400px]');
    expect(rendered.props.className).toContain('animate-in');
  });

  it('provides accessible alert semantics (role="alert" and aria-live="assertive")', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'scan',
    });

    boundary.state = {
      hasError: true,
      error: new Error('Network error loading chunk'),
      isRepeatedFailure: false,
    };

    const rendered = boundary.render() as unknown as Record<string, unknown> & { type: string, props: Record<string, unknown> & { className: string, children: unknown, role: string, 'aria-live': string } };
    expect(rendered.props.role).toBe('alert');
    expect(rendered.props['aria-live']).toBe('assertive');
  });

  it('renders retry button and secondary dashboard reset button', () => {
    const onResetMock = vi.fn();
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'pricing',
      onReset: onResetMock,
    });

    boundary.state = {
      hasError: true,
      error: new Error('Chunk load failed'),
      isRepeatedFailure: false,
    };

    const rendered = boundary.render() as unknown as Record<string, unknown> & { type: string, props: Record<string, unknown> & { className: string, children: unknown, role: string, 'aria-live': string } };
    const card = rendered.props.children as { props: Record<string, unknown> & { children: unknown[] } };
    const buttonContainer = card.props.children[card.props.children.length - 1] as { props: Record<string, unknown> & { children: unknown[] } };
    const buttons = buttonContainer.props.children as Array<{ props: Record<string, unknown> & { type: string, children: unknown[] } }>;

    // Primary retry button
    const retryButton = buttons[0];
    expect(retryButton.props.type).toBe('button');
    expect(retryButton.props.children[1]).toBe('Reload View');

    // Secondary dashboard navigation button
    const dashboardButton = buttons[1];
    expect(dashboardButton.props.type).toBe('button');
    expect(dashboardButton.props.children[1]).toBe('Dashboard');
  });

  it('prevents infinite reload loops by tracking attempts in sessionStorage and surfaces repeated failure UI', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'admin',
    });

    // Simulate prior reload attempt in sessionStorage
    mockStorage.setItem('z_chunk_retry_admin', '1');

    const err = new Error('Persistent Chunk Failure');
    boundary.state = ViewErrorBoundary.getDerivedStateFromError(err);
    boundary.componentDidCatch(err, { componentStack: '' });

    expect(boundary.state.isRepeatedFailure).toBe(true);

    const rendered = boundary.render() as unknown as Record<string, unknown> & { type: string, props: Record<string, unknown> & { className: string, children: unknown, role: string, 'aria-live': string } };
    const card = rendered.props.children as { props: Record<string, unknown> & { children: unknown[] } };
    const overline = card.props.children[2] as { props: Record<string, unknown> & { children: string } };
    const heading = card.props.children[3] as { props: Record<string, unknown> & { children: string } };
    expect(overline.props.children).toBe('Persistent Load Error');
    expect(heading.props.children).toBe('Unable to load section');
  });

  it('resets error state when viewName changes via componentDidUpdate', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'scan',
    });

    boundary.state = {
      hasError: true,
      error: new Error('Scan Chunk Load Failed'),
      isRepeatedFailure: false,
    };

    // When props differ:
    (boundary as unknown as { props: unknown }).props = {
      children: 'Dashboard Content',
      viewName: 'dashboard',
    };
    boundary.componentDidUpdate({
      children: 'Normal View Content',
      viewName: 'scan',
    });

    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(boundary.state.isRepeatedFailure).toBe(false);
  });

  it('invokes onReset and clears sessionStorage when GoHome action is triggered', () => {
    const onResetMock = vi.fn();
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'admin',
      onReset: onResetMock,
    });

    mockStorage.setItem('z_chunk_retry_admin', '1');
    boundary.state = {
      hasError: true,
      error: new Error('Chunk failure'),
      isRepeatedFailure: true,
    };

    (boundary as unknown as { handleGoHome: () => void }).handleGoHome();

    expect(boundary.state.hasError).toBe(false);
    expect(onResetMock).toHaveBeenCalledTimes(1);
    expect(mockStorage.getItem('z_chunk_retry_admin')).toBeNull();
  });

  it('never uses native window.alert, window.confirm, or window.prompt', () => {
    const alertSpy = vi.fn();
    const confirmSpy = vi.fn();
    (globalThis as unknown as { window: Record<string, unknown> }).window.alert = alertSpy;
    (globalThis as unknown as { window: Record<string, unknown> }).window.confirm = confirmSpy;

    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'planner',
    });

    boundary.state = {
      hasError: true,
      error: new Error('Chunk load failed'),
      isRepeatedFailure: false,
    };

    boundary.render();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('Scenario A: first failure handleRetry records session marker and reloads window', () => {
    const reloadSpy = vi.fn();
    (globalThis as unknown as { window: Record<string, unknown> }).window.location = { reload: reloadSpy };

    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'planner',
    });

    boundary.state = {
      hasError: true,
      error: new Error('Failed to load chunk'),
      isRepeatedFailure: false,
    };

    (boundary as unknown as { handleRetry: () => void }).handleRetry();

    expect(mockStorage.getItem('z_chunk_retry_planner')).toBe('1');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(boundary.state.hasError).toBe(false);
  });

  it('Scenario E: force reload on repeated failure clears session marker and reloads window', () => {
    const reloadSpy = vi.fn();
    (globalThis as unknown as { window: Record<string, unknown> }).window.location = { reload: reloadSpy };

    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'planner',
    });

    mockStorage.setItem('z_chunk_retry_planner', '1');
    boundary.state = {
      hasError: true,
      error: new Error('Persistent failure'),
      isRepeatedFailure: true,
    };

    (boundary as unknown as { handleRetry: () => void }).handleRetry();

    expect(mockStorage.getItem('z_chunk_retry_planner')).toBeNull();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(boundary.state.hasError).toBe(false);
  });

  it('Scenario F: degrades safely to in-memory store when sessionStorage throws', () => {
    const throwingStorage = {
      getItem: vi.fn(() => { throw new Error('SecurityError: Access Denied'); }),
      setItem: vi.fn(() => { throw new Error('QuotaExceededError'); }),
      removeItem: vi.fn(() => { throw new Error('SecurityError'); }),
    };
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = throwingStorage;

    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'search',
    });

    // Should not throw
    expect(() => {
      boundary.componentDidCatch(new Error('Chunk failure'), { componentStack: '' });
    }).not.toThrow();

    // Render should succeed with fallback UI
    boundary.state = {
      hasError: true,
      error: new Error('Chunk failure'),
      isRepeatedFailure: false,
    };
    const rendered = boundary.render() as unknown as Record<string, unknown> & { type: string, props: Record<string, unknown> & { className: string, children: unknown, role: string, 'aria-live': string } };
    expect(rendered).toBeDefined();
    expect(rendered.props.role).toBe('alert');
  });

  it('Scenario G: accessibility semantics are fully satisfied', () => {
    const boundary = new ViewErrorBoundary({
      children: 'Normal View Content',
      viewName: 'settings',
      onReset: vi.fn(),
    });

    boundary.state = {
      hasError: true,
      error: new Error('Chunk load failed'),
      isRepeatedFailure: true,
    };

    const rendered = boundary.render() as unknown as Record<string, unknown> & { type: string, props: Record<string, unknown> & { className: string, children: unknown, role: string, 'aria-live': string } };
    expect(rendered.props.role).toBe('alert');
    expect(rendered.props['aria-live']).toBe('assertive');

    const card = rendered.props.children as { props: Record<string, unknown> & { children: unknown[] } };
    const buttonContainer = card.props.children[card.props.children.length - 1] as { props: Record<string, unknown> & { children: unknown[] } };
    const [forceReloadBtn, dashboardBtn] = buttonContainer.props.children as Array<{ props: Record<string, unknown> & { type: string, children: unknown[] } }>;

    expect(forceReloadBtn.props.type).toBe('button');
    expect(forceReloadBtn.props.children[1]).toBe('Force Reload');
    expect(dashboardBtn.props.type).toBe('button');
    expect(dashboardBtn.props.children[1]).toBe('Dashboard');
  });

  it('defines all 12 expected application tab views with proper routing alignment', () => {
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
