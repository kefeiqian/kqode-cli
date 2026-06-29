import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { BackgroundBlock, shouldRenderBackgroundBlock } from '@components/BackgroundBlock.js';

describe('BackgroundBlock', () => {
  it('renders half-line padding around children when explicitly enabled', () => {
    const { lastFrame } = render(
      <BackgroundBlock backgroundColor="#141b22" mode="enabled" width={4}>
        <Text>hi</Text>
      </BackgroundBlock>
    );

    expect(lastFrame() ?? '').toBe('▄▄▄▄\nhi\n▀▀▀▀');
  });

  it('renders only children when disabled', () => {
    const { lastFrame } = render(
      <BackgroundBlock backgroundColor="#141b22" mode="disabled" width={4}>
        <Text>hi</Text>
      </BackgroundBlock>
    );

    expect(lastFrame() ?? '').toBe('hi');
  });

  it('disables background rendering for no-color and screen-reader sessions', () => {
    expect(
      shouldRenderBackgroundBlock({
        colorDepth: 24,
        isNoColor: true,
        isScreenReaderEnabled: false,
        mode: 'enabled'
      })
    ).toBe(false);
    expect(
      shouldRenderBackgroundBlock({
        colorDepth: 24,
        isNoColor: false,
        isScreenReaderEnabled: true,
        mode: 'enabled'
      })
    ).toBe(false);
  });

  it('requires truecolor support in auto mode', () => {
    expect(
      shouldRenderBackgroundBlock({
        colorDepth: 8,
        isNoColor: false,
        isScreenReaderEnabled: false,
        mode: 'auto'
      })
    ).toBe(false);
    expect(
      shouldRenderBackgroundBlock({
        colorDepth: 24,
        isNoColor: false,
        isScreenReaderEnabled: false,
        mode: 'auto'
      })
    ).toBe(true);
  });
});
