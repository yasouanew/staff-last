/**
 * Design-token contract tests.
 *
 * These lock the 2026 spec values so a future edit cannot silently drift a
 * colour, a radius or a type tier. They are deliberately literal — the point is
 * to fail loudly when a token changes, forcing the change to be intentional.
 */

import {
    colorTokensFor,
    darkColorTokens,
    getStatusPill,
    lightColorTokens,
    radiusTokens,
    screenPadding,
    shadowTokens,
    spacingTokens,
    statusPillSpec,
    tokensFor,
    typographyTokens,
} from '../tokens';

describe('colour tokens', () => {
    it('matches the 2026 light spec exactly', () => {
        expect(lightColorTokens).toEqual({
            primary: '#1B4FA0',
            primaryPressed: '#153D7E',
            primarySoft: '#EAF1FB',
            background: '#F7F9FC',
            surface: '#FFFFFF',
            surfaceRaised: '#F7F9FC',
            surfaceMuted: '#F1F4F9',
            inkPrimary: '#0F1722',
            inkSecondary: '#5B6675',
            inkTertiary: '#8A94A3',
            borderHairline: '#E4E9F0',
            success: '#0E8A5F',
            successSoft: '#DDF3E9',
            danger: '#C4322B',
            dangerSoft: '#FBE7E5',
            warning: '#B7791F',
            warningSoft: '#FFF3DC',
            info: '#1B4FA0',
            infoSoft: '#EAF1FB',
        });
    });

    it('matches the 2026 dark spec exactly', () => {
        expect(darkColorTokens).toEqual({
            primary: '#5B8DEF',
            primaryPressed: '#7AA3F2',
            primarySoft: '#1A2438',
            background: '#0B0E13',
            surface: '#10141B',
            surfaceRaised: '#161B24',
            surfaceMuted: '#1C2330',
            inkPrimary: '#F2F5F9',
            inkSecondary: '#A6B0BF',
            inkTertiary: '#6E7889',
            borderHairline: '#232B38',
            success: '#3ECF9A',
            successSoft: '#12281F',
            danger: '#F26D64',
            dangerSoft: '#2E1716',
            warning: '#E5B45C',
            warningSoft: '#2B2210',
            info: '#5B8DEF',
            infoSoft: '#1A2438',
        });
    });

    it('never uses pure black for a dark surface', () => {
        // The spec is explicit: layered surfaces, never `#000`. Pure black kills
        // the elevation cue entirely.
        expect(darkColorTokens.background).not.toBe('#000000');
        expect(darkColorTokens.surface).not.toBe('#000000');
        expect(darkColorTokens.surfaceRaised).not.toBe('#000000');
        expect(darkColorTokens.surfaceMuted).not.toBe('#000000');
    });

    it('unifies the two legacy brand blues onto one primary', () => {
        // The pre-2026 system carried both #1E5AA8 and #2E5FA3. Neither survives.
        expect(lightColorTokens.primary).toBe('#1B4FA0');
        expect(lightColorTokens.primary).not.toBe('#1E5AA8');
        expect(lightColorTokens.primary).not.toBe('#2E5FA3');
    });

    it('gives dark and light the same key set', () => {
        expect(Object.keys(darkColorTokens).sort()).toEqual(
            Object.keys(lightColorTokens).sort(),
        );
    });

    it('resolves a scheme, defaulting to light', () => {
        expect(colorTokensFor('dark')).toBe(darkColorTokens);
        expect(colorTokensFor('light')).toBe(lightColorTokens);
        expect(colorTokensFor(null)).toBe(lightColorTokens);
    });
});

describe('radius tokens', () => {
    it('matches the 2026 spec', () => {
        expect(radiusTokens).toEqual({ rSm: 10, rMd: 16, rLg: 20, rXl: 28, rPill: 999 });
    });
});

