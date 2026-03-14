import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// =====================================================
// append_ui schema tests
// =====================================================

describe('append_ui schema', () => {
    it('accepts surfaceId + components', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            surfaceId: 'surf1',
            components: [{ id: 'c1', component: { type: 'Text', props: { content: 'Hello' } } }],
        });
        assert.ok(result.success, 'Expected valid input to parse successfully');
        if (result.success) {
            assert.equal(result.data.surfaceId, 'surf1');
            assert.equal(result.data.components.length, 1);
        }
    });

    it('accepts surfaceId + components + title', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            surfaceId: 'surf1',
            title: 'Extended Surface',
            components: [{ id: 'c1', component: { type: 'Text', props: { content: 'Hello' } } }],
        });
        assert.ok(result.success, 'Expected all fields to parse successfully');
    });

    it('rejects missing surfaceId', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            components: [{ id: 'c1', component: { type: 'Text' } }],
        });
        assert.strictEqual(result.success, false);
    });

    it('rejects empty surfaceId', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            surfaceId: '',
            components: [{ id: 'c1', component: { type: 'Text' } }],
        });
        assert.strictEqual(result.success, false);
    });

    it('rejects empty components array', async () => {
        const { AppendUIInputSchema, safeParseInput } = await import('./schemas');
        const result = safeParseInput(AppendUIInputSchema, {
            surfaceId: 'surf1',
            components: [],
        });
        assert.strictEqual(result.success, false, 'Should reject empty components');
        if (!result.success) {
            assert.ok(result.error.includes('components'), `Expected error to mention components, got: ${result.error}`);
        }
    });

    it('rejects missing components', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            surfaceId: 'surf1',
        });
        assert.strictEqual(result.success, false);
    });

    it('rejects component with missing id', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            surfaceId: 'surf1',
            components: [{ component: { type: 'Text' } }],
        });
        assert.strictEqual(result.success, false);
    });

    it('preserves parentId in components', async () => {
        const { AppendUIInputSchema } = await import('./schemas');
        const result = AppendUIInputSchema.safeParse({
            surfaceId: 'surf1',
            components: [
                { id: 'row1', component: { type: 'Row' } },
                { id: 'text1', parentId: 'row1', component: { type: 'Text', props: { content: 'Child' } } },
            ],
        });
        assert.ok(result.success);
        if (result.success) {
            assert.equal(result.data.components[1]?.parentId, 'row1');
        }
    });
});

// =====================================================
// appendUI function tests
// =====================================================

