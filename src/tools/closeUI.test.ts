import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// =====================================================
// close_ui schema tests
// =====================================================

describe('close_ui schema', () => {
    it('accepts a valid surfaceId', async () => {
        const { CloseUIInputSchema } = await import('./schemas');
        const result = CloseUIInputSchema.safeParse({ surfaceId: 'surf1' });
        assert.ok(result.success, 'Expected valid surfaceId to parse successfully');
        if (result.success) {
            assert.equal(result.data.surfaceId, 'surf1');
        }
    });

    it('rejects missing surfaceId', async () => {
        const { CloseUIInputSchema } = await import('./schemas');
        const result = CloseUIInputSchema.safeParse({});
        assert.strictEqual(result.success, false);
    });

    it('rejects empty surfaceId', async () => {
        const { CloseUIInputSchema, safeParseInput } = await import('./schemas');
        const result = safeParseInput(CloseUIInputSchema, { surfaceId: '' });
        assert.strictEqual(result.success, false, 'Should reject empty surfaceId');
        if (!result.success) {
            assert.ok(result.error.includes('surfaceId'), `Expected error to mention surfaceId, got: ${result.error}`);
        }
    });

    it('rejects extra unexpected fields gracefully (passes through with strip)', async () => {
        const { CloseUIInputSchema } = await import('./schemas');
        const result = CloseUIInputSchema.safeParse({ surfaceId: 'surf1', extra: 'ignored' });
        assert.ok(result.success, 'Zod strips unknown keys by default');
    });
});

// =====================================================
// closeUI function tests
// =====================================================

describe('closeUI function', () => {
    it('returns closed: true when panel was open', async () => {
        const { closeUI } = await import('./closeUI');

        let closedId: string | null = null;
        const mockPanel = {
            closeIfOpen(surfaceId: string) {
                closedId = surfaceId;
                return true;
            },
        };

        const result = await closeUI({ surfaceId: 'surf1' }, { panel: mockPanel });

        assert.equal(closedId, 'surf1');
        assert.equal(result.surfaceId, 'surf1');
        assert.equal(result.closed, true);
    });

    it('returns closed: false when panel was not open', async () => {
        const { closeUI } = await import('./closeUI');

        const mockPanel = {
            closeIfOpen(_surfaceId: string) {
                return false;
            },
        };

        const result = await closeUI({ surfaceId: 'ghost' }, { panel: mockPanel });

        assert.equal(result.surfaceId, 'ghost');
        assert.equal(result.closed, false);
    });

    it('awaits async closeIfOpen result', async () => {
        const { closeUI } = await import('./closeUI');

        const mockPanel = {
            async closeIfOpen(_surfaceId: string): Promise<boolean> {
                return true;
            },
        };

        const result = await closeUI({ surfaceId: 'async-surf' }, { panel: mockPanel });

        assert.equal(result.closed, true);
    });

    it('result contains surfaceId from input', async () => {
        const { closeUI } = await import('./closeUI');

        const mockPanel = {
            closeIfOpen(_surfaceId: string) {
                return false;
            },
        };

        const result = await closeUI({ surfaceId: 'my-surface' }, { panel: mockPanel });
        assert.equal(result.surfaceId, 'my-surface');
    });
});

// =====================================================
// closeUI cancellation tests
// =====================================================

describe('closeUI cancellation', () => {
    it('returns closed: false without calling panel when token is pre-cancelled', async () => {
        const { closeUI } = await import('./closeUI');

        let panelCalled = false;
        const mockPanel = {
            closeIfOpen(_surfaceId: string) {
                panelCalled = true;
                return true;
            },
        };

        const cancelledToken = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await closeUI(
            { surfaceId: 'surf1' },
            { panel: mockPanel },
            cancelledToken as any,
        );

        assert.equal(panelCalled, false, 'Panel should not be called when token is pre-cancelled');
        assert.equal(result.closed, false);
        assert.equal(result.surfaceId, 'surf1');
    });

    it('proceeds normally when token is not cancelled', async () => {
        const { closeUI } = await import('./closeUI');

        const mockPanel = {
            closeIfOpen(_surfaceId: string) { return true; },
        };

        const activeToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await closeUI(
            { surfaceId: 'surf1' },
            { panel: mockPanel },
            activeToken as any,
        );

        assert.equal(result.closed, true);
        assert.equal(result.surfaceId, 'surf1');
    });
});
