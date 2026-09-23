import { render, screen } from '@testing-library/react';
import { HighlightedSnippet } from './HighlightedSnippet';

/**
 * The snippet comes from Markdown note content and is not escaped by the
 * database, so the contract is: `<mark>` becomes an element, everything else
 * stays text.
 */
describe('HighlightedSnippet', () => {
  it('renders the matched term inside a mark element', () => {
    render(<HighlightedSnippet headline="the <mark>cell</mark> wall" />);

    const mark = screen.getByText('cell');
    expect(mark.tagName).toBe('MARK');
    expect(screen.getByText(/the/)).toBeInTheDocument();
  });

  it('shows markup from note content as text, not as elements', () => {
    const { container } = render(
      <HighlightedSnippet headline="<img src=x onerror=alert(1)> <mark>hit</mark>" />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelectorAll('mark')).toHaveLength(1);
  });

  it('renders nothing for an empty snippet', () => {
    const { container } = render(<HighlightedSnippet headline="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