describe('appendUI function', () => {
    it('calls appendComponents when surface exists', async () => {
        const { appendUI } = await import('./appendUI');

        const components = [{ id: 'c1', component: { type: 'Text', props: { content: 'Extra' } } }];
        let calledWith: { surfaceId: string; components: unknown[] } | null = null;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            appendComponents(surfaceId: string, comps: unknown[]) {
                calledWith = { surfaceId, components: comps };
                return { found: true };
            },
        };

        const result = await appendUI(
            { surfaceId: 'surf1', components },
            { panel: mockPanel },
        );

        assert.ok(calledWith !== null);
        const recorded = calledWith as { surfaceId: string; components: unknown[] };
        assert.equal(recorded.surfaceId, 'surf1');
        assert.equal(recorded.components.length, 1);
        assert.equal(result.applied, true);
        assert.equal(result.surfaceId, 'surf1');
        assert.equal(result.notFound, undefined);
    });

    it('returns notFound: true when surface does not exist', async () => {
        const { appendUI } = await import('./appendUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: false }; },
            appendComponents(_surfaceId: string, _comps: unknown[]) {
                return { found: false };
            },
        };

        const result = await appendUI(
            { surfaceId: 'ghost', components: [{ id: 'c1', component: { type: 'Text' } }] },
            { panel: mockPanel },
        );

        assert.equal(result.applied, false);
        assert.equal(result.notFound, true);
        assert.equal(result.surfaceId, 'ghost');
    });

    it('propagates renderErrors from panel.appendComponents', async () => {
        const { appendUI } = await import('./appendUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            appendComponents(_surfaceId: string, _comps: unknown[]) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'Unknown component type: Table' }],
                };
            },
        };

        const result = await appendUI(
            { surfaceId: 'surf1', components: [{ id: 'c1', component: { type: 'Table' } }] },
            { panel: mockPanel },
        );

        assert.equal(result.applied, true);
        assert.ok(Array.isArray(result.renderErrors) && result.renderErrors.length === 1);
        assert.equal(result.renderErrors![0].message, 'Unknown component type: Table');
    });

    it('passes raw component objects to panel.appendComponents', async () => {
        const { appendUI } = await import('./appendUI');

        const components = [
            { id: 'c1', component: { type: 'Button', props: { label: 'OK', action: 'ok' } }, parentId: 'row1' },
        ];
        let received: unknown[] = [];
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            appendComponents(_surfaceId: string, comps: unknown[]) {
                received = comps;
                return { found: true };
            },
        };

        await appendUI({ surfaceId: 'surf1', components }, { panel: mockPanel });

        assert.equal(received.length, 1);
        assert.deepEqual(received[0], components[0]);
    });

    it('calls updateTitle when title is provided', async () => {
        const { appendUI } = await import('./appendUI');

        const components = [{ id: 'c1', component: { type: 'Text' } }];
        let updateTitleCalledWith: { surfaceId: string; title: string } | null = null;
        const mockPanel = {
            updateTitle(surfaceId: string, title: string) {
                updateTitleCalledWith = { surfaceId, title };
                return { found: true };
            },
            appendComponents(_surfaceId: string, _comps: unknown[]) {
                return { found: true };
            },
        };

        const result = await appendUI(
            { surfaceId: 'surf1', title: 'Updated Title', components },
            { panel: mockPanel },
        );

        assert.deepEqual(updateTitleCalledWith, { surfaceId: 'surf1', title: 'Updated Title' });
        assert.equal(result.applied, true);
    });

    it('returns notFound: true immediately when updateTitle returns found: false in combined path', async () => {
        const { appendUI } = await import('./appendUI');

        let appendComponentsCalled = false;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: false }; },
            appendComponents(_surfaceId: string, _comps: unknown[]) {
                appendComponentsCalled = true;
                return { found: true };
            },
        };

        const result = await appendUI(
            { surfaceId: 'ghost', title: 'Missing', components: [{ id: 'c1', component: { type: 'Text' } }] },
            { panel: mockPanel },
        );

        assert.equal(result.applied, false, 'applied should be false when title update fails');
        assert.equal(result.notFound, true, 'notFound should be true when title update fails');
        assert.equal(result.surfaceId, 'ghost');
        assert.equal(appendComponentsCalled, false, 'appendComponents should NOT be called when title update reports not found');
    });

    it('merges renderErrors from updateTitle and appendComponents when title is provided', async () => {
        const { appendUI } = await import('./appendUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'Title render error' }],
                };
            },
            appendComponents(_surfaceId: string, _comps: unknown[]) {
                return {
                    found: true,
                    renderErrors: [{ source: 'renderer' as const, message: 'Append render error' }],
                };
            },
        };

        const result = await appendUI(
            { surfaceId: 'surf1', title: 'Updated', components: [{ id: 'c1', component: { type: 'Text' } }] },
            { panel: mockPanel },
        );

        assert.equal(result.applied, true);
        assert.ok(Array.isArray(result.renderErrors) && result.renderErrors.length === 2,
            `Expected 2 merged renderErrors, got ${result.renderErrors?.length ?? 0}`);
        assert.ok(result.renderErrors!.some(e => e.message === 'Title render error'),
            'Expected title render error to be present');
        assert.ok(result.renderErrors!.some(e => e.message === 'Append render error'),
            'Expected append render error to be present');
    });

    it('does not call updateTitle when title is not provided', async () => {
        const { appendUI } = await import('./appendUI');

        const components = [{ id: 'c1', component: { type: 'Text' } }];
        let updateTitleCalled = false;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) {
                updateTitleCalled = true;
                return { found: true };
            },
            appendComponents(_surfaceId: string, _comps: unknown[]) {
                return { found: true };
            },
        };

        await appendUI({ surfaceId: 'surf1', components }, { panel: mockPanel });

        assert.equal(updateTitleCalled, false, 'updateTitle should not be called when title is absent');
    });
});

// =====================================================
// appendUI cancellation tests
// =====================================================

describe('appendUI cancellation', () => {
    it('returns applied: false without calling panel when token is pre-cancelled', async () => {
        const { appendUI } = await import('./appendUI');

        let panelCalled = false;
        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { panelCalled = true; return { found: true }; },
            appendComponents(_surfaceId: string, _comps: unknown[]) { panelCalled = true; return { found: true }; },
        };

        const cancelledToken = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await appendUI(
            { surfaceId: 'surf1', components: [{ id: 'c1', component: { type: 'Text' } }] },
            { panel: mockPanel },
            cancelledToken as any,
        );

        assert.equal(panelCalled, false, 'Panel should not be called when token is pre-cancelled');
        assert.equal(result.applied, false);
        assert.equal(result.surfaceId, 'surf1');
    });

    it('proceeds normally when token is not cancelled', async () => {
        const { appendUI } = await import('./appendUI');

        const mockPanel = {
            updateTitle(_surfaceId: string, _title: string) { return { found: true }; },
            appendComponents(_surfaceId: string, _comps: unknown[]) { return { found: true }; },
        };

        const activeToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };

        const result = await appendUI(
            { surfaceId: 'surf1', components: [{ id: 'c1', component: { type: 'Text' } }] },
            { panel: mockPanel },
            activeToken as any,
        );

        assert.equal(result.applied, true);
        assert.equal(result.surfaceId, 'surf1');
    });
});
