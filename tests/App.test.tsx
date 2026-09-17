import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renders main landmark', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
