import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// =====================================================
// list_surfaces schema tests
// =====================================================

describe('list_surfaces schema', () => {
    it('accepts empty input (no parameters required)', async () => {
        const { ListSurfacesInputSchema } = await import('./schemas');
        const result = ListSurfacesInputSchema.safeParse({});
        assert.ok(result.success, 'Expected empty input to parse successfully');
    });

    it('rejects extra unexpected fields gracefully (passes through with strip)', async () => {
        const { ListSurfacesInputSchema } = await import('./schemas');
        const result = ListSurfacesInputSchema.safeParse({ extra: 'ignored' });
        assert.ok(result.success, 'Zod strips unknown keys by default');
    });
});

// =====================================================
// listSurfaces function tests
// =====================================================

describe('listSurfaces function', () => {
    it('returns empty array when no surfaces exist', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                return [];
            },
        };

        const result = await listSurfaces({}, { panel: mockPanel });

        assert.equal(result.surfaces.length, 0);
        assert.ok(Array.isArray(result.surfaces));
    });

    it('returns array with one surface after creating it', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                return [
                    {
                        surfaceId: 'surf1',
                        title: 'Test Surface 1',
                        created: new Date('2025-01-01T10:00:00Z').toISOString(),
                    },
                ];
            },
        };

        const result = await listSurfaces({}, { panel: mockPanel });

        assert.equal(result.surfaces.length, 1);
        assert.equal(result.surfaces[0].surfaceId, 'surf1');
        assert.equal(result.surfaces[0].title, 'Test Surface 1');
        assert.ok(result.surfaces[0].created);
    });

    it('returns multiple surfaces after creating them', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                return [
                    {
                        surfaceId: 'surf1',
                        title: 'Surface 1',
                        created: new Date('2025-01-01T10:00:00Z').toISOString(),
                    },
                    {
                        surfaceId: 'surf2',
                        title: 'Surface 2',
                        created: new Date('2025-01-01T11:00:00Z').toISOString(),
                    },
                    {
                        surfaceId: 'surf3',
                        title: 'Surface 3',
                        created: new Date('2025-01-01T12:00:00Z').toISOString(),
                    },
                ];
            },
        };

        const result = await listSurfaces({}, { panel: mockPanel });

        assert.equal(result.surfaces.length, 3);
        assert.equal(result.surfaces[0].surfaceId, 'surf1');
        assert.equal(result.surfaces[1].surfaceId, 'surf2');
        assert.equal(result.surfaces[2].surfaceId, 'surf3');
    });

    it('includes surface metadata (id, title, created timestamp)', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                return [
                    {
                        surfaceId: 'test-surface',
                        title: 'Test Title',
                        created: new Date('2025-03-12T15:30:00Z').toISOString(),
                    },
                ];
            },
        };

        const result = await listSurfaces({}, { panel: mockPanel });

        assert.equal(result.surfaces.length, 1);
        const surface = result.surfaces[0];
        assert.equal(surface.surfaceId, 'test-surface');
        assert.equal(surface.title, 'Test Title');
        assert.ok(surface.created);
        assert.equal(typeof surface.created, 'string');
    });

    it('does not include closed surfaces in the list', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                // Simulate that surf2 was closed
                return [
                    {
                        surfaceId: 'surf1',
                        title: 'Still Open',
                        created: new Date('2025-01-01T10:00:00Z').toISOString(),
                    },
                    {
                        surfaceId: 'surf3',
                        title: 'Also Open',
                        created: new Date('2025-01-01T12:00:00Z').toISOString(),
                    },
                ];
            },
        };

        const result = await listSurfaces({}, { panel: mockPanel });

        assert.equal(result.surfaces.length, 2);
        assert.equal(result.surfaces[0].surfaceId, 'surf1');
        assert.equal(result.surfaces[1].surfaceId, 'surf3');
        assert.ok(!result.surfaces.find((s) => s.surfaceId === 'surf2'));
    });

    it('handles surfaces with no title (undefined becomes empty string)', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                return [
                    {
                        surfaceId: 'untitled',
                        title: '',  // Empty string instead of undefined
                        created: new Date('2025-01-01T10:00:00Z').toISOString(),
                    },
                ];
            },
        };

        const result = await listSurfaces({}, { panel: mockPanel });

        assert.equal(result.surfaces.length, 1);
        assert.equal(result.surfaces[0].surfaceId, 'untitled');
        // Title should be handled gracefully (empty string)
        assert.equal(result.surfaces[0].title, '');
    });
});

// =====================================================
// listSurfaces cancellation tests
// =====================================================

describe('listSurfaces cancellation', () => {
    it('returns empty array without calling panel when token is pre-cancelled', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        let panelCalled = false;
        const mockPanel = {
            listSurfaces() {
                panelCalled = true;
                return [];
            },
        };

        const cancelledToken = {
            isCancellationRequested: true,
            onCancellationRequested: () => ({ dispose: () => {} }),
        };

        const result = await listSurfaces(
            {},
            { panel: mockPanel },
            cancelledToken as any,
        );

        assert.equal(panelCalled, false, 'Panel should not be called when token is pre-cancelled');
        assert.equal(result.surfaces.length, 0);
    });

    it('proceeds normally when token is not cancelled', async () => {
        const { listSurfaces } = await import('./listSurfaces');

        const mockPanel = {
            listSurfaces() {
                return [
                    {
                        surfaceId: 'surf1',
                        title: 'Test',
                        created: new Date().toISOString(),
                    },
                ];
            },
        };

        const activeToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => {} }),
        };

        const result = await listSurfaces(
            {},
            { panel: mockPanel },
            activeToken as any,
        );

        assert.equal(result.surfaces.length, 1);
        assert.equal(result.surfaces[0].surfaceId, 'surf1');
    });
});
