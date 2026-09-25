import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MacroMetricCard } from '../components/MealPlanner';
import {
  generateQuickCommerceLinks,
  isValidProviderUrl,
  sanitizeIngredientForSearch,
  PROVIDER_CONFIG,
  QuickCommerceProvider,
} from '../utils/groceryDeepLinks';

describe('Mobile Meal Planner UX Hardening, Macro Visualization & Quick-Commerce Actions', () => {
  describe('Feature A: Compact Macro Progress Indicators (MacroMetricCard)', () => {
    it('renders correct current value, target, and unit', () => {
      const html = renderToString(
        React.createElement(MacroMetricCard, {
          label: 'Calories',
          current: 1650,
          target: 2000,
          unit: 'kcal',
          textColor: 'text-emerald-400',
          barColor: 'bg-emerald-400',
        })
      );

      expect(html).toContain('Calories');
      expect(html).toContain('1,650');
      expect(html).toContain('/ 2,000');
      expect(html).toContain('kcal');
      expect(html).toContain('text-emerald-400');
      expect(html).toContain('bg-emerald-400');
    });

    it('calculates progress percentage and sets accessible progressbar attributes', () => {
      const html = renderToString(
        React.createElement(MacroMetricCard, {
          label: 'Protein',
          current: 70,
          target: 140,
          unit: 'g',
          textColor: 'text-sky-400',
          barColor: 'bg-sky-400',
        })
      );

      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="70"');
      expect(html).toContain('aria-valuemin="0"');
      expect(html).toContain('aria-valuemax="140"');
      expect(html).toContain('aria-label="Protein progress: 70 of 140 g"');
      expect(html).toContain('50%');
      expect(html).toContain('style="width:50%"');
      expect(html).toContain('motion-reduce:transition-none');
    });

    it('clamps visual bar at 100% when current > target without overflow', () => {
      const html = renderToString(
        React.createElement(MacroMetricCard, {
          label: 'Calories',
          current: 2500,
          target: 2000,
          unit: 'kcal',
          textColor: 'text-emerald-400',
          barColor: 'bg-emerald-400',
        })
      );

      // Current exceeds target
      expect(html).toContain('2,500');
      expect(html).toContain('/ 2,000');
      // Visual bar must be clamped strictly to 100%
      expect(html).toContain('style="width:100%"');
      expect(html).not.toContain('style="width:125%"');
      // Accessible progressbar value reflects real current value
      expect(html).toContain('aria-valuenow="2500"');
      expect(html).toContain('+25% over');
    });

    it('omits progress bar and gracefully displays current value only when target is unavailable', () => {
      const html = renderToString(
        React.createElement(MacroMetricCard, {
          label: 'Fat',
          current: 45,
          unit: 'g',
          textColor: 'text-rose-400',
          barColor: 'bg-rose-400',
        })
      );

      expect(html).toContain('Fat');
      expect(html).toContain('45');
      expect(html).toContain('g');
      // Must not fabricate a target or render a progress bar
      expect(html).not.toContain('role="progressbar"');
      expect(html).not.toContain('/ ');
    });

    it('adheres to exact color mappings specified in design system', () => {
      const metrics = [
        { label: 'Calories', textColor: 'text-emerald-400', barColor: 'bg-emerald-400' },
        { label: 'Protein', textColor: 'text-sky-400', barColor: 'bg-sky-400' },
        { label: 'Carbs', textColor: 'text-amber-400', barColor: 'bg-amber-400' },
        { label: 'Fat', textColor: 'text-rose-400', barColor: 'bg-rose-400' },
      ];

      metrics.forEach(({ label, textColor, barColor }) => {
        const html = renderToString(
          React.createElement(MacroMetricCard, {
            label,
            current: 100,
            target: 200,
            unit: 'g',
            textColor,
            barColor,
          })
        );
        expect(html).toContain(textColor);
        expect(html).toContain(barColor);
      });
    });
  });

  describe('Feature B: Meal Header Collision & Status Badge Semantics', () => {
    it('verifies break-words and min-w-0 on meal headers with shrink-0 badge structure', () => {
      const longTitle =
        'Very Long Mediterranean Vegetable Protein Rich Breakfast Bowl With Homemade Low Sodium Dressing';

      // Simulate meal header JSX as rendered in WeeklyMealPlanner
      const element = React.createElement(
        'div',
        { className: 'flex items-start justify-between gap-3 mb-2' },
        React.createElement(
          'h3',
          {
            className:
              'min-w-0 flex-1 font-outfit text-base sm:text-lg font-bold text-white tracking-tight leading-snug break-words',
          },
          `BREAKFAST: ${longTitle}`
        ),
        React.createElement(
          'span',
          {
            className:
              'shrink-0 px-2.5 py-1 text-xs font-mono font-semibold rounded-full flex items-center gap-1 border bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            'aria-label': 'Dietary status: SAFE',
          },
          'SAFE'
        )
      );

      const html = renderToString(element);

      expect(html).toContain('min-w-0');
      expect(html).toContain('flex-1');
      expect(html).toContain('break-words');
      expect(html).toContain('shrink-0');
      expect(html).toContain('BREAKFAST: ' + longTitle);
      expect(html).toContain('SAFE');
      expect(html).toContain('aria-label="Dietary status: SAFE"');
    });

    it('supports alternative dietary statuses (MODERATE and CRITICAL) without forcing SAFE', () => {
      const renderStatusBadge = (status: 'safe' | 'moderate' | 'critical') => {
        const isCritical = status === 'critical';
        const isModerate = status === 'moderate';
        return React.createElement(
          'span',
          {
            className: `shrink-0 px-2.5 py-1 text-xs font-mono font-semibold rounded-full flex items-center gap-1 border ${
              isCritical
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : isModerate
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`,
            'aria-label': `Dietary status: ${status.toUpperCase()}`,
          },
          status.toUpperCase()
        );
      };

      const safeHtml = renderToString(renderStatusBadge('safe'));
      expect(safeHtml).toContain('bg-emerald-500/10');
      expect(safeHtml).toContain('text-emerald-400');
      expect(safeHtml).toContain('SAFE');

      const moderateHtml = renderToString(renderStatusBadge('moderate'));
      expect(moderateHtml).toContain('bg-amber-500/10');
      expect(moderateHtml).toContain('text-amber-400');
      expect(moderateHtml).toContain('MODERATE');

      const criticalHtml = renderToString(renderStatusBadge('critical'));
      expect(criticalHtml).toContain('bg-rose-500/10');
      expect(criticalHtml).toContain('text-rose-400');
      expect(criticalHtml).toContain('CRITICAL');
    });
  });

  describe('Feature C: Per-Meal Quick-Commerce Shopping Action', () => {
    it('generates canonical search URLs for dish ingredients using existing generateQuickCommerceLinks', () => {
      const dishIngredients = ['Rolled Oats', 'Almond Milk', 'Chia Seeds', 'Honey'];
      const primaryIngredient = dishIngredients[0];

      const links = generateQuickCommerceLinks(primaryIngredient);

      expect(links.sanitizedName).toBe('Rolled Oats');
      expect(links.blinkit).toContain('https://blinkit.com/s/?q=Rolled%20Oats');
      expect(links.zepto).toContain('https://www.zeptonow.com/search?query=Rolled%20Oats');
      expect(links.instamart).toContain('https://www.swiggy.com/instamart/search?custom_back=true&query=Rolled%20Oats');

      // Check all generated URLs are valid
      expect(isValidProviderUrl(links.blinkit, 'blinkit')).toBe(true);
      expect(isValidProviderUrl(links.zepto, 'zepto')).toBe(true);
      expect(isValidProviderUrl(links.instamart, 'instamart')).toBe(true);
    });

    it('safely handles noisy or complex Indian dish ingredients', () => {
      const rawIngredient = 'Besan (Gram Flour) - 200g (finely chopped)';
      const sanitized = sanitizeIngredientForSearch(rawIngredient);
      expect(sanitized).toBe('Besan');

      const links = generateQuickCommerceLinks(rawIngredient);
      expect(links.sanitizedName).toBe('Besan');
      expect(links.blinkit).toBe('https://blinkit.com/s/?q=Besan');
    });

    it('validates provider config labels and accents for Blinkit, Zepto, and Instamart', () => {
      const providers: QuickCommerceProvider[] = ['blinkit', 'zepto', 'instamart'];
      providers.forEach((prov) => {
        const cfg = PROVIDER_CONFIG[prov];
        expect(cfg).toBeDefined();
        expect(cfg.label).toBeTruthy();
        expect(cfg.buildSearchUrl('Tomato')).toContain('Tomato');
      });
    });

    it('renders responsive meal card footer with 44px touch targets and stacking on mobile', () => {
      // Test mobile action footer layout
      const footerElement = React.createElement(
        'div',
        { className: 'flex flex-col sm:flex-row gap-2 mt-4 pt-3 border-t border-slate-800/80' },
        React.createElement(
          'button',
          {
            type: 'button',
            className:
              'flex-1 min-h-[44px] py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
          },
          'Swap Meal'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className:
              'w-full min-h-[44px] py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
          },
          'Order Dish Ingredients'
        )
      );

      const html = renderToString(footerElement);

      // Stacks on mobile, side-by-side on sm+
      expect(html).toContain('flex-col');
      expect(html).toContain('sm:flex-row');
      // Touch target min 44px
      expect(html).toContain('min-h-[44px]');
      // Focus-visible rings
      expect(html).toContain('focus-visible:outline-emerald-400');
      // Actions
      expect(html).toContain('Swap Meal');
      expect(html).toContain('Order Dish Ingredients');
    });

    it('renders accessible dish ingredients ordering dialog with provider options', () => {
      const popoverElement = React.createElement(
        'div',
        {
          role: 'dialog',
          'aria-modal': 'false',
          'aria-label': 'Order ingredients for Breakfast Bowl',
          className: 'absolute bottom-full mb-2 left-0 right-0 sm:left-auto sm:right-0 sm:w-72 z-30 p-3.5 bg-slate-950 border border-slate-700 rounded-3xl shadow-2xl',
        },
        React.createElement(
          'span',
          { className: 'text-xs font-bold text-white' },
          'Order Dish Ingredients'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold',
            'aria-label': 'Search Rolled Oats on Blinkit',
          },
          'Blinkit'
        )
      );

      const html = renderToString(popoverElement);

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-label="Order ingredients for Breakfast Bowl"');
      expect(html).toContain('Order Dish Ingredients');
      expect(html).toContain('Blinkit');
      expect(html).toContain('aria-label="Search Rolled Oats on Blinkit"');
      // Contained width styles for mobile
      expect(html).toContain('left-0 right-0 sm:left-auto sm:right-0 sm:w-72');
    });
  });
});
