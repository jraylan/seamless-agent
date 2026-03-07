import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { WhiteboardInputSchema, parseWhiteboardInput, safeParseInput } from './schemas';

describe('whiteboard tool contracts', () => {
    it('parses standalone whiteboard inputs with seeded canvases', () => {
        assert.deepStrictEqual(parseWhiteboardInput({
            title: 'Architecture whiteboard',
            context: 'Map service boundaries and data flow.',
            initialCanvases: [
                {
                    name: 'Canvas 1',
                    fabricState: '{"version":"6.9.1","objects":[]}'
                },
                {
                    name: 'Canvas 2',
                    fabricState: '{"version":"6.9.1","objects":[{"type":"rect"}]}'
                }
            ]
        }), {
            title: 'Architecture whiteboard',
            context: 'Map service boundaries and data flow.',
            initialCanvases: [
                {
                    name: 'Canvas 1',
                    fabricState: '{"version":"6.9.1","objects":[]}'
                },
                {
                    name: 'Canvas 2',
                    fabricState: '{"version":"6.9.1","objects":[{"type":"rect"}]}'
                }
            ]
        });
    });

    it('rejects implicit blank whiteboards when neither initialCanvases nor blankCanvas is supplied', () => {
        assert.deepStrictEqual(
            safeParseInput(WhiteboardInputSchema, {
                title: 'Blank whiteboard',
                context: 'Start from scratch.'
            }),
            {
                success: false,
                error: 'blankCanvas: Provide initialCanvases for starter content, or set blankCanvas to true to intentionally open an empty whiteboard'
            }
        );
    });

    it('allows opening an explicit blank whiteboard when blankCanvas is true', () => {
        assert.deepStrictEqual(parseWhiteboardInput({
            title: 'Blank whiteboard',
            context: 'Start from scratch.',
            blankCanvas: true,
        }), {
            title: 'Blank whiteboard',
            context: 'Start from scratch.',
            blankCanvas: true,
        });
    });

    it('parses agent-friendly seeded drawings for starter canvases', () => {
        assert.deepStrictEqual(parseWhiteboardInput({
            title: 'Demo whiteboard',
            initialCanvases: [
                {
                    name: 'Demo canvas',
                    seedElements: [
                        {
                            type: 'rectangle',
                            id: 'rect_1',
                            x: 40,
                            y: 50,
                            width: 220,
                            height: 120,
                            zIndex: 2,
                            rotation: 30,
                            strokeColor: '#2563eb',
                            fillColor: 'rgba(37,99,235,0.18)',
                        },
                        {
                            type: 'circle',
                            x: 360,
                            y: 140,
                            radius: 60,
                            strokeColor: '#dc2626',
                            fillColor: 'rgba(220,38,38,0.18)',
                        },
                        {
                            type: 'triangle',
                            x: 520,
                            y: 60,
                            width: 180,
                            height: 150,
                            strokeColor: '#16a34a',
                            fillColor: 'rgba(22,163,74,0.18)',
                        },
                        {
                            type: 'line',
                            start: { x: 780, y: 80 },
                            end: { x: 1040, y: 220 },
                            strokeColor: '#f97316',
                            strokeWidth: 6,
                        },
                        {
                            type: 'text',
                            x: 60,
                            y: 260,
                            text: 'Whiteboard Demo',
                            color: '#111827',
                            fontSize: 32,
                            fontWeight: 700,
                            fontStyle: 'italic',
                            textAlign: 'center',
                            fontFamily: 'sans-serif',
                        },
                    ],
                },
            ],
        }), {
            title: 'Demo whiteboard',
            initialCanvases: [
                {
                    name: 'Demo canvas',
                    seedElements: [
                        {
                            type: 'rectangle',
                            id: 'rect_1',
                            x: 40,
                            y: 50,
                            width: 220,
                            height: 120,
                            zIndex: 2,
                            rotation: 30,
                            strokeColor: '#2563eb',
                            fillColor: 'rgba(37,99,235,0.18)',
                        },
                        {
                            type: 'circle',
                            x: 360,
                            y: 140,
                            radius: 60,
                            strokeColor: '#dc2626',
                            fillColor: 'rgba(220,38,38,0.18)',
                        },
                        {
                            type: 'triangle',
                            x: 520,
                            y: 60,
                            width: 180,
                            height: 150,
                            strokeColor: '#16a34a',
                            fillColor: 'rgba(22,163,74,0.18)',
                        },
                        {
                            type: 'line',
                            start: { x: 780, y: 80 },
                            end: { x: 1040, y: 220 },
                            strokeColor: '#f97316',
                            strokeWidth: 6,
                        },
                        {
                            type: 'text',
                            x: 60,
                            y: 260,
                            text: 'Whiteboard Demo',
                            color: '#111827',
                            fontSize: 32,
                            fontWeight: 700,
                            fontStyle: 'italic',
                            textAlign: 'center',
                            fontFamily: 'sans-serif',
                        },
                    ],
                },
            ],
        });
    });

    it('reports field-specific validation errors for invalid seeded canvases', () => {
        assert.deepStrictEqual(
            safeParseInput(WhiteboardInputSchema, {
                title: 'Broken seed',
                initialCanvases: [
                    {
                        name: '',
                        fabricState: ''
                    }
                ]
            }),
            {
                success: false,
                error: 'initialCanvases.0.name: Canvas name cannot be empty; initialCanvases.0.fabricState: Canvas fabricState cannot be empty'
            }
        );
    });

    it('rejects seeded coordinates and style values outside the supported whiteboard range', () => {
        const result = safeParseInput(WhiteboardInputSchema, {
            title: 'Out of bounds seed',
            initialCanvases: [
                {
                    name: 'Canvas 1',
                    seedElements: [
                        {
                            type: 'rectangle',
                            x: -10,
                            y: 2000,
                            width: 220,
                            height: 120,
                            strokeWidth: 200,
                        },
                    ],
                },
            ],
        });

        assert.equal(result.success, false);
        if (result.success) {
            return;
        }

        assert.match(result.error, /initialCanvases\.0\.seedElements\.0\.x: Seed coordinate x must be within the whiteboard width \(0-1600\)/);
        assert.match(result.error, /initialCanvases\.0\.seedElements\.0\.y: Seed coordinate y must be within the whiteboard height \(0-900\)/);
        assert.match(result.error, /initialCanvases\.0\.seedElements\.0\.strokeWidth: Seed element strokeWidth must be between 1 and 64/);
    });

    it('rejects invalid zIndex, rotation, and text style seed metadata', () => {
        const invalidMetadata = safeParseInput(WhiteboardInputSchema, {
            title: 'Invalid metadata seed',
            initialCanvases: [
                {
                    name: 'Canvas 1',
                    seedElements: [
                        {
                            type: 'rectangle',
                            x: 40,
                            y: 50,
                            width: 120,
                            height: 80,
                            zIndex: -1,
                            rotation: 500,
                        },
                        {
                            type: 'text',
                            x: 80,
                            y: 140,
                            text: 'Label',
                            fontWeight: 2000,
                            fontStyle: 'slanted',
                            textAlign: 'edge',
                        },
                    ],
                },
            ],
        });

        assert.equal(invalidMetadata.success, false);
        if (invalidMetadata.success) {
            return;
        }

        assert.match(invalidMetadata.error, /initialCanvases\.0\.seedElements\.0\.zIndex: Seed element zIndex must be between 0 and 10000/);
        assert.match(invalidMetadata.error, /initialCanvases\.0\.seedElements\.0\.rotation: Seed element rotation must be between -360 and 360 degrees/);
        assert.match(invalidMetadata.error, /initialCanvases\.0\.seedElements\.1\.fontWeight: Seed text fontWeight must be between 100 and 900/);
        assert.match(invalidMetadata.error, /initialCanvases\.0\.seedElements\.1\.fontStyle: Invalid option: expected one of "normal"\|"italic"\|"oblique"/);
        assert.match(invalidMetadata.error, /initialCanvases\.0\.seedElements\.1\.textAlign: Invalid option: expected one of "left"\|"center"\|"right"\|"justify"/);
    });

    it('rejects invalid raw fabricState seed content instead of accepting a blank canvas fallback', () => {
        assert.deepStrictEqual(
            safeParseInput(WhiteboardInputSchema, {
                title: 'Broken seed',
                initialCanvases: [
                    {
                        name: 'Canvas 1',
                        fabricState: 'not valid json'
                    }
                ]
            }),
            {
                success: false,
                error: 'initialCanvases.0.fabricState: Canvas fabricState must be valid JSON with an objects array'
            }
        );
    });

    it('rejects JSON-valid but Fabric-invalid raw fabricState input', () => {
        assert.deepStrictEqual(
            safeParseInput(WhiteboardInputSchema, {
                title: 'Broken fabric object type',
                initialCanvases: [
                    {
                        name: 'Canvas 1',
                        fabricState: '{"version":"6.9.1","objects":[{"type":"rectangle","left":40,"top":50,"width":220,"height":120}]}'
                    }
                ]
            }),
            {
                success: false,
                error: 'initialCanvases.0.fabricState: Canvas fabricState contains unsupported Fabric object type "rectangle"'
            }
        );
    });

    it('documents the agent-friendly seedElements path in tool metadata', () => {
        const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
            contributes?: {
                languageModelTools?: Array<{
                    name?: string;
                    modelDescription?: string;
                    inputSchema?: {
                        properties?: {
                            blankCanvas?: {
                                description?: string;
                            };
                            initialCanvases?: {
                                items?: {
                                    properties?: Record<string, { description?: string }>;
                                };
                            };
                        };
                    };
                }>;
            };
        };
        const openWhiteboardTool = packageJson.contributes?.languageModelTools?.find((tool) => tool.name === 'open_whiteboard');

        assert.match(openWhiteboardTool?.modelDescription ?? '', /seedElements/);
        assert.match(openWhiteboardTool?.modelDescription ?? '', /blankCanvas/);
        assert.match(openWhiteboardTool?.modelDescription ?? '', /coordinate/i);
        assert.match(openWhiteboardTool?.modelDescription ?? '', /scene summary|sceneSummary/i);
        assert.match(
            openWhiteboardTool?.inputSchema?.properties?.blankCanvas?.description ?? '',
            /intentionally open an empty whiteboard/i,
        );
        assert.match(
            openWhiteboardTool?.inputSchema?.properties?.initialCanvases?.items?.properties?.seedElements?.description ?? '',
            /simple starter sketches|coordinate/i,
        );
        const seedVariants = (openWhiteboardTool as any)?.inputSchema?.properties?.initialCanvases?.items?.properties?.seedElements?.items?.oneOf as
            | Array<{ properties?: Record<string, unknown> }>
            | undefined;
        const rectangleSeed = seedVariants?.find((variant) => (variant.properties?.type as { enum?: string[] } | undefined)?.enum?.[0] === 'rectangle');
        const textSeed = seedVariants?.find((variant) => (variant.properties?.type as { enum?: string[] } | undefined)?.enum?.[0] === 'text');

        assert.ok(rectangleSeed?.properties?.zIndex, 'Expected rectangle seed metadata to include zIndex');
        assert.ok(rectangleSeed?.properties?.rotation, 'Expected rectangle seed metadata to include rotation');
        assert.ok(textSeed?.properties?.fontWeight, 'Expected text seed metadata to include fontWeight');
        assert.ok(textSeed?.properties?.fontStyle, 'Expected text seed metadata to include fontStyle');
        assert.ok(textSeed?.properties?.textAlign, 'Expected text seed metadata to include textAlign');
    });
});
