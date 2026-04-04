import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// =====================================================
// update_ui schema tests
// =====================================================

describe('update_ui schema', () => {
    it('accepts surfaceId + dataModel', async () => {
        const { UpdateUIInputSchema } = await import('./schemas');
        const result = UpdateUIInputSchema.safeParse({
            surfaceId: 'surf1',
            dataModel: { greeting: 'hello' },
        });
        assert.ok(result.success, 'Expected valid input to parse successfully');
        if (result.success) {
            assert.equal(result.data.surfaceId, 'surf1');
            assert.deepEqual(result.data.dataModel, { greeting: 'hello' });
        }
    });

    it('accepts surfaceId + title', async () => {
        const { UpdateUIInputSchema } = await import('./schemas');
        const result = UpdateUIInputSchema.safeParse({
            surfaceId: 'surf1',
            title: 'New Title',
        });
        assert.ok(result.success, 'Expected valid input with only title to parse successfully');
    });

    it('accepts surfaceId + title + dataModel', async () => {
        const { UpdateUIInputSchema } = await import('./schemas');
        const result = UpdateUIInputSchema.safeParse({
            surfaceId: 'surf1',
            title: 'Dashboard',
            dataModel: { count: 42 },
        });
        assert.ok(result.success, 'Expected all fields to parse successfully');
    });

    it('rejects missing surfaceId', async () => {
        const { UpdateUIInputSchema } = await import('./schemas');
        const result = UpdateUIInputSchema.safeParse({
            dataModel: { count: 1 },
        });
        assert.strictEqual(result.success, false);
    });

    it('rejects empty surfaceId', async () => {
        const { UpdateUIInputSchema } = await import('./schemas');
        const result = UpdateUIInputSchema.safeParse({
            surfaceId: '',
            dataModel: { count: 1 },
        });
        assert.strictEqual(result.success, false);
    });

    it('rejects when neither title nor dataModel is provided', async () => {
        const { UpdateUIInputSchema, safeParseInput } = await import('./schemas');
        const result = safeParseInput(UpdateUIInputSchema, { surfaceId: 'surf1' });
        assert.strictEqual(result.success, false, 'Should fail when nothing to update');
        if (!result.success) {
            assert.ok(result.error.includes('title') || result.error.includes('dataModel'),
                `Error message should mention missing fields, got: ${result.error}`);
        }
    });
});

// =====================================================
// updateUI function tests
// =====================================================