describe('spacing tokens', () => {
    it('is a strict 4pt grid', () => {
        expect(spacingTokens).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 });
        Object.values(spacingTokens).forEach(value => {
            expect(value % 4).toBe(0);
        });
    });

    it('uses 20 as the global screen padding', () => {
        expect(screenPadding).toBe(20);
    });
});

describe('typography tokens', () => {
    it('matches the 2026 scale', () => {
        expect(typographyTokens.display).toEqual({ fontSize: 28, lineHeight: 34, fontWeight: '700' });
        expect(typographyTokens.title).toEqual({ fontSize: 22, lineHeight: 28, fontWeight: '700' });
        expect(typographyTokens.heading).toEqual({ fontSize: 17, lineHeight: 22, fontWeight: '600' });
        expect(typographyTokens.body).toEqual({ fontSize: 15, lineHeight: 22, fontWeight: '400' });
        expect(typographyTokens.bodyStrong).toEqual({ fontSize: 15, lineHeight: 22, fontWeight: '600' });
        expect(typographyTokens.caption).toEqual({ fontSize: 13, lineHeight: 18, fontWeight: '500' });
    });

    it('defines micro as 11/14 w600 uppercase with 0.8 tracking', () => {
        expect(typographyTokens.micro).toEqual({
            fontSize: 11,
            lineHeight: 14,
            fontWeight: '600',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
        });
    });
});

describe('shadow tokens', () => {
    it('matches the 2026 card spec', () => {
        expect(shadowTokens.shadowCard).toEqual({
            shadowColor: '#0F1722',
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
        });
    });

    it('matches the 2026 float spec', () => {
        expect(shadowTokens.shadowFloat).toEqual({
            shadowColor: '#0F1722',
            shadowOpacity: 0.1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
        });
    });
});

describe('getStatusPill', () => {
    it('maps each status to its soft background and solid foreground', () => {
        expect(getStatusPill('scheduled')).toEqual({
            bg: lightColorTokens.infoSoft,
            fg: lightColorTokens.info,
        });
        expect(getStatusPill('approved')).toEqual({
            bg: lightColorTokens.successSoft,
            fg: lightColorTokens.success,
        });
        expect(getStatusPill('cancelled')).toEqual({
            bg: lightColorTokens.dangerSoft,
            fg: lightColorTokens.danger,
        });
        expect(getStatusPill('rejected')).toEqual({
            bg: lightColorTokens.dangerSoft,
            fg: lightColorTokens.danger,
        });
        expect(getStatusPill('pending')).toEqual({
            bg: lightColorTokens.warningSoft,
            fg: lightColorTokens.warning,
        });
    });

    it('falls back to a neutral pair for an unknown status', () => {
        expect(getStatusPill('on_hold')).toEqual({
            bg: lightColorTokens.surfaceMuted,
            fg: lightColorTokens.inkSecondary,
        });
    });

    it('honours an explicit token map so it re-tints in dark mode', () => {
        expect(getStatusPill('approved', darkColorTokens)).toEqual({
            bg: darkColorTokens.successSoft,
            fg: darkColorTokens.success,
        });
    });
});

describe('status pill spec', () => {
    it('is height 28, padding 12, radius 999, micro type', () => {
        expect(statusPillSpec.height).toBe(28);
        expect(statusPillSpec.paddingHorizontal).toBe(12);
        expect(statusPillSpec.radius).toBe(999);
        expect(statusPillSpec.type).toBe(typographyTokens.micro);
    });
});

describe('assembled token set', () => {
    it('resolves a complete set per scheme', () => {
        const light = tokensFor('light');
        expect(light.isDark).toBe(false);
        expect(light.colors).toBe(lightColorTokens);
        expect(light.radius).toBe(radiusTokens);
        expect(light.spacing).toBe(spacingTokens);
        expect(light.typography).toBe(typographyTokens);
        expect(light.shadows).toBe(shadowTokens);
        expect(light.screenPadding).toBe(20);

        const dark = tokensFor('dark');
        expect(dark.isDark).toBe(true);
        expect(dark.colors).toBe(darkColorTokens);
    });
});
