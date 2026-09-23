import { render, screen } from '@testing-library/react';
import { NoteContent } from './NoteContent';

describe('NoteContent', () => {
  it('renders Markdown structure as elements', () => {
    const { container } = render(
      <NoteContent markdown={'# Title\n\nSome **bold** text.\n\n- one\n- two'} />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Title' })
    ).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a link that opens safely', () => {
    render(<NoteContent markdown="[docs](https://example.com)" />);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('never turns raw HTML in the note into markup', () => {
    const { container } = render(
      <NoteContent markdown={'<script>alert(1)</script>\n\n<b>bold?</b>'} />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('drops an unsafe link target and keeps the source text', () => {
    const { container } = render(
      <NoteContent markdown="[tap](javascript:alert(1))" />
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('[tap](javascript:alert(1))');
  });
});
