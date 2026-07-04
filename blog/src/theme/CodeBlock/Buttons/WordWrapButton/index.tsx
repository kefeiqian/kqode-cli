import type {ReactNode} from 'react';

// Code blocks soft-wrap by default (see src/css/custom.css), so the word-wrap
// toggle would be redundant. Rendering nothing keeps a single, consistent
// reading mode and prevents readers from toggling wrapping off.
export default function WordWrapButton(): ReactNode {
  return null;
}
