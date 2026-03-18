import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WhiteboardInputSchema, parseWhiteboardInput, safeParseInput } from './schemas';

describe('whiteboard tool contracts', () => {
    it('defaults open_whiteboard to a blank canvas', () => {
        assert.deepStrictEqual(parseWhiteboardInput({
            title: 'Blank whiteboard',
            context: 'Start from scratch.',
        }), {
            title: 'Blank whiteboard',
            context: 'Start from scratch.',
            blankCanvas: true,
        });
    });

    it('accepts importImages for image-first annotation flows', () => {
        assert.deepStrictEqual(parseWhiteboardInput({
            title: 'Annotate screenshot',
            context: 'Mark up the design issues.',
            importImages: [
                {
                    uri: 'file:///tmp/mockup.png',
                    label: 'Mockup',
                },
            ],
        }), {
            title: 'Annotate screenshot',
            context: 'Mark up the design issues.',
            blankCanvas: true,
            importImages: [
                {
                    uri: 'file:///tmp/mockup.png',
                    label: 'Mockup',
                },
            ],
        });
    });

    it('accepts seeded starter canvases while preserving the image-first contract', () => {
        assert.deepStrictEqual(parseWhiteboardInput({
            title: 'Seeded whiteboard',
            initialCanvases: [
                {
                    name: 'Canvas A',
                    seedElements: [
                        {
                            type: 'rectangle',
                            x: 20,
                            y: 30,
                            width: 200,
                            height: 100,
                        },
                        {
                            type: 'text',
                            x: 40,
                            y: 60,
                            text: 'Starter',
                        },
                    ],
                },
            ],
        }), {
            title: 'Seeded whiteboard',
            blankCanvas: true,
            initialCanvases: [
                {
                    name: 'Canvas A',
                    seedElements: [
                        {
                            type: 'rectangle',
                            x: 20,
                            y: 30,
                            width: 200,
                            height: 100,
                        },
                        {
                            type: 'text',
                            x: 40,
                            y: 60,
                            text: 'Starter',
                        },
                    ],
                },
            ],
        });
    });

    it('rejects starter canvases that include both fabricState and seedElements', () => {
        assert.deepStrictEqual(
            safeParseInput(WhiteboardInputSchema, {
                initialCanvases: [
                    {
                        name: 'Broken',
                        fabricState: JSON.stringify({ objects: [] }),
                        seedElements: [
                            {
                                type: 'text',
                                x: 10,
                                y: 10,
                                text: 'Broken',
                            },
                        ],
                    },
                ],
            }),
            {
                success: false,
                error: 'initialCanvases.0.seedElements: Canvas cannot include both fabricState and seedElements',
            },
        );
    });

    it('reports field-specific validation errors for invalid imported images', () => {
        assert.deepStrictEqual(
            safeParseInput(WhiteboardInputSchema, {
                title: 'Broken import',
                importImages: [
                    {
                        uri: '',
                        label: '',
                    },
                ],
            }),
            {
                success: false,
                error: 'importImages.0.uri: Import image uri cannot be empty; importImages.0.label: Import image label cannot be empty',
            },
        );
    });
});