describe('updateUI function', () => {
    it('calls updateDataModel when dataModel is provided and surface exists', async () => {
        const { updateUI } = await import('./updateUI');

        let calledWith: { surfaceId: string; dataModel: Record<string, unknown> } | null = null;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            updateDataModel(surfaceId: string, dataModel: Record<string, unknown>) {
                calledWith = { surfaceId, dataModel };
                return { found: true };
            },
        };

        const result = await updateUI(
            { surfaceId: 'surf1', dataModel: { count: 5 } },
            { panel: mockPanel },
        );

        assert.deepEqual(calledWith, { surfaceId: 'surf1', dataModel: { count: 5 } });
        assert.equal(result.surfaceId, 'surf1');
        assert.equal(result.applied, true);
        assert.equal(result.notFound, undefined);
    });

    it('returns notFound: true when surface does not exist', async () => {
        const { updateUI } = await import('./updateUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: false }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                return { found: false };
            },
        };

        const result = await updateUI(
            { surfaceId: 'ghost', dataModel: { x: 1 } },
            { panel: mockPanel },
        );

        assert.equal(result.applied, false);
        assert.equal(result.notFound, true);
        assert.equal(result.surfaceId, 'ghost');
    });

    it('propagates renderErrors from panel.updateDataModel', async () => {
        const { updateUI } = await import('./updateUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'Unknown component type: Table' }],
                };
            },
        };

        const result = await updateUI(
            { surfaceId: 'surf1', dataModel: { items: [] } },
            { panel: mockPanel },
        );

        assert.equal(result.applied, true);
        assert.ok(Array.isArray(result.renderErrors) && result.renderErrors.length === 1);
        assert.equal(result.renderErrors![0].message, 'Unknown component type: Table');
    });

    it('applies title via updateTitle when only title provided and surface exists', async () => {
        const { updateUI } = await import('./updateUI');

        let updateTitleCalledWith: { surfaceId: string; title: string } | null = null;
        let updateDataModelCalled = false;
        const mockPanel = {
            updateTitle(surfaceId: string, title: string) {
                updateTitleCalledWith = { surfaceId, title };
                return { found: true };
            },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                updateDataModelCalled = true;
                return { found: true };
            },
        };

        const result = await updateUI(
            { surfaceId: 'surf1', title: 'New Title' },
            { panel: mockPanel },
        );

        assert.equal(updateDataModelCalled, false, 'updateDataModel should not be called for title-only');
        assert.deepEqual(updateTitleCalledWith, { surfaceId: 'surf1', title: 'New Title' });
        assert.equal(result.applied, true, 'applied should be true when title update succeeded');
        assert.equal(result.surfaceId, 'surf1');
    });

    it('returns notFound: true when only title provided and surface does not exist', async () => {
        const { updateUI } = await import('./updateUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: false }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                return { found: false };
            },
        };

        const result = await updateUI(
            { surfaceId: 'ghost', title: 'Missing' },
            { panel: mockPanel },
        );

        assert.equal(result.applied, false);
        assert.equal(result.notFound, true);
        assert.equal(result.surfaceId, 'ghost');
    });

    it('propagates renderErrors from panel.updateTitle when only title is updated', async () => {
        const { updateUI } = await import('./updateUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'Render failed during title update' }],
                };
            },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                return { found: true };
            },
        };

        const result = await updateUI(
            { surfaceId: 'surf1', title: 'Problematic Title' },
            { panel: mockPanel },
        );

        assert.equal(result.applied, true);
        assert.ok(Array.isArray(result.renderErrors) && result.renderErrors.length === 1);
        assert.equal(result.renderErrors![0].message, 'Render failed during title update');
    });

    it('merges renderErrors from updateTitle and updateDataModel when both are provided', async () => {
        const { updateUI } = await import('./updateUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'Title render error' }],
                };
            },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'DataModel render error' }],
                };
            },
        };

        const result = await updateUI(
            { surfaceId: 'surf1', title: 'Dashboard', dataModel: { items: [] } },
            { panel: mockPanel },
        );

        assert.equal(result.applied, true);
        assert.ok(Array.isArray(result.renderErrors) && result.renderErrors.length === 2,
            `Expected 2 merged renderErrors, got ${result.renderErrors?.length ?? 0}`);
        assert.ok(result.renderErrors!.some(e => e.message === 'Title render error'),
            'Expected title render error to be present');
        assert.ok(result.renderErrors!.some(e => e.message === 'DataModel render error'),
            'Expected dataModel render error to be present');
    });

    it('returns notFound: true immediately when updateTitle returns found: false in combined path', async () => {
        const { updateUI } = await import('./updateUI');

        let updateDataModelCalled = false;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: false }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                updateDataModelCalled = true;
                return { found: true };
            },
        };

        const result = await updateUI(
            { surfaceId: 'ghost', title: 'Missing', dataModel: { x: 1 } },
            { panel: mockPanel },
        );

        assert.equal(result.applied, false, 'applied should be false when title update fails');
        assert.equal(result.notFound, true, 'notFound should be true when title update fails');
        assert.equal(result.surfaceId, 'ghost');
        assert.equal(updateDataModelCalled, false, 'updateDataModel should NOT be called when title update reports not found');
    });

    it('applies both title and dataModel when both provided', async () => {
        const { updateUI } = await import('./updateUI');

        let updateTitleCalledWith: { surfaceId: string; title: string } | null = null;
        let updateDataModelCalled = false;
        const mockPanel = {
            updateTitle(surfaceId: string, title: string) {
                updateTitleCalledWith = { surfaceId, title };
                return { found: true };
            },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) {
                updateDataModelCalled = true;
                return { found: true };
            },
        };

        const result = await updateUI(
            { surfaceId: 'surf1', title: 'Dashboard', dataModel: { items: [1, 2] } },
            { panel: mockPanel },
        );

        assert.ok(updateTitleCalledWith !== null, 'updateTitle should be called');
        assert.equal(updateDataModelCalled, true);
        assert.equal(result.applied, true);
    });
});

// =====================================================
// updateUI cancellation tests
// =====================================================

describe('updateUI cancellation', () => {
    it('returns applied: false without calling panel when token is pre-cancelled (dataModel path)', async () => {
        const { updateUI } = await import('./updateUI');

        let panelCalled = false;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { panelCalled = true; return { found: true }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) { panelCalled = true; return { found: true }; },
        };

        const cancelledToken = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await updateUI(
            { surfaceId: 'surf1', dataModel: { count: 1 } },
            { panel: mockPanel },
            cancelledToken as any,
        );

        assert.equal(panelCalled, false, 'Panel should not be called when token is pre-cancelled');
        assert.equal(result.applied, false);
        assert.equal(result.surfaceId, 'surf1');
    });

    it('returns applied: false without calling panel when token is pre-cancelled (title-only path)', async () => {
        const { updateUI } = await import('./updateUI');

        let panelCalled = false;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { panelCalled = true; return { found: true }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) { panelCalled = true; return { found: true }; },
        };

        const cancelledToken = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await updateUI(
            { surfaceId: 'surf1', title: 'New Title' },
            { panel: mockPanel },
            cancelledToken as any,
        );

        assert.equal(panelCalled, false, 'Panel should not be called when token is pre-cancelled');
        assert.equal(result.applied, false);
        assert.equal(result.surfaceId, 'surf1');
    });

    it('proceeds normally when token is not cancelled', async () => {
        const { updateUI } = await import('./updateUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            updateDataModel(_surfaceId: string, _dataModel: Record<string, unknown>) { return { found: true }; },
        };

        const activeToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await updateUI(
            { surfaceId: 'surf1', dataModel: { count: 1 } },
            { panel: mockPanel },
            activeToken as any,
        );

        assert.equal(result.applied, true);
        assert.equal(result.surfaceId, 'surf1');
    });
});
